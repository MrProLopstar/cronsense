import { CronsenseError, type ErrorCode } from './errors.js';
import { ANY, DAYS_IN_MONTH, expandField, formatCron, stepField, valuesField } from './field.js';
import { tokenize, type Token, type TokenOf } from './lexer.js';
import type { CronField, CronFields, EasterCalendar, Meridiem, ParseOptions, Schedule, Span, Unit, Weekday } from './types.js';

export interface Plan {
  readonly freq: 'MINUTELY' | 'HOURLY' | 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'YEARLY';
  readonly interval: number;
  readonly byMonth: readonly number[];
  readonly byMonthDay: readonly number[];
  readonly byDay: readonly { readonly nth: number | null; readonly day: Weekday }[];
  readonly byHour: readonly number[] | null;
  readonly byMinute: readonly number[] | null;
  readonly byEaster: readonly number[];
  readonly byDates: readonly { readonly month: number; readonly day: number }[];
  readonly bySetPos: readonly number[];
  readonly setPosGroup: 'weekday' | 'workday' | null;
  readonly workdays: boolean;
  readonly easter: EasterCalendar;
}

interface Interval {
  readonly unit: Unit;
  readonly step: number;
  readonly span: Span;
}

interface Clock {
  readonly hour: number;
  readonly minute: number;
  readonly span: Span;
  readonly ambiguous?: true;
}

interface TimeWindow {
  readonly from: Clock | null;
  readonly to: Clock;
  readonly span: Span;
}

type Item =
  | { readonly k: 'num'; readonly value: number; readonly ordinal: boolean; readonly span: Span }
  | { readonly k: 'clock'; readonly clock: Clock }
  | { readonly k: 'mark'; readonly minute: number; readonly span: Span };

type Entry =
  | { readonly k: 'single'; readonly item: Item; readonly span: Span }
  | { readonly k: 'range'; readonly from: Item; readonly to: Item; readonly span: Span };

interface Tracked<T> {
  readonly values: Set<T>;
  readonly span: Span;
}

const MAX_STEP: { readonly [K in Unit]: number } = {
  minute: 59,
  hour: 23,
  day: 31,
  week: 1,
  month: 12,
  year: 1,
};

const VALUE_TOKENS: ReadonlySet<Token['t']> = new Set(['num', 'time', 'clock', 'half', 'quarter', 'without']);

const join = (a: Span, b: Span): Span => ({ start: Math.min(a.start, b.start), end: Math.max(a.end, b.end) });

const itemSpan = (item: Item): Span => (item.k === 'clock' ? item.clock.span : item.span);

const weekdayOf = (value: number): Weekday => (((value % 7) + 7) % 7) as Weekday;

class Parser {
  private index = 0;
  private atContext = false;
  private readonly intervals = new Map<Unit, Interval>();
  private readonly times: Clock[] = [];
  private readonly minuteMarks: Array<{ readonly minute: number; readonly span: Span }> = [];
  private window: TimeWindow | null = null;
  private weekdays: Tracked<Weekday> | null = null;
  private monthDays: Tracked<number> | null = null;
  private months: Tracked<number> | null = null;

  private readonly nthWeekdays: Array<{ readonly nth: number; readonly day: Weekday }> = [];
  private lastDay = false;
  private readonly easterOffsets: number[] = [];
  private readonly easterWords = new Set<EasterCalendar>();
  private easterSpan: Span | null = null;
  private readonly holidayDates: Array<{ readonly month: number; readonly day: number; readonly span: Span }> = [];
  private readonly setPositions: number[] = [];
  private setPosGroup: 'weekday' | 'workday' | null = null;
  private workdayFilter = false;
  private hourParity: 'even' | 'odd' | null = null;
  private dayParity: { readonly odd: boolean; readonly span: Span } | null = null;

  constructor(
    private readonly input: string,
    private readonly tokens: readonly Token[],
    private readonly options: ParseOptions,
    private readonly target: 'cron' | 'rrule' = 'cron',
  ) {}

  run(): Schedule {
    this.consume();
    const fields = this.build();
    return { cron: formatCron(fields), fields };
  }

  runRRule(): string {
    this.consume();
    return this.rrule();
  }

  runPlan(): Plan {
    this.consume();
    return this.plan();
  }

  private consume(): void {
    if (this.tokens.length === 0) this.fail('EMPTY_INPUT', 'Schedule description is empty', null);
    while (this.peek() !== undefined) this.clause();
  }

  private rruleOnly(feature: string, span: Span): void {
    if (this.target === 'cron') this.fail('UNSUPPORTED', `Not expressible in cron: ${feature}; use toRRule or occurrences`, span);
  }

  private fail(code: ErrorCode, message: string, span: Span | null): never {
    throw new CronsenseError(code, message, this.input, span);
  }

  private text(span: Span): string {
    return this.input.slice(span.start, span.end);
  }

  private peek(offset = 0): Token | undefined {
    return this.tokens[this.index + offset];
  }

  private kindAt(offset: number): Token['t'] | undefined {
    return this.peek(offset)?.t;
  }

  private advance(): Token {
    const token = this.peek();
    if (token === undefined) {
      this.fail('UNEXPECTED_END', 'Description ends too early', { start: this.input.length, end: this.input.length });
    }
    this.index += 1;
    return token;
  }

  private take<K extends Token['t']>(kind: K): TokenOf<K> | null {
    const token = this.peek();
    if (token === undefined || token.t !== kind) return null;
    this.index += 1;
    return token as TokenOf<K>;
  }

  private expect<K extends Token['t']>(kind: K, description: string): TokenOf<K> {
    const token = this.take(kind);
    if (token !== null) return token;
    const actual = this.peek();
    if (actual === undefined) {
      this.fail('UNEXPECTED_END', `Expected ${description}`, { start: this.input.length, end: this.input.length });
    }
    this.fail('UNEXPECTED_TOKEN', `Expected ${description}, got "${this.text(actual.span)}"`, actual.span);
  }

  private takeUnit(unit: Unit): boolean {
    const token = this.peek();
    if (token?.t !== 'unit' || token.unit !== unit || token.meridiem !== undefined) return false;
    this.index += 1;
    return true;
  }

  private unexpected(token: Token): never {
    this.fail('UNEXPECTED_TOKEN', `Unexpected "${this.text(token.span)}"`, token.span);
  }

  private isRangeSeparator(offset: number): boolean {
    const kind = this.kindAt(offset);
    return kind === 'dash' || kind === 'to';
  }

  private connectorLength(allowWeakTo: boolean): number {
    let offset = 0;
    if (this.kindAt(offset) !== 'and') return 0;
    offset += 1;
    for (;;) {
      const token = this.peek(offset);
      if (token?.t === 'at' || (allowWeakTo && ((token?.t === 'to' && token.weak) || token?.t === 'from'))) offset += 1;
      else return offset;
    }
  }

