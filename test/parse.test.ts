import { describe, expect, it } from 'vitest';
import { CronsenseError, parse, safeParse, toCron, type ErrorCode } from '../src/index.js';

const russian: ReadonlyArray<readonly [string, string]> = [
  ['каждую минуту', '* * * * *'],
  ['ежеминутно', '* * * * *'],
  ['каждые 15 минут', '*/15 * * * *'],
  ['раз в 5 минут', '*/5 * * * *'],
  ['каждый час', '0 * * * *'],
  ['ежечасно', '0 * * * *'],
  ['каждые 2 часа', '0 */2 * * *'],
  ['через час', '0 */2 * * *'],
  ['каждый день в 9:30', '30 9 * * *'],
  ['ежедневно', '0 0 * * *'],
  ['ежедневно в полдень', '0 12 * * *'],
  ['каждый день в полночь', '0 0 * * *'],
  ['по будням в 9:30', '30 9 * * 1-5'],
  ['по выходным в 10 утра', '0 10 * * 0,6'],
  ['в понедельник в 8', '0 8 * * 1'],
  ['каждый понедельник и пятницу в 18:00', '0 18 * * 1,5'],
  ['по понедельникам и по средам в 7 вечера', '0 19 * * 1,3'],
  ['с понедельника по пятницу в 9', '0 9 * * 1-5'],
  ['пн-пт в 9:15', '15 9 * * 1-5'],
  ['пт-пн в 23:00', '0 23 * * 0,1,5,6'],
  ['в 9 и 18 часов', '0 9,18 * * *'],
  ['в 9:00 и в 21:00', '0 9,21 * * *'],
  ['в 9:00, 9:30, 18:00 и 18:30', '0,30 9,18 * * *'],
  ['в 3 часа дня', '0 15 * * *'],
  ['в 11 ночи', '0 23 * * *'],
  ['в 2 ночи', '0 2 * * *'],
  ['в 12 ночи', '0 0 * * *'],
  ['в 9 часов 45 минут', '45 9 * * *'],
  ['каждые 15 минут с 9 до 18 по будням', '*/15 9-17 * * 1-5'],
  ['каждые 10 минут до 12', '*/10 0-11 * * *'],
  ['каждые 30 минут с 22 до 6', '*/30 0-5,22,23 * * *'],
  ['каждый час с 9 до 18', '0 9-18 * * *'],
  ['каждые 2 часа с 8:00 до 20:00', '0 8-20/2 * * *'],
  ['каждый час с 9:30 до 17:00', '30 9-16 * * *'],
  ['1 числа каждого месяца в полночь', '0 0 1 * *'],
  ['ежемесячно', '0 0 1 * *'],
  ['1 и 15 числа в 12:00', '0 12 1,15 * *'],
  ['с 1 по 10 число в 8:00', '0 8 1-10 * *'],
  ['каждое 5-е число в 10:00', '0 10 5 * *'],
  ['первого числа в 9', '0 9 1 * *'],
  ['15 января в 10 утра', '0 10 15 1 *'],
  ['31 декабря в 23:59', '59 23 31 12 *'],
  ['ежегодно', '0 0 1 1 *'],
  ['ежегодно 1 сентября', '0 0 1 9 *'],
  ['в январе и июле 1 числа', '0 0 1 1,7 *'],
  ['с июня по август по выходным в 8', '0 8 * 6-8 0,6'],
  ['с ноября по февраль ежедневно в 7', '0 7 * 1,2,11,12 *'],
  ['каждые 2 дня в 6:00', '0 6 */2 * *'],
  ['через день в 12', '0 12 */2 * *'],
  ['каждые 3 месяца', '0 0 1 */3 *'],
  ['еженедельно', '0 0 * * 0'],
  ['каждую неделю в пятницу в 17:00', '0 17 * * 5'],
  ['Каждый Будний День В 9:00', '0 9 * * 1-5'],
  ['по будним дням в 9', '0 9 * * 1-5'],
  ['каждую субботу в 10', '0 10 * * 6'],
  ['в субботу и воскресенье в 11:00', '0 11 * * 0,6'],
  ['в четверг в 9.30', '30 9 * * 4'],
  ['ёжедневно', '0 0 * * *'],
  ['каждый час в 15 минут', '15 * * * *'],
  ['в 0 и 30 минут', '0,30 * * * *'],
  ['каждые 2 часа в 5 минут по будням', '5 */2 * * 1-5'],
  ['каждый час с 20 до полуночи', '0 0,20-23 * * *'],
  ['каждые 10 минут с полуночи до 6', '*/10 0-5 * * *'],
  ['по понедельникам и со среды по пятницу в 9', '0 9 * * 1,3-5'],
  ['в январе и с июня по август 1 числа', '0 0 1 1,6-8 *'],
];

