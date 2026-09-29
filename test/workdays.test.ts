import { isWorkday } from '@mrprolopstar/prodcal';
import { RRule } from 'rrule';
import { describe, expect, it } from 'vitest';
import { occurrences, safeParse, toCron, toRRule, type ErrorCode } from '../src/index.js';

const year2026 = { from: new Date(Date.UTC(2026, 0, 1)), to: new Date(Date.UTC(2026, 11, 31, 23, 59)), timezone: 'utc', isWorkday } as const;
const days = (dates: readonly Date[]): string[] => dates.map((date) => date.toISOString().slice(0, 10));

describe('working days with a production calendar', () => {
  it('finds the first working day of each month', () => {
    expect(days(occurrences('в первый рабочий день месяца в 9:00', year2026))).toEqual([
      '2026-01-12', '2026-02-02', '2026-03-02', '2026-04-01', '2026-05-04', '2026-06-01',
      '2026-07-01', '2026-08-03', '2026-09-01', '2026-10-01', '2026-11-02', '2026-12-01',
    ]);
  });

  it('finds the last working day of each month', () => {
    const result = days(occurrences('в последний рабочий день месяца в 18:00', year2026));
    expect(result).toHaveLength(12);
    expect(result[0]).toBe('2026-01-30');
    expect(result[4]).toBe('2026-05-29');
    expect(result[11]).toBe('2026-12-30');
    for (const day of result) expect(isWorkday(day)).toBe(true);
  });

  it('counts the Nth working day', () => {
    expect(days(occurrences('в третий рабочий день месяца', { ...year2026, to: new Date(Date.UTC(2026, 1, 28)) }))).toEqual(['2026-01-14', '2026-02-04']);
    expect(days(occurrences('в 5-й рабочий день января', year2026))).toEqual(['2026-01-16']);
  });

  it('skips holidays and transferred days for «по рабочим дням»', () => {
    const january = days(occurrences('по рабочим дням в 9:30', { ...year2026, to: new Date(Date.UTC(2026, 0, 31, 23, 59)) }));
    expect(january).toHaveLength(15);
    expect(january[0]).toBe('2026-01-12');
    for (const day of january) expect(isWorkday(day)).toBe(true);
  });

  it('keeps working Saturdays and extra weekend days', () => {
    const saturdayWork = days(occurrences('по рабочим дням', { ...year2026, from: new Date(Date.UTC(2025, 10, 1)), to: new Date(Date.UTC(2025, 10, 2)) }));
    expect(saturdayWork).toEqual(['2025-11-01']);
    const withSaturdays = days(occurrences('по рабочим дням и по субботам', { ...year2026, to: new Date(Date.UTC(2026, 0, 11, 23, 59)) }));
    expect(withSaturdays).toEqual(['2026-01-03', '2026-01-10']);
  });

  it('matches the calendar count for every month of 2026', () => {
    for (let month = 1; month <= 12; month += 1) {
      const from = new Date(Date.UTC(2026, month - 1, 1));
      const to = new Date(Date.UTC(2026, month, 0, 23, 59));
      const expected = Array.from({ length: to.getUTCDate() }, (_, index) => `2026-${String(month).padStart(2, '0')}-${String(index + 1).padStart(2, '0')}`).filter(isWorkday);
      expect(days(occurrences('по рабочим дням', { ...year2026, from, to }))).toEqual(expected);
    }
  });
});

describe('weekdays without a calendar', () => {
  it('uses Monday to Friday for «будний день»', () => {
    expect(days(occurrences('в первый будний день месяца', { ...year2026, to: new Date(Date.UTC(2026, 4, 31)) }))).toEqual([
      '2026-01-01', '2026-02-02', '2026-03-02', '2026-04-01', '2026-05-01',
    ]);
  });

  it('writes weekday positions as BYSETPOS and matches rrule.js', () => {
    for (const [text, rule] of [
      ['в первый будний день месяца в 9:00', 'FREQ=MONTHLY;BYDAY=MO,TU,WE,TH,FR;BYSETPOS=1;BYHOUR=9;BYMINUTE=0'],
      ['в последний будний день месяца в 18:00', 'FREQ=MONTHLY;BYDAY=MO,TU,WE,TH,FR;BYSETPOS=-1;BYHOUR=18;BYMINUTE=0'],
      ['last weekday of the month at 5pm', 'FREQ=MONTHLY;BYDAY=MO,TU,WE,TH,FR;BYSETPOS=-1;BYHOUR=17;BYMINUTE=0'],
    ] as const) {
      expect(toRRule(text)).toBe(rule);
      const oracle = new RRule({ ...RRule.parseString(rule), dtstart: year2026.from }).between(year2026.from, year2026.to, true);
      expect(occurrences(text, year2026).map((date) => date.toISOString())).toEqual(oracle.map((date) => date.toISOString()));
    }
  });

  it('keeps cron behaviour: «по рабочим дням» is Monday to Friday there', () => {
    expect(toCron('по рабочим дням в 9:30')).toBe('30 9 * * 1-5');
    expect(toCron('по будням в 9:30')).toBe('30 9 * * 1-5');
  });
});

const ERRORS: ReadonlyArray<readonly [() => unknown, ErrorCode]> = [
  [() => occurrences('в первый рабочий день месяца', { from: year2026.from, to: year2026.to }), 'INCOMPLETE'],
  [() => toRRule('в первый рабочий день месяца'), 'UNSUPPORTED'],
  [() => toRRule('в первый будний день месяца в 9:00 и 18:00'), 'UNSUPPORTED'],
  [() => toRRule('в первый рабочий день и в последний будний день'), 'CONFLICT'],
  [() => toRRule('в первый рабочий день месяца по пятницам'), 'CONFLICT'],
  [() => toRRule('в 24-й рабочий день'), 'OUT_OF_RANGE'],
];

describe('working day errors', () => {
  it('is not expressible in cron', () => {
    const result = safeParse('в последний рабочий день месяца');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('UNSUPPORTED');
  });

  it.each(ERRORS.map((entry, index) => [index, ...entry] as const))('#%i → %s', (_, run, code) => {
    let caught: unknown;
    try {
      run();
    } catch (error: unknown) {
      caught = error;
    }
    expect(caught).toMatchObject({ code });
  });
});
