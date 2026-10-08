import React, { useState, useRef, useMemo } from 'react';
import { AppState, DiagnosticIssue, Room, RoomType, Subject, SchoolClass, Teacher } from '../types/schedule';
import {
  runDiagnostics,
  autoFixIssue,
  autoFixAllIssues,
  diagnoseConstraints,
  applyAutoFix,
  applyAllAutoFixes,
  repairScheduleLNS,
  AutoFixAction,
  MUCCore,
} from '../utils/diagnostics';
import {
  buildDependencyGraph,
  fixTeacherWindowChain,
  findAllTeacherWindows,
  fixAllTeacherWindowsChain,
  getTeacherDayWindows,
  TeacherWindowInfo,
  ChainRepairResult,
  DependencyGraphResult,
} from '../utils/chainRepairEngine';
import { syncAnonymousTeachers } from '../utils/staffingUtils';
import { DAYS_OF_WEEK } from '../utils/constants';
import { SwipeableToast } from './SwipeableToast';
import {
  CheckCircle2,
  AlertTriangle,
  AlertCircle,
  Info,
  Wrench,
  Sparkles,
  RefreshCw,
  DoorClosed,
  Users,
  Clock,
  BookOpen,
  Zap,
  Layers,
  Cpu,
  ArrowRight,
  ShieldCheck,
  PlusCircle,
  Scissors,
  Check,
  X,
  Sliders,
  TrendingUp,
  HelpCircle,
  Network,
  Coffee,
  GitBranch,
  Lock,
  Unlock,
  FastForward,
  ChevronRight,
  Activity,
} from 'lucide-react';

interface DiagnosticsPanelProps {
  state: AppState;
  onUpdateState: (newState: AppState) => void;
  onUpdateStateWithUndo?: (
    newState: AppState,
    message: string,
    type?: 'success' | 'error' | 'warning'
  ) => void;
  onNavigateToSchedule: () => void;
}

