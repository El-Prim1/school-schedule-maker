import React, { useState } from 'react';
import { AppState, Room, RoomType } from '../types/schedule';
import { ROOM_TYPE_META } from '../utils/constants';
import { DoorClosed, Plus, Trash2, Edit2, Layers, Check } from 'lucide-react';

interface RoomsManagerProps {
  state: AppState;
  onUpdateRooms: (rooms: Room[]) => void;
}

export const RoomsManager: React.FC<RoomsManagerProps> = ({ state, onUpdateRooms }) => {
  const { rooms, schedule } = state;

  const [showAddModal, setShowAddModal] = useState(false);
  const [name, setName] = useState('');
  const [type, setType] = useState<RoomType>('regular');
  const [capacity, setCapacity] = useState<number>(1);
  const [description, setDescription] = useState('');

  const handleAddRoom = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    const newRoom: Room = {
      id: `room_${Date.now()}`,
      name: name.trim(),
      type,
      capacity: Number(capacity) || 1,
      description: description.trim() || undefined,
    };

    onUpdateRooms([...rooms, newRoom]);
    setShowAddModal(false);
    setName('');
    setDescription('');
    setCapacity(1);
    setType('regular');
  };

  const handleDeleteRoom = (id: string) => {
    if (confirm('Удалить этот кабинет?')) {
      onUpdateRooms(rooms.filter((r) => r.id !== id));
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-xs">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <DoorClosed className="h-6 w-6 text-indigo-600" />
              <h2 className="text-xl font-extrabold text-slate-800">
                Кабинетный фонд ({rooms.length} помещений)
              </h2>
            </div>
            <p className="mt-1 text-xs text-slate-500">
              Управление профильными аудиториями: спортивные залы, ИТ-лаборатории, физико-химические практикумы и предметные классы.
            </p>
          </div>

          <button
            onClick={() => setShowAddModal(true)}
            className="flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-xs font-bold text-white shadow-xs transition-all hover:bg-indigo-700 active:scale-95"
          >
            <Plus className="h-4 w-4" />
            Добавить кабинет
          </button>
        </div>
      </div>

      {/* Grid */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {rooms.map((room) => {
          const meta = ROOM_TYPE_META[room.type];
          const lessonsInRoom = schedule.filter((s) => s.roomId === room.id).length;

          return (
            <div
              key={room.id}
              className="rounded-2xl border border-slate-200 bg-white p-5 shadow-2xs hover:border-indigo-300 transition-all flex flex-col justify-between"
            >
              <div>
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="font-extrabold text-slate-800 text-base">{room.name}</h3>
                    <span
                      className={`mt-1 inline-flex rounded-md px-2 py-0.5 text-[11px] font-bold border ${meta.bg} ${meta.text} ${meta.border}`}
                    >
                      {meta.label}
                    </span>
                  </div>

                  <button
                    onClick={() => handleDeleteRoom(room.id)}
                    className="rounded-lg p-1.5 text-slate-300 hover:bg-rose-50 hover:text-rose-600 transition-colors"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>

                {room.description && (
                  <p className="mt-2 text-xs text-slate-500 italic">{room.description}</p>
                )}

                <div className="mt-4 flex items-center gap-2 text-xs text-slate-600">
                  <span className="rounded-md bg-slate-100 px-2 py-1 font-semibold">
                    Вместимость: {room.capacity} {room.capacity === 1 ? 'класс' : 'класса'}
                  </span>
                </div>
              </div>

              <div className="mt-4 border-t border-slate-100 pt-3 flex items-center justify-between text-xs">
                <span className="text-slate-400">Занятость в неделю:</span>
                <span className="font-bold text-indigo-700">{lessonsInRoom} уроков</span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Add Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs">
          <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-100 pb-4">
              <div>
                <h3 className="text-lg font-bold text-slate-800">Добавить кабинет</h3>
                <p className="text-xs text-slate-500">
                  Укажите название, профильный тип и вместимость
                </p>
              </div>
              <button
                onClick={() => setShowAddModal(false)}
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleAddRoom} className="mt-4 space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Номер или название кабинета
                </label>
                <input
                  type="text"
                  required
                  placeholder="Например: Кабинет 305 или Спортивный зал №2"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full rounded-xl border border-slate-300 p-2.5 text-sm focus:border-indigo-500 focus:outline-hidden"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Профильный тип помещения
                </label>
                <select
                  value={type}
                  onChange={(e) => setType(e.target.value as RoomType)}
                  className="w-full rounded-xl border border-slate-300 p-2.5 text-sm focus:border-indigo-500 focus:outline-hidden"
                >
                  {Object.entries(ROOM_TYPE_META).map(([typeKey, meta]) => (
                    <option key={typeKey} value={typeKey}>
                      {meta.label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Вместимость (одновременно классов)
                </label>
                <select
                  value={capacity}
                  onChange={(e) => setCapacity(Number(e.target.value))}
                  className="w-full rounded-xl border border-slate-300 p-2.5 text-sm focus:border-indigo-500 focus:outline-hidden"
                >
                  <option value={1}>1 класс (стандарт)</option>
                  <option value={2}>2 класса (большой спортзал / спаренные занятия)</option>
                  <option value={3}>3 класса (поточная аудитория)</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Оснащение / примечание
                </label>
                <input
                  type="text"
                  placeholder="Интерактивная доска, вытяжной шкаф, 15 ноутбуков..."
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="w-full rounded-xl border border-slate-300 p-2.5 text-sm focus:border-indigo-500 focus:outline-hidden"
                />
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
                  Добавить кабинет
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
