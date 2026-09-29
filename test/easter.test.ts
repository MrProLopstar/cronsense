import { RRule } from 'rrule';
import { describe, expect, it } from 'vitest';
import { easterDate, occurrences, safeParse, toRRule, type ErrorCode } from '../src/index.js';

const iso = (dates: readonly Date[]): string[] => dates.map((date) => date.toISOString().slice(0, 16));
const range = { from: new Date(Date.UTC(2026, 0, 1)), to: new Date(Date.UTC(2027, 11, 31, 23, 59)), timezone: 'utc' } as const;

const KNOWN: ReadonlyArray<readonly [number, string, string]> = [
  [2000, '4-30', '4-23'],
  [2010, '4-4', '4-4'],
  [2019, '4-28', '4-21'],
  [2021, '5-2', '4-4'],
  [2023, '4-16', '4-9'],
  [2024, '5-5', '3-31'],
  [2025, '4-20', '4-20'],
  [2026, '4-12', '4-5'],
  [2027, '5-2', '3-28'],
  [2030, '4-28', '4-21'],
  [2038, '4-25', '4-25'],
  [2100, '5-2', '3-28'],
];

describe('easterDate', () => {
  it.each(KNOWN)('%i: Orthodox %s, Western %s', (year, orthodox, western) => {
    const format = ({ month, day }: { readonly month: number; readonly day: number }): string => `${month}-${day}`;
    expect(format(easterDate(year, 'orthodox'))).toBe(orthodox);
    expect(format(easterDate(year, 'western'))).toBe(western);
  });

  it('is always a Sunday within the canonical bounds', () => {
    for (let year = 1583; year <= 4099; year += 1) {
      const western = easterDate(year, 'western');
      expect(new Date(Date.UTC(year, western.month - 1, western.day)).getUTCDay()).toBe(0);
      expect(western.month * 100 + western.day).toBeGreaterThanOrEqual(322);
      expect(western.month * 100 + western.day).toBeLessThanOrEqual(425);
      const orthodox = easterDate(year, 'orthodox');
      expect(new Date(Date.UTC(year, orthodox.month - 1, orthodox.day)).getUTCDay()).toBe(0);
      if (year >= 1900 && year <= 2099) {
        expect(orthodox.month * 100 + orthodox.day).toBeGreaterThanOrEqual(404);
        expect(orthodox.month * 100 + orthodox.day).toBeLessThanOrEqual(508);
      }
    }
  });

  it('matches rrule.js BYEASTER for Western Easter', () => {
    const rule = new RRule({ ...RRule.parseString('FREQ=YEARLY;BYEASTER=0;BYHOUR=0;BYMINUTE=0'), dtstart: new Date(Date.UTC(1990, 0, 1)) });
    const dates = rule.between(new Date(Date.UTC(1990, 0, 1)), new Date(Date.UTC(2100, 0, 1)));
    expect(dates.length).toBeGreaterThan(100);
    for (const date of dates) {
      const { month, day } = easterDate(date.getUTCFullYear(), 'western');
      expect([month, day]).toEqual([date.getUTCMonth() + 1, date.getUTCDate()]);
    }
  });

  it('rejects years outside the computus range', () => {
    expect(() => easterDate(1500, 'western')).toThrow(RangeError);
  });
});

const PHRASES: ReadonlyArray<readonly [string, readonly string[]]> = [
  ['в Пасху', ['2026-04-12T00:00', '2027-05-02T00:00']],
  ['на Пасху в 10 утра', ['2026-04-12T10:00', '2027-05-02T10:00']],
  ['через 49 дней после Пасхи', ['2026-05-31T00:00', '2027-06-20T00:00']],
  ['на 50-й день после Пасхи', ['2026-05-31T00:00', '2027-06-20T00:00']],
  ['за 7 дней до Пасхи', ['2026-04-05T00:00', '2027-04-25T00:00']],
  ['в православную Пасху', ['2026-04-12T00:00', '2027-05-02T00:00']],
  ['за 46 дней до католической Пасхи', ['2026-02-18T00:00', '2027-02-10T00:00']],
  ['в Пасху и через 49 дней после Пасхи', ['2026-04-12T00:00', '2026-05-31T00:00', '2027-05-02T00:00', '2027-06-20T00:00']],
  ['easter at 9am', ['2026-04-05T09:00', '2027-03-28T09:00']],
  ['49 days after easter', ['2026-05-24T00:00', '2027-05-16T00:00']],
  ['2 days before easter', ['2026-04-03T00:00', '2027-03-26T00:00']],
  ['orthodox easter', ['2026-04-12T00:00', '2027-05-02T00:00']],
];

describe('occurrences with Easter', () => {
  it.each(PHRASES)('%s', (text, expected) => {
    expect(iso(occurrences(text, range))).toEqual(expected);
  });

  it('lets the option override the calendar', () => {
    expect(iso(occurrences('в Пасху', { ...range, easter: 'western' }))).toEqual(['2026-04-05T00:00', '2027-03-28T00:00']);
  });

  it('writes Western Easter as BYEASTER and checks it against rrule.js', () => {
    for (const [text, offset] of [['easter', 0], ['49 days after easter', 49], ['за 46 дней до католической Пасхи', -46]] as const) {
      const rule = toRRule(text);
      expect(rule).toBe(`FREQ=YEARLY;BYHOUR=0;BYMINUTE=0;BYEASTER=${offset}`);
      const dates = new RRule({ ...RRule.parseString(rule), dtstart: range.from }).between(range.from, range.to, true);
      expect(iso(dates)).toEqual(iso(occurrences(text, range)));
    }
  });
});

const ERRORS: ReadonlyArray<readonly [() => unknown, ErrorCode]> = [
  [() => toRRule('в Пасху'), 'UNSUPPORTED'],
  [() => toRRule('easter and 49 days after easter'), 'UNSUPPORTED'],
  [() => occurrences('в православную Пасху и в католическую Пасху', range), 'CONFLICT'],
  [() => occurrences('после Пасхи', range), 'UNEXPECTED_TOKEN'],
  [() => occurrences('каждые 2 недели', range), 'INCOMPLETE'],
];

describe('Easter errors', () => {
  it('is not expressible in cron', () => {
    const result = safeParse('в Пасху');
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
