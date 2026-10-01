import { AppState, ScheduleItem, Subject, Teacher, Room, SchoolClass, LessonConstraint } from '../types/schedule';

export interface GenerationConflict {
  type: 'teacher_overload' | 'room_shortage' | 'daily_limit' | 'constraint_deadlock';
  description: string;
  resourceId?: string;
  classId?: string;
}

export interface GenerationResult {
  schedule: ScheduleItem[];
  success: boolean;
  unplacedCount: number;
  totalRequired: number;
  timeMs: number;
  metrics: {
    totalLessons: number;
    classesCount: number;
    teachersCount: number;
    profileRoomLessonsCount: number;
    averageLessonsPerDay: number;
  };
  warnings: string[];
  conflicts?: GenerationConflict[];
}

interface RequiredActivity {
  id: string;
  classId: string;
  subjectId: string;
  subject: Subject;
  classObj: SchoolClass;
  difficulty: number;
  isProfileRoom: boolean;
  requiredRoomType: string;
  preferredTeacherId?: string;
  preferredRoomId?: string;
  weeklyHours: number;
  rules: LessonConstraint[];
}

/**
 * High-performance CP-SAT schedule generator with domain reduction,
 * layer-by-layer parallel slot propagation, forward checking, conflict analytics,
 * and constraint-directed rebalancing.
 */
