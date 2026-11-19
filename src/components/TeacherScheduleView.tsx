import React, { useState } from 'react';
import { AppState, ScheduleItem } from '../types/schedule';
import { DAYS_OF_WEEK, ROOM_TYPE_META } from '../utils/constants';
import {
  getBellScheduleForShift,
  getShift1LessonsCount,
  getLessonTimeString,
  calculateShift2StartTime,
} from '../utils/shiftUtils';
import {
  fixTeacherWindowChain,
  getTeacherDayWindows,
  ChainRepairResult,
} from '../utils/chainRepairEngine';
import { applyAutoFix, AutoFixAction, MUCCore } from '../utils/autoFixEngine';
import {
  UserCheck,
  Clock,
  Coffee,
  Sun,
  Moon,
  Zap,
  Sparkles,
  RefreshCw,
  AlertTriangle,
  X,
  CheckCircle2,
  Sliders,
  ArrowRight,
  ShieldCheck,
} from 'lucide-react';

interface TeacherScheduleViewProps {
  state: AppState;
  onUpdateSchedule?: (newSchedule: ScheduleItem[]) => void;
  onUpdateState?: (newState: AppState) => void;
  onUpdateStateWithUndo?: (
    newState: AppState,
    message: string,
    type?: 'success' | 'error' | 'warning'
  ) => void;
  onNotify?: (message: string, type?: 'success' | 'error' | 'warning' | 'info') => void;
}

