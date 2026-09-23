import { describe, expect, it } from 'vitest';
import { CronsenseError, nextRuns, parse, parseCron } from '../src/index.js';

describe('parseCron', () => {
  it.each([
    ['* * * * *', '* * * * *'],
    ['*/5 * * * *', '*/5 * * * *'],
    ['0 9-17 * * mon-fri', '0 9-17 * * 1-5'],
    ['0 0 1 jan,jul *', '0 0 1 1,7 *'],
    ['0 0 * * 7', '0 0 * * 0'],
    ['0 0 * * 5-7', '0 0 * * 0,5,6'],
    ['0 8-20/2 * * *', '0 8-20/2 * * *'],
    ['0 0 1/10 * *', '0 0 */10 * *'],
    ['0 0 2/10 * *', '0 0 2-31/10 * *'],
    ['1,2,3,10 * * * *', '1-3,10 * * * *'],
    ['@daily', '0 0 * * *'],
    ['@weekly', '0 0 * * 0'],
    ['  @HOURLY  ', '0 * * * *'],
  ])('%s → %s', (input, cron) => {
    expect(parseCron(input).cron).toBe(cron);
  });

  it.each(['', '* * * *', '* * * * * *', '60 * * * *', '* 24 * * *', '* * 0 * *', '* * * 13 *', '* * * * 8', '5-1 * * * *', '*/0 * * * *', 'a * * * *', '@reboot'])(
    'rejects %j',
    (input) => {
      expect(() => parseCron(input)).toThrow(CronsenseError);
    },
  );
});

describe('nextRuns', () => {
  const from = new Date(Date.UTC(2026, 8, 23, 10, 0));
  const iso = (dates: readonly Date[]): string[] => dates.map((date) => date.toISOString());

  it('walks weekdays in UTC', () => {
    expect(iso(nextRuns(parse('по будням в 9:30'), { from, count: 4, timezone: 'utc' }))).toEqual([
      '2026-09-24T09:30:00.000Z',
      '2026-09-25T09:30:00.000Z',
      '2026-09-28T09:30:00.000Z',
      '2026-09-29T09:30:00.000Z',
    ]);
  });

  it('excludes the starting instant', () => {
    expect(iso(nextRuns('0 10 * * *', { from, count: 1, timezone: 'utc' }))).toEqual(['2026-09-24T10:00:00.000Z']);
  });

  it('finds leap days', () => {
    expect(iso(nextRuns('0 0 29 2 *', { from, count: 2, timezone: 'utc' }))).toEqual([
      '2028-02-29T00:00:00.000Z',
      '2032-02-29T00:00:00.000Z',
    ]);
  });

  it('uses cron OR semantics when both day fields are set', () => {
    expect(iso(nextRuns('0 0 1 * 1', { from, count: 3, timezone: 'utc' }))).toEqual([
      '2026-09-28T00:00:00.000Z',
      '2026-10-01T00:00:00.000Z',
      '2026-10-05T00:00:00.000Z',
    ]);
  });

  it('returns nothing for impossible dates', () => {
    expect(nextRuns('0 0 31 2 *', { from, count: 3, timezone: 'utc' })).toEqual([]);
  });

  it('supports count 0 and rejects bad options', () => {
    expect(nextRuns('* * * * *', { from, count: 0 })).toEqual([]);
    expect(() => nextRuns('* * * * *', { count: -1 })).toThrow(CronsenseError);
    expect(() => nextRuns('* * * * *', { from: new Date(Number.NaN) })).toThrow(CronsenseError);
  });

  it('works in local time', () => {
    const local = new Date(2026, 0, 1, 12, 0);
    const [run] = nextRuns(parse('every day at 9am'), { from: local, count: 1 });
    expect(run?.getHours()).toBe(9);
    expect(run?.getDate()).toBe(2);
  });
});
