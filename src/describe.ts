import { parseCron } from './cron.js';
import { expandField, isAny } from './field.js';
import type { Schedule } from './types.js';

/** Language of generated descriptions. */
export type Locale = 'ru' | 'en';

/** Options for {@link describe}. */
export interface DescribeOptions {
  /** Output language. Defaults to `'en'`. */
  readonly locale?: Locale;
}

interface Run {
  readonly from: number;
  readonly to: number;
  readonly length: number;
}

interface Language {
  readonly everyMinute: (step: number) => string;
  readonly everyHour: (step: number) => string;
  readonly everyDay: (step: number) => string;
  readonly everyMonth: (step: number) => string;
  readonly daily: string;
  readonly workweek: string;
  readonly weekend: string;
  readonly window: (from: number, to: number) => string;
  readonly marks: (minutes: readonly number[]) => string;
  readonly times: (clocks: readonly (readonly [number, number])[]) => string;
  readonly monthDays: (runs: readonly Run[]) => string;
  readonly dayOfMonth: (day: number, month: number) => string;
  readonly weekdays: (runs: readonly Run[]) => string;
  readonly months: (runs: readonly Run[]) => string;
  readonly either: (a: string, b: string) => string;
}

const at = <T>(values: readonly T[], index: number): T => {
  const value = values[index];
  if (value === undefined) throw new RangeError(`No value at index ${index}`);
  return value;
};

const listWith =
  (conjunction: string) =>
  (items: readonly string[]): string =>
    items.length <= 1 ? items.join('') : `${items.slice(0, -1).join(', ')} ${conjunction} ${at(items, items.length - 1)}`;

const pad = (value: number): string => String(value).padStart(2, '0');

const plural = (count: number, one: string, few: string, many: string): string => {
  const last = count % 10;
  const lastTwo = count % 100;
  if (last === 1 && lastTwo !== 11) return one;
  if (last >= 2 && last <= 4 && (lastTwo < 12 || lastTwo > 14)) return few;
  return many;
};

const WEEKDAY_SET = [1, 2, 3, 4, 5].join();
const WEEKEND_SET = [0, 6].join();

type Part = { readonly kind: 'single'; readonly value: number } | { readonly kind: 'range'; readonly run: Run };

const parts = (runs: readonly Run[], size: number): Part[] =>
  runs.flatMap((run): Part[] => {
    if (run.length >= 3) return [{ kind: 'range', run }];
    return Array.from({ length: run.length }, (_, offset) => ({ kind: 'single', value: (run.from + offset) % size }));
  });

const renderParts = (
  items: readonly Part[],
  single: (value: number) => string,
  singlePrefix: string,
  range: (run: Run) => string,
  list: (items: readonly string[]) => string,
): string =>
  list(
    items.map((item, index) => {
      if (item.kind === 'range') return range(item.run);
      const previous = items[index - 1];
      const prefix = previous === undefined || previous.kind === 'range' ? singlePrefix : '';
      return `${prefix}${single(item.value)}`;
    }),
  );

const RU_WEEKDAY_DATIVE = ['воскресеньям', 'понедельникам', 'вторникам', 'средам', 'четвергам', 'пятницам', 'субботам'];
const RU_WEEKDAY_GENITIVE = ['воскресенья', 'понедельника', 'вторника', 'среды', 'четверга', 'пятницы', 'субботы'];
const RU_WEEKDAY_ACCUSATIVE = ['воскресенье', 'понедельник', 'вторник', 'среду', 'четверг', 'пятницу', 'субботу'];
const RU_MONTH_NOMINATIVE = ['январь', 'февраль', 'март', 'апрель', 'май', 'июнь', 'июль', 'август', 'сентябрь', 'октябрь', 'ноябрь', 'декабрь'];
const RU_MONTH_GENITIVE = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
const RU_MONTH_PREPOSITIONAL = ['январе', 'феврале', 'марте', 'апреле', 'мае', 'июне', 'июле', 'августе', 'сентябре', 'октябре', 'ноябре', 'декабре'];

