import { AppState, SchoolClass, Subject, Teacher, Room, CurriculumItem, LessonConstraint } from '../types/schedule';
import { generateSchedule } from './scheduler';
import { syncAnonymousTeachers, getHomeroomTeacherId } from './staffingUtils';

export const DEFAULT_SUBJECTS: Subject[] = [
  { id: 'sub_math', name: 'Математика / Алгебра', shortName: 'Алгебра', color: '#2563eb', requiredRoomType: 'regular', maxPerDay: 2, teachersShift1: 2, teachersShift2: 1 },
  { id: 'sub_geom', name: 'Геометрия', shortName: 'Геометр.', color: '#1d4ed8', requiredRoomType: 'regular', maxPerDay: 1, teachersShift1: 1, teachersShift2: 0 },
  { id: 'sub_rus', name: 'Русский язык', shortName: 'Рус.яз', color: '#dc2626', requiredRoomType: 'regular', maxPerDay: 2, teachersShift1: 2, teachersShift2: 1 },
  { id: 'sub_lit', name: 'Литература', shortName: 'Литерат.', color: '#ea580c', requiredRoomType: 'regular', maxPerDay: 1, teachersShift1: 1, teachersShift2: 0 },
  { id: 'sub_inf', name: 'Информатика', shortName: 'Информ.', color: '#0284c7', requiredRoomType: 'it', maxPerDay: 1, teachersShift1: 1, teachersShift2: 1 },
  { id: 'sub_phys', name: 'Физика', shortName: 'Физика', color: '#7c3aed', requiredRoomType: 'physics_lab', maxPerDay: 1, teachersShift1: 1, teachersShift2: 1 },
  { id: 'sub_chem', name: 'Химия', shortName: 'Химия', color: '#d97706', requiredRoomType: 'chemistry_lab', maxPerDay: 1, teachersShift1: 1, teachersShift2: 0 },
  { id: 'sub_bio', name: 'Биология', shortName: 'Биология', color: '#059669', requiredRoomType: 'regular', maxPerDay: 1, teachersShift1: 1, teachersShift2: 0 },
  { id: 'sub_hist', name: 'История', shortName: 'История', color: '#9333ea', requiredRoomType: 'regular', maxPerDay: 1, teachersShift1: 1, teachersShift2: 0 },
  { id: 'sub_soc', name: 'Обществознание', shortName: 'Общество', color: '#c026d3', requiredRoomType: 'regular', maxPerDay: 1, teachersShift1: 1, teachersShift2: 0 },
  { id: 'sub_geog', name: 'География', shortName: 'Географ.', color: '#0d9488', requiredRoomType: 'regular', maxPerDay: 1, teachersShift1: 1, teachersShift2: 0 },
  { id: 'sub_eng', name: 'Иностранный язык (Англ.)', shortName: 'Англ.яз', color: '#4f46e5', requiredRoomType: 'regular', maxPerDay: 1, teachersShift1: 2, teachersShift2: 1 },
  { id: 'sub_pe', name: 'Физическая культура', shortName: 'Физ-ра', color: '#16a34a', requiredRoomType: 'gym', maxPerDay: 1, teachersShift1: 2, teachersShift2: 1 },
  { id: 'sub_tech', name: 'Технология (Труд)', shortName: 'Технолог.', color: '#b45309', requiredRoomType: 'workshop', maxPerDay: 1, teachersShift1: 1, teachersShift2: 0 },
  { id: 'sub_art', name: 'ИЗО и Музыка', shortName: 'ИЗО/Муз', color: '#db2777', requiredRoomType: 'music_art', maxPerDay: 1, teachersShift1: 1, teachersShift2: 0 },
  { id: 'sub_obzh', name: 'ОБЖ / Основы безопасности', shortName: 'ОБЖ', color: '#475569', requiredRoomType: 'regular', maxPerDay: 1, teachersShift1: 1, teachersShift2: 0 },
];

export const DEFAULT_ROOMS: Room[] = [
  { id: 'room_gym1', name: 'Спортзал №1 (Большой)', type: 'gym', capacity: 2, description: 'Две группы одновременно' },
  { id: 'room_gym2', name: 'Спортзал №2 (Малый зал)', type: 'gym', capacity: 1, description: 'Один класс' },
  { id: 'room_it1', name: 'ИТ-Кабинет 201', type: 'it', capacity: 1, description: '15 ПК, проектор' },
  { id: 'room_it2', name: 'ИТ-Кабинет 202', type: 'it', capacity: 1, description: '16 ПК, интерактивная доска' },
  { id: 'room_phys', name: 'Лаборатория физики 301', type: 'physics_lab', capacity: 1, description: 'Оборудование для опытов' },
  { id: 'room_chem', name: 'Лаборатория химии 302', type: 'chemistry_lab', capacity: 1, description: 'Вытяжные шкафы, реактивы' },
  { id: 'room_work', name: 'Мастерская технологии 100', type: 'workshop', capacity: 1, description: 'Станки и верстаки' },
  { id: 'room_art', name: 'Кабинет музыки/ИЗО 105', type: 'music_art', capacity: 1, description: 'Пианино, мольберты' },
  { id: 'room_101', name: 'Кабинет 101', type: 'regular', capacity: 1 },
  { id: 'room_102', name: 'Кабинет 102', type: 'regular', capacity: 1 },
  { id: 'room_103', name: 'Кабинет 103', type: 'regular', capacity: 1 },
  { id: 'room_203', name: 'Кабинет 203', type: 'regular', capacity: 1 },
  { id: 'room_204', name: 'Кабинет 204', type: 'regular', capacity: 1 },
  { id: 'room_205', name: 'Кабинет 205', type: 'regular', capacity: 1 },
  { id: 'room_303', name: 'Кабинет 303', type: 'regular', capacity: 1 },
  { id: 'room_304', name: 'Кабинет 304', type: 'regular', capacity: 1 },
  { id: 'room_305', name: 'Кабинет 305', type: 'regular', capacity: 1 },
  { id: 'room_401', name: 'Кабинет 401', type: 'regular', capacity: 1 },
  { id: 'room_402', name: 'Кабинет 402', type: 'regular', capacity: 1 },
];

