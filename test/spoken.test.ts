import { describe, expect, it } from 'vitest';
import { safeParse, toCron, type ErrorCode } from '../src/index.js';

const phrases: ReadonlyArray<readonly [string, string]> = [
  ['в полвторого ежедневно', '30 1 * * *'],
  ['полвторого', '30 1 * * *'],
  ['в половину третьего', '30 2 * * *'],
  ['в половине третьего', '30 2 * * *'],
  ['в пол третьего', '30 2 * * *'],
  ['в пол-третьего', '30 2 * * *'],
  ['в полпервого', '30 12 * * *'],
  ['в полпервого ночи', '30 0 * * *'],
  ['в полвторого дня', '30 13 * * *'],
  ['в полдвенадцатого вечера', '30 23 * * *'],
  ['в четверть третьего', '15 2 * * *'],
  ['в четверть девятого вечера', '15 20 * * *'],
  ['без четверти три', '45 2 * * *'],
  ['без четверти двенадцать', '45 11 * * *'],
  ['в час дня', '0 13 * * *'],
  ['в час ночи', '0 1 * * *'],
  ['в час', '0 1 * * *'],
  ['в пять минут седьмого', '5 6 * * *'],
  ['в десять минут третьего', '10 2 * * *'],
  ['в 20 минут восьмого вечера', '20 19 * * *'],
  ['без пяти шестнадцать', '55 15 * * *'],
  ['без шести семь', '54 6 * * *'],
  ['без шести семь вечера', '54 18 * * *'],
  ['без 10 минут 9', '50 8 * * *'],
  ['без пяти час', '55 12 * * *'],
  ['без пяти час ночи', '55 0 * * *'],
  ['без двадцати пяти восемь', '35 7 * * *'],
  ['без двадцати один', '40 12 * * *'],
  ['без тридцати пять вечера', '30 16 * * *'],
  ['без двадцати пяти', '40 4 * * *'],
  ['без четверти полночь', '45 23 * * *'],
  ['без пяти полдень', '55 11 * * *'],
  ['без четверти пополудни', '45 11 * * *'],
  ['Без четверти пополудни', '45 11 * * *'],
  ['в три утра', '0 3 * * *'],
  ['в три часа утра', '0 3 * * *'],
  ['в три пополудни', '0 15 * * *'],
  ['в двенадцать', '0 12 * * *'],
  ['в двадцать три часа', '0 23 * * *'],
  ['каждые полчаса', '*/30 * * * *'],
  ['раз в полчаса', '*/30 * * * *'],
  ['каждые пол часа', '*/30 * * * *'],
  ['каждые полчаса с 9 до 18 по будням', '*/30 9-17 * * 1-5'],
  ['каждые пять минут', '*/5 * * * *'],
  ['каждые двадцать пять минут', '*/25 * * * *'],
  ['каждые два часа', '0 */2 * * *'],
  ['по будням в полдевятого', '30 8 * * 1-5'],
  ['пятого числа в полдень', '0 12 5 * *'],
  ['двенадцатого числа', '0 0 12 * *'],
  ['в пятнадцать минут', '15 * * * *'],
  ['в пять минут', '5 * * * *'],
  ['каждый час в сорок пять минут', '45 * * * *'],
  ['в полвторого и в полшестого', '30 1,5 * * *'],
  ['с пятого по десятое число в четверть десятого', '15 9 5-10 * *'],
  ['раз в полгода', '0 0 1 */6 *'],
  ['каждые полгода', '0 0 1 */6 *'],
  ['ежеквартально', '0 0 1 */3 *'],
  ['каждый квартал', '0 0 1 */3 *'],
  ['раз в квартал в 10 утра', '0 10 1 */3 *'],
  ['quarterly', '0 0 1 */3 *'],
  ['каждый чётный час', '0 */2 * * *'],
  ['каждый нечётный час', '0 1-23/2 * * *'],
  ['каждый чётный час с 9 до 18', '0 10-18/2 * * *'],
  ['каждый нечётный час с 9 до 18', '0 9-18/2 * * *'],
  ['каждый третий час начиная с часа ночи', '0 1-23/3 * * *'],
  ['каждые 15 минут начиная с 9', '*/15 9-23 * * *'],
  ['каждый час начиная с 8 утра', '0 8-23 * * *'],
  ['every 2 hours starting at 1am', '0 1-23/2 * * *'],
  ['every odd hour', '0 1-23/2 * * *'],
  ['по чётным числам', '0 0 2-30/2 * *'],
  ['по нечётным дням в 10', '0 10 */2 * *'],
];

describe('spoken Russian time', () => {
  it.each(phrases)('%s → %s', (text, cron) => {
    expect(toCron(text)).toBe(cron);
  });
});

const ORDINAL_GENITIVE = [
  'первого', 'второго', 'третьего', 'четвертого', 'пятого', 'шестого',
  'седьмого', 'восьмого', 'девятого', 'десятого', 'одиннадцатого', 'двенадцатого',
];

const MERIDIEMS: ReadonlyArray<readonly [string, (hour: number) => number]> = [
  ['', (hour) => hour],
  [' утра', (hour) => hour % 12],
  [' дня', (hour) => (hour % 12) + 12],
  [' вечера', (hour) => (hour % 12) + 12],
  [' пополудни', (hour) => (hour % 12) + 12],
  [' ночи', (hour) => (hour === 12 ? 0 : hour <= 5 ? hour : hour + 12)],
];

