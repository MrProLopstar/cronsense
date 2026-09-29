import { RRule } from 'rrule';
import { describe, expect, it } from 'vitest';
import { nextRuns, occurrences, parse, safeParse, toRRule } from '../src/index.js';

const START = new Date(Date.UTC(2026, 0, 1));
const END = new Date(Date.UTC(2027, 5, 30));

const own = (text: string, count: number): string[] =>
  occurrences(text, { from: START, to: END, anchor: START, timezone: 'utc', limit: count }).map((date) => date.toISOString());

const oracle = (rule: string, count: number): string[] =>
  new RRule({ ...RRule.parseString(rule), dtstart: START })
    .all((date, index) => index < count && date <= END)
    .map((date) => date.toISOString());

const PHRASES = [
  'каждую минуту', 'каждые 15 минут', 'каждые 7 минут', 'каждые 90 минут', 'каждый час в 15 минут', 'каждые 2 часа',
  'каждые 5 часов', 'каждые 36 часов', 'каждые 2 часа с 8:00 до 20:00', 'каждые 15 минут с 9 до 18 по будням',
  'ежедневно', 'каждый день в 9:30', 'каждые 3 дня', 'по будням в 9:30', 'по выходным в полдень', 'еженедельно',
  'каждые 2 недели по понедельникам в 10', 'каждые 3 недели', 'ежемесячно', '1 и 15 числа в полдень',
  'в последний день месяца в 18:00', '1 числа и в последний день месяца', 'в первый понедельник месяца в 9:30',
  'в первый и третий вторник', 'каждую вторую среду месяца в 19:00', 'в последнюю пятницу месяца',
  'по понедельникам 1 числа', 'каждые 3 месяца', 'ежегодно', 'каждые 2 года', '15 января в 10 утра',
  'с июня по август по выходным в 8', 'в полвторого', '31 числа в 23:59', '29 февраля в полдень',
];

describe('occurrences matches rrule.js', () => {
  it.each(PHRASES)('%s', (text) => {
    expect(own(text, 60)).toEqual(oracle(toRRule(text), 60));
  });
});

describe('occurrences matches cron where both are exact', () => {
  it.each(['по будням в 9:30', 'каждые 15 минут с 9 до 18', '1 и 15 числа в полдень', 'с ноября по февраль в 7 утра', 'без четверти три по пятницам'])(
    '%s',
    (text) => {
      const mine = own(text, 50);
      const cron = nextRuns(parse(text), { count: mine.length, from: new Date(START.getTime() - 30_000), timezone: 'utc' }).map((date) => date.toISOString());
      expect(mine.length).toBeGreaterThanOrEqual(30);
      expect(mine).toEqual(cron);
    },
  );
});

describe('occurrences behaviour', () => {
  it('needs no DTSTART for rules without intervals', () => {
    const october = occurrences('по пятницам в 19:00', { from: new Date(Date.UTC(2026, 9, 1)), to: new Date(Date.UTC(2026, 9, 31, 23, 59)), timezone: 'utc' });
    expect(october.map((date) => date.toISOString().slice(0, 10))).toEqual(['2026-10-02', '2026-10-09', '2026-10-16', '2026-10-23', '2026-10-30']);
  });

  it('works in local time', () => {
    const [first] = occurrences('по пятницам в 19:00', { from: new Date(2026, 9, 1), to: new Date(2026, 9, 31) });
    expect(first?.getDay()).toBe(5);
    expect(first?.getHours()).toBe(19);
  });

  it('respects from, to and limit', () => {
    expect(occurrences('каждую минуту', { from: START, to: END, timezone: 'utc', limit: 3 })).toHaveLength(3);
    expect(occurrences('каждый день в 9:30', { from: new Date(Date.UTC(2026, 0, 1, 10)), to: new Date(Date.UTC(2026, 0, 3, 9, 30)), timezone: 'utc' }).map((date) => date.toISOString())).toEqual([
      '2026-01-02T09:30:00.000Z',
      '2026-01-03T09:30:00.000Z',
    ]);
    expect(occurrences('ежедневно', { from: END, to: START, timezone: 'utc' })).toEqual([]);
  });

  it('rejects bad options', () => {
    expect(() => occurrences('ежедневно', { from: new Date(Number.NaN), to: END })).toThrow(/invalid date/);
    expect(() => occurrences('ежедневно', { from: START, to: END, limit: -1 })).toThrow(/limit/);
  });
});

const random = (seed: number): (() => number) => {
  let state = seed;
  return () => {
    state = (state * 1_103_515_245 + 12_345) % 2_147_483_648;
    return state / 2_147_483_648;
  };
};

const WORDS = [
  'в', 'по', 'и', 'с', 'до', 'каждые', 'каждый', 'каждую', 'ежедневно', 'еженедельно', 'ежемесячно', 'минут', 'час', 'часа',
  'будням', 'выходным', 'понедельникам', 'пятницам', 'января', 'июне', 'декабре', 'числа', 'полвторого', 'полдень',
  'утра', 'вечера', '1', '2', '3', '5', '9', '12', '15', '18', '30', '90', '9:30', '18:45', 'без', 'четверти', 'полчаса',
  'последний', 'последнюю', 'первый', 'второй', 'день', 'месяца', 'недели', 'пятницу', 'понедельник',
];

describe('occurrences fuzz against rrule.js', () => {
  it('agrees on random phrases', { timeout: 300_000 }, () => {
    const next = random(20_261_002);
    let compared = 0;
    for (let run = 0; run < 4000; run += 1) {
      const text = Array.from({ length: 1 + Math.floor(next() * 6) }, () => WORDS[Math.floor(next() * WORDS.length)] ?? '').join(' ');
      let rule: string;
      try {
        rule = toRRule(text);
      } catch {
        expect(safeParse(text).ok && !text.includes('последн'), text).toBe(false);
        continue;
      }
      expect(own(text, 40), `${text} → ${rule}`).toEqual(oracle(rule, 40));
      compared += 1;
    }
    expect(compared).toBeGreaterThan(300);
  });
});
