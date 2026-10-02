import React, { useState } from 'react';
import { AppState, SchoolClass } from '../types/schedule';
import { RUSSIAN_LETTERS } from '../utils/constants';
import { calculateShift2StartTime } from '../utils/shiftUtils';
import { Plus, Trash2, Edit2, Layers, Check, Sparkles, SlidersHorizontal, School } from 'lucide-react';

interface ClassesManagerProps {
  state: AppState;
  onUpdateClasses: (classes: SchoolClass[]) => void;
  onUpdateParallelLimits: (limits: Record<number, number>) => void;
  onAutoGenerateCurriculumForClass?: (newClass: SchoolClass) => void;
}

export const ClassesManager: React.FC<ClassesManagerProps> = ({
  state,
  onUpdateClasses,
  onUpdateParallelLimits,
}) => {
  const { classes, teachers, rooms, parallelLimits, settings } = state;

  const shift1LessonsCount = Math.max(
    ...classes.filter((c) => c.shift === 1).map((c) => parallelLimits[c.grade] || 6),
    6
  );
  const shift1StartTime = settings?.shift1Start || '08:00';
  const shift2StartTime = calculateShift2StartTime(
    shift1StartTime,
    settings?.breakDurationMinutes || 5,
    shift1LessonsCount
  );

  // Mass creation state
  const [selectedGrades, setSelectedGrades] = useState<number[]>([5, 6, 7]);
  const [selectedLetters, setSelectedLetters] = useState<string[]>(['А', 'Б', 'В']);
  const [selectedShift, setSelectedShift] = useState<1 | 2>(1);
  const [showMassModal, setShowMassModal] = useState<boolean>(false);

  // Single class addition state
  const [singleGrade, setSingleGrade] = useState<number>(5);
  const [singleLetter, setSingleLetter] = useState<string>('А');
  const [singleShift, setSingleShift] = useState<1 | 2>(1);
  const [singleTeacherId, setSingleTeacherId] = useState<string>('');
  const [singleRoomId, setSingleRoomId] = useState<string>('');

  // Toggle grade for mass creator
  const toggleGrade = (g: number) => {
    if (selectedGrades.includes(g)) {
      setSelectedGrades(selectedGrades.filter((x) => x !== g));
    } else {
      setSelectedGrades([...selectedGrades, g].sort((a, b) => a - b));
    }
  };

  // Toggle letter for mass creator
  const toggleLetter = (l: string) => {
    if (selectedLetters.includes(l)) {
      if (selectedLetters.length > 1) {
        setSelectedLetters(selectedLetters.filter((x) => x !== l));
      }
    } else {
      setSelectedLetters([...selectedLetters, l]);
    }
  };

  // Quick grade presets
  const selectGradesPreset = (preset: 'middle' | 'high' | 'all' | 'primary') => {
    if (preset === 'primary') setSelectedGrades([1, 2, 3, 4]);
    if (preset === 'middle') setSelectedGrades([5, 6, 7, 8, 9]);
    if (preset === 'high') setSelectedGrades([10, 11]);
    if (preset === 'all') setSelectedGrades([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
  };

  // Calculate classes to be mass created
  const previewMassClasses = selectedGrades.flatMap((grade) =>
    selectedLetters.map((letter) => `${grade}${letter}`)
  );

  // Handle mass creation
  const handleMassCreate = () => {
    const newClassesList = [...classes];

    selectedGrades.forEach((grade) => {
      selectedLetters.forEach((letter) => {
        const name = `${grade}${letter}`;
        // Only add if not already existing
        if (!newClassesList.some((c) => c.name === name)) {
          newClassesList.push({
            id: `cls_${grade}_${letter.toLowerCase()}_${Date.now()}_${Math.random().toString(36).substring(2, 5)}`,
            grade,
            letter,
            name,
            shift: selectedShift,
          });
        }
      });
    });

    // Sort classes naturally: 5А, 5Б, 5В, 6А...
    newClassesList.sort((a, b) => {
      if (a.grade !== b.grade) return a.grade - b.grade;
      return a.letter.localeCompare(b.letter, 'ru');
    });

    onUpdateClasses(newClassesList);
    setShowMassModal(false);
  };

  // Handle single class creation
  const handleAddSingleClass = (e: React.FormEvent) => {
    e.preventDefault();
    const name = `${singleGrade}${singleLetter}`;
    if (classes.some((c) => c.name === name)) {
      alert(`Класс ${name} уже существует!`);
      return;
    }

    const newClass: SchoolClass = {
      id: `cls_${singleGrade}_${singleLetter.toLowerCase()}_${Date.now()}`,
      grade: singleGrade,
      letter: singleLetter,
      name,
      shift: singleShift,
      homeroomTeacherId: singleTeacherId || undefined,
      homeroomRoomId: singleRoomId || undefined,
    };

    const updated = [...classes, newClass].sort((a, b) => {
      if (a.grade !== b.grade) return a.grade - b.grade;
      return a.letter.localeCompare(b.letter, 'ru');
    });

    onUpdateClasses(updated);
  };

  // Delete class
  const handleDeleteClass = (id: string) => {
    onUpdateClasses(classes.filter((c) => c.id !== id));
  };

  // Update parallel limit
  const handleLimitChange = (grade: number, val: number) => {
    onUpdateParallelLimits({
      ...parallelLimits,
      [grade]: Math.max(3, Math.min(8, val)),
    });
  };

  // Apply SanPiN standard limits
  const applySanpinLimits = () => {
    onUpdateParallelLimits({
      1: 4,
      2: 5,
      3: 5,
      4: 5,
      5: 6,
      6: 6,
      7: 6,
      8: 6,
      9: 6,
      10: 7,
      11: 7,
    });
  };

  return (
    <div className="space-y-8">
      {/* Top Banner & Mass Creation trigger */}
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-xs">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <School className="h-6 w-6 text-indigo-600" />
              <h2 className="text-xl font-extrabold text-slate-800">
                Классы и параллели школы ({classes.length} классов)
              </h2>
            </div>
            <p className="mt-1 text-xs text-slate-500">
              Массовое формирование классов с буквами русского алфавита (5А, 5Б, 5В...), закрепление кабинетов и гибкая настройка дневных лимитов уроков.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowMassModal(true)}
              className="flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-xs font-bold text-white shadow-xs transition-all hover:bg-indigo-700 active:scale-95"
            >
              <Sparkles className="h-4 w-4" />
              Массовое создание по параллелям
            </button>
          </div>
        </div>
      </div>

      {/* SECTION: Flexible Parallel Limits */}
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-xs">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-100 pb-4">
          <div>
            <div className="flex items-center gap-2">
              <SlidersHorizontal className="h-5 w-5 text-indigo-600" />
              <h3 className="text-base font-bold text-slate-800">
                Дневной лимит уроков для каждой параллели
              </h3>
            </div>
            <p className="mt-0.5 text-xs text-slate-500">
              Максимальное количество уроков в день, которое генератор может назначить классу данной параллели
            </p>
          </div>

          <button
            onClick={applySanpinLimits}
            className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100 transition-all"
          >
            Сбросить к нормам СанПиН
          </button>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-11">
          {Array.from({ length: 11 }, (_, i) => i + 1).map((grade) => {
            const currentLimit = parallelLimits[grade] || 6;
            const hasClasses = classes.some((c) => c.grade === grade);

            return (
              <div
                key={grade}
                className={`rounded-xl border p-3 text-center transition-all ${
                  hasClasses ? 'border-indigo-200 bg-indigo-50/30' : 'border-slate-200 bg-slate-50/50'
                }`}
              >
                <div className="text-xs font-bold text-slate-700">{grade} класс</div>
                <div className="mt-2 flex items-center justify-center gap-1.5">
                  <button
                    onClick={() => handleLimitChange(grade, currentLimit - 1)}
                    className="h-6 w-6 rounded-md bg-white border border-slate-200 text-xs font-bold text-slate-600 hover:bg-slate-100"
                  >
                    -
                  </button>
                  <span className="w-6 text-center text-sm font-extrabold text-indigo-700">
                    {currentLimit}
                  </span>
                  <button
                    onClick={() => handleLimitChange(grade, currentLimit + 1)}
                    className="h-6 w-6 rounded-md bg-white border border-slate-200 text-xs font-bold text-slate-600 hover:bg-slate-100"
                  >
                    +
                  </button>
                </div>
                <div className="mt-1 text-[10px] text-slate-400">ур / день</div>
              </div>
            );
          })}
        </div>
      </div>

      {/* SECTION: Classes Grid & Single Add */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Classes List */}
        <div className="lg:col-span-2 space-y-4">
          <h3 className="text-base font-bold text-slate-800">
            Список сформированных классов ({classes.length})
          </h3>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3">
            {classes.map((cls) => {
              const homeroomTeacher = teachers.find((t) => t.id === cls.homeroomTeacherId);
              const homeroomRoom = rooms.find((r) => r.id === cls.homeroomRoomId);
              const limit = parallelLimits[cls.grade] || 6;

              return (
                <div
                  key={cls.id}
                  className="rounded-2xl border border-slate-200 bg-white p-4 shadow-2xs hover:border-indigo-300 transition-all"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-lg font-black text-slate-800">{cls.name}</span>
                    <span className="rounded-md bg-indigo-50 px-2 py-0.5 text-xs font-bold text-indigo-700">
                      {cls.shift === 1 ? `1-я смена (${shift1StartTime})` : `2-я смена (${shift2StartTime})`}
                    </span>
                  </div>

                  <div className="mt-3 space-y-1 text-xs text-slate-500">
                    <div>
                      <span className="text-slate-400">Дневной лимит:</span>{' '}
                      <strong className="text-slate-700">{limit} уроков</strong>
                    </div>
                    <div>
                      <span className="text-slate-400">Кл. руководитель:</span>{' '}
                      <span className="text-slate-700 font-medium">
                        {homeroomTeacher?.shortName || 'Не назначен'}
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-400">Кабинет класса:</span>{' '}
                      <span className="text-slate-700 font-medium">
                        {homeroomRoom?.name || 'Плавающий'}
                      </span>
                    </div>
                  </div>

                  <div className="mt-4 flex items-center justify-end border-t border-slate-100 pt-2.5">
                    <button
                      onClick={() => handleDeleteClass(cls.id)}
                      className="rounded-lg p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600 transition-colors"
                      title="Удалить класс"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Add Single Class Card */}
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-xs h-fit">
          <h3 className="text-base font-bold text-slate-800">Добавить отдельный класс</h3>
          <p className="mt-0.5 text-xs text-slate-500">
            Индивидуальное добавление класса в школу
          </p>

          <form onSubmit={handleAddSingleClass} className="mt-4 space-y-3">
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Параллель (1-11)
                </label>
                <select
                  value={singleGrade}
                  onChange={(e) => setSingleGrade(Number(e.target.value))}
                  className="w-full rounded-xl border border-slate-300 p-2 text-sm focus:border-indigo-500 focus:outline-hidden"
                >
                  {Array.from({ length: 11 }, (_, i) => i + 1).map((g) => (
                    <option key={g} value={g}>
                      {g} класс
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Буква
                </label>
                <select
                  value={singleLetter}
                  onChange={(e) => setSingleLetter(e.target.value)}
                  className="w-full rounded-xl border border-slate-300 p-2 text-sm focus:border-indigo-500 focus:outline-hidden"
                >
                  {RUSSIAN_LETTERS.map((l) => (
                    <option key={l} value={l}>
                      {l}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Смена
              </label>
              <select
                value={singleShift}
                onChange={(e) => setSingleShift(Number(e.target.value) as 1 | 2)}
                className="w-full rounded-xl border border-slate-300 p-2 text-sm focus:border-indigo-500 focus:outline-hidden"
              >
                <option value={1}>1-я смена (с {shift1StartTime})</option>
                <option value={2}>2-я смена (с {shift2StartTime})</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Классный руководитель
              </label>
              <select
                value={singleTeacherId}
                onChange={(e) => setSingleTeacherId(e.target.value)}
                className="w-full rounded-xl border border-slate-300 p-2 text-sm focus:border-indigo-500 focus:outline-hidden"
              >
                <option value="">Не назначен</option>
                {teachers.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Закреплённый кабинет
              </label>
              <select
                value={singleRoomId}
                onChange={(e) => setSingleRoomId(e.target.value)}
                className="w-full rounded-xl border border-slate-300 p-2 text-sm focus:border-indigo-500 focus:outline-hidden"
              >
                <option value="">Плавающий кабинет</option>
                {rooms.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                  </option>
                ))}
              </select>
            </div>

            <button
              type="submit"
              className="w-full rounded-xl bg-slate-900 py-2.5 text-xs font-bold text-white shadow-xs hover:bg-slate-800 transition-all mt-2"
            >
              Создать класс {singleGrade}
              {singleLetter}
            </button>
          </form>
        </div>
      </div>

      {/* MODAL: Mass Creation by Parallels & Russian Alphabet */}
      {showMassModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs">
          <div className="w-full max-w-xl rounded-2xl bg-white p-6 shadow-2xl transition-all">
            <div className="flex items-center justify-between border-b border-slate-100 pb-4">
              <div>
                <h3 className="text-lg font-bold text-slate-800">
                  Массовое создание классов по параллелям
                </h3>
                <p className="text-xs text-slate-500">
                  Быстрая генерация классов с буквами русского алфавита (5А, 5Б, 5В...)
                </p>
              </div>
              <button
                onClick={() => setShowMassModal(false)}
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100"
              >
                ✕
              </button>
            </div>

            <div className="mt-4 space-y-5">
              {/* Select Parallels */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-xs font-bold text-slate-700">Параллели:</label>
                  <div className="flex gap-1.5 text-[11px]">
                    <button
                      type="button"
                      onClick={() => selectGradesPreset('middle')}
                      className="rounded-md bg-slate-100 px-2 py-0.5 font-medium text-slate-600 hover:bg-slate-200"
                    >
                      5-9 классы
                    </button>
                    <button
                      type="button"
                      onClick={() => selectGradesPreset('high')}
                      className="rounded-md bg-slate-100 px-2 py-0.5 font-medium text-slate-600 hover:bg-slate-200"
                    >
                      10-11 классы
                    </button>
                    <button
                      type="button"
                      onClick={() => selectGradesPreset('all')}
                      className="rounded-md bg-slate-100 px-2 py-0.5 font-medium text-slate-600 hover:bg-slate-200"
                    >
                      Все 1-11
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-6 gap-2 sm:grid-cols-11">
                  {Array.from({ length: 11 }, (_, i) => i + 1).map((g) => (
                    <button
                      key={g}
                      type="button"
                      onClick={() => toggleGrade(g)}
                      className={`h-9 rounded-xl text-xs font-bold transition-all ${
                        selectedGrades.includes(g)
                          ? 'bg-indigo-600 text-white shadow-xs'
                          : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                      }`}
                    >
                      {g}
                    </button>
                  ))}
                </div>
              </div>

              {/* Select Letters of Russian Alphabet */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-2">
                  Буквы классов (русский алфавит):
                </label>
                <div className="flex flex-wrap gap-2">
                  {RUSSIAN_LETTERS.map((letter) => (
                    <button
                      key={letter}
                      type="button"
                      onClick={() => toggleLetter(letter)}
                      className={`h-10 w-10 rounded-xl text-sm font-black transition-all ${
                        selectedLetters.includes(letter)
                          ? 'bg-indigo-600 text-white shadow-xs'
                          : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                      }`}
                    >
                      {letter}
                    </button>
                  ))}
                </div>
              </div>

              {/* Shift */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  Смена для создаваемых классов:
                </label>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setSelectedShift(1)}
                    className={`flex-1 rounded-xl py-2 text-xs font-bold transition-all ${
                      selectedShift === 1
                        ? 'bg-slate-900 text-white'
                        : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                    }`}
                  >
                    1-я смена (с {shift1StartTime})
                  </button>
                  <button
                    type="button"
                    onClick={() => setSelectedShift(2)}
                    className={`flex-1 rounded-xl py-2 text-xs font-bold transition-all ${
                      selectedShift === 2
                        ? 'bg-slate-900 text-white'
                        : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                    }`}
                  >
                    2-я смена (с {shift2StartTime})
                  </button>
                </div>
              </div>

              {/* Preview */}
              <div className="rounded-xl bg-slate-50 p-4 border border-slate-200">
                <div className="text-xs font-bold text-slate-700 mb-1.5">
                  Предпросмотр: будет добавлено {previewMassClasses.length} классов:
                </div>
                <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto">
                  {previewMassClasses.map((name) => {
                    const exists = classes.some((c) => c.name === name);
                    return (
                      <span
                        key={name}
                        className={`rounded-md px-2 py-0.5 text-xs font-bold ${
                          exists
                            ? 'bg-slate-200 text-slate-400 line-through'
                            : 'bg-indigo-100 text-indigo-800'
                        }`}
                      >
                        {name} {exists && '(уже есть)'}
                      </span>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Modal actions */}
            <div className="mt-6 flex items-center justify-end gap-2 border-t border-slate-100 pt-4">
              <button
                type="button"
                onClick={() => setShowMassModal(false)}
                className="rounded-xl border border-slate-300 px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100"
              >
                Отмена
              </button>
              <button
                type="button"
                onClick={handleMassCreate}
                disabled={previewMassClasses.length === 0}
                className="rounded-xl bg-indigo-600 px-5 py-2 text-xs font-bold text-white shadow-xs hover:bg-indigo-700 disabled:opacity-50"
              >
                Создать классы ({previewMassClasses.length})
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
