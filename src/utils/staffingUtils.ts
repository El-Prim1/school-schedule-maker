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
    result.push({
      id,
      name: `Классный руководитель (${cls.name})`,
      shortName: `Кл. рук. ${cls.name}`,
      subjectIds: [],
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