const ruList = listWith('и');
const ruHour = (hour: number): string => (hour === 0 ? 'полуночи' : String(hour));
const ruEvery = (step: number, one: string, few: string, many: string, single: string): string =>
  step === 1 ? single : `${plural(step, 'каждый', 'каждые', 'каждые')} ${step} ${plural(step, one, few, many)}`;

const RU: Language = {
  everyMinute: (step) =>
    step === 1 ? 'каждую минуту' : `${plural(step, 'каждую', 'каждые', 'каждые')} ${step} ${plural(step, 'минуту', 'минуты', 'минут')}`,
  everyHour: (step) => ruEvery(step, 'час', 'часа', 'часов', 'каждый час'),
  everyDay: (step) => ruEvery(step, 'день', 'дня', 'дней', 'каждый день'),
  everyMonth: (step) => ruEvery(step, 'месяц', 'месяца', 'месяцев', 'каждый месяц'),
  daily: 'каждый день',
  workweek: 'по будням',
  weekend: 'по выходным',
  window: (from, to) => `с ${ruHour(from)} до ${ruHour(to)}`,
  marks: (minutes) =>
    `в ${ruList(minutes.map(String))} ${plural(at(minutes, minutes.length - 1), 'минуту', 'минуты', 'минут')}`,
  times: (clocks) => {
    const [only] = clocks;
    if (clocks.length === 1 && only !== undefined && only[1] === 0 && (only[0] === 0 || only[0] === 12)) {
      return only[0] === 0 ? 'в полночь' : 'в полдень';
    }
    return `в ${ruList(clocks.map(([hour, minute]) => `${hour}:${pad(minute)}`))}`;
  },
  monthDays: (runs) =>
    `${renderParts(parts(runs, 32), String, '', (run) => `${run.from}-${run.to}`, ruList)} числа`,
  dayOfMonth: (day, month) => `${day} ${at(RU_MONTH_GENITIVE, month - 1)}`,
  weekdays: (runs) =>
    renderParts(
      parts(runs, 7),
      (day) => at(RU_WEEKDAY_DATIVE, day),
      'по ',
      (run) => `${run.from === 2 || run.from === 3 ? 'со' : 'с'} ${at(RU_WEEKDAY_GENITIVE, run.from)} по ${at(RU_WEEKDAY_ACCUSATIVE, run.to)}`,
      ruList,
    ),
  months: (runs) =>
    renderParts(
      parts(runs.map((run) => ({ ...run, from: run.from - 1, to: run.to - 1 })), 12),
      (month) => at(RU_MONTH_PREPOSITIONAL, month),
      'в ',
      (run) => `с ${at(RU_MONTH_GENITIVE, run.from)} по ${at(RU_MONTH_NOMINATIVE, run.to)}`,
      ruList,
    ),
  either: (a, b) => `${a} или ${b}`,
};

const EN_WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
const EN_MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];

const enList = listWith('and');
const enOrdinal = (value: number): string => {
  const lastTwo = value % 100;
  if (lastTwo >= 11 && lastTwo <= 13) return `${value}th`;
  const suffix = ['th', 'st', 'nd', 'rd'][value % 10] ?? 'th';
  return `${value}${suffix}`;
};
const enClock = (hour: number, minute: number): string => {
  if (minute === 0 && hour === 0) return 'midnight';
  if (minute === 0 && hour === 12) return 'noon';
  const base = hour % 12 === 0 ? 12 : hour % 12;
  const suffix = hour < 12 ? 'am' : 'pm';
  return minute === 0 ? `${base}${suffix}` : `${base}:${pad(minute)}${suffix}`;
};
const enEvery = (step: number, unit: string): string => (step === 1 ? `every ${unit}` : `every ${step} ${unit}s`);

