import { CronsenseError } from './errors.js';
import { toPlan, type Plan } from './parser.js';
import type { ParseOptions } from './types.js';

const NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const pad = (value: number): string => String(value).padStart(2, '0');

const compress = (values: readonly number[]): string => {
  const parts: string[] = [];
  for (let index = 0; index < values.length; ) {
    const start = values[index] ?? 0;
    let end = start;
    while (values[index + 1] === end + 1) {
      end += 1;
      index += 1;
    }
    parts.push(end - start >= 2 ? `${pad(start)}..${pad(end)}` : end > start ? `${pad(start)},${pad(end)}` : pad(start));
    index += 1;
  }
  return parts.join(',');
};

const weekdays = (days: readonly number[]): string => {
  const ordered = [...new Set(days)].sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7));
  const parts: string[] = [];
  for (let index = 0; index < ordered.length; ) {
    const start = ordered[index] ?? 0;
    let end = start;
    while (ordered[index + 1] === (end + 1) % 7 && end !== 0) {
      end = (end + 1) % 7;
      index += 1;
    }
    const length = ((end - start + 7) % 7) + 1;
    parts.push(length >= 3 ? `${NAMES[start] ?? ''}..${NAMES[end] ?? ''}` : [start, ...(length === 2 ? [end] : [])].map((day) => NAMES[day] ?? '').join(','));
    index += 1;
  }
  return parts.join(',');
};

const unsupported = (input: string, message: string): never => {
  throw new CronsenseError('UNSUPPORTED', message, input);
};

const hint = (plan: Plan): string => {
  const units = { MINUTELY: 'min', HOURLY: 'h', DAILY: 'd', WEEKLY: 'w', MONTHLY: 'month', YEARLY: 'y' } as const;
  return `OnUnitActiveSec=${plan.interval}${units[plan.freq]}`;
};

/**
 * Converts a schedule description into systemd timer `OnCalendar=` values. Returns one value per line;
 * dates that do not form a grid, such as «23 февраля и 8 марта», need several `OnCalendar=` lines.
 *
 * @example
 * ```ts
 * toSystemd('по будням в 9:30');                   // ['Mon..Fri *-*-* 09:30:00']
 * toSystemd('в последний день месяца в 18:00');    // ['*-*~01 18:00:00']
 * ```
 */
export const toSystemd = (input: string, options: ParseOptions = {}): string[] => {
  const plan = toPlan(input, options);
  if (plan.byEaster.length > 0) unsupported(input, 'systemd calendar events cannot follow Easter; use occurrences');
  if (plan.setPosGroup !== null) unsupported(input, 'systemd calendar events cannot pick the Nth working day; use occurrences');
  if (plan.interval > 1) unsupported(input, `systemd calendar events cannot count intervals from a start point; use a monotonic timer such as ${hint(plan)}`);

  const hours = plan.byHour === null ? '*' : compress(plan.byHour);
  const minutes = plan.byMinute === null ? '*' : compress(plan.byMinute);
  const time = `${hours}:${minutes}:00`;

  if (plan.byDates.length > 0) return plan.byDates.map(({ month, day }) => `*-${pad(month)}-${pad(day)} ${time}`);

  const months = plan.byMonth.length === 0 ? '*' : compress(plan.byMonth);
  const positive = plan.byMonthDay.filter((day) => day > 0);
  const fromEnd = plan.byMonthDay.filter((day) => day < 0);
  const plainDays = plan.byDay.filter(({ nth }) => nth === null).map(({ day }) => day);
  const prefix = plainDays.length > 0 ? `${weekdays(plainDays)} ` : '';

  const nth = plan.byDay.filter(({ nth: index }) => index !== null);
  if (nth.length > 0) {
    return nth.map(({ nth: index, day }) => {
      const days = index !== null && index > 0 ? `${pad((index - 1) * 7 + 1)}..${pad(index * 7)}` : '~07/1';
      return `${NAMES[day] ?? ''} *-${months}${index !== null && index > 0 ? '-' : ''}${days} ${time}`;
    });
  }

  const dates: string[] = [];
  if (positive.length > 0 || fromEnd.length === 0) dates.push(`-${positive.length === 0 ? '*' : compress(positive)}`);
  for (const day of fromEnd) dates.push(`~${pad(-day)}`);
  return dates.map((days) => `${prefix}*-${months}${days} ${time}`);
};
