import { CronsenseError } from './errors.js';
import { matchHoliday, type Holiday } from './holidays.js';
import { lookupWord, type Lexeme } from './lexicon.js';
import type { Span } from './types.js';

type Spanned<T> = T & { readonly span: Span };

export type Token =
  | Spanned<{ readonly t: 'num'; readonly value: number; readonly ordinal: boolean }>
  | Spanned<{ readonly t: 'time'; readonly hour: number; readonly minute: number; readonly padded: boolean }>
  | Spanned<{ readonly t: 'dash' }>
  | Spanned<{ readonly t: 'year'; readonly value: number }>
  | Spanned<{ readonly t: 'holiday'; readonly holiday: Holiday }>
  | Spanned<Exclude<Lexeme, { readonly t: 'noise' | 'ordinal' | 'cardinal' | 'halfOf' | 'amount' | 'unsupported' }>>;

export type TokenOf<K extends Token['t']> = Extract<Token, { readonly t: K }>;

const SPACE = /\s+/y;
// whole dates: 8.11.2026, 8/11/2026 and 2026-11-08
const DATE_DMY = /(\d{1,2})[./](\d{1,2})[./](\d{4})(?!\d)/y;
const DATE_ISO = /(\d{4})-(\d{1,2})-(\d{1,2})(?!\d)/y;
const TIME = /(\d{1,2})[:.](\d{2})(?!\d)/y;
const NUMBER = /(\d+)(?:-?(?:го|ое|ого|ой|ье|е|й|ый|ий|th|st|nd|rd)(?!\p{L}))?(?!\d)/uy;
const WORD = /\p{L}+/uy;
const DASH = /[-‐‑‒–—−]/y;
const SEPARATOR = /[,;&]/y;
const IGNORED = /['’.]/y;

const normalize = (input: string): string =>
  Array.from(input, (char) => {
    const lower = char.toLowerCase();
    return lower.length === char.length ? lower : char;
  })
    .join('')
    .replaceAll('ё', 'е')
    .replace(/\b([ap])\.m\./g, '$1m  ');

const matchAt = (pattern: RegExp, text: string, index: number): RegExpExecArray | null => {
  pattern.lastIndex = index;
  return pattern.exec(text);
};

const NEVER = /(?:(?:когда )?рак\S* на горе свистн\S*|после дождичка в четверг|на морском дне|на греческие календы|никогда|when pigs fly|once in a blue moon)/;

/** Whether a 4-digit number here follows a date: «8 ноября», "November 8" or "November 8," before it. */
const afterDate = (tokens: readonly Token[]): boolean => {
  const [a, b, c] = [tokens.at(-1), tokens.at(-2), tokens.at(-3)];
  if (a?.t === 'month') return true;
  if (a?.t === 'num' && b?.t === 'month') return true;
  return a?.t === 'and' && b?.t === 'num' && c?.t === 'month';
};

export const tokenize = (input: string): Token[] => {
  const text = normalize(input);
  const never = NEVER.exec(text);
  if (never !== null) {
    throw new CronsenseError('UNSUPPORTED', `"${input.slice(never.index, never.index + never[0].length)}" never happens, so there is nothing to schedule`, input, { start: never.index, end: never.index + never[0].length });
  }
  const tokens: Token[] = [];
  let index = 0;
  let wordTens: Token | null = null;

  while (index < text.length) {
    const space = matchAt(SPACE, text, index) ?? matchAt(IGNORED, text, index);
    if (space !== null) {
      index += space[0].length;
      continue;
    }

    const date = matchAt(DATE_DMY, text, index) ?? matchAt(DATE_ISO, text, index);
    if (date !== null) {
      const span = { start: index, end: index + date[0].length };
      const iso = date[1]?.length === 4;
      const [day, month, year] = (iso ? [date[3], date[2], date[1]] : [date[1], date[2], date[3]]).map(Number) as [number, number, number];
      if (month < 1 || month > 12) throw new CronsenseError('OUT_OF_RANGE', `Month ${month} is out of range 1-12`, input, span);
      // read as «8 ноября 2026»: the day, the month and the year
      tokens.push({ t: 'num', value: day, ordinal: false, span }, { t: 'month', month, span }, { t: 'year', value: year, span });
      index = span.end;
      continue;
    }

    const time = matchAt(TIME, text, index);
    if (time !== null) {
      const span = { start: index, end: index + time[0].length };
      tokens.push({ t: 'time', hour: Number(time[1]), minute: Number(time[2]), padded: time[1]?.startsWith('0') === true, span });
      index = span.end;
      continue;
    }

    const number = matchAt(NUMBER, text, index);
    if (number !== null) {
      const span = { start: index, end: index + number[0].length };
      const digits = number[1] ?? '';
      if (digits.length === 4 && afterDate(tokens)) {
        // «8 ноября 2026», "November 8, 2026": a year after a date
        if (tokens.at(-1)?.t === 'and') tokens.pop();
        tokens.push({ t: 'year', value: Number(digits), span });
        index = span.end;
        continue;
      }
      tokens.push({ t: 'num', value: Number(digits), ordinal: number[0].length > digits.length, span });
      index = span.end;
      continue;
    }

    const named = matchHoliday(text, index);
    if (named !== null) {
      tokens.push({ t: 'holiday', holiday: named.holiday, span: { start: index, end: index + named.length } });
      index += named.length;
      continue;
    }

    const word = matchAt(WORD, text, index);
    if (word !== null) {
      const span = { start: index, end: index + word[0].length };
      // «2026 года», «2026 г.», "2026 year" only repeat that it is a year
      if (tokens.at(-1)?.t === 'year' && /^(?:года?|г|year)$/.test(word[0])) {
        index = span.end;
        continue;
      }
      const lexeme = lookupWord(word[0]);
      if (lexeme === null) {
        throw new CronsenseError('UNKNOWN_WORD', `Unknown word "${input.slice(span.start, span.end)}"`, input, span);
      }
      switch (lexeme.t) {
        case 'noise':
          break;
        case 'unsupported':
          throw new CronsenseError('UNSUPPORTED', `Not expressible in cron: ${lexeme.feature}`, input, span);
        case 'ordinal':
          tokens.push({ t: 'num', value: lexeme.value, ordinal: true, span });
          break;
        case 'cardinal': {
          const previous = tokens.at(-1);
          const tens = previous?.t === 'num' && !previous.ordinal && wordTens === previous && lexeme.value < 10;
          if (tens) tokens[tokens.length - 1] = { ...previous, value: previous.value + lexeme.value, span: { start: previous.span.start, end: span.end } };
          else tokens.push({ t: 'num', value: lexeme.value, ordinal: false, span });
          break;
        }
        case 'halfOf':
          tokens.push({ t: 'half', span: { start: span.start, end: span.start + 3 } });
          tokens.push({ t: 'num', value: lexeme.value, ordinal: true, span: { start: span.start + 3, end: span.end } });
          break;
        case 'amount':
          if (lexeme.every === true) tokens.push({ t: 'every', span });
          tokens.push({ t: 'num', value: lexeme.value, ordinal: false, span }, { t: 'unit', unit: lexeme.unit, span });
          break;
        default:
          tokens.push({ ...lexeme, span });
      }
      const last = tokens.at(-1);
      wordTens = lexeme.t === 'cardinal' && last?.t === 'num' && last.value % 10 === 0 && last.value >= 20 ? last : null;
      index = span.end;
      continue;
    }

    const single = { start: index, end: index + 1 };
    if (matchAt(DASH, text, index) !== null) {
      tokens.push({ t: 'dash', span: single });
    } else if (matchAt(SEPARATOR, text, index) !== null) {
      tokens.push({ t: 'and', span: single });
    } else {
      throw new CronsenseError('UNEXPECTED_TOKEN', `Unexpected character "${input.charAt(index)}"`, input, single);
    }
    index += 1;
  }

  return tokens;
};
