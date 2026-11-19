import { AppState, SchoolClass, Subject, Teacher, Room, CurriculumItem, LessonConstraint } from '../types/schedule';
import { generateSchedule } from './scheduler';
import { syncAnonymousTeachers, autoAssignTeachers } from './staffingUtils';

export const DEFAULT_SUBJECTS: Subject[] = [
  { id: 'sub_primary', name: 'Уроки начальной школы', shortName: 'Нач. школа', color: '#0284c7', requiredRoomType: 'regular', maxPerDay: 4, teachersShift1: 8, teachersShift2: 8 },
  { id: 'sub_math', name: 'Математика / Алгебра', shortName: 'Алгебра', color: '#2563eb', requiredRoomType: 'regular', maxPerDay: 2, teachersShift1: 7, teachersShift2: 4 },
  { id: 'sub_geom', name: 'Геометрия', shortName: 'Геометр.', color: '#1d4ed8', requiredRoomType: 'regular', maxPerDay: 1, teachersShift1: 4, teachersShift2: 2 },
  { id: 'sub_rus', name: 'Русский язык', shortName: 'Рус.яз', color: '#dc2626', requiredRoomType: 'regular', maxPerDay: 2, teachersShift1: 8, teachersShift2: 5 },
  { id: 'sub_lit', name: 'Литература', shortName: 'Литерат.', color: '#ea580c', requiredRoomType: 'regular', maxPerDay: 1, teachersShift1: 8, teachersShift2: 5 },
  { id: 'sub_inf', name: 'Информатика', shortName: 'Информ.', color: '#0284c7', requiredRoomType: 'it', maxPerDay: 1, teachersShift1: 3, teachersShift2: 2 },
  { id: 'sub_phys', name: 'Физика', shortName: 'Физика', color: '#7c3aed', requiredRoomType: 'physics_lab', maxPerDay: 1, teachersShift1: 2, teachersShift2: 1 },
  { id: 'sub_chem', name: 'Химия', shortName: 'Химия', color: '#d97706', requiredRoomType: 'chemistry_lab', maxPerDay: 1, teachersShift1: 2, teachersShift2: 1 },
  { id: 'sub_bio', name: 'Биология / Окружающий мир', shortName: 'Биология', color: '#059669', requiredRoomType: 'regular', maxPerDay: 1, teachersShift1: 3, teachersShift2: 2 },
  { id: 'sub_hist', name: 'История', shortName: 'История', color: '#9333ea', requiredRoomType: 'regular', maxPerDay: 1, teachersShift1: 3, teachersShift2: 2 },
  { id: 'sub_soc', name: 'Обществознание', shortName: 'Общество', color: '#c026d3', requiredRoomType: 'regular', maxPerDay: 1, teachersShift1: 2, teachersShift2: 1 },
  { id: 'sub_geog', name: 'География', shortName: 'Географ.', color: '#0d9488', requiredRoomType: 'regular', maxPerDay: 1, teachersShift1: 2, teachersShift2: 1 },
  { id: 'sub_eng', name: 'Иностранный язык (Англ.)', shortName: 'Англ.яз', color: '#4f46e5', requiredRoomType: 'regular', maxPerDay: 1, teachersShift1: 5, teachersShift2: 3 },
  { id: 'sub_pe', name: 'Физическая культура', shortName: 'Физ-ра', color: '#16a34a', requiredRoomType: 'gym', maxPerDay: 1, teachersShift1: 4, teachersShift2: 2 },
  { id: 'sub_tech', name: 'Технология (Труд)', shortName: 'Технолог.', color: '#b45309', requiredRoomType: 'workshop', maxPerDay: 1, teachersShift1: 2, teachersShift2: 1 },
  { id: 'sub_art', name: 'ИЗО и Музыка', shortName: 'ИЗО/Муз', color: '#db2777', requiredRoomType: 'music_art', maxPerDay: 1, teachersShift1: 2, teachersShift2: 1 },
  { id: 'sub_obzh', name: 'ОБЖ / Основы безопасности', shortName: 'ОБЖ', color: '#475569', requiredRoomType: 'regular', maxPerDay: 1, teachersShift1: 1, teachersShift2: 1 },
];

