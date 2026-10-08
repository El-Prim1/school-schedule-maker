import { RoomType } from '../types/schedule';

export const DAYS_OF_WEEK = [
  { index: 0, name: 'Понедельник', shortName: 'Пн' },
  { index: 1, name: 'Вторник', shortName: 'Вт' },
  { index: 2, name: 'Среда', shortName: 'Ср' },
  { index: 3, name: 'Четверг', shortName: 'Чт' },
  { index: 4, name: 'Пятница', shortName: 'Пт' },
  { index: 5, name: 'Суббота', shortName: 'Сб' },
];

export const BELL_SCHEDULE = [
  { index: 0, lessonNumber: 1, start: '08:30', end: '09:15', breakAfter: '10 мин' },
  { index: 1, lessonNumber: 2, start: '09:25', end: '10:10', breakAfter: '15 мин' },
  { index: 2, lessonNumber: 3, start: '10:25', end: '11:10', breakAfter: '15 мин' },
  { index: 3, lessonNumber: 4, start: '11:25', end: '12:10', breakAfter: '10 мин' },
  { index: 4, lessonNumber: 5, start: '12:20', end: '13:05', breakAfter: '10 мин' },
  { index: 5, lessonNumber: 6, start: '13:15', end: '14:00', breakAfter: '10 мин' },
  { index: 6, lessonNumber: 7, start: '14:10', end: '14:55', breakAfter: '10 мин' },
  { index: 7, lessonNumber: 8, start: '15:05', end: '15:50', breakAfter: '—' },
];

export const RUSSIAN_LETTERS = ['А', 'Б', 'В', 'Г', 'Д', 'Е', 'Ж', 'З'];

export const ROOM_TYPE_META: Record<RoomType, { label: string; shortLabel: string; bg: string; text: string; border: string }> = {
  regular: {
    label: 'Обычный класс',
    shortLabel: 'Обычный',
    bg: 'bg-slate-100',
    text: 'text-slate-800',
    border: 'border-slate-300',
  },
  gym: {
    label: 'Спортивный зал',
    shortLabel: 'Спортзал',
    bg: 'bg-emerald-100',
    text: 'text-emerald-900',
    border: 'border-emerald-300',
  },
  it: {
    label: 'Компьютерный класс (ИТ)',
    shortLabel: 'ИТ-класс',
    bg: 'bg-sky-100',
    text: 'text-sky-900',
    border: 'border-sky-300',
  },
  physics_lab: {
    label: 'Лаборатория физики',
    shortLabel: 'Физ.лаб',
    bg: 'bg-indigo-100',
    text: 'text-indigo-900',
    border: 'border-indigo-300',
  },
  chemistry_lab: {
    label: 'Лаборатория химии',
    shortLabel: 'Хим.лаб',
    bg: 'bg-amber-100',
    text: 'text-amber-900',
    border: 'border-amber-300',
  },
  workshop: {
    label: 'Мастерская (Труд)',
    shortLabel: 'Мастерская',
    bg: 'bg-orange-100',
    text: 'text-orange-900',
    border: 'border-orange-300',
  },
  music_art: {
    label: 'Музыка / ИЗО',
    shortLabel: 'Муз/ИЗО',
    bg: 'bg-purple-100',
    text: 'text-purple-900',
    border: 'border-purple-300',
  },
};

export const COLOR_PALETTE = [
  '#3b82f6', // blue
  '#10b981', // emerald
  '#8b5cf6', // purple
  '#f59e0b', // amber
  '#ec4899', // pink
  '#06b6d4', // cyan
  '#ef4444', // red
  '#6366f1', // indigo
  '#14b8a6', // teal
  '#84cc16', // lime
  '#f97316', // orange
  '#a855f7', // violet
];