const UNITS = ['', 'один', 'два', 'три', 'четыре', 'пять', 'шесть', 'семь', 'восемь', 'девять'];
const TEENS = ['десять', 'одиннадцать', 'двенадцать', 'тринадцать', 'четырнадцать', 'пятнадцать', 'шестнадцать', 'семнадцать', 'восемнадцать', 'девятнадцать'];
const TENS = ['', '', 'двадцать', 'тридцать', 'сорок', 'пятьдесят'];
const GENITIVE_UNITS = ['', 'одной', 'двух', 'трех', 'четырех', 'пяти', 'шести', 'семи', 'восьми', 'девяти'];
const GENITIVE_TEENS = TEENS.map((word) => word.replace(/ь$/, 'и'));
const GENITIVE_TENS = ['', '', 'двадцати', 'тридцати', 'сорока', 'пятидесяти'];

const words = (value: number, genitive: boolean): string => {
  const units = genitive ? GENITIVE_UNITS : UNITS;
  if (value < 10) return units[value] ?? '';
  if (value < 20) return (genitive ? GENITIVE_TEENS : TEENS)[value - 10] ?? '';
  const tens = (genitive ? GENITIVE_TENS : TENS)[Math.floor(value / 10)] ?? '';
  return value % 10 === 0 ? tens : `${tens} ${units[value % 10] ?? ''}`;
};

describe('generated spoken forms', () => {
  const cases: [string, number, number][] = [];
  for (let ordinal = 1; ordinal <= 12; ordinal += 1) {
    const base = ordinal === 1 ? 12 : ordinal - 1;
    const genitive = ORDINAL_GENITIVE[ordinal - 1] ?? '';
    const cardinal = words(ordinal, false);
    for (const [suffix, toHour] of MERIDIEMS) {
      const hour = toHour(base);
      cases.push([`в пол${genitive}${suffix}`, hour, 30]);
      cases.push([`в половину ${genitive}${suffix}`, hour, 30]);
      cases.push([`в четверть ${genitive}${suffix}`, hour, 15]);
      cases.push([`без четверти ${cardinal}${suffix}`, hour, 45]);
      for (const minutes of [1, 5, 10, 20, 25, 29]) {
        cases.push([`в ${words(minutes, false)} минут ${genitive}${suffix}`, hour, minutes]);
        cases.push([`без ${words(minutes, true)} ${cardinal}${suffix}`, hour, 60 - minutes]);
        cases.push([`без ${minutes} минут ${ordinal}${suffix}`, hour, 60 - minutes]);
      }
    }
  }

  it(`parses ${cases.length} generated phrases`, () => {
    for (const [text, hour, minute] of cases) expect(toCron(text), text).toBe(`${minute} ${hour} * * *`);
  });

  it('parses every number word from 1 to 59', () => {
    for (let value = 1; value <= 59; value += 1) {
      const word = words(value, false);
      expect(toCron(`каждые ${word} минут`), word).toBe(value === 1 ? '* * * * *' : `*/${value} * * * *`);
      expect(toCron(`каждый час в ${word} минут`), word).toBe(`${value} * * * *`);
    }
  });

  it('parses 24-hour number words', () => {
    for (let value = 0; value <= 23; value += 1) {
      const text = value === 0 ? 'в полночь' : `в ${words(value, false)}`;
      expect(toCron(text), text).toBe(`0 ${value} * * *`);
    }
  });
});

const failures: ReadonlyArray<readonly [string, ErrorCode]> = [
  ['каждое десятилетие', 'UNSUPPORTED'],
  ['каждый век', 'UNSUPPORTED'],
  ['раз в столетие', 'UNSUPPORTED'],
  ['every century', 'UNSUPPORTED'],
  ['every decade', 'UNSUPPORTED'],
  ['без пяти', 'UNEXPECTED_END'],
  ['в четверть', 'INCOMPLETE'],
  ['в половину', 'INCOMPLETE'],
  ['без 60 минут три', 'OUT_OF_RANGE'],
  ['без пяти двадцать пять', 'OUT_OF_RANGE'],
  ['по чётным числам по пятницам', 'CONFLICT'],
  ['каждый чётный час и каждый нечётный час', 'CONFLICT'],
];

describe('spoken errors', () => {
  it.each(failures)('%j → %s', (text, code) => {
    const result = safeParse(text);
    expect(result.ok, text).toBe(false);
    if (!result.ok) expect(result.error.code).toBe(code);
  });
});

describe('strictHours', () => {
  const ambiguous = [
    'без шести семь', 'в 7', 'в семь', 'в 9:30', 'в полвторого', 'в полпервого', 'в час', 'в пять минут седьмого',
    'в 9 часов 45 минут', 'по будням в 9:30', 'at 7', 'в 9 и 21', 'в четверть третьего', 'без четверти двенадцать',
  ];
  it.each(ambiguous)('rejects %j', (text) => {
    const result = safeParse(text, { strictHours: true });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('AMBIGUOUS');
    expect(safeParse(text).ok).toBe(true);
  });

  const certain: ReadonlyArray<readonly [string, string]> = [
    ['без шести семь вечера', '54 18 * * *'],
    ['в 19:00', '0 19 * * *'],
    ['в 09:30', '30 9 * * *'],
    ['в 0:15', '15 0 * * *'],
    ['в три утра', '0 3 * * *'],
    ['в полдень', '0 12 * * *'],
    ['в полночь', '0 0 * * *'],
    ['без пяти шестнадцать', '55 15 * * *'],
    ['at 7pm', '0 19 * * *'],
    ['в полвторого дня', '30 13 * * *'],
    ['без четверти пополудни', '45 11 * * *'],
    ['каждые 15 минут с 9 до 18', '*/15 9-17 * * *'],
    ['каждый час в 15 минут', '15 * * * *'],
    ['ежедневно', '0 0 * * *'],
    ['по будням в 21:30', '30 21 * * 1-5'],
  ];
  it.each(certain)('accepts %j', (text, cron) => {
    expect(toCron(text, { strictHours: true })).toBe(cron);
  });
});