  private clause(): void {
    if (this.easterPhrase()) return;
    const token = this.advance();
    const at = this.atContext;
    this.atContext = false;

    switch (token.t) {
      case 'every':
        this.every(1, token.span);
        return;
      case 'other':
        this.every(2, token.span);
        return;
      case 'freq':
        this.addInterval(token.unit, 1, token.span);
        return;
      case 'at':
        this.atContext = true;
        return;
      case 'and':
        return;
      case 'to':
        if (!token.weak) this.openWindow(token);
        return;
      case 'from':
        this.fromClause(token);
        return;
      case 'dow':
        this.weekdayList(token);
        return;
      case 'month':
        this.monthPhrase(token, true);
        return;
      case 'num':
      case 'time':
      case 'clock':
      case 'half':
      case 'quarter':
      case 'without':
        this.index -= 1;
        this.valueList(at);
        return;
      case 'last':
        this.lastPhrase(token);
        return;
      case 'holiday':
        this.addHoliday(token, null);
        return;
      case 'parity':
        this.parity(token, token.span);
        return;
      case 'starting': {
        while (this.take('from') !== null || this.take('at') !== null);
        const start = this.item();
        const clock = this.toClock(start);
        this.setWindow(clock, { hour: 23, minute: 59, span: clock.span }, join(token.span, clock.span));
        return;
      }
      case 'unit':
        if (at && token.unit === 'hour' && token.meridiem === undefined) {
          this.index -= 1;
          this.valueList(at);
          return;
        }
        this.unexpected(token);
      case 'easterKind': {
        const next = this.peek();
        if (next?.t !== 'holiday') this.unexpected(token);
        this.index += 1;
        this.addHoliday(next, token.calendar);
        return;
      }
      case 'meridiem':
      case 'domMarker':
      case 'dash':
      case 'easter':
      case 'after':
      case 'before':
        this.unexpected(token);
        return;
      default: {
        const unhandled: never = token;
        this.unexpected(unhandled);
      }
    }
  }

  private every(initialStep: number, start: Span): void {
    while (this.take('at') !== null);
    const other = this.take('other');
    const step = other === null ? initialStep : initialStep * 2;
    const token = this.peek();
    if (token === undefined) this.fail('INCOMPLETE', `"${this.text(start)}" needs a unit, e.g. "every 5 minutes"`, start);

    switch (token.t) {
      case 'parity':
        if (step !== 1) this.unexpected(token);
        this.advance();
        this.parity(token, start);
        return;
      case 'unit':
        this.advance();
        this.addInterval(token.unit, step, join(start, token.span));
        return;
      case 'half': {
        const hour = this.peek(1);
        if (step !== 1 || hour?.t !== 'unit' || hour.unit !== 'hour') this.unexpected(token);
        this.index += 2;
        this.addInterval('minute', 30, join(start, hour.span));
        return;
      }
      case 'num': {
        const unit = this.peek(1);
        if (unit?.t === 'unit') {
          if (step !== 1) this.unexpected(token);
          this.index += 2;
          this.addInterval(unit.unit, token.value, join(start, unit.span));
          return;
        }
        if (step !== 1) this.unexpected(token);
        this.valueList(false);
        return;
      }
      case 'dow':
      case 'month':
        if (step !== 1 && (token.t === 'month' || this.target === 'cron')) {
          this.fail('UNSUPPORTED', `"Every other" is only supported with minutes, hours, days and months`, join(start, token.span));
        }
        if (step !== 1) this.addInterval('week', step, join(start, token.span));
        this.advance();
        if (token.t === 'dow') this.weekdayList(token);
        else this.monthPhrase(token, true);
        return;
      default:
        this.unexpected(token);
    }
  }

  private addInterval(unit: Unit, step: number, span: Span): void {
    if (!Number.isInteger(step) || step < 1) this.fail('OUT_OF_RANGE', `Interval must be a positive whole number`, span);
    const max = this.target === 'rrule' ? Number.MAX_SAFE_INTEGER : MAX_STEP[unit];
    if (step > max) {
      if (max === 1) this.fail('UNSUPPORTED', `Cron cannot repeat every ${step} ${unit}s`, span);
      const hint = unit === 'minute' && step % 60 === 0 ? `; use "every ${step / 60} hours"` : '';
      this.fail('OUT_OF_RANGE', `Every ${step} ${unit}s exceeds the maximum of ${max}${hint}`, span);
    }
    const coarse: readonly Unit[] = ['day', 'week', 'month', 'year'];
    const combinable = (entry: Interval): boolean =>
      this.target === 'cron' && entry.step > 1 && step > 1 && ![entry.unit, unit].some((value) => value === 'week' || value === 'year');
    const other = coarse.includes(unit)
      ? [...this.intervals.values()].find((entry) => entry.unit !== unit && coarse.includes(entry.unit) && !combinable(entry))
      : undefined;
    if (other !== undefined) this.fail('CONFLICT', `"${this.text(other.span)}" and "${this.text(span)}" are conflicting intervals`, span);
    const existing = this.intervals.get(unit);
    if (existing !== undefined && existing.step !== step) {
      this.fail('CONFLICT', `Conflicting ${unit} intervals`, span);
    }
    this.intervals.set(unit, { unit, step, span });
  }

  private meridiemSuffix(): { readonly meridiem: Meridiem; readonly span: Span } | null {
    const token = this.peek();
    if (token?.t === 'meridiem') {
      this.index += 1;
      return { meridiem: token.meridiem, span: token.span };
    }
    if (token?.t === 'unit' && token.meridiem !== undefined) {
      this.index += 1;
      return { meridiem: token.meridiem, span: token.span };
    }
    return null;
  }

  private makeClock(hour: number, minute: number, span: Span, meridiem: Meridiem | null, padded = false): Clock {
    if (minute < 0 || minute > 59) this.fail('OUT_OF_RANGE', `Minute ${minute} is out of range 0-59`, span);
    if (meridiem === null) {
      if (hour > 23) this.fail('OUT_OF_RANGE', `Hour ${hour} is out of range 0-23`, span);
      return hour >= 1 && hour <= 12 && !padded ? { hour, minute, span, ambiguous: true } : { hour, minute, span };
    }
    if (hour < 1 || hour > 12) this.fail('OUT_OF_RANGE', `Hour ${hour} cannot be used with am/pm`, span);
    const base = hour % 12;
    switch (meridiem) {
      case 'am':
        return { hour: base, minute, span };
      case 'pm':
        return { hour: base + 12, minute, span };
      case 'night':
        return { hour: hour <= 5 || hour === 12 ? base : base + 12, minute, span };
    }
  }

