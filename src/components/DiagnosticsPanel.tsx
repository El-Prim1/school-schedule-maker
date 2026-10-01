import React, { useState } from 'react';
import { AppState, DiagnosticIssue } from '../types/schedule';
import { runDiagnostics, autoFixIssue, autoFixAllIssues } from '../utils/diagnostics';
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
  const issues = runDiagnostics(state);
  const [lastActionMessage, setLastActionMessage] = useState<string | null>(null);
  const [lastActionType, setLastActionType] = useState<'success' | 'error'>('success');

  const errors = issues.filter((i) => i.severity === 'error');
  const warnings = issues.filter((i) => i.severity === 'warning');
  const infos = issues.filter((i) => i.severity === 'info');

  const autoFixableCount = issues.filter((i) => i.canAutoFix).length;

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

  const handleIncreaseLimit = (grade: number, newLimit: number) => {
    const updatedLimits = { ...state.parallelLimits, [grade]: newLimit };
    const newState = { ...state, parallelLimits: updatedLimits };
    if (onUpdateStateWithUndo) {
      onUpdateStateWithUndo(newState, `Лимит для ${grade} класса увеличен до ${newLimit} уроков/день`, 'success');
    } else {
      onUpdateState(newState);
    }
  };

  const getSmartAdvice = (issue: DiagnosticIssue): { advice: string; actionLabel?: string; onAction?: () => void } | null => {
    if (issue.type === 'daily_limit_exceeded') {
      const cls = state.classes.find((c) => c.id === issue.classId);
      const grade = cls?.grade || 5;
      const currentLimit = state.parallelLimits[grade] || 6;
      const newLimit = currentLimit + 1;
      return {
        advice: `💡 Совет директора: Если учебная нагрузка класса требует больше уроков, увеличивайте дневной лимит в 1 клик.`,
        actionLabel: `Увеличить лимит ${grade} кл. до ${newLimit}`,
        onAction: () => handleIncreaseLimit(grade, newLimit),
      };
    }

    if (issue.type === 'missing_hours') {
      const cls = state.classes.find((c) => c.id === issue.classId);
      const grade = cls?.grade || 5;
      const currentLimit = state.parallelLimits[grade] || 6;
      return {
        advice: `💡 Совет директора: Нехватка часов решается автоматической вставкой урока в свободный слот или расширением дневного лимита.`,
        actionLabel: `Увеличить лимит ${grade} кл. до ${currentLimit + 1}`,
        onAction: () => handleIncreaseLimit(grade, currentLimit + 1),
      };
    }

    if (issue.type === 'teacher_collision') {
      return {
        advice: `💡 Совет директора: Учитель одновременно нужен в 2 классах. Рекомендуется назначить еще одного учителя по предмету в «Учителях» или развести уроки.`,
      };
    }

    if (issue.type === 'room_collision' || issue.type === 'room_type_mismatch') {
      return {
        advice: `💡 Совет директора: Добавьте дополнительные профильные кабинеты в «Кабинетах» или разрешите проведение в обычном классе.`,
      };
    }

    if (issue.type === 'constraint_violation') {
      return {
        advice: `💡 Совет директора: Ограничение предмета требует определенного слота/дня. Нажмите кнопку автоматической перестановки.`,
      };
    }

    return null;
  };

  const studentGaps = issues.filter((i) => i.type === 'student_gap');
  const teacherCollisions = issues.filter((i) => i.type === 'teacher_collision');
  const roomIssues = issues.filter((i) => i.type === 'room_collision' || i.type === 'room_type_mismatch');
  const limitIssues = issues.filter((i) => i.type === 'daily_limit_exceeded');
  const teacherGaps = issues.filter((i) => i.type === 'teacher_gap');
  const missingHours = issues.filter((i) => i.type === 'missing_hours');
  const constraintIssues = issues.filter((i) => i.type === 'constraint_violation');

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
                    : 'Система автоматической диагностики выявила нестыковки. Вы можете исправить их в 1 клик.'}
                </p>
              </div>
            </div>

            {autoFixableCount > 0 && (
              <button
                onClick={handleFixAll}
                className="flex items-center gap-2 rounded-xl bg-indigo-600 px-5 py-3 text-sm font-bold text-white shadow-md transition-all hover:bg-indigo-700 hover:shadow-lg active:scale-95"
              >
                <Sparkles className="h-4 w-4" />
                Исправить ВСЕ ошибки и замечания в 1 клик ({autoFixableCount})
              </button>
            )}
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
          Подробный журнал диагностики ({issues.length})
        </h3>

        {issues.length === 0 || (issues.length === 1 && issues[0].id === 'no_schedule') ? (
          <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center">
            <CheckCircle2 className="mx-auto h-10 w-10 text-emerald-500" />
            <h4 className="mt-3 text-base font-bold text-slate-800">
              Все проверки пройдены без ошибок!
            </h4>
            <p className="mt-1 text-xs text-slate-500 max-w-md mx-auto">
              Расписание не содержит окон у классов, накладок у преподавателей, переполнения кабинетов. Профильные спортзалы и лаборатории распределены строго по стандартам.
            </p>
            <button
              onClick={onNavigateToSchedule}
              className="mt-4 rounded-xl bg-slate-900 px-4 py-2 text-xs font-bold text-white shadow-xs hover:bg-slate-800"
            >
              Перейти к расписанию
            </button>
          </div>
        ) : (
          <div className="space-y-2.5">
            {issues.map((issue) => {
              const isError = issue.severity === 'error';
              const isWarning = issue.severity === 'warning';
              const adviceData = getSmartAdvice(issue);

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
                      {adviceData?.onAction && (
                        <button
                          onClick={adviceData.onAction}
                          className="flex items-center gap-1.5 rounded-xl bg-amber-600 px-3 py-1.5 text-xs font-bold text-white shadow-2xs hover:bg-amber-700 active:scale-95 transition-all"
                        >
                          <Zap className="h-3.5 w-3.5" />
                          <span>{adviceData.actionLabel}</span>
                        </button>
                      )}

                      {issue.canAutoFix && (
                        <button
                          onClick={() => handleFixOne(issue)}
                          className="flex items-center gap-1.5 rounded-xl border border-indigo-200 bg-white px-3 py-1.5 text-xs font-bold text-indigo-700 shadow-2xs hover:bg-indigo-50 hover:border-indigo-300 active:scale-95 transition-all"
                        >
                          <Wrench className="h-3.5 w-3.5" />
                          <span>{issue.fixDescription || 'Исправить в 1 клик'}</span>
                        </button>
                      )}
                    </div>
                  </div>

                  {adviceData && (
                    <div className="rounded-xl bg-amber-100/60 p-2.5 text-xs font-semibold text-amber-900 border border-amber-200/60">
                      {adviceData.advice}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
