import React, { useState } from 'react';
import { AppState, Subject, CurriculumItem, SchoolClass, RoomType, Teacher } from '../types/schedule';
import { ROOM_TYPE_META, COLOR_PALETTE } from '../utils/constants';
import { autoAssignTeachers } from '../utils/staffingUtils';
import { getStandardCurriculumForGrade } from '../utils/defaultData';
import { Plus, BookOpen, Sparkles, Copy, Trash2, Sun, Moon, Users, School, CheckCircle2, Info } from 'lucide-react';

interface CurriculumManagerProps {
  state: AppState;
  onUpdateSubjects: (subjects: Subject[]) => void;
  onUpdateCurriculum: (curriculum: CurriculumItem[]) => void;
  onDeleteSubject?: (subjectId: string) => void;
  onNotify?: (message: string, type?: 'success' | 'error' | 'warning' | 'info') => void;
}

export const CurriculumManager: React.FC<CurriculumManagerProps> = ({
  state,
  onUpdateSubjects,
  onUpdateCurriculum,
  onDeleteSubject,
  onNotify,
}) => {
  const { classes, subjects, teachers, rooms, curriculum } = state;

  const [selectedClassId, setSelectedClassId] = useState<string>(classes[0]?.id || '');
  const [filterGrade, setFilterGrade] = useState<number | 'all'>('all');
  const [filterShift, setFilterShift] = useState<'all' | 1 | 2>('all');
  const [showAddSubjectModal, setShowAddSubjectModal] = useState<boolean>(false);

  // New subject state
  const [newSubjName, setNewSubjName] = useState<string>('');
  const [newSubjShort, setNewSubjShort] = useState<string>('');
  const [newSubjRoomType, setNewSubjRoomType] = useState<RoomType>('regular');
  const [newSubjMaxPerDay, setNewSubjMaxPerDay] = useState<number>(1);
  const [newSubjColor, setNewSubjColor] = useState<string>(COLOR_PALETTE[0]);
  const [newSubjDivided, setNewSubjDivided] = useState<boolean>(false);

  const duplicateSubject = subjects.some(
    (subject) => subject.name.trim().toLowerCase() === newSubjName.trim().toLowerCase()
  );
  const subjectNameError = !newSubjName.trim()
    ? 'Укажите название предмета'
    : duplicateSubject
    ? 'Такой предмет уже существует'
    : '';

  const currentClass = classes.find((c) => c.id === selectedClassId) || classes[0];
  const isPrimary = currentClass ? currentClass.grade <= 4 : false;

  // Current class curriculum entries
  const currentClassItems = curriculum.filter((c) => c.classId === currentClass?.id);
  const totalWeeklyHours = currentClassItems.reduce((sum, item) => sum + item.hoursPerWeek, 0);

  // Handle hours change
  const handleHoursChange = (subjectId: string, hours: number) => {
    if (!currentClass) return;
    const clampedHours = Math.max(0, Math.min(15, hours));

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
      const isDividedByDefault = subjectId === 'sub_eng' || subjectId === 'sub_inf';
      let defaultTeacherId: string | undefined;
      let defaultTeacherId2: string | undefined;

      if (subjectId === 'sub_primary' || (isPrimary && subjectId === 'sub_primary')) {
        defaultTeacherId = currentClass.homeroomTeacherId || `tch_homeroom_${currentClass.id}`;
      } else {
        const qualified = teachers.filter((t) => t.subjectIds.includes(subjectId));
        const sameShift = qualified.filter((t) => t.shift === currentClass.shift || !t.shift);
        defaultTeacherId = (sameShift[0] || qualified[0])?.id;
        if (isDividedByDefault && (sameShift.length > 1 || qualified.length > 1)) {
          defaultTeacherId2 = (sameShift[1] || qualified[1] || sameShift[0] || qualified[0])?.id;
        }
      }

      updated.push({
        id: `cur_${currentClass.id}_${subjectId}`,
        classId: currentClass.id,
        subjectId,
        hoursPerWeek: clampedHours,
        teacherId: defaultTeacherId,
        teacherId2: defaultTeacherId2,
        dividedIntoGroups: isDividedByDefault,
      });
    }

    onUpdateCurriculum(updated);
  };

  // Handle group division toggle
  const handleToggleDivided = (subjectId: string, divided: boolean) => {
    if (!currentClass) return;
    const updated = curriculum.map((c) => {
      if (c.classId === currentClass.id && c.subjectId === subjectId) {
        let t2 = c.teacherId2;
        if (divided && !t2) {
          const qualified = teachers.filter((t) => t.subjectIds.includes(subjectId) && t.id !== c.teacherId);
          t2 = qualified[0]?.id || c.teacherId;
        }
        return {
          ...c,
          dividedIntoGroups: divided,
          teacherId2: divided ? t2 : undefined,
          preferredRoomId2: divided ? c.preferredRoomId2 : undefined,
        };
      }
      return c;
    });
    onUpdateCurriculum(updated);
  };

  // Handle teacher 1 assignment change
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

  // Handle teacher 2 assignment change
  const handleTeacher2Change = (subjectId: string, teacherId2: string) => {
    if (!currentClass) return;
    const updated = curriculum.map((c) => {
      if (c.classId === currentClass.id && c.subjectId === subjectId) {
        return { ...c, teacherId2 };
      }
      return c;
    });
    onUpdateCurriculum(updated);
  };

  // Handle room 1 assignment change
  const handleRoomChange = (subjectId: string, preferredRoomId: string) => {
    if (!currentClass) return;
    const updated = curriculum.map((c) => {
      if (c.classId === currentClass.id && c.subjectId === subjectId) {
        return { ...c, preferredRoomId: preferredRoomId || undefined };
      }
      return c;
    });
    onUpdateCurriculum(updated);
  };

  // Handle room 2 assignment change
  const handleRoom2Change = (subjectId: string, preferredRoomId2: string) => {
    if (!currentClass) return;
    const updated = curriculum.map((c) => {
      if (c.classId === currentClass.id && c.subjectId === subjectId) {
        return { ...c, preferredRoomId2: preferredRoomId2 || undefined };
      }
      return c;
    });
    onUpdateCurriculum(updated);
  };

  // Apply primary school standard curriculum for 1-4 grades
  const applyPrimaryStandard = () => {
    if (!currentClass || !isPrimary) return;
    const std = getStandardCurriculumForGrade(currentClass.grade);
    let updated = curriculum.filter((c) => c.classId !== currentClass.id);

    std.forEach((s) => {
      let tId: string | undefined;
      let tId2: string | undefined;
      if (s.subjectId === 'sub_primary') {
        tId = currentClass.homeroomTeacherId || `tch_homeroom_${currentClass.id}`;
      } else {
        const q = teachers.filter((t) => t.subjectIds.includes(s.subjectId));
        const sameShift = q.filter((t) => t.shift === currentClass.shift || !t.shift);
        tId = (sameShift[0] || q[0])?.id;
        if (s.dividedIntoGroups && (sameShift.length > 1 || q.length > 1)) {
          tId2 = (sameShift[1] || q[1] || sameShift[0] || q[0])?.id;
        }
      }
      updated.push({
        id: `cur_${currentClass.id}_${s.subjectId}`,
        classId: currentClass.id,
        subjectId: s.subjectId,
        hoursPerWeek: s.hours,
        teacherId: tId,
        teacherId2: tId2,
        dividedIntoGroups: Boolean(s.dividedIntoGroups),
      });
    });

    onUpdateCurriculum(updated);
    onNotify?.(
      `Для класса ${currentClass.name} установлен стандарт начальной школы: классный руководитель ведёт все базовые уроки, ин. яз с делением на 2 группы.`,
      'success'
    );
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
        let tId = item.teacherId;
        // If it was primary school subject or homeroom teacher, assign target class's homeroom
        if (item.subjectId === 'sub_primary' || tId === currentClass.homeroomTeacherId || tId === `tch_homeroom_${currentClass.id}`) {
          tId = targetClass.homeroomTeacherId || `tch_homeroom_${targetClass.id}`;
        }
        updated.push({
          id: `cur_${targetClass.id}_${item.subjectId}`,
          classId: targetClass.id,
          subjectId: item.subjectId,
          hoursPerWeek: item.hoursPerWeek,
          teacherId: tId,
          teacherId2: item.teacherId2,
          dividedIntoGroups: item.dividedIntoGroups,
          preferredRoomId: item.preferredRoomId,
          preferredRoomId2: item.preferredRoomId2,
        });
      });
    });

    onUpdateCurriculum(updated);
    onNotify?.(
      `Учебный план ${currentClass.name} скопирован для параллели: ${sameGradeClasses.map((c) => c.name).join(', ')}`,
      'success'
    );
  };

  // Auto assign qualified teachers adhering to pairing rules
  const handleAutoAssignTeachers = () => {
    const updated = autoAssignTeachers(curriculum, classes, subjects, teachers);
    onUpdateCurriculum(updated);
    onNotify?.(
      'Учителя распределены: классные руководители начальной школы закреплены за уроками 1-4 кл, иностранные языки разделены по группам!',
      'success'
    );
  };

  // Create custom subject
  const handleCreateSubject = (e: React.FormEvent) => {
    e.preventDefault();
    if (subjectNameError) return;

    const newSubject: Subject = {
      id: `sub_custom_${Date.now()}`,
      name: newSubjName.trim(),
      shortName: newSubjShort.trim() || newSubjName.slice(0, 7),
      color: newSubjColor,
      requiredRoomType: newSubjRoomType,
      maxPerDay: newSubjMaxPerDay,
      isCustom: true,
    };

    onUpdateSubjects([...subjects, newSubject]);

    // If a class is currently selected and divided is true, auto-add with 1 hour
    if (currentClass) {
      const qualified = teachers.filter((t) => t.subjectIds.includes(newSubject.id));
      const newCurItem: CurriculumItem = {
        id: `cur_${currentClass.id}_${newSubject.id}`,
        classId: currentClass.id,
        subjectId: newSubject.id,
        hoursPerWeek: 1,
        teacherId: qualified[0]?.id,
        teacherId2: newSubjDivided ? qualified[1]?.id || qualified[0]?.id : undefined,
        dividedIntoGroups: newSubjDivided,
      };
      onUpdateCurriculum([...curriculum, newCurItem]);
    }

    setShowAddSubjectModal(false);
    setNewSubjName('');
    setNewSubjShort('');
    setNewSubjDivided(false);
    onNotify?.(`Предмет «${newSubject.name}» успешно создан и добавлен в учебный план`, 'success');
  };

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-xs">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <BookOpen className="h-6 w-6 text-indigo-600" />
              <h2 className="text-xl font-extrabold text-slate-800">
                Учебный план и распределение предметов ({subjects.length} предметов)
              </h2>
            </div>
            <p className="mt-1 text-xs text-slate-500">
              Настройка недельной нагрузки классов, деление на подгруппы (английский, информатика), привязка классных руководителей для 1–4 классов и профильных педагогов.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowAddSubjectModal(true)}
              className="flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-xs font-bold text-white shadow-xs transition-all hover:bg-indigo-700 active:scale-95"
            >
              <Plus className="h-4 w-4" />
              Добавить предмет в учебный план
            </button>
          </div>
        </div>
      </div>

      {/* Class selector & actions */}
      <div className="flex flex-col gap-3 rounded-2xl bg-white p-4 shadow-xs border border-slate-200">
        {/* Filters by Shift and Grade */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-3">
          <div className="flex flex-wrap items-center gap-2">
            {/* Shift filter */}
            <div className="flex items-center gap-1 rounded-lg bg-slate-100 p-0.5 text-xs">
              <button
                onClick={() => setFilterShift('all')}
                className={`rounded-md px-2 py-0.5 font-semibold transition-all ${
                  filterShift === 'all' ? 'bg-white text-slate-900 shadow-2xs' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Все ({classes.length})
              </button>
              <button
                onClick={() => setFilterShift(1)}
                className={`flex items-center gap-1 rounded-md px-2 py-0.5 font-semibold transition-all ${
                  filterShift === 1 ? 'bg-white text-blue-800 shadow-2xs' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Sun className="h-3 w-3 text-blue-600" />
                1-я см. ({classes.filter((c) => c.shift === 1).length})
              </button>
              <button
                onClick={() => setFilterShift(2)}
                className={`flex items-center gap-1 rounded-md px-2 py-0.5 font-semibold transition-all ${
                  filterShift === 2 ? 'bg-white text-amber-800 shadow-2xs' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Moon className="h-3 w-3 text-amber-600" />
                2-я см. ({classes.filter((c) => c.shift === 2).length})
              </button>
            </div>

            {/* Grade filter */}
            <div className="flex items-center gap-1 overflow-x-auto rounded-lg bg-slate-100 p-0.5 text-xs">
              <button
                onClick={() => setFilterGrade('all')}
                className={`rounded-md px-2 py-0.5 font-semibold transition-all ${
                  filterGrade === 'all' ? 'bg-white text-slate-900 shadow-2xs' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Все параллели
              </button>
              {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11].map((g) => (
                <button
                  key={g}
                  onClick={() => setFilterGrade(g)}
                  className={`rounded-md px-2 py-0.5 font-semibold transition-all ${
                    filterGrade === g
                      ? g <= 4
                        ? 'bg-sky-600 text-white shadow-2xs'
                        : 'bg-indigo-600 text-white shadow-2xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {g} кл {g <= 4 ? '🎒' : ''}
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleAutoAssignTeachers}
              className="flex items-center gap-1.5 rounded-xl border border-indigo-200 bg-indigo-50/50 px-3 py-1.5 text-xs font-bold text-indigo-700 hover:bg-indigo-100/50 shadow-2xs transition-all"
              title="Автоматически распределить учителей по предметам и параллелям"
            >
              <Sparkles className="h-3.5 w-3.5 text-indigo-600" />
              Авто-назначение учителей
            </button>
          </div>
        </div>

        {/* Class selection buttons */}
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <label className="text-xs font-bold text-slate-600 shrink-0">Класс:</label>
            <div className="flex flex-wrap gap-1">
              {classes
                .filter((c) => {
                  if (filterShift !== 'all' && c.shift !== filterShift) return false;
                  if (filterGrade !== 'all' && c.grade !== filterGrade) return false;
                  return true;
                })
                .map((cls) => (
                  <button
                    key={cls.id}
                    onClick={() => setSelectedClassId(cls.id)}
                    className={`flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-bold transition-all ${
                      cls.id === currentClass?.id
                        ? cls.grade <= 4
                          ? 'bg-sky-600 text-white shadow-xs'
                          : 'bg-indigo-600 text-white shadow-xs'
                        : cls.grade <= 4
                        ? 'bg-sky-50 text-sky-900 border border-sky-200 hover:bg-sky-100'
                        : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                    }`}
                  >
                    <span>{cls.name}</span>
                    <span
                      className={`text-[9px] px-1 py-0.2 rounded font-normal ${
                        cls.id === currentClass?.id
                          ? cls.shift === 2
                            ? 'bg-amber-400 text-amber-950 font-bold'
                            : 'bg-white/20 text-white'
                          : cls.shift === 2
                          ? 'bg-amber-100 text-amber-800'
                          : 'bg-slate-200 text-slate-600'
                      }`}
                    >
                      {cls.shift} см.
                    </span>
                  </button>
                ))}
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 rounded-xl bg-indigo-50 px-3 py-1.5 text-xs font-bold text-indigo-900 border border-indigo-100">
              <span>Итоговая нагрузка {currentClass?.name}:</span>
              <span className="text-sm font-black">{totalWeeklyHours} ч/нед</span>
            </div>

            {currentClass && isPrimary && (
              <button
                onClick={applyPrimaryStandard}
                className="flex items-center gap-1.5 rounded-xl border border-sky-300 bg-sky-50 px-3 py-1.5 text-xs font-bold text-sky-800 shadow-2xs hover:bg-sky-100 transition-all"
                title="Сбросить на стандарт начальной школы (Уроки нач. школы + Иностр. яз + Физ-ра)"
              >
                <School className="h-3.5 w-3.5 text-sky-600" />
                Стандарт нач. школы
              </button>
            )}

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
          </div>
        </div>
      </div>

      {/* Primary School Special Rule Info Box */}
      {isPrimary && (
        <div className="flex items-start gap-3 rounded-2xl border border-sky-200 bg-linear-to-r from-sky-50 via-blue-50 to-indigo-50 p-4 text-xs text-sky-950 shadow-xs">
          <div className="rounded-xl bg-sky-600 p-2 text-white shrink-0 mt-0.5 shadow-2xs">
            <School className="h-4 w-4" />
          </div>
          <div className="space-y-1">
            <div className="font-extrabold text-sky-900 flex items-center gap-2">
              <span>Правило начальной школы (1–4 классы)</span>
              <span className="rounded-full bg-sky-200/80 px-2 py-0.5 text-[10px] font-bold text-sky-800">
                Класс: {currentClass?.name}
              </span>
            </div>
            <p className="text-slate-600 leading-relaxed">
              У 1–4 классов классный руководитель ведёт все базовые предметы («Уроки начальной школы»). Иностранный язык и физкультура ведутся профильными преподавателями. Вы можете включать и отключать <strong className="text-slate-800">деление на группы</strong> для каждого предмета прямо в таблице ниже.
            </p>
          </div>
        </div>
      )}

      {/* Curriculum Matrix Table */}
      <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-xs">
        <table className="w-full border-collapse text-left text-xs">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50">
              <th className="p-3 font-bold text-slate-600">Предмет</th>
              <th className="p-3 font-bold text-slate-600">Кабинет</th>
              <th className="p-3 font-bold text-slate-600 text-center">Часов в неделю</th>
              <th className="p-3 font-bold text-slate-600 text-center">Деление на группы</th>
              <th className="p-3 font-bold text-slate-600">Преподаватели и кабинеты групп</th>
              {onDeleteSubject && <th className="p-3 font-bold text-slate-600 text-center w-16">Удалить</th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {subjects.map((sub) => {
              const currItem = currentClassItems.find((c) => c.subjectId === sub.id);
              const hours = currItem?.hoursPerWeek || 0;
              const isDivided = Boolean(currItem?.dividedIntoGroups);
              const meta = ROOM_TYPE_META[sub.requiredRoomType];

              const isPrimarySubject = sub.id === 'sub_primary';
              const classShift = currentClass?.shift || 1;

              return (
                <tr
                  key={sub.id}
                  className={`transition-colors ${
                    hours > 0 ? (isPrimarySubject ? 'bg-sky-50/30 hover:bg-sky-50/60' : 'hover:bg-slate-50/50') : 'opacity-60 hover:opacity-100'
                  }`}
                >
                  {/* Subject Name & Color */}
                  <td className="p-3">
                    <div className="flex items-center gap-2">
                      <div
                        className="h-3.5 w-3.5 rounded-full shrink-0 shadow-2xs"
                        style={{ backgroundColor: sub.color || '#6366f1' }}
                      />
                      <div>
                        <div className="font-bold text-slate-800 flex items-center gap-1.5">
                          <span>{sub.name}</span>
                          {isPrimarySubject && (
                            <span className="rounded-full bg-sky-100 text-sky-800 px-1.5 py-0.2 text-[10px] font-bold">
                              1–4 кл
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-2 text-[11px] text-slate-400">
                          <span>{sub.shortName}</span>
                          {sub.isCustom && (
                            <span className="rounded bg-indigo-100 px-1 py-0.2 text-[9px] font-bold text-indigo-700">
                              Собственный
                            </span>
                          )}
                        </div>
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

                  {/* Hours Stepper */}
                  <td className="p-3 text-center">
                    <div className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-slate-50 p-1">
                      <button
                        onClick={() => handleHoursChange(sub.id, hours - 1)}
                        className="h-6 w-6 rounded-lg bg-white border border-slate-200 text-xs font-bold text-slate-600 hover:bg-slate-100"
                        title="Уменьшить часы"
                      >
                        -
                      </button>
                      <span className={`w-8 text-center text-sm font-extrabold ${hours > 0 ? 'text-indigo-700' : 'text-slate-400'}`}>
                        {hours}
                      </span>
                      <button
                        onClick={() => handleHoursChange(sub.id, hours + 1)}
                        className="h-6 w-6 rounded-lg bg-white border border-slate-200 text-xs font-bold text-slate-600 hover:bg-slate-100"
                        title="Увеличить часы"
                      >
                        +
                      </button>
                    </div>
                  </td>

                  {/* Group Division Toggle */}
                  <td className="p-3 text-center">
                    {hours > 0 ? (
                      <button
                        type="button"
                        onClick={() => handleToggleDivided(sub.id, !isDivided)}
                        className={`inline-flex items-center gap-1.5 rounded-xl px-2.5 py-1.5 text-xs font-bold border transition-all ${
                          isDivided
                            ? 'bg-amber-500 text-white border-amber-600 shadow-xs'
                            : 'bg-slate-100 text-slate-600 border-slate-200 hover:bg-slate-200'
                        }`}
                        title={isDivided ? 'Класс делится на 2 подгруппы (параллельно 2 учителя)' : 'Весь класс занимается вместе (1 учитель)'}
                      >
                        <Users className="h-3.5 w-3.5" />
                        <span>{isDivided ? '2 подгруппы' : 'Весь класс'}</span>
                      </button>
                    ) : (
                      <span className="text-slate-300">—</span>
                    )}
                  </td>

                  {/* Teacher and Room Selectors */}
                  <td className="p-3">
                    {hours > 0 ? (
                      <div className="space-y-2">
                        {/* Group 1 / Main Teacher */}
                        <div className="flex flex-wrap items-center gap-2">
                          {isDivided && (
                            <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold text-amber-900 shrink-0">
                              Группа 1:
                            </span>
                          )}
                          <select
                            value={currItem?.teacherId || ''}
                            onChange={(e) => handleTeacherChange(sub.id, e.target.value)}
                            className="rounded-lg border border-slate-300 bg-white px-2 py-1 text-xs font-medium text-slate-800 shadow-2xs focus:border-indigo-500 focus:outline-hidden"
                          >
                            <option value="">⚡ Автораспределение (свободный учитель)</option>
                            <option value="homeroom" className="font-bold text-purple-800 bg-purple-50">
                              🌟 Классный руководитель ({currentClass?.name})
                            </option>
                            {teachers
                              .filter((t) => t.subjectIds.includes(sub.id))
                              .map((tch) => (
                                <option key={tch.id} value={tch.id}>
                                  {tch.name} {tch.shift ? `(${tch.shift} см)` : ''}
                                </option>
                              ))}
                          </select>

                          {/* Room for Group 1 */}
                          {rooms.length > 0 && (
                            <select
                              value={currItem?.preferredRoomId || ''}
                              onChange={(e) => handleRoomChange(sub.id, e.target.value)}
                              className="rounded-lg border border-slate-300 bg-white px-2 py-1 text-xs text-slate-700 shadow-2xs focus:border-indigo-500 focus:outline-hidden"
                              title="Предпочтительный кабинет для группы 1"
                            >
                              <option value="">Кабинет: авто</option>
                              {rooms.map((r) => (
                                <option key={r.id} value={r.id}>
                                  каб. {r.name} ({ROOM_TYPE_META[r.type]?.label || r.type})
                                </option>
                              ))}
                            </select>
                          )}
                        </div>

                        {/* Group 2 Teacher and Room if Divided */}
                        {isDivided && (
                          <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-dashed border-slate-200">
                            <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold text-amber-900 shrink-0">
                              Группа 2:
                            </span>
                            <select
                              value={currItem?.teacherId2 || ''}
                              onChange={(e) => handleTeacher2Change(sub.id, e.target.value)}
                              className="rounded-lg border border-amber-300 bg-amber-50/50 px-2 py-1 text-xs font-medium text-amber-950 shadow-2xs focus:border-amber-500 focus:outline-hidden"
                            >
                              <option value="">⚡ 2-й свободный учитель предмета</option>
                              {teachers
                                .filter((t) => t.subjectIds.includes(sub.id))
                                .map((tch) => (
                                  <option key={tch.id} value={tch.id}>
                                    {tch.name} {tch.shift ? `(${tch.shift} см)` : ''}
                                  </option>
                                ))}
                            </select>

                            {/* Room for Group 2 */}
                            {rooms.length > 0 && (
                              <select
                                value={currItem?.preferredRoomId2 || ''}
                                onChange={(e) => handleRoom2Change(sub.id, e.target.value)}
                                className="rounded-lg border border-slate-300 bg-white px-2 py-1 text-xs text-slate-700 shadow-2xs focus:border-indigo-500 focus:outline-hidden"
                                title="Предпочтительный кабинет для группы 2"
                              >
                                <option value="">Кабинет 2: авто</option>
                                {rooms.map((r) => (
                                  <option key={r.id} value={r.id}>
                                    каб. {r.name} ({ROOM_TYPE_META[r.type]?.label || r.type})
                                  </option>
                                ))}
                              </select>
                            )}
                          </div>
                        )}
                      </div>
                    ) : (
                      <span className="text-slate-300">—</span>
                    )}
                  </td>

                  {/* Delete Subject Button */}
                  {onDeleteSubject && (
                    <td className="p-3 text-center">
                      {sub.isCustom && (
                        <button
                          onClick={() => onDeleteSubject(sub.id)}
                          className="rounded-lg p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600 transition-colors"
                          title={`Удалить предмет «${sub.name}»`}
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      )}
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* MODAL: Add Custom Subject / Lesson */}
      {showAddSubjectModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs">
          <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-100 pb-4">
              <div>
                <h3 className="text-lg font-bold text-slate-800">
                  Добавление предмета в учебный план
                </h3>
                <p className="text-xs text-slate-500">
                  Создайте спецкурс, факультатив или профильную дисциплину с настройкой деления на группы
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
                  aria-invalid={Boolean(subjectNameError)}
                  className={`w-full rounded-xl border p-2.5 text-sm focus:outline-hidden ${
                    subjectNameError
                      ? 'border-rose-400 focus:border-rose-500'
                      : 'border-slate-300 focus:border-indigo-500'
                  }`}
                />
                {subjectNameError && (
                  <p className="mt-1 text-[11px] font-medium text-rose-600">{subjectNameError}</p>
                )}
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

              {/* Group Division Checkbox */}
              <div className="rounded-xl border border-indigo-100 bg-indigo-50/60 p-3">
                <label className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={newSubjDivided}
                    onChange={(e) => setNewSubjDivided(e.target.checked)}
                    className="h-4 w-4 rounded text-indigo-600 focus:ring-indigo-500 border-slate-300"
                  />
                  <div>
                    <div className="text-xs font-bold text-indigo-900 flex items-center gap-1.5">
                      <Users className="h-3.5 w-3.5 text-indigo-600" />
                      <span>Делить класс на 2 подгруппы</span>
                    </div>
                    <div className="text-[11px] text-indigo-700">
                      Урок будет проводиться одновременно двумя учителями в разных кабинетах (например, для языков или информатики)
                    </div>
                  </div>
                </label>
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
                  disabled={Boolean(subjectNameError)}
                  className="rounded-xl bg-indigo-600 px-5 py-2 text-xs font-bold text-white shadow-xs hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
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
