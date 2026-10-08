import { AppState, SchoolClass } from '../types/schedule';
import { BELL_SCHEDULE } from './constants';

export function parseTimeToMinutes(timeStr: string = '08:00'): number {
  if (!timeStr || typeof timeStr !== 'string') return 8 * 60;
  const parts = timeStr.split(':').map(Number);
  const h = isNaN(parts[0]) ? 8 : parts[0];
  const m = isNaN(parts[1]) ? 0 : parts[1];
  return h * 60 + m;
}

export function formatMinutesToTime(totalMinutes: number): string {
  const norm = ((totalMinutes % 1440) + 1440) % 1440;
  const h = Math.floor(norm / 60);
  const m = norm % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/**
 * Calculates max number of lessons in shift 1 among all shift 1 classes.
 */
export function getShift1LessonsCount(
  classes: SchoolClass[] = [],
  parallelLimits: Record<number, number> = {}
): number {
  const shift1Classes = classes.filter((c) => c.shift === 1);
  if (shift1Classes.length === 0) return 6;
  const limits = shift1Classes.map((c) => parallelLimits[c.grade] || 6);
  return Math.max(...limits, 6);
}

/**
 * Calculates start time of shift 2 based on shift 1 start, lesson length (45m),
 * and custom break durations (standard, after 2nd, after 3rd lesson) with no inter-shift pause (0 min).
 */
export function calculateShift2StartTime(
  shift1Start: string = '08:00',
  breakDuration: number = 10,
  shift1LessonsCount: number = 6,
  interShiftBreak: number = 0,
  breakAfter2?: number,
  breakAfter3?: number
): string {
  const startMin = parseTimeToMinutes(shift1Start);
  let currentMin = startMin;

  for (let i = 0; i < shift1LessonsCount; i++) {
    currentMin += 45; // lesson length 45 mins
    if (i < shift1LessonsCount - 1) {
      let b = breakDuration;
      if (i === 1 && breakAfter2 !== undefined && breakAfter2 > 0) {
        b = breakAfter2;
      } else if (i === 2 && breakAfter3 !== undefined && breakAfter3 > 0) {
        b = breakAfter3;
      }
      currentMin += b;
    }
  }

  const shift2StartMin = currentMin + (interShiftBreak || 0);
  return formatMinutesToTime(shift2StartMin);
}

export interface ShiftBellItem {
  index: number;
  lessonNumber: number;
  start: string;
  end: string;
  breakAfter: string;
  breakDurationMinutes: number;
}

/**
 * Returns dynamic bell schedule for shift 1 or shift 2 with custom break durations.
 */
export function getBellScheduleForShift(
  shift: 1 | 2,
  shift1Start: string = '08:00',
  breakDuration: number = 10,
  shift1LessonsCount: number = 6,
  breakAfter2?: number,
  breakAfter3?: number
): ShiftBellItem[] {
  let startMinutes =
    shift === 2
      ? parseTimeToMinutes(
          calculateShift2StartTime(
            shift1Start,
            breakDuration,
            shift1LessonsCount,
            0,
            breakAfter2,
            breakAfter3
          )
        )
      : parseTimeToMinutes(shift1Start);

  return BELL_SCHEDULE.map((b, index) => {
    const endMinutes = startMinutes + 45;
    let bDuration = breakDuration;
    let label = `${bDuration} мин`;

    if (index === 1 && breakAfter2 !== undefined && breakAfter2 > 0) {
      bDuration = breakAfter2;
      label = `${bDuration} мин (2-3 ур)`;
    } else if (index === 2 && breakAfter3 !== undefined && breakAfter3 > 0) {
      bDuration = breakAfter3;
      label = `${bDuration} мин (3-4 ур)`;
    }

    const item: ShiftBellItem = {
      ...b,
      start: formatMinutesToTime(startMinutes),
      end: formatMinutesToTime(endMinutes),
      breakAfter: label,
      breakDurationMinutes: bDuration,
    };
    startMinutes = endMinutes + bDuration;
    return item;
  });
}

/**
 * Convenient helper to get bell schedule for a specific class or shift from AppState
 */
export function getClassBellSchedule(
  cls: SchoolClass | undefined,
  state: Pick<AppState, 'classes' | 'parallelLimits' | 'settings'>
): ShiftBellItem[] {
  const shift = cls?.shift || 1;
  const shift1Count = getShift1LessonsCount(state.classes, state.parallelLimits);
  return getBellScheduleForShift(
    shift,
    state.settings?.shift1Start || '08:00',
    state.settings?.breakDurationMinutes ?? 5,
    shift1Count,
    state.settings?.breakAfterLesson2Minutes,
    state.settings?.breakAfterLesson3Minutes
  );
}

/**
 * Formatted string range for lesson index and shift (e.g. "13:15 – 14:00")
 */
export function getLessonTimeString(
  lessonIndex: number,
  shift: 1 | 2,
  state: Pick<AppState, 'classes' | 'parallelLimits' | 'settings'>
): string {
  const shift1Count = getShift1LessonsCount(state.classes, state.parallelLimits);
  const bell = getBellScheduleForShift(
    shift,
    state.settings?.shift1Start || '08:00',
    state.settings?.breakDurationMinutes ?? 5,
    shift1Count,
    state.settings?.breakAfterLesson2Minutes,
    state.settings?.breakAfterLesson3Minutes
  )[lessonIndex];

  return bell ? `${bell.start} – ${bell.end}` : `Урок ${lessonIndex + 1}`;
}