const english: ReadonlyArray<readonly [string, string]> = [
  ['every minute', '* * * * *'],
  ['every 5 minutes', '*/5 * * * *'],
  ['every 15 mins', '*/15 * * * *'],
  ['hourly', '0 * * * *'],
  ['every hour', '0 * * * *'],
  ['every 3 hours', '0 */3 * * *'],
  ['every other hour', '0 */2 * * *'],
  ['every 2nd hour', '0 */2 * * *'],
  ['daily', '0 0 * * *'],
  ['every day at 9am', '0 9 * * *'],
  ['every day at 9:30 pm', '30 21 * * *'],
  ['every day at 12am', '0 0 * * *'],
  ['every day at 12pm', '0 12 * * *'],
  ['at 7 p.m.', '0 19 * * *'],
  ['at noon', '0 12 * * *'],
  ["at 6 o'clock", '0 6 * * *'],
  ['every weekday at 9:30', '30 9 * * 1-5'],
  ['weekdays at 8am', '0 8 * * 1-5'],
  ['on weekends at 10am', '0 10 * * 0,6'],
  ['every monday at 9am', '0 9 * * 1'],
  ['mon, wed and fri at 18:00', '0 18 * * 1,3,5'],
  ['monday through friday at 6pm', '0 18 * * 1-5'],
  ['mon-fri 9:00', '0 9 * * 1-5'],
  ['at 9am and 5pm', '0 9,17 * * *'],
  ['every 15 minutes between 9 and 17 on weekdays', '*/15 9-16 * * 1-5'],
  ['every 30 minutes from 9am to 5pm', '*/30 9-16 * * *'],
  ['every hour from 9 to 5pm', '0 9-17 * * *'],
  ['every other day at noon', '0 12 */2 * *'],
  ['monthly', '0 0 1 * *'],
  ['on the 1st and 15th at noon', '0 12 1,15 * *'],
  ['on the 1st of every month at 8am', '0 8 1 * *'],
  ['first of the month at 6', '0 6 1 * *'],
  ['on the 15th day of the month', '0 0 15 * *'],
  ['on the 1st-7th at 9', '0 9 1-7 * *'],
  ['january 1st at midnight', '0 0 1 1 *'],
  ['jan 15 at 10am', '0 10 15 1 *'],
  ['every 6 months', '0 0 1 */6 *'],
  ['yearly', '0 0 1 1 *'],
  ['annually on july 4', '0 0 4 7 *'],
  ['weekly', '0 0 * * 0'],
  ['every week on sunday at 3am', '0 3 * * 0'],
  ['from june to august on saturdays at 7', '0 7 * 6-8 6'],
  ['once a day at 6am', '0 6 * * *'],
  ['once an hour', '0 * * * *'],
  ['each day at 9', '0 9 * * *'],
  ['every day at 9.', '0 9 * * *'],
  ['every hour at 15 minutes past', '15 * * * *'],
  ['every hour from 8pm to midnight', '0 0,20-23 * * *'],
  ['on mondays and from wednesday through friday at 9am', '0 9 * * 1,3-5'],
];

describe('parse — russian', () => {
  it.each(russian)('%s → %s', (input, cron) => {
    expect(toCron(input)).toBe(cron);
  });
});

