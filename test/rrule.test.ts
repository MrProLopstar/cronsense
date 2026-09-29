import { RRule } from 'rrule';
import { describe, expect, it } from 'vitest';
import { nextRuns, parse, safeParse, toRRule, type ErrorCode } from '../src/index.js';

const DTSTART = new Date(Date.UTC(2026, 0, 1));

const occurrences = (rule: string, count: number, dtstart = DTSTART): string[] =>
  new RRule({ ...RRule.parseString(rule), dtstart })
    .all((_, index) => index < count)
    .map((date) => date.toISOString());

const cronRuns = (text: string, count: number): string[] =>
  nextRuns(parse(text), { count, from: new Date(DTSTART.getTime() - 30_000), timezone: 'utc' }).map((date) => date.toISOString());

const rrules: ReadonlyArray<readonly [string, string]> = [
  ['каждую минуту', 'FREQ=MINUTELY'],
  ['каждые 15 минут', 'FREQ=HOURLY;BYMINUTE=0,15,30,45'],
  ['каждые 7 минут', 'FREQ=MINUTELY;INTERVAL=7'],
  ['каждые 90 минут', 'FREQ=MINUTELY;INTERVAL=90'],
  ['каждые полчаса', 'FREQ=HOURLY;BYMINUTE=0,30'],
  ['каждый час', 'FREQ=HOURLY;BYMINUTE=0'],
  ['каждый час в 15 минут', 'FREQ=HOURLY;BYMINUTE=15'],
  ['каждые 2 часа', 'FREQ=DAILY;BYHOUR=0,2,4,6,8,10,12,14,16,18,20,22;BYMINUTE=0'],
  ['каждые 5 часов', 'FREQ=HOURLY;INTERVAL=5;BYMINUTE=0'],
  ['каждые 36 часов', 'FREQ=HOURLY;INTERVAL=36;BYMINUTE=0'],
  ['каждые 2 часа с 8:00 до 20:00', 'FREQ=DAILY;BYHOUR=8,10,12,14,16,18,20;BYMINUTE=0'],
  ['каждые 15 минут с 9 до 18 по будням', 'FREQ=HOURLY;BYDAY=MO,TU,WE,TH,FR;BYHOUR=9,10,11,12,13,14,15,16,17;BYMINUTE=0,15,30,45'],
  ['ежедневно', 'FREQ=DAILY;BYHOUR=0;BYMINUTE=0'],
  ['каждый день в 9:30', 'FREQ=DAILY;BYHOUR=9;BYMINUTE=30'],
  ['каждые 3 дня', 'FREQ=DAILY;INTERVAL=3;BYHOUR=0;BYMINUTE=0'],
  ['по будням в 9:30', 'FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR;BYHOUR=9;BYMINUTE=30'],
  ['по выходным в полдень', 'FREQ=WEEKLY;BYDAY=SA,SU;BYHOUR=12;BYMINUTE=0'],
  ['еженедельно', 'FREQ=WEEKLY;BYDAY=SU;BYHOUR=0;BYMINUTE=0'],
  ['каждые 2 недели по понедельникам в 10', 'FREQ=WEEKLY;INTERVAL=2;BYDAY=MO;BYHOUR=10;BYMINUTE=0'],
  ['every other monday at 9am', 'FREQ=WEEKLY;INTERVAL=2;BYDAY=MO;BYHOUR=9;BYMINUTE=0'],
  ['каждые 3 недели', 'FREQ=WEEKLY;INTERVAL=3;BYDAY=SU;BYHOUR=0;BYMINUTE=0'],
  ['ежемесячно', 'FREQ=MONTHLY;BYMONTHDAY=1;BYHOUR=0;BYMINUTE=0'],
  ['1 и 15 числа в полдень', 'FREQ=MONTHLY;BYMONTHDAY=1,15;BYHOUR=12;BYMINUTE=0'],
  ['в последний день месяца в 18:00', 'FREQ=MONTHLY;BYMONTHDAY=-1;BYHOUR=18;BYMINUTE=0'],
  ['last day of the month at 6pm', 'FREQ=MONTHLY;BYMONTHDAY=-1;BYHOUR=18;BYMINUTE=0'],
  ['в последнее число месяца', 'FREQ=MONTHLY;BYMONTHDAY=-1;BYHOUR=0;BYMINUTE=0'],
  ['1 числа и в последний день месяца', 'FREQ=MONTHLY;BYMONTHDAY=1,-1;BYHOUR=0;BYMINUTE=0'],
  ['в первый понедельник месяца в 9:30', 'FREQ=MONTHLY;BYDAY=1MO;BYHOUR=9;BYMINUTE=30'],
  ['в первый и третий вторник', 'FREQ=MONTHLY;BYDAY=1TU,3TU;BYHOUR=0;BYMINUTE=0'],
  ['каждую вторую среду месяца в 19:00', 'FREQ=MONTHLY;BYDAY=2WE;BYHOUR=19;BYMINUTE=0'],
  ['в последнюю пятницу месяца', 'FREQ=MONTHLY;BYDAY=-1FR;BYHOUR=0;BYMINUTE=0'],
  ['on the last friday of the month at 5pm', 'FREQ=MONTHLY;BYDAY=-1FR;BYHOUR=17;BYMINUTE=0'],
  ['first monday of the month at 9am', 'FREQ=MONTHLY;BYDAY=1MO;BYHOUR=9;BYMINUTE=0'],
  ['по понедельникам 1 числа', 'FREQ=MONTHLY;BYMONTHDAY=1;BYDAY=MO;BYHOUR=0;BYMINUTE=0'],
  ['каждые 3 месяца', 'FREQ=MONTHLY;INTERVAL=3;BYMONTHDAY=1;BYHOUR=0;BYMINUTE=0'],
  ['ежегодно', 'FREQ=YEARLY;BYMONTH=1;BYMONTHDAY=1;BYHOUR=0;BYMINUTE=0'],
  ['каждые 2 года', 'FREQ=YEARLY;INTERVAL=2;BYMONTH=1;BYMONTHDAY=1;BYHOUR=0;BYMINUTE=0'],
  ['15 января в 10 утра', 'FREQ=YEARLY;BYMONTH=1;BYMONTHDAY=15;BYHOUR=10;BYMINUTE=0'],
  ['с июня по август по выходным в 8', 'FREQ=WEEKLY;BYMONTH=6,7,8;BYDAY=SA,SU;BYHOUR=8;BYMINUTE=0'],
  ['в полвторого', 'FREQ=DAILY;BYHOUR=1;BYMINUTE=30'],
];

