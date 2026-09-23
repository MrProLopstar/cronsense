import type { CronField, CronFields, FieldName } from './types.js';

export interface FieldBounds {
  readonly min: number;
  readonly max: number;
}

export const FIELD_ORDER: readonly FieldName[] = ['minute', 'hour', 'dayOfMonth', 'month', 'dayOfWeek'];

export const BOUNDS: { readonly [K in FieldName]: FieldBounds } = {
  minute: { min: 0, max: 59 },
  hour: { min: 0, max: 23 },
  dayOfMonth: { min: 1, max: 31 },
  month: { min: 1, max: 12 },
  dayOfWeek: { min: 0, max: 6 },
};

export const DAYS_IN_MONTH: readonly number[] = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

export const ANY: CronField = { kind: 'any' };

export const valuesField = (values: Iterable<number>): CronField => ({
  kind: 'values',
  values: [...new Set(values)].sort((a, b) => a - b),
});

export const stepField = (name: FieldName, step: number, from?: number, to?: number): CronField => {
  const bounds = BOUNDS[name];
  const start = from ?? bounds.min;
  const end = to ?? bounds.max;
  if (step === 1 && start === bounds.min && end === bounds.max) return ANY;
  return { kind: 'step', from: start, to: end, step };
};

export const isAny = (field: CronField): boolean => field.kind === 'any';

export const expandField = (name: FieldName, field: CronField): readonly number[] => {
  switch (field.kind) {
    case 'any': {
      const { min, max } = BOUNDS[name];
      return range(min, max, 1);
    }
    case 'step':
      return range(field.from, field.to, field.step);
    case 'values':
      return field.values;
  }
};

const range = (from: number, to: number, step: number): number[] => {
  const result: number[] = [];
  for (let value = from; value <= to; value += step) result.push(value);
  return result;
};

const compressValues = (values: readonly number[]): string => {
  const parts: string[] = [];
  let index = 0;
  while (index < values.length) {
    const start = values[index] ?? 0;
    let end = start;
    while (values[index + 1] === end + 1) {
      end += 1;
      index += 1;
    }
    if (end - start >= 2) parts.push(`${start}-${end}`);
    else if (end > start) parts.push(`${start},${end}`);
    else parts.push(String(start));
    index += 1;
  }
  return parts.join(',');
};

export const formatField = (name: FieldName, field: CronField): string => {
  switch (field.kind) {
    case 'any':
      return '*';
    case 'values':
      return compressValues(field.values);
    case 'step': {
      const { min, max } = BOUNDS[name];
      if (field.step === 1) return field.from === min && field.to === max ? '*' : `${field.from}-${field.to}`;
      if (field.from === min && field.to === max) return `*/${field.step}`;
      return `${field.from}-${field.to}/${field.step}`;
    }
  }
};

/** Formats structured fields into a cron expression. */
export const formatCron = (fields: CronFields): string =>
  FIELD_ORDER.map((name) => formatField(name, fields[name])).join(' ');
