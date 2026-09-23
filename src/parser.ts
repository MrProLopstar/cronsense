import { CronsenseError, type ErrorCode } from './errors.js';
import { ANY, DAYS_IN_MONTH, formatCron, stepField, valuesField } from './field.js';
import { tokenize, type Token, type TokenOf } from './lexer.js';
import type { CronField, CronFields, Meridiem, ParseOptions, Schedule, Span, Unit, Weekday } from './types.js';

interface Interval {
  readonly unit: Unit;
  readonly step: number;
  readonly span: Span;
}

interface Clock {
  readonly hour: number;
  readonly minute: number;
  readonly span: Span;
}

interface TimeWindow {
  readonly from: Clock | null;
  readonly to: Clock;
  readonly span: Span;
}

type Item =
  | { readonly k: 'num'; readonly value: number; readonly ordinal: boolean; readonly span: Span }
  | { readonly k: 'clock'; readonly clock: Clock };

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

const VALUE_TOKENS: ReadonlySet<Token['t']> = new Set(['num', 'time', 'clock']);

const join = (a: Span, b: Span): Span => ({ start: Math.min(a.start, b.start), end: Math.max(a.end, b.end) });

const itemSpan = (item: Item): Span => (item.k === 'num' ? item.span : item.clock.span);

const weekdayOf = (value: number): Weekday => (((value % 7) + 7) % 7) as Weekday;

class Parser {
  private index = 0;
  private atContext = false;
  private readonly intervals = new Map<Unit, Interval>();
  private readonly times: Clock[] = [];
  private window: TimeWindow | null = null;
  private weekdays: Tracked<Weekday> | null = null;
  private monthDays: Tracked<number> | null = null;
  private months: Tracked<number> | null = null;

  constructor(
    private readonly input: string,
    private readonly tokens: readonly Token[],
    private readonly options: ParseOptions,
  ) {}

