import { CronsenseError } from './errors.js';
import { parse } from './parser.js';
import type { ParseOptions, Schedule } from './types.js';

export type SafeParseResult =
  | { readonly ok: true; readonly schedule: Schedule }
  | { readonly ok: false; readonly error: CronsenseError };

export const safeParse = (input: string, options: ParseOptions = {}): SafeParseResult => {
  try {
    return { ok: true, schedule: parse(input, options) };
  } catch (error: unknown) {
    if (error instanceof CronsenseError) return { ok: false, error };
    throw error;
  }
};

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
