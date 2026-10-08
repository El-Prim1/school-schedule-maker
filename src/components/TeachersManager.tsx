import React, { useState } from 'react';
import { AppState, Subject, Teacher } from '../types/schedule';
import {
  syncAnonymousTeachers,
  getSubjectStaffingMetrics,
  autoCalculateStaffing,
  STANDARD_TEACHER_HOURS,
} from '../utils/staffingUtils';
import { ROOM_TYPE_META } from '../utils/constants';
import {
  Users,
  Sparkles,
  Sun,
  Moon,
  CheckCircle2,
  AlertTriangle,
  DoorClosed,
  HelpCircle,
  Eye,
  Sliders,
  Award,
  Trash2,
} from 'lucide-react';

interface TeachersManagerProps {
  state: AppState;
  onUpdateTeachers: (teachers: Teacher[]) => void;
  onUpdateSubjects?: (subjects: Subject[]) => void;
  onDeleteSubject?: (subjectId: string) => void;
}

export const TeachersManager: React.FC<TeachersManagerProps> = ({
  state,
  onUpdateTeachers,
  onUpdateSubjects,
  onDeleteSubject,
}) => {
  const { subjects, classes, teachers, curriculum, rooms } = state;
  const [showRosterModal, setShowRosterModal] = useState(false);
  const [selectedTeacherForEdit, setSelectedTeacherForEdit] = useState<Teacher | null>(null);

  // Subject teachers only (excluding homeroom teachers)
  const subjectTeachers = teachers.filter((t) => !t.isHomeroom);

  // Total staffing metrics
  const totalShift1Teachers = subjects.reduce(
    (sum, s) => sum + (s.teachersShift1 !== undefined ? s.teachersShift1 : 1),
    0
  );
  const totalShift2Teachers = subjects.reduce(
    (sum, s) => sum + (s.teachersShift2 !== undefined ? s.teachersShift2 : 0),
    0
  );
  const totalSubjectTeachers = totalShift1Teachers + totalShift2Teachers;
  const totalHomeroomTeachers = classes.length;

  const handleUpdateSubjectCounts = (
    subjectId: string,
    shift1Count: number,
    shift2Count: number
  ) => {
    const updatedSubjects = subjects.map((s) => {
      if (s.id === subjectId) {
        return {
          ...s,
          teachersShift1: Math.max(0, shift1Count),
          teachersShift2: Math.max(0, shift2Count),
        };
      }
      return s;
    });

    if (onUpdateSubjects) {
      onUpdateSubjects(updatedSubjects);
    }
    const newTeachers = syncAnonymousTeachers(updatedSubjects, classes, teachers);
    onUpdateTeachers(newTeachers);
  };

  const handleAutoCalculateStaffing = () => {
    const optimizedSubjects = autoCalculateStaffing(curriculum, classes, subjects);
    if (onUpdateSubjects) {
      onUpdateSubjects(optimizedSubjects);
    }
    const newTeachers = syncAnonymousTeachers(optimizedSubjects, classes, teachers);
    onUpdateTeachers(newTeachers);
  };

  const handleUpdateTeacherHours = (teacherId: string, maxHours: number) => {
    const updated = teachers.map((t) =>
      t.id === teacherId ? { ...t, maxHoursPerWeek: Math.max(1, maxHours) } : t
    );
    onUpdateTeachers(updated);
    if (selectedTeacherForEdit && selectedTeacherForEdit.id === teacherId) {
      setSelectedTeacherForEdit({ ...selectedTeacherForEdit, maxHoursPerWeek: Math.max(1, maxHours) });
    }
  };

  const handleUpdateTeacherRoom = (teacherId: string, preferredRoomId: string) => {
    const updated = teachers.map((t) =>
      t.id === teacherId ? { ...t, preferredRoomId: preferredRoomId || undefined } : t
    );
    onUpdateTeachers(updated);
    if (selectedTeacherForEdit && selectedTeacherForEdit.id === teacherId) {
      setSelectedTeacherForEdit({
        ...selectedTeacherForEdit,
        preferredRoomId: preferredRoomId || undefined,
      });
    }
  };

  return (
    <div className="space-y-6">
      {/* Header card with anonymous explanation */}
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-xs">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="max-w-2xl">
            <div className="flex items-center gap-2">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600">
                <Users className="h-5 w-5" />
              </div>
              <h2 className="text-xl font-extrabold text-slate-800">
                Штат учителей по предметам (Анонимный режим)
              </h2>
            </div>
            <p className="mt-1.5 text-xs text-slate-600 leading-relaxed">
              Вам <strong>не нужно указывать ФИО преподавателей</strong>. Достаточно указать количество учителей по каждому предмету для 1-й и 2-й смены. Классные руководители также создаются и закрепляются за каждым классом автоматически.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <button
              onClick={handleAutoCalculateStaffing}
              className="flex items-center gap-1.5 rounded-xl bg-indigo-600 px-4 py-2.5 text-xs font-bold text-white shadow-xs hover:bg-indigo-700 active:scale-95 transition-all"
              title="Автоматически рассчитать нужное число учителей исходя из часов в учебном плане"
            >
              <Sparkles className="h-4 w-4" />
              Рассчитать штат по плану (1 клик)
            </button>

            <button
              onClick={() => setShowRosterModal(true)}
              className="flex items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-xs font-bold text-slate-700 hover:bg-slate-50 transition-all"
            >
              <Eye className="h-4 w-4 text-slate-500" />
              Список ставок ({subjectTeachers.length})
            </button>
          </div>
        </div>

        {/* Staffing summary metrics */}
        <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4 border-t border-slate-100 pt-4 text-xs">
          <div className="rounded-xl bg-slate-50 p-3">
            <div className="text-slate-500 font-medium">Всего учителей-предметников</div>
            <div className="text-lg font-black text-slate-800 mt-0.5">
              {totalSubjectTeachers} ставок
            </div>
          </div>

          <div className="rounded-xl bg-blue-50/70 p-3 text-blue-900 border border-blue-100">
            <div className="flex items-center gap-1 font-medium text-blue-700">
              <Sun className="h-3.5 w-3.5" /> 1-я смена
            </div>
            <div className="text-lg font-black text-blue-900 mt-0.5">
              {totalShift1Teachers} учителей
            </div>
          </div>

          <div className="rounded-xl bg-amber-50/70 p-3 text-amber-900 border border-amber-100">
            <div className="flex items-center gap-1 font-medium text-amber-700">
              <Moon className="h-3.5 w-3.5" /> 2-я смена
            </div>
            <div className="text-lg font-black text-amber-900 mt-0.5">
              {totalShift2Teachers} учителей
            </div>
          </div>

          <div className="rounded-xl bg-purple-50/70 p-3 text-purple-900 border border-purple-100">
            <div className="flex items-center gap-1 font-medium text-purple-700">
              <Award className="h-3.5 w-3.5" /> Классные руководители
            </div>
            <div className="text-lg font-black text-purple-900 mt-0.5">
              {totalHomeroomTeachers} (по 1 на класс)
            </div>
          </div>
        </div>
      </div>

      {/* Staffing by Subject Table */}
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xs">
        <div className="p-4 bg-slate-50/80 border-b border-slate-200 flex items-center justify-between">
          <h3 className="text-sm font-extrabold text-slate-800">
            Таблица укомплектованности штата по предметам
          </h3>
          <span className="text-xs text-slate-500">
            Стандартная ставка: ~{STANDARD_TEACHER_HOURS} ч/неделю
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left text-xs">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 font-bold text-slate-600">
                <th className="p-3.5">Предмет</th>
                <th className="p-3.5">Кабинет</th>
                <th className="p-3.5 text-center">Потребность по плану</th>
                <th className="p-3.5 text-center">Учителей в 1-ю смену</th>
                <th className="p-3.5 text-center">Учителей во 2-ю смену</th>
                <th className="p-3.5 text-center">Всего учителей</th>
                <th className="p-3.5 text-center">Статус укомплектованности</th>
                {onDeleteSubject && <th className="p-3.5 text-center w-12">Удалить</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {subjects.map((sub) => {
                const metrics = getSubjectStaffingMetrics(sub.id, curriculum, classes, subjects);
                const roomMeta = ROOM_TYPE_META[sub.requiredRoomType];

                return (
                  <tr key={sub.id} className="hover:bg-slate-50/50 transition-colors">
                    {/* Subject info */}
                    <td className="p-3.5 font-semibold text-slate-800">
                      <div className="flex items-center gap-2">
                        <span
                          className="h-3 w-3 rounded-full shrink-0"
                          style={{ backgroundColor: sub.color || '#6366f1' }}
                        />
                        <span>{sub.name}</span>
                        <span className="text-[10px] text-slate-400 font-normal">
                          ({sub.shortName})
                        </span>
                      </div>
                    </td>

                    {/* Room requirement */}
                    <td className="p-3.5">
                      <span
                        className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[10px] font-semibold border ${
                          roomMeta?.bg || 'bg-slate-100'
                        } ${roomMeta?.text || 'text-slate-700'} ${
                          roomMeta?.border || 'border-slate-200'
                        }`}
                      >
                        <DoorClosed className="h-3 w-3" />
                        {roomMeta?.shortLabel || 'Обычный'}
                      </span>
                    </td>

                    {/* Curriculum demand hours */}
                    <td className="p-3.5 text-center">
                      <div className="space-y-0.5 text-[11px]">
                        <div className="font-bold text-slate-800">{metrics.totalHours} ч/нед</div>
                        <div className="text-[10px] text-slate-500">
                          (1 см: {metrics.hoursShift1}ч | 2 см: {metrics.hoursShift2}ч)
                        </div>
                      </div>
                    </td>

                    {/* Shift 1 teachers counter */}
                    <td className="p-3.5 text-center">
                      <div className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-slate-50 p-1">
                        <button
                          onClick={() =>
                            handleUpdateSubjectCounts(
                              sub.id,
                              metrics.teachersShift1 - 1,
                              metrics.teachersShift2
                            )
                          }
                          disabled={metrics.teachersShift1 <= 0}
                          className="h-6 w-6 rounded-lg bg-white font-bold text-slate-600 shadow-2xs hover:bg-slate-100 disabled:opacity-30"
                        >
                          -
                        </button>
                        <span className="w-6 font-extrabold text-sm text-blue-900">
                          {metrics.teachersShift1}
                        </span>
                        <button
                          onClick={() =>
                            handleUpdateSubjectCounts(
                              sub.id,
                              metrics.teachersShift1 + 1,
                              metrics.teachersShift2
                            )
                          }
                          className="h-6 w-6 rounded-lg bg-white font-bold text-slate-600 shadow-2xs hover:bg-slate-100"
                        >
                          +
                        </button>
                      </div>
                      {metrics.hoursShift1 > 0 && metrics.teachersShift1 < metrics.recommended1 && (
                        <div className="text-[10px] text-amber-600 font-semibold mt-0.5">
                          Рек: {metrics.recommended1}
                        </div>
                      )}
                    </td>

                    {/* Shift 2 teachers counter */}
                    <td className="p-3.5 text-center">
                      <div className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-slate-50 p-1">
                        <button
                          onClick={() =>
                            handleUpdateSubjectCounts(
                              sub.id,
                              metrics.teachersShift1,
                              metrics.teachersShift2 - 1
                            )
                          }
                          disabled={metrics.teachersShift2 <= 0}
                          className="h-6 w-6 rounded-lg bg-white font-bold text-slate-600 shadow-2xs hover:bg-slate-100 disabled:opacity-30"
                        >
                          -
                        </button>
                        <span className="w-6 font-extrabold text-sm text-amber-900">
                          {metrics.teachersShift2}
                        </span>
                        <button
                          onClick={() =>
                            handleUpdateSubjectCounts(
                              sub.id,
                              metrics.teachersShift1,
                              metrics.teachersShift2 + 1
                            )
                          }
                          className="h-6 w-6 rounded-lg bg-white font-bold text-slate-600 shadow-2xs hover:bg-slate-100"
                        >
                          +
                        </button>
                      </div>
                      {metrics.hoursShift2 > 0 && metrics.teachersShift2 < metrics.recommended2 && (
                        <div className="text-[10px] text-amber-600 font-semibold mt-0.5">
                          Рек: {metrics.recommended2}
                        </div>
                      )}
                    </td>

                    {/* Total teachers */}
                    <td className="p-3.5 text-center">
                      <span className="rounded-lg bg-slate-100 px-2.5 py-1 text-xs font-extrabold text-slate-800">
                        {metrics.totalTeachers} уч.
                      </span>
                    </td>

                    {/* Staffing status pill */}
                    <td className="p-3.5 text-center">
                      {metrics.hasDeficit ? (
                        <span className="inline-flex items-center gap-1 rounded-lg bg-amber-50 px-2.5 py-1 text-[11px] font-bold text-amber-700 border border-amber-200">
                          <AlertTriangle className="h-3 w-3" />
                          Дефицит часов
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 rounded-lg bg-emerald-50 px-2.5 py-1 text-[11px] font-bold text-emerald-700 border border-emerald-200">
                          <CheckCircle2 className="h-3 w-3" />
                          Укомплектован
                        </span>
                      )}
                    </td>

                    {/* Delete Subject Action */}
                    {onDeleteSubject && (
                      <td className="p-3.5 text-center">
                        <button
                          onClick={() => onDeleteSubject(sub.id)}
                          className="rounded-lg p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600 transition-colors"
                          title={`Удалить предмет «${sub.name}»`}
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Homeroom teachers card */}
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs">
        <div className="flex items-start gap-3">
          <div className="rounded-xl bg-purple-100 p-2.5 text-purple-700">
            <Award className="h-5 w-5" />
          </div>
          <div>
            <h4 className="font-extrabold text-slate-800 text-sm">
              Классные руководители (автоматическое закрепление)
            </h4>
            <p className="mt-1 text-xs text-slate-600 leading-relaxed">
              За каждым классом (<strong>{classes.map((c) => c.name).join(', ') || 'нет классов'}</strong>) автоматически закреплена анонимная ставка «Классный руководитель». При выборе в учебном плане варианта <em>«🌟 Классный руководитель»</em> урок автоматически ведет классный руководитель данного класса.
            </p>
          </div>
        </div>
      </div>

      {/* MODAL: Full Roster of Generated Anonymous Teachers */}
      {showRosterModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs">
          <div className="w-full max-w-4xl max-h-[85vh] overflow-hidden rounded-2xl bg-white shadow-2xl flex flex-col">
            <div className="flex items-center justify-between border-b border-slate-200 p-4 bg-slate-50">
              <div>
                <h3 className="font-extrabold text-slate-800 text-base">
                  Сформированные ставки учителей-предметников ({subjectTeachers.length} ставок)
                </h3>
                <p className="text-xs text-slate-500">
                  Здесь можно настроить индивидуальные лимиты недельных часов для каждой ставки преподавателя.
                </p>
              </div>
              <button
                onClick={() => setShowRosterModal(false)}
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-200"
              >
                ✕
              </button>
            </div>

            <div className="overflow-y-auto p-4 space-y-2">
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 md:grid-cols-3">
                {subjectTeachers.map((tch) => {
                  const shift = tch.shift || 1;

                  return (
                    <div
                      key={tch.id}
                      className={`rounded-xl border p-3 transition-all ${
                        shift === 2
                          ? 'border-amber-200 bg-amber-50/40'
                          : 'border-slate-200 bg-white'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-slate-800 text-xs truncate">
                          {tch.shortName}
                        </span>
                        <span
                          className={`text-[9px] px-1.5 py-0.2 rounded font-semibold ${
                            shift === 2
                              ? 'bg-amber-100 text-amber-800'
                              : 'bg-blue-100 text-blue-800'
                          }`}
                        >
                          {shift}-я см
                        </span>
                      </div>

                      <div className="mt-2 text-[11px] text-slate-600 truncate">
                        {tch.name}
                      </div>

                      <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-2 text-[11px]">
                        <span className="text-slate-500">Лимит часов:</span>
                        <div className="flex items-center gap-1">
                          <input
                            type="number"
                            value={tch.maxHoursPerWeek}
                            onChange={(e) =>
                              handleUpdateTeacherHours(tch.id, parseInt(e.target.value) || 24)
                            }
                            className="w-14 rounded-md border border-slate-300 px-1.5 py-0.5 text-right font-bold text-xs"
                            min={1}
                            max={40}
                          />
                          <span className="text-slate-400">ч/нед</span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="border-t border-slate-200 p-4 bg-slate-50 flex justify-end">
              <button
                onClick={() => setShowRosterModal(false)}
                className="rounded-xl bg-indigo-600 px-4 py-2 text-xs font-bold text-white shadow-xs hover:bg-indigo-700"
              >
                Готово
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