export const TeacherScheduleView: React.FC<TeacherScheduleViewProps> = ({
  state,
  onUpdateSchedule,
  onUpdateState,
  onUpdateStateWithUndo,
  onNotify,
}) => {
  const { teachers, classes, subjects, rooms, schedule, settings, parallelLimits } = state;
  const daysCount = settings.daysPerWeek;

  const [selectedTeacherId, setSelectedTeacherId] = useState<string>(teachers[0]?.id || '');
  const [shiftFilter, setShiftFilter] = useState<'all' | 1 | 2>('all');
  const [repairingDay, setRepairingDay] = useState<number | null>(null);

  // Auto-Fix Modal state for unresolvable bottlenecks
  const [autoFixModal, setAutoFixModal] = useState<{
    isOpen: boolean;
    diagnostic: MUCCore;
    dayIndex: number;
    teacherId: string;
  } | null>(null);

  const currentTeacher = teachers.find((t) => t.id === selectedTeacherId) || teachers[0];

  const subjectMap = new Map(subjects.map((s) => [s.id, s]));
  const classMap = new Map(classes.map((c) => [c.id, c]));
  const roomMap = new Map(rooms.map((r) => [r.id, r]));

  const shift1LessonsCount = React.useMemo(() => {
    return getShift1LessonsCount(classes, parallelLimits);
  }, [classes, parallelLimits]);

  const shift1BellSchedule = React.useMemo(() => {
    return getBellScheduleForShift(
      1,
      settings?.shift1Start || '08:00',
      settings?.breakDurationMinutes ?? 10,
      shift1LessonsCount,
      settings?.breakAfterLesson2Minutes,
      settings?.breakAfterLesson3Minutes
    );
  }, [
    settings?.shift1Start,
    settings?.breakDurationMinutes,
    settings?.breakAfterLesson2Minutes,
    settings?.breakAfterLesson3Minutes,
    shift1LessonsCount,
  ]);

  const shift2BellSchedule = React.useMemo(() => {
    return getBellScheduleForShift(
      2,
      settings?.shift1Start || '08:00',
      settings?.breakDurationMinutes ?? 10,
      shift1LessonsCount,
      settings?.breakAfterLesson2Minutes,
      settings?.breakAfterLesson3Minutes
    );
  }, [
    settings?.shift1Start,
    settings?.breakDurationMinutes,
    settings?.breakAfterLesson2Minutes,
    settings?.breakAfterLesson3Minutes,
    shift1LessonsCount,
  ]);

  if (!currentTeacher) {
    return <div className="p-8 text-center text-slate-500">Учителя не добавлены</div>;
  }

  // Teacher lessons
  const teacherLessons = schedule.filter((s) => {
    if (s.teacherId !== currentTeacher.id) return false;
    if (shiftFilter === 'all') return true;
    const cls = classMap.get(s.classId);
    return (cls?.shift || 1) === shiftFilter;
  });

  const allTeacherLessons = schedule.filter((s) => s.teacherId === currentTeacher.id);
  const totalHours = allTeacherLessons.length;

  const shift1Hours = allTeacherLessons.filter((s) => (classMap.get(s.classId)?.shift || 1) === 1).length;
  const shift2Hours = allTeacherLessons.filter((s) => (classMap.get(s.classId)?.shift || 1) === 2).length;

  // Calculate windows per day for this teacher using exact chain logic
  const dayStats = Array.from({ length: daysCount }).map((_, day) => {
    const win = getTeacherDayWindows(schedule, currentTeacher.id, day);
    const dayLessons = teacherLessons
      .filter((s) => s.dayOfWeek === day)
      .sort((a, b) => a.lessonIndex - b.lessonIndex);

    return {
      day,
      count: dayLessons.length,
      hasWindow: win.hasWindow,
      windowsCount: win.windowsCount,
      emptySlots: win.emptySlots,
      minSlot: win.minSlot,
      maxSlot: win.maxSlot,
    };
  });

  const totalWindows = dayStats.reduce((sum, d) => sum + d.windowsCount, 0);

  // Handler: Fix teacher window chain via Chain-LNS
  const handleFixWindowChain = async (dayIndex: number) => {
    if (!currentTeacher || repairingDay !== null) return;
    setRepairingDay(dayIndex);

    try {
      const res: ChainRepairResult = await fixTeacherWindowChain(
        state,
        currentTeacher.id,
        dayIndex
      );

      if (res.success && res.eliminatedGapsCount > 0) {
        const newState: AppState = {
          ...state,
          schedule: res.repairedSchedule,
        };

        if (onUpdateStateWithUndo) {
          onUpdateStateWithUndo(newState, res.message, 'success');
        } else if (onUpdateSchedule) {
          onUpdateSchedule(res.repairedSchedule);
        } else if (onUpdateState) {
          onUpdateState(newState);
        }

        if (onNotify) {
          onNotify(res.message, 'success');
        }
      } else if (!res.success) {
        if (res.unresolvableDiagnostic) {
          setAutoFixModal({
            isOpen: true,
            diagnostic: res.unresolvableDiagnostic,
            dayIndex,
            teacherId: currentTeacher.id,
          });
        }
        if (onNotify) {
          onNotify(res.message, 'warning');
        }
      } else {
        if (onNotify) {
          onNotify(res.message, 'info');
        }
      }
    } catch (err) {
      console.error('Failed to fix teacher window:', err);
      if (onNotify) {
        onNotify('Произошла ошибка при выполнении алгоритма Chain-LNS.', 'error');
      }
    } finally {
      setRepairingDay(null);
    }
  };

  // Handler: Apply 1-Click Auto-Fix action from modal
  const handleApplyAutoFixAction = async (action: AutoFixAction) => {
    try {
      const updatedState = applyAutoFix(state, action);
      if (updatedState !== state) {
        if (onUpdateStateWithUndo) {
          onUpdateStateWithUndo(
            updatedState,
            `Применено автоисправление: ${action.label}`,
            'success'
          );
        } else if (onUpdateState) {
          onUpdateState(updatedState);
        }

        if (onNotify) {
          onNotify(`Успешно применено: ${action.label}`, 'success');
        }

        const modalContext = autoFixModal;
        setAutoFixModal(null);

        // If we have context, automatically attempt to re-run chain repair on the relaxed state
        if (modalContext) {
          setRepairingDay(modalContext.dayIndex);
          setTimeout(async () => {
            try {
              const retryRes = await fixTeacherWindowChain(
                updatedState,
                modalContext.teacherId,
                modalContext.dayIndex
              );
              if (retryRes.success) {
                const finalState = {
                  ...updatedState,
                  schedule: retryRes.repairedSchedule,
                };
                if (onUpdateStateWithUndo) {
                  onUpdateStateWithUndo(finalState, retryRes.message, 'success');
                } else if (onUpdateState) {
                  onUpdateState(finalState);
                }
                if (onNotify) {
                  onNotify(retryRes.message, 'success');
                }
              }
            } finally {
              setRepairingDay(null);
            }
          }, 50);
        }
      }
    } catch (err) {
      console.error('Failed to apply Auto-Fix action:', err);
      if (onNotify) {
        onNotify('Не удалось применить настройку Auto-Fix.', 'error');
      }
    }
  };

  return (
    <div className="space-y-6">
      {/* Teacher selector and info card */}
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-indigo-100 text-indigo-700">
              <UserCheck className="h-6 w-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <select
                  value={selectedTeacherId}
                  onChange={(e) => setSelectedTeacherId(e.target.value)}
                  className="rounded-xl border border-slate-300 bg-white px-3 py-1.5 text-sm font-bold text-slate-800 shadow-2xs focus:border-indigo-500 focus:outline-hidden max-w-md"
                >
                  <optgroup label="Учителя-предметники">
                    {teachers
                      .filter((t) => !t.isHomeroom)
                      .map((tch) => (
                        <option key={tch.id} value={tch.id}>
                          {tch.name}
                        </option>
                      ))}
                  </optgroup>
                  <optgroup label="Классные руководители">
                    {teachers
                      .filter((t) => t.isHomeroom)
                      .map((tch) => (
                        <option key={tch.id} value={tch.id}>
                          {tch.name}
                        </option>
                      ))}
                  </optgroup>
                </select>
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                <span>Предметы:</span>
                {currentTeacher.subjectIds.map((subId) => {
                  const s = subjectMap.get(subId);
                  return (
                    <span
                      key={subId}
                      className="rounded-md px-1.5 py-0.5 font-medium text-[11px]"
                      style={{ backgroundColor: `${s?.color}15`, color: s?.color }}
                    >
                      {s?.name}
                    </span>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Stats pills & Quick Chain-Fix Info */}
          <div className="flex flex-wrap items-center gap-3 text-xs">
            <div className="flex items-center gap-1.5 rounded-xl border border-slate-200 bg-slate-50 p-1">
              <button
                onClick={() => setShiftFilter('all')}
                className={`rounded-lg px-2.5 py-1 font-semibold transition-all ${
                  shiftFilter === 'all'
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Все смены ({totalHours} ч)
              </button>
              <button
                onClick={() => setShiftFilter(1)}
                className={`flex items-center gap-1 rounded-lg px-2.5 py-1 font-semibold transition-all ${
                  shiftFilter === 1
                    ? 'bg-white text-blue-800 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Sun className="h-3 w-3 text-blue-600" />
                1-я см ({shift1Hours} ч)
              </button>
              <button
                onClick={() => setShiftFilter(2)}
                className={`flex items-center gap-1 rounded-lg px-2.5 py-1 font-semibold transition-all ${
                  shiftFilter === 2
                    ? 'bg-white text-amber-800 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Moon className="h-3 w-3 text-amber-600" />
                2-я см ({shift2Hours} ч)
              </button>
            </div>

            <div className="rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2">
              <div className="text-slate-400 font-medium">Общая нагрузка</div>
              <div className="text-sm font-bold text-slate-800">
                {totalHours} / {currentTeacher.maxHoursPerWeek} ч/нед
              </div>
            </div>

            <div
              className={`rounded-xl border px-3.5 py-2 flex items-center gap-3 ${
                totalWindows > 0
                  ? 'border-rose-300 bg-rose-50/80 text-rose-900 shadow-2xs'
                  : 'border-emerald-200 bg-emerald-50 text-emerald-900'
              }`}
            >
              <div>
                <div className="text-[11px] font-medium opacity-80">Окон в расписании</div>
                <div className="text-sm font-black flex items-center gap-1.5">
                  {totalWindows === 0 ? (
                    <>
                      <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                      0 (Идеально)
                    </>
                  ) : (
                    <>
                      <span className="text-rose-700">{totalWindows} ч.</span>
                      <span className="text-[10px] font-normal text-rose-600 bg-rose-100 px-1.5 py-0.2 rounded-md">
                        Chain-LNS активен
                      </span>
                    </>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Timetable Table with Red Badged Windows and ⚡ Auto-Fix Buttons */}
      <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-xs">
        <table className="w-full border-collapse text-left text-xs">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50">
              <th className="w-36 p-3 text-center font-bold text-slate-500">
                <div>Урок / Время</div>
                <div className="text-[10px] font-normal text-slate-400">1 см | 2 см</div>
              </th>
              {DAYS_OF_WEEK.slice(0, daysCount).map((day) => {
                const stat = dayStats[day.index];
                const isDayRepairing = repairingDay === day.index;

                return (
                  <th key={day.index} className="p-3 text-center font-bold text-slate-700">
                    <div className="flex items-center justify-center gap-1.5">
                      <span>{day.name}</span>
                      {stat?.hasWindow && (
                        <span className="rounded-full bg-rose-100 px-1.5 py-0.2 text-[10px] font-black text-rose-700">
                          {stat.windowsCount} окн.
                        </span>
                      )}
                    </div>
                    <span className="block text-[10px] font-normal text-slate-400">
                      {stat?.count} ч.
                    </span>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {shift1BellSchedule.map((bell1, slotIdx) => {
              const bell2 = shift2BellSchedule[slotIdx];

              return (
                <tr key={slotIdx} className="hover:bg-slate-50/40">
                  <td className="p-2.5 text-center bg-slate-50/50 border-r border-slate-100">
                    <div className="font-extrabold text-slate-700">{slotIdx + 1} урок</div>
                    <div className="mt-0.5 space-y-0.5 text-[9px]">
                      <div className="text-blue-700 font-medium">1 см: {bell1.start}</div>
                      {bell2 && <div className="text-amber-700 font-medium">2 см: {bell2.start}</div>}
                    </div>
                  </td>

                  {DAYS_OF_WEEK.slice(0, daysCount).map((day) => {
                    const items = teacherLessons.filter(
                      (s) => s.dayOfWeek === day.index && s.lessonIndex === slotIdx
                    );

                    const stat = dayStats[day.index];
                    const isWindow =
                      items.length === 0 &&
                      stat.minSlot !== undefined &&
                      stat.maxSlot !== undefined &&
                      slotIdx > stat.minSlot &&
                      slotIdx < stat.maxSlot;

                    const isDayRepairing = repairingDay === day.index;

                    return (
                      <td
                        key={day.index}
                        className="p-1.5 align-top min-w-[170px] border-r border-slate-100 last:border-r-0"
                      >
                        {items.length > 0 ? (
                          <div className="space-y-1.5">
                            {items.map((item) => {
                              const subject = subjectMap.get(item.subjectId);
                              const cls = classMap.get(item.classId);
                              const room = roomMap.get(item.roomId);
                              const roomMeta = room ? ROOM_TYPE_META[room.type] : null;
                              const classShift = cls?.shift || 1;
                              const timeStr = getLessonTimeString(slotIdx, classShift, state);

                              return (
                                <div
                                  key={item.id}
                                  className="rounded-xl border border-slate-200 bg-white p-2.5 shadow-2xs transition-all hover:border-indigo-400"
                                  style={{
                                    borderLeftWidth: '4px',
                                    borderLeftColor: subject?.color || '#6366f1',
                                  }}
                                >
                                  <div className="flex items-center justify-between gap-1">
                                    <span className="rounded-md bg-indigo-50 px-1.5 py-0.5 text-xs font-black text-indigo-700">
                                      {cls?.name}
                                    </span>
                                    <span
                                      className={`text-[9px] px-1.5 py-0.2 rounded font-semibold ${
                                        classShift === 2
                                          ? 'bg-amber-100 text-amber-800'
                                          : 'bg-blue-100 text-blue-800'
                                      }`}
                                    >
                                      {classShift}-я см
                                    </span>
                                  </div>

                                  <div className="mt-1 font-bold text-slate-800 text-xs">
                                    {subject?.name || 'Предмет'}
                                  </div>

                                  <div className="mt-1.5 flex items-center justify-between text-[10px]">
                                    {room && (
                                      <span
                                        className={`rounded-md px-1.5 py-0.5 font-semibold border ${
                                          roomMeta?.bg || 'bg-slate-100'
                                        } ${roomMeta?.text || 'text-slate-700'} ${
                                          roomMeta?.border || 'border-slate-200'
                                        }`}
                                      >
                                        {room.name}
                                      </span>
                                    )}
                                    <span className="text-slate-400 font-medium">
                                      {timeStr}
                                    </span>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        ) : isWindow ? (
                          /* HIGHLIGHTED WINDOW SLOT WITH RED BADGE AND CHAIN-LNS FIX BUTTON */
                          <div className="flex flex-col items-center justify-between rounded-xl border border-rose-300 bg-rose-50/70 p-2 text-center shadow-xs transition-all hover:bg-rose-50 group">
                            <div className="flex items-center gap-1.5">
                              <span className="inline-flex items-center gap-1 rounded-md bg-rose-600 px-2 py-0.5 text-[10px] font-black text-white shadow-2xs">
                                <Coffee className="h-3 w-3" />
                                Окно
                              </span>
                              <span className="text-[10px] font-bold text-rose-700">
                                Свободно
                              </span>
                            </div>

                            <p className="mt-1 text-[9px] text-rose-600/90 leading-tight">
                              Промежуточный пустой слот у преподавателя
                            </p>

                            <button
                              onClick={() => handleFixWindowChain(day.index)}
                              disabled={isDayRepairing}
                              className={`mt-2 flex w-full items-center justify-center gap-1.5 rounded-lg px-2 py-1.5 text-[11px] font-bold shadow-xs transition-all ${
                                isDayRepairing
                                  ? 'bg-rose-200 text-rose-800 cursor-wait'
                                  : 'bg-rose-600 text-white hover:bg-rose-700 active:scale-98 cursor-pointer'
                              }`}
                              title="Устранить окно алгоритмом Chain-LNS с пересборкой цепочки уроков"
                            >
                              {isDayRepairing ? (
                                <>
                                  <RefreshCw className="h-3.5 w-3.5 animate-spin text-rose-900" />
                                  <span>Поиск CP-SAT...</span>
                                </>
                              ) : (
                                <>
                                  <Zap className="h-3.5 w-3.5 fill-current text-amber-300" />
                                  <span>⚡ Устранить окно</span>
                                </>
                              )}
                            </button>
                          </div>
                        ) : (
                          <div className="h-16 flex items-center justify-center text-slate-200">
                            —
                          </div>
                        )}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* AUTO-FIX MODAL FOR UNRESOLVABLE BOTTLENECKS */}
      {autoFixModal?.isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="relative w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl border border-slate-100">
            <button
              onClick={() => setAutoFixModal(null)}
              className="absolute right-4 top-4 rounded-xl p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors"
            >
              <X className="h-5 w-5" />
            </button>

            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-100 text-amber-700">
                <Sliders className="h-6 w-6" />
              </div>
              <div>
                <h3 className="text-base font-black text-slate-900">
                  ⚡ 1-Click Auto-Fix: Диагностика окна
                </h3>
                <p className="text-xs text-slate-500">
                  Минимальное необходимое изменение для устранения окна
                </p>
              </div>
            </div>

            <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50/70 p-4">
              <div className="flex items-start gap-2.5">
                <AlertTriangle className="h-5 w-5 shrink-0 text-amber-600 mt-0.5" />
                <div>
                  <div className="text-xs font-bold text-amber-900">
                    {autoFixModal.diagnostic.title}
                  </div>
                  <p className="mt-1 text-xs text-amber-800 leading-relaxed">
                    {autoFixModal.diagnostic.description}
                  </p>
                </div>
              </div>
            </div>

            <div className="mt-5 space-y-3">
              <div className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                Предлагаемое действие для разблокировки:
              </div>

              {autoFixModal.diagnostic.actions.map((act) => (
                <div
                  key={act.id}
                  className="rounded-xl border border-slate-200 bg-slate-50 p-3.5 transition-all hover:border-indigo-300 hover:bg-indigo-50/30"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="text-xs font-bold text-slate-900">{act.label}</div>
                      <div className="mt-0.5 text-[11px] text-slate-500">
                        {act.description}
                      </div>
                    </div>
                    <button
                      onClick={() => handleApplyAutoFixAction(act)}
                      className="shrink-0 flex items-center gap-1.5 rounded-xl bg-indigo-600 px-3.5 py-2 text-xs font-bold text-white shadow-xs hover:bg-indigo-700 active:scale-98 transition-all cursor-pointer"
                    >
                      <Sparkles className="h-3.5 w-3.5" />
                      Применить
                    </button>
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-6 flex items-center justify-end gap-3 border-t border-slate-100 pt-4">
              <button
                onClick={() => setAutoFixModal(null)}
                className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-50 transition-colors"
              >
                Отмена
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