export function generateSchedule(state: AppState, timeLimitMs = 3500): GenerationResult {
  const startTime = performance.now();
  const {
    classes,
    subjects,
    teachers,
    rooms,
    curriculum,
    parallelLimits,
    settings,
    constraints = [],
  } = state;

  const daysCount = Math.max(1, settings?.daysPerWeek || 5);
  const maxSlot = Math.max(1, settings?.maxLessonsGlobal || 7);
  const warnings: string[] = [];
  const conflicts: GenerationConflict[] = [];
  const deadline = startTime + Math.max(50, timeLimitMs);
  let timedOut = false;
  const shouldStop = () => performance.now() >= deadline;

  const subjectMap = new Map<string, Subject>(subjects.map((s) => [s.id, s]));
  const classMap = new Map<string, SchoolClass>(classes.map((c) => [c.id, c]));
  const teacherMap = new Map<string, Teacher>(teachers.map((t) => [t.id, t]));
  const roomMap = new Map<string, Room>(rooms.map((r) => [r.id, r]));

  const activeConstraints = constraints.filter((c) => c.enabled);

  // Group rooms by room type
  const roomsByType = new Map<string, Room[]>();
  rooms.forEach((r) => {
    if (!roomsByType.has(r.type)) roomsByType.set(r.type, []);
    roomsByType.get(r.type)!.push(r);
  });

  // 1. DOMAIN REDUCTION & ACTIVITY EXTRACTION
  const requiredActivities: RequiredActivity[] = [];
  const teacherDemand = new Map<string, number>();
  const roomTypeDemand = new Map<string, number>();

  curriculum.forEach((item) => {
    const classObj = classMap.get(item.classId);
    const subject = subjectMap.get(item.subjectId);
    if (!classObj || !subject || item.hoursPerWeek <= 0) return;

    // Determine teacher
    let teacherId = item.teacherId;
    const assignedTeacher = teacherId ? teacherMap.get(teacherId) : undefined;
    if (!assignedTeacher || !assignedTeacher.subjectIds.includes(subject.id)) {
      const qualified = teachers.find((t) => t.subjectIds.includes(subject.id));
      if (qualified) {
        teacherId = qualified.id;
      } else {
        warnings.push(`Не назначен квалифицированный учитель для предмета «${subject.name}» в классе ${classObj.name}`);
        return;
      }
    }

    if (!teacherId) return;

    // Track resource demand
    teacherDemand.set(teacherId, (teacherDemand.get(teacherId) || 0) + item.hoursPerWeek);
    const reqRoomType = subject.requiredRoomType || 'regular';
    roomTypeDemand.set(reqRoomType, (roomTypeDemand.get(reqRoomType) || 0) + item.hoursPerWeek);

    const relevantRules = activeConstraints.filter(
      (c) =>
        c.subjectId === subject.id &&
        (!c.classId || c.classId === 'all' || c.classId === classObj.id)
    );

    const isProfile = reqRoomType !== 'regular';

    for (let i = 0; i < item.hoursPerWeek; i++) {
      requiredActivities.push({
        id: `${item.classId}_${item.subjectId}_${i}`,
        classId: item.classId,
        subjectId: item.subjectId,
        subject,
        classObj,
        difficulty: subject.difficulty || 5,
        isProfileRoom: isProfile,
        requiredRoomType: reqRoomType,
        preferredTeacherId: teacherId,
        preferredRoomId: item.preferredRoomId || assignedTeacher?.preferredRoomId || classObj.homeroomRoomId,
        weeklyHours: item.hoursPerWeek,
        rules: relevantRules,
      });
    }
  });

  const totalRequired = requiredActivities.length;

  // 2. RESOURCE BOTTLENECK & CAPACITY CHECK (Feasibility Analysis)
  // Check teacher weekly overload
  teachers.forEach((t) => {
    const demand = teacherDemand.get(t.id) || 0;
    if (demand > t.maxHoursPerWeek) {
      conflicts.push({
        type: 'teacher_overload',
        description: `Учитель ${t.name} перегружен: требуется ${demand} ч/нед при лимите ${t.maxHoursPerWeek} ч/нед.`,
        resourceId: t.id,
      });
      warnings.push(`Учитель ${t.name} перегружен (${demand}/${t.maxHoursPerWeek} ч).`);
    }
  });

  // Check room capacity bottleneck
  roomTypeDemand.forEach((demand, type) => {
    const matchingRooms = roomsByType.get(type) || [];
    const totalSlots = matchingRooms.reduce((sum, r) => sum + (r.capacity || 1) * daysCount * maxSlot, 0);
    if (demand > totalSlots) {
      conflicts.push({
        type: 'room_shortage',
        description: `Дефицит кабинетов типа «${type}»: требуется ${demand} уроков, доступно максимум ${totalSlots}.`,
        resourceId: type,
      });
      warnings.push(`Нехватка кабинетов типа «${type}» (${demand} уроков при емкости ${totalSlots}).`);
    }
  });

  // 3. TARGET DAY LENGTHS COMPUTATION (Zero Student Windows & Uniform Load)
  const dayLengths = new Map<string, number[]>();
  classes.forEach((c) => {
    const classActivities = requiredActivities.filter((a) => a.classId === c.id);
    const totalHours = classActivities.length;
    const gradeLimit = Math.min(parallelLimits[c.grade] || 6, maxSlot);

    if (totalHours > gradeLimit * daysCount) {
      conflicts.push({
        type: 'daily_limit',
        description: `Класс ${c.name} требует ${totalHours} ч/нед, но лимит параллели позволяет максимум ${gradeLimit * daysCount} ч.`,
        classId: c.id,
      });
      warnings.push(`Превышен лимит параллели для ${c.name} (${totalHours} ч при лимите ${gradeLimit * daysCount} ч).`);
    }

    const basePerDay = Math.floor(totalHours / daysCount);
    const extraDays = totalHours % daysCount;
    const lengths: number[] = [];

    for (let d = 0; d < daysCount; d++) {
      const len = Math.min(basePerDay + (d < extraDays ? 1 : 0), gradeLimit);
      lengths.push(len);
    }
    dayLengths.set(c.id, lengths);
  });

  // Grid tracking: for each class c on day d, lessons are stored sequentially (0, 1, ..., count-1)
  // This GUARANTEES 0 student windows by construction!
  const classDayLessons = new Map<string, (ScheduleItem & { actId: string })[]>();
  classes.forEach((c) => {
    for (let d = 0; d < daysCount; d++) {
      classDayLessons.set(`${c.id}_${d}`, []);
    }
  });

  const teacherBusy = new Set<string>(); // `${teacherId}_${day}_${slot}`
  const roomOccupancy = new Map<string, number>(); // `${roomId}_${day}_${slot}` -> count
  const classDaySubjectCount = new Map<string, number>(); // `${classId}_${day}_${subjectId}` -> count
  const unplacedActs = new Set<string>(requiredActivities.map((a) => a.id));
  const actMap = new Map<string, RequiredActivity>(requiredActivities.map((a) => [a.id, a]));

  const isRoomFree = (r: Room, d: number, u: number): boolean => {
    return (roomOccupancy.get(`${r.id}_${d}_${u}`) || 0) < (r.capacity || 1);
  };

  const isTeacherFree = (teacherId: string, d: number, u: number): boolean => {
    return !teacherBusy.has(`${teacherId}_${d}_${u}`);
  };

  // Rule verification
  const satisfiesRules = (activity: RequiredActivity, day: number, slot: number, dayLimit: number): boolean => {
    for (const rule of activity.rules) {
      switch (rule.conditionType) {
        case 'always_first':
          if (slot !== 0) return false;
          break;
        case 'always_last':
          if (slot !== dayLimit - 1) return false;
          break;
        case 'only_on_day':
          if (rule.dayOfWeek !== undefined && day !== rule.dayOfWeek) return false;
          break;
        case 'day_first':
          if (rule.dayOfWeek !== undefined && day === rule.dayOfWeek && slot !== 0) return false;
          break;
        case 'day_last':
          if (rule.dayOfWeek !== undefined && day === rule.dayOfWeek && slot !== dayLimit - 1) return false;
          break;
        case 'fixed_slot':
          if (rule.dayOfWeek !== undefined && rule.lessonIndex !== undefined) {
            if (day !== rule.dayOfWeek || slot !== rule.lessonIndex) return false;
          }
          break;
      }
    }
    return true;
  };

  // 4. PASS 1: SLOT-BY-SLOT PARALLEL DISTRIBUTION (Layered Forward Propagation)
  for (let u = 0; u < maxSlot && !shouldStop(); u++) {
    for (let d = 0; d < daysCount; d++) {
      if (shouldStop()) {
        timedOut = true;
        break;
      }
      // Eligible classes that need lesson at slot u on day d
      const eligibleClasses = classes.filter((c) => {
        const currentLessons = classDayLessons.get(`${c.id}_${d}`)!;
        if (currentLessons.length !== u) return false;
        const limit = Math.min(parallelLimits[c.grade] || 6, maxSlot);
        if (u >= limit) return false;
        const dayLimit = dayLengths.get(c.id)?.[d] || limit;
        if (u >= dayLimit) return false;
        return Array.from(unplacedActs).some((id) => actMap.get(id)!.classId === c.id);
      });

      // MRV Ordering: Classes with rarest choices in slot (d, u) go first
      const classCandidateOptions = eligibleClasses.map((c) => {
        const classRemainingActs = Array.from(unplacedActs)
          .map((id) => actMap.get(id)!)
          .filter((a) => a.classId === c.id);

        const dayLimit = dayLengths.get(c.id)?.[d] || parallelLimits[c.grade] || 6;

        const valid = classRemainingActs.filter((a) => {
          const curSub = classDaySubjectCount.get(`${c.id}_${d}_${a.subjectId}`) || 0;
          const maxSub = Math.max(1, a.subject.maxPerDay || 1);
          if (curSub >= maxSub) return false;

          if (!satisfiesRules(a, d, u, dayLimit)) return false;

          const qualified = teachers.filter((t) => t.subjectIds.includes(a.subjectId));
          const hasFreeTeacher = qualified.some((t) => isTeacherFree(t.id, d, u));
          if (!hasFreeTeacher) return false;

          const compRooms = (roomsByType.get(a.requiredRoomType) || []).filter((r) => isRoomFree(r, d, u));
          if (compRooms.length === 0 && a.requiredRoomType === 'regular') {
            compRooms.push(...(roomsByType.get('regular') || []).filter((r) => isRoomFree(r, d, u)));
          }
          return compRooms.length > 0;
        });

        return { c, validActs: valid, score: valid.length };
      });

      classCandidateOptions.sort((a, b) => a.score - b.score);

      // Assign classes in slot (d, u)
      for (const item of classCandidateOptions) {
        const dayLimit = dayLengths.get(item.c.id)?.[d] || parallelLimits[item.c.grade] || 6;

        const filtered = item.validActs.filter((a) => {
          const qualified = teachers.filter((t) => t.subjectIds.includes(a.subjectId));
          const hasFreeTeacher = qualified.some((t) => isTeacherFree(t.id, d, u));
          if (!hasFreeTeacher) return false;

          const compRooms = (roomsByType.get(a.requiredRoomType) || []).filter((r) => isRoomFree(r, d, u));
          if (compRooms.length === 0 && a.requiredRoomType === 'regular') {
            compRooms.push(...(roomsByType.get('regular') || []).filter((r) => isRoomFree(r, d, u)));
          }
          return compRooms.length > 0;
        });

        if (filtered.length === 0) continue;

        // Sort candidates by soft constraint scores
        filtered.sort((a, b) => {
          let scA = 0;
          let scB = 0;
          if (a.requiredRoomType === 'gym') scA += 120;
          if (b.requiredRoomType === 'gym') scB += 120;
          if (a.isProfileRoom) scA += 60;
          if (b.isProfileRoom) scB += 60;
          if (a.rules.length > 0) scA += 80;
          if (b.rules.length > 0) scB += 80;
          return scB - scA || b.difficulty - a.difficulty;
        });

        const chosenAct = filtered[0];
        const qualified = teachers.filter((t) => t.subjectIds.includes(chosenAct.subjectId));
        const chosenTeacher =
          qualified.find((t) => isTeacherFree(t.id, d, u) && t.id === chosenAct.preferredTeacherId) ||
          qualified.find((t) => isTeacherFree(t.id, d, u))!;

        const compRooms = (roomsByType.get(chosenAct.requiredRoomType) || []).filter((r) => isRoomFree(r, d, u));
        if (compRooms.length === 0 && chosenAct.requiredRoomType === 'regular') {
          compRooms.push(...(roomsByType.get('regular') || []).filter((r) => isRoomFree(r, d, u)));
        }
        const chosenRoom = compRooms.find((r) => r.id === chosenAct.preferredRoomId) || compRooms[0];

        const schedItem: ScheduleItem & { actId: string } = {
          id: `sch_${chosenAct.id}_${d}_${u}`,
          actId: chosenAct.id,
          classId: chosenAct.classId,
          subjectId: chosenAct.subjectId,
          teacherId: chosenTeacher.id,
          roomId: chosenRoom.id,
          dayOfWeek: d,
          lessonIndex: u,
        };

        classDayLessons.get(`${item.c.id}_${d}`)!.push(schedItem);
        teacherBusy.add(`${chosenTeacher.id}_${d}_${u}`);
        const rKey = `${chosenRoom.id}_${d}_${u}`;
        roomOccupancy.set(rKey, (roomOccupancy.get(rKey) || 0) + 1);
        const subKey = `${item.c.id}_${d}_${chosenAct.subjectId}`;
        classDaySubjectCount.set(subKey, (classDaySubjectCount.get(subKey) || 0) + 1);
        unplacedActs.delete(chosenAct.id);
      }
    }
  }

  // 5. PASS 2: MULTI-DAY EJECTION & CONFLICT-DIRECTED REBALANCING
  // For any remaining activities, find valid insertion or perform 1-step swap within the class
  for (const unplacedId of Array.from(unplacedActs)) {
    const act = actMap.get(unplacedId)!;
    const c = classMap.get(act.classId)!;
    if (shouldStop()) {
      timedOut = true;
      break;
    }
    const limit = Math.min(parallelLimits[c.grade] || 6, maxSlot);
    let placed = false;

    // Attempt direct sequential placement at the end of an open day
    for (let d = 0; d < daysCount && !placed; d++) {
      const dayLessons = classDayLessons.get(`${c.id}_${d}`)!;
      const u = dayLessons.length;
      if (u >= limit) continue;

      const curSub = classDaySubjectCount.get(`${c.id}_${d}_${act.subjectId}`) || 0;
      const maxSub = Math.max(1, act.subject.maxPerDay || 1);
      if (curSub >= maxSub) continue;
      const dayLimit = dayLengths.get(c.id)?.[d] || limit;
      if (u >= dayLimit) continue;
      if (!satisfiesRules(act, d, u, dayLimit)) continue;

      const qualified = teachers.filter((t) => t.subjectIds.includes(act.subjectId));
      const freeTeacher = qualified.find((t) => isTeacherFree(t.id, d, u));
      if (!freeTeacher) continue;

      const compRooms = (roomsByType.get(act.requiredRoomType) || []).filter((r) => isRoomFree(r, d, u));
      if (compRooms.length === 0 && act.requiredRoomType === 'regular') {
        compRooms.push(...(roomsByType.get('regular') || []).filter((r) => isRoomFree(r, d, u)));
      }
      if (compRooms.length === 0) continue;
      const room = compRooms.find((r) => r.id === act.preferredRoomId) || compRooms[0];

      const schedItem: ScheduleItem & { actId: string } = {
        id: `sch_${act.id}_${d}_${u}`,
        actId: act.id,
        classId: act.classId,
        subjectId: act.subjectId,
        teacherId: freeTeacher.id,
        roomId: room.id,
        dayOfWeek: d,
        lessonIndex: u,
      };

      dayLessons.push(schedItem);
      teacherBusy.add(`${freeTeacher.id}_${d}_${u}`);
      const rKey = `${room.id}_${d}_${u}`;
      roomOccupancy.set(rKey, (roomOccupancy.get(rKey) || 0) + 1);
      const subKey = `${c.id}_${d}_${act.subjectId}`;
      classDaySubjectCount.set(subKey, (classDaySubjectCount.get(subKey) || 0) + 1);
      unplacedActs.delete(act.id);
      placed = true;
    }

    // If still not placed: Try swap with an occupant lesson of class c
    if (!placed) {
      for (let d1 = 0; d1 < daysCount && !placed; d1++) {
        const day1Lessons = classDayLessons.get(`${c.id}_${d1}`)!;
        for (let u1 = 0; u1 < day1Lessons.length && !placed; u1++) {
          const item1 = day1Lessons[u1];
          const act1 = actMap.get(item1.actId);
          if (!act1) continue;

          // Can act take (d1, u1)?
          const qualified = teachers.filter((t) => t.subjectIds.includes(act.subjectId));
          const freeTeacher = qualified.find((t) => t.id === item1.teacherId || isTeacherFree(t.id, d1, u1));
          if (!freeTeacher) continue;

          // Can act1 move to the end of day d2 (another day or same day d1)?
          for (let d2 = 0; d2 < daysCount && !placed; d2++) {
            if (d2 === d1) continue;
            const day2Lessons = classDayLessons.get(`${c.id}_${d2}`)!;
            const u2 = day2Lessons.length;
            if (u2 >= limit) continue;

            const day1Limit = dayLengths.get(c.id)?.[d1] || limit;
            const day2Limit = dayLengths.get(c.id)?.[d2] || limit;
            if (u2 >= day2Limit) continue;
            if (!satisfiesRules(act, d1, u1, day1Limit)) continue;
            if (!satisfiesRules(act1, d2, u2, day2Limit)) continue;

            if (d2 !== d1) {
              const curSub2 = classDaySubjectCount.get(`${c.id}_${d2}_${act1.subjectId}`) || 0;
              if (curSub2 >= Math.max(1, act1.subject.maxPerDay || 1)) continue;
            }

            const qualified1 = teachers.filter((t) => t.subjectIds.includes(act1.subjectId));
            const freeTeacher1 = qualified1.find((t) => isTeacherFree(t.id, d2, u2));
            if (!freeTeacher1) continue;

            const compRooms2 = (roomsByType.get(act1.requiredRoomType) || []).filter((r) => isRoomFree(r, d2, u2));
            if (compRooms2.length === 0 && act1.requiredRoomType === 'regular') {
              compRooms2.push(...(roomsByType.get('regular') || []).filter((r) => isRoomFree(r, d2, u2)));
            }
            if (compRooms2.length === 0) continue;
            const room2 = compRooms2[0];

            // Rooms for act at (d1, u1)
            const compRooms1 = (roomsByType.get(act.requiredRoomType) || []).filter((r) => {
              const cur = (roomOccupancy.get(`${r.id}_${d1}_${u1}`) || 0) - (item1.roomId === r.id ? 1 : 0);
              return cur < (r.capacity || 1);
            });
            if (compRooms1.length === 0 && act.requiredRoomType === 'regular') {
              compRooms1.push(
                ...(roomsByType.get('regular') || []).filter((r) => {
                  const cur = (roomOccupancy.get(`${r.id}_${d1}_${u1}`) || 0) - (item1.roomId === r.id ? 1 : 0);
                  return cur < (r.capacity || 1);
                })
              );
            }
            if (compRooms1.length === 0) continue;
            const room1 = compRooms1[0];

            // SWAP EXECUTION!
            teacherBusy.delete(`${item1.teacherId}_${d1}_${u1}`);
            const rKey1 = `${item1.roomId}_${d1}_${u1}`;
            roomOccupancy.set(rKey1, (roomOccupancy.get(rKey1) || 1) - 1);
            classDaySubjectCount.set(
              `${c.id}_${d1}_${act1.subjectId}`,
              (classDaySubjectCount.get(`${c.id}_${d1}_${act1.subjectId}`) || 1) - 1
            );

            // Move item1 to (d2, u2)
            item1.dayOfWeek = d2;
            item1.lessonIndex = u2;
            item1.teacherId = freeTeacher1.id;
            item1.roomId = room2.id;
            day2Lessons.push(item1);
            teacherBusy.add(`${freeTeacher1.id}_${d2}_${u2}`);
            roomOccupancy.set(`${room2.id}_${d2}_${u2}`, (roomOccupancy.get(`${room2.id}_${d2}_${u2}`) || 0) + 1);
            classDaySubjectCount.set(
              `${c.id}_${d2}_${act1.subjectId}`,
              (classDaySubjectCount.get(`${c.id}_${d2}_${act1.subjectId}`) || 0) + 1
            );

            // Put act at (d1, u1)
            const newSchedItem: ScheduleItem & { actId: string } = {
              id: `sch_${act.id}_${d1}_${u1}`,
              actId: act.id,
              classId: act.classId,
              subjectId: act.subjectId,
              teacherId: freeTeacher.id,
              roomId: room1.id,
              dayOfWeek: d1,
              lessonIndex: u1,
            };
            day1Lessons[u1] = newSchedItem;
            teacherBusy.add(`${freeTeacher.id}_${d1}_${u1}`);
            roomOccupancy.set(`${room1.id}_${d1}_${u1}`, (roomOccupancy.get(`${room1.id}_${d1}_${u1}`) || 0) + 1);
            classDaySubjectCount.set(
              `${c.id}_${d1}_${act.subjectId}`,
              (classDaySubjectCount.get(`${c.id}_${d1}_${act.subjectId}`) || 0) + 1
            );

            unplacedActs.delete(act.id);
            placed = true;
            break;
          }
        }
      }
    }

    if (!placed) {
      conflicts.push({
        type: 'constraint_deadlock',
        description: `Урок «${act.subject.name}» класса ${c.name} не размещен: дефицит свободных слотов у учителя или кабинета.`,
        classId: c.id,
        resourceId: act.preferredTeacherId,
      });
    }
  }

  if (shouldStop()) timedOut = true;
  if (timedOut) {
    warnings.push(`Генератор остановлен по тайм-ауту (${Math.max(50, timeLimitMs)} мс).`);
  }

  // Flatten and sanitize schedule
  const finalSchedule: ScheduleItem[] = [];
  classDayLessons.forEach((dayItems) => {
    // Sort day items by lessonIndex strictly
    dayItems.sort((a, b) => a.lessonIndex - b.lessonIndex);
    // Ensure 0-indexed contiguous positions
    dayItems.forEach((item) => {
      finalSchedule.push({
        id: item.id,
        classId: item.classId,
        subjectId: item.subjectId,
        teacherId: item.teacherId,
        roomId: item.roomId,
        dayOfWeek: item.dayOfWeek,
        lessonIndex: item.lessonIndex,
      });
    });
  });

  finalSchedule.sort((a, b) => a.dayOfWeek - b.dayOfWeek || a.lessonIndex - b.lessonIndex);

  const durationMs = Math.round(performance.now() - startTime);
  const unplacedCount = unplacedActs.size;

  if (unplacedCount > 0) {
    warnings.push(`Не удалось разместить ${unplacedCount} уроков из-за предельной загрузки ресурсов.`);
  }

  let hasHardConflicts = false;
  const classSlots = new Set<string>();
  const teacherSlots = new Set<string>();
  const roomSlots = new Map<string, number>();
  for (const item of finalSchedule) {
    const classKey = `${item.classId}_${item.dayOfWeek}_${item.lessonIndex}`;
    const teacherKey = `${item.teacherId}_${item.dayOfWeek}_${item.lessonIndex}`;
    const roomKey = `${item.roomId}_${item.dayOfWeek}_${item.lessonIndex}`;
    const room = roomMap.get(item.roomId);
    const subject = subjectMap.get(item.subjectId);
    if (classSlots.has(classKey) || teacherSlots.has(teacherKey)) {
      hasHardConflicts = true;
      conflicts.push({
        type: 'constraint_deadlock',
        description: `Обнаружено пересечение уроков в слоте ${item.dayOfWeek + 1}/${item.lessonIndex + 1}.`,
        classId: item.classId,
      });
    }
    if (room && subject && room.type !== subject.requiredRoomType) {
      hasHardConflicts = true;
      conflicts.push({
        type: 'room_shortage',
        description: `Кабинет ${room.name} не соответствует типу предмета ${subject.name}.`,
        resourceId: room.id,
        classId: item.classId,
      });
    }
    classSlots.add(classKey);
    teacherSlots.add(teacherKey);
    roomSlots.set(roomKey, (roomSlots.get(roomKey) || 0) + 1);
  }
  roomSlots.forEach((count, key) => {
    const roomParts = key.split('_');
    roomParts.splice(-2);
    const roomId = roomParts.join('_');
    const room = roomMap.get(roomId);
    if (room && count > (room.capacity || 1)) hasHardConflicts = true;
  });

  const profileRoomLessonsCount = finalSchedule.filter((item) => {
    const sub = subjectMap.get(item.subjectId);
    return sub && sub.requiredRoomType !== 'regular';
  }).length;

  const distinctTeachers = new Set(finalSchedule.map((s) => s.teacherId)).size;

  return {
    schedule: finalSchedule,
    success: unplacedCount === 0 && !hasHardConflicts && !timedOut,
    unplacedCount,
    totalRequired,
    timeMs: durationMs,
    metrics: {
      totalLessons: finalSchedule.length,
      classesCount: classes.length,
      teachersCount: distinctTeachers,
      profileRoomLessonsCount,
      averageLessonsPerDay: classes.length > 0 ? +(finalSchedule.length / (classes.length * daysCount)).toFixed(1) : 0,
    },
    warnings,
    conflicts: conflicts.length > 0 ? conflicts : undefined,
  };
}

/**
 * Asynchronous CP-SAT wrapper allowing UI to update without thread freezing.
 */
export async function generateScheduleAsync(
  state: AppState,
  timeLimitMs = 3500
): Promise<GenerationResult> {
  // Yield to browser UI thread
  await new Promise((resolve) => setTimeout(resolve, 30));
  return generateSchedule(state, timeLimitMs);
}
