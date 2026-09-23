export type Unit = 'minute' | 'hour' | 'day' | 'week' | 'month' | 'year';

export type Meridiem = 'am' | 'pm' | 'night';

export type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export interface Span {
  readonly start: number;
  readonly end: number;
}

export type FieldName = 'minute' | 'hour' | 'dayOfMonth' | 'month' | 'dayOfWeek';

export type CronField =
  | { readonly kind: 'any' }
  | { readonly kind: 'step'; readonly from: number; readonly to: number; readonly step: number }
  | { readonly kind: 'values'; readonly values: readonly number[] };

export type CronFields = { readonly [K in FieldName]: CronField };

export interface Schedule {
  readonly cron: string;
  readonly fields: CronFields;
}

export interface ParseOptions {
  readonly weeklyOn?: Weekday;
}

export type Timezone = 'local' | 'utc';

export interface NextRunsOptions {
  readonly count?: number;
  readonly from?: Date;
  readonly timezone?: Timezone;
}
