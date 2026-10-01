import React, { useState } from 'react';
import { AppState, ScheduleItem, SchoolClass } from '../types/schedule';
import { DAYS_OF_WEEK, BELL_SCHEDULE, ROOM_TYPE_META } from '../utils/constants';
import { getBellScheduleForShift } from '../utils/shiftUtils';
import { Plus, Edit2, Calendar, LayoutGrid, Award, Info, AlertTriangle } from 'lucide-react';
import { LessonEditModal } from './LessonEditModal';

interface ClassScheduleViewProps {
  state: AppState;
  onUpdateScheduleItem: (item: ScheduleItem) => void;
  onDeleteScheduleItem: (itemId: string) => void;
  onAddScheduleItem: (item: ScheduleItem) => void;
}

export const ClassScheduleView: React.FC<ClassScheduleViewProps> = ({
  state,
  onUpdateScheduleItem,
  onDeleteScheduleItem,
  onAddScheduleItem,
}) => {
  const { classes, subjects, teachers, rooms, schedule, settings, parallelLimits } = state;
  const daysCount = settings.daysPerWeek;

  const [selectedClassId, setSelectedClassId] = useState<string>(classes[0]?.id || '');
  const [viewMode, setViewMode] = useState<'single' | 'matrix'>('single');
  const [matrixDay, setMatrixDay] = useState<number>(0);

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

  // Calculate stats for current class
  const classLessons = schedule.filter((s) => s.classId === currentClass?.id);
  const totalLessons = classLessons.length;

  const shift1LessonsCount = React.useMemo(() => {
    return Math.max(
      ...classes.filter((c) => c.shift === 1).map((c) => parallelLimits[c.grade] || 6),
      6
    );
  }, [classes, parallelLimits]);

  const bellSchedule = React.useMemo(() => {
    const shift = currentClass?.shift || 1;
    return getBellScheduleForShift(
      shift,
      settings?.shift1Start || '08:00',
      settings?.breakDurationMinutes || 5,
      shift1LessonsCount
    );
  }, [currentClass?.shift, settings?.shift1Start, settings?.breakDurationMinutes, shift1LessonsCount]);


  const maxLessonsLimit = currentClass ? parallelLimits[currentClass.grade] || 6 : 6;

  // Calculate difficulty score per day
  const dailyStats = Array.from({ length: daysCount }).map((_, day) => {
    const dayLessons = classLessons.filter((s) => s.dayOfWeek === day);
    const difficultyScore = dayLessons.reduce((sum, item) => {
      const sub = subjectMap.get(item.subjectId);
      return sum + (sub?.difficulty || 5);
    }, 0);
    return {
      count: dayLessons.length,
      difficulty: difficultyScore,
      isOverLimit: dayLessons.length > maxLessonsLimit,
    };
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
            <div className="flex items-center gap-2">
              <label className="text-xs font-medium text-slate-500">Класс:</label>
              <div className="flex flex-wrap gap-1">
                {classes.map((cls) => (
                  <button
                    key={cls.id}
                    onClick={() => setSelectedClassId(cls.id)}
                    className={`rounded-lg px-2.5 py-1 text-xs font-bold transition-all ${
                      cls.id === currentClass?.id
                        ? 'bg-indigo-600 text-white shadow-xs'
                        : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                    }`}
                  >
                    {cls.name}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <label className="text-xs font-medium text-slate-500">День недели:</label>
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
          )}
        </div>

        {viewMode === 'single' && currentClass && (
          <div className="flex items-center gap-4 text-xs">
            <div className="flex items-center gap-1.5 rounded-lg bg-indigo-50 px-3 py-1.5 text-indigo-900 border border-indigo-100">
              <span className="font-semibold">Всего уроков:</span>
              <span className="rounded-md bg-indigo-200/60 px-1.5 py-0.5 font-bold">{totalLessons} ч/нед</span>
            </div>
            <div className="flex items-center gap-1.5 rounded-lg bg-slate-100 px-3 py-1.5 text-slate-700">
              <span className="font-semibold">Лимит параллели:</span>
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
                  <div className="mt-2 flex items-center justify-between text-[11px] text-slate-500">
                    <span>Сложность по СанПиН:</span>
                    <span className="font-semibold text-slate-700">{stat.difficulty} б.</span>
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
                  <th className="w-28 p-3 text-center font-bold text-slate-500">Урок / Время</th>
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
                      <div className="text-[10px] text-slate-500">{bell.start} – {bell.end}</div>
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
          <div className="rounded-xl bg-indigo-50/70 p-3 text-xs text-indigo-900 border border-indigo-100 flex items-center gap-2">
            <Info className="h-4 w-4 shrink-0 text-indigo-600" />
            <span>
              Сводная сетка позволяет одновременно видеть расписание всех параллелей на{' '}
              <strong>{DAYS_OF_WEEK[matrixDay]?.name}</strong> для контроля нагрузки школы и занятости помещений.
            </span>
          </div>

          <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-xs">
            <table className="w-full border-collapse text-left text-xs">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50">
                  <th className="w-24 p-3 text-center font-bold text-slate-500">Урок / Время</th>
                  {classes.map((cls) => (
                    <th key={cls.id} className="p-3 text-center font-bold text-slate-800 border-l border-slate-100 min-w-[150px]">
                      {cls.name}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {bellSchedule.map((bell) => (
                  <tr key={bell.index} className="hover:bg-slate-50/40">
                    <td className="p-2.5 text-center bg-slate-50/50 border-r border-slate-100">
                      <div className="font-extrabold text-slate-700">{bell.lessonNumber}</div>
                      <div className="text-[10px] text-slate-500">{bell.start}</div>
                    </td>

                    {classes.map((cls) => {
                      const item = schedule.find(
                        (s) =>
                          s.classId === cls.id &&
                          s.dayOfWeek === matrixDay &&
                          s.lessonIndex === bell.index
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
                              className="cursor-pointer rounded-lg border border-slate-200 p-2 shadow-2xs hover:border-indigo-400 bg-white"
                              style={{
                                borderLeftWidth: '3px',
                                borderLeftColor: subject.color || '#6366f1',
                              }}
                            >
                              <div className="font-bold text-slate-800 truncate">{subject.shortName || subject.name}</div>
                              <div className="text-[10px] text-slate-600 truncate">{teacher?.shortName}</div>
                              <div className="mt-1">
                                <span
                                  className={`rounded-md px-1 py-0.5 text-[9px] font-semibold border ${
                                    roomMeta?.bg || 'bg-slate-100'
                                  } ${roomMeta?.text || 'text-slate-700'} ${roomMeta?.border || 'border-slate-200'}`}
                                >
                                  {room?.name}
                                </span>
                              </div>
                            </div>
                          ) : (
                            <div
                              onClick={() => {
                                setSelectedClassId(cls.id);
                                openAddModal(matrixDay, bell.index);
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
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Edit / Add Modal */}
      {modalOpen && (
        <LessonEditModal
          item={editingItem}
          classId={selectedClassId}
          dayOfWeek={modalSlot.day}
          lessonIndex={modalSlot.slot}
          classes={classes}
          subjects={subjects}
          teachers={teachers}
          rooms={rooms}
          schedule={schedule}
          onSave={(item) => {
            if (editingItem) {
              onUpdateScheduleItem(item);
            } else {
              onAddScheduleItem(item);
            }
          }}
          onDelete={(id) => onDeleteScheduleItem(id)}
          onClose={() => setModalOpen(false)}
        />
      )}
    </div>
  );
};
