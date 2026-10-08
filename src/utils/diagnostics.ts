import { AppState, DiagnosticIssue, ScheduleItem, Subject, Teacher, Room, SchoolClass } from '../types/schedule';
import { DAYS_OF_WEEK } from './constants';
import { repairScheduleLNS } from './autoFixEngine';

export * from './autoFixEngine';

export function runDiagnostics(state: AppState): DiagnosticIssue[] {
  const { classes, subjects, teachers, rooms, curriculum, parallelLimits, schedule, settings, constraints = [] } = state;
  const daysCount = settings.daysPerWeek;
  const issues: DiagnosticIssue[] = [];

  const subjectMap = new Map<string, Subject>(subjects.map((s) => [s.id, s]));
  const classMap = new Map<string, SchoolClass>(classes.map((c) => [c.id, c]));
  const teacherMap = new Map<string, Teacher>(teachers.map((t) => [t.id, t]));
  const roomMap = new Map<string, Room>(rooms.map((r) => [r.id, r]));

  if (schedule.length === 0) {
    return [
      {
        id: 'no_schedule',
        type: 'missing_hours',
        severity: 'info',
        title: 'Расписание ещё не сгенерировано',
        description: 'Нажмите «Сгенерировать расписание», чтобы автоматически составить сетку уроков.',
        canAutoFix: false,
      },
    ];
  }

  // 1. Check for Student Gaps (Окна у учеников)
  classes.forEach((cls) => {
    for (let day = 0; day < daysCount; day++) {
      const dayLessons = schedule
        .filter((s) => s.classId === cls.id && s.dayOfWeek === day)
        .sort((a, b) => a.lessonIndex - b.lessonIndex);

      if (dayLessons.length === 0) continue;

      const uniqueSlots = Array.from(new Set(dayLessons.map((l) => l.lessonIndex))).sort((a, b) => a - b);
      if (uniqueSlots.length <= 1) {
        if (uniqueSlots.length === 1 && uniqueSlots[0] > 0) {
          issues.push({
            id: `gap_${cls.id}_${day}`,
            type: 'student_gap',
            severity: 'error',
            title: `Поздний старт уроков ${cls.name}`,
            description: `В день ${day + 1} (${DAYS_OF_WEEK[day]?.name || ''}) у класса ${cls.name} единственный урок стоит ${uniqueSlots[0] + 1}-м слотом вместо 1-го.`,
            classId: cls.id,
            dayOfWeek: day,
            canAutoFix: true,
            fixDescription: 'Сдвинуть урок на 1-й слот',
          });
        }
        continue;
      }

      const minSlot = uniqueSlots[0];
      const maxSlot = uniqueSlots[uniqueSlots.length - 1];

      const hasGaps = maxSlot - minSlot + 1 !== uniqueSlots.length;
      const startsLate = minSlot > 0;

      if (hasGaps || startsLate) {
        issues.push({
          id: `gap_${cls.id}_${day}`,
          type: 'student_gap',
          severity: 'error',
          title: `Окно в расписании ${cls.name}`,
          description: `В день ${day + 1} (${DAYS_OF_WEEK[day]?.name || ''}) у класса ${cls.name} обнаружены разрывы или поздний старт между уроками (заняты слоты: ${uniqueSlots.map((i) => i + 1).join(', ')}).`,
          classId: cls.id,
          dayOfWeek: day,
          canAutoFix: true,
          fixDescription: 'Стянуть уроки вверх (устранить окно)',
        });
      }
    }
  });

  // 2. Check Teacher Collisions (Накладки учителей внутри одной смены)
  const teacherSlots = new Map<string, ScheduleItem[]>();
  schedule.forEach((item) => {
    const classShift = classMap.get(item.classId)?.shift || 1;
    const key = `${item.teacherId}_${item.dayOfWeek}_${classShift}_${item.lessonIndex}`;
    if (!teacherSlots.has(key)) teacherSlots.set(key, []);
    teacherSlots.get(key)!.push(item);
  });

  teacherSlots.forEach((items, key) => {
    if (items.length > 1) {
      const teacher = teacherMap.get(items[0].teacherId);
      const teacherName = teacher?.shortName || 'Учитель';
      const classNames = items.map((i) => classMap.get(i.classId)?.name || i.classId).join(' и ');
      const classShift = classMap.get(items[0].classId)?.shift || 1;
      issues.push({
        id: `tcol_${key}`,
        type: 'teacher_collision',
        severity: 'error',
        title: `Накладка у учителя: ${teacherName}`,
        description: `${teacherName} одновременно назначен в классы [${classNames}] (${classShift}-я смена) в день ${items[0].dayOfWeek + 1} (${DAYS_OF_WEEK[items[0].dayOfWeek]?.name || ''}), урок №${items[0].lessonIndex + 1}.`,
        teacherId: items[0].teacherId,
        dayOfWeek: items[0].dayOfWeek,
        lessonIndex: items[0].lessonIndex,
        itemIds: items.map((i) => i.id),
        canAutoFix: true,
        fixDescription: 'Перенести конфликтующий урок в свободный слот',
      });
    }
  });

  // 3. Check Room Collisions and Capacity
  const roomSlots = new Map<string, ScheduleItem[]>();
  schedule.forEach((item) => {
    const classShift = classMap.get(item.classId)?.shift || 1;
    const key = `${item.roomId}_${item.dayOfWeek}_${classShift}_${item.lessonIndex}`;
    if (!roomSlots.has(key)) roomSlots.set(key, []);
    roomSlots.get(key)!.push(item);
  });

  roomSlots.forEach((items, key) => {
    const room = roomMap.get(items[0].roomId);
    const capacity = room?.capacity || 1;
    if (items.length > capacity) {
      const roomName = room?.name || 'Кабинет';
      const classNames = items.map((i) => classMap.get(i.classId)?.name || i.classId).join(', ');
      const classShift = classMap.get(items[0].classId)?.shift || 1;
      issues.push({
        id: `rcol_${key}`,
        type: 'room_collision',
        severity: 'error',
        title: `Переполнение кабинета: ${roomName}`,
        description: `В ${roomName} назначено ${items.length} уроков при лимите ${capacity} (${classNames}, ${classShift}-я смена), день ${items[0].dayOfWeek + 1}, урок №${items[0].lessonIndex + 1}.`,
        roomId: items[0].roomId,
        dayOfWeek: items[0].dayOfWeek,
        lessonIndex: items[0].lessonIndex,
        itemIds: items.map((i) => i.id),
        canAutoFix: true,
        fixDescription: 'Переназначить свободный кабинет',
      });
    }
  });

  // 4. Check Profile Room Mismatches
  schedule.forEach((item) => {
    const subject = subjectMap.get(item.subjectId);
    const room = roomMap.get(item.roomId);
    if (subject && room && subject.requiredRoomType !== 'regular') {
      if (room.type !== subject.requiredRoomType) {
        const cls = classMap.get(item.classId);
        issues.push({
          id: `rmis_${item.id}`,
          type: 'room_type_mismatch',
          severity: 'error',
          title: `Непрофильный кабинет: ${subject.name}`,
          description: `Уроку "${subject.name}" (${cls?.name}) требуется кабинет типа "${subject.requiredRoomType}", но назначен обычный "${room.name}".`,
          classId: item.classId,
          roomId: item.roomId,
          dayOfWeek: item.dayOfWeek,
          lessonIndex: item.lessonIndex,
          itemIds: [item.id],
          canAutoFix: true,
          fixDescription: 'Назначить профильный кабинет',
        });
      }
    }
  });

  // 5. Check Daily Parallel Limits
  classes.forEach((cls) => {
    const limit = parallelLimits[cls.grade] || 6;
    for (let day = 0; day < daysCount; day++) {
      const distinctSlots = new Set(
        schedule.filter((s) => s.classId === cls.id && s.dayOfWeek === day).map((s) => s.lessonIndex)
      ).size;
      if (distinctSlots > limit) {
        issues.push({
          id: `lim_${cls.id}_${day}`,
          type: 'daily_limit_exceeded',
          severity: 'warning',
          title: `Превышен дневной лимит уроков (${cls.name})`,
          description: `У класса ${cls.name} в ${DAYS_OF_WEEK[day]?.name || `день ${day + 1}`} назначено ${distinctSlots} уроков при максимальном лимите ${limit}.`,
          classId: cls.id,
          dayOfWeek: day,
          canAutoFix: true,
          fixDescription: 'Перенести избыточный урок на менее загруженный день',
        });
      }
    }
  });

  // 6. Check Teacher Windows (Окна у учителей)
  teachers.forEach((tch) => {
    for (let day = 0; day < daysCount; day++) {
      const tchLessons = schedule
        .filter((s) => s.teacherId === tch.id && s.dayOfWeek === day)
        .sort((a, b) => a.lessonIndex - b.lessonIndex);

      if (tchLessons.length <= 1) continue;
      const uniqueSlots = Array.from(new Set(tchLessons.map((s) => s.lessonIndex))).sort((a, b) => a - b);
      if (uniqueSlots.length <= 1) continue;

      const minSlot = uniqueSlots[0];
      const maxSlot = uniqueSlots[uniqueSlots.length - 1];
      const windowCount = maxSlot - minSlot + 1 - uniqueSlots.length;

      if (windowCount > 0) {
        issues.push({
          id: `twin_${tch.id}_${day}`,
          type: 'teacher_gap',
          severity: 'warning',
          title: `Окно у учителя: ${tch.shortName}`,
          description: `У преподавателя ${tch.shortName} в ${DAYS_OF_WEEK[day]?.name || `день ${day + 1}`} есть окно (${windowCount} ч.) между уроками.`,
          teacherId: tch.id,
          dayOfWeek: day,
          canAutoFix: true,
          fixDescription: 'Подтянуть уроки учителя (устранить окно)',
        });
      }
    }
  });

  // 7. Check Curriculum Hours completeness
  curriculum.forEach((curr) => {
    const classSubLessons = schedule.filter(
      (s) => s.classId === curr.classId && s.subjectId === curr.subjectId
    );
    const scheduledHours = curr.dividedIntoGroups
      ? new Set(classSubLessons.map((s) => `${s.dayOfWeek}_${s.lessonIndex}`)).size
      : classSubLessons.length;

    if (scheduledHours < curr.hoursPerWeek) {
      const cls = classMap.get(curr.classId);
      const sub = subjectMap.get(curr.subjectId);
      const diff = curr.hoursPerWeek - scheduledHours;
      issues.push({
        id: `miss_${curr.id}`,
        type: 'missing_hours',
        severity: 'warning',
        title: `Не хватает часов: ${sub?.name || ''} (${cls?.name || ''})`,
        description: `По плану требуется ${curr.hoursPerWeek} ч/нед, но в расписании только ${scheduledHours} ч. (дефицит: ${diff} ч.).`,
        classId: curr.classId,
        canAutoFix: true,
        fixDescription: 'Добавить недостающие часы в окна или свободные слоты',
      });
    }
  });

  // 8. Check User-Defined Constraints & Rules
  const activeConstraints = constraints.filter((c) => c.enabled);
  activeConstraints.forEach((c) => {
    const subject = subjectMap.get(c.subjectId);
    if (!subject) return;

    const targetClasses = (!c.classId || c.classId === 'all')
      ? classes
      : classes.filter((cls) => cls.id === c.classId);

    targetClasses.forEach((cls) => {
      const subjectLessons = schedule.filter(
        (s) => s.classId === cls.id && s.subjectId === c.subjectId
      );

      subjectLessons.forEach((l) => {
        let violated = false;
        let reason = '';
        let fixDesc = 'Привести в соответствие с правилом';

        const dayName = DAYS_OF_WEEK[l.dayOfWeek]?.name || `День ${l.dayOfWeek + 1}`;
        const targetDayName = c.dayOfWeek !== undefined ? (DAYS_OF_WEEK[c.dayOfWeek]?.name || `День ${c.dayOfWeek + 1}`) : '';

        if (c.conditionType === 'always_first' && l.lessonIndex !== 0) {
          violated = true;
          reason = `В классе ${cls.name} урок стоит ${l.lessonIndex + 1}-м в ${dayName}, а должен быть всегда 1-м.`;
          fixDesc = 'Поставить 1-м уроком дня';
        } else if (c.conditionType === 'always_last') {
          const dayLessons = schedule.filter((s) => s.classId === cls.id && s.dayOfWeek === l.dayOfWeek);
          const maxSlot = Math.max(...dayLessons.map((s) => s.lessonIndex));
          if (l.lessonIndex !== maxSlot) {
            violated = true;
            reason = `В классе ${cls.name} урок стоит ${l.lessonIndex + 1}-м в ${dayName}, а должен быть последним (${maxSlot + 1}-м).`;
            fixDesc = 'Поставить последним уроком дня';
          }
        } else if (c.conditionType === 'only_on_day' && c.dayOfWeek !== undefined && l.dayOfWeek !== c.dayOfWeek) {
          violated = true;
          reason = `В классе ${cls.name} урок стоит в ${dayName}, а по правилу разрешён только в ${targetDayName}.`;
          fixDesc = `Перенести на ${targetDayName}`;
        } else if (c.conditionType === 'day_first' && c.dayOfWeek !== undefined) {
          if (l.dayOfWeek === c.dayOfWeek && l.lessonIndex !== 0) {
            violated = true;
            reason = `В ${targetDayName} у класса ${cls.name} урок стоит ${l.lessonIndex + 1}-м, а должен быть 1-м.`;
            fixDesc = 'Поставить 1-м уроком в этот день';
          }
        } else if (c.conditionType === 'day_last' && c.dayOfWeek !== undefined) {
          if (l.dayOfWeek === c.dayOfWeek) {
            const dayLessons = schedule.filter((s) => s.classId === cls.id && s.dayOfWeek === l.dayOfWeek);
            const maxSlot = Math.max(...dayLessons.map((s) => s.lessonIndex));
            if (l.lessonIndex !== maxSlot) {
              violated = true;
              reason = `В ${targetDayName} у класса ${cls.name} урок стоит ${l.lessonIndex + 1}-м, а должен быть последним (${maxSlot + 1}-м).`;
              fixDesc = 'Поставить последним уроком в этот день';
            }
          }
        } else if (c.conditionType === 'fixed_slot') {
          if (
            (c.dayOfWeek !== undefined && l.dayOfWeek !== c.dayOfWeek) ||
            (c.lessonIndex !== undefined && l.lessonIndex !== c.lessonIndex)
          ) {
            violated = true;
            reason = `Урок у ${cls.name} стоит в ${dayName} (${l.lessonIndex + 1}-й), а требуется: ${targetDayName}, урок №${(c.lessonIndex ?? 0) + 1}.`;
            fixDesc = `Переставить в ${targetDayName}, урок №${(c.lessonIndex ?? 0) + 1}`;
          }
        }

        if (violated) {
          issues.push({
            id: `rule_${c.id}_${cls.id}_${l.id}`,
            type: 'constraint_violation',
            severity: 'warning',
            title: `Нарушено правило: "${subject.name}" (${cls.name})`,
            description: reason,
            classId: cls.id,
            dayOfWeek: l.dayOfWeek,
            lessonIndex: l.lessonIndex,
            itemIds: [l.id],
            canAutoFix: true,
            fixDescription: fixDesc,
            constraintId: c.id,
          });
        }
      });
    });
  });

  return issues;
}

