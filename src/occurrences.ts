import { easterDate } from './easter.js';
import { CronsenseError } from './errors.js';
import { toPlan } from './parser.js';
import type { ParseOptions, Timezone } from './types.js';

/** Options for {@link occurrences}. */
export interface OccurrenceOptions extends ParseOptions {
  readonly from: Date;
  readonly to: Date;
  readonly anchor?: Date;
  readonly timezone?: Timezone;
  readonly limit?: number;
  /** Working-day predicate for «рабочий день», for example `isWorkday` from `@mrprolopstar/prodcal`. Receives `YYYY-MM-DD`. */
  readonly isWorkday?: (date: string) => boolean;
}

const DAY = 86_400_000;

interface Clock {
  readonly parts: (date: Date) => readonly [year: number, month: number, day: number, weekday: number, hour: number];
  readonly make: (year: number, month: number, day: number, hour: number, minute: number) => Date;
}

const LOCAL: Clock = {
  parts: (date) => [date.getFullYear(), date.getMonth() + 1, date.getDate(), date.getDay(), date.getHours()],
  make: (year, month, day, hour, minute) => new Date(year, month - 1, day, hour, minute),
};

const UTC: Clock = {
  parts: (date) => [date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate(), date.getUTCDay(), date.getUTCHours()],
  make: (year, month, day, hour, minute) => new Date(Date.UTC(year, month - 1, day, hour, minute)),
};

const dayNumber = (year: number, month: number, day: number): number => Math.round(Date.UTC(year, month - 1, day) / DAY);

const range = (count: number): number[] => Array.from({ length: count }, (_, index) => index);

