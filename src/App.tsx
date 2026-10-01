/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import { AppState, ScheduleItem, SchoolClass, Subject, Teacher, Room, CurriculumItem } from './types/schedule';
import { getDefaultAppState, loadDemoScheduleState } from './utils/defaultData';
import { generateSchedule, GenerationResult } from './utils/scheduler';
import { runDiagnostics } from './utils/diagnostics';
import { exportScheduleToCSV, exportStateToJSON, printSchedule } from './utils/exportUtils';
import { ClassScheduleView } from './components/ClassScheduleView';
import { TeacherScheduleView } from './components/TeacherScheduleView';
import { RoomScheduleView } from './components/RoomScheduleView';
import { DiagnosticsPanel } from './components/DiagnosticsPanel';
import { ClassesManager } from './components/ClassesManager';
import { CurriculumManager } from './components/CurriculumManager';
import { TeachersManager } from './components/TeachersManager';
import { RoomsManager } from './components/RoomsManager';
import { SettingsManager } from './components/SettingsManager';
import {
  Calendar,
  Sparkles,
  AlertTriangle,
  CheckCircle2,
  Users,
  BookOpen,
  School,
  DoorClosed,
  Printer,
  Download,
  Upload,
  RotateCcw,
  Check,
  ChevronDown,
  Layers,
  Settings,
  Flame,
  UserCheck,
  Zap,
} from 'lucide-react';

const LOCAL_STORAGE_KEY = 'school_schedule_state_v2';

