import type { EasterCalendar } from './types.js';

/** Easter Sunday of a year as a Gregorian month (1-12) and day. */
export const easterDate = (year: number, calendar: EasterCalendar): { readonly month: number; readonly day: number } => {
  if (!Number.isInteger(year) || year < 1583 || year > 4099) throw new RangeError(`Easter is computed for years 1583-4099, got ${year}`);
  if (calendar === 'western') {
    const a = year % 19;
    const b = Math.floor(year / 100);
    const c = year % 100;
    const h = (19 * a + b - Math.floor(b / 4) - Math.floor((b - Math.floor((b + 8) / 25) + 1) / 3) + 15) % 30;
    const l = (32 + 2 * (b % 4) + 2 * Math.floor(c / 4) - h - (c % 4)) % 7;
    const m = Math.floor((a + 11 * h + 22 * l) / 451);
    const n = h + l - 7 * m + 114;
    return { month: Math.floor(n / 31), day: (n % 31) + 1 };
  }
  const d = (19 * (year % 19) + 15) % 30;
  const e = (2 * (year % 4) + 4 * (year % 7) - d + 34) % 7;
  const n = d + e + 114;
  const julian = new Date(Date.UTC(year, Math.floor(n / 31) - 1, (n % 31) + 1));
  julian.setUTCDate(julian.getUTCDate() + Math.floor(year / 100) - Math.floor(year / 400) - 2);
  return { month: julian.getUTCMonth() + 1, day: julian.getUTCDate() };
};