export const DEFAULT_ROOMS: Room[] = [
  // Спортивные залы (разная вместимость)
  { id: 'room_gym1', name: 'Спортзал №1 (Большой зал)', type: 'gym', capacity: 3, description: 'До 3 групп одновременно' },
  { id: 'room_gym2', name: 'Спортзал №2 (Средний зал)', type: 'gym', capacity: 2, description: 'До 2 групп одновременно' },
  { id: 'room_gym3', name: 'Спортзал №3 (Малый зал/Гимнастика)', type: 'gym', capacity: 1, description: '1 группа' },

  // ИТ-лаборатории
  { id: 'room_it1', name: 'ИТ-Лаборатория 1 (201)', type: 'it', capacity: 1, description: '16 ПК, проектор' },
  { id: 'room_it2', name: 'ИТ-Лаборатория 2 (202)', type: 'it', capacity: 1, description: '16 ПК, интерактивная панель' },
  { id: 'room_it3', name: 'ИТ-Лаборатория 3 (203)', type: 'it', capacity: 1, description: '16 ПК, мобильный класс' },
  { id: 'room_it4', name: 'ИТ-Лаборатория 4 (204)', type: 'it', capacity: 1, description: '16 ПК' },

  // Профильные естественно-научные лаборатории
  { id: 'room_phys1', name: 'Лаборатория физики №1 (301)', type: 'physics_lab', capacity: 1, description: 'Демонстрационный стол' },
  { id: 'room_phys2', name: 'Лаборатория физики №2 (302)', type: 'physics_lab', capacity: 1, description: 'Оборудование для практикумов' },
  { id: 'room_chem1', name: 'Лаборатория химии №1 (303)', type: 'chemistry_lab', capacity: 1, description: 'Вытяжные шкафы, реактивы' },
  { id: 'room_chem2', name: 'Лаборатория химии и биологии (304)', type: 'chemistry_lab', capacity: 1, description: 'Микроскопы, препараты' },

  // Технология и творчество
  { id: 'room_work1', name: 'Мастерская технологии №1 (100)', type: 'workshop', capacity: 1, description: 'Станки и верстаки' },
  { id: 'room_work2', name: 'Мастерская технологии №2 (100-Б)', type: 'workshop', capacity: 1, description: 'Швейные машины, кулинария' },
  { id: 'room_art1', name: 'Кабинет музыки и ИЗО №1 (109)', type: 'music_art', capacity: 1, description: 'Пианино, мольберты' },
  { id: 'room_art2', name: 'Кабинет музыки и ИЗО №2 (110)', type: 'music_art', capacity: 1, description: 'Инструменты и арт-зона' },

  // Учебные кабинеты (1-й этаж: начальная школа, 1-я смена: 1А-1Г, 4А-4Г; 2-я смена: 2А-2Г, 3А-3Г)
  { id: 'room_101', name: 'Кабинет 101 (1А / 2А)', type: 'regular', capacity: 1, description: '1-я см: 1А / 2-я см: 2А' },
  { id: 'room_102', name: 'Кабинет 102 (1Б / 2Б)', type: 'regular', capacity: 1, description: '1-я см: 1Б / 2-я см: 2Б' },
  { id: 'room_103', name: 'Кабинет 103 (1В / 2В)', type: 'regular', capacity: 1, description: '1-я см: 1В / 2-я см: 2В' },
  { id: 'room_104', name: 'Кабинет 104 (1Г / 2Г)', type: 'regular', capacity: 1, description: '1-я см: 1Г / 2-я см: 2Г' },
  { id: 'room_105', name: 'Кабинет 105 (4А / 3А)', type: 'regular', capacity: 1, description: '1-я см: 4А / 2-я см: 3А' },
  { id: 'room_106', name: 'Кабинет 106 (4Б / 3Б)', type: 'regular', capacity: 1, description: '1-я см: 4Б / 2-я см: 3Б' },
  { id: 'room_107', name: 'Кабинет 107 (4В / 3В)', type: 'regular', capacity: 1, description: '1-я см: 4В / 2-я см: 3В' },
  { id: 'room_108', name: 'Кабинет 108 (4Г / 3Г)', type: 'regular', capacity: 1, description: '1-я см: 4Г / 2-я см: 3Г' },

  // 2-й этаж: средняя школа (1-я смена: 5А-5Г, 8А-8Г; 2-я смена: 6А-6Г, 7А-7Г)
  { id: 'room_201', name: 'Кабинет 201 (5А / 6А)', type: 'regular', capacity: 1, description: '1-я см: 5А / 2-я см: 6А' },
  { id: 'room_202', name: 'Кабинет 202 (5Б / 6Б)', type: 'regular', capacity: 1, description: '1-я см: 5Б / 2-я см: 6Б' },
  { id: 'room_203', name: 'Кабинет 203 (5В / 6В)', type: 'regular', capacity: 1, description: '1-я см: 5В / 2-я см: 6В' },
  { id: 'room_204', name: 'Кабинет 204 (5Г / 6Г)', type: 'regular', capacity: 1, description: '1-я см: 5Г / 2-я см: 6Г' },
  { id: 'room_205', name: 'Кабинет 205 (8А / 7А)', type: 'regular', capacity: 1, description: '1-я см: 8А / 2-я см: 7А' },
  { id: 'room_206', name: 'Кабинет 206 (8Б / 7Б)', type: 'regular', capacity: 1, description: '1-я см: 8Б / 2-я см: 7Б' },
  { id: 'room_207', name: 'Кабинет 207 (8В / 7В)', type: 'regular', capacity: 1, description: '1-я см: 8В / 2-я см: 7В' },
  { id: 'room_208', name: 'Кабинет 208 (8Г / 7Г)', type: 'regular', capacity: 1, description: '1-я см: 8Г / 2-я см: 7Г' },

  // 3-й этаж: 9-е и 10-е классы (1-я смена)
  { id: 'room_301', name: 'Кабинет 301 (9А)', type: 'regular', capacity: 1 },
  { id: 'room_302', name: 'Кабинет 302 (9Б)', type: 'regular', capacity: 1 },
  { id: 'room_303', name: 'Кабинет 303 (9В)', type: 'regular', capacity: 1 },
  { id: 'room_304', name: 'Кабинет 304 (9Г)', type: 'regular', capacity: 1 },
  { id: 'room_305', name: 'Кабинет 305 (10А)', type: 'regular', capacity: 1 },
  { id: 'room_306', name: 'Кабинет 306 (10Б)', type: 'regular', capacity: 1 },
  { id: 'room_307', name: 'Кабинет 307 (10В)', type: 'regular', capacity: 1 },
  { id: 'room_308', name: 'Кабинет 308 (10Г)', type: 'regular', capacity: 1 },

  // 4-й этаж: 11-е классы и универсальные кабинеты
  { id: 'room_401', name: 'Кабинет 401 (11А)', type: 'regular', capacity: 1 },
  { id: 'room_402', name: 'Кабинет 402 (11Б)', type: 'regular', capacity: 1 },
  { id: 'room_403', name: 'Кабинет 403 (11В)', type: 'regular', capacity: 1 },
  { id: 'room_404', name: 'Кабинет 404 (11Г)', type: 'regular', capacity: 1 },
  { id: 'room_405', name: 'Кабинет 405 (Гуманитарный)', type: 'regular', capacity: 1 },
  { id: 'room_406', name: 'Кабинет 406 (Лингафонный)', type: 'regular', capacity: 1 },
  { id: 'room_407', name: 'Кабинет 407 (Универсальный)', type: 'regular', capacity: 1 },
  { id: 'room_408', name: 'Кабинет 408 (Универсальный)', type: 'regular', capacity: 1 },
];