  private hourOf(token: Token | undefined, what: string): { readonly hour: number; readonly span: Span } {
    if (token?.t !== 'num' || !token.ordinal) {
      const span = token?.span ?? { start: this.input.length, end: this.input.length };
      this.fail('INCOMPLETE', `Expected an hour after "${what}", e.g. «третьего»`, span);
    }
    this.index += 1;
    if (token.value < 1 || token.value > 12) this.fail('OUT_OF_RANGE', `Hour «${this.text(token.span)}» must be between first and twelfth`, token.span);
    return { hour: token.value === 1 ? 12 : token.value - 1, span: token.span };
  }

  private spokenClock(hour: number, minute: number, start: Span, end: Span): Item {
    const suffix = this.meridiemSuffix();
    const span = join(start, suffix?.span ?? end);
    return { k: 'clock', clock: this.makeClock(hour, minute, span, suffix?.meridiem ?? null) };
  }

  private beforeHour(start: Span): Item {
    let minutes: number;
    const amount = this.advance();
    if (amount.t === 'quarter') minutes = 15;
    else if (amount.t === 'num' && !amount.ordinal) minutes = amount.value;
    else this.unexpected(amount);
    const unit = this.peek();
    if (unit?.t === 'unit' && unit.unit === 'minute') this.index += 1;
    const next = this.peek();
    const hourFollows = next?.t === 'num' || next?.t === 'clock' || (next?.t === 'unit' && next.unit === 'hour' && next.meridiem === undefined);
    const compound = amount.t === 'num' && minutes > 20 && minutes % 10 !== 0 && /\s/.test(this.text(amount.span));
    if (!hourFollows && compound) {
      const hour = minutes % 10;
      return this.spokenClock(hour === 1 ? 12 : hour - 1, 60 - (minutes - hour), start, amount.span);
    }
    if (minutes < 1 || minutes > 59) this.fail('OUT_OF_RANGE', `"${this.text(amount.span)}" must be between 1 and 59 minutes`, amount.span);
    const target = this.advance();
    let hour: number;
    if (target.t === 'num' && !target.ordinal) hour = target.value;
    else if (target.t === 'unit' && target.unit === 'hour' && target.meridiem === undefined) hour = 1;
    else if (target.t === 'clock') hour = target.hour === 0 ? 24 : 12;
    else if (target.t === 'meridiem' && this.text(target.span).toLowerCase() === 'пополудни') return { k: 'clock', clock: { hour: 11, minute: 60 - minutes, span: join(start, target.span) } };
    else this.unexpected(target);
    const hourUnit = this.peek();
    if (hourUnit?.t === 'unit' && hourUnit.unit === 'hour' && hourUnit.meridiem === undefined && target.t === 'num') this.index += 1;
    if (hour < 1 || hour > 24) this.fail('OUT_OF_RANGE', `Hour ${hour} is out of range 1-24`, target.span);
    return this.spokenClock(hour === 1 ? 12 : hour - 1, 60 - minutes, start, target.span);
  }

  private item(): Item {
    const token = this.advance();
    switch (token.t) {
      case 'unit': {
        if (token.unit !== 'hour' || token.meridiem !== undefined) this.unexpected(token);
        return this.spokenClock(1, 0, token.span, token.span);
      }
      case 'half': {
        this.take('dash');
        const { hour, span } = this.hourOf(this.peek(), this.text(token.span));
        return this.spokenClock(hour, 30, token.span, span);
      }
      case 'quarter': {
        const { hour, span } = this.hourOf(this.peek(), this.text(token.span));
        return this.spokenClock(hour, 15, token.span, span);
      }
      case 'without':
        return this.beforeHour(token.span);
      case 'clock':
        return { k: 'clock', clock: { hour: token.hour, minute: 0, span: token.span } };
      case 'time': {
        const suffix = this.meridiemSuffix();
        const span = suffix === null ? token.span : join(token.span, suffix.span);
        return { k: 'clock', clock: this.makeClock(token.hour, token.minute, span, suffix?.meridiem ?? null, token.padded) };
      }
      case 'num': {
        if (token.ordinal) return { k: 'num', value: token.value, ordinal: true, span: token.span };
        let span = token.span;
        let minute = 0;
        let explicit = false;
        const minuteUnit = this.peek();
        if (minuteUnit?.t === 'unit' && minuteUnit.unit === 'minute') {
          this.index += 1;
          span = join(span, minuteUnit.span);
          if (token.value > 59) this.fail('OUT_OF_RANGE', `Minute ${token.value} is out of range 0-59`, span);
          const hourWord = this.peek();
          if (hourWord?.t === 'num' && hourWord.ordinal && this.kindAt(1) !== 'domMarker') {
            const { hour, span: end } = this.hourOf(hourWord, this.text(span));
            return this.spokenClock(hour, token.value, token.span, end);
          }
          return { k: 'mark', minute: token.value, span };
        }
        const hourUnit = this.peek();
        if (hourUnit?.t === 'unit' && hourUnit.unit === 'hour') {
          this.index += 1;
          span = join(span, hourUnit.span);
          explicit = true;
          const minutes = this.peek();
          const minuteUnit = this.peek(1);
          if (minutes?.t === 'num' && !minutes.ordinal && minuteUnit?.t === 'unit' && minuteUnit.unit === 'minute') {
            this.index += 2;
            minute = minutes.value;
            span = join(span, minuteUnit.span);
          }
        }
        const suffix = this.meridiemSuffix();
        if (suffix !== null) {
          span = join(span, suffix.span);
          explicit = true;
        }
        if (!explicit) return { k: 'num', value: token.value, ordinal: false, span };
        return { k: 'clock', clock: this.makeClock(token.value, minute, span, suffix?.meridiem ?? null) };
      }
      default:
        this.unexpected(token);
    }
  }

  private entry(): Entry {
    const from = this.item();
    if (this.isRangeSeparator(0) && VALUE_TOKENS.has(this.kindAt(1) ?? 'and')) {
      this.index += 1;
      const to = this.item();
      return { k: 'range', from, to, span: join(itemSpan(from), itemSpan(to)) };
    }
    return { k: 'single', item: from, span: itemSpan(from) };
  }

  private entries(): Entry[] {
    const result = [this.entry()];
    for (;;) {
      const skip = this.connectorLength(false);
      if (skip === 0 || !VALUE_TOKENS.has(this.kindAt(skip) ?? 'and')) return result;
      this.index += skip;
      result.push(this.entry());
    }
  }

  private valueList(at: boolean): void {
    this.resolve(this.entries(), at);
  }

