import { parseCron } from './cron.js';
import { CronsenseError } from './errors.js';
import { expandField, isAny } from './field.js';
import type { CronFields, NextRunsOptions, Schedule } from './types.js';

const SEARCH_DAYS = 366 * 8;

interface Calendar {
  readonly year: (date: Date) => number;
  readonly month: (date: Date) => number;
  readonly day: (date: Date) => number;
  readonly weekday: (date: Date) => number;
  readonly hours: (date: Date) => number;
  readonly make: (year: number, month: number, day: number, hour: number, minute: number) => Date;
}

const LOCAL: Calendar = {
  year: (date) => date.getFullYear(),
  month: (date) => date.getMonth(),
  day: (date) => date.getDate(),
  weekday: (date) => date.getDay(),
  hours: (date) => date.getHours(),
  make: (year, month, day, hour, minute) => new Date(year, month, day, hour, minute),
};

const UTC: Calendar = {
  year: (date) => date.getUTCFullYear(),
  month: (date) => date.getUTCMonth(),
  day: (date) => date.getUTCDate(),
  weekday: (date) => date.getUTCDay(),
  hours: (date) => date.getUTCHours(),
  make: (year, month, day, hour, minute) => new Date(Date.UTC(year, month, day, hour, minute)),
};

export const nextRuns = (schedule: Schedule | string, options: NextRunsOptions = {}): Date[] => {
  const fields: CronFields = typeof schedule === 'string' ? parseCron(schedule).fields : schedule.fields;
  const count = options.count ?? 5;
  const from = options.from ?? new Date();
  if (!Number.isInteger(count) || count < 0) {
    throw new CronsenseError('OUT_OF_RANGE', `count must be a non-negative integer`, String(count));
  }
  if (Number.isNaN(from.getTime())) throw new CronsenseError('OUT_OF_RANGE', `from is an invalid date`, String(from));

  const calendar = options.timezone === 'utc' ? UTC : LOCAL;
  const minutes = expandField('minute', fields.minute);
  const hours = expandField('hour', fields.hour);
  const monthDays = new Set(expandField('dayOfMonth', fields.dayOfMonth));
  const months = new Set(expandField('month', fields.month));
  const weekdays = new Set(expandField('dayOfWeek', fields.dayOfWeek));
  const anyMonthDay = isAny(fields.dayOfMonth);
  const anyWeekday = isAny(fields.dayOfWeek);

  const matchesDay = (date: Date): boolean => {
    const byMonthDay = monthDays.has(calendar.day(date));
    const byWeekday = weekdays.has(calendar.weekday(date));
    if (anyMonthDay && anyWeekday) return true;
    if (anyMonthDay) return byWeekday;
    if (anyWeekday) return byMonthDay;
    return byMonthDay || byWeekday;
  };

  const runs: Date[] = [];
  const year = calendar.year(from);
  const month = calendar.month(from);
  const day = calendar.day(from);

  for (let offset = 0; offset < SEARCH_DAYS && runs.length < count; offset += 1) {
    const midnight = calendar.make(year, month, day + offset, 12, 0);
    if (!months.has(calendar.month(midnight) + 1) || !matchesDay(midnight)) continue;
    for (const hour of hours) {
      for (const minute of minutes) {
        const run = calendar.make(calendar.year(midnight), calendar.month(midnight), calendar.day(midnight), hour, minute);
        if (calendar.hours(run) !== hour || run.getTime() <= from.getTime()) continue;
        runs.push(run);
        if (runs.length === count) return runs;
      }
    }
  }

  return runs;
};
