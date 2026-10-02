import React, { useState } from 'react';
import { AppState, GenerationSettings, LessonConstraint, ConstraintConditionType } from '../types/schedule';
import { DAYS_OF_WEEK } from '../utils/constants';
import { calculateShift2StartTime } from '../utils/shiftUtils';
import {
  Clock,
  SlidersHorizontal,
  Plus,
  Trash2,
  Sparkles,
  Check,
  AlertCircle,
  Calendar,
  Layers,
  CheckCircle2,
} from 'lucide-react';

interface SettingsManagerProps {
  state: AppState;
  onUpdateSettings: (settings: GenerationSettings) => void;
  onUpdateConstraints: (constraints: LessonConstraint[]) => void;
  onUpdateStateWithUndo?: (
    newState: AppState,
    message: string,
    type?: 'success' | 'error' | 'warning'
  ) => void;
  onClearAll?: () => void;
  onResetToDemo?: () => void;
}

export const SettingsManager: React.FC<SettingsManagerProps> = ({
  state,
  onUpdateSettings,
  onUpdateConstraints,
  onUpdateStateWithUndo,
  onClearAll,
  onResetToDemo,
}) => {
  const { settings, classes, subjects, parallelLimits, constraints = [] } = state;

  // Shift 2 automatic start calculation
  const shift1LessonsCount = Math.max(
    ...classes.filter((c) => c.shift === 1).map((c) => parallelLimits[c.grade] || 6),
    6
  );
  const shift1Start = settings.shift1Start || '08:00';
  const breakDuration = settings.breakDurationMinutes ?? 5;
  const shift2Start = calculateShift2StartTime(shift1Start, breakDuration, shift1LessonsCount);

  // Form state for new constraint
  const [selectedSubjectId, setSelectedSubjectId] = useState<string>(subjects[0]?.id || '');
  const [selectedClassId, setSelectedClassId] = useState<string>('all');
  const [conditionType, setConditionType] = useState<ConstraintConditionType>('always_first');
  const [selectedDay, setSelectedDay] = useState<number>(0);
  const [selectedSlot, setSelectedSlot] = useState<number>(0);
  const [showAddForm, setShowAddForm] = useState<boolean>(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
  };

  const handleSettingChange = <K extends keyof GenerationSettings>(
    key: K,
    val: GenerationSettings[K]
  ) => {
    const newSettings = { ...settings, [key]: val };
    onUpdateSettings(newSettings);
    if (onUpdateStateWithUndo) {
      onUpdateStateWithUndo({ ...state, settings: newSettings }, 'Настройки обновлены');
    }
  };

  const handleAddConstraint = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedSubjectId) return;

    const subject = subjects.find((s) => s.id === selectedSubjectId);
    if (!subject) return;

    const targetClass = classes.find((c) => c.id === selectedClassId);
    const classLabel = targetClass ? `для класса ${targetClass.name}` : 'для всех классов';

    const newConstraint: LessonConstraint = {
      id: `constr_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      subjectId: selectedSubjectId,
      classId: selectedClassId === 'all' ? undefined : selectedClassId,
      conditionType,
      dayOfWeek:
        conditionType === 'only_on_day' ||
        conditionType === 'day_first' ||
        conditionType === 'day_last' ||
        conditionType === 'fixed_slot'
          ? selectedDay
          : undefined,
      lessonIndex: conditionType === 'fixed_slot' ? selectedSlot : undefined,
      enabled: true,
      title: `${subject.name} (${classLabel}) — ${getConditionLabel(conditionType, selectedDay, selectedSlot)}`,
    };

    const updatedConstraints = [...constraints, newConstraint];
    onUpdateConstraints(updatedConstraints);
    if (onUpdateStateWithUndo) {
      onUpdateStateWithUndo({ ...state, constraints: updatedConstraints }, `Добавлено правило для ${subject.name}`);
    } else {
      showToast(`Правило для "${subject.name}" успешно добавлено!`);
    }
    setShowAddForm(false);
  };

  const handleToggleConstraint = (id: string) => {
    const updatedConstraints = constraints.map((c) =>
      c.id === id ? { ...c, enabled: !c.enabled } : c
    );
    onUpdateConstraints(updatedConstraints);
    if (onUpdateStateWithUndo) {
      onUpdateStateWithUndo({ ...state, constraints: updatedConstraints }, 'Статус правила изменен');
    }
  };

  const handleDeleteConstraint = (id: string) => {
    const updatedConstraints = constraints.filter((c) => c.id !== id);
    onUpdateConstraints(updatedConstraints);
    if (onUpdateStateWithUndo) {
      onUpdateStateWithUndo({ ...state, constraints: updatedConstraints }, 'Правило удалено');
    }
  };

  const handleAddPreset = (
    subjectQuery: string,
    fallbackSubjectId: string,
    type: ConstraintConditionType,
    day?: number,
    slot?: number
  ) => {
    const matchedSubject =
      subjects.find(
        (s) =>
          s.name.toLowerCase().includes(subjectQuery.toLowerCase()) ||
          s.shortName.toLowerCase().includes(subjectQuery.toLowerCase())
      ) ||
      subjects.find((s) => s.id === fallbackSubjectId) ||
      subjects[0];

    if (!matchedSubject) return;

    const newConstraint: LessonConstraint = {
      id: `constr_preset_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      subjectId: matchedSubject.id,
      classId: undefined, // all classes
      conditionType: type,
      dayOfWeek: day,
      lessonIndex: slot,
      enabled: true,
      title: `${matchedSubject.name} (Все классы) — ${getConditionLabel(type, day, slot)}`,
    };

    const updatedConstraints = [...constraints, newConstraint];
    onUpdateConstraints(updatedConstraints);
    if (onUpdateStateWithUndo) {
      onUpdateStateWithUndo(
        { ...state, constraints: updatedConstraints },
        `Активирован шаблон: ${matchedSubject.name}`
      );
    } else {
      showToast(`Правило "${newConstraint.title}" успешно активировано!`);
    }
  };

  function getConditionLabel(type: ConstraintConditionType, day?: number, slot?: number): string {
    const dayName = day !== undefined ? (DAYS_OF_WEEK[day]?.name || `День ${day + 1}`) : '';
    switch (type) {
      case 'always_first':
        return 'Всегда 1-м уроком';
      case 'always_last':
        return 'Всегда последним уроком';
      case 'only_on_day':
        return `Только в ${dayName}`;
      case 'day_first':
        return `В ${dayName} — 1-м уроком`;
      case 'day_last':
        return `В ${dayName} — последним уроком`;
      case 'fixed_slot':
        return `В ${dayName}, урок №${(slot ?? 0) + 1}`;
      default:
        return '';
    }
  }

  return (
    <div className="space-y-6">
      {/* Toast */}
      {toastMessage && (
        <div className="flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-3 text-sm font-semibold text-white shadow-lg transition-all animate-bounce">
          <CheckCircle2 className="h-5 w-5" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* SECTION 1: School Timing & Shifts */}
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-xs">
        <div className="flex items-center gap-3 border-b border-slate-100 pb-4">
          <div className="rounded-xl bg-indigo-50 p-2 text-indigo-600">
            <Clock className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-lg font-extrabold text-slate-800">
              Расписание звонков и смены
            </h2>
            <p className="text-xs text-slate-500">
              Начало 1-й смены задается пользователем, длительность перемен настраивается, а начало 2-й смены рассчитывается автоматически.
            </p>
          </div>
        </div>

        <div className="mt-6 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {/* Shift 1 Start */}
          <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-4">
            <label className="block text-xs font-bold text-slate-700 mb-1.5">
              Начало 1-й смены (по умолчанию 08:00)
            </label>
            <input
              type="time"
              value={settings.shift1Start || '08:00'}
              onChange={(e) => handleSettingChange('shift1Start', e.target.value)}
              className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-800 shadow-2xs focus:border-indigo-500 focus:outline-hidden"
            />
            <p className="mt-1.5 text-[11px] text-slate-500">
              Время первого звонка на урок для классов 1-й смены.
            </p>
          </div>

          {/* Break duration */}
          <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-4">
            <label className="block text-xs font-bold text-slate-700 mb-1.5">
              Время перемен (по умолчанию 5 мин)
            </label>
            <div className="flex items-center gap-2">
              <input
                type="number"
                min={2}
                max={45}
                value={settings.breakDurationMinutes ?? 5}
                onChange={(e) =>
                  handleSettingChange(
                    'breakDurationMinutes',
                    Math.max(1, Number(e.target.value))
                  )
                }
                className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-800 shadow-2xs focus:border-indigo-500 focus:outline-hidden"
              />
              <span className="text-xs font-bold text-slate-500 whitespace-nowrap">минут</span>
            </div>
            <p className="mt-1.5 text-[11px] text-slate-500">
              Длительность стандартной перемены между 45-минутными уроками.
            </p>
          </div>

          {/* Shift 2 Start - Calculated Automatically */}
          <div className="rounded-xl border border-indigo-200 bg-indigo-50/40 p-4 sm:col-span-2 lg:col-span-1">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-indigo-900">
                Начало 2-й смены
              </span>
              <span className="rounded-md bg-indigo-100 px-2 py-0.5 text-[10px] font-black uppercase text-indigo-700">
                Авторасчёт
              </span>
            </div>
            <div className="mt-2 text-2xl font-black text-indigo-700">
              {shift2Start}
            </div>
            <p className="mt-1 text-[11px] text-indigo-950/70">
              Рассчитано автоматически: {shift1LessonsCount} уроков по 45 мин + перемены по {breakDuration} мин + 20 мин межсменная санитарная пауза.
            </p>
          </div>
        </div>

        {/* Global generation algorithm toggles */}
        <div className="mt-6 border-t border-slate-100 pt-4">
          <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-3">
            Опции алгоритма распределения
          </h4>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <label className="flex items-center gap-3 rounded-xl border border-slate-200 p-3 hover:bg-slate-50 cursor-pointer transition-colors">
              <input
                type="checkbox"
                checked={settings.balanceSanpinDifficulty}
                onChange={(e) => handleSettingChange('balanceSanpinDifficulty', e.target.checked)}
                className="h-4 w-4 rounded-md text-indigo-600 focus:ring-indigo-500"
              />
              <span className="text-xs font-semibold text-slate-700">
                Балансировка СанПиН (сложные предметы в середине недели)
              </span>
            </label>

            <label className="flex items-center gap-3 rounded-xl border border-slate-200 p-3 hover:bg-slate-50 cursor-pointer transition-colors">
              <input
                type="checkbox"
                checked={settings.prioritizeProfileRooms}
                onChange={(e) => handleSettingChange('prioritizeProfileRooms', e.target.checked)}
                className="h-4 w-4 rounded-md text-indigo-600 focus:ring-indigo-500"
              />
              <span className="text-xs font-semibold text-slate-700">
                Приоритет профильным кабинетам (спортзал, ИТ, лаб.)
              </span>
            </label>

            <label className="flex items-center gap-3 rounded-xl border border-slate-200 p-3 hover:bg-slate-50 cursor-pointer transition-colors">
              <input
                type="checkbox"
                checked={settings.avoidTeacherWindows}
                onChange={(e) => handleSettingChange('avoidTeacherWindows', e.target.checked)}
                className="h-4 w-4 rounded-md text-indigo-600 focus:ring-indigo-500"
              />
              <span className="text-xs font-semibold text-slate-700">
                Минимизация окон в расписании учителей
              </span>
            </label>
          </div>
        </div>
      </div>

      {/* SECTION 2: Lesson Constraints & Rules (Ограничения для уроков) */}
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-xs space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-100 pb-4">
          <div className="flex items-center gap-3">
            <div className="rounded-xl bg-purple-50 p-2 text-purple-600">
              <SlidersHorizontal className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-lg font-extrabold text-slate-800">
                Ограничения и правила для предметов ({constraints.length})
              </h2>
              <p className="text-xs text-slate-500">
                Задавайте фиксированные правила с указанием классов (конкретных или всех): урок всегда 1-м, только в определенный день или последним уроком.
              </p>
            </div>
          </div>

          <button
            onClick={() => setShowAddForm(!showAddForm)}
            className={`flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-bold transition-all shadow-xs ${
              showAddForm
                ? 'bg-slate-900 text-white'
                : 'bg-indigo-600 text-white hover:bg-indigo-700 active:scale-95'
            }`}
          >
            <Plus className="h-4 w-4" />
            {showAddForm ? 'Скрыть форму' : 'Добавить ограничение'}
          </button>
        </div>

        {/* Quick Presets for Russian Schools */}
        <div className="rounded-xl bg-slate-50 p-4 border border-slate-200">
          <div className="text-xs font-bold text-slate-700 mb-2 flex items-center gap-1.5">
            <Sparkles className="h-3.5 w-3.5 text-indigo-600" />
            <span>Быстрые шаблоны частых ограничений (для всех классов):</span>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => handleAddPreset('история', 'sub_hist', 'day_first', 0)}
              className="rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-xs font-bold text-slate-700 hover:bg-indigo-50 hover:border-indigo-400 hover:text-indigo-700 transition-all shadow-2xs active:scale-95"
            >
              🇷🇺 «Разговоры о важном / История» — Понедельник, 1-й урок
            </button>
            <button
              onClick={() => handleAddPreset('обществознание', 'sub_soc', 'day_last', 4)}
              className="rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-xs font-bold text-slate-700 hover:bg-indigo-50 hover:border-indigo-400 hover:text-indigo-700 transition-all shadow-2xs active:scale-95"
            >
              🎓 «Классный час / Общество» — Пятница, последний урок
            </button>
            <button
              onClick={() => handleAddPreset('физическая культура', 'sub_pe', 'always_last')}
              className="rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-xs font-bold text-slate-700 hover:bg-indigo-50 hover:border-indigo-400 hover:text-indigo-700 transition-all shadow-2xs active:scale-95"
            >
              🏃 «Физкультура» — Всегда последним уроком
            </button>
            <button
              onClick={() => handleAddPreset('информатика', 'sub_inf', 'only_on_day', 3)}
              className="rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-xs font-bold text-slate-700 hover:bg-indigo-50 hover:border-indigo-400 hover:text-indigo-700 transition-all shadow-2xs active:scale-95"
            >
              💻 «Информатика» — Только в четверг
            </button>
          </div>
        </div>

        {/* Add Form */}
        {showAddForm && (
          <form
            onSubmit={handleAddConstraint}
            className="rounded-2xl border-2 border-indigo-200 bg-indigo-50/20 p-5 space-y-4 animate-in fade-in zoom-in-95 duration-150"
          >
            <h3 className="text-sm font-bold text-slate-800">
              Новое ограничение для расписания
            </h3>

            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {/* Subject */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Предмет
                </label>
                <select
                  value={selectedSubjectId}
                  onChange={(e) => setSelectedSubjectId(e.target.value)}
                  className="w-full rounded-xl border border-slate-300 bg-white p-2.5 text-xs font-semibold text-slate-800 focus:border-indigo-500 focus:outline-hidden"
                >
                  {subjects.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} ({s.shortName})
                    </option>
                  ))}
                </select>
              </div>

              {/* Class (Specifically which classes or all) */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Применение к классам
                </label>
                <select
                  value={selectedClassId}
                  onChange={(e) => setSelectedClassId(e.target.value)}
                  className="w-full rounded-xl border border-slate-300 bg-white p-2.5 text-xs font-semibold text-slate-800 focus:border-indigo-500 focus:outline-hidden"
                >
                  <option value="all">🌐 Все классы школы</option>
                  {classes.map((c) => (
                    <option key={c.id} value={c.id}>
                      🏫 Конкретный класс: {c.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Condition type */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Условие ограничения
                </label>
                <select
                  value={conditionType}
                  onChange={(e) =>
                    setConditionType(e.target.value as ConstraintConditionType)
                  }
                  className="w-full rounded-xl border border-slate-300 bg-white p-2.5 text-xs font-semibold text-slate-800 focus:border-indigo-500 focus:outline-hidden"
                >
                  <option value="always_first">Всегда 1-м уроком (в любой день)</option>
                  <option value="always_last">Всегда последним уроком (в любой день)</option>
                  <option value="only_on_day">Только в указанный день недели</option>
                  <option value="day_first">В указанный день — первым уроком</option>
                  <option value="day_last">В указанный день — последним уроком</option>
                  <option value="fixed_slot">Строго в конкретный день и номер урока</option>
                </select>
              </div>

              {/* Day selector if relevant */}
              {(conditionType === 'only_on_day' ||
                conditionType === 'day_first' ||
                conditionType === 'day_last' ||
                conditionType === 'fixed_slot') && (
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    День недели
                  </label>
                  <select
                    value={selectedDay}
                    onChange={(e) => setSelectedDay(Number(e.target.value))}
                    className="w-full rounded-xl border border-slate-300 bg-white p-2.5 text-xs font-semibold text-slate-800 focus:border-indigo-500 focus:outline-hidden"
                  >
                    {DAYS_OF_WEEK.map((d) => (
                      <option key={d.index} value={d.index}>
                        {d.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* Slot selector if fixed_slot */}
              {conditionType === 'fixed_slot' && (
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Номер урока (слот)
                  </label>
                  <select
                    value={selectedSlot}
                    onChange={(e) => setSelectedSlot(Number(e.target.value))}
                    className="w-full rounded-xl border border-slate-300 bg-white p-2.5 text-xs font-semibold text-slate-800 focus:border-indigo-500 focus:outline-hidden"
                  >
                    {Array.from({ length: 8 }, (_, i) => (
                      <option key={i} value={i}>
                        {i + 1}-й урок
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-indigo-100">
              <button
                type="button"
                onClick={() => setShowAddForm(false)}
                className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
              >
                Отмена
              </button>
              <button
                type="submit"
                className="rounded-xl bg-indigo-600 px-5 py-2 text-xs font-bold text-white shadow-xs hover:bg-indigo-700"
              >
                Сохранить правило
              </button>
            </div>
          </form>
        )}

        {/* Constraints List */}
        {constraints.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-300 p-8 text-center">
            <SlidersHorizontal className="mx-auto h-8 w-8 text-slate-400" />
            <p className="mt-2 text-sm font-bold text-slate-700">
              Пока нет настроенных ограничений
            </p>
            <p className="mt-1 text-xs text-slate-500 max-w-md mx-auto">
              Вы можете добавить правила с указанием конкретных классов или всех классов школы.
            </p>
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {constraints.map((c) => {
              const subject = subjects.find((s) => s.id === c.subjectId);
              const targetClass = classes.find((cls) => cls.id === c.classId);

              return (
                <div
                  key={c.id}
                  className={`rounded-2xl border p-4 transition-all ${
                    c.enabled
                      ? 'border-indigo-200 bg-white shadow-2xs ring-1 ring-indigo-500/20'
                      : 'border-slate-200 bg-slate-50/70 opacity-60'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span
                        className="h-3.5 w-3.5 rounded-full shrink-0"
                        style={{ backgroundColor: subject?.color || '#6366f1' }}
                      />
                      <span className="font-extrabold text-slate-800 text-sm">
                        {subject?.name || 'Предмет'}
                      </span>
                    </div>

                    <button
                      onClick={() => handleDeleteConstraint(c.id)}
                      className="rounded-lg p-1 text-slate-400 hover:bg-rose-50 hover:text-rose-600 transition-colors"
                      title="Удалить правило"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>

                  <div className="mt-2.5 text-xs font-bold text-indigo-800 bg-indigo-50/80 rounded-xl p-2.5 border border-indigo-100">
                    {getConditionLabel(c.conditionType, c.dayOfWeek, c.lessonIndex)}
                  </div>

                  <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-2.5 text-xs">
                    <span className="flex items-center gap-1.5 font-semibold text-slate-600">
                      <span className="text-slate-400">Класс:</span>
                      <span className="rounded-md bg-slate-100 px-2 py-0.5 text-slate-800 font-bold">
                        {targetClass ? `🏫 ${targetClass.name}` : '🌐 Все классы'}
                      </span>
                    </span>

                    <button
                      onClick={() => handleToggleConstraint(c.id)}
                      className={`rounded-lg px-2.5 py-1 text-[11px] font-extrabold transition-all ${
                        c.enabled
                          ? 'bg-emerald-600 text-white shadow-xs'
                          : 'bg-slate-200 text-slate-700'
                      }`}
                    >
                      {c.enabled ? '✓ Активно' : 'Отключено'}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* SECTION 3: System Data Reset & Full Wipe */}
      <div className="rounded-2xl border border-rose-200 bg-rose-50/20 p-6 shadow-xs space-y-4">
        <div className="flex items-center gap-3 border-b border-rose-100 pb-4">
          <div className="rounded-xl bg-rose-100 p-2 text-rose-600">
            <Trash2 className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-lg font-extrabold text-slate-800">
              Управление данными и полная очистка
            </h2>
            <p className="text-xs text-slate-500">
              Сброс параметров или удаление всех занесенных списков школы для заполнения с нуля.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-4 pt-2">
          <div>
            <p className="text-xs font-bold text-slate-700">Полное обнуление списков</p>
            <p className="text-xs text-slate-500 mt-0.5">
              Текущий состав: классов ({classes.length}), учителей ({state.teachers.length}), кабинетов ({state.rooms.length}), учебных планов ({state.curriculum.length}), уроков ({state.schedule.length}) и правил ({constraints.length}).
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            {onResetToDemo && (
              <button
                type="button"
                onClick={onResetToDemo}
                className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 transition-all active:scale-95"
              >
                🔄 Сбросить к образцу школы
              </button>
            )}

            {onClearAll && (
              <button
                type="button"
                onClick={onClearAll}
                className="rounded-xl bg-rose-600 px-4 py-2 text-xs font-bold text-white shadow-xs hover:bg-rose-700 transition-all active:scale-95 flex items-center gap-1.5"
              >
                <Trash2 className="h-4 w-4" />
                <span>Полная очистка (Обнулить всё)</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