  private resolve(entries: readonly Entry[], at: boolean): void {
    const items = entries.flatMap((entry) => (entry.k === 'single' ? [entry.item] : [entry.from, entry.to]));
    if (items.some((item) => item.k === 'mark')) {
      for (const entry of entries) {
        if (entry.k === 'range' || entry.item.k === 'clock' || (entry.item.k === 'num' && entry.item.ordinal)) {
          this.fail('UNEXPECTED_TOKEN', `Expected minutes of the hour`, entry.span);
        }
        const item = entry.item;
        const minute = item.k === 'mark' ? item.minute : item.value;
        if (minute > 59) this.fail('OUT_OF_RANGE', `Minute ${minute} is out of range 0-59`, entry.span);
        this.minuteMarks.push({ minute, span: entry.span });
      }
      return;
    }

    const nthDay = this.peek();
    if (nthDay?.t === 'dow' && entries.every((entry) => entry.k === 'single' && entry.item.k === 'num' && entry.item.ordinal)) {
      this.nthWeekday(items.map((item) => (item.k === 'num' ? item.value : 0)), nthDay);
      return;
    }

    const next = this.peek();
    const marked =
      next?.t === 'domMarker' || next?.t === 'month' || items.some((item) => item.k === 'num' && item.ordinal);

    if (marked) {
      const { days, span } = this.dayValues(entries);
      this.take('domMarker');
      this.takeUnit('day');
      this.takeUnit('month');
      const month = this.take('month');
      if (month === null) {
        this.monthDays = this.track(this.monthDays, days, span);
        return;
      }
      const names = this.collectNames(month, 12, 1);
      this.addDatePairs(days, names.values, join(span, names.span));
      return;
    }

    if (items.some((item) => item.k === 'clock') || at) {
      this.addClockEntries(entries);
      return;
    }

    const [only] = entries;
    if (entries.length === 1 && only?.k === 'range') {
      this.setWindow(this.toClock(only.from), this.toClock(only.to), only.span);
      return;
    }

    const span = join(entries[0]?.span ?? { start: 0, end: 0 }, entries.at(-1)?.span ?? { start: 0, end: 0 });
    this.fail('AMBIGUOUS', `Unclear whether "${this.text(span)}" is a time or a day; add "at"/"в" or "числа"/"th"`, span);
  }

  private toClock(item: Item): Clock {
    if (item.k === 'clock') return item.clock;
    if (item.k === 'mark') this.fail('UNEXPECTED_TOKEN', `Minutes of the hour cannot be a time of day`, item.span);
    if (item.ordinal) this.fail('UNEXPECTED_TOKEN', `Ordinal "${this.text(item.span)}" cannot be a time of day`, item.span);
    return this.makeClock(item.value, 0, item.span, null);
  }

  private addClockEntries(entries: readonly Entry[]): void {
    const [only] = entries;
    if (entries.length === 1 && only?.k === 'range') {
      this.setWindow(this.toClock(only.from), this.toClock(only.to), only.span);
      return;
    }
    for (const entry of entries) {
      if (entry.k === 'range') {
        this.fail('UNSUPPORTED', `A time range cannot be mixed with separate times`, entry.span);
      }
      const clock = this.toClock(entry.item);
      if (clock.ambiguous === true && this.options.strictHours === true) {
        this.fail('AMBIGUOUS', `"${this.text(clock.span)}" could be morning or evening; add «утра»/«вечера», am/pm, or use 24-hour time`, clock.span);
      }
      this.times.push(clock);
    }
  }

  private setWindow(from: Clock | null, to: Clock, span: Span): void {
    if (this.window !== null) this.fail('CONFLICT', `Only one time range is allowed`, span);
    const start = from ?? { hour: 0, minute: 0, span };
    if (start.hour === to.hour && start.minute === to.minute) this.fail('OUT_OF_RANGE', `Time range is empty`, span);
    this.window = { from, to, span };
  }

  private openWindow(token: TokenOf<'to'>): void {
    const end = this.item();
    this.setWindow(null, this.toClock(end), join(token.span, itemSpan(end)));
  }

  private fromClause(token: TokenOf<'from'>): void {
    while (this.take('at') !== null);
    const next = this.peek();
    if (next?.t === 'dow') {
      this.index += 1;
      this.weekdayList(next);
      return;
    }
    if (next?.t === 'month') {
      this.index += 1;
      this.monthPhrase(next, true);
      return;
    }
    const from = this.item();
    const separator = this.peek();
    if (separator === undefined || !(separator.t === 'dash' || separator.t === 'to' || separator.t === 'and')) {
      this.fail('INCOMPLETE', `"${this.text(join(token.span, itemSpan(from)))}" needs an end, e.g. "from 9 to 18"`, join(token.span, itemSpan(from)));
    }
    this.index += 1;
    const to = this.item();
    this.resolve([{ k: 'range', from, to, span: join(token.span, itemSpan(to)) }], false);
  }

  private collectNames(
    first: TokenOf<'dow' | 'month'>,
    size: number,
    offset: number,
  ): { readonly values: number[]; readonly span: Span } {
    const kind = first.t;
    const valuesOf = (token: TokenOf<'dow' | 'month'>): readonly number[] =>
      token.t === 'dow' ? token.days : [token.month];
    const values: number[] = [];
    let span = first.span;
    let current = first;

    for (;;) {
      const tokenValues = valuesOf(current);
      if (this.isRangeSeparator(0) && this.kindAt(1) === kind) {
        this.index += 1;
        const end = this.expect(kind, 'a name');
        const endValues = valuesOf(end);
        const [a] = tokenValues;
        const [b] = endValues;
        if (tokenValues.length !== 1 || endValues.length !== 1 || a === undefined || b === undefined) {
          this.fail('UNEXPECTED_TOKEN', `Ranges need single names on both ends`, join(current.span, end.span));
        }
        const length = (((b - a) % size) + size) % size;
        for (let i = 0; i <= length; i += 1) values.push(((a - offset + i) % size) + offset);
        span = join(span, end.span);
      } else {
        values.push(...tokenValues);
      }

      const skip = this.connectorLength(true);
      if (skip === 0 || this.kindAt(skip) !== kind) return { values, span };
      this.index += skip;
      current = this.expect(kind, 'a name');
      span = join(span, current.span);
    }
  }

