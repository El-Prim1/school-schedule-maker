import React, { useState } from 'react';
import { AppState, Subject, CurriculumItem, SchoolClass, RoomType, Teacher } from '../types/schedule';
import { ROOM_TYPE_META, COLOR_PALETTE } from '../utils/constants';
import { Plus, BookOpen, Sparkles, Copy, Check, Trash2, Sliders, ShieldCheck } from 'lucide-react';

interface CurriculumManagerProps {
  state: AppState;
  onUpdateSubjects: (subjects: Subject[]) => void;
  onUpdateCurriculum: (curriculum: CurriculumItem[]) => void;
}

export const CurriculumManager: React.FC<CurriculumManagerProps> = ({
  state,
  onUpdateSubjects,
  onUpdateCurriculum,
}) => {
  const { classes, subjects, teachers, rooms, curriculum } = state;

  const [selectedClassId, setSelectedClassId] = useState<string>(classes[0]?.id || '');
  const [showAddSubjectModal, setShowAddSubjectModal] = useState<boolean>(false);

  // New subject state
  const [newSubjName, setNewSubjName] = useState<string>('');
  const [newSubjShort, setNewSubjShort] = useState<string>('');
  const [newSubjRoomType, setNewSubjRoomType] = useState<RoomType>('regular');
  const [newSubjMaxPerDay, setNewSubjMaxPerDay] = useState<number>(1);
  const [newSubjDifficulty, setNewSubjDifficulty] = useState<number>(7);
  const [newSubjColor, setNewSubjColor] = useState<string>(COLOR_PALETTE[0]);

  const currentClass = classes.find((c) => c.id === selectedClassId) || classes[0];

  // Current class curriculum entries
  const currentClassItems = curriculum.filter((c) => c.classId === currentClass?.id);
  const totalWeeklyHours = currentClassItems.reduce((sum, item) => sum + item.hoursPerWeek, 0);

  // Handle hours change
  const handleHoursChange = (subjectId: string, hours: number) => {
    if (!currentClass) return;
    const clampedHours = Math.max(0, Math.min(10, hours));

    const existingIndex = curriculum.findIndex(
      (c) => c.classId === currentClass.id && c.subjectId === subjectId
    );

    let updated = [...curriculum];
    if (clampedHours === 0) {
      // Remove item
      updated = updated.filter((c) => !(c.classId === currentClass.id && c.subjectId === subjectId));
    } else if (existingIndex >= 0) {
      updated[existingIndex] = {
        ...updated[existingIndex],
        hoursPerWeek: clampedHours,
      };
    } else {
      // Find qualified teacher
      const qualified = teachers.find((t) => t.subjectIds.includes(subjectId));
      updated.push({
        id: `cur_${currentClass.id}_${subjectId}`,
        classId: currentClass.id,
        subjectId,
        hoursPerWeek: clampedHours,
        teacherId: qualified?.id,
      });
    }

    onUpdateCurriculum(updated);
  };

  // Handle teacher assignment change
  const handleTeacherChange = (subjectId: string, teacherId: string) => {
    if (!currentClass) return;
    const updated = curriculum.map((c) => {
      if (c.classId === currentClass.id && c.subjectId === subjectId) {
        return { ...c, teacherId };
      }
      return c;
    });
    onUpdateCurriculum(updated);
  };

  // Copy plan from this class to all classes of same grade
  const copyPlanToParallel = () => {
    if (!currentClass) return;
    const sameGradeClasses = classes.filter(
      (c) => c.grade === currentClass.grade && c.id !== currentClass.id
    );

    let updated = [...curriculum];
    sameGradeClasses.forEach((targetClass) => {
      // Remove existing for target
      updated = updated.filter((c) => c.classId !== targetClass.id);
      // Copy from current class
      currentClassItems.forEach((item) => {
        updated.push({
          id: `cur_${targetClass.id}_${item.subjectId}`,
          classId: targetClass.id,
          subjectId: item.subjectId,
          hoursPerWeek: item.hoursPerWeek,
          teacherId: item.teacherId,
        });
      });
    });

    onUpdateCurriculum(updated);
    alert(`Учебный план класса ${currentClass.name} успешно скопирован для параллели: ${sameGradeClasses.map((c) => c.name).join(', ')}`);
  };

  // Auto assign qualified teachers
  const handleAutoAssignTeachers = () => {
    const updated = curriculum.map((item) => {
      if (item.teacherId) return item;
      const qualified = teachers.filter((t) => t.subjectIds.includes(item.subjectId));
      return {
        ...item,
        teacherId: qualified[0]?.id,
      };
    });
    onUpdateCurriculum(updated);
  };

  // Create custom subject
  const handleCreateSubject = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSubjName.trim()) return;

    const newSubject: Subject = {
      id: `sub_custom_${Date.now()}`,
      name: newSubjName.trim(),
      shortName: newSubjShort.trim() || newSubjName.slice(0, 7),
      color: newSubjColor,
      requiredRoomType: newSubjRoomType,
      maxPerDay: newSubjMaxPerDay,
      difficulty: newSubjDifficulty,
      isCustom: true,
    };

    onUpdateSubjects([...subjects, newSubject]);
    setShowAddSubjectModal(false);
    setNewSubjName('');
    setNewSubjShort('');
  };

  const subjectMap = new Map(subjects.map((s) => [s.id, s]));

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-xs">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <BookOpen className="h-6 w-6 text-indigo-600" />
              <h2 className="text-xl font-extrabold text-slate-800">
                Единый учебный план и предметы ({subjects.length} предметов)
              </h2>
            </div>
            <p className="mt-1 text-xs text-slate-500">
              Настройка недельной нагрузки классов, привязка преподавателей и добавление собственных профильных предметов.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowAddSubjectModal(true)}
              className="flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-xs font-bold text-white shadow-xs transition-all hover:bg-indigo-700 active:scale-95"
            >
              <Plus className="h-4 w-4" />
              Добавить свой предмет
            </button>
          </div>
        </div>
      </div>

      {/* Class selector & actions */}
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl bg-white p-4 shadow-xs border border-slate-200">
        <div className="flex items-center gap-2">
          <label className="text-xs font-bold text-slate-600">Класс:</label>
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

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 rounded-xl bg-indigo-50 px-3 py-1.5 text-xs font-bold text-indigo-900 border border-indigo-100">
            <span>Итоговая нагрузка:</span>
            <span className="text-sm font-black">{totalWeeklyHours} ч/нед</span>
          </div>

          {currentClass && (
            <button
              onClick={copyPlanToParallel}
              className="flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 shadow-2xs hover:bg-slate-50 transition-all"
              title="Скопировать учебный план на все классы этой параллели"
            >
              <Copy className="h-3.5 w-3.5 text-slate-500" />
              Копировать на параллель {currentClass.grade} кл.
            </button>
          )}

          <button
            onClick={handleAutoAssignTeachers}
            className="flex items-center gap-1.5 rounded-xl border border-indigo-200 bg-indigo-50/50 px-3 py-1.5 text-xs font-bold text-indigo-700 hover:bg-indigo-100/50"
          >
            <Sparkles className="h-3.5 w-3.5" />
            Автоназначение учителей
          </button>
        </div>
      </div>

      {/* Curriculum Matrix Table */}
      <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-xs">
        <table className="w-full border-collapse text-left text-xs">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50">
              <th className="p-3 font-bold text-slate-600">Предмет</th>
              <th className="p-3 font-bold text-slate-600">Тип кабинета</th>
              <th className="p-3 font-bold text-slate-600">Сложность (СанПиН)</th>
              <th className="p-3 font-bold text-slate-600 text-center">Часов в неделю</th>
              <th className="p-3 font-bold text-slate-600">Преподаватель</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {subjects.map((sub) => {
              const currItem = currentClassItems.find((c) => c.subjectId === sub.id);
              const hours = currItem?.hoursPerWeek || 0;
              const meta = ROOM_TYPE_META[sub.requiredRoomType];

              // Qualified teachers for this subject
              const qualified = teachers.filter((t) => t.subjectIds.includes(sub.id));

              return (
                <tr key={sub.id} className="hover:bg-slate-50/50 transition-colors">
                  {/* Subject Name & Color */}
                  <td className="p-3">
                    <div className="flex items-center gap-2">
                      <div
                        className="h-3 w-3 rounded-full shrink-0"
                        style={{ backgroundColor: sub.color || '#6366f1' }}
                      />
                      <div>
                        <div className="font-bold text-slate-800">{sub.name}</div>
                        {sub.isCustom && (
                          <span className="rounded bg-indigo-100 px-1 py-0.2 text-[9px] font-bold text-indigo-700">
                            Собственный
                          </span>
                        )}
                      </div>
                    </div>
                  </td>

                  {/* Room Type badge */}
                  <td className="p-3">
                    <span
                      className={`inline-flex rounded-md px-2 py-0.5 text-[11px] font-semibold border ${
                        meta?.bg || 'bg-slate-100'
                      } ${meta?.text || 'text-slate-700'} ${meta?.border || 'border-slate-200'}`}
                    >
                      {meta?.label || 'Обычный'}
                    </span>
                  </td>

                  {/* Difficulty */}
                  <td className="p-3">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-slate-700">{sub.difficulty} б.</span>
                      <div className="h-1.5 w-16 rounded-full bg-slate-100">
                        <div
                          className="h-full rounded-full bg-indigo-500"
                          style={{ width: `${(sub.difficulty / 13) * 100}%` }}
                        />
                      </div>
                    </div>
                  </td>

                  {/* Hours Stepper */}
                  <td className="p-3 text-center">
                    <div className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-slate-50 p-1">
                      <button
                        onClick={() => handleHoursChange(sub.id, hours - 1)}
                        className="h-6 w-6 rounded-lg bg-white border border-slate-200 text-xs font-bold text-slate-600 hover:bg-slate-100"
                      >
                        -
                      </button>
                      <span className="w-8 text-center text-sm font-extrabold text-indigo-700">
                        {hours}
                      </span>
                      <button
                        onClick={() => handleHoursChange(sub.id, hours + 1)}
                        className="h-6 w-6 rounded-lg bg-white border border-slate-200 text-xs font-bold text-slate-600 hover:bg-slate-100"
                      >
                        +
                      </button>
                    </div>
                  </td>

                  {/* Teacher Selector */}
                  <td className="p-3">
                    {hours > 0 ? (
                      <select
                        value={currItem?.teacherId || ''}
                        onChange={(e) => handleTeacherChange(sub.id, e.target.value)}
                        className={`rounded-xl border px-3 py-1.5 text-xs font-medium shadow-2xs focus:border-indigo-500 focus:outline-hidden ${
                          !currItem?.teacherId
                            ? 'border-amber-300 bg-amber-50 text-amber-900 font-bold'
                            : 'border-slate-300 bg-white text-slate-800'
                        }`}
                      >
                        <option value="">Выберите учителя...</option>
                        {teachers.map((tch) => {
                          const isSpecialist = tch.subjectIds.includes(sub.id);
                          return (
                            <option key={tch.id} value={tch.id}>
                              {tch.name} {isSpecialist ? '★' : ''}
                            </option>
                          );
                        })}
                      </select>
                    ) : (
                      <span className="text-slate-300">—</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* MODAL: Add Custom Subject */}
      {showAddSubjectModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs">
          <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-100 pb-4">
              <div>
                <h3 className="text-lg font-bold text-slate-800">
                  Добавление собственного предмета
                </h3>
                <p className="text-xs text-slate-500">
                  Создайте спецкурс, факультатив или профильную дисциплину
                </p>
              </div>
              <button
                onClick={() => setShowAddSubjectModal(false)}
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateSubject} className="mt-4 space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Название предмета
                </label>
                <input
                  type="text"
                  required
                  placeholder="Например: Робототехника и 3D-моделирование"
                  value={newSubjName}
                  onChange={(e) => setNewSubjName(e.target.value)}
                  className="w-full rounded-xl border border-slate-300 p-2.5 text-sm focus:border-indigo-500 focus:outline-hidden"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Краткое обозначение (для карточек расписания)
                </label>
                <input
                  type="text"
                  placeholder="Робототех."
                  value={newSubjShort}
                  onChange={(e) => setNewSubjShort(e.target.value)}
                  className="w-full rounded-xl border border-slate-300 p-2.5 text-sm focus:border-indigo-500 focus:outline-hidden"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Требуемый профильный кабинет
                </label>
                <select
                  value={newSubjRoomType}
                  onChange={(e) => setNewSubjRoomType(e.target.value as RoomType)}
                  className="w-full rounded-xl border border-slate-300 p-2.5 text-sm focus:border-indigo-500 focus:outline-hidden"
                >
                  {Object.entries(ROOM_TYPE_META).map(([typeKey, meta]) => (
                    <option key={typeKey} value={typeKey}>
                      {meta.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Сложность СанПиН (1-13)
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={13}
                    value={newSubjDifficulty}
                    onChange={(e) => setNewSubjDifficulty(Number(e.target.value))}
                    className="w-full rounded-xl border border-slate-300 p-2.5 text-sm focus:border-indigo-500 focus:outline-hidden"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Максимум уроков в день
                  </label>
                  <select
                    value={newSubjMaxPerDay}
                    onChange={(e) => setNewSubjMaxPerDay(Number(e.target.value))}
                    className="w-full rounded-xl border border-slate-300 p-2.5 text-sm focus:border-indigo-500 focus:outline-hidden"
                  >
                    <option value={1}>1 урок в день</option>
                    <option value={2}>2 урока (спаренный)</option>
                  </select>
                </div>
              </div>

              {/* Color swatch */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-2">
                  Цветовая метка предмета:
                </label>
                <div className="flex flex-wrap gap-2">
                  {COLOR_PALETTE.map((color) => (
                    <button
                      key={color}
                      type="button"
                      onClick={() => setNewSubjColor(color)}
                      className={`h-8 w-8 rounded-full transition-transform ${
                        newSubjColor === color ? 'scale-125 ring-2 ring-indigo-500 ring-offset-2' : ''
                      }`}
                      style={{ backgroundColor: color }}
                    />
                  ))}
                </div>
              </div>

              <div className="mt-6 flex items-center justify-end gap-2 border-t border-slate-100 pt-4">
                <button
                  type="button"
                  onClick={() => setShowAddSubjectModal(false)}
                  className="rounded-xl border border-slate-300 px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100"
                >
                  Отмена
                </button>
                <button
                  type="submit"
                  className="rounded-xl bg-indigo-600 px-5 py-2 text-xs font-bold text-white shadow-xs hover:bg-indigo-700"
                >
                  Добавить предмет в учебный план
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