export default function App() {
  // Load state from localStorage or initialize with rich default school data
  const [state, setState] = useState<AppState>(() => {
    try {
      const saved = localStorage.getItem(LOCAL_STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed.classes && parsed.subjects && parsed.teachers) {
          const defaultApp = getDefaultAppState();
          return {
            ...defaultApp,
            ...parsed,
            settings: {
              ...defaultApp.settings,
              ...(parsed.settings || {}),
              shift1Start: parsed.settings?.shift1Start || '08:00',
              breakDurationMinutes: parsed.settings?.breakDurationMinutes ?? 5,
            },
            constraints: parsed.constraints || [],
          };
        }
      }
    } catch (e) {
      console.error('Failed to parse saved state from localStorage:', e);
    }
    return getDefaultAppState();
  });

  // Active navigation tab
  const [activeTab, setActiveTab] = useState<
    'schedule' | 'diagnostics' | 'classes' | 'curriculum' | 'teachers' | 'rooms' | 'settings'
  >('schedule');

  // Schedule sub-view
  const [scheduleSubView, setScheduleSubView] = useState<'classes' | 'teachers' | 'rooms'>('classes');

  // Generation status / feedback
  const [isGenerating, setIsGenerating] = useState<boolean>(false);
  const [lastGenResult, setLastGenResult] = useState<GenerationResult | null>(null);
  const [showGenModal, setShowGenModal] = useState<boolean>(false);

  // Undo / Redo toast state
  const [redoToast, setRedoToast] = useState<{
    message: string;
    type: 'success' | 'error' | 'warning';
    previousState: AppState;
  } | null>(null);

  const updateStateWithUndo = (
    newState: AppState,
    message: string,
    type: 'success' | 'error' | 'warning' = 'success'
  ) => {
    const prevState = state;
    setState(newState);
    setRedoToast({
      message,
      type,
      previousState: prevState,
    });
    setTimeout(() => {
      setRedoToast(null);
    }, 8000);
  };

  const handleUndo = () => {
    if (redoToast) {
      setState(redoToast.previousState);
      setRedoToast(null);
    }
  };

  // File import ref
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Save to localStorage on state change
  useEffect(() => {
    try {
      localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(state));
    } catch (e) {
      console.error('Failed to save state to localStorage:', e);
    }
  }, [state]);

  // Compute live diagnostics issues count for the badge
  const diagnosticIssues = runDiagnostics(state);
  const errorCount = diagnosticIssues.filter((i) => i.severity === 'error').length;
  const warningCount = diagnosticIssues.filter((i) => i.severity === 'warning').length;

  // GENERATE SCHEDULE ACTION
  const handleGenerateSchedule = () => {
    setIsGenerating(true);
    setTimeout(() => {
      const result = generateSchedule(state);
      setState((prev) => ({
        ...prev,
        schedule: result.schedule,
      }));
      setLastGenResult(result);
      setIsGenerating(false);
      setShowGenModal(true);

      if (!result.success || result.unplacedCount > 0) {
        updateStateWithUndo(
          { ...state, schedule: result.schedule },
          `Внимание: не удалось разместить ${result.unplacedCount} уроков из-за перегрузки.`,
          'error'
        );
      } else {
        updateStateWithUndo(
          { ...state, schedule: result.schedule },
          `Расписание успешно сгенерировано (${result.metrics.totalLessons} уроков)!`,
          'success'
        );
      }
    }, 120);
  };

  // LOAD DEMO SCHEDULE ACTION
  const handleLoadDemoSchedule = () => {
    const demoState = loadDemoScheduleState();
    updateStateWithUndo(demoState, 'Загружен готовый интерактивный демо-проект расписания!', 'success');
    setActiveTab('schedule');
  };

  // Reset to default sample school
  const handleResetToDemo = () => {
    if (confirm('Сбросить все данные к исходным демонстрационным (8 классов, 15 учителей, кабинеты и учебный план)?')) {
      const freshState = getDefaultAppState();
      setState(freshState);
      localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(freshState));
      setLastGenResult(null);
    }
  };

  // Import JSON backup
  const handleFileImport = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const imported = JSON.parse(e.target?.result as string);
        const defaults = getDefaultAppState();
        if (
          Array.isArray(imported.classes) &&
          Array.isArray(imported.subjects) &&
          Array.isArray(imported.teachers) &&
          Array.isArray(imported.rooms) &&
          Array.isArray(imported.curriculum) &&
          Array.isArray(imported.schedule)
        ) {
          setState({
            ...defaults,
            ...imported,
            settings: { ...defaults.settings, ...(imported.settings || {}) },
            constraints: Array.isArray(imported.constraints) ? imported.constraints : [],
          });
          alert('Данные успешно импортированы!');
        } else {
          alert('Ошибка: файл не содержит корректную структуру данных школы.');
        }
      } catch (err) {
        alert('Не удалось прочитать JSON-файл.');
      }
    };
    reader.readAsText(file);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  // Schedule mutations
  const handleUpdateScheduleItem = (updated: ScheduleItem) => {
    setState((prev) => ({
      ...prev,
      schedule: prev.schedule.map((s) => (s.id === updated.id ? updated : s)),
    }));
  };

  const handleDeleteScheduleItem = (itemId: string) => {
    setState((prev) => ({
      ...prev,
      schedule: prev.schedule.filter((s) => s.id !== itemId),
    }));
  };

  const handleAddScheduleItem = (item: ScheduleItem) => {
    setState((prev) => ({
      ...prev,
      schedule: [...prev.schedule, item],
    }));
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 flex flex-col font-sans">
      {/* Hidden file input for JSON import */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".json"
        onChange={handleFileImport}
        className="hidden"
      />

      {/* PRINT-ONLY HEADER (shown on A4 print) */}
      <div className="print-header hidden p-6 text-center border-b border-slate-300">
        <div className="flex justify-between items-start text-xs text-left mb-4">
          <div>
            <div>Муниципальное общеобразовательное учреждение</div>
            <div className="font-bold">Средняя общеобразовательная школа</div>
          </div>
          <div className="text-right">
            <div>«УТВЕРЖДАЮ»</div>
            <div>Директор школы _____________</div>
            <div className="text-[10px] text-slate-500">«____» ____________ 2026 г.</div>
          </div>
        </div>
        <h1 className="text-lg font-bold uppercase tracking-wider text-slate-900">
          Расписание учебных занятий на 2026–2027 учебный год
        </h1>
        <p className="text-xs text-slate-500 mt-1">
          Составлено автоматическим генератором с соблюдением требований СанПиН
        </p>
      </div>

      {/* TOP NAVBAR */}
      <header className="no-print sticky top-0 z-40 border-b border-slate-200/80 bg-white/95 backdrop-blur-md shadow-2xs">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3 sm:px-6">
          {/* Logo & title */}
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-tr from-indigo-600 to-violet-600 text-white shadow-md shadow-indigo-200">
              <Calendar className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-base font-extrabold tracking-tight text-slate-900">
                  Школьное расписание
                </span>
                <span className="rounded-md bg-indigo-50 px-2 py-0.5 text-[10px] font-black text-indigo-700 uppercase tracking-wider border border-indigo-200/60">
                  Авто-генератор
                </span>
              </div>
              <p className="text-[11px] text-slate-500 hidden sm:block">
                Без окон и накладок • Профильные кабинеты • Параллели 5А, 5Б, 5В
              </p>
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex items-center gap-2">
            {/* Demo View Button */}
            <button
              onClick={handleLoadDemoSchedule}
              className="flex items-center gap-1.5 rounded-xl border border-purple-200 bg-purple-50 px-3.5 py-2 text-xs font-black text-purple-700 shadow-2xs hover:bg-purple-100 active:scale-95 transition-all"
              title="Загрузить готовый эталонный демо-проект школы"
            >
              <Zap className="h-4 w-4 text-purple-600" />
              <span>Демо-просмотр</span>
            </button>

            {/* Generate Action Button */}
            <button
              onClick={handleGenerateSchedule}
              disabled={isGenerating}
              className="flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2 text-xs font-bold text-white shadow-md shadow-indigo-100 hover:bg-indigo-700 active:scale-95 transition-all disabled:opacity-60"
            >
              <Sparkles className={`h-4 w-4 ${isGenerating ? 'animate-spin' : ''}`} />
              <span className="hidden sm:inline">
                {isGenerating ? 'Составление сетки...' : 'Сгенерировать расписание'}
              </span>
              <span className="sm:hidden">Генерация</span>
            </button>

            {/* Print Button */}
            <button
              onClick={printSchedule}
              className="flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 shadow-2xs hover:bg-slate-50 transition-all"
              title="Печать расписания (A4)"
            >
              <Printer className="h-4 w-4 text-slate-500" />
              <span className="hidden md:inline">Печать</span>
            </button>

            {/* Export CSV */}
            <button
              onClick={() => exportScheduleToCSV(state)}
              className="flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 shadow-2xs hover:bg-slate-50 transition-all"
              title="Экспорт в Excel / CSV"
            >
              <Download className="h-4 w-4 text-slate-500" />
              <span className="hidden md:inline">Excel/CSV</span>
            </button>

            {/* Backup menu / JSON */}
            <div className="relative group">
              <button
                className="flex items-center gap-1 rounded-xl border border-slate-200 bg-white px-2.5 py-2 text-xs font-semibold text-slate-700 shadow-2xs hover:bg-slate-50"
                title="Дополнительно"
              >
                <Settings className="h-4 w-4 text-slate-500" />
                <ChevronDown className="h-3 w-3 text-slate-400" />
              </button>

              <div className="absolute right-0 top-full mt-1.5 hidden w-48 rounded-xl border border-slate-200 bg-white py-1 shadow-xl group-hover:block z-50">
                <button
                  onClick={() => exportStateToJSON(state)}
                  className="flex w-full items-center gap-2 px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-100"
                >
                  <Download className="h-3.5 w-3.5 text-slate-400" />
                  Резервная копия (JSON)
                </button>
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="flex w-full items-center gap-2 px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-100"
                >
                  <Upload className="h-3.5 w-3.5 text-slate-400" />
                  Загрузить из JSON
                </button>
                <div className="my-1 border-t border-slate-100" />
                <button
                  onClick={handleResetToDemo}
                  className="flex w-full items-center gap-2 px-3 py-2 text-xs font-medium text-rose-600 hover:bg-rose-50"
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                  Сбросить к демо-школе
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* NAVIGATION TABS */}
        <div className="mx-auto flex max-w-7xl overflow-x-auto px-4 sm:px-6">
          <nav className="flex space-x-1 border-b border-transparent">
            {/* TAB: Schedule */}
            <button
              onClick={() => setActiveTab('schedule')}
              className={`flex items-center gap-2 border-b-2 px-4 py-3 text-xs font-bold transition-all whitespace-nowrap ${
                activeTab === 'schedule'
                  ? 'border-indigo-600 text-indigo-600'
                  : 'border-transparent text-slate-600 hover:border-slate-300 hover:text-slate-900'
              }`}
            >
              <Calendar className="h-4 w-4" />
              Расписание
              {state.schedule.length > 0 && (
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] text-slate-600">
                  {state.schedule.length}
                </span>
              )}
            </button>

            {/* TAB: Diagnostics with live issue counter */}
            <button
              onClick={() => setActiveTab('diagnostics')}
              className={`flex items-center gap-2 border-b-2 px-4 py-3 text-xs font-bold transition-all whitespace-nowrap ${
                activeTab === 'diagnostics'
                  ? 'border-indigo-600 text-indigo-600'
                  : 'border-transparent text-slate-600 hover:border-slate-300 hover:text-slate-900'
              }`}
            >
              <AlertTriangle
                className={`h-4 w-4 ${
                  errorCount > 0
                    ? 'text-rose-600'
                    : warningCount > 0
                    ? 'text-amber-500'
                    : 'text-emerald-500'
                }`}
              />
              Умная диагностика
              {errorCount > 0 ? (
                <span className="rounded-full bg-rose-100 px-1.5 py-0.5 text-[10px] font-black text-rose-700 animate-pulse">
                  {errorCount}
                </span>
              ) : warningCount > 0 ? (
                <span className="rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold text-amber-700">
                  {warningCount}
                </span>
              ) : (
                <span className="rounded-full bg-emerald-100 px-1.5 py-0.5 text-[10px] font-bold text-emerald-700">
                  0
                </span>
              )}
            </button>

            {/* TAB: Classes & Parallel limits */}
            <button
              onClick={() => setActiveTab('classes')}
              className={`flex items-center gap-2 border-b-2 px-4 py-3 text-xs font-bold transition-all whitespace-nowrap ${
                activeTab === 'classes'
                  ? 'border-indigo-600 text-indigo-600'
                  : 'border-transparent text-slate-600 hover:border-slate-300 hover:text-slate-900'
              }`}
            >
              <School className="h-4 w-4" />
              Классы и лимиты ({state.classes.length})
            </button>

            {/* TAB: Curriculum */}
            <button
              onClick={() => setActiveTab('curriculum')}
              className={`flex items-center gap-2 border-b-2 px-4 py-3 text-xs font-bold transition-all whitespace-nowrap ${
                activeTab === 'curriculum'
                  ? 'border-indigo-600 text-indigo-600'
                  : 'border-transparent text-slate-600 hover:border-slate-300 hover:text-slate-900'
              }`}
            >
              <BookOpen className="h-4 w-4" />
              Учебный план ({state.subjects.length})
            </button>

            {/* TAB: Teachers */}
            <button
              onClick={() => setActiveTab('teachers')}
              className={`flex items-center gap-2 border-b-2 px-4 py-3 text-xs font-bold transition-all whitespace-nowrap ${
                activeTab === 'teachers'
                  ? 'border-indigo-600 text-indigo-600'
                  : 'border-transparent text-slate-600 hover:border-slate-300 hover:text-slate-900'
              }`}
            >
              <UserCheck className="h-4 w-4" />
              Учителя ({state.teachers.length})
            </button>

            {/* TAB: Rooms */}
            <button
              onClick={() => setActiveTab('rooms')}
              className={`flex items-center gap-2 border-b-2 px-4 py-3 text-xs font-bold transition-all whitespace-nowrap ${
                activeTab === 'rooms'
                  ? 'border-indigo-600 text-indigo-600'
                  : 'border-transparent text-slate-600 hover:border-slate-300 hover:text-slate-900'
              }`}
            >
              <DoorClosed className="h-4 w-4" />
              Кабинеты ({state.rooms.length})
            </button>

            {/* TAB: Settings */}
            <button
              onClick={() => setActiveTab('settings')}
              className={`flex items-center gap-2 border-b-2 px-4 py-3 text-xs font-bold transition-all whitespace-nowrap ${
                activeTab === 'settings'
                  ? 'border-indigo-600 text-indigo-600'
                  : 'border-transparent text-slate-600 hover:border-slate-300 hover:text-slate-900'
              }`}
            >
              <Settings className="h-4 w-4" />
              Настройки
            </button>
          </nav>
        </div>
      </header>

      {/* DEMO MODE BANNER */}
      {state.isDemoMode && (
        <div className="no-print bg-gradient-to-r from-purple-900 via-indigo-900 to-slate-900 px-4 py-2.5 text-xs text-white shadow-md">
          <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2 font-semibold">
              <span className="flex h-2.5 w-2.5 rounded-full bg-emerald-400 animate-ping" />
              <span className="font-black text-purple-200 uppercase tracking-wider">🟢 Интерактивный демо-просмотр:</span>
              <span className="text-purple-100">Загружен эталонный школьный проект (12 классов, 2 смены, правила предметов, 0 окон).</span>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setActiveTab('diagnostics')}
                className="rounded-lg bg-purple-700/80 hover:bg-purple-600 px-3 py-1 font-bold text-white transition-colors"
              >
                🔍 Умная диагностика
              </button>
              <button
                onClick={() => setActiveTab('settings')}
                className="rounded-lg bg-indigo-700/80 hover:bg-indigo-600 px-3 py-1 font-bold text-white transition-colors"
              >
                ⚙️ Правила предметов
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MAIN CONTENT AREA */}
      <main className="flex-1 mx-auto w-full max-w-7xl px-4 py-6 sm:px-6">
        {/* SCHEDULE TAB CONTENT */}
        {activeTab === 'schedule' && (
          <div className="space-y-6">
            {/* View Sub-selector (By Classes, By Teachers, By Rooms) */}
            <div className="no-print flex items-center justify-between border-b border-slate-200 pb-3">
              <div className="flex rounded-xl bg-slate-200/60 p-1">
                <button
                  onClick={() => setScheduleSubView('classes')}
                  className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold transition-all ${
                    scheduleSubView === 'classes'
                      ? 'bg-white text-indigo-700 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <School className="h-3.5 w-3.5" />
                  По классам
                </button>
                <button
                  onClick={() => setScheduleSubView('teachers')}
                  className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold transition-all ${
                    scheduleSubView === 'teachers'
                      ? 'bg-white text-indigo-700 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <UserCheck className="h-3.5 w-3.5" />
                  По учителям
                </button>
                <button
                  onClick={() => setScheduleSubView('rooms')}
                  className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold transition-all ${
                    scheduleSubView === 'rooms'
                      ? 'bg-white text-indigo-700 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <DoorClosed className="h-3.5 w-3.5" />
                  По кабинетам
                </button>
              </div>

              {state.schedule.length === 0 && (
                <div className="text-xs font-semibold text-amber-700 bg-amber-50 border border-amber-200 px-3 py-1 rounded-lg">
                  Расписание еще не создано. Нажмите «Сгенерировать расписание» вверху.
                </div>
              )}
            </div>

            {/* Sub-views */}
            {scheduleSubView === 'classes' && (
              <ClassScheduleView
                state={state}
                onUpdateScheduleItem={handleUpdateScheduleItem}
                onDeleteScheduleItem={handleDeleteScheduleItem}
                onAddScheduleItem={handleAddScheduleItem}
              />
            )}

            {scheduleSubView === 'teachers' && <TeacherScheduleView state={state} />}

            {scheduleSubView === 'rooms' && <RoomScheduleView state={state} />}
          </div>
        )}

        {/* DIAGNOSTICS TAB CONTENT */}
        {activeTab === 'diagnostics' && (
          <DiagnosticsPanel
            state={state}
            onUpdateState={setState}
            onUpdateStateWithUndo={updateStateWithUndo}
            onNavigateToSchedule={() => setActiveTab('schedule')}
          />
        )}

        {/* CLASSES & PARALLEL LIMITS TAB */}
        {activeTab === 'classes' && (
          <ClassesManager
            state={state}
            onUpdateClasses={(newClasses) => setState((p) => ({ ...p, classes: newClasses }))}
            onUpdateParallelLimits={(limits) => setState((p) => ({ ...p, parallelLimits: limits }))}
          />
        )}

        {/* CURRICULUM TAB */}
        {activeTab === 'curriculum' && (
          <CurriculumManager
            state={state}
            onUpdateSubjects={(newSubjects) => setState((p) => ({ ...p, subjects: newSubjects }))}
            onUpdateCurriculum={(newCurr) => setState((p) => ({ ...p, curriculum: newCurr }))}
          />
        )}

        {/* TEACHERS TAB */}
        {activeTab === 'teachers' && (
          <TeachersManager
            state={state}
            onUpdateTeachers={(newTeachers) => setState((p) => ({ ...p, teachers: newTeachers }))}
          />
        )}

        {/* ROOMS TAB */}
        {activeTab === 'rooms' && (
          <RoomsManager
            state={state}
            onUpdateRooms={(newRooms) => setState((p) => ({ ...p, rooms: newRooms }))}
          />
        )}

        {/* SETTINGS TAB */}
        {activeTab === 'settings' && (
          <SettingsManager
            state={state}
            onUpdateSettings={(newSettings) =>
              setState((p) => ({ ...p, settings: newSettings }))
            }
            onUpdateConstraints={(newConstraints) =>
              setState((p) => ({ ...p, constraints: newConstraints }))
            }
            onUpdateStateWithUndo={updateStateWithUndo}
          />
        )}
      </main>

      {/* UNDO / REDO TOAST NOTIFICATION */}
      {redoToast && (
        <div
          className={`fixed bottom-6 right-6 z-50 flex items-center gap-3 rounded-2xl px-5 py-4 text-sm font-bold text-white shadow-2xl transition-all animate-bounce ${
            redoToast.type === 'error'
              ? 'bg-rose-600 border border-rose-500 shadow-rose-900/40'
              : redoToast.type === 'warning'
              ? 'bg-amber-600 border border-amber-500 shadow-amber-900/40'
              : 'bg-slate-900 border border-slate-700 shadow-slate-900/40'
          }`}
        >
          {redoToast.type === 'error' ? (
            <AlertTriangle className="h-5 w-5 text-white shrink-0" />
          ) : redoToast.type === 'warning' ? (
            <AlertTriangle className="h-5 w-5 text-amber-200 shrink-0" />
          ) : (
            <CheckCircle2 className="h-5 w-5 text-emerald-400 shrink-0" />
          )}
          <span>{redoToast.message}</span>
          {redoToast.previousState && (
            <button
              onClick={handleUndo}
              className="rounded-xl bg-white/20 hover:bg-white/30 px-3.5 py-1.5 text-xs font-black text-white active:scale-95 transition-all shadow-xs shrink-0"
            >
              Вернуть назад ↩
            </button>
          )}
        </div>
      )}

      {/* GENERATION SUMMARY MODAL */}
      {showGenModal && lastGenResult && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-600">
                <CheckCircle2 className="h-7 w-7" />
              </div>
              <div>
                <h3 className="text-lg font-extrabold text-slate-800">
                  Расписание успешно составлено!
                </h3>
                <p className="text-xs text-slate-500">
                  Время расчета: <strong>{lastGenResult.timeMs} мс</strong>
                </p>
              </div>
            </div>

            <div className="mt-5 space-y-2 rounded-xl bg-slate-50 p-4 text-xs">
              <div className="flex justify-between">
                <span className="text-slate-500">Всего назначено уроков:</span>
                <span className="font-bold text-slate-800">
                  {lastGenResult.metrics.totalLessons} из {lastGenResult.totalRequired}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Классов охвачено:</span>
                <span className="font-bold text-slate-800">
                  {lastGenResult.metrics.classesCount}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Учителей задействовано:</span>
                <span className="font-bold text-slate-800">
                  {lastGenResult.metrics.teachersCount}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Уроков в профильных кабинетах:</span>
                <span className="font-bold text-indigo-700">
                  {lastGenResult.metrics.profileRoomLessonsCount} (Спортзалы, ИТ, Лаборатории)
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Окна у учеников:</span>
                <span className="font-bold text-emerald-700">0 (Строго без окон)</span>
              </div>
            </div>

            <div className="mt-6 flex items-center justify-end gap-2">
              <button
                onClick={() => {
                  setShowGenModal(false);
                  setActiveTab('diagnostics');
                }}
                className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100"
              >
                Открыть диагностику
              </button>
              <button
                onClick={() => {
                  setShowGenModal(false);
                  setActiveTab('schedule');
                }}
                className="rounded-xl bg-indigo-600 px-5 py-2 text-xs font-bold text-white shadow-xs hover:bg-indigo-700"
              >
                Посмотреть расписание
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