// Helper to build 44 classes (1-11 grades, A-G parallels, 2,3,6,7 in 2nd shift)
export function buildAllSchoolClasses(): SchoolClass[] {
  const parallels: Array<{ letter: 'А' | 'Б' | 'В' | 'Г'; code: string; offset: number }> = [
    { letter: 'А', code: 'a', offset: 0 },
    { letter: 'Б', code: 'b', offset: 1 },
    { letter: 'В', code: 'v', offset: 2 },
    { letter: 'Г', code: 'g', offset: 3 },
  ];
  const grades = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
  const shift2Grades = [2, 3, 6, 7];

  const result: SchoolClass[] = [];

  grades.forEach((g) => {
    parallels.forEach((p) => {
      const shift: 1 | 2 = shift2Grades.includes(g) ? 2 : 1;
      let roomBase = 101;
      if (g === 1 || g === 2) roomBase = 101;
      else if (g === 4 || g === 3) roomBase = 105;
      else if (g === 5 || g === 6) roomBase = 201;
      else if (g === 8 || g === 7) roomBase = 205;
      else if (g === 9) roomBase = 301;
      else if (g === 10) roomBase = 305;
      else if (g === 11) roomBase = 401;

      const roomId = `room_${roomBase + p.offset}`;
      const id = `cls_${g}${p.code}`;

      result.push({
        id,
        grade: g,
        letter: p.letter,
        name: `${g}${p.letter}`,
        shift,
        homeroomTeacherId: `tch_homeroom_${id}`,
        homeroomRoomId: roomId,
      });
    });
  });

  return result;
}

