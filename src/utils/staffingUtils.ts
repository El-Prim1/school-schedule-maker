import { Subject, SchoolClass, Teacher, CurriculumItem, AppState } from '../types/schedule';

/**
 * Default standard workload per teacher in hours per week
 */
export const STANDARD_TEACHER_HOURS = 24;

/**
 * Returns a deterministic anonymous teacher ID for a subject, shift and index
 */
export function getAnonymousTeacherId(subjectId: string, shift: 1 | 2, index: number): string {
  return `tch_${subjectId}_s${shift}_${index + 1}`;
}

/**
 * Returns a deterministic anonymous homeroom teacher ID for a class
 */
export function getHomeroomTeacherId(classId: string): string {
  return `tch_homeroom_${classId}`;
}

/**
 * Synchronizes the anonymous teacher roster based on subject staffing counts and school classes.
 */
export function syncAnonymousTeachers(
  subjects: Subject[],
  classes: SchoolClass[],
  existingTeachers: Teacher[] = []
): Teacher[] {
  const teacherMap = new Map<string, Teacher>(existingTeachers.map((t) => [t.id, t]));
  const result: Teacher[] = [];

  // 1. Generate anonymous subject teachers for Shift 1 and Shift 2
  subjects.forEach((sub) => {
    const count1 = sub.teachersShift1 !== undefined ? sub.teachersShift1 : 1;
    const count2 = sub.teachersShift2 !== undefined ? sub.teachersShift2 : 0;

    // Shift 1 teachers
    for (let i = 0; i < count1; i++) {
      const id = getAnonymousTeacherId(sub.id, 1, i);
      const existing = teacherMap.get(id);
      result.push({
        id,
        name: `Учитель: ${sub.name} №${i + 1} (1-я смена)`,
        shortName: `${sub.shortName} №${i + 1} (1 см)`,
        subjectIds: [sub.id],
        maxHoursPerWeek: existing?.maxHoursPerWeek || STANDARD_TEACHER_HOURS,
        color: sub.color,
        shift: 1,
        preferredRoomId: existing?.preferredRoomId,
      });
    }

    // Shift 2 teachers
    for (let i = 0; i < count2; i++) {
      const id = getAnonymousTeacherId(sub.id, 2, i);
      const existing = teacherMap.get(id);
      result.push({
        id,
        name: `Учитель: ${sub.name} №${i + 1} (2-я смена)`,
        shortName: `${sub.shortName} №${i + 1} (2 см)`,
        subjectIds: [sub.id],
        maxHoursPerWeek: existing?.maxHoursPerWeek || STANDARD_TEACHER_HOURS,
        color: sub.color,
        shift: 2,
        preferredRoomId: existing?.preferredRoomId,
      });
    }
  });

  // 2. Generate automatic anonymous homeroom teacher for each class
  classes.forEach((cls) => {
    const id = getHomeroomTeacherId(cls.id);
    const existing = teacherMap.get(id);
<<<<<<< HEAD
    const isPrimary = cls.grade <= 4;
    result.push({
      id,
      name: isPrimary ? `Классный руководитель (${cls.name}) – нач. классы` : `Классный руководитель (${cls.name})`,
      shortName: isPrimary ? `Учит. ${cls.name}` : `Кл. рук. ${cls.name}`,
      subjectIds: isPrimary ? ['sub_primary'] : [],
=======
    result.push({
      id,
      name: `Классный руководитель (${cls.name})`,
      shortName: `Кл. рук. ${cls.name}`,
      subjectIds: [],
>>>>>>> 12cec5f6903649a2bd06de8b53bab6dd58370adb
      maxHoursPerWeek: existing?.maxHoursPerWeek || 30,
      shift: cls.shift,
      isHomeroom: true,
      homeroomClassId: cls.id,
      preferredRoomId: cls.homeroomRoomId,
    });
  });

  return result;
}

/**
 * Calculates curriculum hours and staffing load for a subject in both shifts
 */
export function getSubjectStaffingMetrics(
  subjectId: string,
  curriculum: CurriculumItem[],
  classes: SchoolClass[],
  subjects: Subject[]
) {
  const sub = subjects.find((s) => s.id === subjectId);
  const classMap = new Map(classes.map((c) => [c.id, c]));

  let hoursShift1 = 0;
  let hoursShift2 = 0;

  curriculum.forEach((item) => {
    if (item.subjectId !== subjectId) return;
    const cls = classMap.get(item.classId);
    if (!cls) return;
    if (cls.shift === 2) {
      hoursShift2 += item.hoursPerWeek;
    } else {
      hoursShift1 += item.hoursPerWeek;
    }
  });

  const teachersShift1 = sub?.teachersShift1 !== undefined ? sub.teachersShift1 : 1;
  const teachersShift2 = sub?.teachersShift2 !== undefined ? sub.teachersShift2 : 0;

  const capacity1 = teachersShift1 * STANDARD_TEACHER_HOURS;
  const capacity2 = teachersShift2 * STANDARD_TEACHER_HOURS;

  const recommended1 = Math.max(1, Math.ceil(hoursShift1 / STANDARD_TEACHER_HOURS));
  const recommended2 = hoursShift2 > 0 ? Math.max(1, Math.ceil(hoursShift2 / STANDARD_TEACHER_HOURS)) : 0;

  const isDeficit1 = hoursShift1 > capacity1;
  const isDeficit2 = hoursShift2 > capacity2;

  return {
    hoursShift1,
    hoursShift2,
    totalHours: hoursShift1 + hoursShift2,
    teachersShift1,
    teachersShift2,
    totalTeachers: teachersShift1 + teachersShift2,
    capacity1,
    capacity2,
    recommended1,
    recommended2,
    isDeficit1,
    isDeficit2,
    hasDeficit: isDeficit1 || isDeficit2,
  };
}

/**
<<<<<<< HEAD
 * Automatically assigns teachers to curriculum items adhering to pedagogical pairing rules:
 * - Russian Language and Russian Literature are taught by the SAME teacher in each class.
 * - In grades 7-11, Algebra and Geometry are taught by the SAME teacher.
 * - In grades 1-6, Mathematics is taught by middle/junior math teachers.
 * - Shift 2 classes (2, 3, 6, 7) are taught by Shift 2 or dual-shift teachers.
 * - Shift 1 classes are taught by Shift 1 or dual-shift teachers.
 * - Workload is balanced across candidate teachers.
 */
export function autoAssignTeachers(
  curriculum: CurriculumItem[],
  classes: SchoolClass[],
  subjects: Subject[],
  teachers: Teacher[]
): CurriculumItem[] {
  const teacherLoadMap = new Map<string, number>();
  teachers.forEach((t) => teacherLoadMap.set(t.id, 0));

  const classMap = new Map(classes.map((c) => [c.id, c]));
  const result: CurriculumItem[] = [];

  // Group curriculum items by class
  const classCurriculumMap = new Map<string, CurriculumItem[]>();
  classes.forEach((c) => classCurriculumMap.set(c.id, []));
  curriculum.forEach((item) => {
    const list = classCurriculumMap.get(item.classId);
    if (list) list.push(item);
    else classCurriculumMap.set(item.classId, [item]);
  });

  classes.forEach((c) => {
    const items = classCurriculumMap.get(c.id) || [];
    const classShift = c.shift || 1;

    // 1. Pair: Russian Language + Literature (Same teacher!)
    const rusItem = items.find((i) => i.subjectId === 'sub_rus');
    const litItem = items.find((i) => i.subjectId === 'sub_lit');

    if (rusItem || litItem) {
      let chosenRusLitId = rusItem?.teacherId || litItem?.teacherId;
      if (!chosenRusLitId) {
        const candidateTeachers = teachers.filter(
          (t) =>
            t.subjectIds.includes('sub_rus') &&
            t.subjectIds.includes('sub_lit') &&
            (t.shift === undefined || t.shift === classShift)
        );
        // Fallback to any teacher with rus or lit if combined not available
        const pool = candidateTeachers.length > 0
          ? candidateTeachers
          : teachers.filter(
              (t) =>
                (t.subjectIds.includes('sub_rus') || t.subjectIds.includes('sub_lit')) &&
                (t.shift === undefined || t.shift === classShift)
            );

        pool.sort((a, b) => (teacherLoadMap.get(a.id) || 0) - (teacherLoadMap.get(b.id) || 0));
        chosenRusLitId = pool[0]?.id;
      }

      if (rusItem) {
        result.push({ ...rusItem, teacherId: chosenRusLitId });
        if (chosenRusLitId) {
          teacherLoadMap.set(chosenRusLitId, (teacherLoadMap.get(chosenRusLitId) || 0) + rusItem.hoursPerWeek);
        }
      }
      if (litItem) {
        result.push({ ...litItem, teacherId: chosenRusLitId });
        if (chosenRusLitId) {
          teacherLoadMap.set(chosenRusLitId, (teacherLoadMap.get(chosenRusLitId) || 0) + litItem.hoursPerWeek);
        }
      }
    }

    // 2. Math / Algebra / Geometry
    const mathItem = items.find((i) => i.subjectId === 'sub_math');
    const geomItem = items.find((i) => i.subjectId === 'sub_geom');

    if (c.grade >= 7) {
      // Senior grades (7-11): Algebra & Geometry taught by the SAME teacher!
      let chosenAlgGeomId = mathItem?.teacherId || geomItem?.teacherId;
      if (!chosenAlgGeomId) {
        const candidateTeachers = teachers.filter(
          (t) =>
            t.subjectIds.includes('sub_math') &&
            t.subjectIds.includes('sub_geom') &&
            (t.shift === undefined || t.shift === classShift)
        );
        const pool = candidateTeachers.length > 0
          ? candidateTeachers
          : teachers.filter(
              (t) =>
                t.subjectIds.includes('sub_math') &&
                (t.shift === undefined || t.shift === classShift)
            );

        pool.sort((a, b) => (teacherLoadMap.get(a.id) || 0) - (teacherLoadMap.get(b.id) || 0));
        chosenAlgGeomId = pool[0]?.id;
      }

      if (mathItem) {
        result.push({ ...mathItem, teacherId: chosenAlgGeomId });
        if (chosenAlgGeomId) {
          teacherLoadMap.set(chosenAlgGeomId, (teacherLoadMap.get(chosenAlgGeomId) || 0) + mathItem.hoursPerWeek);
        }
      }
      if (geomItem) {
        result.push({ ...geomItem, teacherId: chosenAlgGeomId });
        if (chosenAlgGeomId) {
          teacherLoadMap.set(chosenAlgGeomId, (teacherLoadMap.get(chosenAlgGeomId) || 0) + geomItem.hoursPerWeek);
        }
      }
    } else {
      // Middle & Primary grades (1-6): Middle/junior math teacher
      if (mathItem) {
        let chosenMathMidId = mathItem.teacherId;
        if (!chosenMathMidId) {
          const candidateTeachers = teachers.filter(
            (t) =>
              t.subjectIds.includes('sub_math') &&
              !t.subjectIds.includes('sub_geom') &&
              (t.shift === undefined || t.shift === classShift)
          );
          const pool = candidateTeachers.length > 0
            ? candidateTeachers
            : teachers.filter(
                (t) =>
                  t.subjectIds.includes('sub_math') &&
                  (t.shift === undefined || t.shift === classShift)
              );

          pool.sort((a, b) => (teacherLoadMap.get(a.id) || 0) - (teacherLoadMap.get(b.id) || 0));
          chosenMathMidId = pool[0]?.id;
        }

        result.push({ ...mathItem, teacherId: chosenMathMidId });
        if (chosenMathMidId) {
          teacherLoadMap.set(chosenMathMidId, (teacherLoadMap.get(chosenMathMidId) || 0) + mathItem.hoursPerWeek);
        }
      }
    }

    // 3. Primary school general subject (Grades 1-4: taught exclusively by the homeroom teacher!)
    const primaryItem = items.find((i) => i.subjectId === 'sub_primary');
    if (primaryItem) {
      const homeroomId = c.homeroomTeacherId || getHomeroomTeacherId(c.id);
      result.push({
        ...primaryItem,
        teacherId: primaryItem.teacherId || homeroomId,
        preferredRoomId: primaryItem.preferredRoomId || c.homeroomRoomId,
      });
      if (homeroomId) {
        teacherLoadMap.set(homeroomId, (teacherLoadMap.get(homeroomId) || 0) + primaryItem.hoursPerWeek);
      }
    }

    // 4. Other subjects (with multi-group support)
    items.forEach((item) => {
      if (
        item.subjectId === 'sub_rus' ||
        item.subjectId === 'sub_lit' ||
        item.subjectId === 'sub_math' ||
        item.subjectId === 'sub_geom' ||
        item.subjectId === 'sub_primary'
      ) {
        return; // Already processed
      }

      let chosenId = item.teacherId;
      if (!chosenId) {
        const candidates = teachers.filter(
          (t) =>
            t.subjectIds.includes(item.subjectId) &&
            (t.shift === undefined || t.shift === classShift)
        );
        candidates.sort((a, b) => (teacherLoadMap.get(a.id) || 0) - (teacherLoadMap.get(b.id) || 0));
        chosenId = candidates[0]?.id;
      }

      // Group 2 teacher if divided
      let chosenId2 = item.teacherId2;
      if (item.dividedIntoGroups && !chosenId2) {
        const candidates2 = teachers.filter(
          (t) =>
            t.subjectIds.includes(item.subjectId) &&
            t.id !== chosenId &&
            (t.shift === undefined || t.shift === classShift)
        );
        if (candidates2.length > 0) {
          candidates2.sort((a, b) => (teacherLoadMap.get(a.id) || 0) - (teacherLoadMap.get(b.id) || 0));
          chosenId2 = candidates2[0]?.id;
        } else {
          // Fallback to any candidate
          const anyCandidates = teachers.filter(
            (t) => t.subjectIds.includes(item.subjectId) && (t.shift === undefined || t.shift === classShift)
          );
          anyCandidates.sort((a, b) => (teacherLoadMap.get(a.id) || 0) - (teacherLoadMap.get(b.id) || 0));
          chosenId2 = anyCandidates[0]?.id;
        }
      }

      result.push({
        ...item,
        teacherId: chosenId,
        teacherId2: item.dividedIntoGroups ? chosenId2 : undefined,
      });

      if (chosenId) {
        teacherLoadMap.set(chosenId, (teacherLoadMap.get(chosenId) || 0) + item.hoursPerWeek);
      }
      if (chosenId2 && item.dividedIntoGroups) {
        teacherLoadMap.set(chosenId2, (teacherLoadMap.get(chosenId2) || 0) + item.hoursPerWeek);
      }
    });
  });

  return result;
}

/**
=======
>>>>>>> 12cec5f6903649a2bd06de8b53bab6dd58370adb
 * Automatically calculates and sets optimal teacher counts for each subject based on curriculum load
 */
export function autoCalculateStaffing(
  curriculum: CurriculumItem[],
  classes: SchoolClass[],
  subjects: Subject[]
): Subject[] {
  return subjects.map((sub) => {
    const metrics = getSubjectStaffingMetrics(sub.id, curriculum, classes, subjects);
    return {
      ...sub,
      teachersShift1: metrics.recommended1,
      teachersShift2: metrics.recommended2,
    };
  });
}
