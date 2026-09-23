import type { Span } from './types.js';

/** Machine-readable reason a schedule could not be parsed. */
export type ErrorCode =
  | 'EMPTY_INPUT'
  | 'UNKNOWN_WORD'
  | 'UNEXPECTED_TOKEN'
  | 'UNEXPECTED_END'
  | 'OUT_OF_RANGE'
  | 'AMBIGUOUS'
  | 'CONFLICT'
  | 'INCOMPLETE'
  | 'UNSUPPORTED'
  | 'INVALID_CRON';

/** Error thrown by cronsense with a code and the position of the problem in the input. */
export class CronsenseError extends Error {
  override readonly name = 'CronsenseError';
  readonly code: ErrorCode;
  readonly input: string;
  readonly span: Span | null;

  constructor(code: ErrorCode, message: string, input: string, span: Span | null = null) {
    super(message);
    this.code = code;
    this.input = input;
    this.span = span;
  }

  /** Input followed by a line of `^` markers under the problematic part. */
  get excerpt(): string {
    if (this.span === null) return this.input;
    const width = Math.max(1, this.span.end - this.span.start);
    return `${this.input}\n${' '.repeat(this.span.start)}${'^'.repeat(width)}`;
  }
}

/** Type guard for {@link CronsenseError}. */
export const isCronsenseError = (value: unknown): value is CronsenseError =>
  value instanceof CronsenseError;
