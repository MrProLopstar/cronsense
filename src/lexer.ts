import { CronsenseError } from './errors.js';
import { matchHoliday, type Holiday } from './holidays.js';
import { lookupWord, type Lexeme } from './lexicon.js';
import type { Span } from './types.js';

type Spanned<T> = T & { readonly span: Span };

export type Token =
  | Spanned<{ readonly t: 'num'; readonly value: number; readonly ordinal: boolean }>
  | Spanned<{ readonly t: 'time'; readonly hour: number; readonly minute: number; readonly padded: boolean }>
  | Spanned<{ readonly t: 'dash' }>
  | Spanned<{ readonly t: 'holiday'; readonly holiday: Holiday }>
  | Spanned<Exclude<Lexeme, { readonly t: 'noise' | 'ordinal' | 'cardinal' | 'halfOf' | 'amount' | 'unsupported' }>>;

export type TokenOf<K extends Token['t']> = Extract<Token, { readonly t: K }>;

const SPACE = /\s+/y;
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