  private easterPhrase(): boolean {
    let offset = 0;
    if (this.kindAt(0) === 'other' && this.kindAt(1) === 'num') offset = 1;
    const amount = this.peek(offset);
    const unit = this.peek(offset + 1);
    const direction = this.peek(offset + 2);
    let days = 0;
    let length = 0;
    if (amount?.t === 'num' && unit?.t === 'unit' && unit.unit === 'day' && (direction?.t === 'after' || direction?.t === 'before' || (direction?.t === 'to' && !direction.weak))) {
      const count = amount.ordinal ? amount.value - 1 : amount.value;
      days = direction.t === 'after' ? count : -count;
      length = offset + 3;
    }
    const kind = this.peek(length);
    const easterAt = kind?.t === 'easterKind' ? length + 1 : length;
    const easter = this.peek(easterAt);
    if (easter?.t !== 'easter') return false;
    const start = this.peek(0)?.span ?? easter.span;
    this.index += easterAt + 1;
    const span = join(start, easter.span);
    this.rruleOnly('dates relative to Easter', span);
    this.easterWords.add(kind?.t === 'easterKind' ? kind.calendar : easter.calendar);
    this.easterOffsets.push(days);
    this.easterSpan = this.easterSpan === null ? span : join(this.easterSpan, span);
    return true;
  }

  private parity(token: TokenOf<'parity'>, start: Span): void {
    const next = this.peek();
    if (next?.t === 'unit' && next.unit === 'hour' && next.meridiem === undefined) {
      this.index += 1;
      if (this.hourParity !== null) this.fail('CONFLICT', `Even and odd hours cannot be combined`, token.span);
      this.hourParity = token.odd ? 'odd' : 'even';
      this.addInterval('hour', 2, join(start, next.span));
      return;
    }
    if (next?.t === 'domMarker' || (next?.t === 'unit' && next.unit === 'day')) this.index += 1;
    if (this.dayParity !== null) this.fail('CONFLICT', `Even and odd days cannot be combined`, token.span);
    this.dayParity = { odd: token.odd, span: join(start, token.span) };
  }

  private addHoliday(token: TokenOf<'holiday'>, adjective: EasterCalendar | null): void {
    const { rule } = token.holiday;
    const calendar = this.options.easter ?? adjective ?? token.holiday.calendar;
    if (rule.kind === 'fixed') {
      const [month, day] = rule[calendar];
      this.holidayDates.push({ month, day, span: token.span });
      return;
    }
    this.rruleOnly('dates relative to Easter', token.span);
    this.easterWords.add(calendar);
    this.easterOffsets.push(...rule.offsets);
    this.easterSpan = this.easterSpan === null ? token.span : join(this.easterSpan, token.span);
  }

  private applyHolidayDates(allowList: boolean): readonly { readonly month: number; readonly day: number }[] {
    const dates = this.holidayDates;
    const [first] = dates;
    if (first === undefined) return [];
    const span = join(first.span, dates.at(-1)?.span ?? first.span);
    if (this.monthDays !== null || this.months !== null || this.weekdays !== null || this.lastDay || this.nthWeekdays.length > 0) {
      this.fail('CONFLICT', `A holiday already fixes the date; remove the other day rules`, span);
    }
    const months = new Set(dates.map((date) => date.month));
    const days = new Set(dates.map((date) => date.day));
    const distinct = new Set(dates.map((date) => date.month * 100 + date.day));
    if (this.easterOffsets.length === 0 && months.size * days.size === distinct.size) {
      this.months = { values: months, span };
      this.monthDays = { values: days, span };
      return [];
    }
    if (!allowList) {
      this.fail('UNSUPPORTED', `These holidays fall on different dates that one ${this.target === 'cron' ? 'cron expression' : 'RRULE'} cannot hold; split them or use occurrences`, span);
    }
    return [...distinct].map((value) => ({ month: Math.floor(value / 100), day: value % 100 }));
  }

  private easterCalendar(): EasterCalendar {
    if (this.options.easter !== undefined) return this.options.easter;
    if (this.easterWords.size > 1) this.fail('CONFLICT', `Both Orthodox and Western Easter are mentioned`, this.easterSpan);
    return this.easterWords.values().next().value ?? 'orthodox';
  }

  private setPosition(positions: readonly number[], dow: TokenOf<'dow'> & { readonly group: 'weekday' | 'workday' }): void {
    this.index += 1;
    this.takeUnit('day');
    this.takeUnit('month');
    this.rruleOnly('Nth working day of the month', dow.span);
    if (this.setPosGroup !== null && this.setPosGroup !== dow.group) this.fail('CONFLICT', `Weekdays and working days cannot be mixed`, dow.span);
    this.setPosGroup = dow.group;
    for (const position of positions) {
      if (position < -1 || position === 0 || position > 23) this.fail('OUT_OF_RANGE', `A month has at most 23 working days`, dow.span);
      this.setPositions.push(position);
    }
  }

  private nthWeekday(nths: readonly number[], dow: TokenOf<'dow'>): void {
    const { group } = dow;
    if (group !== undefined) {
      this.setPosition(nths, { ...dow, group });
      return;
    }
    this.index += 1;
    const [day] = dow.days;
    if (dow.days.length !== 1 || day === undefined) this.fail('UNEXPECTED_TOKEN', `Expected a single weekday after an ordinal`, dow.span);
    this.rruleOnly('Nth weekday of the month', dow.span);
    for (const nth of nths) {
      if (nth < 1 || nth > 5) this.fail('OUT_OF_RANGE', `A month has at most 5 of each weekday`, dow.span);
      this.nthWeekdays.push({ nth, day: weekdayOf(day) });
    }
    this.takeUnit('month');
  }

  private lastPhrase(token: TokenOf<'last'>): void {
    const next = this.peek();
    if (next?.t === 'dow' && next.group !== undefined) {
      this.setPosition([-1], { ...next, group: next.group });
      return;
    }
    if (next?.t === 'dow') {
      this.nthWeekday([], next);
      const [day] = next.days;
      if (day !== undefined) this.nthWeekdays.push({ nth: -1, day: weekdayOf(day) });
      return;
    }
    if ((next?.t === 'unit' && next.unit === 'day') || next?.t === 'domMarker') {
      this.index += 1;
      this.rruleOnly('last day of the month', join(token.span, next.span));
      this.lastDay = true;
      this.takeUnit('month');
      return;
    }
    this.fail('INCOMPLETE', `Expected a weekday or «день» after "${this.text(token.span)}"`, token.span);
  }

  private weekdayList(first: TokenOf<'dow'>): void {
    const start = this.index - 1;
    const { values, span } = this.collectNames(first, 7, 0);
    if (this.tokens.slice(start, this.index).some((token) => token.t === 'dow' && token.group === 'workday')) this.workdayFilter = true;
    this.weekdays = this.track(this.weekdays, values.map(weekdayOf), span);
    this.takeUnit('day');
  }

  private monthPhrase(first: TokenOf<'month'>, allowDays: boolean): void {
    const { values, span } = this.collectNames(first, 12, 1);
    if (allowDays && this.kindAt(0) === 'num') {
      const { days, span: daySpan } = this.dayValues(this.entries());
      this.take('domMarker');
      this.addDatePairs(days, values, join(span, daySpan));
      return;
    }
    this.months = this.track(this.months, values, span);
  }