const EN: Language = {
  everyMinute: (step) => enEvery(step, 'minute'),
  everyHour: (step) => enEvery(step, 'hour'),
  everyDay: (step) => enEvery(step, 'day'),
  everyMonth: (step) => enEvery(step, 'month'),
  daily: 'every day',
  workweek: 'on weekdays',
  weekend: 'on weekends',
  window: (from, to) => `from ${enClock(from, 0)} to ${enClock(to, 0)}`,
  marks: (minutes) =>
    `at ${enList(minutes.map(String))} ${minutes.length === 1 && minutes[0] === 1 ? 'minute' : 'minutes'} past`,
  times: (clocks) => `at ${enList(clocks.map(([hour, minute]) => enClock(hour, minute)))}`,
  monthDays: (runs) =>
    `on the ${renderParts(parts(runs, 32), enOrdinal, '', (run) => `${enOrdinal(run.from)}-${enOrdinal(run.to)}`, enList)}`,
  dayOfMonth: (day, month) => `on ${at(EN_MONTHS, month - 1)} ${day}`,
  weekdays: (runs) =>
    renderParts(
      parts(runs, 7),
      (day) => `${at(EN_WEEKDAYS, day)}s`,
      'on ',
      (run) => `from ${at(EN_WEEKDAYS, run.from)} through ${at(EN_WEEKDAYS, run.to)}`,
      enList,
    ),
  months: (runs) =>
    renderParts(
      parts(runs.map((run) => ({ ...run, from: run.from - 1, to: run.to - 1 })), 12),
      (month) => at(EN_MONTHS, month),
      'in ',
      (run) => `from ${at(EN_MONTHS, run.from)} through ${at(EN_MONTHS, run.to)}`,
      enList,
    ),
  either: (a, b) => `${a} or ${b}`,
};

const LANGUAGES: { readonly [K in Locale]: Language } = { ru: RU, en: EN };

const linearRuns = (values: readonly number[]): Run[] => {
  const runs: Run[] = [];
  for (const value of values) {
    const last = runs.at(-1);
    if (last !== undefined && last.to === value - 1) runs[runs.length - 1] = { from: last.from, to: value, length: last.length + 1 };
    else runs.push({ from: value, to: value, length: 1 });
  }
  return runs;
};

const circularRuns = (values: readonly number[], min: number, size: number, weekStart: number): Run[] => {
  const present = new Set(values);
  const starts = values.filter((value) => !present.has(((value - min - 1 + size) % size) + min));
  const runs = starts.map((from): Run => {
    let length = 1;
    while (present.has(((from - min + length) % size) + min)) length += 1;
    return { from, to: ((from - min + length - 1) % size) + min, length };
  });
  return runs.sort((a, b) => ((a.from - weekStart + size) % size) - ((b.from - weekStart + size) % size));
};

const stepPattern = (values: readonly number[], min: number, max: number): number | null => {
  if (values.length === max - min + 1) return 1;
  const [first, second] = values;
  if (first !== min || second === undefined) return null;
  const step = second - first;
  const expected = Math.floor((max - min) / step) + 1;
  if (values.length !== expected) return null;
  return values.every((value, index) => value === min + index * step) ? step : null;
};

const offsetStep = (values: readonly number[]): { readonly from: number; readonly to: number; readonly step: number } | null => {
  const [first, second] = values;
  if (first === undefined || second === undefined) return null;
  const step = second - first;
  if (step < 2 || !values.every((value, index) => value === first + index * step)) return null;
  return { from: first, to: at(values, values.length - 1), step };
};

