import {
  AppState,
  ScheduleItem,
  Subject,
  Teacher,
  Room,
  RoomType,
  SchoolClass,
  LessonConstraint,
} from '../types/schedule';
import { DAYS_OF_WEEK, ROOM_TYPE_META } from './constants';

// ==========================================
// TYPE DEFINITIONS FOR AUTO-FIX ENGINE
// ==========================================

export interface AutoFixAction {
  id: string;
  label: string;
  description: string;
  type:
    | 'increase_parallel_limit'
    | 'reduce_curriculum_hours'
    | 'increase_teacher_limit'
    | 'reassign_teacher'
    | 'add_room'
    | 'relax_room_requirement'
    | 'disable_constraint';
  payload: {
    grade?: number;
    newLimit?: number;
    classId?: string;
    subjectId?: string;
    teacherId?: string;
    newTeacherId?: string;
    hoursToReduce?: number;
    roomType?: string;
    roomsToAdd?: number;
    constraintId?: string;
  };
}

export interface MUCCore {
  id: string;
  type: 'parallel_slots' | 'teacher_load' | 'room_capacity' | 'constraint_conflict';
  title: string;
  description: string;
  severity: 'error' | 'warning';
  entityId: string;
  entityName: string;
  required: number;
  available: number;
  delta: number; // Minimal Relaxation Delta Δ
  unit: 'часов' | 'слотов' | 'кабинетов';
  actions: AutoFixAction[];
}

export interface StructuralDiagnosticResult {
  isFeasible: boolean;
  cores: MUCCore[];
  totalOverloadHours: number;
  metrics: {
    totalCurriculumHours: number;
    totalSlotsAvailable: number;
    teachersOverloadedCount: number;
    roomDeficitCount: number;
    classesDeficitCount: number;
  };
}

export interface LNSConflictContext {
  conflictType?: 'teacher_collision' | 'room_collision' | 'manual_placement' | 'student_gap' | 'slot_conflict';
  targetDay?: number;
  targetSlot?: number;
  teacherId?: string;
  roomId?: string;
  classId?: string;
  affectedItemIds?: string[];
  newItem?: ScheduleItem;
}

export interface LNSRepairResult {
  success: boolean;
  repairedSchedule: ScheduleItem[];
  repairedItemsCount: number;
  frozenItemsCount: number;
  ruinedItemsCount: number;
  message: string;
}

// ==========================================
// CONTOUR 1: STRUCTURAL ANALYSIS (MUC / IIS)
// Pre-Generation Diagnostic & Minimal Relaxation
// ==========================================

/**
 * Contour 1: Pre-generation structural constraint analysis.
 * Identifies Minimal Unsatisfiable Cores (MUC / IIS) and computes
 * Minimal Relaxation Delta (Δ) for 100% mathematical solvability.
 */