describe('parse — english', () => {
  it.each(english)('%s → %s', (input, cron) => {
    expect(toCron(input)).toBe(cron);
  });
});

describe('options', () => {
  it('uses weeklyOn for weekly schedules', () => {
    expect(toCron('еженедельно', { weeklyOn: 1 })).toBe('0 0 * * 1');
  });

  it('keeps explicit weekday over weeklyOn', () => {
    expect(toCron('weekly on friday', { weeklyOn: 1 })).toBe('0 0 * * 5');
  });
});

describe('fields', () => {
  it('exposes structured fields', () => {
    expect(parse('каждые 15 минут с 9 до 18 по будням').fields).toEqual({
      minute: { kind: 'step', from: 0, to: 59, step: 15 },
      hour: { kind: 'step', from: 9, to: 17, step: 1 },
      dayOfMonth: { kind: 'any' },
      month: { kind: 'any' },
      dayOfWeek: { kind: 'values', values: [1, 2, 3, 4, 5] },
    });
  });
});

const failures: ReadonlyArray<readonly [string, ErrorCode]> = [
  ['', 'EMPTY_INPUT'],
  ['   ', 'EMPTY_INPUT'],
  ['каждый вторничек', 'UNKNOWN_WORD'],
  ['every blursday', 'UNKNOWN_WORD'],
  ['в последний день месяца', 'UNSUPPORTED'],
  ['every 10 seconds', 'UNSUPPORTED'],
  ['every day except sunday', 'UNSUPPORTED'],
  ['каждые полчаса', 'UNSUPPORTED'],
  ['every 2 weeks', 'UNSUPPORTED'],
  ['every other monday', 'UNSUPPORTED'],
  ['в 9:00 и 18:30', 'UNSUPPORTED'],
  ['every 90 minutes', 'OUT_OF_RANGE'],
  ['every 60 minutes', 'OUT_OF_RANGE'],
  ['at 25:00', 'OUT_OF_RANGE'],
  ['at 9:75', 'OUT_OF_RANGE'],
  ['at 13pm', 'OUT_OF_RANGE'],
  ['32 числа', 'OUT_OF_RANGE'],
  ['30 февраля', 'OUT_OF_RANGE'],
  ['с 10 по 5 число', 'OUT_OF_RANGE'],
  ['каждые 0 минут', 'OUT_OF_RANGE'],
  ['15', 'AMBIGUOUS'],
  ['1, 2, 3', 'AMBIGUOUS'],
  ['по понедельникам 1 числа', 'CONFLICT'],
  ['каждые 15 минут в 9:00', 'CONFLICT'],
  ['every 2 days on monday', 'CONFLICT'],
  ['every 5 minutes every 10 minutes', 'CONFLICT'],
  ['с 9 до 18', 'INCOMPLETE'],
  ['каждые', 'INCOMPLETE'],
  ['every', 'INCOMPLETE'],
  ['с 9', 'INCOMPLETE'],
  ['минут', 'UNEXPECTED_TOKEN'],
  ['в 9 #', 'UNEXPECTED_TOKEN'],
  ['каждые 15 минут в 5 минут', 'CONFLICT'],
  ['в 9:00 в 15 минут', 'CONFLICT'],
  ['в 75 минут', 'OUT_OF_RANGE'],
  ['15 минут числа', 'UNEXPECTED_TOKEN'],
];

describe('errors', () => {
  it.each(failures)('%j → %s', (input, code) => {
    const result = safeParse(input);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe(code);
  });

  it('points at the offending word', () => {
    const result = safeParse('по будням в 9:30 кроме пятницы');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBeInstanceOf(CronsenseError);
    expect(result.error.span).toEqual({ start: 17, end: 22 });
    expect(result.error.excerpt).toBe('по будням в 9:30 кроме пятницы\n                 ^^^^^');
  });

  it('parse throws CronsenseError', () => {
    expect(() => parse('every blursday')).toThrow(CronsenseError);
  });
});