  private addDatePairs(days: readonly number[], months: readonly number[], span: Span): void {
    for (const month of months) {
      for (const day of days) {
        if (day > (DAYS_IN_MONTH[month - 1] ?? 31)) this.fail('OUT_OF_RANGE', `Day ${day} never occurs in month ${month}`, span);
        this.holidayDates.push({ month, day, span });
      }
    }
  }

  private dayValues(entries: readonly Entry[]): { readonly days: number[]; readonly span: Span } {
    const days: number[] = [];
    const dayOf = (item: Item): number => {
      if (item.k === 'clock') this.fail('AMBIGUOUS', `"${this.text(item.clock.span)}" looks like a time, not a day`, item.clock.span);
      if (item.k === 'mark') this.fail('AMBIGUOUS', `"${this.text(item.span)}" looks like minutes, not a day`, item.span);
      if (item.value < 1 || item.value > 31) this.fail('OUT_OF_RANGE', `Day ${item.value} is out of range 1-31`, item.span);
      return item.value;
    };
    for (const entry of entries) {
      if (entry.k === 'single') {
        days.push(dayOf(entry.item));
        continue;
      }
      const from = dayOf(entry.from);
      const to = dayOf(entry.to);
      if (from > to) this.fail('OUT_OF_RANGE', `Day range must go forward`, entry.span);
      for (let day = from; day <= to; day += 1) days.push(day);
    }
    const span = join(entries[0]?.span ?? { start: 0, end: 0 }, entries.at(-1)?.span ?? { start: 0, end: 0 });
    return { days, span };
  }

  private track<T>(current: Tracked<T> | null, values: readonly T[], span: Span): Tracked<T> {
    if (current === null) return { values: new Set(values), span };
    for (const value of values) current.values.add(value);
    return current;
  }

  private build(): CronFields {
    this.applyHolidayDates(false);
    const [minute, hour] = this.timeFields();
    return { minute, hour, ...this.dayFields() };
  }

  private timeFields(): readonly [CronField, CronField] {
    const minutes = this.intervals.get('minute');
    const hours = this.intervals.get('hour');
    const window = this.window;
    const [firstMark] = this.minuteMarks;
    const marks = this.minuteMarks.map((mark) => mark.minute);

    if (minutes !== undefined || hours !== undefined) {
      const [firstTime] = this.times;
      if (firstTime !== undefined) {
        this.fail('CONFLICT', `Specific times cannot be combined with a minute or hour interval`, firstTime.span);
      }
      if (minutes !== undefined) {
        if (firstMark !== undefined) {
          this.fail('CONFLICT', `Minutes of the hour cannot be combined with a minute interval`, firstMark.span);
        }
        const hour = hours !== undefined ? this.steppedHours(hours.step, window) : window !== null ? this.minuteWindowHours(window) : ANY;
        return [stepField('minute', minutes.step), hour];
      }
      const minute = marks.length > 0 ? marks : [window?.from?.minute ?? 0];
      return [valuesField(minute), this.steppedHours(hours?.step ?? 1, window)];
    }

    if (window !== null) {
      this.fail('INCOMPLETE', `A time range needs an interval, e.g. "every 15 minutes from 9 to 18"`, window.span);
    }
    if (firstMark !== undefined) {
      const [firstTime] = this.times;
      if (firstTime !== undefined) this.fail('CONFLICT', `Minutes of the hour cannot be combined with specific times`, firstMark.span);
      return [valuesField(marks), ANY];
    }
    return this.clockFields();
  }

  private minuteWindowHours(window: TimeWindow): CronField {
    const from = window.from;
    if (from !== null && from.minute !== 0) {
      this.fail('UNSUPPORTED', `A range for minute intervals must start on the hour`, from.span);
    }
    const last = window.to.minute === 0 ? window.to.hour - 1 : window.to.hour;
    return this.hourSpan(from?.hour ?? 0, (last + 24) % 24, 1);
  }

  private steppedHours(step: number, window: TimeWindow | null): CronField {
    const aligned = (hour: number): number => (this.hourParity === null || hour % 2 === (this.hourParity === 'odd' ? 1 : 0) ? hour : hour + 1);
    if (window === null) return this.hourParity === 'odd' ? stepField('hour', step, 1, 23) : stepField('hour', step);
    const from = window.from ?? { hour: 0, minute: 0, span: window.span };
    const last = window.to.minute >= from.minute ? window.to.hour : window.to.hour - 1;
    return this.hourSpan(aligned(from.hour) % 24, (last + 24) % 24, step);
  }

  private hourSpan(from: number, to: number, step: number): CronField {
    if (from <= to) return stepField('hour', step, from, to);
    const length = to - from + 24;
    const hours: number[] = [];
    for (let offset = 0; offset <= length; offset += step) hours.push((from + offset) % 24);
    return valuesField(hours);
  }

  private clockFields(): readonly [CronField, CronField] {
    const clocks = this.times.length > 0 ? this.times : [{ hour: 0, minute: 0, span: { start: 0, end: 0 } }];
    const minutes = new Set(clocks.map((clock) => clock.minute));
    const hours = new Set(clocks.map((clock) => clock.hour));
    const distinct = new Set(clocks.map((clock) => clock.hour * 60 + clock.minute));
    if (minutes.size * hours.size !== distinct.size) {
      const span = join(clocks[0]?.span ?? { start: 0, end: 0 }, clocks.at(-1)?.span ?? { start: 0, end: 0 });
      this.fail('UNSUPPORTED', `These times cannot be expressed by a single cron expression; split them into separate schedules`, span);
    }
    return [valuesField(minutes), valuesField(hours)];
  }

