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
 * Calculates start time of shift 2 based on shift 1 start, lesson length (45m),
 * breaks duration, and sanitary pause between shifts.
 */
export function calculateShift2StartTime(
  shift1Start: string = '08:00',
  breakDuration: number = 5,
  shift1LessonsCount: number = 6,
  interShiftBreak: number = 20
): string {
  const startMin = parseTimeToMinutes(shift1Start);
  const lessonsMinutes = shift1LessonsCount * 45;
  const breaksMinutes = Math.max(0, shift1LessonsCount - 1) * breakDuration;
  const shift1EndMin = startMin + lessonsMinutes + breaksMinutes;
  const shift2StartMin = shift1EndMin + interShiftBreak;
  return formatMinutesToTime(shift2StartMin);
}

/**
 * Returns dynamic bell schedule for shift 1 or shift 2
 */
export function getBellScheduleForShift(
  shift: 1 | 2,
  shift1Start: string = '08:00',
  breakDuration: number = 5,
  shift1LessonsCount: number = 6
) {
  let startMinutes =
    shift === 2
      ? parseTimeToMinutes(
          calculateShift2StartTime(shift1Start, breakDuration, shift1LessonsCount)
        )
      : parseTimeToMinutes(shift1Start);

  return BELL_SCHEDULE.map((b) => {
    const endMinutes = startMinutes + 45;
    const item = {
      ...b,
      start: formatMinutesToTime(startMinutes),
      end: formatMinutesToTime(endMinutes),
      breakAfter: `${breakDuration} мин`,
    };
    startMinutes = endMinutes + breakDuration;
    return item;
  });
}
