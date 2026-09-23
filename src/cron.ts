import { CronsenseError } from './errors.js';
import { ANY, BOUNDS, FIELD_ORDER, formatCron, stepField, valuesField } from './field.js';
import type { CronField, FieldName, Schedule } from './types.js';

const MACROS: Readonly<Record<string, string>> = {
  '@yearly': '0 0 1 1 *',
  '@annually': '0 0 1 1 *',
  '@monthly': '0 0 1 * *',
  '@weekly': '0 0 * * 0',
  '@daily': '0 0 * * *',
  '@midnight': '0 0 * * *',
  '@hourly': '0 * * * *',
};

const NAMES: Partial<Record<FieldName, readonly string[]>> = {
  month: ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'],
  dayOfWeek: ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'],
};

const TERM = /^(\*|[a-z0-9]+(?:-[a-z0-9]+)?)(?:\/(\d+))?$/;

export const parseCron = (expression: string): Schedule => {
  const source = expression.trim().toLowerCase();
  const normalized = MACROS[source] ?? source;
  const parts = normalized.split(/\s+/).filter((part) => part.length > 0);
  if (parts.length !== FIELD_ORDER.length) {
    throw new CronsenseError('INVALID_CRON', `Expected 5 fields, got ${parts.length}`, expression);
  }

  const entries = FIELD_ORDER.map((name, index) => [name, parseField(name, parts[index] ?? '', expression)] as const);
  const fields = Object.fromEntries(entries) as { [K in FieldName]: CronField };
  return { cron: formatCron(fields), fields };
};

const parseValue = (name: FieldName, raw: string, expression: string): number => {
  const named = NAMES[name]?.indexOf(raw) ?? -1;
  const value = named >= 0 ? named + (name === 'month' ? 1 : 0) : /^\d+$/.test(raw) ? Number(raw) : Number.NaN;
  const normalized = name === 'dayOfWeek' && value === 7 ? 0 : value;
  const { min, max } = BOUNDS[name];
  const upper = name === 'dayOfWeek' ? 7 : max;
  if (!Number.isInteger(value) || value < min || value > upper) {
    throw new CronsenseError('INVALID_CRON', `Invalid ${name} value "${raw}"`, expression);
  }
  return normalized;
};

const parseField = (name: FieldName, raw: string, expression: string): CronField => {
  const terms = raw.split(',');
  const values: number[] = [];
  const { min, max } = BOUNDS[name];

  for (const term of terms) {
    const match = TERM.exec(term);
    if (match === null) throw new CronsenseError('INVALID_CRON', `Invalid ${name} field "${raw}"`, expression);
    const [, body = '', stepRaw] = match;
    const step = stepRaw === undefined ? 1 : Number(stepRaw);
    if (step < 1) throw new CronsenseError('INVALID_CRON', `Invalid step in "${term}"`, expression);

    let from = min;
    let to = max;
    if (body !== '*') {
      const [start = '', end] = body.split('-');
      from = parseValue(name, start, expression);
      to = end === undefined ? (stepRaw === undefined ? from : max) : parseValue(name, end, expression);
      if (name === 'dayOfWeek' && end !== undefined && to === 0 && from > 0) to = 7;
      if (from > to) throw new CronsenseError('INVALID_CRON', `Range "${term}" goes backwards`, expression);
    }

    if (terms.length === 1) {
      if (body === '*' && step === 1) return ANY;
      if (step > 1 || from !== to) {
        if (to <= max) return stepField(name, step, from, to);
      }
    }
    for (let value = from; value <= to; value += step) values.push(value % (name === 'dayOfWeek' ? 7 : max + 1));
  }

  return valuesField(values);
};
