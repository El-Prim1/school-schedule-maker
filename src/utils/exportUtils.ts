import { AppState, ScheduleItem } from '../types/schedule';
import { DAYS_OF_WEEK, BELL_SCHEDULE } from './constants';

export function exportScheduleToCSV(state: AppState): void {
  const { classes, subjects, teachers, rooms, schedule, settings } = state;
  const daysCount = settings.daysPerWeek;

  const subjectMap = new Map(subjects.map((s) => [s.id, s.name]));
  const teacherMap = new Map(teachers.map((t) => [t.id, t.shortName]));
  const roomMap = new Map(rooms.map((r) => [r.id, r.name]));

  // CSV Header
  const headers = ['Класс', 'День недели', 'Урок №', 'Время', 'Предмет', 'Учитель', 'Кабинет'];
  const rows: string[][] = [];

  classes.forEach((cls) => {
    for (let day = 0; day < daysCount; day++) {
      const dayName = DAYS_OF_WEEK[day]?.name || `День ${day + 1}`;
      const dayLessons = schedule
        .filter((s) => s.classId === cls.id && s.dayOfWeek === day)
        .sort((a, b) => a.lessonIndex - b.lessonIndex);

      dayLessons.forEach((item) => {
        const bell = BELL_SCHEDULE[item.lessonIndex];
        const timeStr = bell ? `${bell.start}-${bell.end}` : '';
        const subjName = subjectMap.get(item.subjectId) || item.subjectId;
        const tchName = teacherMap.get(item.teacherId) || item.teacherId;
        const rmName = roomMap.get(item.roomId) || item.roomId;

        rows.push([
          `"${cls.name}"`,
          `"${dayName}"`,
          `"${item.lessonIndex + 1}"`,
          `"${timeStr}"`,
          `"${subjName}"`,
          `"${tchName}"`,
          `"${rmName}"`,
        ]);
      });
    }
  });

  const csvContent =
    '\uFEFF' +
    [headers.join(';'), ...rows.map((r) => r.join(';'))].join('\r\n');

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', `raspisanie_shkoly_${new Date().toISOString().slice(0, 10)}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

export function exportStateToJSON(state: AppState): void {
  const jsonStr = JSON.stringify(state, null, 2);
  const blob = new Blob([jsonStr], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', `school_schedule_backup_${new Date().toISOString().slice(0, 10)}.json`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

export function printSchedule(): void {
  window.print();
}