export const DEFAULT_CLASSES: SchoolClass[] = [
  { id: 'cls_5a', grade: 5, letter: 'А', name: '5А', shift: 1, homeroomTeacherId: 'tch_homeroom_cls_5a', homeroomRoomId: 'room_103' },
  { id: 'cls_5b', grade: 5, letter: 'Б', name: '5Б', shift: 1, homeroomTeacherId: 'tch_homeroom_cls_5b', homeroomRoomId: 'room_101' },
  { id: 'cls_5v', grade: 5, letter: 'В', name: '5В', shift: 1, homeroomTeacherId: 'tch_homeroom_cls_5v', homeroomRoomId: 'room_303' },
  { id: 'cls_6a', grade: 6, letter: 'А', name: '6А', shift: 1, homeroomTeacherId: 'tch_homeroom_cls_6a', homeroomRoomId: 'room_204' },
  { id: 'cls_6b', grade: 6, letter: 'Б', name: '6Б', shift: 1, homeroomTeacherId: 'tch_homeroom_cls_6b', homeroomRoomId: 'room_102' },
  { id: 'cls_7a', grade: 7, letter: 'А', name: '7А', shift: 1, homeroomTeacherId: 'tch_homeroom_cls_7a', homeroomRoomId: 'room_phys' },
  { id: 'cls_8a', grade: 8, letter: 'А', name: '8А', shift: 1, homeroomTeacherId: 'tch_homeroom_cls_8a', homeroomRoomId: 'room_chem' },
  { id: 'cls_9a', grade: 9, letter: 'А', name: '9А', shift: 1, homeroomTeacherId: 'tch_homeroom_cls_9a', homeroomRoomId: 'room_205' },
];

export const DEFAULT_TEACHERS: Teacher[] = syncAnonymousTeachers(DEFAULT_SUBJECTS, DEFAULT_CLASSES);

export const DEFAULT_PARALLEL_LIMITS: Record<number, number> = {
  1: 4,
  2: 5,
  3: 5,
  4: 5,
  5: 6,
  6: 6,
  7: 6,
  8: 6,
  9: 6,
  10: 7,
  11: 7,
};

// Generates typical curriculum for a grade
export function getStandardCurriculumForGrade(grade: number): Array<{ subjectId: string; hours: number }> {
  if (grade <= 4) {
    return [
      { subjectId: 'sub_rus', hours: 5 },
      { subjectId: 'sub_lit', hours: 4 },
      { subjectId: 'sub_math', hours: 4 },
      { subjectId: 'sub_art', hours: 2 },
      { subjectId: 'sub_pe', hours: 3 },
      { subjectId: 'sub_eng', hours: 2 },
      { subjectId: 'sub_tech', hours: 1 },
      { subjectId: 'sub_bio', hours: 1 },
    ];
  }
  if (grade <= 6) {
    return [
      { subjectId: 'sub_rus', hours: 5 },
      { subjectId: 'sub_lit', hours: 3 },
      { subjectId: 'sub_math', hours: 5 },
      { subjectId: 'sub_hist', hours: 2 },
      { subjectId: 'sub_soc', hours: 1 },
      { subjectId: 'sub_bio', hours: 1 },
      { subjectId: 'sub_geog', hours: 1 },
      { subjectId: 'sub_eng', hours: 3 },
      { subjectId: 'sub_pe', hours: 3 },
      { subjectId: 'sub_inf', hours: 1 },
      { subjectId: 'sub_art', hours: 1 },
      { subjectId: 'sub_tech', hours: 2 },
    ];
  }
  if (grade <= 9) {
    return [
      { subjectId: 'sub_rus', hours: 4 },
      { subjectId: 'sub_lit', hours: 3 },
      { subjectId: 'sub_math', hours: 3 },
      { subjectId: 'sub_geom', hours: 2 },
      { subjectId: 'sub_inf', hours: 2 },
      { subjectId: 'sub_phys', hours: 2 },
      { subjectId: 'sub_chem', hours: 2 },
      { subjectId: 'sub_bio', hours: 2 },
      { subjectId: 'sub_hist', hours: 2 },
      { subjectId: 'sub_soc', hours: 1 },
      { subjectId: 'sub_geog', hours: 2 },
      { subjectId: 'sub_eng', hours: 3 },
      { subjectId: 'sub_pe', hours: 2 },
      { subjectId: 'sub_obzh', hours: 1 },
    ];
  }
  // High school 10-11
  return [
    { subjectId: 'sub_rus', hours: 3 },
    { subjectId: 'sub_lit', hours: 3 },
    { subjectId: 'sub_math', hours: 4 },
    { subjectId: 'sub_geom', hours: 2 },
    { subjectId: 'sub_inf', hours: 3 },
    { subjectId: 'sub_phys', hours: 3 },
    { subjectId: 'sub_chem', hours: 2 },
    { subjectId: 'sub_bio', hours: 2 },
    { subjectId: 'sub_hist', hours: 3 },
    { subjectId: 'sub_soc', hours: 2 },
    { subjectId: 'sub_geog', hours: 1 },
    { subjectId: 'sub_eng', hours: 3 },
    { subjectId: 'sub_pe', hours: 2 },
    { subjectId: 'sub_obzh', hours: 1 },
  ];
}

