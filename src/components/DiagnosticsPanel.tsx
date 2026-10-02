import React, { useState } from 'react';
import { AppState, DiagnosticIssue } from '../types/schedule';
import {
  runDiagnostics,
  autoFixIssue,
  autoFixAllIssues,
  diagnoseConstraints,
  applyAutoFix,
  applyAllAutoFixes,
  repairScheduleLNS,
  MUCCore,
  AutoFixAction,
} from '../utils/diagnostics';
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
  // Active Contour tab: 'contour1' (MUC Structural Pre-Analysis) or 'contour2' (LNS Schedule Local Repair)
  const [activeContour, setActiveContour] = useState<'contour1' | 'contour2'>('contour1');

  // Contour 1: Structural Analysis (MUC / IIS)
  const structuralResult = diagnoseConstraints(state);

  // Contour 2: Schedule Diagnostics
  const scheduleIssues = runDiagnostics(state);

  const [lastActionMessage, setLastActionMessage] = useState<string | null>(null);
  const [lastActionType, setLastActionType] = useState<'success' | 'error'>('success');
  const [isRepairingLNS, setIsRepairingLNS] = useState(false);

  const errors = scheduleIssues.filter((i) => i.severity === 'error');
  const warnings = scheduleIssues.filter((i) => i.severity === 'warning');
  const autoFixableCount = scheduleIssues.filter((i) => i.canAutoFix).length;

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
      setLastActionMessage(`Успешно: ${action.label}`);
      setLastActionType('success');
    } else {
      setLastActionMessage(`Не удалось применить действие для ${coreTitle}`);
      setLastActionType('error');
    }
    setTimeout(() => setLastActionMessage(null), 4000);
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
      setLastActionMessage(`Успешно устранено ${fixedCoresCount} структурных конфликтов (MUC)!`);
      setLastActionType('success');
    } else {
      setLastActionMessage('Все ограничения уже согласованы.');
      setLastActionType('success');
    }
    setTimeout(() => setLastActionMessage(null), 4000);
  };

  // -------------------------------------------------------------------
  // CONTOUR 2 HANDLERS (LNS Ruin-and-Recreate & Quick-Fixes)
  // -------------------------------------------------------------------
  const handleRunLNSFull = () => {
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
          setLastActionMessage(repairResult.message);
          setLastActionType('success');
        } else {
          setLastActionMessage(repairResult.message);
          setLastActionType(repairResult.success ? 'success' : 'error');
        }
      } finally {
        setIsRepairingLNS(false);
      }
      setTimeout(() => setLastActionMessage(null), 4500);
    }, 50);
  };

  const handleFixOne = (issue: DiagnosticIssue) => {
    const updated = autoFixIssue(state, issue);
    if (updated !== state) {
      if (onUpdateStateWithUndo) {
        onUpdateStateWithUndo(updated, `Исправлено: ${issue.title}`, 'success');
      } else {
        onUpdateState(updated);
      }
      setLastActionMessage(`Успешно исправлено: ${issue.title}`);
      setLastActionType('success');
    } else {
      if (onUpdateStateWithUndo) {
        onUpdateStateWithUndo(state, `Не удалось автоматически исправить: ${issue.title}`, 'error');
      }
      setLastActionMessage(`Не удалось автоматически исправить: ${issue.title}`);
      setLastActionType('error');
    }
    setTimeout(() => setLastActionMessage(null), 4000);
  };

  const handleFixAll = () => {
    const { newState, fixedCount } = autoFixAllIssues(state);
    if (newState !== state && fixedCount > 0) {
      if (onUpdateStateWithUndo) {
        onUpdateStateWithUndo(newState, `Успешно устранено замечаний: ${fixedCount}`, 'success');
      } else {
        onUpdateState(newState);
      }
      setLastActionMessage(`Автоматически устранено ${fixedCount} замечаний!`);
      setLastActionType('success');
    } else {
      if (onUpdateStateWithUndo) {
        onUpdateStateWithUndo(state, 'Не удалось автоматически устранить ошибки в 1 клик.', 'error');
      }
      setLastActionMessage('Не удалось автоматически устранить ошибки или предупреждения.');
      setLastActionType('error');
    }
    setTimeout(() => setLastActionMessage(null), 4000);
  };

  // Grouped stats for Contour 2
  const studentGaps = scheduleIssues.filter((i) => i.type === 'student_gap');
  const teacherCollisions = scheduleIssues.filter((i) => i.type === 'teacher_collision');
  const roomIssues = scheduleIssues.filter((i) => i.type === 'room_collision' || i.type === 'room_type_mismatch');
  const limitIssues = scheduleIssues.filter((i) => i.type === 'daily_limit_exceeded');
  const teacherGaps = scheduleIssues.filter((i) => i.type === 'teacher_gap');
  const missingHours = scheduleIssues.filter((i) => i.type === 'missing_hours');
  const constraintIssues = scheduleIssues.filter((i) => i.type === 'constraint_violation');

  return (
    <div className="space-y-6">
      {/* Toast notification */}
      {lastActionMessage && (
        <div
          className={`flex items-center gap-2 rounded-xl px-4 py-3 text-sm font-semibold text-white shadow-lg transition-all animate-bounce ${
            lastActionType === 'error' ? 'bg-rose-600' : 'bg-emerald-600'
          }`}
        >
          {lastActionType === 'error' ? (
            <AlertCircle className="h-5 w-5" />
          ) : (
            <CheckCircle2 className="h-5 w-5" />
          )}
          <span>{lastActionMessage}</span>
        </div>
      )}

      {/* DUAL-CONTOUR NAVIGATION SWITCHER */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-2 shadow-xs">
        <div className="flex rounded-xl bg-slate-100 p-1">
          {/* Contour 1 Tab */}
          <button
            onClick={() => setActiveContour('contour1')}
            className={`flex items-center gap-2 rounded-lg px-4 py-2.5 text-xs font-bold transition-all ${
              activeContour === 'contour1'
                ? 'bg-white text-indigo-700 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Cpu className="h-4 w-4" />
            <span>Контур 1: Структурный анализ (MUC / IIS)</span>
            {structuralResult.cores.length > 0 ? (
              <span className="rounded-full bg-rose-100 px-2 py-0.5 text-[10px] font-black text-rose-700 animate-pulse">
                {structuralResult.cores.length} MUC
              </span>
            ) : (
              <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-black text-emerald-700">
                0 ядер ✓
              </span>
            )}
          </button>

          {/* Contour 2 Tab */}
          <button
            onClick={() => setActiveContour('contour2')}
            className={`flex items-center gap-2 rounded-lg px-4 py-2.5 text-xs font-bold transition-all ${
              activeContour === 'contour2'
                ? 'bg-white text-indigo-700 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Layers className="h-4 w-4" />
            <span>Контур 2: Локальный ремонт (LNS)</span>
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
        </div>

        <div className="flex items-center gap-2 px-2 text-xs text-slate-500">
          <ShieldCheck className="h-4 w-4 text-indigo-600 shrink-0" />
          <span className="hidden md:inline">
            Двухконтурная система автоисправления: Pre-solve MUC анализ + LNS Ruin-and-Recreate
          </span>
        </div>
      </div>

      {/* =================================================================== */}
      {/* CONTOUR 1 VIEW: STRUCTURAL ANALYSIS (MUC / IIS + MINIMAL RELAXATION) */}
      {/* =================================================================== */}
      {activeContour === 'contour1' && (
        <div className="space-y-6">
          {/* Main Status Header Card */}
          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xs">
            <div
              className={`p-6 ${
                structuralResult.cores.length > 0
                  ? 'bg-rose-50/50 border-b border-rose-100'
                  : 'bg-emerald-50/50 border-b border-emerald-100'
              }`}
            >
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div className="flex items-center gap-4">
                  <div
                    className={`flex h-14 w-14 items-center justify-center rounded-2xl ${
                      structuralResult.cores.length > 0
                        ? 'bg-rose-100 text-rose-600'
                        : 'bg-emerald-100 text-emerald-600'
                    }`}
                  >
                    {structuralResult.cores.length > 0 ? (
                      <AlertCircle className="h-7 w-7" />
                    ) : (
                      <CheckCircle2 className="h-7 w-7" />
                    )}
                  </div>

                  <div>
                    <h2 className="text-xl font-extrabold text-slate-800">
                      {structuralResult.isFeasible
                        ? 'Математическая модель 100% выполнима'
                        : `Обнаружено ${structuralResult.cores.length} невыполнимых ядер (MUC / IIS)`}
                    </h2>
                    <p className="mt-1 text-xs text-slate-600 max-w-2xl">
                      {structuralResult.isFeasible
                        ? 'Баланс слотов параллелей, недельная нагрузка преподавателей и емкость профильных кабинетов полностью согласованы. Задача имеет строгое математическое решение.'
                        : `Система изолировала минимальные невыполнимые ядра (Minimal Unsatisfiable Cores). Найдено ${structuralResult.totalOverloadHours} ч. дефицита слотов/ресурсов. Примените минимальное дельта-ослабление (Δ) в 1 клик.`}
                    </p>
                  </div>
                </div>

                {structuralResult.cores.length > 0 && (
                  <button
                    onClick={handleApplyAllMUC}
                    className="flex items-center gap-2 rounded-xl bg-indigo-600 px-5 py-3 text-sm font-bold text-white shadow-md transition-all hover:bg-indigo-700 hover:shadow-lg active:scale-95"
                  >
                    <Sparkles className="h-4 w-4" />
                    Исправить ВСЕ ядра MUC в 1 клик ({structuralResult.cores.length})
                  </button>
                )}
              </div>
            </div>

            {/* 4 Diagnostic Metrics */}
            <div className="grid grid-cols-2 divide-x divide-y divide-slate-100 border-t border-slate-100 sm:grid-cols-4 text-center">
              <div className="p-4">
                <div className="text-[11px] font-semibold text-slate-500">Слоты параллелей</div>
                <div
                  className={`mt-1 text-base font-black ${
                    structuralResult.metrics.classesDeficitCount === 0
                      ? 'text-emerald-600'
                      : 'text-rose-600'
                  }`}
                >
                  {structuralResult.metrics.classesDeficitCount === 0
                    ? 'Сбалансированы ✓'
                    : `${structuralResult.metrics.classesDeficitCount} кл. с дефицитом`}
                </div>
              </div>

              <div className="p-4">
                <div className="text-[11px] font-semibold text-slate-500">Нагрузка учителей</div>
                <div
                  className={`mt-1 text-base font-black ${
                    structuralResult.metrics.teachersOverloadedCount === 0
                      ? 'text-emerald-600'
                      : 'text-rose-600'
                  }`}
                >
                  {structuralResult.metrics.teachersOverloadedCount === 0
                    ? 'В пределах нормы ✓'
                    : `${structuralResult.metrics.teachersOverloadedCount} перегружено`}
                </div>
              </div>

              <div className="p-4">
                <div className="text-[11px] font-semibold text-slate-500">Пропускная способность спецкабинетов</div>
                <div
                  className={`mt-1 text-base font-black ${
                    structuralResult.metrics.roomDeficitCount === 0
                      ? 'text-emerald-600'
                      : 'text-rose-600'
                  }`}
                >
                  {structuralResult.metrics.roomDeficitCount === 0
                    ? '100% емкости ✓'
                    : `${structuralResult.metrics.roomDeficitCount} дефицит`}
                </div>
              </div>

              <div className="p-4">
                <div className="text-[11px] font-semibold text-slate-500">Учебный план vs Сетка школы</div>
                <div className="mt-1 text-base font-black text-slate-700">
                  {structuralResult.metrics.totalCurriculumHours} ч / {structuralResult.metrics.totalSlotsAvailable} сл.
                </div>
              </div>
            </div>
          </div>

          {/* List of MUC Cores with 1-Click Minimal Delta Relaxation */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-slate-800">
                Карточки изолированных ядер MUC ({structuralResult.cores.length})
              </h3>
              <span className="text-xs text-slate-500">
                Алгоритм рассчитывает минимальную дельту Δ, делающую подсистему разрешимой
              </span>
            </div>

            {structuralResult.cores.length === 0 ? (
              <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center space-y-3">
                <CheckCircle2 className="mx-auto h-12 w-12 text-emerald-500" />
                <h4 className="text-base font-bold text-slate-800">
                  Все структурные ограничения согласованы!
                </h4>
                <p className="text-xs text-slate-500 max-w-lg mx-auto">
                  Ни один класс не превышает лимит слотов, учителя не перегружены свыше индивидуальной ставки, спортзалы и лаборатории имеют достаточную недельную пропускную способность.
                </p>
                <button
                  onClick={onNavigateToSchedule}
                  className="rounded-xl bg-indigo-600 px-4 py-2 text-xs font-bold text-white shadow-xs hover:bg-indigo-700"
                >
                  Перейти к генерации расписания
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                {structuralResult.cores.map((core) => {
                  const typeLabel =
                    core.type === 'parallel_slots'
                      ? 'Параллель'
                      : core.type === 'teacher_load'
                      ? 'Преподаватель'
                      : core.type === 'room_capacity'
                      ? 'Спецкабинет'
                      : 'Ограничение';

                  return (
                    <div
                      key={core.id}
                      className="rounded-2xl border border-rose-200 bg-rose-50/30 p-5 space-y-4 shadow-2xs"
                    >
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="flex items-start gap-3">
                          <div className="mt-0.5 rounded-xl bg-rose-100 p-2 text-rose-600">
                            <AlertCircle className="h-5 w-5" />
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-extrabold text-slate-900 text-sm">
                                {core.title}
                              </span>
                              <span className="rounded-md bg-rose-100 px-2 py-0.5 text-[10px] font-black uppercase text-rose-700 tracking-wider">
                                {typeLabel}
                              </span>
                              <span className="rounded-md bg-indigo-50 border border-indigo-200 px-2 py-0.5 text-[10px] font-black text-indigo-700">
                                Минимальная дельта: Δ = +{core.delta} {core.unit}
                              </span>
                            </div>
                            <p className="mt-1 text-xs text-slate-600 max-w-3xl leading-relaxed">
                              {core.description}
                            </p>
                          </div>
                        </div>

                        <div className="text-right">
                          <div className="text-[11px] font-semibold text-slate-500">Потребность vs Доступно</div>
                          <div className="font-mono text-xs font-bold text-slate-800">
                            {core.required} / {core.available} {core.unit}
                          </div>
                        </div>
                      </div>

                      {/* 1-Click Action Buttons for this MUC Core */}
                      <div className="border-t border-rose-100/80 pt-3 flex flex-wrap items-center gap-2">
                        <span className="text-xs font-bold text-slate-700 mr-2 flex items-center gap-1">
                          <Zap className="h-3.5 w-3.5 text-amber-500" />
                          Кнопки Auto-Fix (Минимальное ослабление Δ):
                        </span>

                        {core.actions.map((act) => (
                          <button
                            key={act.id}
                            onClick={() => handleApplyAction(act, core.title)}
                            className="flex items-center gap-1.5 rounded-xl border border-indigo-200 bg-white px-3.5 py-2 text-xs font-bold text-indigo-700 shadow-2xs hover:bg-indigo-50 hover:border-indigo-300 active:scale-95 transition-all"
                            title={act.description}
                          >
                            {act.type === 'increase_parallel_limit' || act.type === 'increase_teacher_limit' ? (
                              <PlusCircle className="h-3.5 w-3.5 text-emerald-600" />
                            ) : act.type === 'reduce_curriculum_hours' ? (
                              <Scissors className="h-3.5 w-3.5 text-amber-600" />
                            ) : act.type === 'add_room' ? (
                              <DoorClosed className="h-3.5 w-3.5 text-indigo-600" />
                            ) : (
                              <Check className="h-3.5 w-3.5 text-indigo-600" />
                            )}
                            <span>{act.label}</span>
                          </button>
                        ))}
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
      {/* CONTOUR 2 VIEW: LOCAL REPAIR (LNS RUIN-AND-RECREATE & GRID REPAIR) */}
      {/* =================================================================== */}
      {activeContour === 'contour2' && (
        <div className="space-y-6">
          {/* Main Status Header Card */}
          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xs">
            <div
              className={`p-6 ${
                errors.length > 0
                  ? 'bg-rose-50/50 border-b border-rose-100'
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
                        : 'Алгоритм локального ремонта (LNS) замораживает 90–95% сетки и пересчитывает только затронутый район (±1 день).'}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={handleRunLNSFull}
                    disabled={isRepairingLNS || state.schedule.length === 0}
                    className="flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-3 text-sm font-bold text-white shadow-md hover:bg-slate-800 active:scale-95 transition-all disabled:opacity-50"
                  >
                    <RefreshCw className={`h-4 w-4 ${isRepairingLNS ? 'animate-spin' : ''}`} />
                    Локальный ремонт (LNS)
                  </button>

                  {autoFixableCount > 0 && (
                    <button
                      onClick={handleFixAll}
                      className="flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-3 text-sm font-bold text-white shadow-md hover:bg-indigo-700 active:scale-95 transition-all"
                    >
                      <Sparkles className="h-4 w-4" />
                      Исправить всё в 1 клик ({autoFixableCount})
                    </button>
                  )}
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

              <div className="p-3">
                <div className="text-[11px] font-semibold text-slate-500">Окна учителей</div>
                <div className="mt-1 text-base font-black text-slate-700">
                  {teacherGaps.length === 0 ? '0 окон ✓' : `${teacherGaps.length} окон`}
                </div>
              </div>

              <div className="p-3">
                <div className="text-[11px] font-semibold text-slate-500">Правила предметов</div>
                <div
                  className={`mt-1 text-base font-black ${
                    constraintIssues.length === 0 ? '0 наруш. ✓' : 'text-amber-600'
                  }`}
                >
                  {constraintIssues.length === 0 ? '0 наруш. ✓' : `${constraintIssues.length} наруш.`}
                </div>
              </div>
            </div>
          </div>

          {/* Issues list */}
          <div className="space-y-3">
            <h3 className="text-sm font-bold text-slate-800">
              Журнал замечаний текущего расписания ({scheduleIssues.length})
            </h3>

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
                          {issue.canAutoFix && (
                            <button
                              onClick={() => handleFixOne(issue)}
                              className="flex items-center gap-1.5 rounded-xl border border-indigo-200 bg-white px-3.5 py-1.5 text-xs font-bold text-indigo-700 shadow-2xs hover:bg-indigo-50 hover:border-indigo-300 active:scale-95 transition-all"
                            >
                              <Wrench className="h-3.5 w-3.5" />
                              <span>{issue.fixDescription || 'Исправить в 1 клик'}</span>
                            </button>
                          )}
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
    </div>
  );
};
