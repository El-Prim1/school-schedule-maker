import { AppState, DiagnosticIssue, ScheduleItem, Subject, Teacher, Room, SchoolClass } from '../types/schedule';
import { DAYS_OF_WEEK } from './constants';

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

      if (dayLessons.length <= 1) continue;

      const indices = dayLessons.map((l) => l.lessonIndex);
      const minSlot = Math.min(...indices);
      const maxSlot = Math.max(...indices);

      // Check if starts from lesson 0 or has gaps
      const hasGaps = maxSlot - minSlot + 1 !== dayLessons.length;
      const startsLate = minSlot > 0;

      if (hasGaps || startsLate) {
        issues.push({
          id: `gap_${cls.id}_${day}`,
          type: 'student_gap',
          severity: 'error',
          title: `Окно в расписании ${cls.name}`,
          description: `В день ${day + 1} (${DAYS_OF_WEEK[day]?.name || ''}) у класса ${cls.name} обнаружены разрывы или поздний старт между уроками (заняты слоты: ${indices.map((i) => i + 1).join(', ')}).`,
          classId: cls.id,
          dayOfWeek: day,
          canAutoFix: true,
          fixDescription: 'Стянуть уроки вверх (устранить окно)',
        });
      }
    }
  });

  // 2. Check Teacher Collisions (Накладки учителей)
  const teacherSlots = new Map<string, ScheduleItem[]>();
  schedule.forEach((item) => {
    const key = `${item.teacherId}_${item.dayOfWeek}_${item.lessonIndex}`;
    if (!teacherSlots.has(key)) teacherSlots.set(key, []);
    teacherSlots.get(key)!.push(item);
  });

  teacherSlots.forEach((items, key) => {
    if (items.length > 1) {
      const teacher = teacherMap.get(items[0].teacherId);
      const teacherName = teacher?.shortName || 'Учитель';
      const classNames = items.map((i) => classMap.get(i.classId)?.name || i.classId).join(' и ');
      issues.push({
        id: `tcol_${key}`,
        type: 'teacher_collision',
        severity: 'error',
        title: `Накладка у учителя: ${teacherName}`,
        description: `${teacherName} одновременно назначен в классы [${classNames}] в день ${items[0].dayOfWeek + 1} (${DAYS_OF_WEEK[items[0].dayOfWeek]?.name || ''}), урок №${items[0].lessonIndex + 1}.`,
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
    const key = `${item.roomId}_${item.dayOfWeek}_${item.lessonIndex}`;
    if (!roomSlots.has(key)) roomSlots.set(key, []);
    roomSlots.get(key)!.push(item);
  });

  roomSlots.forEach((items, key) => {
    const room = roomMap.get(items[0].roomId);
    const capacity = room?.capacity || 1;
    if (items.length > capacity) {
      const roomName = room?.name || 'Кабинет';
      const classNames = items.map((i) => classMap.get(i.classId)?.name || i.classId).join(', ');
      issues.push({
        id: `rcol_${key}`,
        type: 'room_collision',
        severity: 'error',
        title: `Переполнение кабинета: ${roomName}`,
        description: `В ${roomName} назначено ${items.length} уроков при лимите ${capacity} (${classNames}), день ${items[0].dayOfWeek + 1}, урок №${items[0].lessonIndex + 1}.`,
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

  // 5. Check Daily Parallel Limits (Предупреждение)
  classes.forEach((cls) => {
    const limit = parallelLimits[cls.grade] || 6;
    for (let day = 0; day < daysCount; day++) {
      const count = schedule.filter((s) => s.classId === cls.id && s.dayOfWeek === day).length;
      if (count > limit) {
        issues.push({
          id: `lim_${cls.id}_${day}`,
          type: 'daily_limit_exceeded',
          severity: 'warning',
          title: `Превышен дневной лимит уроков (${cls.name})`,
          description: `У класса ${cls.name} в ${DAYS_OF_WEEK[day]?.name || `день ${day + 1}`} назначено ${count} уроков при максимальном лимите ${limit}.`,
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
      const minSlot = tchLessons[0].lessonIndex;
      const maxSlot = tchLessons[tchLessons.length - 1].lessonIndex;
      const windowCount = maxSlot - minSlot + 1 - tchLessons.length;

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
          fixDescription: 'Стянуть уроки учителя (устранить окно)',
        });
      }
    }
  });

  // 7. Check Curriculum Hours completeness (Предупреждение)
  curriculum.forEach((curr) => {
    const scheduledHours = schedule.filter(
      (s) => s.classId === curr.classId && s.subjectId === curr.subjectId
    ).length;

    if (scheduledHours < curr.hoursPerWeek) {
      const cls = classMap.get(curr.classId);
      const sub = subjectMap.get(curr.subjectId);
      issues.push({
        id: `miss_${curr.id}`,
        type: 'missing_hours',
        severity: 'warning',
        title: `Не хватает часов: ${sub?.name || ''} (${cls?.name || ''})`,
        description: `По плану требуется ${curr.hoursPerWeek} ч/нед, но в расписании только ${scheduledHours} ч.`,
        classId: curr.classId,
        canAutoFix: true,
        fixDescription: 'Вставить недостающий урок в свободный слот',
      });
    }
  });

  // 8. Check User-Defined Constraints & Rules (Ограничения из настроек)
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

// 1-CLICK QUICK FIX IMPLEMENTATIONS
export function autoFixIssue(state: AppState, issue: DiagnosticIssue): AppState {
  const { classes, subjects, teachers, rooms, schedule, settings, parallelLimits, constraints = [] } = state;
  const daysCount = settings.daysPerWeek;

  let newSchedule = [...schedule];

  switch (issue.type) {
    case 'student_gap': {
      // Fix: Compact class schedule on dayOfWeek to slots 0, 1, 2, ...
      if (!issue.classId || issue.dayOfWeek === undefined) return state;

      const day = issue.dayOfWeek;
      const classId = issue.classId;

      const classDayLessons = newSchedule
        .filter((s) => s.classId === classId && s.dayOfWeek === day)
        .sort((a, b) => a.lessonIndex - b.lessonIndex);

      if (classDayLessons.length === 0) return state;

      const updatedDayLessons: ScheduleItem[] = classDayLessons.map((item, idx) => ({
        ...item,
        lessonIndex: idx,
      }));

      newSchedule = newSchedule
        .filter((s) => !(s.classId === classId && s.dayOfWeek === day))
        .concat(updatedDayLessons);

      return { ...state, schedule: newSchedule };
    }

    case 'teacher_collision': {
      // Fix: Move one of the colliding items to a free slot for that class
      if (!issue.itemIds || issue.itemIds.length < 2) return state;
      const moveItemId = issue.itemIds[1];
      const itemToMove = newSchedule.find((s) => s.id === moveItemId);
      if (!itemToMove) return state;

      for (let day = 0; day < daysCount; day++) {
        const classLessons = newSchedule.filter((s) => s.classId === itemToMove.classId && s.dayOfWeek === day);
        const nextSlot = classLessons.length;
        const classGrade = classes.find((c) => c.id === itemToMove.classId)?.grade || 5;
        const limit = parallelLimits[classGrade] || 6;

        if (nextSlot >= limit) continue;

        const teacherBusy = newSchedule.some(
          (s) => s.id !== moveItemId && s.teacherId === itemToMove.teacherId && s.dayOfWeek === day && s.lessonIndex === nextSlot
        );
        if (teacherBusy) continue;

        let targetRoomId = itemToMove.roomId;
        const roomBusy = newSchedule.some(
          (s) => s.id !== moveItemId && s.roomId === targetRoomId && s.dayOfWeek === day && s.lessonIndex === nextSlot
        );
        if (roomBusy) {
          const subject = subjects.find((s) => s.id === itemToMove.subjectId);
          const reqType = subject?.requiredRoomType || 'regular';
          const freeRoom = rooms.find(
            (r) =>
              (r.type === reqType || reqType === 'regular') &&
              !newSchedule.some((s) => s.roomId === r.id && s.dayOfWeek === day && s.lessonIndex === nextSlot)
          );
          if (!freeRoom) continue;
          targetRoomId = freeRoom.id;
        }

        newSchedule = newSchedule.map((s) => {
          if (s.id === moveItemId) {
            return {
              ...s,
              dayOfWeek: day,
              lessonIndex: nextSlot,
              roomId: targetRoomId,
            };
          }
          return s;
        });

        return { ...state, schedule: newSchedule };
      }
      return state;
    }

    case 'room_collision': {
      // Fix: Reassign one lesson to another free room of the required type
      if (!issue.itemIds || issue.itemIds.length < 2) return state;
      const moveItemId = issue.itemIds[1];
      const item = newSchedule.find((s) => s.id === moveItemId);
      if (!item) return state;

      const subject = subjects.find((s) => s.id === item.subjectId);
      const reqType = subject?.requiredRoomType || 'regular';

      const altRoom = rooms.find(
        (r) =>
          r.type === reqType &&
          !newSchedule.some((s) => s.roomId === r.id && s.dayOfWeek === item.dayOfWeek && s.lessonIndex === item.lessonIndex)
      );

      if (altRoom) {
        newSchedule = newSchedule.map((s) => (s.id === moveItemId ? { ...s, roomId: altRoom.id } : s));
        return { ...state, schedule: newSchedule };
      }
      return state;
    }

    case 'room_type_mismatch': {
      if (!issue.itemIds || issue.itemIds.length === 0) return state;
      const targetId = issue.itemIds[0];
      const item = newSchedule.find((s) => s.id === targetId);
      if (!item) return state;

      const subject = subjects.find((s) => s.id === item.subjectId);
      if (!subject) return state;

      const suitableRoom = rooms.find(
        (r) =>
          r.type === subject.requiredRoomType &&
          !newSchedule.some((s) => s.roomId === r.id && s.dayOfWeek === item.dayOfWeek && s.lessonIndex === item.lessonIndex)
      );

      if (suitableRoom) {
        newSchedule = newSchedule.map((s) => (s.id === targetId ? { ...s, roomId: suitableRoom.id } : s));
        return { ...state, schedule: newSchedule };
      }
      return state;
    }

    case 'daily_limit_exceeded': {
      if (!issue.classId || issue.dayOfWeek === undefined) return state;
      const classId = issue.classId;
      const fromDay = issue.dayOfWeek;
      const cls = classes.find((c) => c.id === classId);
      const grade = cls?.grade || 5;
      const limit = parallelLimits[grade] || 6;

      const fromDayLessons = newSchedule
        .filter((s) => s.classId === classId && s.dayOfWeek === fromDay)
        .sort((a, b) => b.lessonIndex - a.lessonIndex);

      if (fromDayLessons.length <= limit) return state;

      // Sort other days by current load (least loaded first)
      const otherDays = Array.from({ length: daysCount }, (_, i) => i)
        .filter((d) => d !== fromDay)
        .sort((a, b) => {
          const countA = newSchedule.filter((s) => s.classId === classId && s.dayOfWeek === a).length;
          const countB = newSchedule.filter((s) => s.classId === classId && s.dayOfWeek === b).length;
          return countA - countB;
        });

      // Try moving any lesson from fromDay (preferring later lessons)
      for (const lessonToMove of fromDayLessons) {
        for (const targetDay of otherDays) {
          const targetDayLessons = newSchedule.filter((s) => s.classId === classId && s.dayOfWeek === targetDay);
          const nextSlot = targetDayLessons.length;
          if (nextSlot >= limit) continue;

          // Teacher availability
          const teacherBusy = newSchedule.some(
            (s) => s.id !== lessonToMove.id && s.teacherId === lessonToMove.teacherId && s.dayOfWeek === targetDay && s.lessonIndex === nextSlot
          );
          if (teacherBusy) continue;

          // Room availability
          const subject = subjects.find((s) => s.id === lessonToMove.subjectId);
          const reqType = subject?.requiredRoomType || 'regular';
          const freeRoom = rooms.find(
            (r) =>
              (r.type === reqType || reqType === 'regular') &&
              !newSchedule.some((s) => s.roomId === r.id && s.dayOfWeek === targetDay && s.lessonIndex === nextSlot)
          );
          if (!freeRoom) continue;

          // Move lesson to targetDay
          newSchedule = newSchedule.map((s) => {
            if (s.id === lessonToMove.id) {
              return {
                ...s,
                dayOfWeek: targetDay,
                lessonIndex: nextSlot,
                roomId: freeRoom.id,
              };
            }
            return s;
          });

          // Compact lessons on fromDay so no gaps remain
          const remainingFromDay = newSchedule
            .filter((s) => s.classId === classId && s.dayOfWeek === fromDay)
            .sort((a, b) => a.lessonIndex - b.lessonIndex)
            .map((s, idx) => ({ ...s, lessonIndex: idx }));

          newSchedule = newSchedule
            .filter((s) => !(s.classId === classId && s.dayOfWeek === fromDay))
            .concat(remainingFromDay);

          return { ...state, schedule: newSchedule };
        }
      }
      return state;
    }

    case 'missing_hours': {
      if (!issue.classId) return state;
      const cls = classes.find((c) => c.id === issue.classId);
      if (!cls) return state;

      // Extract specific curriculum item if available from issue id (miss_CURRID)
      const specificCurrId = issue.id.startsWith('miss_') ? issue.id.replace('miss_', '') : null;
      let missingCurr = state.curriculum.find((c) => c.id === specificCurrId);

      if (!missingCurr) {
        missingCurr = state.curriculum.find((c) => {
          if (c.classId !== cls.id) return false;
          const count = newSchedule.filter((s) => s.classId === cls.id && s.subjectId === c.subjectId).length;
          return count < c.hoursPerWeek;
        });
      }

      if (!missingCurr) return state;

      const subject = subjects.find((s) => s.id === missingCurr.subjectId);
      const teacherId = missingCurr.teacherId || teachers.find((t) => t.subjectIds.includes(missingCurr!.subjectId))?.id;
      if (!subject || !teacherId) return state;

      const classGrade = cls.grade;
      const limit = parallelLimits[classGrade] || 6;

      // Sort days by current load
      const sortedDays = Array.from({ length: daysCount }, (_, i) => i).sort((a, b) => {
        const countA = newSchedule.filter((s) => s.classId === cls.id && s.dayOfWeek === a).length;
        const countB = newSchedule.filter((s) => s.classId === cls.id && s.dayOfWeek === b).length;
        return countA - countB;
      });

      for (const day of sortedDays) {
        const classLessons = newSchedule.filter((s) => s.classId === cls.id && s.dayOfWeek === day);
        const slot = classLessons.length;
        if (slot >= limit) continue;

        const teacherBusy = newSchedule.some(
          (s) => s.teacherId === teacherId && s.dayOfWeek === day && s.lessonIndex === slot
        );
        if (teacherBusy) continue;

        const reqType = subject.requiredRoomType;
        const room = rooms.find(
          (r) =>
            (r.type === reqType || (reqType === 'regular' && r.type === 'regular')) &&
            !newSchedule.some((s) => s.roomId === r.id && s.dayOfWeek === day && s.lessonIndex === slot)
        );
        if (!room) continue;

        const newItem: ScheduleItem = {
          id: `sch_fix_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
          dayOfWeek: day,
          lessonIndex: slot,
          classId: cls.id,
          subjectId: subject.id,
          teacherId,
          roomId: room.id,
        };

        newSchedule.push(newItem);
        return { ...state, schedule: newSchedule };
      }
      return state;
    }

    case 'teacher_gap': {
      // Fix teacher gap: shift or swap lesson to close gap
      if (!issue.teacherId || issue.dayOfWeek === undefined) return state;
      const teacherId = issue.teacherId;
      const day = issue.dayOfWeek;

      const tchLessons = newSchedule
        .filter((s) => s.teacherId === teacherId && s.dayOfWeek === day)
        .sort((a, b) => a.lessonIndex - b.lessonIndex);

      if (tchLessons.length <= 1) return state;

      // Find first gap
      for (let i = 0; i < tchLessons.length - 1; i++) {
        const currentSlot = tchLessons[i].lessonIndex;
        const nextSlot = tchLessons[i + 1].lessonIndex;
        if (nextSlot > currentSlot + 1) {
          // Window between currentSlot and nextSlot
          const targetSlot = currentSlot + 1;
          const laterLesson = tchLessons[i + 1];

          // Check if laterLesson's class has targetSlot available or can swap
          const classLessons = newSchedule.filter(
            (s) => s.classId === laterLesson.classId && s.dayOfWeek === day
          );
          const occupiedAtTarget = classLessons.find((s) => s.lessonIndex === targetSlot);

          if (occupiedAtTarget) {
            // Swap laterLesson and occupiedAtTarget if the other teacher is free at nextSlot
            const otherTeacherFree = !newSchedule.some(
              (s) =>
                s.id !== occupiedAtTarget.id &&
                s.teacherId === occupiedAtTarget.teacherId &&
                s.dayOfWeek === day &&
                s.lessonIndex === nextSlot
            );
            if (otherTeacherFree) {
              newSchedule = newSchedule.map((s) => {
                if (s.id === laterLesson.id) return { ...s, lessonIndex: targetSlot };
                if (s.id === occupiedAtTarget.id) return { ...s, lessonIndex: nextSlot };
                return s;
              });
              return { ...state, schedule: newSchedule };
            }
          } else {
            // Target slot is empty for this class
            newSchedule = newSchedule.map((s) =>
              s.id === laterLesson.id ? { ...s, lessonIndex: targetSlot } : s
            );
            // Re-compact class schedule
            const recompacted = newSchedule
              .filter((s) => s.classId === laterLesson.classId && s.dayOfWeek === day)
              .sort((a, b) => a.lessonIndex - b.lessonIndex)
              .map((s, idx) => ({ ...s, lessonIndex: idx }));

            newSchedule = newSchedule
              .filter((s) => !(s.classId === laterLesson.classId && s.dayOfWeek === day))
              .concat(recompacted);

            return { ...state, schedule: newSchedule };
          }
        }
      }
      return state;
    }

    case 'constraint_violation': {
      // Fix user-defined constraint rule violation
      if (!issue.itemIds || issue.itemIds.length === 0 || !issue.constraintId) return state;
      const lessonId = issue.itemIds[0];
      const lesson = newSchedule.find((s) => s.id === lessonId);
      const constraint = constraints.find((c) => c.id === issue.constraintId);
      if (!lesson || !constraint) return state;

      const clsId = lesson.classId;
      const fromDay = lesson.dayOfWeek;
      const targetDay = constraint.dayOfWeek !== undefined ? constraint.dayOfWeek : fromDay;

      // 1. Move to targetDay if lesson is currently on a different day
      if (fromDay !== targetDay) {
        const targetDayLessons = newSchedule.filter(
          (s) => s.classId === clsId && s.dayOfWeek === targetDay
        );
        const newSlot = targetDayLessons.length;

        newSchedule = newSchedule.map((s) =>
          s.id === lesson.id ? { ...s, dayOfWeek: targetDay, lessonIndex: newSlot } : s
        );

        // Recompact fromDay so no student gap remains
        const recompactedFrom = newSchedule
          .filter((s) => s.classId === clsId && s.dayOfWeek === fromDay)
          .sort((a, b) => a.lessonIndex - b.lessonIndex)
          .map((s, idx) => ({ ...s, lessonIndex: idx }));

        newSchedule = newSchedule
          .filter((s) => !(s.classId === clsId && s.dayOfWeek === fromDay))
          .concat(recompactedFrom);
      }

      // 2. Adjust slot on targetDay if rule requires first, last, or fixed slot
      let targetSlot: number | null = null;

      if (constraint.conditionType === 'always_first' || constraint.conditionType === 'day_first') {
        targetSlot = 0;
      } else if (constraint.conditionType === 'always_last' || constraint.conditionType === 'day_last') {
        const dayLessons = newSchedule.filter((s) => s.classId === clsId && s.dayOfWeek === targetDay);
        targetSlot = Math.max(0, dayLessons.length - 1);
      } else if (constraint.conditionType === 'fixed_slot') {
        targetSlot = constraint.lessonIndex ?? 0;
      }

      if (targetSlot !== null) {
        const currentLesson = newSchedule.find((s) => s.id === lesson.id);
        if (currentLesson && currentLesson.lessonIndex !== targetSlot) {
          const currentSlot = currentLesson.lessonIndex;
          const occupant = newSchedule.find(
            (s) => s.classId === clsId && s.dayOfWeek === targetDay && s.lessonIndex === targetSlot
          );

          if (occupant && occupant.id !== lesson.id) {
            newSchedule = newSchedule.map((s) => {
              if (s.id === lesson.id) return { ...s, lessonIndex: targetSlot };
              if (s.id === occupant.id) return { ...s, lessonIndex: currentSlot };
              return s;
            });
          } else {
            newSchedule = newSchedule.map((s) =>
              s.id === lesson.id ? { ...s, lessonIndex: targetSlot } : s
            );
          }
        }
      }

      return { ...state, schedule: newSchedule };
    }

    default:
      return state;
  }
}

// 1-Click fix ALL issues (errors AND warnings AND constraint violations)
export function autoFixAllIssues(state: AppState): { newState: AppState; fixedCount: number } {
  let currentState = state;
  let fixedCount = 0;
  let iterations = 0;
  const maxIterations = 50;

  while (iterations < maxIterations) {
    const issues = runDiagnostics(currentState).filter((i) => i.canAutoFix);
    if (issues.length === 0) break;

    // Prioritize errors first, then warnings, then infos
    const sortedIssues = [...issues].sort((a, b) => {
      const getWeight = (s: string) => (s === 'error' ? 0 : s === 'warning' ? 1 : 2);
      return getWeight(a.severity) - getWeight(b.severity);
    });

    let fixedInThisRound = false;

    // Try fixing each auto-fixable issue until one makes progress
    for (const issue of sortedIssues) {
      const nextState = autoFixIssue(currentState, issue);
      if (nextState !== currentState) {
        const issuesBefore = runDiagnostics(currentState).length;
        const issuesAfter = runDiagnostics(nextState);

        const issueResolved = !issuesAfter.some((i) => i.id === issue.id);
        if (issueResolved || issuesAfter.length < issuesBefore) {
          currentState = nextState;
          fixedCount++;
          fixedInThisRound = true;
          break; // restart loop with freshly evaluated diagnostics
        }
      }
    }

    if (!fixedInThisRound) {
      // None of the remaining issues could be fixed automatically
      break;
    }

    iterations++;
  }

  return { newState: currentState, fixedCount };
}