describe('toRRule', () => {
  it.each(rrules)('%s → %s', (text, rule) => {
    expect(toRRule(text)).toBe(rule);
    expect(occurrences(rule, 3)).toHaveLength(3);
  });

  it('computes real dates for rules cron cannot express', () => {
    expect(occurrences(toRRule('в последний день месяца в 18:00'), 3)).toEqual([
      '2026-01-31T18:00:00.000Z',
      '2026-02-28T18:00:00.000Z',
      '2026-03-31T18:00:00.000Z',
    ]);
    expect(occurrences(toRRule('в первый понедельник месяца в 9:30'), 3)).toEqual([
      '2026-01-05T09:30:00.000Z',
      '2026-02-02T09:30:00.000Z',
      '2026-03-02T09:30:00.000Z',
    ]);
    expect(occurrences(toRRule('каждые 2 недели по понедельникам в 10'), 3, new Date(Date.UTC(2026, 0, 5)))).toEqual([
      '2026-01-05T10:00:00.000Z',
      '2026-01-19T10:00:00.000Z',
      '2026-02-02T10:00:00.000Z',
    ]);
    expect(occurrences(toRRule('по понедельникам 1 числа'), 2)).toEqual(['2026-06-01T00:00:00.000Z', '2027-02-01T00:00:00.000Z']);
  });

  it('respects strictHours', () => {
    expect(() => toRRule('без шести семь', { strictHours: true })).toThrow(/morning or evening/);
    expect(toRRule('без шести семь вечера', { strictHours: true })).toBe('FREQ=DAILY;BYHOUR=18;BYMINUTE=54');
  });
});

const rruleOnly: ReadonlyArray<readonly [string, ErrorCode]> = [
  ['в последний день месяца', 'UNSUPPORTED'],
  ['в первый понедельник месяца', 'UNSUPPORTED'],
  ['в последнюю пятницу', 'UNSUPPORTED'],
  ['каждые 2 недели', 'UNSUPPORTED'],
  ['every other monday', 'UNSUPPORTED'],
  ['каждые 90 минут', 'OUT_OF_RANGE'],
  ['по понедельникам 1 числа', 'CONFLICT'],
];

