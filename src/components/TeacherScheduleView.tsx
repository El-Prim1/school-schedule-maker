import React, { useState } from 'react';
import { AppState } from '../types/schedule';
import { DAYS_OF_WEEK, ROOM_TYPE_META } from '../utils/constants';
import {
  getBellScheduleForShift,
  getShift1LessonsCount,
  getLessonTimeString,
  calculateShift2StartTime,
} from '../utils/shiftUtils';
import { UserCheck, Clock, Coffee, Sun, Moon } from 'lucide-react';

interface TeacherScheduleViewProps {
  state: AppState;
}

export const TeacherScheduleView: React.FC<TeacherScheduleViewProps> = ({ state }) => {
  const { teachers, classes, subjects, rooms, schedule, settings, parallelLimits } = state;
  const daysCount = settings.daysPerWeek;

  const [selectedTeacherId, setSelectedTeacherId] = useState<string>(teachers[0]?.id || '');
  const [shiftFilter, setShiftFilter] = useState<'all' | 1 | 2>('all');

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

  // Calculate windows per day for this teacher
  const dayStats = Array.from({ length: daysCount }).map((_, day) => {
    const lessons = teacherLessons
      .filter((s) => s.dayOfWeek === day)
      .sort((a, b) => a.lessonIndex - b.lessonIndex);

    let windowsCount = 0;
    if (lessons.length > 1) {
      const minSlot = lessons[0].lessonIndex;
      const maxSlot = lessons[lessons.length - 1].lessonIndex;
      windowsCount = maxSlot - minSlot + 1 - lessons.length;
    }

    return {
      day,
      count: lessons.length,
      windowsCount,
      minSlot: lessons[0]?.lessonIndex,
      maxSlot: lessons[lessons.length - 1]?.lessonIndex,
    };
  });

  const totalWindows = dayStats.reduce((sum, d) => sum + d.windowsCount, 0);

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
                  className="rounded-xl border border-slate-300 bg-white px-3 py-1.5 text-base font-bold text-slate-800 shadow-2xs focus:border-indigo-500 focus:outline-hidden"
                >
                  {teachers.map((tch) => (
                    <option key={tch.id} value={tch.id}>
                      {tch.name}
                    </option>
                  ))}
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

          {/* Stats pills */}
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
              className={`rounded-xl border px-3.5 py-2 ${
                totalWindows > 0
                  ? 'border-amber-200 bg-amber-50 text-amber-900'
                  : 'border-emerald-200 bg-emerald-50 text-emerald-900'
              }`}
            >
              <div className="text-[11px] font-medium opacity-80">Окон в расписании</div>
              <div className="text-sm font-bold">
                {totalWindows === 0 ? '0 (Идеально)' : `${totalWindows} ч.`}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Timetable Table */}
      <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-xs">
        <table className="w-full border-collapse text-left text-xs">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50">
              <th className="w-36 p-3 text-center font-bold text-slate-500">
                <div>Урок / Время</div>
                <div className="text-[10px] font-normal text-slate-400">1 см | 2 см</div>
              </th>
              {DAYS_OF_WEEK.slice(0, daysCount).map((day) => (
                <th key={day.index} className="p-3 text-center font-bold text-slate-700">
                  {day.name}
                  <span className="block text-[10px] font-normal text-slate-400">
                    {dayStats[day.index]?.count} ч.
                  </span>
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
                          <div className="flex h-16 w-full flex-col items-center justify-center rounded-xl border border-dashed border-amber-300 bg-amber-50/50 text-[11px] font-semibold text-amber-700">
                            <Coffee className="h-4 w-4 mb-0.5" />
                            <span>Окно (свободно)</span>
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
    </div>
  );
};