const isoDay = (year: number, month: number, day: number): string =>
  `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

/**
 * Lists the moments a schedule fires between `from` and `to`, both inclusive, without a DTSTART.
 * Supports everything {@link toRRule} does plus Orthodox Easter; only true intervals such as
 * «каждые 2 недели» need an `anchor` to know which weeks count.
 *
 * @example
 * ```ts
 * occurrences('через 49 дней после Пасхи в 10 утра', { from: new Date(2026, 0, 1), to: new Date(2027, 11, 31) });
 * // [2026-05-31 10:00, 2027-06-20 10:00], Orthodox Trinity
 * ```
 */
export const occurrences = (input: string, options: OccurrenceOptions): Date[] => {
  const { from, to, anchor, limit = 10_000 } = options;
  for (const [name, value] of [['from', from], ['to', to], ['anchor', anchor]] as const) {
    if (value !== undefined && Number.isNaN(value.getTime())) throw new CronsenseError('OUT_OF_RANGE', `${name} is an invalid date`, input);
  }
  if (!Number.isInteger(limit) || limit < 0) throw new CronsenseError('OUT_OF_RANGE', `limit must be a non-negative integer`, input);

  const plan = toPlan(input, options);
  if (plan.interval > 1 && anchor === undefined) {
    const unit = { MINUTELY: 'minutes', HOURLY: 'hours', DAILY: 'days', WEEKLY: 'weeks', MONTHLY: 'months', YEARLY: 'years' }[plan.freq];
    throw new CronsenseError('INCOMPLETE', `"${input}" repeats every ${plan.interval} ${unit}; pass an anchor date to count them from`, input);
  }

  const { isWorkday } = options;
  if (plan.setPosGroup === 'workday' && isWorkday === undefined) {
    throw new CronsenseError('INCOMPLETE', `"${input}" needs a working-day calendar; pass isWorkday, for example from @mrprolopstar/prodcal`, input);
  }
  const clock = options.timezone === 'utc' ? UTC : LOCAL;
  const positionCache = new Map<number, ReadonlySet<number>>();
  const positions = (year: number, month: number): ReadonlySet<number> => {
    const key = year * 12 + month;
    const cached = positionCache.get(key);
    if (cached !== undefined) return cached;
    const length = new Date(Date.UTC(year, month, 0)).getUTCDate();
    const candidates = range(length)
      .map((index) => index + 1)
      .filter((day) =>
        plan.setPosGroup === 'workday' && isWorkday !== undefined
          ? isWorkday(isoDay(year, month, day))
          : ![0, 6].includes(new Date(Date.UTC(year, month - 1, day)).getUTCDay()),
      );
    const chosen = new Set(plan.bySetPos.map((position) => candidates.at(position > 0 ? position - 1 : position)).filter((day) => day !== undefined));
    positionCache.set(key, chosen);
    return chosen;
  };
  const hours = plan.byHour ?? range(24);
  const minutes = plan.byMinute ?? range(60);
  const easterCache = new Map<number, number>();
  const easterDay = (year: number): number => {
    const cached = easterCache.get(year);
    if (cached !== undefined) return cached;
    const { month, day } = easterDate(year, plan.easter);
    const value = dayNumber(year, month, day);
    easterCache.set(year, value);
    return value;
  };

  const [anchorYear, anchorMonth, anchorDate] = anchor === undefined ? [0, 0, 0] : clock.parts(anchor);
  const anchorDay = dayNumber(anchorYear, anchorMonth, anchorDate);
  const anchorWeek = Math.floor((anchorDay + 3) / 7);

  const dayMatches = (year: number, month: number, day: number, weekday: number): boolean => {
    const serial = dayNumber(year, month, day);
    const length = new Date(Date.UTC(year, month, 0)).getUTCDate();
    if (plan.byMonth.length > 0 && !plan.byMonth.includes(month)) return false;
    if (plan.byMonthDay.length > 0 && !plan.byMonthDay.some((value) => (value > 0 ? value === day : length + value + 1 === day))) return false;
    if (plan.bySetPos.length > 0 && !positions(year, month).has(day)) return false;
    const workday = plan.workdays && isWorkday !== undefined;
    if (workday && !(isWorkday(isoDay(year, month, day)) || plan.byDay.some(({ nth, day: target }) => nth === null && target === weekday && (target === 0 || target === 6)))) {
      return false;
    }
    if (
      !workday &&
      plan.byDay.length > 0 &&
      !plan.byDay.some(({ nth, day: target }) => {
        if (target !== weekday) return false;
        if (nth === null) return true;
        return nth > 0 ? Math.ceil(day / 7) === nth : Math.floor((length - day) / 7) === -nth - 1;
      })
    ) {
      return false;
    }
    const holidays = plan.byEaster.length > 0 || plan.byDates.length > 0;
    if (holidays && !plan.byEaster.includes(serial - easterDay(year)) && !plan.byDates.some((date) => date.month === month && date.day === day)) return false;
    if (plan.interval > 1) {
      if (serial < anchorDay) return false;
      if (plan.freq === 'DAILY') return (serial - anchorDay) % plan.interval === 0;
      if (plan.freq === 'WEEKLY') return (Math.floor((serial + 3) / 7) - anchorWeek) % plan.interval === 0;
      if (plan.freq === 'MONTHLY') return (year * 12 + month - (anchorYear * 12 + anchorMonth)) % plan.interval === 0;
      if (plan.freq === 'YEARLY') return (year - anchorYear) % plan.interval === 0;
    }
    return true;
  };

  const unit = plan.freq === 'MINUTELY' ? 60_000 : 3_600_000;
  const stepMatches = (moment: Date): boolean => {
    if (plan.interval <= 1 || (plan.freq !== 'MINUTELY' && plan.freq !== 'HOURLY') || anchor === undefined) return true;
    const base = Math.floor(anchor.getTime() / unit);
    return (Math.floor(moment.getTime() / unit) - base) % plan.interval === 0;
  };

  const result: Date[] = [];
  const [startYear, startMonth, startDay] = clock.parts(from);
  for (let cursor = clock.make(startYear, startMonth, startDay, 12, 0); result.length < limit; ) {
    const [year, month, day, weekday] = clock.parts(cursor);
    if (clock.make(year, month, day, 0, 0).getTime() > to.getTime()) break;
    if (dayMatches(year, month, day, weekday)) {
      for (const hour of hours) {
        for (const minute of minutes) {
          const moment = clock.make(year, month, day, hour, minute);
          if (clock.parts(moment)[4] !== hour) continue;
          if (moment < from || moment > to || (anchor !== undefined && moment < anchor) || !stepMatches(moment)) continue;
          result.push(moment);
          if (result.length === limit) return result;
        }
      }
    }
    cursor = clock.make(year, month, day + 1, 12, 0);
  }
  return result;
};
