import React, { useState } from 'react';
import { AppState, Room, RoomType } from '../types/schedule';
import { ROOM_TYPE_META } from '../utils/constants';
import { DoorClosed, Plus, Trash2, Sparkles, Layers, Check, AlertCircle } from 'lucide-react';

interface RoomsManagerProps {
  state: AppState;
  onUpdateRooms: (rooms: Room[]) => void;
  onNotify?: (message: string, type?: 'success' | 'error' | 'warning' | 'info') => void;
}

export const RoomsManager: React.FC<RoomsManagerProps> = ({ state, onUpdateRooms, onNotify }) => {
  const { rooms, schedule } = state;

  // Single room addition state
  const [showAddModal, setShowAddModal] = useState(false);
  const [roomNumber, setRoomNumber] = useState('');
  const [capacity, setCapacity] = useState<number>(1);

  // Mass room creation state
  const [showMassModal, setShowMassModal] = useState(false);
  const [rangeStart, setRangeStart] = useState<string>('101');
  const [rangeEnd, setRangeEnd] = useState<string>('120');
  const [usePrefix, setUsePrefix] = useState<boolean>(true);

  const cleanRoomNumber = roomNumber.trim();
  const fullRoomName =
    usePrefix && !cleanRoomNumber.toLowerCase().includes('кабинет') && !isNaN(Number(cleanRoomNumber))
      ? `Кабинет ${cleanRoomNumber}`
      : cleanRoomNumber;
  const roomNameExists = Boolean(cleanRoomNumber) && rooms.some(
    (room) => room.name.toLowerCase() === fullRoomName.toLowerCase()
  );

  // Handle single room creation
  const handleAddRoom = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanNumber = cleanRoomNumber;
    if (!cleanNumber || roomNameExists) return;

    // Check duplicate
    const fullName = usePrefix && !cleanNumber.toLowerCase().includes('кабинет') && !isNaN(Number(cleanNumber))
      ? `Кабинет ${cleanNumber}`
      : cleanNumber;


    const newRoom: Room = {
      id: `room_${Date.now()}_${Math.random().toString(36).substring(2, 5)}`,
      name: fullName,
      type: 'regular',
      capacity: Math.max(1, Number(capacity) || 1),
    };

    onUpdateRooms([...rooms, newRoom]);
    setShowAddModal(false);
    setRoomNumber('');
    setCapacity(1);
    onNotify?.(`Кабинет «${fullName}» успешно создан`, 'success');
  };

  // Calculate preview for mass creation
  const startNum = parseInt(rangeStart, 10);
  const endNum = parseInt(rangeEnd, 10);
  const isValidRange = !isNaN(startNum) && !isNaN(endNum) && startNum <= endNum && endNum - startNum <= 500;
  const massCount = isValidRange ? endNum - startNum + 1 : 0;

  // Handle mass room creation
  const handleMassCreateRooms = (e: React.FormEvent) => {
    e.preventDefault();
    if (!isValidRange) {
      return;
    }

    const newRoomsList = [...rooms];
    let createdCount = 0;

    for (let num = startNum; num <= endNum; num++) {
      const name = usePrefix ? `Кабинет ${num}` : `${num}`;
      // Only add if not existing
      if (!newRoomsList.some((r) => r.name.toLowerCase() === name.toLowerCase())) {
        newRoomsList.push({
          id: `room_${num}_${Date.now()}_${Math.random().toString(36).substring(2, 5)}`,
          name,
          type: 'regular',
          capacity: 1, // Standard 1 class capacity
        });
        createdCount++;
      }
    }

    // Natural sort: 101, 102, 103...
    newRoomsList.sort((a, b) => a.name.localeCompare(b.name, 'ru', { numeric: true }));

    onUpdateRooms(newRoomsList);
    setShowMassModal(false);
    onNotify?.(
      createdCount > 0
        ? `Создано кабинетов: ${createdCount}`
        : 'Все кабинеты из этого диапазона уже существуют',
      createdCount > 0 ? 'success' : 'info'
    );
  };

  const handleDeleteRoom = (id: string) => {
    onUpdateRooms(rooms.filter((r) => r.id !== id));
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
                Кабинетный фонд ({rooms.length} кабинетов)
              </h2>
            </div>
            <p className="mt-1 text-xs text-slate-500">
              Быстрое создание кабинетов по номеру и вместимости, а также массовая генерация номерных диапазонов (100–560).
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <button
              onClick={() => setShowMassModal(true)}
              className="flex items-center gap-1.5 rounded-xl bg-indigo-600 px-4 py-2.5 text-xs font-bold text-white shadow-xs transition-all hover:bg-indigo-700 active:scale-95"
            >
              <Sparkles className="h-4 w-4" />
              Массовое создание по диапазону
            </button>

            <button
              onClick={() => setShowAddModal(true)}
              className="flex items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-xs font-bold text-slate-700 hover:bg-slate-50 transition-all"
            >
              <Plus className="h-4 w-4 text-slate-500" />
              Добавить кабинет
            </button>
          </div>
        </div>
      </div>

      {/* Grid */}
      {rooms.length === 0 ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-12 text-center space-y-3">
          <DoorClosed className="mx-auto h-12 w-12 text-slate-300" />
          <h3 className="text-base font-bold text-slate-800">Кабинеты ещё не добавлены</h3>
          <p className="text-xs text-slate-500 max-w-sm mx-auto">
            Используйте массовое создание по диапазону (например, 101–120) для мгновенного добавления кабинетов школы.
          </p>
          <button
            onClick={() => setShowMassModal(true)}
            className="rounded-xl bg-indigo-600 px-4 py-2 text-xs font-bold text-white shadow-xs hover:bg-indigo-700"
          >
            Создать диапазон кабинетов
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
          {rooms.map((room) => {
            const meta = ROOM_TYPE_META[room.type] || ROOM_TYPE_META.regular;
            const lessonsInRoom = schedule.filter((s) => s.roomId === room.id).length;

            return (
              <div
                key={room.id}
                className="rounded-2xl border border-slate-200 bg-white p-4 shadow-2xs hover:border-indigo-300 transition-all flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-start justify-between">
                    <div>
                      <h3 className="font-extrabold text-slate-800 text-base">{room.name}</h3>
                      <span
                        className={`mt-1 inline-flex rounded-md px-2 py-0.5 text-[10px] font-bold border ${meta.bg} ${meta.text} ${meta.border}`}
                      >
                        {meta.label}
                      </span>
                    </div>

                    <button
                      onClick={() => handleDeleteRoom(room.id)}
                      className="rounded-lg p-1.5 text-slate-300 hover:bg-rose-50 hover:text-rose-600 transition-colors"
                      title="Удалить кабинет"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>

                  <div className="mt-3 flex items-center gap-2 text-xs text-slate-600">
                    <span className="rounded-lg bg-slate-100 px-2 py-1 font-semibold text-[11px]">
                      Вместимость: <strong>{room.capacity} {room.capacity === 1 ? 'класс' : 'класса'}</strong>
                    </span>
                  </div>
                </div>

                <div className="mt-3 border-t border-slate-100 pt-2.5 flex items-center justify-between text-[11px]">
                  <span className="text-slate-400">Занятость:</span>
                  <span className="font-bold text-indigo-700">{lessonsInRoom} ур/нед</span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* SINGLE ROOM ADD MODAL */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-100 pb-4">
              <div>
                <h3 className="text-lg font-bold text-slate-800">Добавить кабинет</h3>
                <p className="text-xs text-slate-500">
                  Укажите номер кабинета и вместимость классов
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
                  Номер кабинета
                </label>
                <input
                  type="text"
                  required
                  autoFocus
                  placeholder="Например: 101, 204 или Спортзал"
                  value={roomNumber}
                  onChange={(e) => setRoomNumber(e.target.value)}
                  aria-invalid={roomNameExists}
                  className={`w-full rounded-xl border p-2.5 text-sm focus:outline-hidden ${
                    roomNameExists
                      ? 'border-rose-400 focus:border-rose-500'
                      : 'border-slate-300 focus:border-indigo-500'
                  }`}
                />
                {roomNameExists && (
                  <p className="mt-1 text-[11px] font-medium text-rose-600">
                    Кабинет «{fullRoomName}» уже существует
                  </p>
                )}
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Сколько классов вмещает
                </label>
                <input
                  type="number"
                  min={1}
                  max={5}
                  value={capacity}
                  onChange={(e) => setCapacity(Math.max(1, parseInt(e.target.value) || 1))}
                  className="w-full rounded-xl border border-slate-300 p-2.5 text-sm focus:border-indigo-500 focus:outline-hidden"
                />
                <p className="mt-1 text-[11px] text-slate-400">
                  Стандартные кабинеты вмещают 1 класс. Большие спортзалы могут вмещать 2 класса.
                </p>
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
                  disabled={!cleanRoomNumber || roomNameExists}
                  className="rounded-xl bg-indigo-600 px-5 py-2 text-xs font-bold text-white shadow-xs hover:bg-indigo-700 active:scale-95 transition-all disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Создать кабинет
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MASS ROOM CREATION MODAL */}
      {showMassModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs">
          <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-100 pb-4">
              <div>
                <h3 className="text-lg font-bold text-slate-800">
                  Массовое создание кабинетов по диапазону
                </h3>
                <p className="text-xs text-slate-500">
                  Автоматическая генерация списка кабинетов по числовому диапазону
                </p>
              </div>
              <button
                onClick={() => setShowMassModal(false)}
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleMassCreateRooms} className="mt-4 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    От номера
                  </label>
                  <input
                    type="number"
                    required
                    min={1}
                    max={9999}
                    placeholder="100"
                    value={rangeStart}
                    onChange={(e) => setRangeStart(e.target.value)}
                    className="w-full rounded-xl border border-slate-300 p-2.5 text-sm font-bold focus:border-indigo-500 focus:outline-hidden"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    До номера
                  </label>
                  <input
                    type="number"
                    required
                    min={1}
                    max={9999}
                    placeholder="120"
                    value={rangeEnd}
                    onChange={(e) => setRangeEnd(e.target.value)}
                    className="w-full rounded-xl border border-slate-300 p-2.5 text-sm font-bold focus:border-indigo-500 focus:outline-hidden"
                  />
                </div>
              </div>
              {!isValidRange && (
                <p className="text-[11px] font-medium text-rose-600">
                  Укажите корректный диапазон: начало не больше конца, максимум 500 кабинетов.
                </p>
              )}

              {/* Format setting */}
              <div className="flex items-center gap-2 pt-1">
                <input
                  type="checkbox"
                  id="usePrefixCheck"
                  checked={usePrefix}
                  onChange={(e) => setUsePrefix(e.target.checked)}
                  className="h-4 w-4 rounded-sm border-slate-300 text-indigo-600 focus:ring-indigo-500"
                />
                <label htmlFor="usePrefixCheck" className="text-xs font-medium text-slate-700 cursor-pointer">
                  Добавлять приставку «Кабинет» (например, «Кабинет 101» вместо просто «101»)
                </label>
              </div>

              {/* Info about capacity */}
              <div className="rounded-xl bg-slate-50 p-3 border border-slate-200 text-xs text-slate-600">
                <div className="font-semibold text-slate-800">Информация о вместимости:</div>
                <div className="mt-0.5 text-slate-500">
                  Все создаваемые кабинеты по умолчанию имеют стандартную вместимость <strong>1 класс</strong>.
                </div>
              </div>

              {/* Preview */}
              {isValidRange && massCount > 0 && (
                <div className="rounded-xl bg-indigo-50/60 p-3.5 border border-indigo-100 text-xs">
                  <div className="font-bold text-indigo-900">
                    Будет создано {massCount} кабинетов:
                  </div>
                  <div className="mt-1 text-indigo-700 truncate font-mono text-[11px]">
                    {Array.from({ length: Math.min(massCount, 8) }, (_, i) =>
                      usePrefix ? `Кабинет ${startNum + i}` : `${startNum + i}`
                    ).join(', ')}
                    {massCount > 8 ? ` ... и ещё ${massCount - 8}` : ''}
                  </div>
                </div>
              )}

              <div className="mt-6 flex items-center justify-end gap-2 border-t border-slate-100 pt-4">
                <button
                  type="button"
                  onClick={() => setShowMassModal(false)}
                  className="rounded-xl border border-slate-300 px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100"
                >
                  Отмена
                </button>
                <button
                  type="submit"
                  disabled={!isValidRange || massCount === 0}
                  className="rounded-xl bg-indigo-600 px-5 py-2 text-xs font-bold text-white shadow-xs hover:bg-indigo-700 active:scale-95 transition-all disabled:opacity-50"
                >
                  Создать {massCount} кабинетов
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
