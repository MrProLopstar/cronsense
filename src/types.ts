/** Time unit used by intervals such as "every 5 minutes". */
export type Unit = 'minute' | 'hour' | 'day' | 'week' | 'month' | 'year';

/** Part of day that qualifies an hour: am, pm or night («ночи»). */
export type Meridiem = 'am' | 'pm' | 'night';

/** Day of week as in cron: 0 is Sunday, 6 is Saturday. */
export type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6;

/** Character range in the input string, `end` is exclusive. */
export interface Span {
  readonly start: number;
  readonly end: number;
}

/** Name of one of the five cron fields. */
export type FieldName = 'minute' | 'hour' | 'dayOfMonth' | 'month' | 'dayOfWeek';

/** Structured value of a single cron field: any value, a stepped range or an explicit list. */
export type CronField =
  | { readonly kind: 'any' }
  | { readonly kind: 'step'; readonly from: number; readonly to: number; readonly step: number }
  | { readonly kind: 'values'; readonly values: readonly number[] };

/** All five cron fields in structured form. */
export type CronFields = { readonly [K in FieldName]: CronField };

/** Parsed schedule: the cron expression and its structured fields. */
export interface Schedule {
  readonly cron: string;
  readonly fields: CronFields;
}

/** Options for {@link parse}. */
export interface ParseOptions {
  /** Weekday used for "weekly" / «еженедельно» when no day is given. Defaults to 0 (Sunday), as `@weekly`. */
  readonly weeklyOn?: Weekday;
}

/** Time zone used to compute run times. */
export type Timezone = 'local' | 'utc';

/** Options for {@link nextRuns}. */
export interface NextRunsOptions {
  /** Number of run times to return. Defaults to 5. */
  readonly count?: number;
  /** Start point, exclusive. Defaults to now. */
  readonly from?: Date;
  /** Compute in local time or UTC. Defaults to `'local'`. */
  readonly timezone?: Timezone;
}