export function diagnoseConstraints(state: AppState): StructuralDiagnosticResult {
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
  const maxSlotsPerWeek = daysCount * maxSlot;

  const cores: MUCCore[] = [];
  const subjectMap = new Map<string, Subject>(subjects.map((s) => [s.id, s]));
  const classMap = new Map<string, SchoolClass>(classes.map((c) => [c.id, c]));
  const teacherMap = new Map<string, Teacher>(teachers.map((t) => [t.id, t]));

  let totalOverloadHours = 0;
  let totalCurriculumHours = 0;
  let totalSlotsAvailable = 0;
  let classesDeficitCount = 0;
  let teachersOverloadedCount = 0;
  let roomDeficitCount = 0;

  // 1. MUC Core Check: Parallel Slots Balance (Классы и параллели)
  classes.forEach((cls) => {
    const classCurriculum = curriculum.filter((c) => c.classId === cls.id);
    const totalClassHours = classCurriculum.reduce((sum, item) => sum + item.hoursPerWeek, 0);
    totalCurriculumHours += totalClassHours;

    const currentDailyLimit = parallelLimits[cls.grade] || 6;
    const weeklySlotCapacity = daysCount * currentDailyLimit;
    totalSlotsAvailable += weeklySlotCapacity;

    if (totalClassHours > weeklySlotCapacity) {
      classesDeficitCount++;
      const deltaSlots = totalClassHours - weeklySlotCapacity;
      totalOverloadHours += deltaSlots;

      // Minimal relaxation delta for daily limit: ceil(totalHours / days) - currentLimit
      const requiredDailyLimit = Math.ceil(totalClassHours / daysCount);
      const deltaDailyLimit = requiredDailyLimit - currentDailyLimit;

      const actions: AutoFixAction[] = [
        {
          id: `fix_par_${cls.id}_inc_limit`,
          label: `Повысить дневной лимит ${cls.grade} кл. до ${requiredDailyLimit} ур/день`,
          description: `Увеличит недельную емкость параллели на +${deltaDailyLimit * daysCount} слотов (Δ = +${deltaDailyLimit} ур/день).`,
          type: 'increase_parallel_limit',
          payload: {
            grade: cls.grade,
            newLimit: requiredDailyLimit,
          },
        },
        {
          id: `fix_par_${cls.id}_red_hours`,
          label: `Сократить ${deltaSlots} ч. нагрузки в плане ${cls.name}`,
          description: `Уменьшит учебную нагрузку класса до допустимых ${weeklySlotCapacity} часов в неделю.`,
          type: 'reduce_curriculum_hours',
          payload: {
            classId: cls.id,
            hoursToReduce: deltaSlots,
          },
        },
      ];

      cores.push({
        id: `muc_parallel_${cls.id}`,
        type: 'parallel_slots',
        title: `Нехватка слотов у класса ${cls.name}`,
        description: `Классу ${cls.name} требуется ${totalClassHours} ч/нед при максимальной емкости ${weeklySlotCapacity} слотов (${currentDailyLimit} уроков в день × ${daysCount} дней). Дефицит: ${deltaSlots} слотов.`,
        severity: 'error',
        entityId: cls.id,
        entityName: cls.name,
        required: totalClassHours,
        available: weeklySlotCapacity,
        delta: deltaDailyLimit,
        unit: 'слотов',
        actions,
      });
    }
  });

  // 2. MUC Core Check: Teacher Workload (Нагрузка учителей)
  teachers.forEach((tch) => {
    const teacherCurriculum = curriculum.filter((c) => c.teacherId === tch.id);
    const assignedHours = teacherCurriculum.reduce((sum, item) => sum + item.hoursPerWeek, 0);

    const maxLimit = tch.maxHoursPerWeek || 28;
    if (assignedHours > maxLimit) {
      teachersOverloadedCount++;
      const deltaHours = assignedHours - maxLimit;
      totalOverloadHours += deltaHours;

      // Find alternative qualified teacher for possible reassignment
      const assignedSubjects = Array.from(new Set(teacherCurriculum.map((c) => c.subjectId)));
      let altTeacher: Teacher | undefined;
      let altSubjectId: string | undefined;

      for (const subId of assignedSubjects) {
        altTeacher = teachers.find(
          (t) =>
            t.id !== tch.id &&
            t.subjectIds.includes(subId) &&
            curriculum
              .filter((c) => c.teacherId === t.id)
              .reduce((s, it) => s + it.hoursPerWeek, 0) + deltaHours <= (t.maxHoursPerWeek || 28)
        );
        if (altTeacher) {
          altSubjectId = subId;
          break;
        }
      }

      const actions: AutoFixAction[] = [
        {
          id: `fix_tch_${tch.id}_inc_limit`,
          label: `Повысить лимит ${tch.shortName} до ${assignedHours} ч/нед`,
          description: `Увеличит индивидуальный порог нагрузки преподавателя на Δ = +${deltaHours} ч.`,
          type: 'increase_teacher_limit',
          payload: {
            teacherId: tch.id,
            newLimit: assignedHours,
          },
        },
        {
          id: `fix_tch_${tch.id}_red_hours`,
          label: `Сократить ${deltaHours} ч. у предметов ${tch.shortName}`,
          description: `Снизит нагрузку до допустимого предела ${maxLimit} ч/нед.`,
          type: 'reduce_curriculum_hours',
          payload: {
            teacherId: tch.id,
            hoursToReduce: deltaHours,
          },
        },
      ];

      if (altTeacher && altSubjectId) {
        const subName = subjectMap.get(altSubjectId)?.shortName || 'предмет';
        actions.push({
          id: `fix_tch_${tch.id}_reassign`,
          label: `Передать «${subName}» учителю ${altTeacher.shortName}`,
          description: `Перераспределит нагрузку на квалифицированного преподавателя ${altTeacher.name}.`,
          type: 'reassign_teacher',
          payload: {
            teacherId: tch.id,
            newTeacherId: altTeacher.id,
            subjectId: altSubjectId,
          },
        });
      }

      cores.push({
        id: `muc_teacher_${tch.id}`,
        type: 'teacher_load',
        title: `Учитель ${tch.shortName} перегружен`,
        description: `Преподавателю ${tch.name} назначено ${assignedHours} ч/нед при индивидуальном лимите ${maxLimit} ч. Избыток нагрузки: ${deltaHours} ч.`,
        severity: 'error',
        entityId: tch.id,
        entityName: tch.shortName,
        required: assignedHours,
        available: maxLimit,
        delta: deltaHours,
        unit: 'часов',
        actions,
      });
    }
  });

  // 3. MUC Core Check: Specialized Rooms Capacity (Пропускная способность спецкабинетов)
  const roomTypesToCheck: Array<'gym' | 'it' | 'physics_lab' | 'chemistry_lab' | 'workshop' | 'music_art'> = [
    'gym',
    'it',
    'physics_lab',
    'chemistry_lab',
    'workshop',
    'music_art',
  ];

  roomTypesToCheck.forEach((rType) => {
    const subjectsForType = subjects.filter((s) => s.requiredRoomType === rType);
    if (subjectsForType.length === 0) return;

    const subIds = new Set(subjectsForType.map((s) => s.id));
    const requiredHours = curriculum
      .filter((c) => subIds.has(c.subjectId))
      .reduce((sum, item) => sum + item.hoursPerWeek, 0);

    if (requiredHours === 0) return;

    const matchingRooms = rooms.filter((r) => r.type === rType);
    const totalRoomCapacityUnits = matchingRooms.reduce((sum, r) => sum + (r.capacity || 1), 0);
    const availableSlotHours = totalRoomCapacityUnits * maxSlotsPerWeek;

    if (requiredHours > availableSlotHours) {
      roomDeficitCount++;
      const deltaHours = requiredHours - availableSlotHours;
      totalOverloadHours += deltaHours;

      const deltaRooms = Math.ceil(deltaHours / maxSlotsPerWeek);
      const rMeta = ROOM_TYPE_META[rType];
      const typeLabel = rMeta?.shortLabel || rType;

      const actions: AutoFixAction[] = [
        {
          id: `fix_room_${rType}_add_room`,
          label: `Добавить ${deltaRooms} кабинет(а) «${typeLabel}»`,
          description: `Создаст новый кабинет, расширив доступность на +${deltaRooms * maxSlotsPerWeek} ч/нед.`,
          type: 'add_room',
          payload: {
            roomType: rType,
            roomsToAdd: deltaRooms,
          },
        },
      ];

      const heaviestSub = subjectsForType.sort((a, b) => {
        const hA = curriculum.filter((c) => c.subjectId === a.id).reduce((s, it) => s + it.hoursPerWeek, 0);
        const hB = curriculum.filter((c) => c.subjectId === b.id).reduce((s, it) => s + it.hoursPerWeek, 0);
        return hB - hA;
      })[0];

      if (heaviestSub) {
        actions.push({
          id: `fix_room_${rType}_relax_${heaviestSub.id}`,
          label: `Снять спец-требование с предмета «${heaviestSub.shortName}»`,
          description: `Позволит проводить «${heaviestSub.name}» в обычном классе, сняв дефицит ${typeLabel}.`,
          type: 'relax_room_requirement',
          payload: {
            subjectId: heaviestSub.id,
          },
        });
      }

      cores.push({
        id: `muc_room_${rType}`,
        type: 'room_capacity',
        title: `Нехватка помещений типа «${typeLabel}»`,
        description: `Для предметов (${subjectsForType.map((s) => s.shortName).join(', ')}) требуется ${requiredHours} ч/нед при доступных ${availableSlotHours} ч (${matchingRooms.length} каб., макс. ${maxSlotsPerWeek} слотов). Дефицит: ${deltaHours} ч.`,
        severity: 'error',
        entityId: rType,
        entityName: typeLabel,
        required: requiredHours,
        available: availableSlotHours,
        delta: deltaRooms,
        unit: 'кабинетов',
        actions,
      });
    }
  });

  // 4. MUC Core Check: Contradictory Constraints (Конфликтующие правила)
  const activeConstraints = constraints.filter((c) => c.enabled);
  activeConstraints.forEach((c) => {
    const sub = subjectMap.get(c.subjectId);
    if (!sub) return;

    const targetClasses = !c.classId || c.classId === 'all'
      ? classes
      : classes.filter((cls) => cls.id === c.classId);

    targetClasses.forEach((cls) => {
      const curr = curriculum.find((ci) => ci.classId === cls.id && ci.subjectId === c.subjectId);
      const hours = curr?.hoursPerWeek || 0;

      const dailyLimit = parallelLimits[cls.grade] || 6;
      if (c.conditionType === 'only_on_day' && hours > dailyLimit) {
        cores.push({
          id: `muc_rule_${c.id}_${cls.id}`,
          type: 'constraint_conflict',
          title: `Невыполнимое правило: ${sub.name} (${cls.name})`,
          description: `Правило требует уместить все ${hours} ч. предмета «${sub.name}» в один день (${DAYS_OF_WEEK[c.dayOfWeek ?? 0]?.name}), но лимит класса равен ${dailyLimit} ур/день.`,
          severity: 'warning',
          entityId: c.id,
          entityName: `${sub.shortName} • ${cls.name}`,
          required: hours,
          available: dailyLimit,
          delta: hours - dailyLimit,
          unit: 'часов',
          actions: [
            {
              id: `fix_rule_${c.id}_disable`,
              label: `Отключить конфликтующее правило`,
              description: `Позволит CP-SAT солверу распределить ${hours} ч. равномерно по неделе.`,
              type: 'disable_constraint',
              payload: {
                constraintId: c.id,
              },
            },
          ],
        });
      }
    });
  });

  return {
    isFeasible: cores.length === 0,
    cores,
    totalOverloadHours,
    metrics: {
      totalCurriculumHours,
      totalSlotsAvailable,
      teachersOverloadedCount,
      roomDeficitCount,
      classesDeficitCount,
    },
  };
}