export function getDefaultAppState(): AppState {
  const classes = [...DEFAULT_CLASSES];
  const subjects = [...DEFAULT_SUBJECTS];
  const teachers = syncAnonymousTeachers(subjects, classes);
  const rooms = [...DEFAULT_ROOMS];
  const parallelLimits = { ...DEFAULT_PARALLEL_LIMITS };

  // Build curriculum items
  const curriculum: CurriculumItem[] = [];

  classes.forEach((cls) => {
    const stdPlan = getStandardCurriculumForGrade(cls.grade);
    stdPlan.forEach((planItem) => {
      // Find candidate teachers for this subject and shift
      const candidateTeachers = teachers.filter((t) =>
        t.subjectIds.includes(planItem.subjectId) &&
        (t.shift === undefined || t.shift === cls.shift)
      );

      // Prefer homeroom teacher if qualified, else distribute
      let assignedTeacherId: string | undefined;
      const homeroomId = getHomeroomTeacherId(cls.id);
      const isHomeroomQualified = candidateTeachers.some((t) => t.id === homeroomId);

      if (isHomeroomQualified) {
        assignedTeacherId = homeroomId;
      } else if (candidateTeachers.length > 0) {
        // Deterministic assignment based on class index
        const classIdx = parseInt(cls.id.replace(/\D/g, '') || '0', 10);
        assignedTeacherId = candidateTeachers[classIdx % candidateTeachers.length]?.id || candidateTeachers[0].id;
      }

      curriculum.push({
        id: `curr_${cls.id}_${planItem.subjectId}`,
        classId: cls.id,
        subjectId: planItem.subjectId,
        hoursPerWeek: planItem.hours,
        teacherId: assignedTeacherId,
      });
    });
  });

  return {
    classes,
    subjects,
    teachers,
    rooms,
    curriculum,
    parallelLimits,
    schedule: [],
    settings: {
      daysPerWeek: 5,
      maxLessonsGlobal: 7,
      prioritizeProfileRooms: true,
      avoidTeacherWindows: true,
      shift1Start: '08:00',
      breakDurationMinutes: 10,
      breakAfterLesson2Minutes: 15,
      breakAfterLesson3Minutes: 15,
    },
    constraints: [],
  };
}

export function getEmptyAppState(): AppState {
  return {
    classes: [],
    subjects: DEFAULT_SUBJECTS,
    teachers: [],
    rooms: [],
    curriculum: [],
    parallelLimits: { ...DEFAULT_PARALLEL_LIMITS },
    schedule: [],
    settings: {
      daysPerWeek: 5,
      maxLessonsGlobal: 7,
      prioritizeProfileRooms: true,
      avoidTeacherWindows: true,
      shift1Start: '08:00',
      breakDurationMinutes: 10,
      breakAfterLesson2Minutes: 15,
      breakAfterLesson3Minutes: 15,
    },
    constraints: [],
    isDemoMode: false,
  };
}

export function loadDemoScheduleState(): AppState {
  const base = getDefaultAppState();
  
  // Add a sample custom rule (e.g. Physics on Friday for 7A)
  const constraints: LessonConstraint[] = [
    {
      id: 'rule_phys_7a',
      subjectId: 'sub_phys',
      classId: 'cls_7a',
      conditionType: 'day_first',
      dayOfWeek: 4, // Friday
      enabled: true,
      title: '7А: Физика в пятницу 1-м уроком',
    },
    {
      id: 'rule_pe_5a',
      subjectId: 'sub_pe',
      classId: 'cls_5a',
      conditionType: 'always_last',
      enabled: false,
      title: '5А: Физкультура всегда последним уроком',
    },
  ];

  const stateWithRules: AppState = {
    ...base,
    constraints,
    isDemoMode: true,
  };

  // Run generator
  const genResult = generateSchedule(stateWithRules);

  return {
    ...stateWithRules,
    schedule: genResult.schedule,
  };
}
