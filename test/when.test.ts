import { describe, expect, it } from 'vitest';
import { occurrences, toCron, toRRule, when } from '../src/index.js';

const now = new Date(Date.UTC(2026, 9, 5, 10, 5));
const at = (text: string): string => when(text, { now, timezone: 'utc' }).toISOString().slice(0, 16);
const code = (run: () => unknown): string | undefined => {
  try {
    run();
  } catch (error: unknown) {
    return (error as { code?: string }).code;
  }
  return undefined;
};

describe('when', () => {
  it.each([
    ['сегодня в двенадцать семнадцать', '2026-10-05T12:17'],
    ['завтра в двенадцать семнадцать', '2026-10-06T12:17'],
    ['послезавтра в 9 утра', '2026-10-07T09:00'],
    ['через четыре часа', '2026-10-05T14:05'],
    ['через 2 часа 30 минут', '2026-10-05T12:35'],
    ['через полчаса', '2026-10-05T10:35'],
    ['через полтора часа', '2026-10-05T11:35'],
    ['через неделю в 10', '2026-10-12T10:00'],
    ['через месяц ровно, в двенадцать семнадцать', '2026-11-05T12:17'],
    ['через год', '2027-10-05T10:05'],
    ['через год ровно', '2027-10-05T10:05'],
    ['in 3 days at 5pm', '2026-10-08T17:00'],
    ['tomorrow at 9am', '2026-10-06T09:00'],
  ])('%s → %s', (text, expected) => {
    expect(at(text)).toBe(expected);
  });

  it('clamps month arithmetic to the last day of the month', () => {
    expect(when('через месяц', { now: new Date(Date.UTC(2026, 0, 31, 8)), timezone: 'utc' }).toISOString()).toBe('2026-02-28T08:00:00.000Z');
  });

  it('resolves recurring phrases to their next run', () => {
    expect(at('по будням в 9:30')).toBe('2026-10-06T09:30');
    expect(at('в пятницу в 19:00')).toBe('2026-10-09T19:00');
  });

  it('asks for what is missing', () => {
    expect(code(() => when('завтра', { now }))).toBe('INCOMPLETE');
    expect(code(() => when('через', { now }))).toBe('INCOMPLETE');
    expect(code(() => when('завтра по пятницам', { now }))).toBe('UNSUPPORTED');
  });

  it('points cron users to when()', () => {
    expect(code(() => toCron('через четыре часа'))).toBe('UNSUPPORTED');
    expect(code(() => toCron('завтра в 12:17'))).toBe('UNSUPPORTED');
    expect(toCron('через день')).toBe('0 0 */2 * *');
  });
});

describe('second round of Habr testing', () => {
  it.each([
    ['каждый месяц, третьего числа, в двенадцать семнадцать', '17 12 3 * *'],
    ['три раза в месяц, восьмого, десятого и двенадцатого числа в три часа дня', '0 15 8,10,12 * *'],
    ['два раза в неделю по вторникам и пятницам', '0 0 * * 2,5'],
    ['два раза в год, в марте и сентябре', '0 0 1 3,9 *'],
    ['восьмого и двенадцатого числа в одну минуту пополудни', '1 12 8,12 * *'],
    ['каждый чётный месяц, второго числа', '0 0 2 2,4,6,8,10,12 *'],
    ['по нечётным месяцам в 10', '0 10 1 1,3,5,7,9,11 *'],
    ['раз в полугодие', '0 0 1 */6 *'],
  ])('%s → %s', (text, cron) => {
    expect(toCron(text)).toBe(cron);
  });

  it('checks the count against the listed days', () => {
    expect(code(() => toCron('три раза в месяц'))).toBe('UNSUPPORTED');
    expect(code(() => toCron('два раза в месяц, 1 числа'))).toBe('CONFLICT');
  });

  it('reads even and odd weekdays as their positions in the month', () => {
    expect(toRRule('каждый чётный четверг')).toBe('FREQ=MONTHLY;BYDAY=2TH,4TH;BYHOUR=0;BYMINUTE=0');
    expect(toRRule('по нечётным пятницам в 10')).toBe('FREQ=MONTHLY;BYDAY=1FR,3FR,5FR;BYHOUR=10;BYMINUTE=0');
    const days = occurrences('каждый чётный четверг', { from: new Date(Date.UTC(2026, 9, 1)), to: new Date(Date.UTC(2026, 9, 31)), timezone: 'utc' });
    expect(days.map((day) => day.toISOString().slice(0, 10))).toEqual(['2026-10-08', '2026-10-22']);
    expect(code(() => toCron('каждый чётный четверг'))).toBe('UNSUPPORTED');
  });

  it('knows that some things never happen', () => {
    for (const text of ['когда рак на горе свистнет', 'после дождичка в четверг', 'when pigs fly']) {
      expect(code(() => toCron(text))).toBe('UNSUPPORTED');
    }
  });
});
