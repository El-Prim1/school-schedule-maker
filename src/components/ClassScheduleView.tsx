import React, { useState } from 'react';
import { AppState, ScheduleItem } from '../types/schedule';
import { DAYS_OF_WEEK, ROOM_TYPE_META } from '../utils/constants';
import {
  getBellScheduleForShift,
  getShift1LessonsCount,
  calculateShift2StartTime,
} from '../utils/shiftUtils';
import { Plus, Edit2, Calendar, LayoutGrid, Info, Clock, Sun, Moon } from 'lucide-react';
import { LessonEditModal } from './LessonEditModal';

interface ClassScheduleViewProps {
  state: AppState;
  onUpdateScheduleItem: (item: ScheduleItem) => void;
  onUpdateScheduleWithLNS?: (item: ScheduleItem) => void;
  onDeleteScheduleItem: (itemId: string) => void;
  onAddScheduleItem: (item: ScheduleItem) => void;
}

export const ClassScheduleView: React.FC<ClassScheduleViewProps> = ({
  state,
  onUpdateScheduleItem,
  onUpdateScheduleWithLNS,
  onDeleteScheduleItem,
  onAddScheduleItem,
}) => {
  const { classes, subjects, teachers, rooms, schedule, settings, parallelLimits } = state;
  const daysCount = settings.daysPerWeek;

  const [selectedClassId, setSelectedClassId] = useState<string>(classes[0]?.id || '');
  const [classFilterGrade, setClassFilterGrade] = useState<number | 'all'>('all');
  const [classFilterShift, setClassFilterShift] = useState<'all' | 1 | 2>('all');
  const [viewMode, setViewMode] = useState<'single' | 'matrix'>('single');
  const [matrixDay, setMatrixDay] = useState<number>(0);
  const [matrixShiftFilter, setMatrixShiftFilter] = useState<'all' | 1 | 2>('all');
  const [matrixGradeFilter, setMatrixGradeFilter] = useState<number | 'all'>('all');

  // Modal state
  const [modalOpen, setModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<ScheduleItem | null>(null);
  const [modalSlot, setModalSlot] = useState<{ day: number; slot: number }>({ day: 0, slot: 0 });

  const currentClass = classes.find((c) => c.id === selectedClassId) || classes[0];

  const subjectMap = new Map(subjects.map((s) => [s.id, s]));
  const teacherMap = new Map(teachers.map((t) => [t.id, t]));
  const roomMap = new Map(rooms.map((r) => [r.id, r]));

  const openEditModal = (item: ScheduleItem) => {
    setEditingItem(item);
    setModalSlot({ day: item.dayOfWeek, slot: item.lessonIndex });
    setModalOpen(true);
  };

  const openAddModal = (day: number, slot: number) => {
    setEditingItem(null);
    setModalSlot({ day, slot });
    setModalOpen(true);
  };

  // Calculate shift lesson counts and bell schedules
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

  const bellSchedule = React.useMemo(() => {
    const shift = currentClass?.shift || 1;
    return shift === 2 ? shift2BellSchedule : shift1BellSchedule;
  }, [currentClass?.shift, shift1BellSchedule, shift2BellSchedule]);

  const shift2StartTime = React.useMemo(() => {
    return calculateShift2StartTime(
      settings?.shift1Start || '08:00',
      settings?.breakDurationMinutes ?? 10,
      shift1LessonsCount,
      0,
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

  if (classes.length === 0) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center space-y-3">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-indigo-50 text-indigo-600">
          <Calendar className="h-6 w-6" />
        </div>
        <h3 className="text-base font-bold text-slate-800">Список классов пуст</h3>
        <p className="text-xs text-slate-500 max-w-md mx-auto">
          Система очищена. Добавьте классы во вкладке «Классы и лимиты» или загрузите образцовый проект из меню.
        </p>
      </div>
    );
  }

  // Calculate stats for current class
  const classLessons = schedule.filter((s) => s.classId === currentClass?.id);
  const totalLessons = classLessons.length;
  const maxLessonsLimit = currentClass ? parallelLimits[currentClass.grade] || 6 : 6;

  // Calculate lessons per day
  const dailyStats = Array.from({ length: daysCount }).map((_, day) => {
    const dayLessons = classLessons.filter((s) => s.dayOfWeek === day);
    return {
      count: dayLessons.length,
      isOverLimit: dayLessons.length > maxLessonsLimit,
    };
  });

  const filteredMatrixClasses = classes.filter((c) => {
    if (matrixShiftFilter !== 'all' && c.shift !== matrixShiftFilter) return false;
    if (matrixGradeFilter !== 'all' && c.grade !== matrixGradeFilter) return false;
    return true;
  });

  const filteredSingleClasses = classes.filter((c) => {
    if (classFilterShift !== 'all' && c.shift !== classFilterShift) return false;
    if (classFilterGrade !== 'all' && c.grade !== classFilterGrade) return false;
    return true;
  });

  return (
    <div className="space-y-6">
      {/* Controls Bar */}
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl bg-white p-4 shadow-xs border border-slate-200">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex rounded-xl bg-slate-100 p-1">
            <button
              onClick={() => setViewMode('single')}
              className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-all ${
                viewMode === 'single'
                  ? 'bg-white text-indigo-700 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Calendar className="h-4 w-4" />
              Расписание класса
            </button>
            <button
              onClick={() => setViewMode('matrix')}
              className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-all ${
                viewMode === 'matrix'
                  ? 'bg-white text-indigo-700 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <LayoutGrid className="h-4 w-4" />
              Сводная сетка всей школы
            </button>
          </div>

          {viewMode === 'single' ? (
            <div className="flex flex-col gap-2.5">
              {/* Filter controls: Shift & Grades */}
              <div className="flex flex-wrap items-center gap-2">
                {/* Shift filter */}
                <div className="flex items-center gap-1 rounded-lg bg-slate-100 p-0.5 text-xs">
                  <button
                    onClick={() => setClassFilterShift('all')}
                    className={`rounded-md px-2 py-0.5 font-semibold transition-all ${
                      classFilterShift === 'all' ? 'bg-white text-slate-900 shadow-2xs' : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    Все ({classes.length})
                  </button>
                  <button
                    onClick={() => setClassFilterShift(1)}
                    className={`flex items-center gap-1 rounded-md px-2 py-0.5 font-semibold transition-all ${
                      classFilterShift === 1 ? 'bg-white text-blue-800 shadow-2xs' : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    <Sun className="h-3 w-3 text-blue-600" />
                    1-я см. ({classes.filter((c) => c.shift === 1).length})
                  </button>
                  <button
                    onClick={() => setClassFilterShift(2)}
                    className={`flex items-center gap-1 rounded-md px-2 py-0.5 font-semibold transition-all ${
                      classFilterShift === 2 ? 'bg-white text-amber-800 shadow-2xs' : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    <Moon className="h-3 w-3 text-amber-600" />
                    2-я см. ({classes.filter((c) => c.shift === 2).length})
                  </button>
                </div>

                {/* Grade filter */}
                <div className="flex items-center gap-1 overflow-x-auto rounded-lg bg-slate-100 p-0.5 text-xs">
                  <button
                    onClick={() => setClassFilterGrade('all')}
                    className={`rounded-md px-2 py-0.5 font-semibold transition-all ${
                      classFilterGrade === 'all' ? 'bg-white text-slate-900 shadow-2xs' : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    Все классы
                  </button>
                  {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11].map((g) => (
                    <button
                      key={g}
                      onClick={() => setClassFilterGrade(g)}
                      className={`rounded-md px-2 py-0.5 font-semibold transition-all ${
                        classFilterGrade === g ? 'bg-indigo-600 text-white shadow-2xs' : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      {g} кл
                    </button>
                  ))}
                </div>
              </div>

              {/* Class selection buttons */}
              <div className="flex items-center gap-2">
                <label className="text-xs font-medium text-slate-500 shrink-0">Класс:</label>
                <div className="flex flex-wrap gap-1">
                  {filteredSingleClasses.map((cls) => (
                    <button
                      key={cls.id}
                      onClick={() => setSelectedClassId(cls.id)}
                      className={`flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-bold transition-all ${
                        cls.id === currentClass?.id
                          ? 'bg-indigo-600 text-white shadow-xs'
                          : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                      }`}
                    >
                      <span>{cls.name}</span>
                      <span
                        className={`text-[9px] px-1 py-0.2 rounded font-normal ${
                          cls.id === currentClass?.id
                            ? cls.shift === 2
                              ? 'bg-amber-400 text-amber-950 font-bold'
                              : 'bg-indigo-500 text-white'
                            : cls.shift === 2
                            ? 'bg-amber-100 text-amber-800'
                            : 'bg-slate-200 text-slate-600'
                        }`}
                      >
                        {cls.shift} см.
                      </span>
                    </button>
                  ))}
                  {filteredSingleClasses.length === 0 && (
                    <span className="text-xs text-slate-400 italic">Нет классов по выбранному фильтру</span>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-4">
              <div className="flex items-center gap-2">
                <label className="text-xs font-medium text-slate-500">День:</label>
                <div className="flex gap-1">
                  {DAYS_OF_WEEK.slice(0, daysCount).map((day) => (
                    <button
                      key={day.index}
                      onClick={() => setMatrixDay(day.index)}
                      className={`rounded-lg px-3 py-1 text-xs font-bold transition-all ${
                        matrixDay === day.index
                          ? 'bg-indigo-600 text-white shadow-xs'
                          : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                      }`}
                    >
                      {day.name}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex items-center gap-1.5 rounded-xl bg-slate-100 p-1 text-xs">
                <button
                  onClick={() => setMatrixShiftFilter('all')}
                  className={`rounded-lg px-2.5 py-1 font-semibold transition-all ${
                    matrixShiftFilter === 'all'
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Все смены ({classes.length})
                </button>
                <button
                  onClick={() => setMatrixShiftFilter(1)}
                  className={`flex items-center gap-1 rounded-lg px-2.5 py-1 font-semibold transition-all ${
                    matrixShiftFilter === 1
                      ? 'bg-white text-blue-800 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <Sun className="h-3 w-3 text-blue-600" />
                  1-я смена ({classes.filter((c) => c.shift === 1).length})
                </button>
                <button
                  onClick={() => setMatrixShiftFilter(2)}
                  className={`flex items-center gap-1 rounded-lg px-2.5 py-1 font-semibold transition-all ${
                    matrixShiftFilter === 2
                      ? 'bg-white text-amber-800 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <Moon className="h-3 w-3 text-amber-600" />
                  2-я смена ({classes.filter((c) => c.shift === 2).length})
                </button>
              </div>

              {/* Matrix Grade filter */}
              <div className="flex items-center gap-1 overflow-x-auto rounded-lg bg-slate-100 p-0.5 text-xs">
                <button
                  onClick={() => setMatrixGradeFilter('all')}
                  className={`rounded-md px-2 py-0.5 font-semibold transition-all ${
                    matrixGradeFilter === 'all' ? 'bg-white text-slate-900 shadow-2xs' : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Все параллели
                </button>
                {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11].map((g) => (
                  <button
                    key={g}
                    onClick={() => setMatrixGradeFilter(g)}
                    className={`rounded-md px-2 py-0.5 font-semibold transition-all ${
                      matrixGradeFilter === g ? 'bg-indigo-600 text-white shadow-2xs' : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    {g} кл
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {viewMode === 'single' && currentClass && (
          <div className="flex flex-wrap items-center gap-3 text-xs">
            <div
              className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 border font-semibold ${
                currentClass.shift === 2
                  ? 'bg-amber-50 text-amber-900 border-amber-200'
                  : 'bg-blue-50 text-blue-900 border-blue-200'
              }`}
            >
              {currentClass.shift === 2 ? (
                <Moon className="h-3.5 w-3.5 text-amber-600" />
              ) : (
                <Sun className="h-3.5 w-3.5 text-blue-600" />
              )}
              <span>{currentClass.shift}-я смена</span>
              <span className="text-[10px] text-slate-500 font-normal">
                ({currentClass.shift === 2 ? shift2StartTime : (settings?.shift1Start || '08:00')} –{' '}
                {bellSchedule[bellSchedule.length - 1]?.end || ''})
              </span>
            </div>

            <div className="flex items-center gap-1.5 rounded-lg bg-indigo-50 px-3 py-1.5 text-indigo-900 border border-indigo-100">
              <span className="font-semibold">Всего:</span>
              <span className="rounded-md bg-indigo-200/60 px-1.5 py-0.5 font-bold">
                {totalLessons} ч/нед
              </span>
            </div>
            <div className="flex items-center gap-1.5 rounded-lg bg-slate-100 px-3 py-1.5 text-slate-700">
              <span className="font-semibold">Лимит:</span>
              <span className="font-bold">{maxLessonsLimit} ур/день</span>
            </div>
          </div>
        )}
      </div>

      {/* SINGLE CLASS DETAILED VIEW */}
      {viewMode === 'single' && currentClass && (
        <div className="space-y-4">
          {/* Day difficulty cards */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-5 lg:grid-cols-5">
            {DAYS_OF_WEEK.slice(0, daysCount).map((day) => {
              const stat = dailyStats[day.index];
              return (
                <div
                  key={day.index}
                  className={`rounded-xl border p-3 transition-all ${
                    stat.isOverLimit
                      ? 'border-rose-300 bg-rose-50/50'
                      : 'border-slate-200 bg-white'
                  }`}
                >
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-bold text-slate-700">{day.name}</span>
                    <span
                      className={`rounded-md px-1.5 py-0.5 text-[11px] font-bold ${
                        stat.isOverLimit ? 'bg-rose-100 text-rose-700' : 'bg-slate-100 text-slate-600'
                      }`}
                    >
                      {stat.count} / {maxLessonsLimit} ур.
                    </span>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Schedule Grid Table */}
          <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-xs">
            <table className="w-full border-collapse text-left text-xs">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/80">
                  <th className="w-32 p-3 text-center font-bold text-slate-500">
                    <div>Урок / Время</div>
                    <div className="text-[10px] font-normal text-indigo-600 mt-0.5">
                      {currentClass.shift}-я смена
                    </div>
                  </th>
                  {DAYS_OF_WEEK.slice(0, daysCount).map((day) => (
                    <th key={day.index} className="p-3 text-center font-bold text-slate-700">
                      {day.name}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {bellSchedule.map((bell) => (
                  <tr key={bell.index} className="hover:bg-slate-50/40 transition-colors">
                    {/* Time slot header */}
                    <td className="p-2.5 text-center bg-slate-50/50 border-r border-slate-100">
                      <div className="font-extrabold text-slate-700 text-sm">{bell.lessonNumber}</div>
                      <div className="text-[10px] font-semibold text-slate-600">{bell.start} – {bell.end}</div>
                    </td>

                    {/* Day cells */}
                    {DAYS_OF_WEEK.slice(0, daysCount).map((day) => {
                      const item = schedule.find(
                        (s) =>
                          s.classId === currentClass.id &&
                          s.dayOfWeek === day.index &&
                          s.lessonIndex === bell.index
                      );

                      const subject = item ? subjectMap.get(item.subjectId) : null;
                      const teacher = item ? teacherMap.get(item.teacherId) : null;
                      const room = item ? roomMap.get(item.roomId) : null;

                      const roomMeta = room ? ROOM_TYPE_META[room.type] : null;

                      return (
                        <td
                          key={day.index}
                          className="p-1.5 align-top min-w-[160px] border-r border-slate-100 last:border-r-0"
                        >
                          {item && subject ? (
                            <div
                              onClick={() => openEditModal(item)}
                              className="group relative cursor-pointer rounded-xl border border-slate-200 bg-white p-2.5 shadow-xs transition-all hover:border-indigo-400 hover:shadow-md"
                              style={{
                                borderLeftWidth: '4px',
                                borderLeftColor: subject.color || '#6366f1',
                              }}
                            >
                              <div className="flex items-start justify-between gap-1">
                                <span className="font-bold text-slate-800 line-clamp-1">
                                  {subject.name}
                                </span>
                                <Edit2 className="h-3 w-3 text-slate-400 opacity-0 group-hover:opacity-100 transition-opacity" />
                              </div>

                              <div className="mt-1 text-[11px] text-slate-600 font-medium">
                                {teacher?.shortName || '—'}
                              </div>

                              <div className="mt-2 flex items-center justify-between">
                                {room && (
                                  <span
                                    className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-semibold border ${
                                      roomMeta?.bg || 'bg-slate-100'
                                    } ${roomMeta?.text || 'text-slate-700'} ${
                                      roomMeta?.border || 'border-slate-200'
                                    }`}
                                  >
                                    {room.name}
                                  </span>
                                )}
                                <span className="text-[9px] text-slate-400 font-medium">
                                  {bell.start}
                                </span>
                              </div>
                            </div>
                          ) : (
                            <div
                              onClick={() => openAddModal(day.index, bell.index)}
                              className="flex h-16 w-full items-center justify-center rounded-xl border border-dashed border-slate-200 text-slate-300 transition-all hover:border-indigo-300 hover:bg-indigo-50/30 hover:text-indigo-600 cursor-pointer"
                            >
                              <Plus className="h-4 w-4" />
                            </div>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* MATRIX VIEW (ALL CLASSES ON SELECTED DAY) */}
      {viewMode === 'matrix' && (
        <div className="space-y-3">
          <div className="rounded-xl bg-indigo-50/70 p-3 text-xs text-indigo-900 border border-indigo-100 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Info className="h-4 w-4 shrink-0 text-indigo-600" />
              <span>
                Сводная сетка на <strong>{DAYS_OF_WEEK[matrixDay]?.name}</strong>. Время уроков рассчитывается индивидуально для 1-й смены (с {settings?.shift1Start || '08:00'}) и 2-й смены (с {shift2StartTime}).
              </span>
            </div>
            <div className="flex items-center gap-3 text-[11px]">
              <span className="flex items-center gap-1 font-semibold text-blue-700">
                <Sun className="h-3 w-3" /> 1-я смена: {settings?.shift1Start || '08:00'}
              </span>
              <span className="flex items-center gap-1 font-semibold text-amber-700">
                <Moon className="h-3 w-3" /> 2-я смена: {shift2StartTime}
              </span>
            </div>
          </div>

          <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-xs">
            <table className="w-full border-collapse text-left text-xs">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50">
                  <th className="w-36 p-3 text-center font-bold text-slate-500">
                    <div>Урок</div>
                    <div className="text-[10px] font-normal text-slate-400">1 см | 2 см</div>
                  </th>
                  {filteredMatrixClasses.map((cls) => (
                    <th
                      key={cls.id}
                      className="p-3 text-center font-bold text-slate-800 border-l border-slate-100 min-w-[150px]"
                    >
                      <div className="flex items-center justify-center gap-1.5">
                        <span>{cls.name}</span>
                        <span
                          className={`text-[9px] px-1.5 py-0.2 rounded font-semibold ${
                            cls.shift === 2
                              ? 'bg-amber-100 text-amber-800 border border-amber-200'
                              : 'bg-blue-100 text-blue-800 border border-blue-200'
                          }`}
                        >
                          {cls.shift}-я см.
                        </span>
                      </div>
                    </th>
                  ))}
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

                      {filteredMatrixClasses.map((cls) => {
                        const classBell = cls.shift === 2 ? bell2 : bell1;
                        const item = schedule.find(
                          (s) =>
                            s.classId === cls.id &&
                            s.dayOfWeek === matrixDay &&
                            s.lessonIndex === slotIdx
                        );
                        const subject = item ? subjectMap.get(item.subjectId) : null;
                        const teacher = item ? teacherMap.get(item.teacherId) : null;
                        const room = item ? roomMap.get(item.roomId) : null;
                        const roomMeta = room ? ROOM_TYPE_META[room.type] : null;

                        return (
                          <td
                            key={cls.id}
                            className="p-1.5 align-top border-l border-slate-100"
                          >
                            {item && subject ? (
                              <div
                                onClick={() => {
                                  setSelectedClassId(cls.id);
                                  openEditModal(item);
                                }}
                                className="cursor-pointer rounded-lg border border-slate-200 p-2 shadow-2xs hover:border-indigo-400 bg-white transition-all"
                                style={{
                                  borderLeftWidth: '3px',
                                  borderLeftColor: subject.color || '#6366f1',
                                }}
                              >
                                <div className="flex items-start justify-between gap-1">
                                  <div className="font-bold text-slate-800 truncate">
                                    {subject.shortName || subject.name}
                                  </div>
                                  <span className="text-[9px] text-slate-400 font-medium shrink-0">
                                    {classBell?.start}
                                  </span>
                                </div>
                                <div className="text-[10px] text-slate-600 truncate mt-0.5">
                                  {teacher?.shortName}
                                </div>
                                <div className="mt-1 flex items-center justify-between">
                                  <span
                                    className={`rounded-md px-1 py-0.5 text-[9px] font-semibold border ${
                                      roomMeta?.bg || 'bg-slate-100'
                                    } ${roomMeta?.text || 'text-slate-700'} ${
                                      roomMeta?.border || 'border-slate-200'
                                    }`}
                                  >
                                    {room?.name}
                                  </span>
                                </div>
                              </div>
                            ) : (
                              <div
                                onClick={() => {
                                  setSelectedClassId(cls.id);
                                  openAddModal(matrixDay, slotIdx);
                                }}
                                className="h-14 flex items-center justify-center rounded-lg border border-dashed border-slate-100 text-slate-300 hover:border-indigo-300 hover:text-indigo-500 cursor-pointer"
                              >
                                <Plus className="h-3 w-3" />
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
        </div>
      )}

      {/* MODAL: Edit or Add Lesson */}
      {modalOpen && (
        <LessonEditModal
          item={editingItem}
          classId={currentClass?.id || ''}
          dayOfWeek={modalSlot.day}
          lessonIndex={modalSlot.slot}
          state={state}
          onSave={(savedItem) => {
            if (editingItem) {
              onUpdateScheduleItem(savedItem);
            } else {
              onAddScheduleItem(savedItem);
            }
            setModalOpen(false);
          }}
          onSaveWithLNS={(savedItem) => {
            if (onUpdateScheduleWithLNS) {
              onUpdateScheduleWithLNS(savedItem);
            } else if (editingItem) {
              onUpdateScheduleItem(savedItem);
            } else {
              onAddScheduleItem(savedItem);
            }
            setModalOpen(false);
          }}
          onDelete={(id) => {
            onDeleteScheduleItem(id);
            setModalOpen(false);
          }}
          onClose={() => setModalOpen(false)}
        />
      )}
    </div>
  );
};
