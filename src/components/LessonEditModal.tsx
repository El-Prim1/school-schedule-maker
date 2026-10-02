import React, { useState } from 'react';
import { ScheduleItem, Subject, Teacher, Room, SchoolClass } from '../types/schedule';
import { X, Trash2, Check, AlertCircle, DoorClosed, Sparkles } from 'lucide-react';
import { DAYS_OF_WEEK, BELL_SCHEDULE, ROOM_TYPE_META } from '../utils/constants';

interface LessonEditModalProps {
  item: ScheduleItem | null; // null if creating a new lesson in an empty slot
  classId: string;
  dayOfWeek: number;
  lessonIndex: number;
  classes: SchoolClass[];
  subjects: Subject[];
  teachers: Teacher[];
  rooms: Room[];
  schedule: ScheduleItem[];
  onSave: (updatedItem: ScheduleItem) => void;
  onSaveWithLNS?: (updatedItem: ScheduleItem) => void;
  onDelete?: (itemId: string) => void;
  onClose: () => void;
}

export const LessonEditModal: React.FC<LessonEditModalProps> = ({
  item,
  classId,
  dayOfWeek,
  lessonIndex,
  classes,
  subjects,
  teachers,
  rooms,
  schedule,
  onSave,
  onSaveWithLNS,
  onDelete,
  onClose,
}) => {
  const currentClass = classes.find((c) => c.id === classId);
  const bell = BELL_SCHEDULE[lessonIndex];

  const [subjectId, setSubjectId] = useState(item?.subjectId || (subjects[0]?.id ?? ''));
  const [teacherId, setTeacherId] = useState(item?.teacherId || '');
  const [roomId, setRoomId] = useState(item?.roomId || '');

  // When subject changes, suggest suitable teacher and room if not set
  const handleSubjectChange = (newSubjId: string) => {
    setSubjectId(newSubjId);
    const sub = subjects.find((s) => s.id === newSubjId);
    if (!sub) return;

    // Pick first qualified teacher
    const qualified = teachers.filter((t) => t.subjectIds.includes(newSubjId));
    if (qualified.length > 0 && (!teacherId || !qualified.some((q) => q.id === teacherId))) {
      setTeacherId(qualified[0].id);
    }

    // Pick suitable room
    const matchingRoom = rooms.find((r) => r.type === sub.requiredRoomType);
    if (matchingRoom) {
      setRoomId(matchingRoom.id);
    } else if (rooms.length > 0) {
      setRoomId(rooms[0].id);
    }
  };

  // If initial teacher or room is empty, initialize
  React.useEffect(() => {
    if (!teacherId && subjectId) {
      const qualified = teachers.filter((t) => t.subjectIds.includes(subjectId));
      if (qualified.length > 0) setTeacherId(qualified[0].id);
    }
    if (!roomId && subjectId) {
      const sub = subjects.find((s) => s.id === subjectId);
      const reqType = sub?.requiredRoomType || 'regular';
      const suitable = rooms.find((r) => r.type === reqType) || rooms[0];
      if (suitable) setRoomId(suitable.id);
    }
  }, [subjectId, teacherId, roomId, teachers, rooms, subjects]);

  // Conflict validation in real-time
  const selectedTeacher = teachers.find((t) => t.id === teacherId);
  const selectedRoom = rooms.find((r) => r.id === roomId);
  const selectedSubject = subjects.find((s) => s.id === subjectId);

  // Check if teacher is busy elsewhere at this slot
  const teacherConflict = schedule.find(
    (s) =>
      s.id !== item?.id &&
      s.teacherId === teacherId &&
      s.dayOfWeek === dayOfWeek &&
      s.lessonIndex === lessonIndex
  );

  // Check if room is at capacity
  const roomOccupants = schedule.filter(
    (s) =>
      s.id !== item?.id &&
      s.roomId === roomId &&
      s.dayOfWeek === dayOfWeek &&
      s.lessonIndex === lessonIndex
  );
  const roomConflict = selectedRoom && roomOccupants.length >= (selectedRoom.capacity || 1);

  // Check room type match
  const roomTypeMismatch =
    selectedSubject &&
    selectedRoom &&
    selectedSubject.requiredRoomType !== 'regular' &&
    selectedRoom.type !== selectedSubject.requiredRoomType;

  const handleSave = () => {
    if (!subjectId || !teacherId || !roomId) return;

    const newItem: ScheduleItem = {
      id: item ? item.id : `sch_manual_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      dayOfWeek,
      lessonIndex,
      classId,
      subjectId,
      teacherId,
      roomId,
    };
    onSave(newItem);
    onClose();
  };

  const handleSaveWithLNS = () => {
    if (!subjectId || !teacherId || !roomId) return;

    const newItem: ScheduleItem = {
      id: item ? item.id : `sch_manual_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      dayOfWeek,
      lessonIndex,
      classId,
      subjectId,
      teacherId,
      roomId,
    };
    if (onSaveWithLNS) {
      onSaveWithLNS(newItem);
    } else {
      onSave(newItem);
    }
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs">
      <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl transition-all">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-100 pb-4">
          <div>
            <h3 className="text-lg font-bold text-slate-800">
              {item ? 'Редактирование урока' : 'Добавить урок в расписание'}
            </h3>
            <p className="text-xs text-slate-500">
              Класс {currentClass?.name} • {DAYS_OF_WEEK[dayOfWeek]?.name}, Урок {lessonIndex + 1}{' '}
              {bell && `(${bell.start} - ${bell.end})`}
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Content */}
        <div className="mt-5 space-y-4">
          {/* Subject */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5">
              Предмет
            </label>
            <select
              value={subjectId}
              onChange={(e) => handleSubjectChange(e.target.value)}
              className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 shadow-xs focus:border-indigo-500 focus:outline-hidden focus:ring-2 focus:ring-indigo-100"
            >
              {subjects.map((sub) => (
                <option key={sub.id} value={sub.id}>
                  {sub.name} ({ROOM_TYPE_META[sub.requiredRoomType]?.shortLabel || 'Обычный'})
                </option>
              ))}
            </select>
          </div>

          {/* Teacher */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="block text-xs font-semibold text-slate-700">Преподаватель</label>
              {teacherConflict && (
                <span className="flex items-center gap-1 text-[11px] font-medium text-rose-600">
                  <AlertCircle className="h-3 w-3" />
                  Занят в классе {classes.find((c) => c.id === teacherConflict.classId)?.name}!
                </span>
              )}
            </div>
            <select
              value={teacherId}
              onChange={(e) => setTeacherId(e.target.value)}
              className={`w-full rounded-xl border px-3 py-2 text-sm shadow-xs focus:outline-hidden focus:ring-2 ${
                teacherConflict
                  ? 'border-rose-300 bg-rose-50 text-rose-900 focus:ring-rose-200'
                  : 'border-slate-300 bg-white text-slate-800 focus:border-indigo-500 focus:ring-indigo-100'
              }`}
            >
              <option value="" disabled>
                Выберите учителя...
              </option>
              {teachers.map((tch) => {
                const isTchBusy = schedule.some(
                  (s) =>
                    s.id !== item?.id &&
                    s.teacherId === tch.id &&
                    s.dayOfWeek === dayOfWeek &&
                    s.lessonIndex === lessonIndex
                );
                return (
                  <option key={tch.id} value={tch.id}>
                    {tch.name} {isTchBusy ? '⚠️ (занят в этот час)' : ''}
                  </option>
                );
              })}
            </select>
          </div>

          {/* Room */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="block text-xs font-semibold text-slate-700">Кабинет</label>
              {roomConflict && (
                <span className="flex items-center gap-1 text-[11px] font-medium text-rose-600">
                  <AlertCircle className="h-3 w-3" />
                  Кабинет уже занят!
                </span>
              )}
              {roomTypeMismatch && !roomConflict && (
                <span className="flex items-center gap-1 text-[11px] font-medium text-amber-600">
                  <AlertCircle className="h-3 w-3" />
                  Требуется {ROOM_TYPE_META[selectedSubject.requiredRoomType]?.label}
                </span>
              )}
            </div>
            <select
              value={roomId}
              onChange={(e) => setRoomId(e.target.value)}
              className={`w-full rounded-xl border px-3 py-2 text-sm shadow-xs focus:outline-hidden focus:ring-2 ${
                roomConflict
                  ? 'border-rose-300 bg-rose-50 text-rose-900 focus:ring-rose-200'
                  : roomTypeMismatch
                  ? 'border-amber-300 bg-amber-50 text-amber-900 focus:ring-amber-200'
                  : 'border-slate-300 bg-white text-slate-800 focus:border-indigo-500 focus:ring-indigo-100'
              }`}
            >
              <option value="" disabled>
                Выберите кабинет...
              </option>
              {rooms.map((rm) => {
                const occ = schedule.filter(
                  (s) =>
                    s.id !== item?.id &&
                    s.roomId === rm.id &&
                    s.dayOfWeek === dayOfWeek &&
                    s.lessonIndex === lessonIndex
                ).length;
                const isFull = occ >= (rm.capacity || 1);
                return (
                  <option key={rm.id} value={rm.id}>
                    {rm.name} ({ROOM_TYPE_META[rm.type]?.shortLabel}){' '}
                    {isFull ? '⚠️ (занят)' : ''}
                  </option>
                );
              })}
            </select>
          </div>
        </div>

        {/* Footer actions */}
        <div className="mt-6 flex items-center justify-between border-t border-slate-100 pt-4">
          {item && onDelete ? (
            <button
              onClick={() => {
                onDelete(item.id);
                onClose();
              }}
              className="flex items-center gap-1.5 rounded-xl border border-rose-200 px-3 py-2 text-xs font-semibold text-rose-600 hover:bg-rose-50"
            >
              <Trash2 className="h-4 w-4" />
              Удалить урок
            </button>
          ) : (
            <div />
          )}

          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="rounded-xl border border-slate-300 px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100"
            >
              Отмена
            </button>
            {(teacherConflict || roomConflict) && onSaveWithLNS && (
              <button
                type="button"
                onClick={handleSaveWithLNS}
                className="flex items-center gap-1.5 rounded-xl bg-purple-600 px-4 py-2 text-xs font-bold text-white shadow-xs hover:bg-purple-700 active:scale-95 transition-all"
                title="Разрешить конфликт через локальный Ruin-and-Recreate CP-SAT пересчет"
              >
                <Sparkles className="h-4 w-4" />
                Сохранить с LNS-ремонтом
              </button>
            )}
            <button
              onClick={handleSave}
              className="flex items-center gap-1.5 rounded-xl bg-indigo-600 px-4 py-2 text-xs font-semibold text-white shadow-xs hover:bg-indigo-700"
            >
              <Check className="h-4 w-4" />
              {item ? 'Сохранить' : 'Добавить урок'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