export const DiagnosticsPanel: React.FC<DiagnosticsPanelProps> = ({
  state,
  onUpdateState,
  onUpdateStateWithUndo,
  onNavigateToSchedule,
}) => {
  // Active Navigation Tab:
  // - 'contour2': Schedule Diagnostics & General LNS Local Repair
  // - 'chain_lns': Dedicated Chain-Ruin Large Neighborhood Search & Teacher Windows Center
  // - 'contour1': Structural Pre-Analysis (MUC / IIS)
  const [activeContour, setActiveContour] = useState<'contour2' | 'chain_lns' | 'contour1'>('contour2');

  // Contour 1: Structural Analysis (MUC / IIS)
  const structuralResult = diagnoseConstraints(state);

  // Contour 2: Schedule Diagnostics
  const scheduleIssues = runDiagnostics(state);

  // Chain-LNS Teacher Windows Detection across entire school
  const allTeacherWindows = useMemo(() => findAllTeacherWindows(state), [state]);
  const totalTeacherWindowsCount = useMemo(
    () => allTeacherWindows.reduce((acc, w) => acc + w.windowsCount, 0),
    [allTeacherWindows]
  );

  const [lastActionMessage, setLastActionMessage] = useState<string | null>(null);
  const [lastActionType, setLastActionType] = useState<'success' | 'error' | 'warning'>('success');
  const [isRepairingLNS, setIsRepairingLNS] = useState(false);
  const [isFixingAll, setIsFixingAll] = useState(false);
  const [isFixingChainLNS, setIsFixingChainLNS] = useState(false);
  const [repairingSpecificWindowKey, setRepairingSpecificWindowKey] = useState<string | null>(null);

  // Chain-LNS Interactive Inspector State
  const [inspectTeacherId, setInspectTeacherId] = useState<string>(
    allTeacherWindows[0]?.teacherId || state.teachers[0]?.id || ''
  );
  const [inspectDayIndex, setInspectDayIndex] = useState<number>(
    allTeacherWindows[0]?.dayIndex !== undefined ? allTeacherWindows[0].dayIndex : 0
  );
  const [inspectDepth, setInspectDepth] = useState<number>(2);
  const [inspectAdjacentDays, setInspectAdjacentDays] = useState<boolean>(false);
  const [chainLogs, setChainLogs] = useState<string[]>([]);

  // Modal for unresolvable bottlenecks / conflict resolution
  const [showConflictModal, setShowConflictModal] = useState(false);
  const [conflictModalIssues, setConflictModalIssues] = useState<DiagnosticIssue[]>([]);
  const [autoFixModalCore, setAutoFixModalCore] = useState<MUCCore | null>(null);

  const toastTimerRef = useRef<NodeJS.Timeout | null>(null);

  const showPersistentToast = (
    msg: string,
    type: 'success' | 'error' | 'warning' = 'success',
    durationMs: number = 7000
  ) => {
    if (toastTimerRef.current) {
      clearTimeout(toastTimerRef.current);
    }
    setLastActionMessage(msg);
    setLastActionType(type);
    toastTimerRef.current = setTimeout(() => {
      setLastActionMessage(null);
    }, durationMs);
  };

  const errors = scheduleIssues.filter((i) => i.severity === 'error');
  const warnings = scheduleIssues.filter((i) => i.severity === 'warning');
  const autoFixableCount = scheduleIssues.filter((i) => i.canAutoFix).length;

  // Selected teacher for inspector
  const currentInspectTeacher =
    state.teachers.find((t) => t.id === inspectTeacherId) || state.teachers[0];

  // Dependency graph calculation for inspector
  const activeInspectGraph = useMemo<DependencyGraphResult | null>(() => {
    if (!currentInspectTeacher) return null;
    return buildDependencyGraph(
      state,
      currentInspectTeacher.id,
      inspectDayIndex,
      inspectDepth,
      inspectAdjacentDays
    );
  }, [state, currentInspectTeacher, inspectDayIndex, inspectDepth, inspectAdjacentDays]);

  const currentInspectWindow = useMemo(() => {
    if (!currentInspectTeacher) return { hasWindow: false, windowsCount: 0, emptySlots: [], activeSlots: [] };
    return getTeacherDayWindows(state.schedule, currentInspectTeacher.id, inspectDayIndex);
  }, [state.schedule, currentInspectTeacher, inspectDayIndex]);

  // -------------------------------------------------------------------
  // CHAIN-LNS HANDLERS (Batch & Targeted)
  // -------------------------------------------------------------------

  // 1. Batch Chain-LNS for all teacher windows
  const handleRunAllChainLNS = async () => {
    setIsFixingChainLNS(true);
    setChainLogs([`⚡ Запуск комплексного Chain-LNS поиска по всей школе (${allTeacherWindows.length} оконных ситуаций)...`]);

    try {
      const res = await fixAllTeacherWindowsChain(state);

      if (res.repairedSchedule !== state.schedule) {
        const updatedState = { ...state, schedule: res.repairedSchedule };
        if (onUpdateStateWithUndo) {
          onUpdateStateWithUndo(updatedState, res.message, 'success');
        } else {
          onUpdateState(updatedState);
        }
      }

      setChainLogs((prev) => [
        ...prev,
        `✓ Переставлено уроков: ${res.movedLessonsTotal}`,
        `✓ Затронуто учителей в цепочках: ${res.affectedTeachersCount}`,
        `✓ Устранено окон: ${res.fixedWindowsTotal}`,
        res.message,
      ]);

      if (res.success) {
        showPersistentToast(res.message, 'success');
      } else {
        showPersistentToast(res.message, 'warning');
      }
    } catch (err) {
      console.error('Batch Chain-LNS error:', err);
      showPersistentToast('Ошибка при выполнении Chain-LNS.', 'error');
    } finally {
      setIsFixingChainLNS(false);
    }
  };

  // 2. Fix specific window for Teacher & Day
  const handleFixSingleTeacherWindow = async (teacherId: string, dayIndex: number) => {
    const key = `${teacherId}_${dayIndex}`;
    setRepairingSpecificWindowKey(key);

    try {
      const res: ChainRepairResult = await fixTeacherWindowChain(state, teacherId, dayIndex);

      if (res.success && res.eliminatedGapsCount > 0) {
        const updatedState = { ...state, schedule: res.repairedSchedule };
        if (onUpdateStateWithUndo) {
          onUpdateStateWithUndo(updatedState, res.message, 'success');
        } else {
          onUpdateState(updatedState);
        }
        showPersistentToast(res.message, 'success');
        setChainLogs((prev) => [
          `[Успех Tier ${res.tier}] ${res.message} (время: ${res.executionTimeMs} мс)`,
          ...prev.slice(0, 8),
        ]);
      } else if (!res.success) {
        if (res.unresolvableDiagnostic) {
          setAutoFixModalCore(res.unresolvableDiagnostic);
          setShowConflictModal(true);
        }
        showPersistentToast(res.message, 'warning');
        setChainLogs((prev) => [
          `[Предупреждение] ${res.message}`,
          ...prev.slice(0, 8),
        ]);
      } else {
        showPersistentToast(res.message, 'success');
      }
    } catch (err) {
      console.error('Chain-LNS error:', err);
      showPersistentToast('Ошибка при оптимизации окна учителя.', 'error');
    } finally {
      setRepairingSpecificWindowKey(null);
    }
  };

  // -------------------------------------------------------------------
  // CONTOUR 1 HANDLERS (Minimal Relaxation Delta application)
  // -------------------------------------------------------------------
  const handleApplyAction = (action: AutoFixAction, coreTitle: string) => {
    const updated = applyAutoFix(state, action);
    if (updated !== state) {
      if (onUpdateStateWithUndo) {
        onUpdateStateWithUndo(updated, `Применено автоисправление: ${action.label}`, 'success');
      } else {
        onUpdateState(updated);
      }
      showPersistentToast(`Успешно: ${action.label}`, 'success');
    } else {
      showPersistentToast(`Не удалось применить действие для ${coreTitle}`, 'error');
    }
  };

  const handleApplyAllMUC = () => {
    const { newState, fixedCoresCount } = applyAllAutoFixes(state);
    if (newState !== state && fixedCoresCount > 0) {
      if (onUpdateStateWithUndo) {
        onUpdateStateWithUndo(
          newState,
          `Устранено невыполнимых ядер (MUC): ${fixedCoresCount} с минимальной дельтой!`,
          'success'
        );
      } else {
        onUpdateState(newState);
      }
      showPersistentToast(`Успешно устранено ${fixedCoresCount} структурных конфликтов (MUC)!`, 'success');
    } else {
      showPersistentToast('Все ограничения уже согласованы.', 'success');
    }
  };

  // -------------------------------------------------------------------
  // CONTOUR 2 HANDLERS (LNS Ruin-and-Recreate & Quick-Fixes)
  // -------------------------------------------------------------------
  const handleFixOne = (issue: DiagnosticIssue) => {
    // If it's a teacher gap issue, use Chain-LNS
    if (issue.type === 'teacher_gap' && issue.teacherId && issue.dayOfWeek !== undefined) {
      handleFixSingleTeacherWindow(issue.teacherId, issue.dayOfWeek);
      return;
    }

    const updated = autoFixIssue(state, issue);
    if (updated !== state) {
      if (onUpdateStateWithUndo) {
        onUpdateStateWithUndo(updated, `Исправлено: ${issue.title}`, 'success');
      } else {
        onUpdateState(updated);
      }
      showPersistentToast(`Успешно исправлено: ${issue.title}`, 'success');
    } else {
      showPersistentToast(`Не удалось устранить автоматически: ${issue.title}`, 'warning');
    }
  };

  // UNIFIED 1-CLICK ALL REPAIR
  const handleFixAll = () => {
    setIsFixingAll(true);

    setTimeout(async () => {
      try {
        // Step 1: Rapid multi-pass heuristic auto-fix
        const initialIssueCount = runDiagnostics(state).length;
        const fastResult = autoFixAllIssues(state);
        let currentState = fastResult.newState;

        // Step 2: Run Chain-LNS for teacher windows
        const chainRes = await fixAllTeacherWindowsChain(currentState);
        if (chainRes.repairedSchedule !== currentState.schedule) {
          currentState = { ...currentState, schedule: chainRes.repairedSchedule };
        }

        // Step 3: If general issues remain, run deep LNS Ruin-and-Recreate CP-SAT solver
        let currentIssues = runDiagnostics(currentState);
        if (currentIssues.length > 0) {
          const lnsResult = repairScheduleLNS(currentState);
          if (lnsResult.success && lnsResult.repairedItemsCount > 0) {
            currentState = { ...currentState, schedule: lnsResult.repairedSchedule };
            // Run final rapid compaction pass
            const finalFast = autoFixAllIssues(currentState);
            currentState = finalFast.newState;
          }
        }

        const remainingIssues = runDiagnostics(currentState);
        const remainingCount = remainingIssues.length;
        const totalFixed = Math.max(0, initialIssueCount - remainingCount);

        if (currentState !== state) {
          if (onUpdateStateWithUndo) {
            onUpdateStateWithUndo(
              currentState,
              `Успешно исправлено замечаний: ${totalFixed}`,
              'success'
            );
          } else {
            onUpdateState(currentState);
          }
        }

        if (remainingCount === 0) {
          showPersistentToast(
            `🎉 Все замечания (${totalFixed}) полностью устранены! Расписание идеально.`,
            'success',
            8000
          );
          setShowConflictModal(false);
        } else {
          showPersistentToast(
            `Устранено замечаний: ${totalFixed}. Осталось неразрешимых ограничений: ${remainingCount}.`,
            'warning',
            9000
          );
          setConflictModalIssues(remainingIssues);
          setShowConflictModal(true);
        }
      } finally {
        setIsFixingAll(false);
      }
    }, 20);
  };

  // -------------------------------------------------------------------
  // MODAL QUICK-ACTION HANDLERS
  // -------------------------------------------------------------------
  const handleDisableConflictingConstraints = (constraintIds: string[]) => {
    const updatedConstraints = (state.constraints || []).map((c) =>
      constraintIds.includes(c.id) ? { ...c, enabled: false } : c
    );
    const updatedState = { ...state, constraints: updatedConstraints };
    const fixedResult = autoFixAllIssues(updatedState);
    if (onUpdateStateWithUndo) {
      onUpdateStateWithUndo(
        fixedResult.newState,
        `Отключено конфликтующих правил: ${constraintIds.length}, устранено замечаний: ${fixedResult.fixedCount}`,
        'success'
      );
    } else {
      onUpdateState(fixedResult.newState);
    }
    const rem = runDiagnostics(fixedResult.newState);
    setConflictModalIssues(rem);
    if (rem.length === 0) {
      setShowConflictModal(false);
      showPersistentToast('🎉 Все конфликты успешно решены!', 'success');
    } else {
      showPersistentToast(`Правила отключены. Осталось замечаний: ${rem.length}`, 'warning');
    }
  };

  const handleIncreaseParallelLimit = (grades: number[]) => {
    const updatedLimits = { ...state.parallelLimits };
    grades.forEach((g) => {
      updatedLimits[g] = (updatedLimits[g] || 6) + 1;
    });
    const updatedState = { ...state, parallelLimits: updatedLimits };
    const fixedResult = autoFixAllIssues(updatedState);
    if (onUpdateStateWithUndo) {
      onUpdateStateWithUndo(
        fixedResult.newState,
        `Лимит уроков увеличен для параллелей [${grades.join(', ')}]. Устранено замечаний: ${fixedResult.fixedCount}`,
        'success'
      );
    } else {
      onUpdateState(fixedResult.newState);
    }
    const rem = runDiagnostics(fixedResult.newState);
    setConflictModalIssues(rem);
    if (rem.length === 0) {
      setShowConflictModal(false);
      showPersistentToast('🎉 Дневной лимит увеличен, все уроки успешно распределены!', 'success');
    } else {
      showPersistentToast(`Лимиты увеличены. Осталось замечаний: ${rem.length}`, 'warning');
    }
  };

  const handleAddTeacherForSubject = (subjectId: string, shift: 1 | 2 = 1) => {
    const updatedSubjects = state.subjects.map((s) => {
      if (s.id === subjectId) {
        if (shift === 1) {
          return { ...s, teachersShift1: (s.teachersShift1 !== undefined ? s.teachersShift1 : 1) + 1 };
        } else {
          return { ...s, teachersShift2: (s.teachersShift2 !== undefined ? s.teachersShift2 : 0) + 1 };
        }
      }
      return s;
    });

    const newTeachers = syncAnonymousTeachers(updatedSubjects, state.classes, state.teachers);
    const updatedState = {
      ...state,
      subjects: updatedSubjects,
      teachers: newTeachers,
    };

    const fixedResult = autoFixAllIssues(updatedState);
    if (onUpdateStateWithUndo) {
      onUpdateStateWithUndo(
        fixedResult.newState,
        `Добавлена ставка учителя. Расписание пересчитано, устранено: ${fixedResult.fixedCount}`,
        'success'
      );
    } else {
      onUpdateState(fixedResult.newState);
    }
    const rem = runDiagnostics(fixedResult.newState);
    setConflictModalIssues(rem);
    if (rem.length === 0) {
      setShowConflictModal(false);
      showPersistentToast('🎉 Ставка добавлена, накладки учителей полностью устранены!', 'success');
    } else {
      showPersistentToast(`Ставка учителя добавлена. Осталось замечаний: ${rem.length}`, 'warning');
    }
  };

  const handleAddDuplicateRoom = (roomType: string, roomName: string) => {
    const newRoom: Room = {
      id: `room_${Date.now()}_${Math.random().toString(36).substring(2, 5)}`,
      name: `${roomName} (Доп. зал/каб)`,
      type: roomType as RoomType,
      capacity: 1,
    };
    const updatedState = { ...state, rooms: [...state.rooms, newRoom] };
    const fixedResult = autoFixAllIssues(updatedState);
    if (onUpdateStateWithUndo) {
      onUpdateStateWithUndo(
        fixedResult.newState,
        `Создан кабинет «${newRoom.name}». Устранено замечаний: ${fixedResult.fixedCount}`,
        'success'
      );
    } else {
      onUpdateState(fixedResult.newState);
    }
    const rem = runDiagnostics(fixedResult.newState);
    setConflictModalIssues(rem);
    if (rem.length === 0) {
      setShowConflictModal(false);
      showPersistentToast('🎉 Кабинет добавлен, переполнения устранены!', 'success');
    } else {
      showPersistentToast(`Кабинет создан. Осталось замечаний: ${rem.length}`, 'warning');
    }
  };

  const handleRunLNSFromModal = () => {
    setIsRepairingLNS(true);
    setTimeout(() => {
      try {
        const repairResult = repairScheduleLNS(state);
        if (repairResult.success && repairResult.repairedItemsCount > 0) {
          const newState = { ...state, schedule: repairResult.repairedSchedule };
          if (onUpdateStateWithUndo) {
            onUpdateStateWithUndo(newState, repairResult.message, 'success');
          } else {
            onUpdateState(newState);
          }
          const rem = runDiagnostics(newState);
          setConflictModalIssues(rem);
          if (rem.length === 0) {
            setShowConflictModal(false);
            showPersistentToast('🎉 LNS CP-SAT полностью разрешил все коллизии!', 'success');
          } else {
            showPersistentToast(repairResult.message, 'success');
          }
        } else {
          showPersistentToast(repairResult.message, 'warning');
        }
      } finally {
        setIsRepairingLNS(false);
      }
    }, 40);
  };

  // Grouped stats for Contour 2
  const studentGaps = scheduleIssues.filter((i) => i.type === 'student_gap');
  const teacherCollisions = scheduleIssues.filter((i) => i.type === 'teacher_collision');
  const roomIssues = scheduleIssues.filter((i) => i.type === 'room_collision' || i.type === 'room_type_mismatch');
  const limitIssues = scheduleIssues.filter((i) => i.type === 'daily_limit_exceeded');
  const teacherGaps = scheduleIssues.filter((i) => i.type === 'teacher_gap');
  const missingHours = scheduleIssues.filter((i) => i.type === 'missing_hours');
  const constraintIssues = scheduleIssues.filter((i) => i.type === 'constraint_violation');

  // Conflict analysis for modal
  const currentIssuesForModal = showConflictModal ? conflictModalIssues : scheduleIssues;
  const conflictingConstraints = Array.from(
    new Set(
      currentIssuesForModal
        .filter((i) => i.type === 'constraint_violation' && i.constraintId)
        .map((i) => i.constraintId!)
    )
  )
    .map((id) => (state.constraints || []).find((c) => c.id === id))
    .filter(Boolean);

  const overloadedGrades = Array.from(
    new Set(
      currentIssuesForModal
        .filter((i) => i.type === 'daily_limit_exceeded' && i.classId)
        .map((i) => {
          const cls = state.classes.find((c) => c.id === i.classId);
          return cls?.grade;
        })
        .filter((g): g is number => g !== undefined)
    )
  );

  const congestedRooms = Array.from(
    new Set(
      currentIssuesForModal
        .filter((i) => (i.type === 'room_collision' || i.type === 'room_type_mismatch') && i.roomId)
        .map((i) => state.rooms.find((r) => r.id === i.roomId))
        .filter((r): r is Room => r !== undefined)
    )
  );

  const teacherCollisionSubjects = Array.from(
    new Set(
      currentIssuesForModal
        .filter((i) => i.type === 'teacher_collision' && i.teacherId)
        .map((i) => {
          const tch = state.teachers.find((t) => t.id === i.teacherId);
          return tch?.subjectIds?.[0];
        })
        .filter((sid): sid is string => sid !== undefined)
    )
  )
    .map((sid) => state.subjects.find((s) => s.id === sid))
    .filter(Boolean);

  return (
    <div className="space-y-6">
      {/* Swipeable toast notification with dismiss button */}
      {lastActionMessage && (
        <SwipeableToast
          message={lastActionMessage}
          type={lastActionType}
          onClose={() => setLastActionMessage(null)}
          durationMs={7500}
          actionButton={
            lastActionType === 'warning' ? (
              <button
                type="button"
                onClick={() => setShowConflictModal(true)}
                className="rounded-xl bg-white/20 hover:bg-white/30 px-3 py-1.5 text-xs font-black text-white active:scale-95 transition-all shadow-xs shrink-0"
              >
                Открыть решения ↗
              </button>
            ) : undefined
          }
        />
      )}

      {/* MULTI-CONTOUR NAVIGATION SWITCHER WITH PROMINENT CHAIN-LNS TAB */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-2 shadow-xs">
        <div className="flex flex-wrap rounded-xl bg-slate-100 p-1 gap-1">
          {/* Contour 2 Tab (General Diagnostics & LNS) */}
          <button
            onClick={() => setActiveContour('contour2')}
            className={`flex items-center gap-2 rounded-lg px-3.5 py-2 text-xs font-bold transition-all ${
              activeContour === 'contour2'
                ? 'bg-white text-indigo-700 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Layers className="h-4 w-4" />
            <span>Контур 2: Общая диагностика</span>
            {errors.length > 0 ? (
              <span className="rounded-full bg-rose-100 px-2 py-0.5 text-[10px] font-black text-rose-700">
                {errors.length}
              </span>
            ) : warnings.length > 0 ? (
              <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-700">
                {warnings.length}
              </span>
            ) : (
              <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-700">
                0 ✓
              </span>
            )}
          </button>

          {/* DEDICATED CHAIN-LNS TAB */}
          <button
            onClick={() => setActiveContour('chain_lns')}
            className={`flex items-center gap-2 rounded-lg px-3.5 py-2 text-xs font-black transition-all ${
              activeContour === 'chain_lns'
                ? 'bg-indigo-600 text-white shadow-md'
                : 'text-indigo-700 hover:bg-indigo-50 font-extrabold'
            }`}
          >
            <Zap className={`h-4 w-4 ${activeContour === 'chain_lns' ? 'text-amber-300 fill-amber-300' : 'text-indigo-600'}`} />
            <span>⚡ Алгоритм Chain-LNS (Окна учителей)</span>
            {totalTeacherWindowsCount > 0 ? (
              <span
                className={`rounded-full px-2 py-0.5 text-[10px] font-black ${
                  activeContour === 'chain_lns'
                    ? 'bg-white text-indigo-700'
                    : 'bg-rose-100 text-rose-700'
                }`}
              >
                {totalTeacherWindowsCount} окон
              </span>
            ) : (
              <span
                className={`rounded-full px-2 py-0.5 text-[10px] font-black ${
                  activeContour === 'chain_lns'
                    ? 'bg-emerald-500 text-white'
                    : 'bg-emerald-100 text-emerald-700'
                }`}
              >
                0 окон ✓
              </span>
            )}
          </button>

          {/* Contour 1 Tab (MUC Structural Pre-Analysis) */}
          <button
            onClick={() => setActiveContour('contour1')}
            className={`flex items-center gap-2 rounded-lg px-3.5 py-2 text-xs font-bold transition-all ${
              activeContour === 'contour1'
                ? 'bg-white text-indigo-700 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Cpu className="h-4 w-4" />
            <span>Контур 1: MUC / IIS Анализ</span>
            {structuralResult.cores.length > 0 ? (
              <span className="rounded-full bg-rose-100 px-2 py-0.5 text-[10px] font-black text-rose-700 animate-pulse">
                {structuralResult.cores.length} MUC
              </span>
            ) : (
              <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-black text-emerald-700">
                0 ✓
              </span>
            )}
          </button>
        </div>

        <div className="flex items-center gap-2 px-2 text-xs text-slate-500">
          <ShieldCheck className="h-4 w-4 text-indigo-600 shrink-0" />
          <span className="hidden lg:inline font-medium">
            Локальная CP-SAT пересборка с графом зависимостей ресурсов
          </span>
        </div>
      </div>

      {/* =================================================================== */}
      {/* DEDICATED CHAIN-LNS TAB CONTENT (TEACHER WINDOWS & GRAPH LNS)       */}
      {/* =================================================================== */}
      {activeContour === 'chain_lns' && (
        <div className="space-y-6">
          {/* Header Banner & Primary Batch Button */}
          <div className="rounded-2xl border border-indigo-200 bg-linear-to-r from-indigo-900 via-indigo-800 to-slate-900 p-6 text-white shadow-md">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="flex items-start gap-4">
                <div className="rounded-2xl bg-white/10 p-3 text-amber-300 backdrop-blur-xs border border-white/20">
                  <Zap className="h-7 w-7 fill-amber-300" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-xl font-black tracking-tight">
                      Алгоритм Chain-Ruin Large Neighborhood Search (Chain-LNS)
                    </h2>
                    <span className="rounded-full bg-amber-400/20 px-2.5 py-0.5 text-[10px] font-bold text-amber-200 border border-amber-300/30">
                      CP-SAT Local Ruin
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-indigo-100 max-w-2xl leading-relaxed">
                    Математический модуль точечного ремонта расписания на основе построения <strong>графа зависимостей ресурсов</strong> глубиной k = 2..3 (Учитель → Классы → Смежные учителя → Их классы) и пересборки с фиксацией 90%+ слотов школы.
                  </p>
                </div>
              </div>

              {/* Batch Button */}
              <div className="flex items-center gap-3">
                <button
                  onClick={handleRunAllChainLNS}
                  disabled={isFixingChainLNS || state.schedule.length === 0}
                  className="flex items-center gap-2 rounded-xl bg-amber-400 px-5 py-3 text-sm font-black text-slate-950 shadow-lg hover:bg-amber-300 active:scale-95 transition-all disabled:opacity-50 cursor-pointer"
                  title="Запустить Chain-LNS для устранения всех обнаруженных окон учителей во всей школе"
                >
                  <Sparkles className={`h-4.5 w-4.5 ${isFixingChainLNS ? 'animate-spin' : ''}`} />
                  <span>
                    {isFixingChainLNS
                      ? 'Идет расчет Chain-LNS...'
                      : totalTeacherWindowsCount > 0
                      ? `⚡ Устранить ВСЕ окна школы (${totalTeacherWindowsCount} окон)`
                      : '⚡ Проверить и оптимизировать окна школы'}
                  </span>
                </button>
              </div>
            </div>

            {/* Quick Status Pill Bar */}
            <div className="mt-5 grid grid-cols-2 sm:grid-cols-4 gap-3 border-t border-indigo-700/60 pt-4 text-xs">
              <div className="rounded-xl bg-white/5 p-2.5 border border-white/10">
                <div className="text-indigo-200 text-[11px]">Окон в школе</div>
                <div className="text-lg font-black text-white mt-0.5">
                  {totalTeacherWindowsCount === 0 ? '0 (Идеально)' : `${totalTeacherWindowsCount} ч.`}
                </div>
              </div>

              <div className="rounded-xl bg-white/5 p-2.5 border border-white/10">
                <div className="text-indigo-200 text-[11px]">Учителей с окнами</div>
                <div className="text-lg font-black text-white mt-0.5">
                  {new Set(allTeacherWindows.map((w) => w.teacherId)).size} чел.
                </div>
              </div>

              <div className="rounded-xl bg-white/5 p-2.5 border border-white/10">
                <div className="text-indigo-200 text-[11px]">Заморозка расписания</div>
                <div className="text-lg font-black text-emerald-300 mt-0.5">
                  85% - 95% слотов
                </div>
              </div>

              <div className="rounded-xl bg-white/5 p-2.5 border border-white/10">
                <div className="text-indigo-200 text-[11px]">Окна у учеников</div>
                <div className="text-lg font-black text-amber-300 mt-0.5">
                  0 (Жесткий барьер)
                </div>
              </div>
            </div>
          </div>

          {/* Interactive Dependency Graph Inspector & Window Solver */}
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-xs space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-100 pb-4">
              <div className="flex items-center gap-3">
                <div className="rounded-xl bg-indigo-50 p-2.5 text-indigo-600">
                  <Network className="h-6 w-6" />
                </div>
                <div>
                  <h3 className="text-base font-black text-slate-800">
                    Инспектор графа зависимостей и локальный пересчет
                  </h3>
                  <p className="text-xs text-slate-500">
                    Выберите преподавателя и день для визуализации подграфа ресурсов и точечного запуска Chain-LNS
                  </p>
                </div>
              </div>

              {/* Selector controls */}
              <div className="flex flex-wrap items-center gap-2.5 text-xs">
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase">Учитель:</label>
                  <select
                    value={inspectTeacherId}
                    onChange={(e) => setInspectTeacherId(e.target.value)}
                    className="mt-0.5 rounded-xl border border-slate-300 bg-white px-3 py-1.5 text-xs font-bold text-slate-800 shadow-2xs focus:border-indigo-500 focus:outline-hidden max-w-xs"
                  >
                    {state.teachers.map((tch) => {
                      const tchWins = allTeacherWindows.filter((w) => w.teacherId === tch.id);
                      const winsCount = tchWins.reduce((acc, w) => acc + w.windowsCount, 0);
                      return (
                        <option key={tch.id} value={tch.id}>
                          {tch.name} {winsCount > 0 ? `(${winsCount} ок.)` : ''}
                        </option>
                      );
                    })}
                  </select>
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase">День недели:</label>
                  <select
                    value={inspectDayIndex}
                    onChange={(e) => setInspectDayIndex(Number(e.target.value))}
                    className="mt-0.5 rounded-xl border border-slate-300 bg-white px-3 py-1.5 text-xs font-bold text-slate-800 shadow-2xs focus:border-indigo-500 focus:outline-hidden"
                  >
                    {DAYS_OF_WEEK.slice(0, state.settings.daysPerWeek).map((day) => {
                      const isWin = allTeacherWindows.some(
                        (w) => w.teacherId === inspectTeacherId && w.dayIndex === day.index
                      );
                      return (
                        <option key={day.index} value={day.index}>
                          {day.name} {isWin ? '⚠️ (Окно)' : ''}
                        </option>
                      );
                    })}
                  </select>
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase">Глубина $k$:</label>
                  <select
                    value={inspectDepth}
                    onChange={(e) => setInspectDepth(Number(e.target.value))}
                    className="mt-0.5 rounded-xl border border-slate-300 bg-white px-3 py-1.5 text-xs font-bold text-slate-800 shadow-2xs focus:border-indigo-500 focus:outline-hidden"
                  >
                    <option value={2}>k = 2 (Стандарт)</option>
                    <option value={3}>k = 3 (Глубокий)</option>
                  </select>
                </div>
              </div>
            </div>

            {/* Subgraph Analysis Box */}
            {activeInspectGraph && (
              <div className="grid gap-4 lg:grid-cols-3">
                {/* Left: Window status for this teacher/day */}
                <div
                  className={`rounded-2xl border p-4 space-y-3 ${
                    currentInspectWindow.hasWindow
                      ? 'border-rose-200 bg-rose-50/40'
                      : 'border-emerald-200 bg-emerald-50/40'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      {currentInspectWindow.hasWindow ? (
                        <Coffee className="h-5 w-5 text-rose-600" />
                      ) : (
                        <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                      )}
                      <span className="font-extrabold text-xs uppercase tracking-wider text-slate-700">
                        Статус окон в этот день
                      </span>
                    </div>
                    {currentInspectWindow.hasWindow ? (
                      <span className="rounded-full bg-rose-600 px-2 py-0.5 text-[10px] font-black text-white">
                        {currentInspectWindow.windowsCount} окн.
                      </span>
                    ) : (
                      <span className="rounded-full bg-emerald-600 px-2 py-0.5 text-[10px] font-bold text-white">
                        0 окон
                      </span>
                    )}
                  </div>

                  <div>
                    <div className="text-sm font-black text-slate-900">
                      {currentInspectTeacher?.name}
                    </div>
                    <div className="text-xs text-slate-500">
                      {DAYS_OF_WEEK[inspectDayIndex]?.name}: уроков — {currentInspectWindow.activeSlots.length}
                    </div>
                  </div>

                  {currentInspectWindow.hasWindow ? (
                    <div className="text-xs text-rose-900 space-y-1 bg-white/70 rounded-xl p-3 border border-rose-100">
                      <div>
                        Пустые слоты (окна):{' '}
                        <strong>
                          {currentInspectWindow.emptySlots.map((s) => `${s + 1}-й`).join(', ')} урок
                        </strong>
                      </div>
                      <div className="text-[11px] text-rose-700">
                        Активные слоты: {currentInspectWindow.activeSlots.map((s) => `${s + 1}`).join(', ')}
                      </div>
                    </div>
                  ) : (
                    <div className="text-xs text-emerald-800 bg-white/70 rounded-xl p-3 border border-emerald-100">
                      Учитель ведет занятия непрерывно, без промежуточных окон.
                    </div>
                  )}

                  {/* Single Window Action Button */}
                  {currentInspectWindow.hasWindow && (
                    <button
                      onClick={() => handleFixSingleTeacherWindow(currentInspectTeacher.id, inspectDayIndex)}
                      disabled={repairingSpecificWindowKey === `${currentInspectTeacher.id}_${inspectDayIndex}`}
                      className="w-full flex items-center justify-center gap-2 rounded-xl bg-rose-600 px-4 py-2.5 text-xs font-bold text-white shadow-xs hover:bg-rose-700 active:scale-95 transition-all cursor-pointer disabled:opacity-50"
                    >
                      {repairingSpecificWindowKey === `${currentInspectTeacher.id}_${inspectDayIndex}` ? (
                        <>
                          <RefreshCw className="h-4 w-4 animate-spin text-white" />
                          <span>Пересборка подграфа CP-SAT...</span>
                        </>
                      ) : (
                        <>
                          <Zap className="h-4 w-4 fill-amber-300 text-amber-300" />
                          <span>⚡ Устранить это окно (Chain-LNS)</span>
                        </>
                      )}
                    </button>
                  )}
                </div>

                {/* Middle: Graph Resource Chain Metrics */}
                <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4 space-y-3">
                  <div className="flex items-center gap-2 text-indigo-700">
                    <GitBranch className="h-4 w-4" />
                    <span className="font-extrabold text-xs uppercase tracking-wider text-slate-700">
                      Подграф ресурсов (T_chain ∪ C_chain)
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div className="rounded-xl bg-white p-2.5 border border-slate-200 shadow-2xs">
                      <div className="text-slate-400 text-[10px]">Затронутых классов</div>
                      <div className="text-base font-black text-slate-800">
                        {activeInspectGraph.stats.classesCount} кл.
                      </div>
                    </div>

                    <div className="rounded-xl bg-white p-2.5 border border-slate-200 shadow-2xs">
                      <div className="text-slate-400 text-[10px]">Смежных учителей</div>
                      <div className="text-base font-black text-slate-800">
                        {activeInspectGraph.stats.teachersCount} чел.
                      </div>
                    </div>

                    <div className="rounded-xl bg-white p-2.5 border border-slate-200 shadow-2xs">
                      <div className="text-slate-400 text-[10px]">Разморожено слотов</div>
                      <div className="text-base font-black text-indigo-600">
                        {activeInspectGraph.stats.unfrozenItemsCount} ур.
                      </div>
                    </div>

                    <div className="rounded-xl bg-white p-2.5 border border-slate-200 shadow-2xs">
                      <div className="text-slate-400 text-[10px]">Заморожено (стабильно)</div>
                      <div className="text-base font-black text-emerald-600">
                        {Math.round(activeInspectGraph.stats.frozenRatio * 100)}% ({activeInspectGraph.stats.frozenItemsCount} ур.)
                      </div>
                    </div>
                  </div>

                  <div className="text-[11px] text-slate-500 leading-tight">
                    🔒 <strong>Принцип минимального возмущения:</strong> фиксирует {Math.round(activeInspectGraph.stats.frozenRatio * 100)}% уроков школы, переставляя только уроки затронутых классов.
                  </div>
                </div>

                {/* Right: Chain Escalation Pipeline */}
                <div className="rounded-2xl border border-slate-200 bg-white p-4 space-y-3">
                  <div className="flex items-center gap-2 text-slate-700">
                    <Activity className="h-4 w-4 text-indigo-600" />
                    <span className="font-extrabold text-xs uppercase tracking-wider">
                      Многоуровневая эскалация
                    </span>
                  </div>

                  <div className="space-y-2 text-[11px]">
                    <div className="flex items-center gap-2 rounded-lg bg-indigo-50/50 p-2 border border-indigo-100">
                      <span className="rounded-md bg-indigo-600 px-1.5 py-0.5 font-bold text-white text-[10px]">
                        Tier 1
                      </span>
                      <span className="text-slate-700">Локальный граф $k=2$ (целевой день)</span>
                    </div>

                    <div className="flex items-center gap-2 rounded-lg bg-indigo-50/50 p-2 border border-indigo-100">
                      <span className="rounded-md bg-indigo-600 px-1.5 py-0.5 font-bold text-white text-[10px]">
                        Tier 2
                      </span>
                      <span className="text-slate-700">Эскалация глубины $k=3$ при тупике</span>
                    </div>

                    <div className="flex items-center gap-2 rounded-lg bg-indigo-50/50 p-2 border border-indigo-100">
                      <span className="rounded-md bg-indigo-600 px-1.5 py-0.5 font-bold text-white text-[10px]">
                        Tier 3
                      </span>
                      <span className="text-slate-700">Разморозка смежных дней (Day D $\pm$ 1)</span>
                    </div>

                    <div className="flex items-center gap-2 rounded-lg bg-rose-50 p-2 border border-rose-100">
                      <span className="rounded-md bg-rose-600 px-1.5 py-0.5 font-bold text-white text-[10px]">
                        Tier 4
                      </span>
                      <span className="text-rose-800">MUC-диагностика и 1-Click Auto-Fix</span>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* =================================================================== */}
      {/* CONTOUR 1: STRUCTURAL ANALYSIS (MUC / IIS Minimal Relaxation)       */}
      {/* =================================================================== */}
      {activeContour === 'contour1' && (
        <div className="space-y-6">
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-xs">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="rounded-xl bg-indigo-50 p-2.5 text-indigo-600">
                  <Cpu className="h-6 w-6" />
                </div>
                <div>
                  <h2 className="text-lg font-extrabold text-slate-800">
                    Контур 1: Предварительный структурный аудит (MUC / IIS)
                  </h2>
                  <p className="mt-0.5 text-xs text-slate-500">
                    Математический алгоритм выявляет минимальные невыполнимые ядра ограничений (Minimal Unsatisfiable Cores) до генерации.
                  </p>
                </div>
              </div>

              {structuralResult.cores.length > 0 && (
                <button
                  onClick={handleApplyAllMUC}
                  className="flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-xs font-bold text-white shadow-xs hover:bg-indigo-700 active:scale-95 transition-all cursor-pointer"
                >
                  <Sparkles className="h-4 w-4" />
                  Устранить все MUC с мин. дельтой
                </button>
              )}
            </div>
          </div>

          {structuralResult.cores.length === 0 ? (
            <div className="space-y-4">
              <div className="rounded-2xl border border-emerald-200 bg-emerald-50/40 p-6 text-center space-y-2">
                <CheckCircle2 className="mx-auto h-10 w-10 text-emerald-500" />
                <h3 className="text-base font-extrabold text-emerald-950">
                  Структурные конфликты не обнаружены (0 MUC ядер)
                </h3>
                <p className="text-xs text-emerald-800 max-w-lg mx-auto">
                  Все требования учебного плана, недельные часы, кабинеты и правила школы математически согласованы и 100% выполнимы.
                </p>
              </div>

              {/* 4 Pillars of School Structure Health */}
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <div className="rounded-2xl border border-slate-200 bg-white p-4 space-y-2 shadow-2xs">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-indigo-600">
                      <Users className="h-4 w-4" />
                      <span className="font-bold text-xs text-slate-700">Классы и слоты</span>
                    </div>
                    <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-black text-emerald-700">
                      В норме ✓
                    </span>
                  </div>
                  <div className="text-2xl font-black text-slate-900">
                    {structuralResult.metrics.totalCurriculumHours} <span className="text-xs font-normal text-slate-500">ч/нед</span>
                  </div>
                  <p className="text-[11px] text-slate-500">
                    Всего {state.classes.length} кл. Нагрузка каждого класса укладывается в дневные лимиты параллелей.
                  </p>
                </div>

                <div className="rounded-2xl border border-slate-200 bg-white p-4 space-y-2 shadow-2xs">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-indigo-600">
                      <BookOpen className="h-4 w-4" />
                      <span className="font-bold text-xs text-slate-700">Кадры и ставки</span>
                    </div>
                    <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-black text-emerald-700">
                      В норме ✓
                    </span>
                  </div>
                  <div className="text-2xl font-black text-slate-900">
                    {state.teachers.length} <span className="text-xs font-normal text-slate-500">ставок</span>
                  </div>
                  <p className="text-[11px] text-slate-500">
                    Штат учителей по всем предметам достаточен для покрытия часов 1-й и 2-й смен без перегрузок.
                  </p>
                </div>

                <div className="rounded-2xl border border-slate-200 bg-white p-4 space-y-2 shadow-2xs">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-indigo-600">
                      <DoorClosed className="h-4 w-4" />
                      <span className="font-bold text-xs text-slate-700">Спецкабинеты</span>
                    </div>
                    <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-black text-emerald-700">
                      В норме ✓
                    </span>
                  </div>
                  <div className="text-2xl font-black text-slate-900">
                    {state.rooms.length} <span className="text-xs font-normal text-slate-500">помещ.</span>
                  </div>
                  <p className="text-[11px] text-slate-500">
                    Спортзалы, лаборатории и ИТ-классы обладают достаточной пропускной способностью.
                  </p>
                </div>

                <div className="rounded-2xl border border-slate-200 bg-white p-4 space-y-2 shadow-2xs">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-indigo-600">
                      <Sliders className="h-4 w-4" />
                      <span className="font-bold text-xs text-slate-700">Правила предметов</span>
                    </div>
                    <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-black text-emerald-700">
                      В норме ✓
                    </span>
                  </div>
                  <div className="text-2xl font-black text-slate-900">
                    {state.constraints?.filter((c) => c.enabled).length || 0} <span className="text-xs font-normal text-slate-500">правил</span>
                  </div>
                  <p className="text-[11px] text-slate-500">
                    Пользовательские ограничения не создают взаимоисключающих требований.
                  </p>
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              {structuralResult.cores.map((core) => (
                <div
                  key={core.id}
                  className="rounded-2xl border border-rose-200 bg-rose-50/30 p-5 shadow-xs space-y-4"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-3">
                      <div className="rounded-xl bg-rose-100 p-2 text-rose-600 shrink-0">
                        <AlertTriangle className="h-5 w-5" />
                      </div>
                      <div>
                        <h4 className="font-extrabold text-rose-950 text-sm">{core.title}</h4>
                        <p className="mt-1 text-xs text-rose-800 leading-relaxed">
                          {core.description}
                        </p>
                      </div>
                    </div>
                  </div>

                  {core.actions && core.actions.length > 0 && (
                    <div className="rounded-xl bg-white p-3.5 border border-rose-100 space-y-2">
                      <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                        Рекомендуемое минимальное исправление (Minimal Relaxation Delta):
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {core.actions.map((fix: AutoFixAction, idx: number) => (
                          <button
                            key={idx}
                            onClick={() => handleApplyAction(fix, core.title)}
                            className="flex items-center gap-1.5 rounded-lg bg-indigo-50 border border-indigo-200 px-3 py-1.5 text-xs font-bold text-indigo-700 hover:bg-indigo-600 hover:text-white transition-all shadow-2xs"
                          >
                            <Zap className="h-3.5 w-3.5" />
                            <span>{fix.label}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* =================================================================== */}
      {/* CONTOUR 2: SCHEDULE DIAGNOSTICS & FAST 1-CLICK REPAIR               */}
      {/* =================================================================== */}
      {activeContour === 'contour2' && (
        <div className="space-y-6">
          {/* Header & Action Bar */}
          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xs">
            <div
              className={`p-6 ${
                errors.length > 0
                  ? 'bg-rose-50/40 border-b border-rose-100'
                  : warnings.length > 0
                  ? 'bg-amber-50/40 border-b border-amber-100'
                  : 'bg-emerald-50/50 border-b border-emerald-100'
              }`}
            >
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div className="flex items-center gap-4">
                  <div
                    className={`flex h-14 w-14 items-center justify-center rounded-2xl ${
                      errors.length > 0
                        ? 'bg-rose-100 text-rose-600'
                        : warnings.length > 0
                        ? 'bg-amber-100 text-amber-600'
                        : 'bg-emerald-100 text-emerald-600'
                    }`}
                  >
                    {errors.length > 0 ? (
                      <AlertCircle className="h-7 w-7" />
                    ) : warnings.length > 0 ? (
                      <AlertTriangle className="h-7 w-7" />
                    ) : (
                      <CheckCircle2 className="h-7 w-7" />
                    )}
                  </div>

                  <div>
                    <h2 className="text-xl font-extrabold text-slate-800">
                      {state.schedule.length === 0
                        ? 'Расписание не сгенерировано'
                        : errors.length === 0 && warnings.length === 0
                        ? 'Расписание полностью соответствует всем правилам'
                        : `Обнаружено замечаний: ${errors.length} критических, ${warnings.length} предупреждений`}
                    </h2>
                    <p className="mt-1 text-xs text-slate-600">
                      {errors.length === 0 && warnings.length === 0
                        ? 'Окна у учеников отсутствуют, накладок у учителей нет, профильные кабинеты и дневные лимиты строго соблюдены.'
                        : 'Используйте «Исправить всё в 1 клик» или перейдите во вкладку «⚡ Chain-LNS» для точечного устранения окон преподавателей.'}
                    </p>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2.5">
                  {/* Quick button to Chain-LNS */}
                  {totalTeacherWindowsCount > 0 && (
                    <button
                      onClick={() => setActiveContour('chain_lns')}
                      className="flex items-center gap-2 rounded-xl bg-amber-500 hover:bg-amber-600 px-4 py-3 text-xs font-black text-slate-950 shadow-xs active:scale-95 transition-all cursor-pointer"
                    >
                      <Zap className="h-4 w-4 fill-slate-950 text-slate-950" />
                      <span>⚡ Окна учителей ({totalTeacherWindowsCount})</span>
                    </button>
                  )}

                  <button
                    onClick={handleFixAll}
                    disabled={isFixingAll || state.schedule.length === 0}
                    className="flex items-center gap-2 rounded-xl bg-indigo-600 px-5 py-3 text-sm font-bold text-white shadow-md hover:bg-indigo-700 active:scale-95 transition-all disabled:opacity-50 cursor-pointer"
                    title="Комплексное автоисправление всех замечаний (быстрый эвристический перебор + глубокий CP-SAT микро-солвер LNS)"
                  >
                    <Sparkles className={`h-4.5 w-4.5 ${isFixingAll ? 'animate-spin' : ''}`} />
                    <span>
                      {isFixingAll
                        ? 'Выполняется комплексный ремонт...'
                        : autoFixableCount > 0
                        ? `✨ Исправить все замечания (${autoFixableCount})`
                        : '✨ Исправить всё расписание (LNS CP-SAT)'}
                    </span>
                  </button>
                </div>
              </div>
            </div>

            {/* 7 Category Summary Cards */}
            <div className="grid grid-cols-2 divide-x divide-y divide-slate-100 border-t border-slate-100 sm:grid-cols-4 lg:grid-cols-7 text-center">
              <div className="p-3">
                <div className="text-[11px] font-semibold text-slate-500">Окна у учеников</div>
                <div
                  className={`mt-1 text-base font-black ${
                    studentGaps.length === 0 ? 'text-emerald-600' : 'text-rose-600'
                  }`}
                >
                  {studentGaps.length === 0 ? '0 окон ✓' : `${studentGaps.length} окон`}
                </div>
              </div>

              <div className="p-3">
                <div className="text-[11px] font-semibold text-slate-500">Накладки учителей</div>
                <div
                  className={`mt-1 text-base font-black ${
                    teacherCollisions.length === 0 ? 'text-emerald-600' : 'text-rose-600'
                  }`}
                >
                  {teacherCollisions.length === 0 ? '0 накладок ✓' : `${teacherCollisions.length} шт.`}
                </div>
              </div>

              <div className="p-3">
                <div className="text-[11px] font-semibold text-slate-500">Профильные кабинеты</div>
                <div
                  className={`mt-1 text-base font-black ${
                    roomIssues.length === 0 ? 'text-emerald-600' : 'text-rose-600'
                  }`}
                >
                  {roomIssues.length === 0 ? '100% норм ✓' : `${roomIssues.length} несовп.`}
                </div>
              </div>

              <div className="p-3">
                <div className="text-[11px] font-semibold text-slate-500">Лимиты уроков</div>
                <div
                  className={`mt-1 text-base font-black ${
                    limitIssues.length === 0 ? 'text-emerald-600' : 'text-amber-600'
                  }`}
                >
                  {limitIssues.length === 0 ? 'Соблюдены ✓' : `${limitIssues.length} прев.`}
                </div>
              </div>

              <div className="p-3">
                <div className="text-[11px] font-semibold text-slate-500">Часы уч. плана</div>
                <div
                  className={`mt-1 text-base font-black ${
                    missingHours.length === 0 ? 'text-emerald-600' : 'text-amber-600'
                  }`}
                >
                  {missingHours.length === 0 ? '100% выдано ✓' : `${missingHours.length} нехв.`}
                </div>
              </div>

              {/* Clickable Teacher Gaps Card -> Switches to Chain-LNS */}
              <div
                onClick={() => setActiveContour('chain_lns')}
                className="p-3 cursor-pointer hover:bg-slate-50 transition-colors group"
                title="Нажмите для перехода к модулю Chain-LNS"
              >
                <div className="text-[11px] font-semibold text-slate-500 group-hover:text-indigo-600 flex items-center justify-center gap-1">
                  <span>Окна учителей</span>
                  <Zap className="h-3 w-3 text-amber-500" />
                </div>
                <div
                  className={`mt-1 text-base font-black ${
                    totalTeacherWindowsCount === 0 ? 'text-emerald-600' : 'text-rose-600'
                  }`}
                >
                  {totalTeacherWindowsCount === 0 ? '0 окон ✓' : `${totalTeacherWindowsCount} окон ⚡`}
                </div>
              </div>

              <div className="p-3">
                <div className="text-[11px] font-semibold text-slate-500">Правила предметов</div>
                <div
                  className={`mt-1 text-base font-black ${
                    constraintIssues.length === 0 ? 'text-emerald-600' : 'text-amber-600'
                  }`}
                >
                  {constraintIssues.length === 0 ? '0 наруш. ✓' : `${constraintIssues.length} наруш.`}
                </div>
              </div>
            </div>
          </div>

          {/* Issues list */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-slate-800">
                Журнал замечаний текущего расписания ({scheduleIssues.length})
              </h3>
              {scheduleIssues.length > 0 && (
                <button
                  onClick={() => setShowConflictModal(true)}
                  className="flex items-center gap-1 text-xs font-bold text-indigo-600 hover:text-indigo-800"
                >
                  <Sliders className="h-3.5 w-3.5" />
                  <span>Мастер устранения конфликтов</span>
                </button>
              )}
            </div>

            {scheduleIssues.length === 0 || (scheduleIssues.length === 1 && scheduleIssues[0].id === 'no_schedule') ? (
              <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center space-y-3">
                <CheckCircle2 className="mx-auto h-10 w-10 text-emerald-500" />
                <h4 className="text-base font-bold text-slate-800">
                  Все проверки пройдены без замечаний!
                </h4>
                <p className="mt-1 text-xs text-slate-500 max-w-md mx-auto">
                  Расписание не содержит окон у классов, накладок у преподавателей, переполнения кабинетов.
                </p>
                <button
                  onClick={onNavigateToSchedule}
                  className="mt-2 rounded-xl bg-slate-900 px-4 py-2 text-xs font-bold text-white shadow-xs hover:bg-slate-800"
                >
                  Перейти к расписанию
                </button>
              </div>
            ) : (
              <div className="space-y-2.5">
                {scheduleIssues.map((issue) => {
                  const isError = issue.severity === 'error';
                  const isWarning = issue.severity === 'warning';
                  const isTeacherGap = issue.type === 'teacher_gap';

                  return (
                    <div
                      key={issue.id}
                      className={`rounded-2xl border p-4 transition-all space-y-3 ${
                        isError
                          ? 'border-rose-200 bg-rose-50/40'
                          : isWarning
                          ? 'border-amber-200 bg-amber-50/40'
                          : 'border-slate-200 bg-white'
                      }`}
                    >
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="flex items-start gap-3">
                          <div
                            className={`mt-0.5 rounded-lg p-1.5 ${
                              isError
                                ? 'bg-rose-100 text-rose-600'
                                : isWarning
                                ? 'bg-amber-100 text-amber-600'
                                : 'bg-slate-100 text-slate-600'
                            }`}
                          >
                            {isError ? (
                              <AlertCircle className="h-4 w-4" />
                            ) : isWarning ? (
                              <AlertTriangle className="h-4 w-4" />
                            ) : (
                              <Info className="h-4 w-4" />
                            )}
                          </div>

                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-bold text-slate-800 text-sm">{issue.title}</span>
                              <span
                                className={`rounded-md px-1.5 py-0.5 text-[10px] font-black uppercase tracking-wider ${
                                  isError
                                    ? 'bg-rose-100 text-rose-700'
                                    : isWarning
                                    ? 'bg-amber-100 text-amber-700'
                                    : 'bg-slate-100 text-slate-600'
                                }`}
                              >
                                {isError ? 'Критично' : isWarning ? 'Предупреждение' : 'Инфо'}
                              </span>
                            </div>
                            <p className="mt-0.5 text-xs text-slate-600">{issue.description}</p>
                          </div>
                        </div>

                        <div className="flex items-center gap-2">
                          {isTeacherGap ? (
                            <button
                              onClick={() => handleFixOne(issue)}
                              className="flex items-center gap-1.5 rounded-xl border border-rose-300 bg-rose-600 px-3.5 py-1.5 text-xs font-bold text-white shadow-xs hover:bg-rose-700 active:scale-95 transition-all"
                            >
                              <Zap className="h-3.5 w-3.5 fill-amber-300 text-amber-300" />
                              <span>⚡ Устранить (Chain-LNS)</span>
                            </button>
                          ) : issue.canAutoFix ? (
                            <button
                              onClick={() => handleFixOne(issue)}
                              className="flex items-center gap-1.5 rounded-xl border border-indigo-200 bg-white px-3.5 py-1.5 text-xs font-bold text-indigo-700 shadow-2xs hover:bg-indigo-50 hover:border-indigo-300 active:scale-95 transition-all"
                            >
                              <Wrench className="h-3.5 w-3.5" />
                              <span>{issue.fixDescription || 'Исправить в 1 клик'}</span>
                            </button>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* =================================================================== */}
      {/* CONFLICT RESOLUTION WIZARD MODAL (1-CLICK INTERACTIVE FIXES)        */}
      {/* =================================================================== */}
      {showConflictModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs animate-fadeIn">
          <div className="w-full max-w-2xl max-h-[90vh] overflow-hidden rounded-3xl bg-white shadow-2xl flex flex-col border border-slate-200">
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-amber-100 bg-amber-50/80 p-5">
              <div className="flex items-center gap-3">
                <div className="rounded-2xl bg-amber-100 p-2.5 text-amber-700 shadow-xs">
                  <AlertTriangle className="h-6 w-6" />
                </div>
                <div>
                  <h3 className="text-base font-black text-amber-950">
                    Конфликты ограничений и узкие места расписания
                  </h3>
                  <p className="text-xs text-amber-800/80 mt-0.5">
                    Не удается составить расписание без нарушения правил. Выберите решения ниже для мгновенного устранения:
                  </p>
                </div>
              </div>

              <button
                onClick={() => {
                  setShowConflictModal(false);
                  setAutoFixModalCore(null);
                }}
                className="rounded-xl p-2 text-slate-400 hover:bg-white hover:text-slate-700 transition-colors"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Modal Scrollable Content */}
            <div className="overflow-y-auto p-6 space-y-4">
              {/* Hero 1-Click Universal Fix Action Banner */}
              <div className="rounded-2xl border border-indigo-200 bg-gradient-to-r from-indigo-50/90 via-purple-50/80 to-blue-50/90 p-4.5 shadow-xs space-y-3">
                <div className="flex items-start gap-3">
                  <div className="rounded-xl bg-indigo-600 p-2.5 text-white shadow-xs shrink-0 mt-0.5">
                    <Sparkles className="h-5 w-5" />
                  </div>
                  <div>
                    <h4 className="font-extrabold text-sm text-indigo-950">
                      Комплексное устранение всех недостатков в 1 клик
                    </h4>
                    <p className="text-xs text-indigo-800/80 mt-0.5 leading-relaxed">
                      Автоматически устраняет окна, накладки учителей и коллизии через последовательный запуск быстрых эвристик, оптимизатора Chain-LNS и CP-SAT микро-солвера.
                    </p>
                  </div>
                </div>
                <button
                  onClick={handleFixAll}
                  disabled={isFixingAll || state.schedule.length === 0}
                  className="w-full flex items-center justify-center gap-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 px-4 py-3 text-xs font-black text-white shadow-md active:scale-95 transition-all cursor-pointer disabled:opacity-50"
                >
                  <Sparkles className={`h-4.5 w-4.5 ${isFixingAll ? 'animate-spin' : ''}`} />
                  <span>
                    {isFixingAll
                      ? 'Выполняется комплексное исправление...'
                      : '✨ Решить все недостатки и коллизии в 1 клик'}
                  </span>
                </button>
              </div>

              {/* Specific Auto-Fix Core Diagnostic from Chain-LNS Tier 4 */}
              {autoFixModalCore && (
                <div className="rounded-2xl border border-rose-200 bg-rose-50/50 p-4 space-y-3">
                  <div className="flex items-center gap-2 text-rose-700">
                    <Zap className="h-5 w-5 fill-rose-600 text-rose-600" />
                    <h4 className="font-extrabold text-xs text-rose-950 uppercase tracking-wide">
                      Диагностика окна: {autoFixModalCore.title}
                    </h4>
                  </div>
                  <p className="text-xs text-rose-900 leading-relaxed">
                    {autoFixModalCore.description}
                  </p>
                  <div className="space-y-2">
                    {autoFixModalCore.actions.map((act) => (
                      <button
                        key={act.id}
                        onClick={() => {
                          handleApplyAction(act, autoFixModalCore.title);
                          setShowConflictModal(false);
                          setAutoFixModalCore(null);
                        }}
                        className="w-full flex items-center justify-between rounded-xl bg-indigo-600 px-4 py-2.5 text-xs font-bold text-white shadow-xs hover:bg-indigo-700 active:scale-95 transition-all cursor-pointer"
                      >
                        <span>{act.label}</span>
                        <Sparkles className="h-4 w-4" />
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Bottleneck 1: Conflicting Custom Rules */}
              {conflictingConstraints.length > 0 && (
                <div className="rounded-2xl border border-amber-200 bg-amber-50/40 p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Sliders className="h-4 w-4 text-amber-700" />
                      <h4 className="font-extrabold text-xs text-amber-950 uppercase tracking-wide">
                        Конфликтующие правила для уроков ({conflictingConstraints.length})
                      </h4>
                    </div>
                  </div>

                  <p className="text-xs text-amber-900 leading-relaxed">
                    Правила требуют поставить уроки в конкретные слоты (например, всегда 1-м или последним), но они сталкиваются с другими уроками или нехваткой кабинетов.
                  </p>

                  <div className="rounded-xl bg-white p-3 border border-amber-100 space-y-1.5 text-xs">
                    {conflictingConstraints.map((c) => (
                      <div key={c?.id} className="flex items-center justify-between text-slate-700">
                        <span className="font-semibold">• {c?.title}</span>
                      </div>
                    ))}
                  </div>

                  <button
                    onClick={() =>
                      handleDisableConflictingConstraints(
                        conflictingConstraints.map((c) => c!.id)
                      )
                    }
                    className="w-full flex items-center justify-center gap-2 rounded-xl bg-amber-600 px-4 py-2.5 text-xs font-bold text-white shadow-xs hover:bg-amber-700 active:scale-95 transition-all"
                  >
                    <Zap className="h-4 w-4" />
                    <span>Отключить эти правила и пересобрать расписание</span>
                  </button>
                </div>
              )}

              {/* Bottleneck 2: Parallel Limits Overload */}
              {overloadedGrades.length > 0 && (
                <div className="rounded-2xl border border-blue-200 bg-blue-50/40 p-4 space-y-3">
                  <div className="flex items-center gap-2">
                    <TrendingUp className="h-4 w-4 text-blue-700" />
                    <h4 className="font-extrabold text-xs text-blue-950 uppercase tracking-wide">
                      Превышение дневного лимита уроков
                    </h4>
                  </div>

                  <p className="text-xs text-blue-900 leading-relaxed">
                    У классов {overloadedGrades.map((g) => `${g}-х параллелей`).join(', ')} сумма часов учебного плана превышает максимальный дневной лимит уроков.
                  </p>

                  <button
                    onClick={() => handleIncreaseParallelLimit(overloadedGrades)}
                    className="w-full flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-xs font-bold text-white shadow-xs hover:bg-blue-700 active:scale-95 transition-all"
                  >
                    <PlusCircle className="h-4 w-4" />
                    <span>Увеличить лимит на +1 урок для параллелей [{overloadedGrades.join(', ')}]</span>
                  </button>
                </div>
              )}

              {/* Bottleneck 3: Congested Rooms */}
              {congestedRooms.length > 0 && (
                <div className="rounded-2xl border border-indigo-200 bg-indigo-50/40 p-4 space-y-3">
                  <div className="flex items-center gap-2">
                    <DoorClosed className="h-4 w-4 text-indigo-700" />
                    <h4 className="font-extrabold text-xs text-indigo-950 uppercase tracking-wide">
                      Дефицит кабинетов ({congestedRooms.length})
                    </h4>
                  </div>

                  <p className="text-xs text-indigo-900 leading-relaxed">
                    Одновременно нескольким классам требуются специализированные кабинеты (спортзал, лаборатория, ИТ):
                  </p>

                  <div className="space-y-2">
                    {congestedRooms.map((r) => (
                      <div
                        key={r.id}
                        className="flex items-center justify-between rounded-xl bg-white p-2.5 border border-indigo-100 text-xs"
                      >
                        <span className="font-bold text-slate-800">{r.name}</span>
                        <button
                          onClick={() => handleAddDuplicateRoom(r.type, r.name)}
                          className="flex items-center gap-1 rounded-lg bg-indigo-50 px-2.5 py-1 font-bold text-indigo-700 hover:bg-indigo-600 hover:text-white transition-all text-[11px]"
                        >
                          <PlusCircle className="h-3.5 w-3.5" />
                          <span>Создать второй {r.name}</span>
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Bottleneck 4: Teacher Collisions / Staffing deficit */}
              {teacherCollisionSubjects.length > 0 && (
                <div className="rounded-2xl border border-purple-200 bg-purple-50/40 p-4 space-y-3">
                  <div className="flex items-center gap-2">
                    <Users className="h-4 w-4 text-purple-700" />
                    <h4 className="font-extrabold text-xs text-purple-950 uppercase tracking-wide">
                      Накладки и нехватка ставок учителей
                    </h4>
                  </div>

                  <p className="text-xs text-purple-900 leading-relaxed">
                    Преподаватели по предметам ведут уроки сразу в нескольких классах в одно и то же время:
                  </p>

                  <div className="space-y-2">
                    {teacherCollisionSubjects.map((s) => (
                      <div
                        key={s?.id}
                        className="flex items-center justify-between rounded-xl bg-white p-2.5 border border-purple-100 text-xs"
                      >
                        <span className="font-bold text-slate-800">{s?.name}</span>
                        <div className="flex items-center gap-1.5">
                          <button
                            onClick={() => handleAddTeacherForSubject(s!.id, 1)}
                            className="flex items-center gap-1 rounded-lg bg-purple-50 px-2.5 py-1 font-bold text-purple-700 hover:bg-purple-600 hover:text-white transition-all text-[11px]"
                          >
                            <PlusCircle className="h-3.5 w-3.5" />
                            <span>+1 ставка (1 см)</span>
                          </button>
                          <button
                            onClick={() => handleAddTeacherForSubject(s!.id, 2)}
                            className="flex items-center gap-1 rounded-lg bg-purple-50 px-2.5 py-1 font-bold text-purple-700 hover:bg-purple-600 hover:text-white transition-all text-[11px]"
                          >
                            <PlusCircle className="h-3.5 w-3.5" />
                            <span>+1 ставка (2 см)</span>
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Universal Solution 5: Comprehensive 1-Click Fix & Deep Mathematical CP-SAT Repair */}
              <div className="rounded-2xl border border-indigo-200 bg-gradient-to-r from-indigo-50/80 via-purple-50/60 to-blue-50/80 p-4 space-y-3 shadow-xs">
                <div className="flex items-center gap-2 text-indigo-900">
                  <Sparkles className="h-5 w-5 text-indigo-600" />
                  <h4 className="font-extrabold text-xs text-indigo-950 uppercase tracking-wide">
                    Комплексное устранение всех недостатков и глубокий ремонт
                  </h4>
                </div>
                <p className="text-xs text-slate-700 leading-relaxed">
                  Запустить автоматический каскад исправлений (эвристики + быстрый Chain-LNS + микро-солвер CP-SAT) для полного устранения всех выявленных недостатков расписания.
                </p>
                <div className="grid sm:grid-cols-2 gap-2.5 pt-1">
                  <button
                    onClick={handleFixAll}
                    disabled={isFixingAll || state.schedule.length === 0}
                    className="flex items-center justify-center gap-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 px-4 py-2.5 text-xs font-bold text-white shadow-xs active:scale-95 transition-all disabled:opacity-50 cursor-pointer"
                  >
                    <Sparkles className={`h-4 w-4 ${isFixingAll ? 'animate-spin' : ''}`} />
                    <span>{isFixingAll ? 'Исправление...' : '✨ Решить всё в 1 клик'}</span>
                  </button>
                  <button
                    onClick={handleRunLNSFromModal}
                    disabled={isRepairingLNS}
                    className="flex items-center justify-center gap-2 rounded-xl bg-slate-900 hover:bg-slate-800 px-4 py-2.5 text-xs font-bold text-white shadow-xs active:scale-95 transition-all disabled:opacity-50 cursor-pointer"
                  >
                    <RefreshCw className={`h-4 w-4 ${isRepairingLNS ? 'animate-spin' : ''}`} />
                    <span>{isRepairingLNS ? 'Выполняется расчет...' : 'Глубокий пересчет (CP-SAT)'}</span>
                  </button>
                </div>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="border-t border-slate-200 p-4 bg-slate-50 flex items-center justify-between">
              <span className="text-xs font-bold text-slate-500">
                Замечаний осталось: <strong>{currentIssuesForModal.length}</strong>
              </span>

              <div className="flex items-center gap-2">
                <button
                  onClick={handleFixAll}
                  disabled={isFixingAll || state.schedule.length === 0}
                  className="flex items-center gap-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 px-3.5 py-2 text-xs font-bold text-white shadow-xs active:scale-95 transition-all disabled:opacity-50 cursor-pointer"
                >
                  <Sparkles className={`h-3.5 w-3.5 ${isFixingAll ? 'animate-spin' : ''}`} />
                  <span>Решить всё в 1 клик</span>
                </button>
                <button
                  onClick={() => {
                    setShowConflictModal(false);
                    setAutoFixModalCore(null);
                  }}
                  className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-xs font-bold text-slate-700 hover:bg-slate-100 transition-all shadow-2xs cursor-pointer"
                >
                  Закрыть окно
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
