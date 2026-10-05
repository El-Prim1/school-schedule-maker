import React, { useState } from 'react';
import { AppState, RoomType } from '../types/schedule';
import { DAYS_OF_WEEK, ROOM_TYPE_META } from '../utils/constants';
import {
  getBellScheduleForShift,
  getShift1LessonsCount,
  getLessonTimeString,
  calculateShift2StartTime,
} from '../utils/shiftUtils';
import { DoorClosed, Sun, Moon } from 'lucide-react';

interface RoomScheduleViewProps {
  state: AppState;
}

export const RoomScheduleView: React.FC<RoomScheduleViewProps> = ({ state }) => {
  const { rooms, classes, subjects, teachers, schedule, settings, parallelLimits } = state;
  const daysCount = settings.daysPerWeek;

  const [selectedRoomId, setSelectedRoomId] = useState<string>(rooms[0]?.id || '');
  const [filterType, setFilterType] = useState<RoomType | 'all'>('all');
  const [shiftFilter, setShiftFilter] = useState<'all' | 1 | 2>('all');

  const currentRoom = rooms.find((r) => r.id === selectedRoomId) || rooms[0];

  const subjectMap = new Map(subjects.map((s) => [s.id, s]));
  const classMap = new Map(classes.map((c) => [c.id, c]));
  const teacherMap = new Map(teachers.map((t) => [t.id, t]));

  // Filtered rooms list
  const filteredRooms = filterType === 'all' ? rooms : rooms.filter((r) => r.type === filterType);

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

  if (!currentRoom) {
    return <div className="p-8 text-center text-slate-500">Кабинеты не найдены</div>;
  }

  // Room lessons
  const allRoomLessons = schedule.filter((s) => s.roomId === currentRoom.id);
  const roomLessons = allRoomLessons.filter((s) => {
    if (shiftFilter === 'all') return true;
    const cls = classMap.get(s.classId);
    return (cls?.shift || 1) === shiftFilter;
  });

  const totalLessons = allRoomLessons.length;
  const shift1Hours = allRoomLessons.filter((s) => (classMap.get(s.classId)?.shift || 1) === 1).length;
  const shift2Hours = allRoomLessons.filter((s) => (classMap.get(s.classId)?.shift || 1) === 2).length;

  const totalPossibleSlots = daysCount * 7 * (currentRoom.capacity || 1) * 2; // two shifts
  const utilization = Math.min(100, Math.round((totalLessons / (totalPossibleSlots / 2)) * 100));

  const meta = ROOM_TYPE_META[currentRoom.type];

  return (
    <div className="space-y-6">
      {/* Room selector & stats */}
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-indigo-100 text-indigo-700">
              <DoorClosed className="h-6 w-6" />
            </div>

            <div>
              <div className="flex flex-wrap items-center gap-2">
                <select
                  value={selectedRoomId}
                  onChange={(e) => setSelectedRoomId(e.target.value)}
                  className="rounded-xl border border-slate-300 bg-white px-3 py-1.5 text-base font-bold text-slate-800 shadow-2xs focus:border-indigo-500 focus:outline-hidden"
                >
                  {filteredRooms.map((rm) => (
                    <option key={rm.id} value={rm.id}>
                      {rm.name} ({ROOM_TYPE_META[rm.type]?.shortLabel})
                    </option>
                  ))}
                </select>

                <span
                  className={`rounded-lg border px-2.5 py-1 text-xs font-bold ${meta.bg} ${meta.text} ${meta.border}`}
                >
                  {meta.label}
                </span>

                <span className="rounded-lg bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-600">
                  Вместимость: {currentRoom.capacity} {currentRoom.capacity === 1 ? 'класс' : 'класса'}
                </span>
              </div>

              {/* Type filter tabs */}
              <div className="mt-2 flex flex-wrap gap-1">
                <button
                  onClick={() => setFilterType('all')}
                  className={`rounded-md px-2 py-0.5 text-[11px] font-semibold transition-all ${
                    filterType === 'all'
                      ? 'bg-slate-800 text-white'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  Все ({rooms.length})
                </button>
                {(['gym', 'it', 'physics_lab', 'chemistry_lab', 'regular'] as RoomType[]).map((t) => {
                  const count = rooms.filter((r) => r.type === t).length;
                  if (count === 0) return null;
                  return (
                    <button
                      key={t}
                      onClick={() => setFilterType(t)}
                      className={`rounded-md px-2 py-0.5 text-[11px] font-semibold transition-all ${
                        filterType === t
                          ? 'bg-indigo-600 text-white'
                          : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                      }`}
                    >
                      {ROOM_TYPE_META[t].shortLabel} ({count})
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Room metrics and shift filter */}
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
                Все смены ({totalLessons} ч)
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
              <div className="text-[11px] text-slate-400 font-medium">Занятость кабинета</div>
              <div className="flex items-center gap-2">
                <div className="text-base font-extrabold text-slate-800">{utilization}%</div>
                <div className="h-2 w-16 overflow-hidden rounded-full bg-slate-200">
                  <div
                    className="h-full bg-indigo-600 rounded-full"
                    style={{ width: `${utilization}%` }}
                  />
                </div>
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
                    const items = roomLessons.filter(
                      (s) => s.dayOfWeek === day.index && s.lessonIndex === slotIdx
                    );

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
                              const teacher = teacherMap.get(item.teacherId);
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
                                      Класс {cls?.name}
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
                                    {subject?.name}
                                  </div>

                                  <div className="mt-1 flex items-center justify-between text-[10px] text-slate-500">
                                    <span>{teacher?.shortName || '—'}</span>
                                    <span className="font-medium text-slate-400">
                                      {timeStr}
                                    </span>
                                  </div>
                                </div>
                              );
                            })}
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
