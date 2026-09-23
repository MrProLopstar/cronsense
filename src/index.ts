/**
 * # cronsense
 *
 * Turn plain Russian or English schedules into cron expressions.
 *
 * ```
 * по будням в 9:30                     →  30 9 * * 1-5
 * каждый час с 9 до 18 по будням     →  0 9-18 * * 1-5
 * 1 и 15 числа в 12:00                 →  0 12 1,15 * *
 * every day at 9am and 5pm            →  0 9,17 * * *
 * mon, wed and fri at 6pm              →  0 18 * * 1,3,5
 * ```
 *
 * - Russian and English, mixed freely, with Russian word forms handled
 * - No dependencies, no LLM, fully deterministic
 * - Strict TypeScript types, errors carry a code and the position of the problem
 * - Refuses to guess: anything cron cannot express exactly is an error, not a silent approximation
 * - Works both ways: {@link describe} turns cron back into natural text that parses to the same schedule
 *
 * ## Usage
 *
 * ```ts
 * import { describe, nextRuns, parse, safeParse, toCron } from '@mrprolopstar/cronsense';
 *
 * toCron('каждый день в 9 утра'); // '0 9 * * *'
 *
 * const schedule = parse('every 2 hours from 8:00 to 20:00');
 * schedule.cron;        // '0 8-20/2 * * *'
 * schedule.fields.hour; // { kind: 'step', from: 8, to: 20, step: 2 }
 *
 * describe('0 9 * * 1,3,5', { locale: 'ru' }); // 'по понедельникам, средам и пятницам в 9:00'
 * describe('0 12 1,15 * *');                  // 'on the 1st and 15th at noon'
 *
 * nextRuns(schedule, { count: 3, timezone: 'utc' }); // [Date, Date, Date]
 *
 * const result = safeParse('по будням кроме пятницы');
 * if (!result.ok) {
 *   result.error.code;    // 'UNSUPPORTED'
 *   result.error.span;    // { start: 10, end: 15 }
 *   result.error.excerpt; // input with a ^^^^^ marker under the problem
 * }
 * ```
 *
 * ## What it understands
 *
 * - **Intervals:** every N minutes / hours / days / months, «через день», "every other hour", «раз в 5 минут», "once a day"
 * - **Frequencies:** hourly, daily, weekly, monthly, yearly / «ежечасно», «ежедневно», «ежемесячно»
 * - **Times:** `9:30`, `9.30`, `9am`, `7 p.m.`, noon / midnight, «в 3 часа дня», «в 11 ночи», «9 часов 45 минут», several times at once
 * - **Time ranges:** «с 9 до 18», "between 9 and 17", «до 12», overnight windows like «с 22 до 6»
 * - **Weekdays:** names, abbreviations, ranges (`пн-пт`, "monday through friday"), weekdays / weekends
 * - **Days of month:** «1 и 15 числа», «с 1 по 10 число», "on the 1st and 15th", «15 января», "jan 15"
 * - **Months:** names, lists, ranges, including across the new year («с ноября по февраль»)
 *
 * ## Errors
 *
 * | Code | Meaning |
 * | --- | --- |
 * | `EMPTY_INPUT` | Nothing to parse |
 * | `UNKNOWN_WORD` | A word is not in the vocabulary |
 * | `UNEXPECTED_TOKEN` / `UNEXPECTED_END` | Words are in an order the grammar does not accept |
 * | `OUT_OF_RANGE` | Hour 25, 30 February, every 90 minutes |
 * | `AMBIGUOUS` | A bare number could be a time or a day: add «в»/"at" or «числа»/"th" |
 * | `CONFLICT` | Parts contradict each other, or cron would combine them with OR |
 * | `INCOMPLETE` | «с 9 до 18» without an interval, "every" without a unit |
 * | `UNSUPPORTED` | Last day of month, seconds, exclusions, every 2 weeks |
 * | `INVALID_CRON` | {@link parseCron} received a malformed expression |
 *
 * ## Semantics worth knowing
 *
 * - «с 9 до 18» with a minute interval ends before 18:00 (`9-17`); with an hour interval 18:00 is included (`9-18`).
 * - Cron ORs day-of-month and day-of-week, so «по понедельникам 1 числа» is rejected instead of silently meaning "every Monday or the 1st".
 * - Several times must form a grid: `9:00, 9:30, 18:00, 18:30` works, `9:00 and 18:30` needs two schedules.
 * - "Weekly" means Sunday, as `@weekly`; change it with {@link ParseOptions.weeklyOn}.
 * - {@link nextRuns} supports local time and UTC and skips times that fall into a DST gap.
 *
 * @module
 */
import { CronsenseError } from './errors.js';
import { parse } from './parser.js';
import type { ParseOptions, Schedule } from './types.js';

/** Result of {@link safeParse}. */
export type SafeParseResult =
  | { readonly ok: true; readonly schedule: Schedule }
  | { readonly ok: false; readonly error: CronsenseError };

/** Like {@link parse}, but returns the error instead of throwing it. */
export const safeParse = (input: string, options: ParseOptions = {}): SafeParseResult => {
  try {
    return { ok: true, schedule: parse(input, options) };
  } catch (error: unknown) {
    if (error instanceof CronsenseError) return { ok: false, error };
    throw error;
  }
};

/**
 * Converts a schedule description straight to a cron string.
 *
 * @example
 * ```ts
 * toCron('every hour on weekdays'); // '0 * * * 1-5'
 * ```
 */
export const toCron = (input: string, options: ParseOptions = {}): string => parse(input, options).cron;

export { parse };
export { parseCron } from './cron.js';
export { describe, type DescribeOptions, type Locale } from './describe.js';
export { nextRuns } from './next.js';
export { formatCron } from './field.js';
export { CronsenseError, isCronsenseError, type ErrorCode } from './errors.js';
export type {
  CronField,
  CronFields,
  FieldName,
  NextRunsOptions,
  ParseOptions,
  Schedule,
  Span,
  Timezone,
  Weekday,
} from './types.js';
