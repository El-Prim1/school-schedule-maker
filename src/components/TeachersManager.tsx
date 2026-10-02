import React, { useState } from 'react';
import { AppState, Teacher } from '../types/schedule';
import { UserCheck, Plus, Trash2, Edit2, BookOpen, Clock, DoorClosed } from 'lucide-react';

interface TeachersManagerProps {
  state: AppState;
  onUpdateTeachers: (teachers: Teacher[]) => void;
}

export const TeachersManager: React.FC<TeachersManagerProps> = ({ state, onUpdateTeachers }) => {
  const { teachers, subjects, rooms, schedule } = state;

  const [showAddModal, setShowAddModal] = useState(false);
  const [name, setName] = useState('');
  const [shortName, setShortName] = useState('');
  const [selectedSubjectIds, setSelectedSubjectIds] = useState<string[]>([]);
  const [maxHours, setMaxHours] = useState(26);
  const [preferredRoomId, setPreferredRoomId] = useState('');

  const subjectMap = new Map(subjects.map((s) => [s.id, s]));
  const roomMap = new Map(rooms.map((r) => [r.id, r]));

  const toggleSubject = (subId: string) => {
    if (selectedSubjectIds.includes(subId)) {
      setSelectedSubjectIds(selectedSubjectIds.filter((id) => id !== subId));
    } else {
      setSelectedSubjectIds([...selectedSubjectIds, subId]);
    }
  };

  const handleAddTeacher = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    const newTeacher: Teacher = {
      id: `tch_${Date.now()}`,
      name: name.trim(),
      shortName: shortName.trim() || name.slice(0, 12),
      subjectIds: selectedSubjectIds,
      maxHoursPerWeek: maxHours,
      preferredRoomId: preferredRoomId || undefined,
    };

    onUpdateTeachers([...teachers, newTeacher]);
    setShowAddModal(false);
    setName('');
    setShortName('');
    setSelectedSubjectIds([]);
  };

  const handleDeleteTeacher = (id: string) => {
    onUpdateTeachers(teachers.filter((t) => t.id !== id));
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-xs">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <UserCheck className="h-6 w-6 text-indigo-600" />
              <h2 className="text-xl font-extrabold text-slate-800">
                Педагогический состав ({teachers.length} учителей)
              </h2>
            </div>
            <p className="mt-1 text-xs text-slate-500">
              Управление профилями преподавателей, предметами преподавания, максимальной часовой ставкой и закреплёнными кабинетами.
            </p>
          </div>

          <button
            onClick={() => setShowAddModal(true)}
            className="flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-xs font-bold text-white shadow-xs transition-all hover:bg-indigo-700 active:scale-95"
          >
            <Plus className="h-4 w-4" />
            Добавить учителя
          </button>
        </div>
      </div>

      {/* Teachers Grid */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {teachers.map((teacher) => {
          const currentLoad = schedule.filter((s) => s.teacherId === teacher.id).length;
          const prefRoom = teacher.preferredRoomId ? roomMap.get(teacher.preferredRoomId) : null;
          const isOverloaded = currentLoad > teacher.maxHoursPerWeek;

          return (
            <div
              key={teacher.id}
              className="rounded-2xl border border-slate-200 bg-white p-5 shadow-2xs hover:border-indigo-300 transition-all flex flex-col justify-between"
            >
              <div>
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="font-extrabold text-slate-800 text-base">{teacher.name}</h3>
                    <span className="text-xs font-semibold text-indigo-600">
                      {teacher.shortName}
                    </span>
                  </div>
                  <button
                    onClick={() => handleDeleteTeacher(teacher.id)}
                    className="rounded-lg p-1.5 text-slate-300 hover:bg-rose-50 hover:text-rose-600 transition-colors"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>

                {/* Subjects badges */}
                <div className="mt-3 flex flex-wrap gap-1">
                  {teacher.subjectIds.map((subId) => {
                    const s = subjectMap.get(subId);
                    return (
                      <span
                        key={subId}
                        className="rounded-md px-1.5 py-0.5 text-[10px] font-bold"
                        style={{ backgroundColor: `${s?.color}15`, color: s?.color }}
                      >
                        {s?.name}
                      </span>
                    );
                  })}
                  {teacher.subjectIds.length === 0 && (
                    <span className="text-[11px] text-amber-600">Предметы не назначены</span>
                  )}
                </div>

                {/* Preferred room */}
                <div className="mt-3 text-xs text-slate-500">
                  <span className="text-slate-400">Кабинет: </span>
                  <span className="font-medium text-slate-700">
                    {prefRoom ? prefRoom.name : 'Не закреплен'}
                  </span>
                </div>
              </div>

              {/* Load Bar */}
              <div className="mt-4 border-t border-slate-100 pt-3">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-400">Нагрузка:</span>
                  <span
                    className={`font-black ${
                      isOverloaded ? 'text-rose-600' : 'text-slate-800'
                    }`}
                  >
                    {currentLoad} / {teacher.maxHoursPerWeek} ч/нед
                  </span>
                </div>
                <div className="mt-1.5 h-1.5 w-full rounded-full bg-slate-100 overflow-hidden">
                  <div
                    className={`h-full rounded-full ${
                      isOverloaded ? 'bg-rose-500' : 'bg-indigo-600'
                    }`}
                    style={{
                      width: `${Math.min(100, (currentLoad / teacher.maxHoursPerWeek) * 100)}%`,
                    }}
                  />
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Add Teacher Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs">
          <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-100 pb-4">
              <div>
                <h3 className="text-lg font-bold text-slate-800">Добавить преподавателя</h3>
                <p className="text-xs text-slate-500">
                  Заполните ФИО, предметы преподавания и рабочую нагрузку
                </p>
              </div>
              <button
                onClick={() => setShowAddModal(false)}
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleAddTeacher} className="mt-4 space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  ФИО преподавателя
                </label>
                <input
                  type="text"
                  required
                  placeholder="Иванова Анна Владимировна"
                  value={name}
                  onChange={(e) => {
                    setName(e.target.value);
                    if (!shortName) {
                      const parts = e.target.value.trim().split(' ');
                      if (parts.length >= 2) {
                        setShortName(
                          `${parts[0]} ${parts[1][0]}.${parts[2] ? parts[2][0] + '.' : ''}`
                        );
                      }
                    }
                  }}
                  className="w-full rounded-xl border border-slate-300 p-2.5 text-sm focus:border-indigo-500 focus:outline-hidden"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Краткое ФИО (для ячеек расписания)
                </label>
                <input
                  type="text"
                  placeholder="Иванова А.В."
                  value={shortName}
                  onChange={(e) => setShortName(e.target.value)}
                  className="w-full rounded-xl border border-slate-300 p-2.5 text-sm focus:border-indigo-500 focus:outline-hidden"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  Предметы специализации:
                </label>
                <div className="flex flex-wrap gap-1.5 max-h-36 overflow-y-auto p-2 border border-slate-200 rounded-xl">
                  {subjects.map((s) => (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => toggleSubject(s.id)}
                      className={`rounded-lg px-2.5 py-1 text-xs font-bold transition-all ${
                        selectedSubjectIds.includes(s.id)
                          ? 'bg-indigo-600 text-white shadow-xs'
                          : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                      }`}
                    >
                      {s.name}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Макс. часов в неделю
                  </label>
                  <input
                    type="number"
                    min={6}
                    max={40}
                    value={maxHours}
                    onChange={(e) => setMaxHours(Number(e.target.value))}
                    className="w-full rounded-xl border border-slate-300 p-2.5 text-sm focus:border-indigo-500 focus:outline-hidden"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Закрепленный кабинет
                  </label>
                  <select
                    value={preferredRoomId}
                    onChange={(e) => setPreferredRoomId(e.target.value)}
                    className="w-full rounded-xl border border-slate-300 p-2.5 text-sm focus:border-indigo-500 focus:outline-hidden"
                  >
                    <option value="">Без закрепления</option>
                    {rooms.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="mt-6 flex items-center justify-end gap-2 border-t border-slate-100 pt-4">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="rounded-xl border border-slate-300 px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100"
                >
                  Отмена
                </button>
                <button
                  type="submit"
                  className="rounded-xl bg-indigo-600 px-5 py-2 text-xs font-bold text-white shadow-xs hover:bg-indigo-700"
                >
                  Добавить преподавателя
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
