import { execFileSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';
import { occurrences, safeParse, toSystemd, type ErrorCode } from '../src/index.js';

const ITERATIONS = 12;

const analyze = (expressions: readonly string[]): string => {
  const args = ['TZ=UTC', 'systemd-analyze', 'calendar', `--iterations=${ITERATIONS}`, ...expressions];
  return process.platform === 'win32'
    ? execFileSync('wsl', ['-e', 'env', ...args], { encoding: 'utf8' })
    : execFileSync('env', args, { encoding: 'utf8' });
};

const available = ((): boolean => {
  try {
    return analyze(['daily']).includes('Next elapse');
  } catch {
    return false;
  }
})();

const elapses = (expressions: readonly string[]): Map<string, string[]> => {
  const blocks = analyze(expressions).replaceAll('\0', '').replaceAll('\r', '').trim().split(/\n\s*\n/);
  expect(blocks).toHaveLength(expressions.length);
  return new Map(
    expressions.map((expression, index) => [
      expression,
      [...(blocks[index] ?? '').matchAll(/(?:Next elapse|Iter\. #\d+): \w+ (\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}):00 UTC/g)].map((match) => `${match[1]}T${match[2]}`),
    ]),
  );
};

const own = (text: string, from: Date): string[] =>
  occurrences(text, { from, to: new Date(from.getTime() + 5 * 366 * 86_400_000), timezone: 'utc', limit: ITERATIONS }).map((date) => date.toISOString().slice(0, 16));

const merged = (text: string, table: Map<string, string[]>): string[] => {
  const all = toSystemd(text).flatMap((expression) => table.get(expression) ?? [`missing ${expression}`]);
  return [...new Set(all)].sort().slice(0, ITERATIONS);
};

const agree = (text: string, table: Map<string, string[]>): void => {
  const theirs = merged(text, table);
  const [first] = theirs;
  expect(first, `${text}: systemd found no elapse`).toBeDefined();
  const mine = own(text, new Date(`${first ?? ''}:00Z`));
  const count = Math.min(theirs.length, mine.length);
  expect(count, text).toBeGreaterThan(0);
  expect(theirs.slice(0, count), `${text} → ${toSystemd(text).join(' | ')}`).toEqual(mine.slice(0, count));
}

const PHRASES = [
  'по будням в 9:30', 'в последний день месяца в 18:00', 'в первый понедельник месяца в 9:30', 'в последнюю пятницу месяца',
  'каждые 15 минут с 9 до 18 по будням', 'ежеквартально', 'раз в полгода', 'каждый нечётный час', 'каждый чётный час',
  'каждый третий час начиная с часа ночи', 'по понедельникам 1 числа', 'на 23 февраля и 8 марта', '1 числа и в последний день месяца',
  'по выходным в полдень', 'с пятницы по понедельник в 23:00', 'по чётным числам', 'по нечётным числам в 10', 'каждую минуту',
  'каждый час в 15 минут', 'в 9:00, 9:30, 18:00 и 18:30', 'в День Победы в 10 утра', 'в Рождество', 'в первый и третий вторник',
  'каждую вторую среду месяца в 19:00', 'с ноября по февраль в 7 утра', '15 января в 10 утра', 'ежегодно', 'ежемесячно',
  'каждые полчаса', 'со вторника по четверг в 8:15', 'last friday of the month at 5pm', 'every odd hour',
];

describe('toSystemd', () => {
  it('writes readable OnCalendar values', () => {
    expect(toSystemd('по будням в 9:30')).toEqual(['Mon..Fri *-*-* 09:30:00']);
    expect(toSystemd('в последний день месяца в 18:00')).toEqual(['*-*~01 18:00:00']);
    expect(toSystemd('в первый понедельник месяца в 9:30')).toEqual(['Mon *-*-01..07 09:30:00']);
    expect(toSystemd('ежеквартально')).toEqual(['*-01,04,07,10-01 00:00:00']);
    expect(toSystemd('на 23 февраля и 8 марта')).toEqual(['*-02-23 00:00:00', '*-03-08 00:00:00']);
  });

  it.skipIf(!available)('matches systemd-analyze on every phrase', { timeout: 120_000 }, () => {
    const table = elapses(PHRASES.flatMap((text) => toSystemd(text)));
    for (const text of PHRASES) agree(text, table);
  });

  it.skipIf(!available)('matches systemd-analyze on random phrases', { timeout: 300_000 }, () => {
    let state = 20_260_930;
    const next = (): number => {
      state = (state * 1_103_515_245 + 12_345) % 2_147_483_648;
      return state / 2_147_483_648;
    };
    const words = [
      'в', 'по', 'и', 'с', 'до', 'каждые', 'каждый', 'ежедневно', 'ежемесячно', 'ежеквартально', 'минут', 'час', 'часа',
      'будням', 'выходным', 'понедельникам', 'пятницам', 'января', 'июне', 'декабре', 'числа', 'полвторого', 'полдень',
      'утра', 'вечера', '1', '5', '9', '15', '18', '30', '9:30', 'последний', 'первый', 'день', 'месяца', 'пятницу',
      'чётный', 'нечётный', 'полгода', 'начиная', 'часа ночи',
    ];
    const phrases: string[] = [];
    for (let run = 0; run < 6000 && phrases.length < 250; run += 1) {
      const text = Array.from({ length: 1 + Math.floor(next() * 6) }, () => words[Math.floor(next() * words.length)] ?? '').join(' ');
      try {
        toSystemd(text);
        phrases.push(text);
      } catch {
        continue;
      }
    }
    expect(phrases.length).toBeGreaterThan(100);
    const table = elapses([...new Set(phrases.flatMap((text) => toSystemd(text)))]);
    for (const text of phrases) agree(text, table);
  });
});

const ERRORS: ReadonlyArray<readonly [string, ErrorCode]> = [
  ['каждые 90 минут', 'UNSUPPORTED'],
  ['каждые 2 недели', 'UNSUPPORTED'],
  ['в Пасху', 'UNSUPPORTED'],
  ['в первый рабочий день месяца', 'UNSUPPORTED'],
  ['в 9:00 и 18:30', 'UNSUPPORTED'],
];

describe('toSystemd errors', () => {
  it.each(ERRORS)('%j → %s', (text, code) => {
    let caught: unknown;
    try {
      toSystemd(text);
    } catch (error: unknown) {
      caught = error;
    }
    expect(caught).toMatchObject({ code });
  });

  it('suggests a monotonic timer for intervals', () => {
    expect(() => toSystemd('каждые 90 минут')).toThrow(/OnUnitActiveSec=90min/);
    expect(safeParse('каждые 90 минут').ok).toBe(false);
  });
});