  private dayFields(): Pick<CronFields, 'dayOfMonth' | 'month' | 'dayOfWeek'> {
    const day = this.intervals.get('day');
    const week = this.intervals.get('week');
    const monthly = this.intervals.get('month');
    const yearly = this.intervals.get('year');
    const { weekdays, monthDays, months } = this;

    let dayOfMonth: CronField = monthDays === null || monthDays.values.size === 31 ? ANY : valuesField(monthDays.values);
    if (this.dayParity !== null) {
      if (monthDays !== null || weekdays !== null) this.fail('CONFLICT', `Even or odd days cannot be combined with other day rules`, this.dayParity.span);
      dayOfMonth = this.dayParity.odd ? stepField('dayOfMonth', 2) : stepField('dayOfMonth', 2, 2, 30);
    }
    let dayOfWeek: CronField = weekdays === null || weekdays.values.size === 7 ? ANY : valuesField(weekdays.values);
    let month: CronField = months === null || months.values.size === 12 ? ANY : valuesField(months.values);

    if (weekdays !== null && monthDays !== null && this.target === 'cron') {
      this.fail('CONFLICT', `Cron treats day-of-month and weekday as "either", so they cannot be combined`, join(weekdays.span, monthDays.span));
    }

    if (day !== undefined && day.step > 1) {
      const clash = weekdays ?? monthDays;
      if (clash !== null) this.fail('CONFLICT', `A day interval cannot be combined with specific days`, join(day.span, clash.span));
      dayOfMonth = stepField('dayOfMonth', day.step);
    }

    if (week !== undefined && weekdays === null) {
      if (monthDays !== null) this.fail('CONFLICT', `A weekly schedule cannot use days of the month`, join(week.span, monthDays.span));
      dayOfWeek = valuesField([this.options.weeklyOn ?? 0]);
    }

    if (monthly !== undefined) {
      if (monthly.step > 1) {
        if (months !== null) this.fail('CONFLICT', `A month interval cannot be combined with specific months`, join(monthly.span, months.span));
        month = stepField('month', monthly.step);
      }
      if (monthDays === null && weekdays === null && day === undefined) dayOfMonth = valuesField([1]);
    }

    if (yearly !== undefined) {
      if (months === null) month = valuesField([1]);
      if (monthDays === null && weekdays === null && day === undefined) dayOfMonth = valuesField([1]);
    }

    if (monthDays !== null && months !== null) {
      const longest = Math.max(...[...months.values].map((value) => DAYS_IN_MONTH[value - 1] ?? 31));
      const impossible = [...monthDays.values].filter((value) => value > longest);
      if (impossible.length === monthDays.values.size) {
        this.fail('OUT_OF_RANGE', `Day ${impossible.join(', ')} never occurs in the selected month(s)`, monthDays.span);
      }
    }

    return { dayOfMonth, month, dayOfWeek };
  }