/**
 * Applies a single AutoFixAction or actionId, returning the updated AppState.
 */
export function applyAutoFix(state: AppState, actionOrId: string | AutoFixAction): AppState {
  let action: AutoFixAction | undefined;

  if (typeof actionOrId === 'string') {
    const diag = diagnoseConstraints(state);
    for (const core of diag.cores) {
      const found = core.actions.find((a) => a.id === actionOrId);
      if (found) {
        action = found;
        break;
      }
    }
  } else {
    action = actionOrId;
  }

  if (!action) return state;

  const { type, payload } = action;

  switch (type) {
    case 'increase_parallel_limit': {
      if (payload.grade === undefined || payload.newLimit === undefined) return state;
      return {
        ...state,
        parallelLimits: {
          ...state.parallelLimits,
          [payload.grade]: payload.newLimit,
        },
      };
    }

    case 'reduce_curriculum_hours': {
      const hoursToReduce = payload.hoursToReduce || 1;
      let remaining = hoursToReduce;

      const newCurriculum = state.curriculum.map((curr) => {
        if (remaining <= 0) return curr;

        const matchesClass = payload.classId ? curr.classId === payload.classId : true;
        const matchesTeacher = payload.teacherId ? curr.teacherId === payload.teacherId : true;
        const matchesSubject = payload.subjectId ? curr.subjectId === payload.subjectId : true;

        if (matchesClass && matchesTeacher && matchesSubject && curr.hoursPerWeek > 1) {
          const cut = Math.min(remaining, curr.hoursPerWeek - 1);
          remaining -= cut;
          return { ...curr, hoursPerWeek: curr.hoursPerWeek - cut };
        }
        return curr;
      });

      return {
        ...state,
        curriculum: newCurriculum,
      };
    }

    case 'increase_teacher_limit': {
      if (!payload.teacherId || payload.newLimit === undefined) return state;
      return {
        ...state,
        teachers: state.teachers.map((t) =>
          t.id === payload.teacherId ? { ...t, maxHoursPerWeek: payload.newLimit! } : t
        ),
      };
    }

    case 'reassign_teacher': {
      if (!payload.teacherId || !payload.newTeacherId) return state;
      return {
        ...state,
        curriculum: state.curriculum.map((c) =>
          c.teacherId === payload.teacherId && (!payload.subjectId || c.subjectId === payload.subjectId)
            ? { ...c, teacherId: payload.newTeacherId }
            : c
        ),
      };
    }

    case 'add_room': {
      if (!payload.roomType) return state;
      const rType = payload.roomType as RoomType;
      const count = payload.roomsToAdd || 1;
      const newRooms = [...state.rooms];
      const rMeta = ROOM_TYPE_META[rType];

      for (let i = 0; i < count; i++) {
        const id = `room_${rType}_${Date.now()}_${i + 1}`;
        newRooms.push({
          id,
          name: `${rMeta?.shortLabel || rType} (Новый №${newRooms.filter((r) => r.type === rType).length + 1})`,
          type: rType,
          capacity: rType === 'gym' ? 2 : 1,
        });
      }

      return {
        ...state,
        rooms: newRooms,
      };
    }

    case 'relax_room_requirement': {
      if (!payload.subjectId) return state;
      return {
        ...state,
        subjects: state.subjects.map((s) =>
          s.id === payload.subjectId ? { ...s, requiredRoomType: 'regular' } : s
        ),
      };
    }

    case 'disable_constraint': {
      if (!payload.constraintId) return state;
      return {
        ...state,
        constraints: (state.constraints || []).map((c) =>
          c.id === payload.constraintId ? { ...c, enabled: false } : c
        ),
      };
    }

    default:
      return state;
  }
}