export const DEFAULT_CLASSES: SchoolClass[] = buildAllSchoolClasses();

// Builds realistic teacher roster with Russian+Lit, Middle Math, Algebra+Geom, and multi-shift teachers
export function buildRealisticSchoolTeachers(classes: SchoolClass[]): Teacher[] {
  const result: Teacher[] = [];

  // 1. Учителя русского языка и литературы (преподают и русский, и литературу!)
  for (let i = 1; i <= 8; i++) {
    result.push({
      id: `tch_rus_lit_s1_${i}`,
      name: `Учитель рус. яз. и лит. №${i} (1 см)`,
      shortName: `Рус/Лит №${i} (1 см)`,
      subjectIds: ['sub_rus', 'sub_lit'],
      maxHoursPerWeek: 28,
      shift: 1,
    });
  }
  for (let i = 1; i <= 5; i++) {
    result.push({
      id: `tch_rus_lit_s2_${i}`,
      name: `Учитель рус. яз. и лит. №${i + 8} (2 см)`,
      shortName: `Рус/Лит №${i + 8} (2 см)`,
      subjectIds: ['sub_rus', 'sub_lit'],
      maxHoursPerWeek: 28,
      shift: 2,
    });
  }
  for (let i = 1; i <= 2; i++) {
    result.push({
      id: `tch_rus_lit_both_${i}`,
      name: `Учитель рус. яз. и лит. №${i + 13} (1 и 2 см)`,
      shortName: `Рус/Лит №${i + 13} (1-2 см)`,
      subjectIds: ['sub_rus', 'sub_lit'],
      maxHoursPerWeek: 34,
    });
  }

  // 2. Учителя математики начального и среднего звена (1-6 классы)
  for (let i = 1; i <= 3; i++) {
    result.push({
      id: `tch_math_mid_s1_${i}`,
      name: `Учитель математики (1-6 кл) №${i} (1 см)`,
      shortName: `Матем №${i} (1 см)`,
      subjectIds: ['sub_math'],
      maxHoursPerWeek: 28,
      shift: 1,
    });
  }
  for (let i = 1; i <= 2; i++) {
    result.push({
      id: `tch_math_mid_s2_${i}`,
      name: `Учитель математики (1-6 кл) №${i + 3} (2 см)`,
      shortName: `Матем №${i + 3} (2 см)`,
      subjectIds: ['sub_math'],
      maxHoursPerWeek: 28,
      shift: 2,
    });
  }
  result.push({
    id: `tch_math_mid_both_1`,
    name: `Учитель математики (1-6 кл) №6 (1 и 2 см)`,
    shortName: `Матем №6 (1-2 см)`,
    subjectIds: ['sub_math'],
    maxHoursPerWeek: 32,
  });

  // 3. Учителя алгебры и геометрии (старшие 7-11 классы: преподают и алгебру, и геометрию!)
  for (let i = 1; i <= 4; i++) {
    result.push({
      id: `tch_alg_geom_s1_${i}`,
      name: `Учитель алгебры и геометрии №${i} (1 см)`,
      shortName: `Алг/Геом №${i} (1 см)`,
      subjectIds: ['sub_math', 'sub_geom'],
      maxHoursPerWeek: 28,
      shift: 1,
    });
  }
  for (let i = 1; i <= 2; i++) {
    result.push({
      id: `tch_alg_geom_s2_${i}`,
      name: `Учитель алгебры и геометрии №${i + 4} (2 см)`,
      shortName: `Алг/Геом №${i + 4} (2 см)`,
      subjectIds: ['sub_math', 'sub_geom'],
      maxHoursPerWeek: 28,
      shift: 2,
    });
  }
  result.push({
    id: `tch_alg_geom_both_1`,
    name: `Учитель алгебры и геометрии №7 (1 и 2 см)`,
    shortName: `Алг/Геом №7 (1-2 см)`,
    subjectIds: ['sub_math', 'sub_geom'],
    maxHoursPerWeek: 34,
  });

  // 4. Иностранный язык (Английский - деление на группы в параллелях)
  for (let i = 1; i <= 6; i++) {
    result.push({
      id: `tch_eng_s1_${i}`,
      name: `Учитель англ. яз. №${i} (1 см)`,
      shortName: `Англ №${i} (1 см)`,
      subjectIds: ['sub_eng'],
      maxHoursPerWeek: 28,
      shift: 1,
    });
  }
  for (let i = 1; i <= 4; i++) {
    result.push({
      id: `tch_eng_s2_${i}`,
      name: `Учитель англ. яз. №${i + 6} (2 см)`,
      shortName: `Англ №${i + 6} (2 см)`,
      subjectIds: ['sub_eng'],
      maxHoursPerWeek: 28,
      shift: 2,
    });
  }
  for (let i = 1; i <= 2; i++) {
    result.push({
      id: `tch_eng_both_${i}`,
      name: `Учитель англ. яз. №${i + 10} (1 и 2 см)`,
      shortName: `Англ №${i + 10} (1-2 см)`,
      subjectIds: ['sub_eng'],
      maxHoursPerWeek: 32,
    });
  }

  // 5. История и обществознание
  for (let i = 1; i <= 3; i++) {
    result.push({
      id: `tch_hist_s1_${i}`,
      name: `Учитель истории и обществознания №${i} (1 см)`,
      shortName: `Ист/Общ №${i} (1 см)`,
      subjectIds: ['sub_hist', 'sub_soc'],
      maxHoursPerWeek: 28,
      shift: 1,
    });
  }
  result.push({
    id: `tch_hist_s2_1`,
    name: `Учитель истории и обществознания №4 (2 см)`,
    shortName: `Ист/Общ №4 (2 см)`,
    subjectIds: ['sub_hist', 'sub_soc'],
    maxHoursPerWeek: 28,
    shift: 2,
  });
  result.push({
    id: `tch_hist_both_1`,
    name: `Учитель истории и обществознания №5 (1 и 2 см)`,
    shortName: `Ист/Общ №5 (1-2 см)`,
    subjectIds: ['sub_hist', 'sub_soc'],
    maxHoursPerWeek: 32,
  });

  // 6. Физика
  result.push({
    id: `tch_phys_s1_1`,
    name: `Учитель физики №1 (1 см)`,
    shortName: `Физика №1 (1 см)`,
    subjectIds: ['sub_phys'],
    maxHoursPerWeek: 28,
    shift: 1,
  });
  result.push({
    id: `tch_phys_both_1`,
    name: `Учитель физики №2 (1 и 2 см)`,
    shortName: `Физика №2 (1-2 см)`,
    subjectIds: ['sub_phys'],
    maxHoursPerWeek: 32,
  });

  // 7. Химия
  result.push({
    id: `tch_chem_s1_1`,
    name: `Учитель химии №1 (1 см)`,
    shortName: `Химия №1 (1 см)`,
    subjectIds: ['sub_chem'],
    maxHoursPerWeek: 28,
    shift: 1,
  });
  result.push({
    id: `tch_chem_both_1`,
    name: `Учитель химии №2 (1 и 2 см)`,
    shortName: `Химия №2 (1-2 см)`,
    subjectIds: ['sub_chem'],
    maxHoursPerWeek: 32,
  });

  // 8. Биология / Окружающий мир
  for (let i = 1; i <= 3; i++) {
    result.push({
      id: `tch_bio_s1_${i}`,
      name: `Учитель биологии №${i} (1 см)`,
      shortName: `Биология №${i} (1 см)`,
      subjectIds: ['sub_bio'],
      maxHoursPerWeek: 28,
      shift: 1,
    });
  }
  result.push({
    id: `tch_bio_s2_1`,
    name: `Учитель биологии №4 (2 см)`,
    shortName: `Биология №4 (2 см)`,
    subjectIds: ['sub_bio'],
    maxHoursPerWeek: 28,
    shift: 2,
  });
  result.push({
    id: `tch_bio_both_1`,
    name: `Учитель биологии №5 (1 и 2 см)`,
    shortName: `Биология №5 (1-2 см)`,
    subjectIds: ['sub_bio'],
    maxHoursPerWeek: 32,
  });

  // 9. География
  result.push({
    id: `tch_geog_s1_1`,
    name: `Учитель географии №1 (1 см)`,
    shortName: `География №1 (1 см)`,
    subjectIds: ['sub_geog'],
    maxHoursPerWeek: 28,
    shift: 1,
  });
  result.push({
    id: `tch_geog_s2_1`,
    name: `Учитель географии №2 (2 см)`,
    shortName: `География №2 (2 см)`,
    subjectIds: ['sub_geog'],
    maxHoursPerWeek: 28,
    shift: 2,
  });
  result.push({
    id: `tch_geog_both_1`,
    name: `Учитель географии №3 (1 и 2 см)`,
    shortName: `География №3 (1-2 см)`,
    subjectIds: ['sub_geog'],
    maxHoursPerWeek: 32,
  });

  // 10. Информатика
  for (let i = 1; i <= 2; i++) {
    result.push({
      id: `tch_inf_s1_${i}`,
      name: `Учитель информатики №${i} (1 см)`,
      shortName: `Информ №${i} (1 см)`,
      subjectIds: ['sub_inf'],
      maxHoursPerWeek: 28,
      shift: 1,
    });
  }
  result.push({
    id: `tch_inf_s2_1`,
    name: `Учитель информатики №3 (2 см)`,
    shortName: `Информ №3 (2 см)`,
    subjectIds: ['sub_inf'],
    maxHoursPerWeek: 28,
    shift: 2,
  });
  result.push({
    id: `tch_inf_both_1`,
    name: `Учитель информатики №4 (1 и 2 см)`,
    shortName: `Информ №4 (1-2 см)`,
    subjectIds: ['sub_inf'],
    maxHoursPerWeek: 32,
  });

  // 11. Физическая культура
  for (let i = 1; i <= 4; i++) {
    result.push({
      id: `tch_pe_s1_${i}`,
      name: `Учитель физкультуры №${i} (1 см)`,
      shortName: `Физ-ра №${i} (1 см)`,
      subjectIds: ['sub_pe'],
      maxHoursPerWeek: 28,
      shift: 1,
    });
  }
  for (let i = 1; i <= 2; i++) {
    result.push({
      id: `tch_pe_s2_${i}`,
      name: `Учитель физкультуры №${i + 4} (2 см)`,
      shortName: `Физ-ра №${i + 4} (2 см)`,
      subjectIds: ['sub_pe'],
      maxHoursPerWeek: 28,
      shift: 2,
    });
  }
  result.push({
    id: `tch_pe_both_1`,
    name: `Учитель физкультуры №7 (1 и 2 см)`,
    shortName: `Физ-ра №7 (1-2 см)`,
    subjectIds: ['sub_pe'],
    maxHoursPerWeek: 32,
  });

  // 12. Технология (Труд)
  result.push({
    id: `tch_tech_s1_1`,
    name: `Учитель технологии №1 (1 см)`,
    shortName: `Технолог №1 (1 см)`,
    subjectIds: ['sub_tech'],
    maxHoursPerWeek: 28,
    shift: 1,
  });
  result.push({
    id: `tch_tech_s2_1`,
    name: `Учитель технологии №2 (2 см)`,
    shortName: `Технолог №2 (2 см)`,
    subjectIds: ['sub_tech'],
    maxHoursPerWeek: 28,
    shift: 2,
  });

  // 13. ИЗО и Музыка
  result.push({
    id: `tch_art_s1_1`,
    name: `Учитель ИЗО и музыки №1 (1 см)`,
    shortName: `ИЗО/Муз №1 (1 см)`,
    subjectIds: ['sub_art'],
    maxHoursPerWeek: 28,
    shift: 1,
  });
  result.push({
    id: `tch_art_s2_1`,
    name: `Учитель ИЗО и музыки №2 (2 см)`,
    shortName: `ИЗО/Муз №2 (2 см)`,
    subjectIds: ['sub_art'],
    maxHoursPerWeek: 28,
    shift: 2,
  });

  // 14. ОБЖ
  result.push({
    id: `tch_obzh_both_1`,
    name: `Учитель ОБЖ (1 и 2 см)`,
    shortName: `ОБЖ (1-2 см)`,
    subjectIds: ['sub_obzh'],
    maxHoursPerWeek: 30,
  });

  // 15. Классные руководители (по одному на каждый из 44 классов)
  classes.forEach((c) => {
    const isPrimary = c.grade <= 4;
    result.push({
      id: c.homeroomTeacherId || `tch_homeroom_${c.id}`,
      name: isPrimary ? `Классный руководитель (${c.name}) – нач. классы` : `Классный руководитель (${c.name})`,
      shortName: isPrimary ? `Учит. ${c.name}` : `Кл. рук. ${c.name}`,
      subjectIds: isPrimary ? ['sub_primary'] : [],
      maxHoursPerWeek: 30,
      shift: c.shift,
      isHomeroom: true,
      homeroomClassId: c.id,
      preferredRoomId: c.homeroomRoomId,
    });
  });

  return result;
}

