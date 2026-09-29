import { RRule } from 'rrule';
import { describe, expect, it } from 'vitest';
import { occurrences, safeParse, toCron, toRRule, type ErrorCode } from '../src/index.js';

const year = { from: new Date(Date.UTC(2026, 0, 1)), to: new Date(Date.UTC(2026, 11, 31, 23, 59)), timezone: 'utc' } as const;
const days = (text: string, options: { readonly easter?: 'orthodox' | 'western' } = {}): string[] =>
  occurrences(text, { ...year, ...options }).map((date) => date.toISOString().slice(0, 16));

const FIXED: ReadonlyArray<readonly [string, string, string]> = [
  ['на Новый год', '0 0 1 1 *', '2026-01-01T00:00'],
  ['в Рождество', '0 0 7 1 *', '2026-01-07T00:00'],
  ['на Рождество Христово в 10 утра', '0 10 7 1 *', '2026-01-07T10:00'],
  ['в католическое Рождество', '0 0 25 12 *', '2026-12-25T00:00'],
  ['в Рождественский сочельник', '0 0 6 1 *', '2026-01-06T00:00'],
  ['на Крещение', '0 0 19 1 *', '2026-01-19T00:00'],
  ['в День защитника Отечества', '0 0 23 2 *', '2026-02-23T00:00'],
  ['в Международный женский день', '0 0 8 3 *', '2026-03-08T00:00'],
  ['в Праздник Весны и Труда', '0 0 1 5 *', '2026-05-01T00:00'],
  ['в День Победы в 10 утра', '0 10 9 5 *', '2026-05-09T10:00'],
  ['в День России', '0 0 12 6 *', '2026-06-12T00:00'],
  ['в День знаний в 8:30', '30 8 1 9 *', '2026-09-01T08:30'],
  ['в День народного единства', '0 0 4 11 *', '2026-11-04T00:00'],
  ['в День святого Валентина', '0 0 14 2 *', '2026-02-14T00:00'],
  ['christmas', '0 0 25 12 *', '2026-12-25T00:00'],
  ['orthodox christmas', '0 0 7 1 *', '2026-01-07T00:00'],
  ["new year's eve at 11pm", '0 23 31 12 *', '2026-12-31T23:00'],
  ['halloween', '0 0 31 10 *', '2026-10-31T00:00'],
  ['1 января и 1 мая', '0 0 1 1,5 *', '2026-01-01T00:00'],
];

describe('fixed holidays', () => {
  it.each(FIXED)('%s → %s', (text, cron, first) => {
    expect(toCron(text)).toBe(cron);
    expect(days(text)[0]).toBe(first);
    const oracle = new RRule({ ...RRule.parseString(toRRule(text)), dtstart: year.from }).between(year.from, year.to, true);
    expect(oracle.map((date) => date.toISOString().slice(0, 16))).toEqual(days(text));
  });
});

const MOVABLE: ReadonlyArray<readonly [string, readonly string[]]> = [
  ['на Масленицу', ['2026-02-16', '2026-02-17', '2026-02-18', '2026-02-19', '2026-02-20', '2026-02-21', '2026-02-22']],
  ['в Прощёное воскресенье', ['2026-02-22']],
  ['в Чистый понедельник', ['2026-02-23']],
  ['в Вербное воскресенье', ['2026-04-05']],
  ['в Страстную пятницу', ['2026-04-10']],
  ['на Радоницу', ['2026-04-21']],
  ['на Вознесение', ['2026-05-21']],
  ['в Троицу', ['2026-05-31']],
  ['на Пятидесятницу', ['2026-05-31']],
  ['в Духов день', ['2026-06-01']],
  ['на католическую Троицу', ['2026-05-24']],
  ['good friday', ['2026-04-03']],
  ['easter monday', ['2026-04-06']],
  ['ash wednesday', ['2026-02-18']],
  ['shrove tuesday', ['2026-02-17']],
  ['pentecost', ['2026-05-24']],
  ['corpus christi', ['2026-06-04']],
  ['orthodox good friday', ['2026-04-10']],
];

describe('movable holidays', () => {
  it.each(MOVABLE)('%s', (text, expected) => {
    expect(days(text).map((date) => date.slice(0, 10))).toEqual(expected);
  });

  it('matches rrule.js BYEASTER for single Western holidays', () => {
    for (const text of ['good friday', 'easter monday', 'ash wednesday', 'pentecost', 'corpus christi']) {
      const oracle = new RRule({ ...RRule.parseString(toRRule(text)), dtstart: year.from }).between(year.from, year.to, true);
      expect(oracle.map((date) => date.toISOString().slice(0, 16))).toEqual(days(text));
    }
  });

  it('follows the easter option', () => {
    expect(days('в Троицу', { easter: 'western' })).toEqual(['2026-05-24T00:00']);
    expect(days('в Рождество', { easter: 'western' })).toEqual(['2026-12-25T00:00']);
  });
});

describe('holiday lists', () => {
  it('keeps exact dates instead of a cross product', () => {
    expect(days('на 23 февраля и 8 марта')).toEqual(['2026-02-23T00:00', '2026-03-08T00:00']);
    expect(days('в День защитника Отечества и в Международный женский день')).toEqual(['2026-02-23T00:00', '2026-03-08T00:00']);
    expect(days('в Рождество и в Пасху')).toEqual(['2026-01-07T00:00', '2026-04-12T00:00']);
    expect(days('в Новый год, Рождество и День Победы в 12:00')).toEqual(['2026-01-01T12:00', '2026-01-07T12:00', '2026-05-09T12:00']);
  });

  it('still builds grids when the dates form one', () => {
    expect(toCron('1 и 15 января')).toBe('0 0 1,15 1 *');
    expect(toCron('в январе и июле 1 числа')).toBe('0 0 1 1,7 *');
    expect(toCron('1 числа в январе и июле')).toBe('0 0 1 1,7 *');
  });
});

const ERRORS: ReadonlyArray<readonly [() => unknown, ErrorCode]> = [
  [() => toCron('на 23 февраля и 8 марта'), 'UNSUPPORTED'],
  [() => toRRule('на 23 февраля и 8 марта'), 'UNSUPPORTED'],
  [() => toCron('в Троицу'), 'UNSUPPORTED'],
  [() => toRRule('в Троицу'), 'UNSUPPORTED'],
  [() => toRRule('в Рождество и в Пасху'), 'UNSUPPORTED'],
  [() => toRRule('good friday and easter monday'), 'UNSUPPORTED'],
  [() => toCron('в День Победы по будням'), 'CONFLICT'],
  [() => toCron('30 февраля'), 'OUT_OF_RANGE'],
  [() => toCron('31 апреля и 1 мая'), 'OUT_OF_RANGE'],
  [() => occurrences('в православную Троицу и в католическую Пасху', year), 'CONFLICT'],
];

describe('holiday errors', () => {
  it.each(ERRORS.map((entry, index) => [index, ...entry] as const))('#%i → %s', (_, run, code) => {
    let caught: unknown;
    try {
      run();
    } catch (error: unknown) {
      caught = error;
    }
    expect(caught).toMatchObject({ code });
  });

  it('does not treat «новый» alone as a holiday', () => {
    expect(safeParse('новый').ok).toBe(false);
    expect(toCron('каждый год')).toBe('0 0 1 1 *');
  });
});