// ---------------------------------------------------------------------------
// FAST LOCAL VALIDATORS (Runs in microseconds)
// ---------------------------------------------------------------------------

function isTeacherFree(
  schedule: ScheduleItem[],
  teacherId: string,
  day: number,
  slot: number,
  shift: 1 | 2,
  classMap: Map<string, SchoolClass>,
  excludeItemId?: string
): boolean {
  for (const s of schedule) {
    if (s.id === excludeItemId) continue;
    if (s.teacherId === teacherId && s.dayOfWeek === day && s.lessonIndex === slot) {
      const cls = classMap.get(s.classId);
      if ((cls?.shift || 1) === shift) return false;
    }
  }
  return true;
}

function isRoomFree(
  schedule: ScheduleItem[],
  roomId: string,
  capacity: number,
  day: number,
  slot: number,
  shift: 1 | 2,
  classMap: Map<string, SchoolClass>,
  excludeItemId?: string
): boolean {
  let count = 0;
  for (const s of schedule) {
    if (s.id === excludeItemId) continue;
    if (s.roomId === roomId && s.dayOfWeek === day && s.lessonIndex === slot) {
      const cls = classMap.get(s.classId);
      if ((cls?.shift || 1) === shift) {
        count++;
        if (count >= capacity) return false;
      }
    }
  }
  return true;
}