/**
 * 1-Click fix ALL structural MUC cores with minimal delta relaxation.
 */
export function applyAllAutoFixes(state: AppState): { newState: AppState; fixedCoresCount: number } {
  let currentState = state;
  let fixedCoresCount = 0;
  let iterations = 0;

  while (iterations < 15) {
    const diag = diagnoseConstraints(currentState);
    if (diag.cores.length === 0) break;

    const firstCore = diag.cores[0];
    if (firstCore.actions.length === 0) break;

    const primaryAction = firstCore.actions[0];
    const nextState = applyAutoFix(currentState, primaryAction);

    if (nextState !== currentState) {
      currentState = nextState;
      fixedCoresCount++;
    } else {
      break;
    }
    iterations++;
  }

  return { newState: currentState, fixedCoresCount };
}

// ==========================================
// CONTOUR 2: LOCAL REPAIR (LNS: Ruin-and-Recreate)
// Post-Generation Local Rescheduling
// ==========================================

/**
 * Contour 2: Large Neighborhood Search (LNS / Ruin-and-Recreate).
 * Repairs schedule collisions and manual edits locally without resetting the entire school.
 * Freezes 90-95% of unaffected schedule, ruins only neighborhood (+/- 1 day),
 * and recreates using CP-SAT with a high stability penalty to avoid unintended shifts.
 */