export const DEFAULT_TEACHERS: Teacher[] = buildRealisticSchoolTeachers(DEFAULT_CLASSES);

export const DEFAULT_PARALLEL_LIMITS: Record<number, number> = {
  1: 5,
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

// Generates typical curriculum for each of the 11 grades
export function getStandardCurriculumForGrade(grade: number): Array<{
  subjectId: string;
  hours: number;
  dividedIntoGroups?: boolean;
  groupCount?: number;
}> {
  if (grade === 1) {
    return [
      { subjectId: 'sub_primary', hours: 16 }, // Уроки начальной школы (ведет классный руководитель)
      { subjectId: 'sub_eng', hours: 2, dividedIntoGroups: true, groupCount: 2 }, // Иностранный язык (деление на 2 группы)
      { subjectId: 'sub_pe', hours: 3 }, // Физкультура
    ];
  }
  if (grade <= 4) {
    return [
      { subjectId: 'sub_primary', hours: 17 }, // Уроки начальной школы (ведет классный руководитель)
      { subjectId: 'sub_eng', hours: 3, dividedIntoGroups: true, groupCount: 2 }, // Иностранный язык (деление на 2 группы)
      { subjectId: 'sub_pe', hours: 3 }, // Физкультура
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
      { subjectId: 'sub_eng', hours: 3, dividedIntoGroups: true, groupCount: 2 },
      { subjectId: 'sub_pe', hours: 3 },
      { subjectId: 'sub_inf', hours: 1, dividedIntoGroups: true, groupCount: 2 },
      { subjectId: 'sub_art', hours: 1 },
      { subjectId: 'sub_tech', hours: 2 },
    ];
  }
  if (grade === 7) {
    return [
      { subjectId: 'sub_rus', hours: 4 },
      { subjectId: 'sub_lit', hours: 2 },
      { subjectId: 'sub_math', hours: 3 },
      { subjectId: 'sub_geom', hours: 2 },
      { subjectId: 'sub_inf', hours: 1, dividedIntoGroups: true, groupCount: 2 },
      { subjectId: 'sub_phys', hours: 2 },
      { subjectId: 'sub_chem', hours: 1 },
      { subjectId: 'sub_bio', hours: 2 },
      { subjectId: 'sub_hist', hours: 2 },
      { subjectId: 'sub_soc', hours: 1 },
      { subjectId: 'sub_geog', hours: 2 },
      { subjectId: 'sub_eng', hours: 3, dividedIntoGroups: true, groupCount: 2 },
      { subjectId: 'sub_pe', hours: 2 },
      { subjectId: 'sub_obzh', hours: 1 },
      { subjectId: 'sub_tech', hours: 2 },
    ];
  }
  if (grade === 8) {
    return [
      { subjectId: 'sub_rus', hours: 4 },
      { subjectId: 'sub_lit', hours: 2 },
      { subjectId: 'sub_math', hours: 3 },
      { subjectId: 'sub_geom', hours: 2 },
      { subjectId: 'sub_inf', hours: 2, dividedIntoGroups: true, groupCount: 2 },
      { subjectId: 'sub_phys', hours: 2 },
      { subjectId: 'sub_chem', hours: 2 },
      { subjectId: 'sub_bio', hours: 2 },
      { subjectId: 'sub_hist', hours: 2 },
      { subjectId: 'sub_soc', hours: 1 },
      { subjectId: 'sub_geog', hours: 2 },
      { subjectId: 'sub_eng', hours: 3, dividedIntoGroups: true, groupCount: 2 },
      { subjectId: 'sub_pe', hours: 2 },
      { subjectId: 'sub_obzh', hours: 1 },
      { subjectId: 'sub_tech', hours: 0 },
    ];
  }
  if (grade === 9) {
    return [
      { subjectId: 'sub_rus', hours: 3 },
      { subjectId: 'sub_lit', hours: 3 },
      { subjectId: 'sub_math', hours: 3 },
      { subjectId: 'sub_geom', hours: 2 },
      { subjectId: 'sub_inf', hours: 2, dividedIntoGroups: true, groupCount: 2 },
      { subjectId: 'sub_phys', hours: 2 },
      { subjectId: 'sub_chem', hours: 2 },
      { subjectId: 'sub_bio', hours: 2 },
      { subjectId: 'sub_hist', hours: 2 },
      { subjectId: 'sub_soc', hours: 1 },
      { subjectId: 'sub_geog', hours: 2 },
      { subjectId: 'sub_eng', hours: 3, dividedIntoGroups: true, groupCount: 2 },
      { subjectId: 'sub_pe', hours: 2 },
      { subjectId: 'sub_obzh', hours: 1 },
    ];
  }
  // Старшая школа (10-11 классы)
  return [
    { subjectId: 'sub_rus', hours: 3 },
    { subjectId: 'sub_lit', hours: 3 },
    { subjectId: 'sub_math', hours: 4 },
    { subjectId: 'sub_geom', hours: 2 },
    { subjectId: 'sub_inf', hours: 3, dividedIntoGroups: true, groupCount: 2 },
    { subjectId: 'sub_phys', hours: 3 },
    { subjectId: 'sub_chem', hours: 2 },
    { subjectId: 'sub_bio', hours: 2 },
    { subjectId: 'sub_hist', hours: 3 },
    { subjectId: 'sub_soc', hours: 2 },
    { subjectId: 'sub_geog', hours: 1 },
    { subjectId: 'sub_eng', hours: 3, dividedIntoGroups: true, groupCount: 2 },
    { subjectId: 'sub_pe', hours: 2 },
    { subjectId: 'sub_obzh', hours: 1 },
  ];
}

export function getDefaultAppState(): AppState {
  const classes = [...DEFAULT_CLASSES];
  const subjects = [...DEFAULT_SUBJECTS];
  const teachers = [...DEFAULT_TEACHERS];
  const rooms = [...DEFAULT_ROOMS];
  const parallelLimits = { ...DEFAULT_PARALLEL_LIMITS };

  // Build raw curriculum items
  const rawCurriculum: CurriculumItem[] = [];

  classes.forEach((cls) => {
    const stdPlan = getStandardCurriculumForGrade(cls.grade);
    stdPlan.forEach((planItem) => {
      rawCurriculum.push({
        id: `curr_${cls.id}_${planItem.subjectId}`,
        classId: cls.id,
        subjectId: planItem.subjectId,
        hoursPerWeek: planItem.hours,
        dividedIntoGroups: planItem.dividedIntoGroups || false,
        groupCount: planItem.groupCount || (planItem.dividedIntoGroups ? 2 : 1),
      });
    });
  });

  // Use pedagogical auto-assigner for 100% paired, shift-aware assignment
  const curriculum = autoAssignTeachers(rawCurriculum, classes, subjects, teachers);

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
  
  // Custom demo constraints for demonstration
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
      id: 'rule_chem_10a',
      subjectId: 'sub_chem',
      classId: 'cls_10a',
      conditionType: 'day_first',
      dayOfWeek: 2, // Wednesday
      enabled: true,
      title: '10А: Химия в среду 1-м уроком',
    },
    {
      id: 'rule_pe_1a',
      subjectId: 'sub_pe',
      classId: 'cls_1a',
      conditionType: 'always_last',
      enabled: false,
      title: '1А: Физкультура последним уроком',
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
