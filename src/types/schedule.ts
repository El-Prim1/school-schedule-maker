export type RoomType =
  | 'regular'
  | 'gym'
  | 'it'
  | 'physics_lab'
  | 'chemistry_lab'
  | 'workshop'
  | 'music_art';

export interface Room {
  id: string;
  name: string;
  type: RoomType;
  capacity: number; // default 1 class, gym can be 2
  description?: string;
}

export interface Subject {
  id: string;
  name: string;
  shortName: string;
  color: string; // Tailwind color or hex
  requiredRoomType: RoomType;
  maxPerDay: number; // default 1 or 2
  difficulty: number; // 1 to 13 (SanPiN difficulty score)
  isCustom?: boolean;
}

export interface Teacher {
  id: string;
  name: string;
  shortName: string;
  subjectIds: string[];
  maxHoursPerWeek: number;
  color?: string;
  preferredRoomId?: string;
}

export interface SchoolClass {
  id: string;
  grade: number; // 1 to 11
  letter: string; // 'А', 'Б', 'В', etc.
  name: string; // '5А', '5Б', etc.
  shift: 1 | 2;
  homeroomTeacherId?: string;
  homeroomRoomId?: string;
}

export interface ParallelLimit {
  grade: number; // 1..11
  maxLessonsPerDay: number; // e.g., 5 or 6
}

export interface CurriculumItem {
  id: string;
  classId: string;
  subjectId: string;
  hoursPerWeek: number;
  teacherId?: string;
  preferredRoomId?: string;
}

export interface ScheduleItem {
  id: string;
  dayOfWeek: number; // 0: Mon, 1: Tue, 2: Wed, 3: Thu, 4: Fri, 5: Sat
  lessonIndex: number; // 0..7 (Lesson 1 to 8)
  classId: string;
  subjectId: string;
  teacherId: string;
  roomId: string;
}

export type IssueSeverity = 'error' | 'warning' | 'info';

export type IssueType =
  | 'student_gap'
  | 'teacher_collision'
  | 'room_collision'
  | 'room_type_mismatch'
  | 'daily_limit_exceeded'
  | 'missing_hours'
  | 'teacher_gap'
  | 'constraint_violation';

export type ConstraintConditionType =
  | 'always_first' // Всегда 1-й урок
  | 'always_last' // Всегда последний урок
  | 'only_on_day' // Только в определенный день недели
  | 'day_first' // В определенный день — 1-м уроком
  | 'day_last' // В определенный день — последним уроком
  | 'fixed_slot'; // Строго в определенный день и номер урока

export interface LessonConstraint {
  id: string;
  subjectId: string; // id предмета
  classId?: string; // id конкретного класса или 'all' (для всех)
  conditionType: ConstraintConditionType;
  dayOfWeek?: number; // 0..5 (0: Пн, 1: Вт, 2: Ср, 3: Чт, 4: Пт, 5: Сб)
  lessonIndex?: number; // 0..7
  enabled: boolean;
  title?: string;
}

export interface DiagnosticIssue {
  id: string;
  type: IssueType;
  severity: IssueSeverity;
  title: string;
  description: string;
  classId?: string;
  teacherId?: string;
  roomId?: string;
  dayOfWeek?: number;
  lessonIndex?: number;
  itemIds?: string[];
  canAutoFix: boolean;
  fixDescription?: string;
  constraintId?: string;
}

export interface GenerationSettings {
  daysPerWeek: 5 | 6;
  maxLessonsGlobal: number; // usually 8
  balanceSanpinDifficulty: boolean;
  prioritizeProfileRooms: boolean;
  avoidTeacherWindows: boolean;
  shift1Start: string; // e.g., '08:00'
  breakDurationMinutes: number;
}

export interface AppState {
  classes: SchoolClass[];
  subjects: Subject[];
  teachers: Teacher[];
  rooms: Room[];
  curriculum: CurriculumItem[];
  parallelLimits: Record<number, number>; // grade -> max lessons/day
  schedule: ScheduleItem[];
  settings: GenerationSettings;
  constraints?: LessonConstraint[];
  isDemoMode?: boolean;
}
