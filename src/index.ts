/**
 * Turn plain Russian or English schedules into cron expressions.
 *
 * @example
 * ```ts
 * import { toCron } from '@mrprolopstar/cronsense';
 *
 * toCron('по будням в 9:30'); // '30 9 * * 1-5'
 * ```
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
 * toCron('every 15 minutes'); // '*\/15 * * * *'
 * ```
 */
export const toCron = (input: string, options: ParseOptions = {}): string => parse(input, options).cron;

export { parse };
export { parseCron } from './cron.js';
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
