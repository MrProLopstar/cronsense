import { CronsenseError } from './errors.js';
import { lookupWord, type Lexeme } from './lexicon.js';
import type { Span } from './types.js';

type Spanned<T> = T & { readonly span: Span };

export type Token =
  | Spanned<{ readonly t: 'num'; readonly value: number; readonly ordinal: boolean }>
  | Spanned<{ readonly t: 'time'; readonly hour: number; readonly minute: number }>
  | Spanned<{ readonly t: 'dash' }>
  | Spanned<Exclude<Lexeme, { readonly t: 'noise' | 'ordinal' | 'unsupported' }>>;

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

export const tokenize = (input: string): Token[] => {
  const text = normalize(input);
  const tokens: Token[] = [];
  let index = 0;

  while (index < text.length) {
    const space = matchAt(SPACE, text, index) ?? matchAt(IGNORED, text, index);
    if (space !== null) {
      index += space[0].length;
      continue;
    }

    const time = matchAt(TIME, text, index);
    if (time !== null) {
      const span = { start: index, end: index + time[0].length };
      tokens.push({ t: 'time', hour: Number(time[1]), minute: Number(time[2]), span });
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
        default:
          tokens.push({ ...lexeme, span });
      }
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
