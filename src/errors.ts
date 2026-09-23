import type { Span } from './types.js';

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

  get excerpt(): string {
    if (this.span === null) return this.input;
    const width = Math.max(1, this.span.end - this.span.start);
    return `${this.input}\n${' '.repeat(this.span.start)}${'^'.repeat(width)}`;
  }
}

export const isCronsenseError = (value: unknown): value is CronsenseError =>
  value instanceof CronsenseError;
