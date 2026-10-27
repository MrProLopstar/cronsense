import { describe, expect, it } from 'vitest';
import { nextRuns, parse, toRRule, toSystemd, when } from '../src/index.js';

const now = new Date(Date.UTC(2026, 9, 27, 12, 0));
const at = (text: string): string => when(text, { now, timezone: 'utc' }).toISOString().slice(0, 16);
const code = (run: () => unknown): string | undefined => {
  try {
    run();
  } catch (error: unknown) {
    return (error as { code?: string }).code;
  }
  return undefined;
};

describe('dates with a year', () => {
  it.each([
    '8 ноября 2026 в 10:00',
    '8 ноября 2026 года в 10:00',
    '8 ноября 2026 г. в 10:00',
    '8.11.2026 в 10:00',
    '08.11.2026 10:00',
    '8/11/2026 в 10:00',
    '2026-11-08 10:00',
    '2026-11-08 в 10:00',
    'November 8, 2026 at 10am',
    'nov 8 2026 at 10:00',
  ])('%s', (text) => {
    const schedule = parse(text);
    expect(schedule.cron).toBe('0 10 8 11 *');
    expect(schedule.year).toBe(2026);
    expect(at(text)).toBe('2026-11-08T10:00');
  });

  it('reads a bare date as midnight', () => {
    expect(at('2026-11-08')).toBe('2026-11-08T00:00');
    expect(at('8 ноября 2026')).toBe('2026-11-08T00:00');
  });

  it('keeps nextRuns and systemd to the year', () => {
    expect(nextRuns(parse('8.11.2026 в 10:00'), { from: now, count: 3, timezone: 'utc' }).map((run) => run.toISOString())).toEqual(['2026-11-08T10:00:00.000Z']);
    expect(toSystemd('8.11.2026 в 10:00')).toEqual(['2026-11-08 10:00:00']);
  });

  it('ends the RRULE with the year', () => {
    expect(toRRule('8.11.2026 в 10:00')).toBe('FREQ=YEARLY;BYMONTH=11;BYMONTHDAY=8;BYHOUR=10;BYMINUTE=0;UNTIL=20261231T235959');
    expect(toRRule('2026-11-08')).toBe('FREQ=YEARLY;BYMONTH=11;BYMONTHDAY=8;BYHOUR=0;BYMINUTE=0;UNTIL=20261231T235959');
  });

  it('leaves a date without a year and plain times alone', () => {
    expect(parse('8 ноября в 10:00').year).toBeUndefined();
    expect(parse('в 9.30').cron).toBe('30 9 * * *');
  });

  it('rejects impossible dates and the past', () => {
    expect(code(() => parse('8.13.2026'))).toBe('OUT_OF_RANGE');
    expect(code(() => parse('31.02.2026 в 10:00'))).toBe('OUT_OF_RANGE');
    expect(() => when('8 ноября 2025 в 10:00', { now, timezone: 'utc' })).toThrow(/already in the past/);
    expect(code(() => parse('8 ноября 2026 и 2027-11-08'))).toBe('CONFLICT');
  });
});
