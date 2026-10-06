import { CronsenseError } from './errors.js';
import { occurrences } from './occurrences.js';
import { parse } from './parser.js';
import type { ParseOptions, Timezone, Unit } from './types.js';

export interface WhenOptions extends ParseOptions {
  /** Moment the phrase is relative to. Defaults to the current time. */
  readonly now?: Date;
  readonly timezone?: Timezone;
}

const DAYS: Readonly<Record<string, number>> = { сегодня: 0, today: 0, завтра: 1, tomorrow: 1, послезавтра: 2 };

const UNITS: ReadonlyArray<readonly [RegExp, Unit, number]> = [
  [/^(?:полчаса)$/, 'minute', 30],
  [/^(?:полгода)$/, 'month', 6],
  [/^(?:минут[аыу]?|мин|minutes?|mins?)$/, 'minute', 1],
  [/^(?:час(?:а|ов)?|hours?)$/, 'hour', 1],
  [/^(?:день|дня|дней|сутки|суток|days?)$/, 'day', 1],
  [/^(?:недел[юиь]|weeks?)$/, 'week', 1],
  [/^(?:месяц(?:а|ев)?|months?)$/, 'month', 1],
  [/^(?:год(?:а)?|лет|years?)$/, 'year', 1],
];

const NUMBERS: Readonly<Record<string, number>> = {
  a: 1, an: 1, один: 1, одну: 1, одна: 1, два: 2, две: 2, три: 3, четыре: 4, пять: 5, шесть: 6, семь: 7, восемь: 8,
  девять: 9, десять: 10, одиннадцать: 11, двенадцать: 12, пятнадцать: 15, двадцать: 20, тридцать: 30, сорок: 40, полтора: 1.5, полторы: 1.5,
};

interface Offset {
  readonly unit: Unit;
  readonly amount: number;
}

const readOffsets = (words: string[], input: string): Offset[] => {
  const offsets: Offset[] = [];
  let amount: number | null = null;
  while (words.length > 0) {
    const word = words[0] ?? '';
    if (word === 'и' || word === 'and' || word === 'ровно') {
      words.shift();
      continue;
    }
    const number = /^\d+$/.test(word) ? Number(word) : NUMBERS[word];
    if (number !== undefined && amount === null) {
      amount = number;
      words.shift();
      continue;
    }
    const unit = UNITS.find(([pattern]) => pattern.test(word));
    if (!unit) break;
    words.shift();
    const total = (amount ?? 1) * unit[2];
    if (!Number.isInteger(total) && unit[1] !== 'hour') throw new CronsenseError('OUT_OF_RANGE', `"${word}" needs a whole number`, input);
    offsets.push(Number.isInteger(total) ? { unit: unit[1], amount: total } : { unit: 'minute', amount: total * 60 });
    amount = null;
  }
  if (amount !== null || offsets.length === 0) throw new CronsenseError('INCOMPLETE', `Say how long to wait, for example «через 4 часа»`, input);
  return offsets;
};

const shift = (date: Date, { unit, amount }: Offset, utc: boolean): Date => {
  const result = new Date(date);
  if (unit === 'minute' || unit === 'hour') return new Date(date.getTime() + amount * (unit === 'hour' ? 3_600_000 : 60_000));
  if (unit === 'day' || unit === 'week') {
    const days = amount * (unit === 'week' ? 7 : 1);
    if (utc) result.setUTCDate(result.getUTCDate() + days);
    else result.setDate(result.getDate() + days);
    return result;
  }
  const months = amount * (unit === 'year' ? 12 : 1);
  if (utc) {
    const day = date.getUTCDate();
    result.setUTCDate(1);
    result.setUTCMonth(result.getUTCMonth() + months);
    result.setUTCDate(Math.min(day, new Date(Date.UTC(result.getUTCFullYear(), result.getUTCMonth() + 1, 0)).getUTCDate()));
  } else {
    const day = date.getDate();
    result.setDate(1);
    result.setMonth(result.getMonth() + months);
    result.setDate(Math.min(day, new Date(result.getFullYear(), result.getMonth() + 1, 0).getDate()));
  }
  return result;
};

const timeOfDay = (text: string, input: string, options: ParseOptions): { readonly hour: number; readonly minute: number } => {
  const { fields } = parse(text, options);
  const { minute, hour, dayOfMonth, month, dayOfWeek } = fields;
  if (minute.kind !== 'values' || hour.kind !== 'values' || minute.values.length !== 1 || hour.values.length !== 1 || dayOfMonth.kind !== 'any' || month.kind !== 'any' || dayOfWeek.kind !== 'any') {
    throw new CronsenseError('UNSUPPORTED', `"${text}" is not a single time of day`, input);
  }
  return { hour: hour.values[0] ?? 0, minute: minute.values[0] ?? 0 };
};

/**
 * Resolves a one-time phrase to a moment: «через 4 часа», «завтра в 12:17», «через месяц в двенадцать семнадцать».
 * A recurring phrase such as «по пятницам в 19:00» resolves to its next run after `now`.
 *
 * @example
 * ```ts
 * when('завтра в 12:17', { now: new Date(2026, 9, 5, 10, 5) }); // 2026-10-06 12:17 local time
 * when('через 4 часа', { now: new Date(2026, 9, 5, 10, 5) });  // 2026-10-05 14:05
 * ```
 */
export const when = (input: string, options: WhenOptions = {}): Date => {
  const now = options.now ?? new Date();
  if (Number.isNaN(now.getTime())) throw new CronsenseError('OUT_OF_RANGE', 'now is an invalid date', input);
  const utc = options.timezone === 'utc';
  const words = input.toLowerCase().replaceAll('ё', 'е').replace(/[,;]/g, ' ').split(/\s+/).filter(Boolean);

  const dayWord = words[0] !== undefined ? DAYS[words[0]] : undefined;
  if (dayWord !== undefined) words.shift();
  const relative = words[0] === 'через' || words[0] === 'in';
  if (relative) words.shift();

  if (dayWord === undefined && !relative) {
    const [next] = occurrences(input, { ...options, from: new Date(now.getTime() + 1), to: new Date(now.getTime() + 3_660 * 86_400_000), limit: 1 });
    if (!next) throw new CronsenseError('UNSUPPORTED', `"${input}" does not happen in the next ten years`, input);
    return next;
  }

  let result = new Date(now);
  if (dayWord !== undefined) result = shift(result, { unit: 'day', amount: dayWord }, utc);
  if (relative) for (const offset of readOffsets(words, input)) result = shift(result, offset, utc);

  const rest = words.join(' ');
  if (rest === '') {
    if (dayWord !== undefined && !relative) throw new CronsenseError('INCOMPLETE', `Add a time, for example «${input} в 12:17»`, input);
    return result;
  }
  const { hour, minute } = timeOfDay(rest, input, options);
  if (utc) result.setUTCHours(hour, minute, 0, 0);
  else result.setHours(hour, minute, 0, 0);
  return result;
};