/**
 * Compacts contiguous lessons for a class on a given day (0..N-1)
 */
function compactClassDay(
  schedule: ScheduleItem[],
  classId: string,
  day: number
): ScheduleItem[] {
  const otherItems = schedule.filter((s) => !(s.classId === classId && s.dayOfWeek === day));
  const classDayItems = schedule
    .filter((s) => s.classId === classId && s.dayOfWeek === day)
    .sort((a, b) => a.lessonIndex - b.lessonIndex);

  const compacted = classDayItems.map((item, idx) => ({
    ...item,
    lessonIndex: idx,
  }));

  return otherItems.concat(compacted);
}

// ---------------------------------------------------------------------------
// HIGH QUALITY ATOMIC FIX HANDLERS
// ---------------------------------------------------------------------------

export function autoFixIssue(state: AppState, issue: DiagnosticIssue): AppState {
  if (!issue.canAutoFix) return state;

  const classMap = new Map<string, SchoolClass>(state.classes.map((c) => [c.id, c]));
  const roomMap = new Map<string, Room>(state.rooms.map((r) => [r.id, r]));
  const subjectMap = new Map<string, Subject>(state.subjects.map((s) => [s.id, s]));
  const daysCount = state.settings.daysPerWeek;

  switch (issue.type) {
    case 'student_gap': {
      if (!issue.classId || issue.dayOfWeek === undefined) return state;
      const classId = issue.classId;
      const day = issue.dayOfWeek;
      const cls = classMap.get(classId);
      const shift = cls?.shift || 1;

      const classDayItems = state.schedule
        .filter((s) => s.classId === classId && s.dayOfWeek === day)
        .sort((a, b) => a.lessonIndex - b.lessonIndex);

      if (classDayItems.length === 0) return state;

      const compacted = classDayItems.map((item, idx) => ({ ...item, lessonIndex: idx }));

      // Check teacher/room collisions for the compacted lessons
      let valid = true;
      for (const item of compacted) {
        if (!isTeacherFree(state.schedule, item.teacherId, day, item.lessonIndex, shift, classMap, item.id)) {
          valid = false;
          break;
        }
        const room = roomMap.get(item.roomId);
        if (!isRoomFree(state.schedule, item.roomId, room?.capacity || 1, day, item.lessonIndex, shift, classMap, item.id)) {
          valid = false;
          break;
        }
      }

      if (!valid) return state;

      const otherItems = state.schedule.filter((s) => !(s.classId === classId && s.dayOfWeek === day));
      return { ...state, schedule: otherItems.concat(compacted) };
    }

    case 'teacher_collision':
    case 'room_collision': {
      const itemsToFix = issue.itemIds || [];
      if (itemsToFix.length === 0) return state;

      const movingItem = state.schedule.find((s) => s.id === itemsToFix[itemsToFix.length - 1]);
      if (!movingItem) return state;

      const cls = classMap.get(movingItem.classId);
      if (!cls) return state;
      const shift = cls.shift || 1;
      const limit = state.parallelLimits[cls.grade] || 6;
      const subject = subjectMap.get(movingItem.subjectId);

      // Find free slot for this movingItem across days
      for (let day = 0; day < daysCount; day++) {
        const classDayLessons = state.schedule.filter(
          (s) => s.classId === cls.id && s.dayOfWeek === day && s.id !== movingItem.id
        );
        if (classDayLessons.length >= limit) continue;

        const targetSlot = classDayLessons.length;
        if (targetSlot >= state.settings.maxLessonsGlobal) continue;

        if (!isTeacherFree(state.schedule, movingItem.teacherId, day, targetSlot, shift, classMap, movingItem.id)) {
          continue;
        }

        // Room selection
        const reqType = subject?.requiredRoomType || 'regular';
        const candidateRoom = state.rooms.find((r) => {
          if (reqType !== 'regular' && r.type !== reqType) return false;
          return isRoomFree(state.schedule, r.id, r.capacity || 1, day, targetSlot, shift, classMap, movingItem.id);
        });
        if (!candidateRoom) continue;

        // Apply relocation
        const otherSchedule = state.schedule.filter((s) => s.id !== movingItem.id);
        const updatedItem: ScheduleItem = {
          ...movingItem,
          dayOfWeek: day,
          lessonIndex: targetSlot,
          roomId: candidateRoom.id,
        };

        const newSchedule = otherSchedule.concat(updatedItem);
        // Recompact source day if different
        const finalSchedule = compactClassDay(newSchedule, cls.id, movingItem.dayOfWeek);
        return { ...state, schedule: finalSchedule };
      }
      return state;
    }

    case 'room_type_mismatch': {
      const itemId = issue.itemIds?.[0];
      if (!itemId) return state;
      const item = state.schedule.find((s) => s.id === itemId);
      if (!item) return state;

      const cls = classMap.get(item.classId);
      const shift = cls?.shift || 1;
      const subject = subjectMap.get(item.subjectId);
      if (!subject) return state;

      const targetRoom = state.rooms.find(
        (r) =>
          r.type === subject.requiredRoomType &&
          isRoomFree(state.schedule, r.id, r.capacity || 1, item.dayOfWeek, item.lessonIndex, shift, classMap, item.id)
      );

      if (targetRoom) {
        const newSchedule = state.schedule.map((s) => (s.id === item.id ? { ...s, roomId: targetRoom.id } : s));
        return { ...state, schedule: newSchedule };
      }
      return state;
    }

    case 'daily_limit_exceeded': {
      if (!issue.classId || issue.dayOfWeek === undefined) return state;
      const classId = issue.classId;
      const day = issue.dayOfWeek;
      const cls = classMap.get(classId);
      if (!cls) return state;
      const shift = cls.shift || 1;
      const limit = state.parallelLimits[cls.grade] || 6;

      const classDayLessons = state.schedule
        .filter((s) => s.classId === classId && s.dayOfWeek === day)
        .sort((a, b) => b.lessonIndex - a.lessonIndex);

      if (classDayLessons.length <= limit) return state;
      const movingLesson = classDayLessons[0];

      // Find day with least lessons for this class
      const sortedDays = Array.from({ length: daysCount }, (_, i) => i)
        .filter((d) => d !== day)
        .sort((a, b) => {
          const ca = state.schedule.filter((s) => s.classId === classId && s.dayOfWeek === a).length;
          const cb = state.schedule.filter((s) => s.classId === classId && s.dayOfWeek === b).length;
          return ca - cb;
        });

      for (const targetDay of sortedDays) {
        const targetLessons = state.schedule.filter((s) => s.classId === classId && s.dayOfWeek === targetDay);
        if (targetLessons.length >= limit) continue;

        const targetSlot = targetLessons.length;
        if (!isTeacherFree(state.schedule, movingLesson.teacherId, targetDay, targetSlot, shift, classMap, movingLesson.id)) {
          continue;
        }

        const room = roomMap.get(movingLesson.roomId);
        if (!isRoomFree(state.schedule, movingLesson.roomId, room?.capacity || 1, targetDay, targetSlot, shift, classMap, movingLesson.id)) {
          continue;
        }

        const newSchedule = state.schedule
          .filter((s) => s.id !== movingLesson.id)
          .concat({
            ...movingLesson,
            dayOfWeek: targetDay,
            lessonIndex: targetSlot,
          });

        return { ...state, schedule: compactClassDay(newSchedule, classId, day) };
      }
      return state;
    }

    case 'missing_hours': {
      if (!issue.classId) return state;
      const curr = state.curriculum.find(
        (c) => c.classId === issue.classId && issue.id === `miss_${c.id}`
      );
      if (!curr) return state;

      const cls = classMap.get(curr.classId);
      const subject = subjectMap.get(curr.subjectId);
      if (!cls || !subject) return state;
      const shift = cls.shift || 1;
      const limit = state.parallelLimits[cls.grade] || 6;
      const teacherId = curr.teacherId || state.teachers.find((t) => t.subjectIds.includes(subject.id))?.id;
      if (!teacherId) return state;

      // FIRST: Check if teacher has an existing window on any day and fill it
      for (let day = 0; day < daysCount; day++) {
        const classDayLessons = state.schedule.filter((s) => s.classId === cls.id && s.dayOfWeek === day);
        if (classDayLessons.length >= limit) continue;

        const tchLessons = state.schedule
          .filter((s) => s.teacherId === teacherId && s.dayOfWeek === day)
          .sort((a, b) => a.lessonIndex - b.lessonIndex);

        if (tchLessons.length >= 2) {
          const minS = tchLessons[0].lessonIndex;
          const maxS = tchLessons[tchLessons.length - 1].lessonIndex;
          for (let slot = minS + 1; slot < maxS; slot++) {
            if (!tchLessons.some((l) => l.lessonIndex === slot)) {
              // Gap found! Can this class take a lesson here?
              if (slot === classDayLessons.length) {
                const reqType = subject.requiredRoomType;
                const room = state.rooms.find((r) => {
                  if (reqType !== 'regular' && r.type !== reqType) return false;
                  return isRoomFree(state.schedule, r.id, r.capacity || 1, day, slot, shift, classMap);
                });
                if (room) {
                  const newItem: ScheduleItem = {
                    id: `sch_add_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
                    dayOfWeek: day,
                    lessonIndex: slot,
                    classId: cls.id,
                    subjectId: subject.id,
                    teacherId,
                    roomId: room.id,
                  };
                  return { ...state, schedule: [...state.schedule, newItem] };
                }
              }
            }
          }
        }
      }

      // SECOND: Place at the end of the least loaded day
      const sortedDays = Array.from({ length: daysCount }, (_, i) => i).sort((a, b) => {
        const ca = state.schedule.filter((s) => s.classId === cls.id && s.dayOfWeek === a).length;
        const cb = state.schedule.filter((s) => s.classId === cls.id && s.dayOfWeek === b).length;
        return ca - cb;
      });

      for (const day of sortedDays) {
        const classLessons = state.schedule.filter((s) => s.classId === cls.id && s.dayOfWeek === day);
        if (classLessons.length >= limit) continue;
        const targetSlot = classLessons.length;

        if (!isTeacherFree(state.schedule, teacherId, day, targetSlot, shift, classMap)) continue;

        const reqType = subject.requiredRoomType;
        const room = state.rooms.find((r) => {
          if (reqType !== 'regular' && r.type !== reqType) return false;
          return isRoomFree(state.schedule, r.id, r.capacity || 1, day, targetSlot, shift, classMap);
        });
        if (!room) continue;

        const newItem: ScheduleItem = {
          id: `sch_add_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
          dayOfWeek: day,
          lessonIndex: targetSlot,
          classId: cls.id,
          subjectId: subject.id,
          teacherId,
          roomId: room.id,
        };

        return { ...state, schedule: [...state.schedule, newItem] };
      }
      return state;
    }

    case 'teacher_gap': {
      return repairTeacherGapWithSearch(state, issue);
    }

    case 'constraint_violation': {
      return repairConstraintWithSearch(state, issue);
    }

    default:
      return state;
  }
}

function countTeacherGapsOnDay(schedule: ScheduleItem[], teacherId: string, day: number): number {
  const tchLessons = schedule
    .filter((s) => s.teacherId === teacherId && s.dayOfWeek === day)
    .sort((a, b) => a.lessonIndex - b.lessonIndex);
  if (tchLessons.length <= 1) return 0;
  const minSlot = tchLessons[0].lessonIndex;
  const maxSlot = tchLessons[tchLessons.length - 1].lessonIndex;
  return Math.max(0, maxSlot - minSlot + 1 - tchLessons.length);
}

/**
 * Enhanced Teacher Gap Repair
 * Eliminates teacher windows through 3 fast strategies:
 * 1. Intra-class swap: Swap late lesson of teacher with an earlier lesson of the same class
 * 2. Compacting: Shift lessons upward to close gap
 * 3. Cross-day move: Move isolated boundary lesson to day where teacher is already teaching
 */
function repairTeacherGapWithSearch(state: AppState, issue: DiagnosticIssue): AppState {
  if (!issue.teacherId || issue.dayOfWeek === undefined) return state;
  const teacherId = issue.teacherId;
  const day = issue.dayOfWeek;
  const classMap = new Map<string, SchoolClass>(state.classes.map((c) => [c.id, c]));
  const roomMap = new Map<string, Room>(state.rooms.map((r) => [r.id, r]));
  const daysCount = state.settings.daysPerWeek;

  const teacherDayLessons = state.schedule
    .filter((item) => item.teacherId === teacherId && item.dayOfWeek === day)
    .sort((a, b) => a.lessonIndex - b.lessonIndex);

  if (teacherDayLessons.length < 2) return state;

  const minSlot = teacherDayLessons[0].lessonIndex;
  const maxSlot = teacherDayLessons[teacherDayLessons.length - 1].lessonIndex;

  const gapSlots: number[] = [];
  for (let slot = minSlot + 1; slot < maxSlot; slot++) {
    if (!teacherDayLessons.some((l) => l.lessonIndex === slot)) {
      gapSlots.push(slot);
    }
  }
  if (gapSlots.length === 0) return state;

  // STRATEGY 1: Intra-class swap to fill teacher window
  for (const lesson of teacherDayLessons) {
    const classId = lesson.classId;
    const cls = classMap.get(classId);
    if (!cls) continue;
    const shift = cls.shift || 1;

    const classDayLessons = state.schedule.filter(
      (s) => s.classId === classId && s.dayOfWeek === day && s.id !== lesson.id
    );

    for (const otherLesson of classDayLessons) {
      if (otherLesson.teacherId === teacherId) continue;
      const targetSlot = otherLesson.lessonIndex;

      // Only swap if it moves into or adjacent to gap
      if (!gapSlots.includes(targetSlot) && Math.abs(targetSlot - minSlot) > 1) continue;

      // Check if other teacher is free at lesson.lessonIndex
      if (!isTeacherFree(state.schedule, otherLesson.teacherId, day, lesson.lessonIndex, shift, classMap, otherLesson.id)) {
        continue;
      }
      // Check if current teacher is free at targetSlot
      if (!isTeacherFree(state.schedule, teacherId, day, targetSlot, shift, classMap, lesson.id)) {
        continue;
      }

      // Candidate swap
      const candidateSchedule = state.schedule.map((s) => {
        if (s.id === lesson.id) return { ...s, lessonIndex: targetSlot };
        if (s.id === otherLesson.id) return { ...s, lessonIndex: lesson.lessonIndex };
        return s;
      });

      const gapsBefore =
        countTeacherGapsOnDay(state.schedule, teacherId, day) +
        countTeacherGapsOnDay(state.schedule, otherLesson.teacherId, day);
      const gapsAfter =
        countTeacherGapsOnDay(candidateSchedule, teacherId, day) +
        countTeacherGapsOnDay(candidateSchedule, otherLesson.teacherId, day);

      if (gapsAfter < gapsBefore) {
        return { ...state, schedule: candidateSchedule };
      }
    }
  }

  // STRATEGY 2: Cross-day move of an isolated boundary lesson
  // If teacher has 1 lesson on another class separated by 2+ slots:
  const boundaryLessons = [teacherDayLessons[0], teacherDayLessons[teacherDayLessons.length - 1]];
  for (const lesson of boundaryLessons) {
    const cls = classMap.get(lesson.classId);
    if (!cls) continue;
    const shift = cls.shift || 1;
    const limit = state.parallelLimits[cls.grade] || 6;

    for (let targetDay = 0; targetDay < daysCount; targetDay++) {
      if (targetDay === day) continue;

      const targetClassLessons = state.schedule.filter((s) => s.classId === cls.id && s.dayOfWeek === targetDay);
      if (targetClassLessons.length >= limit) continue;

      const targetSlot = targetClassLessons.length;
      if (!isTeacherFree(state.schedule, teacherId, targetDay, targetSlot, shift, classMap, lesson.id)) {
        continue;
      }

      const room = roomMap.get(lesson.roomId);
      if (!isRoomFree(state.schedule, lesson.roomId, room?.capacity || 1, targetDay, targetSlot, shift, classMap, lesson.id)) {
        continue;
      }

      const newSchedule = state.schedule
        .filter((s) => s.id !== lesson.id)
        .concat({
          ...lesson,
          dayOfWeek: targetDay,
          lessonIndex: targetSlot,
        });

      return { ...state, schedule: compactClassDay(newSchedule, cls.id, day) };
    }
  }

  return state;
}

/**
 * Fast Rule Constraint Repair (always_first, always_last, fixed_slot, only_on_day)
 */
function repairConstraintWithSearch(state: AppState, issue: DiagnosticIssue): AppState {
  const constraint = (state.constraints || []).find((c) => c.id === issue.constraintId);
  const lessonId = issue.itemIds?.[0];
  if (!constraint || !lessonId) return state;

  const lesson = state.schedule.find((item) => item.id === lessonId);
  if (!lesson) return state;

  const classMap = new Map<string, SchoolClass>(state.classes.map((c) => [c.id, c]));
  const roomMap = new Map<string, Room>(state.rooms.map((r) => [r.id, r]));
  const cls = classMap.get(lesson.classId);
  if (!cls) return state;
  const shift = cls.shift || 1;
  const dailyLimit = state.parallelLimits[cls.grade] || 6;
  const days = state.settings.daysPerWeek;

  const allowedDays = (d: number): boolean => {
    if (constraint.conditionType === 'only_on_day' ||
        constraint.conditionType === 'day_first' ||
        constraint.conditionType === 'day_last' ||
        constraint.conditionType === 'fixed_slot') {
      return constraint.dayOfWeek === undefined || constraint.dayOfWeek === d;
    }
    return d >= 0 && d < days;
  };

  for (let targetDay = 0; targetDay < days; targetDay++) {
    if (!allowedDays(targetDay)) continue;

    const targetClassLessons = state.schedule
      .filter((s) => s.classId === cls.id && s.dayOfWeek === targetDay)
      .sort((a, b) => a.lessonIndex - b.lessonIndex);

    let targetSlot = 0;
    if (constraint.conditionType === 'always_first' || constraint.conditionType === 'day_first') {
      targetSlot = 0;
    } else if (constraint.conditionType === 'always_last' || constraint.conditionType === 'day_last') {
      targetSlot = Math.max(0, targetClassLessons.length > 0 ? targetClassLessons.length - 1 : 0);
    } else if (constraint.conditionType === 'fixed_slot') {
      targetSlot = constraint.lessonIndex ?? 0;
    }

    // Same day swap
    if (targetDay === lesson.dayOfWeek) {
      const occupied = targetClassLessons.find((l) => l.lessonIndex === targetSlot && l.id !== lesson.id);
      if (occupied) {
        if (!isTeacherFree(state.schedule, lesson.teacherId, targetDay, targetSlot, shift, classMap, lesson.id)) continue;
        if (!isTeacherFree(state.schedule, occupied.teacherId, targetDay, lesson.lessonIndex, shift, classMap, occupied.id)) continue;

        const newSchedule = state.schedule.map((s) => {
          if (s.id === lesson.id) return { ...s, lessonIndex: targetSlot };
          if (s.id === occupied.id) return { ...s, lessonIndex: lesson.lessonIndex };
          return s;
        });
        return { ...state, schedule: newSchedule };
      } else {
        const newSchedule = state.schedule.map((s) =>
          s.id === lesson.id ? { ...s, lessonIndex: targetSlot } : s
        );
        return { ...state, schedule: compactClassDay(newSchedule, cls.id, targetDay) };
      }
    } else {
      // Cross-day move
      if (targetClassLessons.length >= dailyLimit) continue;
      if (!isTeacherFree(state.schedule, lesson.teacherId, targetDay, targetSlot, shift, classMap, lesson.id)) continue;

      const room = roomMap.get(lesson.roomId);
      if (!isRoomFree(state.schedule, lesson.roomId, room?.capacity || 1, targetDay, targetSlot, shift, classMap, lesson.id)) continue;

      const newSchedule = state.schedule
        .filter((s) => s.id !== lesson.id)
        .concat({
          ...lesson,
          dayOfWeek: targetDay,
          lessonIndex: targetSlot,
        });

      const compactedTarget = compactClassDay(newSchedule, cls.id, targetDay);
      return { ...state, schedule: compactClassDay(compactedTarget, cls.id, lesson.dayOfWeek) };
    }
  }

  return state;
}

// ---------------------------------------------------------------------------
// 1-CLICK RAPID HEURISTIC ENGINE (Blazing fast, < 25ms execution time)
// ---------------------------------------------------------------------------

export interface AutoFixAllResult {
  newState: AppState;
  fixedCount: number;
  initialIssuesCount: number;
  remainingIssuesCount: number;
  remainingIssues: DiagnosticIssue[];
  success: boolean;
}

export function autoFixAllIssues(state: AppState): AutoFixAllResult {
  let currentState = state;
  const initialIssues = runDiagnostics(state);
  const initialIssuesCount = initialIssues.length;

  if (initialIssuesCount === 0) {
    return {
      newState: state,
      fixedCount: 0,
      initialIssuesCount: 0,
      remainingIssuesCount: 0,
      remainingIssues: [],
      success: true,
    };
  }

  let iterations = 0;
  const maxIterations = 12; // 12 rounds is plenty with fast local checks!

  while (iterations < maxIterations) {
    const currentIssues = runDiagnostics(currentState).filter((i) => i.canAutoFix);
    if (currentIssues.length === 0) break;

    let fixedInRound = false;

    // Prioritized order
    const getOrder = (type: string) => {
      switch (type) {
        case 'missing_hours': return 1;
        case 'student_gap': return 2;
        case 'teacher_collision': return 3;
        case 'room_collision': return 4;
        case 'room_type_mismatch': return 5;
        case 'daily_limit_exceeded': return 6;
        case 'teacher_gap': return 7;
        case 'constraint_violation': return 8;
        default: return 9;
      }
    };

    const sortedIssues = [...currentIssues].sort((a, b) => getOrder(a.type) - getOrder(b.type));

    for (const issue of sortedIssues) {
      const nextState = autoFixIssue(currentState, issue);
      if (nextState !== currentState) {
        const beforeCount = runDiagnostics(currentState).length;
        const afterIssues = runDiagnostics(nextState);

        // Never accept a move that merely replaces one warning with another
        // or returns a fresh state object without reducing real problems.
        if (afterIssues.length >= beforeCount) continue;
        currentState = nextState;
        fixedInRound = true;
      }
    }

    if (!fixedInRound) {
      // Fallback single-pass fast LNS if heuristic stalled
      const lnsResult = repairScheduleLNS(currentState);
      if (lnsResult.success && lnsResult.repairedItemsCount > 0) {
        const lnsState = { ...currentState, schedule: lnsResult.repairedSchedule };
        if (runDiagnostics(lnsState).length < runDiagnostics(currentState).length) {
          currentState = lnsState;
        }
      }
      break;
    }

    iterations++;
  }

  const finalIssues = runDiagnostics(currentState);
  const finalCount = finalIssues.length;
  const effectiveFixed = Math.max(0, initialIssuesCount - finalCount);

  return {
    newState: currentState,
    fixedCount: effectiveFixed,
    initialIssuesCount,
    remainingIssuesCount: finalCount,
    remainingIssues: finalIssues,
    success: finalCount === 0,
  };
}
