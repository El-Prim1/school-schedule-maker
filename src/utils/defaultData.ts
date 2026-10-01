import { AppState, SchoolClass, Subject, Teacher, Room, CurriculumItem, LessonConstraint } from '../types/schedule';
import { generateSchedule } from './scheduler';

export const DEFAULT_SUBJECTS: Subject[] = [
  { id: 'sub_math', name: 'Математика / Алгебра', shortName: 'Алгебра', color: '#2563eb', requiredRoomType: 'regular', maxPerDay: 2, difficulty: 11 },
  { id: 'sub_geom', name: 'Геометрия', shortName: 'Геометр.', color: '#1d4ed8', requiredRoomType: 'regular', maxPerDay: 1, difficulty: 10 },
  { id: 'sub_rus', name: 'Русский язык', shortName: 'Рус.яз', color: '#dc2626', requiredRoomType: 'regular', maxPerDay: 2, difficulty: 10 },
  { id: 'sub_lit', name: 'Литература', shortName: 'Литерат.', color: '#ea580c', requiredRoomType: 'regular', maxPerDay: 1, difficulty: 6 },
  { id: 'sub_inf', name: 'Информатика', shortName: 'Информ.', color: '#0284c7', requiredRoomType: 'it', maxPerDay: 1, difficulty: 9 },
  { id: 'sub_phys', name: 'Физика', shortName: 'Физика', color: '#7c3aed', requiredRoomType: 'physics_lab', maxPerDay: 1, difficulty: 12 },
  { id: 'sub_chem', name: 'Химия', shortName: 'Химия', color: '#d97706', requiredRoomType: 'chemistry_lab', maxPerDay: 1, difficulty: 13 },
  { id: 'sub_bio', name: 'Биология', shortName: 'Биология', color: '#059669', requiredRoomType: 'regular', maxPerDay: 1, difficulty: 7 },
  { id: 'sub_hist', name: 'История', shortName: 'История', color: '#9333ea', requiredRoomType: 'regular', maxPerDay: 1, difficulty: 8 },
  { id: 'sub_soc', name: 'Обществознание', shortName: 'Общество', color: '#c026d3', requiredRoomType: 'regular', maxPerDay: 1, difficulty: 6 },
  { id: 'sub_geog', name: 'География', shortName: 'Географ.', color: '#0d9488', requiredRoomType: 'regular', maxPerDay: 1, difficulty: 6 },
  { id: 'sub_eng', name: 'Иностранный язык (Англ.)', shortName: 'Англ.яз', color: '#4f46e5', requiredRoomType: 'regular', maxPerDay: 1, difficulty: 9 },
  { id: 'sub_pe', name: 'Физическая культура', shortName: 'Физ-ра', color: '#16a34a', requiredRoomType: 'gym', maxPerDay: 1, difficulty: 3 },
  { id: 'sub_tech', name: 'Технология (Труд)', shortName: 'Технолог.', color: '#b45309', requiredRoomType: 'workshop', maxPerDay: 1, difficulty: 4 },
  { id: 'sub_art', name: 'ИЗО и Музыка', shortName: 'ИЗО/Муз', color: '#db2777', requiredRoomType: 'music_art', maxPerDay: 1, difficulty: 2 },
  { id: 'sub_obzh', name: 'ОБЖ / Основы безопасности', shortName: 'ОБЖ', color: '#475569', requiredRoomType: 'regular', maxPerDay: 1, difficulty: 4 },
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

export const DEFAULT_TEACHERS: Teacher[] = [
  { id: 'tch_math1', name: 'Иванова Мария Андреевна', shortName: 'Иванова М.А.', subjectIds: ['sub_math', 'sub_geom'], maxHoursPerWeek: 30, preferredRoomId: 'room_101' },
  { id: 'tch_math2', name: 'Смирнов Алексей Викторович', shortName: 'Смирнов А.В.', subjectIds: ['sub_math', 'sub_geom'], maxHoursPerWeek: 30, preferredRoomId: 'room_102' },
  { id: 'tch_rus1', name: 'Кузнецова Елена Николаевна', shortName: 'Кузнецова Е.Н.', subjectIds: ['sub_rus', 'sub_lit'], maxHoursPerWeek: 30, preferredRoomId: 'room_103' },
  { id: 'tch_rus2', name: 'Попова Ольга Сергеевна', shortName: 'Попова О.С.', subjectIds: ['sub_rus', 'sub_lit'], maxHoursPerWeek: 30, preferredRoomId: 'room_203' },
  { id: 'tch_inf', name: 'Соколов Дмитрий Павлович', shortName: 'Соколов Д.П.', subjectIds: ['sub_inf'], maxHoursPerWeek: 24, preferredRoomId: 'room_it1' },
  { id: 'tch_phys', name: 'Васильев Игорь Михайлович', shortName: 'Васильев И.М.', subjectIds: ['sub_phys'], maxHoursPerWeek: 24, preferredRoomId: 'room_phys' },
  { id: 'tch_chem', name: 'Михайлова Татьяна Петровна', shortName: 'Михайлова Т.П.', subjectIds: ['sub_chem', 'sub_bio'], maxHoursPerWeek: 26, preferredRoomId: 'room_chem' },
  { id: 'tch_bio', name: 'Федорова Анна Сергеевна', shortName: 'Федорова А.С.', subjectIds: ['sub_bio', 'sub_geog'], maxHoursPerWeek: 24, preferredRoomId: 'room_204' },
  { id: 'tch_hist', name: 'Морозов Константин Юрьевич', shortName: 'Морозов К.Ю.', subjectIds: ['sub_hist', 'sub_soc'], maxHoursPerWeek: 26, preferredRoomId: 'room_205' },
  { id: 'tch_eng1', name: 'Новикова Екатерина Владимировна', shortName: 'Новикова Е.В.', subjectIds: ['sub_eng'], maxHoursPerWeek: 24, preferredRoomId: 'room_303' },
  { id: 'tch_eng2', name: 'Волкова Светлана Дмитриевна', shortName: 'Волкова С.Д.', subjectIds: ['sub_eng'], maxHoursPerWeek: 24, preferredRoomId: 'room_304' },
  { id: 'tch_pe1', name: 'Козлов Роман Александрович', shortName: 'Козлов Р.А.', subjectIds: ['sub_pe'], maxHoursPerWeek: 28, preferredRoomId: 'room_gym1' },
  { id: 'tch_pe2', name: 'Павлов Денис Сергеевич', shortName: 'Павлов Д.С.', subjectIds: ['sub_pe'], maxHoursPerWeek: 28, preferredRoomId: 'room_gym2' },
  { id: 'tch_tech', name: 'Григорьев Виктор Семенович', shortName: 'Григорьев В.С.', subjectIds: ['sub_tech', 'sub_obzh'], maxHoursPerWeek: 22, preferredRoomId: 'room_work' },
  { id: 'tch_art', name: 'Лебедева Марина Игоревна', shortName: 'Лебедева М.И.', subjectIds: ['sub_art'], maxHoursPerWeek: 20, preferredRoomId: 'room_art' },
];

export const DEFAULT_CLASSES: SchoolClass[] = [
  { id: 'cls_5a', grade: 5, letter: 'А', name: '5А', shift: 1, homeroomTeacherId: 'tch_rus1', homeroomRoomId: 'room_103' },
  { id: 'cls_5b', grade: 5, letter: 'Б', name: '5Б', shift: 1, homeroomTeacherId: 'tch_math1', homeroomRoomId: 'room_101' },
  { id: 'cls_5v', grade: 5, letter: 'В', name: '5В', shift: 1, homeroomTeacherId: 'tch_eng1', homeroomRoomId: 'room_303' },
  { id: 'cls_6a', grade: 6, letter: 'А', name: '6А', shift: 1, homeroomTeacherId: 'tch_bio', homeroomRoomId: 'room_204' },
  { id: 'cls_6b', grade: 6, letter: 'Б', name: '6Б', shift: 1, homeroomTeacherId: 'tch_math2', homeroomRoomId: 'room_102' },
  { id: 'cls_7a', grade: 7, letter: 'А', name: '7А', shift: 1, homeroomTeacherId: 'tch_phys', homeroomRoomId: 'room_phys' },
  { id: 'cls_8a', grade: 8, letter: 'А', name: '8А', shift: 1, homeroomTeacherId: 'tch_chem', homeroomRoomId: 'room_chem' },
  { id: 'cls_9a', grade: 9, letter: 'А', name: '9А', shift: 1, homeroomTeacherId: 'tch_hist', homeroomRoomId: 'room_205' },
];

export const DEFAULT_PARALLEL_LIMITS: Record<number, number> = {
  1: 4,
  2: 5,
  3: 5,
  4: 5,
  5: 6,
  6: 6,
  7: 6,
  8: 6,
  9: 7,
  10: 7,
  11: 7,
};

// Generates baseline curriculum for grade
export function createDefaultCurriculum(classes: SchoolClass[], teachers: Teacher[]): CurriculumItem[] {
  const items: CurriculumItem[] = [];
  const teacherLoads = new Map<string, number>(teachers.map((teacher) => [teacher.id, 0]));

  const gradeSubjectPlans: Record<number, { subId: string; hours: number }[]> = {
    5: [
      { subId: 'sub_rus', hours: 5 },
      { subId: 'sub_lit', hours: 3 },
      { subId: 'sub_math', hours: 5 },
      { subId: 'sub_hist', hours: 2 },
      { subId: 'sub_bio', hours: 1 },
      { subId: 'sub_geog', hours: 1 },
      { subId: 'sub_eng', hours: 3 },
      { subId: 'sub_pe', hours: 3 },
      { subId: 'sub_inf', hours: 1 },
      { subId: 'sub_tech', hours: 2 },
      { subId: 'sub_art', hours: 1 },
    ], // total: 27 hours (~5.4 lessons/day in 5-day week)
    6: [
      { subId: 'sub_rus', hours: 5 },
      { subId: 'sub_lit', hours: 3 },
      { subId: 'sub_math', hours: 5 },
      { subId: 'sub_hist', hours: 2 },
      { subId: 'sub_soc', hours: 1 },
      { subId: 'sub_bio', hours: 1 },
      { subId: 'sub_geog', hours: 1 },
      { subId: 'sub_eng', hours: 3 },
      { subId: 'sub_pe', hours: 3 },
      { subId: 'sub_inf', hours: 1 },
      { subId: 'sub_tech', hours: 2 },
      { subId: 'sub_art', hours: 1 },
    ], // total: 28 hours
    7: [
      { subId: 'sub_rus', hours: 4 },
      { subId: 'sub_lit', hours: 2 },
      { subId: 'sub_math', hours: 4 },
      { subId: 'sub_geom', hours: 2 },
      { subId: 'sub_phys', hours: 2 },
      { subId: 'sub_bio', hours: 2 },
      { subId: 'sub_geog', hours: 2 },
      { subId: 'sub_hist', hours: 2 },
      { subId: 'sub_soc', hours: 1 },
      { subId: 'sub_eng', hours: 3 },
      { subId: 'sub_pe', hours: 3 },
      { subId: 'sub_inf', hours: 1 },
      { subId: 'sub_tech', hours: 1 },
    ], // total: 29 hours
    8: [
      { subId: 'sub_rus', hours: 3 },
      { subId: 'sub_lit', hours: 2 },
      { subId: 'sub_math', hours: 3 },
      { subId: 'sub_geom', hours: 2 },
      { subId: 'sub_phys', hours: 2 },
      { subId: 'sub_chem', hours: 2 },
      { subId: 'sub_bio', hours: 2 },
      { subId: 'sub_geog', hours: 2 },
      { subId: 'sub_hist', hours: 2 },
      { subId: 'sub_soc', hours: 1 },
      { subId: 'sub_eng', hours: 3 },
      { subId: 'sub_pe', hours: 3 },
      { subId: 'sub_inf', hours: 1 },
      { subId: 'sub_obzh', hours: 1 },
    ], // total: 29 hours
    9: [
      { subId: 'sub_rus', hours: 3 },
      { subId: 'sub_lit', hours: 3 },
      { subId: 'sub_math', hours: 4 },
      { subId: 'sub_geom', hours: 2 },
      { subId: 'sub_phys', hours: 3 },
      { subId: 'sub_chem', hours: 2 },
      { subId: 'sub_bio', hours: 2 },
      { subId: 'sub_geog', hours: 2 },
      { subId: 'sub_hist', hours: 2 },
      { subId: 'sub_soc', hours: 1 },
      { subId: 'sub_eng', hours: 3 },
      { subId: 'sub_pe', hours: 3 },
      { subId: 'sub_inf', hours: 2 },
      { subId: 'sub_obzh', hours: 1 },
    ],
  };

  classes.forEach((cls) => {
    const plan = gradeSubjectPlans[cls.grade] || gradeSubjectPlans[7];
    plan.forEach((item) => {
      // Find a qualified teacher
      const qualified = teachers
        .filter((teacher) => teacher.subjectIds.includes(item.subId))
        .sort((a, b) => (teacherLoads.get(a.id) || 0) - (teacherLoads.get(b.id) || 0));
      const assignedTeacherId = qualified[0]?.id;
      if (assignedTeacherId) {
        teacherLoads.set(assignedTeacherId, (teacherLoads.get(assignedTeacherId) || 0) + item.hours);
      }

      items.push({
        id: `cur_${cls.id}_${item.subId}`,
        classId: cls.id,
        subjectId: item.subId,
        hoursPerWeek: item.hours,
        teacherId: assignedTeacherId,
      });
    });
  });

  return items;
}

export function getDefaultAppState(): AppState {
  const classes = DEFAULT_CLASSES;
  const teachers = DEFAULT_TEACHERS;
  const subjects = DEFAULT_SUBJECTS;
  const rooms = DEFAULT_ROOMS;
  const parallelLimits = { ...DEFAULT_PARALLEL_LIMITS };
  const curriculum = createDefaultCurriculum(classes, teachers);

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
      balanceSanpinDifficulty: true,
      prioritizeProfileRooms: true,
      avoidTeacherWindows: true,
      shift1Start: '08:00',
      breakDurationMinutes: 5,
    },
    constraints: [],
  };
}

export function loadDemoScheduleState(): AppState {
  const baseState = getDefaultAppState();

  const demoConstraints: LessonConstraint[] = [
    {
      id: 'constr_demo_1',
      subjectId: 'sub_hist',
      conditionType: 'day_first',
      dayOfWeek: 0, // Monday 1st lesson
      enabled: true,
      title: '«Разговоры о важном / История» — Понедельник, 1-й урок (Все классы)',
    },
    {
      id: 'constr_demo_2',
      subjectId: 'sub_pe',
      conditionType: 'always_last',
      enabled: true,
      title: '«Физкультура» — Всегда последним уроком',
    },
    {
      id: 'constr_demo_3',
      subjectId: 'sub_inf',
      conditionType: 'only_on_day',
      dayOfWeek: 3, // Thursday
      enabled: true,
      title: '«Информатика» — Только в четверг',
    },
  ];

  const stateWithConstraints: AppState = {
    ...baseState,
    constraints: demoConstraints,
    isDemoMode: true,
  };

  const genResult = generateSchedule(stateWithConstraints);

  return {
    ...stateWithConstraints,
    schedule: genResult.schedule,
  };
}