const describeTime = (minutes: readonly number[], hours: readonly number[], lang: Language): { lead: string; tail: string } => {
  const grid = minutes.length * hours.length;
  const clocks = (): (readonly [number, number])[] => hours.flatMap((hour) => minutes.map((minute) => [hour, minute] as const));
  const hourRun = hours.length < 24 ? circularRuns(hours, 0, 24, 0) : [];
  const [singleRun] = hourRun.length === 1 ? hourRun : [];

  if (grid <= 4) return { lead: '', tail: lang.times(clocks()) };

  const minuteStep = stepPattern(minutes, 0, 59);
  if (minuteStep !== null) {
    const every = lang.everyMinute(minuteStep);
    if (hours.length === 24) return { lead: every, tail: '' };
    if (singleRun !== undefined) return { lead: `${every} ${lang.window(singleRun.from, (singleRun.to + 1) % 24)}`, tail: '' };
    return { lead: '', tail: lang.times(clocks()) };
  }

  const marks = minutes.length === 1 && minutes[0] === 0 ? '' : ` ${lang.marks(minutes)}`;
  const hourStep = stepPattern(hours, 0, 23);
  if (hourStep !== null) return { lead: `${lang.everyHour(hourStep)}${marks}`, tail: '' };
  if (singleRun !== undefined && singleRun.length >= 2) {
    return { lead: `${lang.everyHour(1)} ${lang.window(singleRun.from, singleRun.to)}${marks}`, tail: '' };
  }
  const stepped = offsetStep(hours);
  if (stepped !== null) return { lead: `${lang.everyHour(stepped.step)} ${lang.window(stepped.from, stepped.to)}${marks}`, tail: '' };
  return { lead: '', tail: lang.times(clocks()) };
};

/**
 * Describes a cron expression in natural Russian or English.
 * The text is accepted by {@link parse} and yields an equivalent schedule,
 * except when both day-of-month and weekday are restricted, which cron joins with OR.
 *
 * @example
 * ```ts
 * describe('30 9 * * 1-5', { locale: 'ru' }); // 'по будням в 9:30'
 * describe('0 12 1,15 * *');                  // 'on the 1st and 15th at noon'
 * ```
 */
export const describe = (input: string | Schedule, options: DescribeOptions = {}): string => {
  const { fields } = typeof input === 'string' ? parseCron(input) : input;
  const lang = LANGUAGES[options.locale ?? 'en'];

  const minutes = expandField('minute', fields.minute);
  const hours = expandField('hour', fields.hour);
  const monthDays = expandField('dayOfMonth', fields.dayOfMonth);
  const weekdays = expandField('dayOfWeek', fields.dayOfWeek);
  const months = expandField('month', fields.month);

  const domStar = isAny(fields.dayOfMonth);
  const dowStar = isAny(fields.dayOfWeek);
  const everyDay =
    (domStar && dowStar) ||
    (!domStar && monthDays.length === 31) ||
    (!dowStar && weekdays.length === 7);
  const useDom = !everyDay && !domStar;
  const useDow = !everyDay && !dowStar;

  const dayStep = useDom ? stepPattern(monthDays, 1, 31) : null;
  const allMonths = months.length === 12;
  const [onlyDay] = monthDays;
  const [onlyMonth] = months;
  const pinned = useDom && !useDow && dayStep === null && monthDays.length === 1 && months.length === 1;

  const domText = !useDom
    ? ''
    : pinned && onlyDay !== undefined && onlyMonth !== undefined
      ? lang.dayOfMonth(onlyDay, onlyMonth)
      : dayStep !== null && dayStep > 1
        ? lang.everyDay(dayStep)
        : lang.monthDays(linearRuns(monthDays));

  const dowText = !useDow
    ? ''
    : weekdays.join() === WEEKDAY_SET
      ? lang.workweek
      : weekdays.join() === WEEKEND_SET
        ? lang.weekend
        : lang.weekdays(circularRuns(weekdays, 0, 7, 1));

  const monthStep = stepPattern(months, 1, 12);
  const monthText =
    allMonths || pinned
      ? ''
      : monthStep !== null && monthStep > 1 && (useDom || useDow)
        ? lang.everyMonth(monthStep)
        : lang.months(circularRuns(months, 1, 12, 1));

  const { lead, tail } = describeTime(minutes, hours, lang);
  const dayText = useDom && useDow ? lang.either(domText, dowText) : [domText, dowText].filter(Boolean).join(' ');
  const restricted = dayText !== '' || monthText !== '';
  const opening = lead !== '' ? lead : restricted ? '' : lang.daily;

  return [opening, dayText, monthText, tail].filter((part) => part !== '').join(' ');
};