describe('cron still refuses what only RRULE can express', () => {
  it.each(rruleOnly)('%j → %s', (text, code) => {
    const result = safeParse(text);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe(code);
    expect(() => toRRule(text)).not.toThrow();
  });
});

const failures: ReadonlyArray<readonly [string, ErrorCode]> = [
  ['в последний', 'INCOMPLETE'],
  ['в шестой понедельник', 'OUT_OF_RANGE'],
  ['в первый будний день', 'UNEXPECTED_TOKEN'],
  ['каждые 2 дня в первый понедельник', 'CONFLICT'],
  ['30 февраля', 'OUT_OF_RANGE'],
  ['в 9:00 и 18:30', 'UNSUPPORTED'],
  ['с 9 до 18', 'INCOMPLETE'],
  ['по понедельникам и в первую пятницу', 'CONFLICT'],
];

describe('toRRule errors', () => {
  it.each(failures)('%j → %s', (text, code) => {
    let caught: unknown;
    try {
      toRRule(text);
    } catch (error: unknown) {
      caught = error;
    }
    expect(caught).toMatchObject({ code });
  });
});

const EQUIVALENT = [
  'каждую минуту', 'каждые 15 минут', 'каждые 20 минут с 9 до 18 по будням', 'каждый час', 'каждый час в 15 минут',
  'каждые 2 часа', 'каждые 3 часа с 6 до 21', 'ежедневно', 'каждый день в 9:30', 'в 9:00 и 21:00', 'по будням в 9:30',
  'по выходным в полдень', 'по понедельникам, средам и пятницам в 18:00', 'еженедельно', 'ежемесячно', '1 и 15 числа в полдень',
  'с 1 по 10 число в 8:00', '15 января в 10 утра', 'ежегодно', 'с июня по август по выходным в 8', 'с ноября по февраль в 7 утра',
  'в полвторого', 'без четверти три по пятницам', 'каждые полчаса с 9 до 18 по будням', 'в 0 и 30 минут', '31 числа в 23:59',
];

const random = (seed: number): (() => number) => {
  let state = seed;
  return () => {
    state = (state * 1_103_515_245 + 12_345) % 2_147_483_648;
    return state / 2_147_483_648;
  };
};

const WORDS = [
  'в', 'по', 'и', 'с', 'до', 'каждые', 'каждый', 'ежедневно', 'еженедельно', 'ежемесячно', 'минут', 'час', 'часа',
  'будням', 'выходным', 'понедельникам', 'пятницам', 'января', 'июне', 'декабре', 'числа', 'полвторого', 'полдень',
  'утра', 'вечера', '1', '5', '9', '12', '15', '18', '20', '30', '9:30', '18:45', 'без', 'четверти', 'три', 'полчаса',
];

describe('RRULE matches cron where both are exact', () => {
  it.each(EQUIVALENT)('%s', (text) => {
    const expected = cronRuns(text, 40);
    expect(occurrences(toRRule(text), expected.length)).toEqual(expected);
  });

  it('fuzz', { timeout: 120_000 }, () => {
    const next = random(20_261_001);
    let compared = 0;
    for (let run = 0; run < 5000; run += 1) {
      const text = Array.from({ length: 1 + Math.floor(next() * 6) }, () => WORDS[Math.floor(next() * WORDS.length)] ?? '').join(' ');
      const cron = safeParse(text);
      let rule: string | null = null;
      try {
        rule = toRRule(text);
      } catch {
        rule = null;
      }
      if (cron.ok && rule === null) throw new Error(`cron accepts but RRULE rejects "${text}"`);
      if (!cron.ok || rule === null || rule.includes('INTERVAL') || cron.schedule.cron.split(' ').slice(2).some((field) => field.includes('/'))) continue;
      const expected = cronRuns(text, 25);
      expect(occurrences(rule, expected.length), `${text} → ${rule} vs ${cron.schedule.cron}`).toEqual(expected);
      compared += 1;
    }
    expect(compared).toBeGreaterThan(200);
  });
});