  plan(allowDateList = true): Plan {
    const byDates = this.applyHolidayDates(allowDateList);
    const interval = (unit: Unit): Interval | undefined => this.intervals.get(unit);
    const minutes = interval('minute');
    const hours = interval('hour');
    const { weekdays, monthDays, months, window } = this;
    const nth = this.nthWeekdays;
    const [firstTime] = this.times;
    const [firstMark] = this.minuteMarks;
    const marks = this.minuteMarks.map((mark) => mark.minute);
    const list = (values: Iterable<number>): string => [...new Set(values)].sort((a, b) => a - b).join(',');
    const hoursOf = (field: CronField): number[] => [...expandField('hour', field)];
    let byHour: string | null = null;
    let byMinute: string | null = null;
    let freq: string;
    let step = 1;
    const coarse = (['day', 'week', 'month', 'year'] as const).find((unit) => interval(unit) !== undefined);
    const coarseStep = coarse === undefined ? 1 : (interval(coarse)?.step ?? 1);

    if ((minutes !== undefined || hours !== undefined) && firstTime !== undefined) {
      this.fail('CONFLICT', `Specific times cannot be combined with a minute or hour interval`, firstTime.span);
    }
    if (minutes !== undefined) {
      if (firstMark !== undefined) this.fail('CONFLICT', `Minutes of the hour cannot be combined with a minute interval`, firstMark.span);
      const aligned = 60 % minutes.step === 0;
      freq = minutes.step === 1 ? 'MINUTELY' : aligned ? 'HOURLY' : 'MINUTELY';
      if (aligned && minutes.step > 1) byMinute = list(expandField('minute', stepField('minute', minutes.step)));
      else step = minutes.step;
      if (hours !== undefined) byHour = list(hoursOf(this.steppedHours(hours.step, window)));
      else if (window !== null) byHour = list(hoursOf(this.minuteWindowHours(window)));
    } else if (hours !== undefined) {
      byMinute = list(marks.length > 0 ? marks : [window?.from?.minute ?? 0]);
      if (24 % hours.step === 0) {
        freq = hours.step === 1 ? 'HOURLY' : 'DAILY';
        byHour = list(hoursOf(this.steppedHours(hours.step, window)));
      } else {
        freq = 'HOURLY';
        step = hours.step;
        if (window !== null) byHour = list(hoursOf(this.steppedHours(1, window)));
      }
    } else {
      if (window !== null) this.fail('INCOMPLETE', `A time range needs an interval, e.g. "every 15 minutes from 9 to 18"`, window.span);
      if (firstMark !== undefined && firstTime !== undefined) {
        this.fail('CONFLICT', `Minutes of the hour cannot be combined with specific times`, firstMark.span);
      }
      if (firstMark !== undefined) {
        freq = 'HOURLY';
        byMinute = list(marks);
      } else {
        const [minute, hour] = this.clockFields();
        byMinute = list(expandField('minute', minute));
        byHour = list(expandField('hour', hour));
        if (coarse !== undefined) {
          freq = { day: 'DAILY', week: 'WEEKLY', month: 'MONTHLY', year: 'YEARLY' }[coarse];
          step = coarseStep;
        } else if (this.easterOffsets.length > 0 || byDates.length > 0) freq = 'YEARLY';
        else if (nth.length > 0 || this.setPositions.length > 0) freq = 'MONTHLY';
        else if (months !== null && (monthDays !== null || this.lastDay) && weekdays === null) freq = 'YEARLY';
        else if (monthDays !== null || this.lastDay) freq = 'MONTHLY';
        else if (weekdays !== null) freq = 'WEEKLY';
        else freq = 'DAILY';
      }
    }

    if (nth.length > 0 && (monthDays !== null || this.lastDay || this.holidayDates.length > 0)) {
      this.fail('CONFLICT', `An Nth weekday cannot be combined with days of the month`, monthDays?.span ?? null);
    }
    if (nth.length > 0 && weekdays !== null) {
      this.fail('CONFLICT', `Every-week days and Nth weekdays cannot be mixed in one rule; split them into two`, weekdays.span);
    }
    if (this.setPositions.length > 0 && (weekdays !== null || nth.length > 0 || monthDays !== null || this.lastDay)) {
      this.fail('CONFLICT', `An Nth working day cannot be combined with other day rules`, weekdays?.span ?? monthDays?.span ?? null);
    }
    if ((nth.length > 0 || this.setPositions.length > 0) && freq !== 'MONTHLY' && freq !== 'YEARLY') {
      this.fail('CONFLICT', `An Nth weekday needs a monthly or yearly schedule`, this.intervals.values().next().value?.span ?? null);
    }

    const byMonth = months === null || months.values.size === 12 ? [] : [...months.values].sort((a, b) => a - b);
    if (freq === 'MONTHLY' && coarse === 'month' && step > 1 && 12 % step === 0 && byMonth.length === 0) {
      for (let month = 1; month <= 12; month += step) byMonth.push(month);
      freq = 'YEARLY';
      step = 1;
    }
    if (this.dayParity !== null && (monthDays !== null || weekdays !== null || nth.length > 0)) {
      this.fail('CONFLICT', `Even or odd days cannot be combined with other day rules`, this.dayParity.span);
    }
    const byMonthDay = this.dayParity === null
      ? [...(monthDays?.values ?? [])].sort((a, b) => a - b)
      : Array.from({ length: 16 }, (_, index) => index * 2 + (this.dayParity?.odd === true ? 1 : 2)).filter((day) => day <= 31);
    if (this.lastDay) byMonthDay.push(-1);
    const byDay: { readonly nth: number | null; readonly day: Weekday }[] = [
      ...[...(weekdays?.values ?? [])].sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7)).map((day) => ({ nth: null, day })),
      ...nth.map(({ nth: index, day }) => ({ nth: index, day })),
    ];
    const finer = !['DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY'].includes(freq) || (coarse !== undefined && freq === 'DAILY' && coarse !== 'day');
    if (finer && coarse !== undefined && coarseStep > 1) {
      this.fail('UNSUPPORTED', `An interval of several ${coarse}s cannot be combined with minutes or hours in one RRULE`, interval(coarse)?.span ?? null);
    }
    const easter = this.easterOffsets.length > 0;
    const weekly = freq === 'WEEKLY' || coarse === 'week';
    const monthly = !easter && byDates.length === 0 && (freq === 'MONTHLY' || freq === 'YEARLY' || coarse === 'month' || coarse === 'year');
    if (weekly && byDay.length === 0 && byMonthDay.length === 0) byDay.push({ nth: null, day: this.options.weeklyOn ?? 0 });
    if (monthly && byMonthDay.length === 0 && byDay.length === 0 && this.setPositions.length === 0) byMonthDay.push(1);
    if (!easter && byDates.length === 0 && (freq === 'YEARLY' || coarse === 'year') && byMonth.length === 0 && byMonthDay.length > 0 && byDay.length === 0) byMonth.push(1);

    if (monthDays !== null && months !== null) {
      const longest = Math.max(...[...months.values].map((value) => DAYS_IN_MONTH[value - 1] ?? 31));
      if ([...monthDays.values].every((value) => value > longest) && !this.lastDay) {
        this.fail('OUT_OF_RANGE', `Day ${[...monthDays.values].join(', ')} never occurs in the selected month(s)`, monthDays.span);
      }
    }

    const numbers = (value: string | null): number[] | null => (value === null ? null : value.split(',').map(Number));
    const allHours = byHour === list(Array.from({ length: 24 }, (_, hour) => hour));
    return {
      freq: freq as Plan['freq'],
      interval: step,
      byMonth,
      byMonthDay,
      byDay,
      byHour: allHours ? null : numbers(byHour),
      byMinute: numbers(byMinute),
      byEaster: [...this.easterOffsets],
      byDates,
      bySetPos: [...this.setPositions],
      setPosGroup: this.setPosGroup,
      workdays: this.workdayFilter,
      easter: this.easterCalendar(),
    };
  }

  private rrule(): string {
    if (this.easterOffsets.length > 0 && this.holidayDates.length > 0) {
      this.fail('UNSUPPORTED', `Fixed holidays and Easter-based holidays cannot share one RRULE; split them or use occurrences`, this.easterSpan);
    }
    const plan = this.plan(false);
    if (plan.byEaster.length > 0) {
      if (plan.easter === 'orthodox') {
        this.fail('UNSUPPORTED', `RRULE BYEASTER (rrule.js, python-dateutil) only knows Western Easter; use occurrences() for Orthodox Easter`, this.easterSpan);
      }
      if (plan.byEaster.length > 1) this.fail('UNSUPPORTED', `An RRULE holds one Easter offset; split the dates into separate rules`, this.easterSpan);
    }
    if (plan.setPosGroup === 'workday') {
      this.fail('UNSUPPORTED', `Working days depend on public holidays, which RRULE cannot express; use occurrences with isWorkday`, null);
    }
    if (plan.bySetPos.length > 0 && ((plan.byHour?.length ?? 24) > 1 || (plan.byMinute?.length ?? 60) > 1)) {
      this.fail('UNSUPPORTED', `BYSETPOS counts every time of day, so an Nth weekday needs a single time`, null);
    }
    const names = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];
    const parts = [`FREQ=${plan.freq}`];
    if (plan.interval > 1) parts.push(`INTERVAL=${plan.interval}`);
    if (plan.byMonth.length > 0) parts.push(`BYMONTH=${plan.byMonth.join(',')}`);
    if (plan.byMonthDay.length > 0) parts.push(`BYMONTHDAY=${plan.byMonthDay.join(',')}`);
    if (plan.byDay.length > 0) parts.push(`BYDAY=${plan.byDay.map(({ nth, day }) => `${nth ?? ''}${names[day] ?? ''}`).join(',')}`);
    if (plan.bySetPos.length > 0) parts.push('BYDAY=MO,TU,WE,TH,FR', `BYSETPOS=${plan.bySetPos.join(',')}`);
    if (plan.byHour !== null) parts.push(`BYHOUR=${plan.byHour.join(',')}`);
    if (plan.byMinute !== null) parts.push(`BYMINUTE=${plan.byMinute.join(',')}`);
    if (plan.byEaster.length > 0) parts.push(`BYEASTER=${plan.byEaster.join(',')}`);
    return parts.join(';');
  }
}

/**
 * Parses a Russian or English schedule description into a cron expression.
 *
 * @example
 * ```ts
 * parse('по будням в 9:30').cron; // '30 9 * * 1-5'
 * ```
 * @throws {CronsenseError} when the text cannot be expressed exactly in cron.
 */
export const parse = (input: string, options: ParseOptions = {}): Schedule =>
  new Parser(input, tokenize(input), options).run();

/**
 * Converts a Russian or English schedule description into an iCalendar RRULE (RFC 5545), without the `RRULE:` prefix.
 * Unlike cron it supports every N weeks, the last day of the month and the Nth weekday.
 *
 * @example
 * ```ts
 * toRRule('каждые 2 недели по понедельникам в 10'); // 'FREQ=WEEKLY;INTERVAL=2;BYDAY=MO;BYHOUR=10;BYMINUTE=0'
 * ```
 * @throws {CronsenseError} when the text cannot be expressed exactly.
 */
export const toRRule = (input: string, options: ParseOptions = {}): string =>
  new Parser(input, tokenize(input), options, 'rrule').runRRule();

export const toPlan = (input: string, options: ParseOptions = {}): Plan =>
  new Parser(input, tokenize(input), options, 'rrule').runPlan();
