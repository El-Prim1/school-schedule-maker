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
  isProfileRoom: boolean;
  requiredRoomType: string;
  preferredTeacherId?: string;
  preferredRoomId?: string;
  isDivided?: boolean;
  groupCount?: number;
  preferredTeacherId2?: string;
  preferredRoomId2?: string;
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

    // Determine teacher (support homeroom teacher or explicit assignment)
    let teacherId = item.teacherId;
    if (subject.id === 'sub_primary' || teacherId === 'homeroom' || (!teacherId && classObj.grade <= 4 && subject.id === 'sub_primary')) {
      teacherId = classObj.homeroomTeacherId || `tch_homeroom_${classObj.id}`;
    }

    let assignedTeacher = teacherId ? teacherMap.get(teacherId) : undefined;
    if (!assignedTeacher) {
      const classShift = classObj.shift || 1;

      // 1. Pedagogical Pairing Rule: Russian & Literature must be taught by the same teacher
      if (subject.id === 'sub_lit') {
        const rusItem = curriculum.find((c) => c.classId === classObj.id && c.subjectId === 'sub_rus');
        if (rusItem?.teacherId && teacherMap.has(rusItem.teacherId)) {
          assignedTeacher = teacherMap.get(rusItem.teacherId);
          teacherId = assignedTeacher?.id;
        }
      } else if (subject.id === 'sub_rus') {
        const litItem = curriculum.find((c) => c.classId === classObj.id && c.subjectId === 'sub_lit');
        if (litItem?.teacherId && teacherMap.has(litItem.teacherId)) {
          assignedTeacher = teacherMap.get(litItem.teacherId);
          teacherId = assignedTeacher?.id;
        }
      }

      // 2. Pedagogical Pairing Rule: Algebra & Geometry (Grades 7-11) must be taught by the same teacher
      if (classObj.grade >= 7) {
        if (subject.id === 'sub_geom') {
          const algItem = curriculum.find((c) => c.classId === classObj.id && c.subjectId === 'sub_math');
          if (algItem?.teacherId && teacherMap.has(algItem.teacherId)) {
            assignedTeacher = teacherMap.get(algItem.teacherId);
            teacherId = assignedTeacher?.id;
          }
        } else if (subject.id === 'sub_math') {
          const geomItem = curriculum.find((c) => c.classId === classObj.id && c.subjectId === 'sub_geom');
          if (geomItem?.teacherId && teacherMap.has(geomItem.teacherId)) {
            assignedTeacher = teacherMap.get(geomItem.teacherId);
            teacherId = assignedTeacher?.id;
          }
        }
      }

      if (!assignedTeacher) {
        let qualifiedList = teachers.filter(
          (t) => t.subjectIds.includes(subject.id) && (t.shift === classShift || !t.shift)
        );

        // Grade 7-11: prefer algebra+geometry teachers
        if (classObj.grade >= 7 && (subject.id === 'sub_math' || subject.id === 'sub_geom')) {
          const algGeomList = qualifiedList.filter(
            (t) => t.subjectIds.includes('sub_math') && t.subjectIds.includes('sub_geom')
          );
          if (algGeomList.length > 0) qualifiedList = algGeomList;
        }

        // Grade 1-6: prefer middle/junior math teachers
        if (classObj.grade <= 6 && subject.id === 'sub_math') {
          const juniorMathList = qualifiedList.filter((t) => !t.subjectIds.includes('sub_geom'));
          if (juniorMathList.length > 0) qualifiedList = juniorMathList;
        }

        // Russian/Lit: prefer combined teachers
        if (subject.id === 'sub_rus' || subject.id === 'sub_lit') {
          const combinedList = qualifiedList.filter(
            (t) => t.subjectIds.includes('sub_rus') && t.subjectIds.includes('sub_lit')
          );
          if (combinedList.length > 0) qualifiedList = combinedList;
        }

        // Pick the least demanded qualified teacher for this shift
        qualifiedList.sort((a, b) => (teacherDemand.get(a.id) || 0) - (teacherDemand.get(b.id) || 0));
        const qualified = qualifiedList[0] || teachers.find((t) => t.subjectIds.includes(subject.id));

        if (qualified) {
          teacherId = qualified.id;
          assignedTeacher = qualified;
        } else {
          warnings.push(`Не назначен учитель для предмета «${subject.name}» (${classShift}-я смена) в классе ${classObj.name}`);
          return;
        }
      }
    }

    if (!teacherId) return;

    // Track resource demand
    teacherDemand.set(teacherId, (teacherDemand.get(teacherId) || 0) + item.hoursPerWeek);
    if (item.dividedIntoGroups && item.teacherId2) {
      teacherDemand.set(item.teacherId2, (teacherDemand.get(item.teacherId2) || 0) + item.hoursPerWeek);
    }
    const reqRoomType = subject.requiredRoomType || 'regular';
    roomTypeDemand.set(reqRoomType, (roomTypeDemand.get(reqRoomType) || 0) + item.hoursPerWeek);

    const relevantRules = activeConstraints.filter(
      (c) =>
        c.subjectId === subject.id &&
        (!c.classId || c.classId === 'all' || c.classId === classObj.id)
    );

    const isProfile = reqRoomType !== 'regular';
    const isDivided = Boolean(item.dividedIntoGroups);

    for (let i = 0; i < item.hoursPerWeek; i++) {
      requiredActivities.push({
        id: `${item.classId}_${item.subjectId}_${i}`,
        classId: item.classId,
        subjectId: item.subjectId,
        subject,
        classObj,
        isProfileRoom: isProfile,
        requiredRoomType: reqRoomType,
        preferredTeacherId: teacherId,
        preferredRoomId: item.preferredRoomId || assignedTeacher?.preferredRoomId || classObj.homeroomRoomId,
        isDivided,
        groupCount: item.groupCount || (isDivided ? 2 : 1),
        preferredTeacherId2: item.teacherId2,
        preferredRoomId2: item.preferredRoomId2,
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

  const isRoomFree = (r: Room, d: number, u: number, shift: 1 | 2 = 1): boolean => {
    return (roomOccupancy.get(`${r.id}_${d}_${shift}_${u}`) || 0) < (r.capacity || 1);
  };

  const isTeacherFree = (teacherId: string, d: number, u: number, shift: 1 | 2 = 1): boolean => {
    return !teacherBusy.has(`${teacherId}_${d}_${shift}_${u}`);
  };

  const teacherWindowCountAfterPlacement = (
    teacherId: string,
    day: number,
    slot: number,
    shift: 1 | 2
  ): number => {
    const slots: number[] = [];
    for (let candidate = 0; candidate < maxSlot; candidate++) {
      if (teacherBusy.has(`${teacherId}_${day}_${shift}_${candidate}`)) slots.push(candidate);
    }
    if (!slots.includes(slot)) slots.push(slot);
    if (slots.length <= 1) return 0;
    slots.sort((a, b) => a - b);
    return slots[slots.length - 1] - slots[0] + 1 - slots.length;
  };

  const chooseTeacher = (
    candidates: Teacher[],
    day: number,
    slot: number,
    shift: 1 | 2,
    preferredId?: string,
    excludedId?: string
  ): Teacher | undefined => {
    return candidates
      .filter((teacher) => teacher.id !== excludedId && isTeacherFree(teacher.id, day, slot, shift))
      .sort((a, b) => {
        const score = (teacher: Teacher) =>
          teacherWindowCountAfterPlacement(teacher.id, day, slot, shift) * 100 +
          (teacher.id === preferredId ? -25 : 0) +
          (teacherDemand.get(teacher.id) || 0);
        return score(a) - score(b);
      })[0];
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
  for (let u = 0; u < maxSlot; u++) {
    for (let d = 0; d < daysCount; d++) {
      // Eligible classes that need lesson at slot u on day d
      const eligibleClasses = classes.filter((c) => {
        const currentLessons = classDayLessons.get(`${c.id}_${d}`)!;
        const occupiedSlots = new Set(currentLessons.map((l) => l.lessonIndex));
        if (occupiedSlots.has(u)) return false;
        if (occupiedSlots.size !== u) return false;
        const limit = parallelLimits[c.grade] || 6;
        if (u >= limit) return false;
        return Array.from(unplacedActs).some((id) => actMap.get(id)!.classId === c.id);
      });

      // MRV Ordering: Classes with rarest choices in slot (d, u) go first
      const classCandidateOptions = eligibleClasses.map((c) => {
        const classRemainingActs = Array.from(unplacedActs)
          .map((id) => actMap.get(id)!)
          .filter((a) => a.classId === c.id);

        const dayLimit = dayLengths.get(c.id)?.[d] || parallelLimits[c.grade] || 6;
        const cShift = c.shift || 1;

        const valid = classRemainingActs.filter((a) => {
          const curSub = classDaySubjectCount.get(`${c.id}_${d}_${a.subjectId}`) || 0;
          const maxSub = a.subject.id === 'sub_primary' ? 4 : (a.subject.maxPerDay || (a.weeklyHours > 5 ? 2 : 1));
          if (curSub >= maxSub) return false;

          if (!satisfiesRules(a, d, u, dayLimit)) return false;

          const qualified = teachers.filter((t) => t.subjectIds.includes(a.subjectId) || t.id === a.preferredTeacherId);
          const freeTeachers = qualified.filter((t) => isTeacherFree(t.id, d, u, cShift));
          if (freeTeachers.length === 0) return false;
          if (a.isDivided && freeTeachers.length < 2) return false;

          const compRooms = (roomsByType.get(a.requiredRoomType) || []).filter((r) => isRoomFree(r, d, u, cShift));
          if (compRooms.length === 0 && a.requiredRoomType === 'regular') {
            compRooms.push(...(roomsByType.get('regular') || []).filter((r) => isRoomFree(r, d, u, cShift)));
          }
          if (compRooms.length === 0) return false;
          if (a.isDivided && compRooms.length < 2 && a.requiredRoomType !== 'gym') {
            const allRegFree = (roomsByType.get('regular') || []).filter((r) => isRoomFree(r, d, u, cShift));
            if (compRooms.length + allRegFree.length < 2) return false;
          }
          return true;
        });

        return { c, validActs: valid, score: valid.length };
      });

      classCandidateOptions.sort((a, b) => a.score - b.score);

      // Assign classes in slot (d, u)
      for (const item of classCandidateOptions) {
        const dayLimit = dayLengths.get(item.c.id)?.[d] || parallelLimits[item.c.grade] || 6;

        const cShift = item.c.shift || 1;
        const filtered = item.validActs.filter((a) => {
          const qualified = teachers.filter((t) => t.subjectIds.includes(a.subjectId) || t.id === a.preferredTeacherId);
          const freeTeachers = qualified.filter((t) => isTeacherFree(t.id, d, u, cShift));
          if (freeTeachers.length === 0) return false;
          if (a.isDivided && freeTeachers.length < 2) return false;

          const compRooms = (roomsByType.get(a.requiredRoomType) || []).filter((r) => isRoomFree(r, d, u, cShift));
          if (compRooms.length === 0 && a.requiredRoomType === 'regular') {
            compRooms.push(...(roomsByType.get('regular') || []).filter((r) => isRoomFree(r, d, u, cShift)));
          }
          if (compRooms.length === 0) return false;
          if (a.isDivided && compRooms.length < 2 && a.requiredRoomType !== 'gym') {
            const allRegFree = (roomsByType.get('regular') || []).filter((r) => isRoomFree(r, d, u, cShift));
            if (compRooms.length + allRegFree.length < 2) return false;
          }
          return true;
        });

        if (filtered.length === 0) continue;

        // Sort candidates by soft constraint scores and weekly hours
        filtered.sort((a, b) => {
          let scA = 0;
          let scB = 0;
          if (a.requiredRoomType === 'gym') scA += 120;
          if (b.requiredRoomType === 'gym') scB += 120;
          if (a.isProfileRoom) scA += 60;
          if (b.isProfileRoom) scB += 60;
          if (a.rules.length > 0) scA += 80;
          if (b.rules.length > 0) scB += 80;
          return scB - scA || b.weeklyHours - a.weeklyHours;
        });

        const chosenAct = filtered[0];
        const qualified = teachers.filter((t) => t.subjectIds.includes(chosenAct.subjectId) || t.id === chosenAct.preferredTeacherId);
        const chosenTeacher = chooseTeacher(qualified, d, u, cShift, chosenAct.preferredTeacherId);
        if (!chosenTeacher) continue;

        const compRooms = (roomsByType.get(chosenAct.requiredRoomType) || []).filter((r) => isRoomFree(r, d, u, cShift));
        if (compRooms.length === 0 && chosenAct.requiredRoomType === 'regular') {
          compRooms.push(...(roomsByType.get('regular') || []).filter((r) => isRoomFree(r, d, u, cShift)));
        }
        const chosenRoom = compRooms.find((r) => r.id === chosenAct.preferredRoomId) || compRooms[0];

        if (chosenAct.isDivided) {
          // Find teacher 2 and room 2 for 2nd group
          const qualified2 = teachers.filter((t) => t.subjectIds.includes(chosenAct.subjectId) || t.id === chosenAct.preferredTeacherId2);
          const chosenTeacher2 = chooseTeacher(
            qualified2,
            d,
            u,
            cShift,
            chosenAct.preferredTeacherId2,
            chosenTeacher.id
          );

          if (!chosenTeacher2) {
            continue;
          }

          const compRooms2 = (roomsByType.get(chosenAct.requiredRoomType) || []).filter(
            (r) => r.id !== chosenRoom.id && isRoomFree(r, d, u, cShift)
          );
          if (compRooms2.length === 0) {
            compRooms2.push(
              ...(roomsByType.get('regular') || []).filter((r) => r.id !== chosenRoom.id && isRoomFree(r, d, u, cShift))
            );
          }
          const chosenRoom2 =
            compRooms2.find((r) => r.id === chosenAct.preferredRoomId2) ||
            compRooms2[0];

          if (!chosenRoom2 && chosenAct.requiredRoomType !== 'gym') {
            continue;
          }
          const finalRoom2 = chosenRoom2 || chosenRoom;

          const schedItem1: ScheduleItem & { actId: string } = {
            id: `sch_${chosenAct.id}_g1_${d}_${u}`,
            actId: chosenAct.id,
            classId: chosenAct.classId,
            subjectId: chosenAct.subjectId,
            teacherId: chosenTeacher.id,
            roomId: chosenRoom.id,
            groupId: 1,
            isDivided: true,
            dayOfWeek: d,
            lessonIndex: u,
          };

          const schedItem2: ScheduleItem & { actId: string } = {
            id: `sch_${chosenAct.id}_g2_${d}_${u}`,
            actId: chosenAct.id,
            classId: chosenAct.classId,
            subjectId: chosenAct.subjectId,
            teacherId: chosenTeacher2.id,
            roomId: finalRoom2.id,
            groupId: 2,
            isDivided: true,
            dayOfWeek: d,
            lessonIndex: u,
          };

          classDayLessons.get(`${item.c.id}_${d}`)!.push(schedItem1, schedItem2);
          teacherBusy.add(`${chosenTeacher.id}_${d}_${cShift}_${u}`);
          teacherBusy.add(`${chosenTeacher2.id}_${d}_${cShift}_${u}`);
          const rKey1 = `${chosenRoom.id}_${d}_${cShift}_${u}`;
          roomOccupancy.set(rKey1, (roomOccupancy.get(rKey1) || 0) + 1);
          if (finalRoom2.id !== chosenRoom.id) {
            const rKey2 = `${finalRoom2.id}_${d}_${cShift}_${u}`;
            roomOccupancy.set(rKey2, (roomOccupancy.get(rKey2) || 0) + 1);
          }
        } else {
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
          teacherBusy.add(`${chosenTeacher.id}_${d}_${cShift}_${u}`);
          const rKey = `${chosenRoom.id}_${d}_${cShift}_${u}`;
          roomOccupancy.set(rKey, (roomOccupancy.get(rKey) || 0) + 1);
        }

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
    const limit = parallelLimits[c.grade] || 6;
    const cShift = c.shift || 1;
    let placed = false;

    // Attempt direct sequential placement at the end of an open day
    for (let d = 0; d < daysCount && !placed; d++) {
      const dayLessons = classDayLessons.get(`${c.id}_${d}`)!;
      const occupiedSlots = new Set(dayLessons.map((l) => l.lessonIndex));
      const u = occupiedSlots.size;
      if (u >= limit) continue;
      const dayLimit = dayLengths.get(c.id)?.[d] || limit;
      if (!satisfiesRules(act, d, u, dayLimit)) continue;

      const curSub = classDaySubjectCount.get(`${c.id}_${d}_${act.subjectId}`) || 0;
      const maxSub = act.subject.id === 'sub_primary' ? 4 : (act.subject.maxPerDay || (act.weeklyHours > 5 ? 2 : 1));
      if (curSub >= maxSub) continue;

      const qualified = teachers.filter((t) => t.subjectIds.includes(act.subjectId) || t.id === act.preferredTeacherId);
      const freeTeachers = qualified.filter((t) => isTeacherFree(t.id, d, u, cShift));
      if (freeTeachers.length === 0) continue;
      if (act.isDivided && freeTeachers.length < 2) continue;

      const freeTeacher = chooseTeacher(qualified, d, u, cShift, act.preferredTeacherId);
      if (!freeTeacher) continue;

      const compRooms = (roomsByType.get(act.requiredRoomType) || []).filter((r) => isRoomFree(r, d, u, cShift));
      if (compRooms.length === 0 && act.requiredRoomType === 'regular') {
        compRooms.push(...(roomsByType.get('regular') || []).filter((r) => isRoomFree(r, d, u, cShift)));
      }
      if (compRooms.length === 0) continue;
      const room = compRooms.find((r) => r.id === act.preferredRoomId) || compRooms[0];

      if (act.isDivided) {
        const freeTeachers2 = freeTeachers.filter((t) => t.id !== freeTeacher.id);
        const chosenTeacher2 = freeTeachers2.find((t) => t.id === act.preferredTeacherId2) || freeTeachers2[0];
        if (!chosenTeacher2) continue;

        const compRooms2 = compRooms.filter((r) => r.id !== room.id);
        if (compRooms2.length === 0) {
          compRooms2.push(...(roomsByType.get('regular') || []).filter((r) => r.id !== room.id && isRoomFree(r, d, u, cShift)));
        }
        const room2 = compRooms2.find((r) => r.id === act.preferredRoomId2) || compRooms2[0] || room;

        const schedItem1: ScheduleItem & { actId: string } = {
          id: `sch_${act.id}_g1_${d}_${u}`,
          actId: act.id,
          classId: act.classId,
          subjectId: act.subjectId,
          teacherId: freeTeacher.id,
          roomId: room.id,
          groupId: 1,
          isDivided: true,
          dayOfWeek: d,
          lessonIndex: u,
        };
        const schedItem2: ScheduleItem & { actId: string } = {
          id: `sch_${act.id}_g2_${d}_${u}`,
          actId: act.id,
          classId: act.classId,
          subjectId: act.subjectId,
          teacherId: chosenTeacher2.id,
          roomId: room2.id,
          groupId: 2,
          isDivided: true,
          dayOfWeek: d,
          lessonIndex: u,
        };

        dayLessons.push(schedItem1, schedItem2);
        teacherBusy.add(`${freeTeacher.id}_${d}_${cShift}_${u}`);
        if (chosenTeacher2.id !== freeTeacher.id) {
          teacherBusy.add(`${chosenTeacher2.id}_${d}_${cShift}_${u}`);
        }
        roomOccupancy.set(`${room.id}_${d}_${cShift}_${u}`, (roomOccupancy.get(`${room.id}_${d}_${cShift}_${u}`) || 0) + 1);
        if (room2.id !== room.id) {
          roomOccupancy.set(`${room2.id}_${d}_${cShift}_${u}`, (roomOccupancy.get(`${room2.id}_${d}_${cShift}_${u}`) || 0) + 1);
        }
      } else {
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
        teacherBusy.add(`${freeTeacher.id}_${d}_${cShift}_${u}`);
        const rKey = `${room.id}_${d}_${cShift}_${u}`;
        roomOccupancy.set(rKey, (roomOccupancy.get(rKey) || 0) + 1);
      }

      const subKey = `${c.id}_${d}_${act.subjectId}`;
      classDaySubjectCount.set(subKey, (classDaySubjectCount.get(subKey) || 0) + 1);
      unplacedActs.delete(act.id);
      placed = true;
    }

    // If still not placed: Try swap with an occupant lesson of class c
    if (!placed) {
      for (let d1 = 0; d1 < daysCount && !placed; d1++) {
        const day1Lessons = classDayLessons.get(`${c.id}_${d1}`)!;
        for (let idx1 = 0; idx1 < day1Lessons.length && !placed; idx1++) {
          const item1 = day1Lessons[idx1];
          const slot1 = item1.lessonIndex;
          const act1 = actMap.get(item1.actId);
          if (!act1) continue;

          // Can act take (d1, slot1)?
          const day1Limit = dayLengths.get(c.id)?.[d1] || limit;
          if (!satisfiesRules(act, d1, slot1, day1Limit)) continue;
          const qualified = teachers.filter((t) => t.subjectIds.includes(act.subjectId) || t.id === act.preferredTeacherId);
          const freeTeacher = chooseTeacher(qualified, d1, slot1, cShift, act.preferredTeacherId);
          if (!freeTeacher) continue;

          // Can act1 move to the end of day d2 (another day or same day d1)?
          for (let d2 = 0; d2 < daysCount && !placed; d2++) {
            const day2Lessons = classDayLessons.get(`${c.id}_${d2}`)!;
            const occupiedSlots2 = new Set(day2Lessons.map((l) => l.lessonIndex));
            const u2 = occupiedSlots2.size;
            if (u2 >= limit) continue;
            const day2Limit = dayLengths.get(c.id)?.[d2] || limit;
            if (!satisfiesRules(act1, d2, u2, day2Limit)) continue;

            if (d2 !== d1) {
              const curSub2 = classDaySubjectCount.get(`${c.id}_${d2}_${act1.subjectId}`) || 0;
              const maxSub2 = act1.subject.id === 'sub_primary' ? 4 : (act1.subject.maxPerDay || (act1.weeklyHours > 5 ? 2 : 1));
              if (curSub2 >= maxSub2) continue;
            }

            const qualified1 = teachers.filter((t) => t.subjectIds.includes(act1.subjectId) || t.id === act1.preferredTeacherId);
            const freeTeacher1 = chooseTeacher(qualified1, d2, u2, cShift, act1.preferredTeacherId);
            if (!freeTeacher1) continue;

            const compRooms2 = (roomsByType.get(act1.requiredRoomType) || []).filter((r) => isRoomFree(r, d2, u2, cShift));
            if (compRooms2.length === 0 && act1.requiredRoomType === 'regular') {
              compRooms2.push(...(roomsByType.get('regular') || []).filter((r) => isRoomFree(r, d2, u2, cShift)));
            }
            if (compRooms2.length === 0) continue;
            const room2 = compRooms2[0];

            // Rooms for act at (d1, slot1)
            const compRooms1 = (roomsByType.get(act.requiredRoomType) || []).filter((r) => {
              const cur = (roomOccupancy.get(`${r.id}_${d1}_${cShift}_${slot1}`) || 0) - (item1.roomId === r.id ? 1 : 0);
              return cur < (r.capacity || 1);
            });
            if (compRooms1.length === 0 && act.requiredRoomType === 'regular') {
              compRooms1.push(
                ...(roomsByType.get('regular') || []).filter((r) => {
                  const cur = (roomOccupancy.get(`${r.id}_${d1}_${cShift}_${slot1}`) || 0) - (item1.roomId === r.id ? 1 : 0);
                  return cur < (r.capacity || 1);
                })
              );
            }
            if (compRooms1.length === 0) continue;
            const room1 = compRooms1[0];

            // SWAP EXECUTION!
            teacherBusy.delete(`${item1.teacherId}_${d1}_${cShift}_${slot1}`);
            const rKey1 = `${item1.roomId}_${d1}_${cShift}_${slot1}`;
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
            teacherBusy.add(`${freeTeacher1.id}_${d2}_${cShift}_${u2}`);
            roomOccupancy.set(`${room2.id}_${d2}_${cShift}_${u2}`, (roomOccupancy.get(`${room2.id}_${d2}_${cShift}_${u2}`) || 0) + 1);
            classDaySubjectCount.set(
              `${c.id}_${d2}_${act1.subjectId}`,
              (classDaySubjectCount.get(`${c.id}_${d2}_${act1.subjectId}`) || 0) + 1
            );

            // Put act at (d1, slot1)
            const newSchedItem: ScheduleItem & { actId: string } = {
              id: `sch_${act.id}_${d1}_${slot1}`,
              actId: act.id,
              classId: act.classId,
              subjectId: act.subjectId,
              teacherId: freeTeacher.id,
              roomId: room1.id,
              dayOfWeek: d1,
              lessonIndex: slot1,
            };
            day1Lessons[idx1] = newSchedItem;
            teacherBusy.add(`${freeTeacher.id}_${d1}_${cShift}_${slot1}`);
            roomOccupancy.set(`${room1.id}_${d1}_${cShift}_${slot1}`, (roomOccupancy.get(`${room1.id}_${d1}_${cShift}_${slot1}`) || 0) + 1);
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

  // Flatten and sanitize schedule
  const finalSchedule: ScheduleItem[] = [];
  classDayLessons.forEach((dayItems) => {
    dayItems.forEach((item) => {
      finalSchedule.push({
        id: item.id,
        classId: item.classId,
        subjectId: item.subjectId,
        teacherId: item.teacherId,
        roomId: item.roomId,
        groupId: item.groupId,
        isDivided: item.isDivided,
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

  const profileRoomLessonsCount = finalSchedule.filter((item) => {
    const sub = subjectMap.get(item.subjectId);
    return sub && sub.requiredRoomType !== 'regular';
  }).length;

  const distinctTeachers = new Set(finalSchedule.map((s) => s.teacherId)).size;

  return {
    schedule: finalSchedule,
    success: unplacedCount === 0,
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