  run(): Schedule {
    if (this.tokens.length === 0) this.fail('EMPTY_INPUT', 'Schedule description is empty', null);
    while (this.peek() !== undefined) this.clause();
    const fields = this.build();
    return { cron: formatCron(fields), fields };
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
      if (token?.t === 'at' || (allowWeakTo && token?.t === 'to' && token.weak)) offset += 1;
      else return offset;
    }
  }

  private clause(): void {
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
        this.index -= 1;
        this.valueList(at);
        return;
      case 'unit':
      case 'meridiem':
      case 'domMarker':
      case 'dash':
        this.unexpected(token);
    }
  }

  private every(initialStep: number, start: Span): void {
    while (this.take('at') !== null);
    const other = this.take('other');
    const step = other === null ? initialStep : initialStep * 2;
    const token = this.peek();
    if (token === undefined) this.fail('INCOMPLETE', `"${this.text(start)}" needs a unit, e.g. "every 5 minutes"`, start);

    switch (token.t) {
      case 'unit':
        this.advance();
        this.addInterval(token.unit, step, join(start, token.span));
        return;
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
        if (step !== 1) {
          this.fail('UNSUPPORTED', `"Every other" is only supported with minutes, hours, days and months`, join(start, token.span));
        }
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
    const max = MAX_STEP[unit];
    if (step > max) {
      if (max === 1) this.fail('UNSUPPORTED', `Cron cannot repeat every ${step} ${unit}s`, span);
      const hint = unit === 'minute' && step % 60 === 0 ? `; use "every ${step / 60} hours"` : '';
      this.fail('OUT_OF_RANGE', `Every ${step} ${unit}s exceeds the maximum of ${max}${hint}`, span);
    }
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

  private makeClock(hour: number, minute: number, span: Span, meridiem: Meridiem | null): Clock {
    if (minute < 0 || minute > 59) this.fail('OUT_OF_RANGE', `Minute ${minute} is out of range 0-59`, span);
    if (meridiem === null) {
      if (hour > 23) this.fail('OUT_OF_RANGE', `Hour ${hour} is out of range 0-23`, span);
      return { hour, minute, span };
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

  private item(): Item {
    const token = this.advance();
    switch (token.t) {
      case 'clock':
        return { k: 'clock', clock: { hour: token.hour, minute: 0, span: token.span } };
      case 'time': {
        const suffix = this.meridiemSuffix();
        const span = suffix === null ? token.span : join(token.span, suffix.span);
        return { k: 'clock', clock: this.makeClock(token.hour, token.minute, span, suffix?.meridiem ?? null) };
      }
      case 'num': {
        if (token.ordinal) return { k: 'num', value: token.value, ordinal: true, span: token.span };
        let span = token.span;
        let minute = 0;
        let explicit = false;
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
    const next = this.peek();
    const marked =
      next?.t === 'domMarker' || next?.t === 'month' || items.some((item) => item.k === 'num' && item.ordinal);

    if (marked) {
      this.take('domMarker');
      this.addMonthDays(entries);
      this.takeUnit('day');
      this.takeUnit('month');
      const month = this.take('month');
      if (month !== null) this.monthPhrase(month, false);
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
      this.times.push(this.toClock(entry.item));
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

  private weekdayList(first: TokenOf<'dow'>): void {
    const { values, span } = this.collectNames(first, 7, 0);
    this.weekdays = this.track(this.weekdays, values.map(weekdayOf), span);
    this.takeUnit('day');
  }

  private monthPhrase(first: TokenOf<'month'>, allowDays: boolean): void {
    const { values, span } = this.collectNames(first, 12, 1);
    this.months = this.track(this.months, values, span);
    if (allowDays && this.kindAt(0) === 'num') {
      const entries = this.entries();
      this.take('domMarker');
      this.addMonthDays(entries);
    }
  }

  private addMonthDays(entries: readonly Entry[]): void {
    const days: number[] = [];
    const dayOf = (item: Item): number => {
      if (item.k === 'clock') this.fail('AMBIGUOUS', `"${this.text(item.clock.span)}" looks like a time, not a day`, item.clock.span);
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
    this.monthDays = this.track(this.monthDays, days, span);
  }

  private track<T>(current: Tracked<T> | null, values: readonly T[], span: Span): Tracked<T> {
    if (current === null) return { values: new Set(values), span };
    for (const value of values) current.values.add(value);
    return current;
  }

  private build(): CronFields {
    const [minute, hour] = this.timeFields();
    return { minute, hour, ...this.dayFields() };
  }

  private timeFields(): readonly [CronField, CronField] {
    const minutes = this.intervals.get('minute');
    const hours = this.intervals.get('hour');
    const window = this.window;

    if (minutes !== undefined || hours !== undefined) {
      const [firstTime] = this.times;
      if (firstTime !== undefined) {
        this.fail('CONFLICT', `Specific times cannot be combined with a minute or hour interval`, firstTime.span);
      }
      if (minutes !== undefined) {
        const hour = hours !== undefined ? this.steppedHours(hours.step, window) : window !== null ? this.minuteWindowHours(window) : ANY;
        return [stepField('minute', minutes.step), hour];
      }
      return [valuesField([window?.from?.minute ?? 0]), this.steppedHours(hours?.step ?? 1, window)];
    }

    if (window !== null) {
      this.fail('INCOMPLETE', `A time range needs an interval, e.g. "every 15 minutes from 9 to 18"`, window.span);
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
    if (window === null) return stepField('hour', step);
    const from = window.from ?? { hour: 0, minute: 0, span: window.span };
    const last = window.to.minute >= from.minute ? window.to.hour : window.to.hour - 1;
    return this.hourSpan(from.hour, (last + 24) % 24, step);
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

    let dayOfMonth: CronField = monthDays === null ? ANY : valuesField(monthDays.values);
    let dayOfWeek: CronField = weekdays === null ? ANY : valuesField(weekdays.values);
    let month: CronField = months === null ? ANY : valuesField(months.values);

    if (weekdays !== null && monthDays !== null) {
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