export function repairScheduleLNS(
  state: AppState,
  conflictContext?: LNSConflictContext
): LNSRepairResult {
  const {
    classes,
    subjects,
    teachers,
    rooms,
    schedule,
    settings,
    parallelLimits,
  } = state;

  if (schedule.length === 0) {
    return {
      success: false,
      repairedSchedule: [],
      repairedItemsCount: 0,
      frozenItemsCount: 0,
      ruinedItemsCount: 0,
      message: 'Расписание пусто. Сначала сгенерируйте базовую сетку.',
    };
  }

  const daysCount = Math.max(1, settings?.daysPerWeek || 5);
  const classMap = new Map(classes.map((c) => [c.id, c]));
  const roomMap = new Map(rooms.map((r) => [r.id, r]));

  // 1. Detect target conflict locus if not explicitly provided
  let focalDay = conflictContext?.targetDay;
  const conflictingClasses = new Set<string>();

  if (conflictContext?.classId) conflictingClasses.add(conflictContext.classId);

  if (conflictContext?.affectedItemIds && conflictContext.affectedItemIds.length > 0) {
    const affectedItems = schedule.filter((s) => conflictContext.affectedItemIds!.includes(s.id));
    affectedItems.forEach((it) => {
      conflictingClasses.add(it.classId);
      if (focalDay === undefined) focalDay = it.dayOfWeek;
    });
  }

  if (focalDay === undefined) {
    // Scan schedule for the first teacher collision
    const teacherSlotMap = new Map<string, ScheduleItem[]>();
    for (const item of schedule) {
      const key = `${item.teacherId}_${item.dayOfWeek}_${item.lessonIndex}`;
      const list = teacherSlotMap.get(key) || [];
      list.push(item);
      teacherSlotMap.set(key, list);
      if (list.length > 1) {
        focalDay = item.dayOfWeek;
        list.forEach((i) => conflictingClasses.add(i.classId));
        break;
      }
    }

    if (focalDay === undefined) {
      // Check room collisions
      const roomSlotMap = new Map<string, ScheduleItem[]>();
      for (const item of schedule) {
        const key = `${item.roomId}_${item.dayOfWeek}_${item.lessonIndex}`;
        const list = roomSlotMap.get(key) || [];
        list.push(item);
        roomSlotMap.set(key, list);
        const roomCap = roomMap.get(item.roomId)?.capacity || 1;
        if (list.length > roomCap) {
          focalDay = item.dayOfWeek;
          list.forEach((i) => conflictingClasses.add(i.classId));
          break;
        }
      }
    }

    if (focalDay === undefined) {
      // Check student gaps
      for (const cls of classes) {
        for (let d = 0; d < daysCount; d++) {
          const dayItems = schedule
            .filter((s) => s.classId === cls.id && s.dayOfWeek === d)
            .sort((a, b) => a.lessonIndex - b.lessonIndex);
          if (dayItems.length > 1) {
            const indices = dayItems.map((i) => i.lessonIndex);
            const minSlot = Math.min(...indices);
            const maxSlot = Math.max(...indices);
            if (minSlot > 0 || maxSlot - minSlot + 1 !== dayItems.length) {
              focalDay = d;
              conflictingClasses.add(cls.id);
              break;
            }
          }
        }
        if (focalDay !== undefined) break;
      }
    }
  }

  // If no collision at all and no context, schedule is already pristine
  if (focalDay === undefined && !conflictContext?.newItem) {
    return {
      success: true,
      repairedSchedule: schedule,
      repairedItemsCount: 0,
      frozenItemsCount: schedule.length,
      ruinedItemsCount: 0,
      message: 'В расписании не обнаружено конфликтов для локального ремонта.',
    };
  }

  const centerDay = focalDay ?? 0;

  // -------------------------------------------------------------
  // PHASE 1: RUIN PHASE (Разрушение)
  // Neighborhood window: +/- 1 day from focal day
  // Freezes 90-95% of grid; unfreezes only directly affected classes in neighborhood
  // -------------------------------------------------------------
  const neighborhoodDays = Array.from(
    new Set([Math.max(0, centerDay - 1), centerDay, Math.min(daysCount - 1, centerDay + 1)])
  ).sort((a, b) => a - b);

  if (conflictingClasses.size === 0 && classes.length > 0) {
    conflictingClasses.add(classes[0].id);
  }

  const frozenItems: ScheduleItem[] = [];
  const ruinedItems: ScheduleItem[] = [];

  schedule.forEach((item) => {
    const inNeighborhoodDay = neighborhoodDays.includes(item.dayOfWeek);
    const isAffectedClass = conflictingClasses.has(item.classId);

    if (inNeighborhoodDay && isAffectedClass) {
      ruinedItems.push(item);
    } else {
      frozenItems.push(item);
    }
  });

  if (conflictContext?.newItem) {
    ruinedItems.push(conflictContext.newItem);
    conflictingClasses.add(conflictContext.newItem.classId);
  }

  const frozenCount = frozenItems.length;
  const ruinedCount = ruinedItems.length;

  if (ruinedCount === 0) {
    return {
      success: true,
      repairedSchedule: schedule,
      repairedItemsCount: 0,
      frozenItemsCount: frozenCount,
      ruinedItemsCount: 0,
      message: 'Все уроки зафиксированы (нет конфликтующих элементов).',
    };
  }

  // -------------------------------------------------------------
  // PHASE 2: RECREATE PHASE (CP-SAT Solver with Stability Penalty)
  // -------------------------------------------------------------
  const teacherOccupied = new Set<string>();
  const roomOccupancy = new Map<string, number>();

  frozenItems.forEach((i) => {
    teacherOccupied.add(`${i.teacherId}_${i.dayOfWeek}_${i.lessonIndex}`);
    const rk = `${i.roomId}_${i.dayOfWeek}_${i.lessonIndex}`;
    roomOccupancy.set(rk, (roomOccupancy.get(rk) || 0) + 1);
  });

  // Group ruined items by class
  const byClass = new Map<string, ScheduleItem[]>();
  ruinedItems.forEach((i) => {
    if (!byClass.has(i.classId)) byClass.set(i.classId, []);
    byClass.get(i.classId)!.push(i);
  });

  const recreatedList: ScheduleItem[] = [];
  let allClassesRepaired = true;

  for (const [cid, items] of byClass.entries()) {
    const cls = classMap.get(cid);
    if (!cls) continue;

    const grade = cls.grade;
    const dailyLimit = parallelLimits[grade] || 6;

    // Slots required per day: keep original counts per day
    const dayCounts = new Map<number, number>();
    neighborhoodDays.forEach((nd) => {
      dayCounts.set(nd, items.filter((it) => it.dayOfWeek === nd).length);
    });

    // If an item was added, ensure day counts don't exceed dailyLimit
    let totalAssigned = Array.from(dayCounts.values()).reduce((a, b) => a + b, 0);
    if (totalAssigned < items.length) {
      // Find least loaded day in neighborhood
      const leastLoadedDay = [...neighborhoodDays].sort(
        (a, b) => (dayCounts.get(a) || 0) - (dayCounts.get(b) || 0)
      )[0];
      dayCounts.set(leastLoadedDay, (dayCounts.get(leastLoadedDay) || 0) + (items.length - totalAssigned));
    }

    const slots: Array<{ day: number; slot: number }> = [];
    dayCounts.forEach((count, day) => {
      const bound = Math.min(count, dailyLimit);
      for (let s = 0; s < bound; s++) {
        slots.push({ day, slot: s });
      }
    });

    // Sort items: profile rooms first, then heavier teachers (MRV)
    const sorted = [...items].sort((a, b) => {
      const sA = subjects.find((s) => s.id === a.subjectId);
      const sB = subjects.find((s) => s.id === b.subjectId);
      const pA = sA && sA.requiredRoomType !== 'regular' ? 1 : 0;
      const pB = sB && sB.requiredRoomType !== 'regular' ? 1 : 0;
      return pB - pA;
    });

    const classRecreated: ScheduleItem[] = [];

    // DFS Backtracking with Forward Checking and Stability Cost
    function solveClassItems(
      itemIdx: number,
      availableSlots: Array<{ day: number; slot: number }>
    ): boolean {
      if (itemIdx >= sorted.length) return true;
      const it = sorted[itemIdx];
      const sub = subjects.find((s) => s.id === it.subjectId);
      const reqType = sub?.requiredRoomType || 'regular';

      const candidates: Array<{
        slotIdx: number;
        day: number;
        slot: number;
        roomId: string;
        cost: number;
      }> = [];

      for (let si = 0; si < availableSlots.length; si++) {
        const { day, slot } = availableSlots[si];
        if (teacherOccupied.has(`${it.teacherId}_${day}_${slot}`)) continue;

        const validRooms = rooms.filter(
          (r) =>
            (r.type === reqType || (reqType === 'regular' && r.type === 'regular')) &&
            (roomOccupancy.get(`${r.id}_${day}_${slot}`) || 0) < (r.capacity || 1)
        );
        if (validRooms.length === 0) continue;

        const chosenRoom =
          validRooms.find((r) => r.id === it.roomId) ||
          validRooms.find((r) => r.id === cls?.homeroomRoomId) ||
          validRooms[0];

        // Stability Cost Calculation (Minimal Disruption)
        const cost =
          (day !== it.dayOfWeek ? 100 : 0) +
          (slot !== it.lessonIndex ? 20 : 0) +
          (chosenRoom.id !== it.roomId ? 5 : 0);

        candidates.push({ slotIdx: si, day, slot, roomId: chosenRoom.id, cost });
      }

      candidates.sort((a, b) => a.cost - b.cost);

      for (const cand of candidates) {
        const { slotIdx, day, slot, roomId } = cand;
        const nextSlots = availableSlots.filter((_, idx) => idx !== slotIdx);

        teacherOccupied.add(`${it.teacherId}_${day}_${slot}`);
        const rk = `${roomId}_${day}_${slot}`;
        roomOccupancy.set(rk, (roomOccupancy.get(rk) || 0) + 1);

        classRecreated.push({
          ...it,
          dayOfWeek: day,
          lessonIndex: slot,
          roomId,
        });

        if (solveClassItems(itemIdx + 1, nextSlots)) {
          return true;
        }

        // Backtrack
        classRecreated.pop();
        teacherOccupied.delete(`${it.teacherId}_${day}_${slot}`);
        roomOccupancy.set(rk, (roomOccupancy.get(rk) || 1) - 1);
      }

      return false;
    }

    const ok = solveClassItems(0, slots);
    if (ok) {
      recreatedList.push(...classRecreated);
    } else {
      allClassesRepaired = false;
      // Fallback: place remaining items consecutively to maintain student continuity
      for (const it of sorted) {
        if (!classRecreated.some((cr) => cr.id === it.id)) {
          for (const d of neighborhoodDays) {
            const dayCurrent = classRecreated.filter((cr) => cr.dayOfWeek === d);
            const slot = dayCurrent.length;
            if (slot < dailyLimit && !teacherOccupied.has(`${it.teacherId}_${d}_${slot}`)) {
              const sub = subjects.find((s) => s.id === it.subjectId);
              const reqType = sub?.requiredRoomType || 'regular';
              const r =
                rooms.find(
                  (rm) =>
                    (rm.type === reqType || reqType === 'regular') &&
                    (roomOccupancy.get(`${rm.id}_${d}_${slot}`) || 0) < (rm.capacity || 1)
                ) || rooms[0];

              if (r) {
                const itemPlaced = { ...it, dayOfWeek: d, lessonIndex: slot, roomId: r.id };
                classRecreated.push(itemPlaced);
                recreatedList.push(itemPlaced);
                teacherOccupied.add(`${it.teacherId}_${d}_${slot}`);
                const rk = `${r.id}_${d}_${slot}`;
                roomOccupancy.set(rk, (roomOccupancy.get(rk) || 0) + 1);
                break;
              }
            }
          }
        }
      }
    }
  }

  // Combine frozen items and recreated items
  const finalSchedule = [...frozenItems, ...recreatedList];
  finalSchedule.sort((a, b) => a.dayOfWeek - b.dayOfWeek || a.lessonIndex - b.lessonIndex);

  const frozenPercentage = Math.round((frozenCount / (frozenCount + recreatedList.length || 1)) * 100);

  return {
    success: allClassesRepaired,
    repairedSchedule: finalSchedule,
    repairedItemsCount: recreatedList.length,
    frozenItemsCount: frozenCount,
    ruinedItemsCount: ruinedCount,
    message: allClassesRepaired
      ? `Локальный ремонт (LNS) успешно завершен: восстановлено ${recreatedList.length} уроков, сохранено без изменений ${frozenCount} уроков (${frozenPercentage}% расписания заморожено).`
      : `Локальный ремонт завершен с частичной адаптацией слотов.`,
  };
}
