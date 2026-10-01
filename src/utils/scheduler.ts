import { AppState, ScheduleItem, Subject, Teacher, Room, SchoolClass } from '../types/schedule';

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
}

interface RequiredLesson {
  id: string;
  classId: string;
  subjectId: string;
  teacherId: string;
  preferredRoomId?: string;
  subject: Subject;
  classObj: SchoolClass;
  difficulty: number;
  isProfileRoom: boolean;
}

export function generateSchedule(state: AppState): GenerationResult {
  const startTime = performance.now();
  const { classes, subjects, teachers, rooms, curriculum, parallelLimits, settings, constraints = [] } = state;
  const daysCount = settings.daysPerWeek; // 5 or 6
  const maxSlot = settings.maxLessonsGlobal; // e.g. 7 or 8

  const activeConstraints = constraints.filter((c) => c.enabled);

  const getLessonRules = (l: RequiredLesson) => {
    return activeConstraints.filter(
      (c) =>
        c.subjectId === l.subjectId &&
        (!c.classId || c.classId === 'all' || c.classId === l.classId)
    );
  };

  const warnings: string[] = [];

  const subjectMap = new Map<string, Subject>(subjects.map((s) => [s.id, s]));
  const classMap = new Map<string, SchoolClass>(classes.map((c) => [c.id, c]));
  const teacherMap = new Map<string, Teacher>(teachers.map((t) => [t.id, t]));
  const roomMap = new Map<string, Room>(rooms.map((r) => [r.id, r]));

  // Build list of all individual lessons required by curriculum
  const requiredLessons: RequiredLesson[] = [];
  curriculum.forEach((item) => {
    const classObj = classMap.get(item.classId);
    const subject = subjectMap.get(item.subjectId);
    if (!classObj || !subject) return;

    // Determine teacher
    let teacherId = item.teacherId;
    const assignedTeacher = teacherId ? teacherMap.get(teacherId) : undefined;
    if (!assignedTeacher || !assignedTeacher.subjectIds.includes(subject.id)) {
      // Find suitable teacher
      const qualified = teachers.find((t) => t.subjectIds.includes(subject.id));
      if (qualified) {
        teacherId = qualified.id;
      } else {
        warnings.push(`Не назначен учитель для предмета "${subject.name}" в классе ${classObj.name}`);
        return;
      }
    }

    if (!teacherId) return;

    const isProfile = subject.requiredRoomType !== 'regular';

    for (let i = 0; i < item.hoursPerWeek; i++) {
      requiredLessons.push({
        id: `${item.classId}_${item.subjectId}_${i}`,
        classId: item.classId,
        subjectId: item.subjectId,
        teacherId,
        preferredRoomId: item.preferredRoomId,
        subject,
        classObj,
        difficulty: subject.difficulty || 5,
        isProfileRoom: isProfile,
      });
    }
  });

  const totalRequired = requiredLessons.length;

  classes.forEach((schoolClass) => {
    const requiredForClass = requiredLessons.filter((lesson) => lesson.classId === schoolClass.id).length;
    const dailyLimit = Math.min(parallelLimits[schoolClass.grade] || 6, maxSlot);
    const weeklyCapacity = daysCount * dailyLimit;
    if (requiredForClass > weeklyCapacity) {
      warnings.push(
        `Учебный план класса ${schoolClass.name} содержит ${requiredForClass} уроков при доступной вместимости ${weeklyCapacity}. Увеличьте число учебных дней или дневной лимит.`
      );
    }
  });

  // Rooms categorized
  const roomsByType = new Map<string, Room[]>();
  rooms.forEach((r) => {
    if (!roomsByType.has(r.type)) roomsByType.set(r.type, []);
    roomsByType.get(r.type)!.push(r);
  });

  // Schedule representation:
  // Key: `${day}_${slot}`
  // For each class: classDayLessons[classId][day] = Array of lesson items in slots 0, 1, 2...
  // This GUARANTEES zero student windows: lessons for a class on day D always fill contiguous slots 0..count-1!
  const classDayLessons = new Map<string, (ScheduleItem | null)[][]>();
  classes.forEach((c) => {
    const dayGrid: (ScheduleItem | null)[][] = [];
    for (let d = 0; d < daysCount; d++) {
      dayGrid[d] = []; // will be filled contiguously
    }
    classDayLessons.set(c.id, dayGrid);
  });

  // Teacher occupancy: teacherOccupancy.get(`${teacherId}_${day}_${slot}`) = true
  const teacherOccupied = new Set<string>();

  // Room occupancy: roomOccupancy.get(`${roomId}_${day}_${slot}`) = count of classes in room
  const roomOccupancy = new Map<string, number>();

  const isRoomAvailable = (room: Room, day: number, slot: number): boolean => {
    const key = `${room.id}_${day}_${slot}`;
    const current = roomOccupancy.get(key) || 0;
    return current < (room.capacity || 1);
  };

  const occupyRoom = (room: Room, day: number, slot: number) => {
    const key = `${room.id}_${day}_${slot}`;
    roomOccupancy.set(key, (roomOccupancy.get(key) || 0) + 1);
  };

  const releaseRoom = (room: Room, day: number, slot: number) => {
    const key = `${room.id}_${day}_${slot}`;
    const curr = roomOccupancy.get(key) || 0;
    if (curr > 1) {
      roomOccupancy.set(key, curr - 1);
    } else {
      roomOccupancy.delete(key);
    }
  };

  const isTeacherAvailable = (teacherId: string, day: number, slot: number): boolean => {
    return !teacherOccupied.has(`${teacherId}_${day}_${slot}`);
  };

  const occupyTeacher = (teacherId: string, day: number, slot: number) => {
    teacherOccupied.add(`${teacherId}_${day}_${slot}`);
  };

  const releaseTeacher = (teacherId: string, day: number, slot: number) => {
    teacherOccupied.delete(`${teacherId}_${day}_${slot}`);
  };

  // Find suitable room for a lesson at (day, slot)
  const findAvailableRoom = (lesson: RequiredLesson, day: number, slot: number): Room | null => {
    const reqType = lesson.subject.requiredRoomType;

    // If teacher has preferred room and it's compatible
    if (reqType === 'regular' && lesson.teacherId) {
      const teacher = teacherMap.get(lesson.teacherId);
      if (teacher?.preferredRoomId) {
        const prefRoom = roomMap.get(teacher.preferredRoomId);
        if (prefRoom && prefRoom.type === reqType && isRoomAvailable(prefRoom, day, slot)) {
          return prefRoom;
        }
      }
    }

    // If class has homeroom and it's compatible
    if (reqType === 'regular' && lesson.classObj.homeroomRoomId) {
      const homeRoom = roomMap.get(lesson.classObj.homeroomRoomId);
      if (homeRoom && homeRoom.type === reqType && isRoomAvailable(homeRoom, day, slot)) {
        return homeRoom;
      }
    }

    // Try available rooms of required type
    const candidateRooms = roomsByType.get(reqType) || [];
    for (const r of candidateRooms) {
      if (isRoomAvailable(r, day, slot)) {
        return r;
      }
    }

    // Fallback for regular: any regular room
    if (reqType === 'regular') {
      const regularRooms = roomsByType.get('regular') || [];
      for (const r of regularRooms) {
        if (isRoomAvailable(r, day, slot)) {
          return r;
        }
      }
    }

    return null;
  };

  const getQualifiedTeachers = (lesson: RequiredLesson): Teacher[] =>
    teachers
      .filter((teacher) => teacher.subjectIds.includes(lesson.subjectId))
      .sort((a, b) => {
        const loadA = scheduledItems.filter((item) => item.teacherId === a.id).length;
        const loadB = scheduledItems.filter((item) => item.teacherId === b.id).length;
        return loadA - loadB || (a.id === lesson.teacherId ? -1 : 0) - (b.id === lesson.teacherId ? -1 : 0);
      });

  // Sorting required lessons by MRV (Most Constrained First):
  // 0. User constraints / rules first
  // 1. Gym lessons (most bottlenecked resource)
  // 2. IT & Labs
  // 3. High difficulty subjects
  // 4. Large classes
  requiredLessons.sort((a, b) => {
    // 0. Constraints check
    const rulesA = getLessonRules(a).length > 0 ? 500 : 0;
    const rulesB = getLessonRules(b).length > 0 ? 500 : 0;
    if (rulesA !== rulesB) return rulesB - rulesA;

    // 1. Profile rooms first (gym, it, labs)
    const profileScoreA = a.subject.requiredRoomType === 'gym' ? 100 : a.isProfileRoom ? 50 : 0;
    const profileScoreB = b.subject.requiredRoomType === 'gym' ? 100 : b.isProfileRoom ? 50 : 0;
    if (profileScoreA !== profileScoreB) return profileScoreB - profileScoreA;

    // 2. High difficulty next
    if (b.difficulty !== a.difficulty) return b.difficulty - a.difficulty;

    // 3. Subject with fewer qualified teachers
    const qualifiedA = teachers.filter((t) => t.subjectIds.includes(a.subjectId)).length;
    const qualifiedB = teachers.filter((t) => t.subjectIds.includes(b.subjectId)).length;
    if (qualifiedA !== qualifiedB) return qualifiedA - qualifiedB;

    return 0;
  });

  const scheduledItems: ScheduleItem[] = [];
  const unplacedLessons: RequiredLesson[] = [];

  // Group lessons by class
  const classLessonsMap = new Map<string, RequiredLesson[]>();
  classes.forEach((c) => classLessonsMap.set(c.id, []));
  requiredLessons.forEach((l) => classLessonsMap.get(l.classId)?.push(l));

  // Helper to get current day lesson count for a class
  const getClassDayCount = (classId: string, day: number): number => {
    return classDayLessons.get(classId)?.[day]?.length || 0;
  };

  // Helper to count how many times subject is already placed on day for this class
  const getSubjectCountOnDay = (classId: string, subjectId: string, day: number): number => {
    const list = classDayLessons.get(classId)?.[day] || [];
    return list.filter((item) => item?.subjectId === subjectId).length;
  };

  // Helper to get total daily limit for parallel
  const getParallelLimit = (grade: number): number => {
    return parallelLimits[grade] || 6;
  };

  // MAIN PLACEMENT PASS:
  // For each class, distribute lessons across days
  // We process in rounds: Gym/Labs first across all classes, then other subjects
  const allSortedLessons = [...requiredLessons];

  for (const lesson of allSortedLessons) {
    const classId = lesson.classId;
    const grade = lesson.classObj.grade;
    const limit = Math.min(getParallelLimit(grade), maxSlot);

    // Find the best day and slot for this lesson
    // Criteria for candidate day:
    // 1. Current day lessons count < limit
    // 2. The next contiguous slot (slot = count) has teacher FREE and room FREE
    // 3. Subject not already exceeded daily max (usually 1, math/rus 2)
    // 4. Balance: prefer days with fewer lessons so far and lower SanPiN score
    type Candidate = {
      day: number;
      slot: number;
      room: Room;
      score: number;
      teacherId: string;
    };

    const candidates: Candidate[] = [];

    const rules = getLessonRules(lesson);

    for (let day = 0; day < daysCount; day++) {
      // If rule requires specific day (only_on_day, fixed_slot, day_first, day_last)
      const dayRule = rules.find(
        (r) =>
          r.dayOfWeek !== undefined &&
          (r.conditionType === 'only_on_day' ||
            r.conditionType === 'fixed_slot' ||
            r.conditionType === 'day_first' ||
            r.conditionType === 'day_last')
      );
      if (dayRule && day !== dayRule.dayOfWeek) {
        continue;
      }

      const currentLessons = classDayLessons.get(classId)![day];
      const fixedRule = rules.find((r) => r.conditionType === 'fixed_slot');
      const slot = fixedRule?.lessonIndex ?? currentLessons.length;
      if (fixedRule && (fixedRule.dayOfWeek !== day || slot !== currentLessons.length)) continue;

      if (slot >= limit) continue;

      // Subject daily count check
      const currentSubjCount = getSubjectCountOnDay(classId, lesson.subjectId, day);
      if (currentSubjCount >= lesson.subject.maxPerDay) continue;

      for (const teacher of getQualifiedTeachers(lesson)) {
        if (!isTeacherAvailable(teacher.id, day, slot)) continue;

        const room = findAvailableRoom({ ...lesson, teacherId: teacher.id }, day, slot);
        if (!room) continue;

        // Calculate score for ranking candidates:
        // Lower score = better
        // Prioritize days with fewer lessons to balance the week evenly
        let score = slot * 10;

      // Rule: prioritize slot 0 for always_first / day_first
      const firstRule = rules.find(
        (r) =>
          r.conditionType === 'always_first' ||
          (r.conditionType === 'day_first' && r.dayOfWeek === day) ||
          (r.conditionType === 'fixed_slot' && r.dayOfWeek === day && r.lessonIndex === 0)
      );
        if (firstRule) {
          if (slot === 0) score -= 500;
          else score += 150;
        }

      // Rule: prioritize later slot for always_last / day_last
      const lastRule = rules.find(
        (r) =>
          r.conditionType === 'always_last' ||
          (r.conditionType === 'day_last' && r.dayOfWeek === day)
      );
        if (lastRule) {
          score -= slot * 20;
        }

      // Penalize having same subject on this day (if allowed 2)
        if (currentSubjCount > 0) score += 25;

      // SanPiN load balance: slightly prefer mid-week (Tue, Wed, Thu) for high difficulty, Mon/Fri for lighter
        if (settings.balanceSanpinDifficulty) {
          if (lesson.difficulty >= 10 && (day === 1 || day === 2 || day === 3)) {
            score -= 5;
          } else if (lesson.difficulty <= 4 && (day === 0 || day === 4)) {
            score -= 5;
          }
        }

        candidates.push({ day, slot, room, score, teacherId: teacher.id });
      }
    }

    if (candidates.length > 0) {
      // Pick best candidate
      candidates.sort((a, b) => a.score - b.score);
      const chosen = candidates[0];

      // Place lesson
      const scheduleItem: ScheduleItem = {
        id: `sch_${lesson.id}`,
        dayOfWeek: chosen.day,
        lessonIndex: chosen.slot,
        classId: lesson.classId,
        subjectId: lesson.subjectId,
        teacherId: chosen.teacherId,
        roomId: chosen.room.id,
      };

      classDayLessons.get(classId)![chosen.day].push(scheduleItem);
      occupyTeacher(chosen.teacherId, chosen.day, chosen.slot);
      occupyRoom(chosen.room, chosen.day, chosen.slot);
      scheduledItems.push(scheduleItem);
    } else {
      // Direct contiguous append failed; let's attempt local swap repair
      let placedViaSwap = false;

      // Try to find a non-profile regular lesson in this class that can be swapped with another day
      const classGrid = classDayLessons.get(classId)!;
      for (let day = 0; day < daysCount && !placedViaSwap; day++) {
        const slot = classGrid[day].length;
        if (slot >= limit) continue;

        // Try to swap an existing lesson of a conflicting teacher with another slot
        // For simplicity and speed: if direct append failed, queue for unplaced
      }

      if (!placedViaSwap) {
        unplacedLessons.push(lesson);
      }
    }
  }

  // SECOND-CHANCE SOLVER: rebuild only classes that lost lessons in the
  // greedy pass. The solver uses bounded backtracking, so a late lesson can
  // move an earlier lesson to another valid day instead of being discarded.
  const rebuildIndexes = () => {
    teacherOccupied.clear();
    roomOccupancy.clear();
    classDayLessons.forEach((grid) => grid.forEach((day) => day.splice(0, day.length)));

    for (const item of scheduledItems) {
      classDayLessons.get(item.classId)?.[item.dayOfWeek].push(item);
      occupyTeacher(item.teacherId, item.dayOfWeek, item.lessonIndex);
      const room = roomMap.get(item.roomId);
      if (room) occupyRoom(room, item.dayOfWeek, item.lessonIndex);
    }

    classDayLessons.forEach((grid) =>
      grid.forEach((day) => day.sort((a, b) => (a?.lessonIndex ?? 0) - (b?.lessonIndex ?? 0)))
    );
  };

  const getBacktrackingRooms = (lesson: RequiredLesson, teacherId: string, day: number, slot: number): Room[] => {
    const reqType = lesson.subject.requiredRoomType;
    const available = (roomsByType.get(reqType) || []).filter((room) => isRoomAvailable(room, day, slot));
    const preferredIds = [
      lesson.preferredRoomId,
      teacherMap.get(teacherId)?.preferredRoomId,
      lesson.classObj.homeroomRoomId,
    ].filter((id): id is string => Boolean(id));

    return available.sort((a, b) => {
      const aPriority = preferredIds.indexOf(a.id);
      const bPriority = preferredIds.indexOf(b.id);
      return (aPriority < 0 ? Number.MAX_SAFE_INTEGER : aPriority) -
        (bPriority < 0 ? Number.MAX_SAFE_INTEGER : bPriority);
    });
  };

  const rebuildClassWithBacktracking = (classId: string): boolean => {
    const classObj = classMap.get(classId);
    if (!classObj) return false;

    const classLessons = requiredLessons.filter((lesson) => lesson.classId === classId);
    const previousItems = scheduledItems.filter((item) => item.classId === classId);
    const remainingItems = scheduledItems.filter((item) => item.classId !== classId);
    scheduledItems.splice(0, scheduledItems.length, ...remainingItems);
    rebuildIndexes();

    type Placement = { lesson: RequiredLesson; teacherId: string; day: number; slot: number; room: Room };
    let nodes = 0;
    const nodeLimit = 120000;
    const placements: Placement[] = [];

    const getCandidates = (lesson: RequiredLesson): Placement[] => {
      const rules = getLessonRules(lesson);
      const fixedRule = rules.find((rule) => rule.conditionType === 'fixed_slot');
      const dayRule = rules.find(
        (rule) =>
          rule.dayOfWeek !== undefined &&
          ['only_on_day', 'fixed_slot', 'day_first', 'day_last'].includes(rule.conditionType)
      );
      const days = fixedRule?.dayOfWeek !== undefined
        ? [fixedRule.dayOfWeek]
        : dayRule?.dayOfWeek !== undefined && dayRule.conditionType !== 'always_first'
          ? [dayRule.dayOfWeek]
          : Array.from({ length: daysCount }, (_, day) => day);
      const result: Placement[] = [];
      const limit = Math.min(getParallelLimit(classObj.grade), maxSlot);

      for (const day of days) {
        if (day < 0 || day >= daysCount) continue;
        const dayLessons = classDayLessons.get(classId)![day];
        const slot = fixedRule?.lessonIndex ?? dayLessons.length;
        if (slot !== dayLessons.length || slot >= limit) continue;
        if (getSubjectCountOnDay(classId, lesson.subjectId, day) >= lesson.subject.maxPerDay) continue;

        const teacherOptions = teachers
          .filter((teacher) => teacher.subjectIds.includes(lesson.subjectId))
          .sort((a, b) => {
            const loadA = scheduledItems.filter((item) => item.teacherId === a.id).length;
            const loadB = scheduledItems.filter((item) => item.teacherId === b.id).length;
            return loadA - loadB;
          });

        for (const teacher of teacherOptions) {
          if (!isTeacherAvailable(teacher.id, day, slot)) continue;
          for (const room of getBacktrackingRooms(lesson, teacher.id, day, slot)) {
            result.push({ lesson, teacherId: teacher.id, day, slot, room });
          }
        }
      }
      return result;
    };

    const search = (remaining: RequiredLesson[]): boolean => {
      if (remaining.length === 0) return true;
      if (++nodes > nodeLimit) return false;

      // MRV: branch first on the lesson with the fewest legal placements.
      let selectedIndex = -1;
      let selectedCandidates: Placement[] = [];
      for (let index = 0; index < remaining.length; index++) {
        const candidates = getCandidates(remaining[index]);
        if (selectedIndex < 0 || candidates.length < selectedCandidates.length) {
          selectedIndex = index;
          selectedCandidates = candidates;
          if (candidates.length === 0) return false;
          if (candidates.length === 1) break;
        }
      }

      const lesson = remaining[selectedIndex];
      const nextRemaining = remaining.filter((_, index) => index !== selectedIndex);
      for (const candidate of selectedCandidates) {
        const item: ScheduleItem = {
          id: `sch_${candidate.lesson.id}`,
          dayOfWeek: candidate.day,
          lessonIndex: candidate.slot,
          classId: candidate.lesson.classId,
          subjectId: candidate.lesson.subjectId,
          teacherId: candidate.teacherId,
          roomId: candidate.room.id,
        };
        classDayLessons.get(classId)![candidate.day].push(item);
        scheduledItems.push(item);
        occupyTeacher(item.teacherId, item.dayOfWeek, item.lessonIndex);
        occupyRoom(candidate.room, item.dayOfWeek, item.lessonIndex);
        placements.push(candidate);

        if (search(nextRemaining)) return true;

        placements.pop();
        scheduledItems.pop();
        classDayLessons.get(classId)![candidate.day].pop();
        releaseTeacher(item.teacherId, item.dayOfWeek, item.lessonIndex);
        releaseRoom(candidate.room, item.dayOfWeek, item.lessonIndex);
      }
      return false;
    };

    if (search(classLessons)) {
      return true;
    }

    // Restore the class if the bounded search could not find a solution.
    scheduledItems.splice(0, scheduledItems.length, ...remainingItems, ...previousItems);
    rebuildIndexes();
    return false;
  };

  const classesNeedingRepair = [...new Set(unplacedLessons.map((lesson) => lesson.classId))];
  for (const classId of classesNeedingRepair) {
    rebuildClassWithBacktracking(classId);
  }

  // SECOND PASS: Local Repair / Insertion for unplaced lessons
  const unresolvedAfterBacktracking = unplacedLessons.filter(
    (lesson) => !scheduledItems.some((item) => item.id === `sch_${lesson.id}` || item.id === `sch_repair_${lesson.id}`)
  );
  let stillUnplacedCount = 0;
  if (unresolvedAfterBacktracking.length > 0) {
    const stillUnplaced: RequiredLesson[] = [];

    for (const lesson of unresolvedAfterBacktracking) {
      const classId = lesson.classId;
      const grade = lesson.classObj.grade;
      const limit = Math.min(getParallelLimit(grade), maxSlot);
      let placed = false;

      // Try relaxing subject daily max limit if critical
      for (let day = 0; day < daysCount && !placed; day++) {
        const currentLessons = classDayLessons.get(classId)![day];
        const slot = currentLessons.length;
        if (slot >= limit) continue;

        if (!isTeacherAvailable(lesson.teacherId, day, slot)) continue;
        const room = findAvailableRoom(lesson, day, slot);
        if (!room) continue;

        const scheduleItem: ScheduleItem = {
          id: `sch_repair_${lesson.id}`,
          dayOfWeek: day,
          lessonIndex: slot,
          classId: lesson.classId,
          subjectId: lesson.subjectId,
          teacherId: lesson.teacherId,
          roomId: room.id,
        };

        classDayLessons.get(classId)![day].push(scheduleItem);
        occupyTeacher(lesson.teacherId, day, slot);
        occupyRoom(room, day, slot);
        scheduledItems.push(scheduleItem);
        placed = true;
      }

      if (!placed) {
        stillUnplaced.push(lesson);
      }
    }

    stillUnplacedCount = stillUnplaced.length;
    if (stillUnplaced.length > 0) {
      warnings.push(`Не удалось разместить ${stillUnplaced.length} уроков из-за предельной загрузки учителей или кабинетов.`);
    }
  }

  // POST-PROCESSING: Enforce first/last lesson constraints by swapping within the day
  activeConstraints.forEach((rule) => {
    if (rule.conditionType === 'always_first' || rule.conditionType === 'day_first') {
      const targetClasses = (!rule.classId || rule.classId === 'all')
        ? classes
        : classes.filter((c) => c.id === rule.classId);

      targetClasses.forEach((cls) => {
        for (let d = 0; d < daysCount; d++) {
          if (rule.conditionType === 'day_first' && rule.dayOfWeek !== undefined && d !== rule.dayOfWeek) continue;

          const dayItems = scheduledItems.filter((s) => s.classId === cls.id && s.dayOfWeek === d);
          const targetItem = dayItems.find((s) => s.subjectId === rule.subjectId);
          const slot0Item = dayItems.find((s) => s.lessonIndex === 0);

          if (targetItem && slot0Item && targetItem.id !== slot0Item.id) {
            const oldSlot = targetItem.lessonIndex;
            targetItem.lessonIndex = 0;
            slot0Item.lessonIndex = oldSlot;
          }
        }
      });
    }

    if (rule.conditionType === 'always_last' || rule.conditionType === 'day_last') {
      const targetClasses = (!rule.classId || rule.classId === 'all')
        ? classes
        : classes.filter((c) => c.id === rule.classId);

      targetClasses.forEach((cls) => {
        for (let d = 0; d < daysCount; d++) {
          if (rule.conditionType === 'day_last' && rule.dayOfWeek !== undefined && d !== rule.dayOfWeek) continue;

          const dayItems = scheduledItems.filter((s) => s.classId === cls.id && s.dayOfWeek === d);
          if (dayItems.length === 0) continue;
          const maxSlot = Math.max(...dayItems.map((s) => s.lessonIndex));
          const targetItem = dayItems.find((s) => s.subjectId === rule.subjectId);
          const lastItem = dayItems.find((s) => s.lessonIndex === maxSlot);

          if (targetItem && lastItem && targetItem.id !== lastItem.id) {
            const oldSlot = targetItem.lessonIndex;
            targetItem.lessonIndex = maxSlot;
            lastItem.lessonIndex = oldSlot;
          }
        }
      });
    }
  });

  const endTime = performance.now();
  const timeMs = Math.round(endTime - startTime);

  // Compute metrics
  const profileCount = scheduledItems.filter((item) => {
    const s = subjectMap.get(item.subjectId);
    return s && s.requiredRoomType !== 'regular';
  }).length;

  const totalClasses = classes.length;
  const avgLessonsPerDay = totalClasses > 0 ? +(scheduledItems.length / (totalClasses * daysCount)).toFixed(1) : 0;

  return {
    schedule: scheduledItems,
    success: stillUnplacedCount === 0,
    unplacedCount: stillUnplacedCount,
    totalRequired,
    timeMs,
    metrics: {
      totalLessons: scheduledItems.length,
      classesCount: totalClasses,
      teachersCount: teachers.length,
      profileRoomLessonsCount: profileCount,
      averageLessonsPerDay: avgLessonsPerDay,
    },
    warnings,
  };
}
