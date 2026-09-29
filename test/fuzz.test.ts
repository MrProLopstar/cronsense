import { describe as suite, expect, it } from 'vitest';
import { CronsenseError, describe, parse, parseCron, safeParse } from '../src/index.js';
import { expandField } from '../src/field.js';
import type { CronFields } from '../src/types.js';

const VOCABULARY = [
  'в', 'во', 'с', 'со', 'до', 'по', 'и', ',', '-', 'без', 'пол', 'половину', 'четверть', 'четверти',
  'каждые', 'каждый', 'каждую', 'раз', 'через', 'ежедневно', 'ежечасно', 'еженедельно', 'ежемесячно',
  'минут', 'минуту', 'час', 'часа', 'часов', 'день', 'дня', 'дней', 'неделю', 'месяц', 'месяца',
  'полчаса', 'полвторого', 'полпервого', 'полдвенадцатого', 'первого', 'третьего', 'седьмого', 'двенадцатого',
  'один', 'два', 'три', 'пять', 'пяти', 'десять', 'двадцать', 'двадцати', 'сорок', 'пятьдесят', 'шестнадцать',
  'утра', 'вечера', 'ночи', 'пополудни', 'полдень', 'полночь', 'полуночи',
  'будням', 'выходным', 'понедельникам', 'среду', 'пятницы', 'воскресенье',
  'января', 'мае', 'июня', 'августа', 'декабре', 'числа', 'число',
  '0', '1', '5', '9', '12', '15', '23', '30', '59', '60', '9:30', '18:00', '5-го',
  'every', 'at', 'on', 'from', 'to', 'and', 'minutes', 'hour', 'hours', 'day', 'weekdays', 'monday', 'friday',
  'am', 'pm', 'noon', 'midnight', '1st', '15th', 'january', 'other', 'past',
];

const random = (seed: number): (() => number) => {
  let state = seed;
  return () => {
    state = (state * 1_103_515_245 + 12_345) % 2_147_483_648;
    return state / 2_147_483_648;
  };
};

const signature = (fields: CronFields): string =>
  (['minute', 'hour', 'dayOfMonth', 'month', 'dayOfWeek'] as const).map((name) => expandField(name, fields[name]).join()).join('|');

suite('fuzz', () => {
  const next = random(20_260_929);
  const phrases = Array.from({ length: 20_000 }, () =>
    Array.from({ length: 1 + Math.floor(next() * 7) }, () => VOCABULARY[Math.floor(next() * VOCABULARY.length)] ?? '').join(' '),
  );

  it('never crashes and only produces valid cron', { timeout: 120_000 }, () => {
    let parsed = 0;
    for (const phrase of phrases) {
      let result;
      try {
        result = safeParse(phrase);
      } catch (error: unknown) {
        throw new Error(`crash on "${phrase}": ${String(error)}`);
      }
      const strict = safeParse(phrase, { strictHours: true });
      if (strict.ok) expect(result.ok && result.schedule.cron, phrase).toBe(strict.schedule.cron);
      if (!result.ok) {
        expect(result.error, phrase).toBeInstanceOf(CronsenseError);
        const { span } = result.error;
        if (span !== null) {
          expect(span.start, phrase).toBeGreaterThanOrEqual(0);
          expect(span.end, phrase).toBeLessThanOrEqual(phrase.length);
        }
        continue;
      }
      parsed += 1;
      const { schedule } = result;
      expect(parseCron(schedule.cron).cron, phrase).toBe(schedule.cron);
      for (const locale of ['ru', 'en'] as const) {
        const text = describe(schedule, { locale });
        expect(signature(parse(text).fields), `${phrase} → ${text}`).toBe(signature(schedule.fields));
      }
    }
    expect(parsed).toBeGreaterThan(500);
  });
});
