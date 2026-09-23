import { describe as suite, expect, it } from 'vitest';
import { describe, parse, parseCron, type CronFields, type Locale } from '../src/index.js';
import { expandField, isAny } from '../src/field.js';

const cases: ReadonlyArray<readonly [string, string, string]> = [
  ['* * * * *', 'каждую минуту', 'every minute'],
  ['*/15 * * * *', 'каждые 15 минут', 'every 15 minutes'],
  ['*/2 * * * *', 'каждые 2 минуты', 'every 2 minutes'],
  ['0 * * * *', 'каждый час', 'every hour'],
  ['15 * * * *', 'каждый час в 15 минут', 'every hour at 15 minutes past'],
  ['0 */2 * * *', 'каждые 2 часа', 'every 2 hours'],
  ['0 */5 * * *', 'каждые 5 часов', 'every 5 hours'],
  ['30 9 * * *', 'каждый день в 9:30', 'every day at 9:30am'],
  ['0 0 * * *', 'каждый день в полночь', 'every day at midnight'],
  ['0 12 * * *', 'каждый день в полдень', 'every day at noon'],
  ['0 9,18 * * *', 'каждый день в 9:00 и 18:00', 'every day at 9am and 6pm'],
  ['30 9 * * 1-5', 'по будням в 9:30', 'on weekdays at 9:30am'],
  ['0 10 * * 0,6', 'по выходным в 10:00', 'on weekends at 10am'],
  ['0 9 * * 1,3,5', 'по понедельникам, средам и пятницам в 9:00', 'on mondays, wednesdays and fridays at 9am'],
  ['0 9 * * 2-4', 'со вторника по четверг в 9:00', 'from tuesday through thursday at 9am'],
  ['0 23 * * 0,1,5,6', 'с пятницы по понедельник в 23:00', 'from friday through monday at 11pm'],
  ['*/15 9-17 * * 1-5', 'каждые 15 минут с 9 до 18 по будням', 'every 15 minutes from 9am to 6pm on weekdays'],
  ['*/10 22-23,0-5 * * *', 'каждые 10 минут с 22 до 6', 'every 10 minutes from 10pm to 6am'],
  ['0 9-18 * * *', 'каждый час с 9 до 18', 'every hour from 9am to 6pm'],
  ['0 8-20/2 * * *', 'каждые 2 часа с 8 до 20', 'every 2 hours from 8am to 8pm'],
  ['0 12 1,15 * *', '1 и 15 числа в полдень', 'on the 1st and 15th at noon'],
  ['0 0 1-10,20 * *', '1-10 и 20 числа в полночь', 'on the 1st-10th and 20th at midnight'],
  ['0 10 15 1 *', '15 января в 10:00', 'on january 15 at 10am'],
  ['0 0 */2 * *', 'каждые 2 дня в полночь', 'every 2 days at midnight'],
  ['0 0 1 */3 *', '1 числа каждые 3 месяца в полночь', 'on the 1st every 3 months at midnight'],
  ['0 7 * 1,2,11,12 *', 'с ноября по февраль в 7:00', 'from november through february at 7am'],
  ['0 8 * 6-8 0,6', 'по выходным с июня по август в 8:00', 'on weekends from june through august at 8am'],
  ['0 0 1 * 1', '1 числа или по понедельникам в полночь', 'on the 1st or on mondays at midnight'],
  ['@weekly', 'по воскресеньям в полночь', 'on sundays at midnight'],
];

suite('describe', () => {
  it.each(cases)('%s', (cron, ru, en) => {
    expect(describe(cron, { locale: 'ru' })).toBe(ru);
    expect(describe(cron, { locale: 'en' })).toBe(en);
    expect(describe(cron)).toBe(en);
  });

  it('accepts a parsed schedule', () => {
    expect(describe(parse('по будням в 9:30'), { locale: 'ru' })).toBe('по будням в 9:30');
  });
});

const random = (seed: number): (() => number) => {
  let state = seed;
  return () => {
    state = (state * 1_103_515_245 + 12_345) % 2_147_483_648;
    return state / 2_147_483_648;
  };
};

const field = (next: () => number, min: number, max: number): string => {
  const pick = (): number => min + Math.floor(next() * (max - min + 1));
  const kind = Math.floor(next() * 7);
  switch (kind) {
    case 0:
      return '*';
    case 1:
      return `*/${2 + Math.floor(next() * Math.min(12, max - min))}`;
    case 2: {
      const a = pick();
      const b = pick();
      return `${Math.min(a, b)}-${Math.max(a, b)}`;
    }
    case 3: {
      const a = pick();
      return `${a}-${max}/${2 + Math.floor(next() * 5)}`;
    }
    case 4:
      return Array.from({ length: 1 + Math.floor(next() * 4) }, pick).join(',');
    default:
      return String(pick());
  }
};

const dayMatcher = (fields: CronFields): ((day: number, weekday: number) => boolean) => {
  const days = new Set(expandField('dayOfMonth', fields.dayOfMonth));
  const weekdays = new Set(expandField('dayOfWeek', fields.dayOfWeek));
  const domStar = isAny(fields.dayOfMonth);
  const dowStar = isAny(fields.dayOfWeek);
  return (day, weekday) => {
    if (domStar && dowStar) return true;
    if (domStar) return weekdays.has(weekday);
    if (dowStar) return days.has(day);
    return days.has(day) || weekdays.has(weekday);
  };
};

const signature = (fields: CronFields): string => {
  const match = dayMatcher(fields);
  const days: string[] = [];
  for (let day = 1; day <= 31; day += 1) {
    for (let weekday = 0; weekday < 7; weekday += 1) days.push(match(day, weekday) ? '1' : '0');
  }
  return [
    expandField('minute', fields.minute).join(),
    expandField('hour', fields.hour).join(),
    expandField('month', fields.month).join(),
    days.join(''),
  ].join('|');
};

suite('describe round-trip', () => {
  const next = random(20_260_923);
  const expressions = Array.from({ length: 3000 }, () =>
    [
      field(next, 0, 59),
      field(next, 0, 23),
      next() < 0.5 ? '*' : field(next, 1, 31),
      field(next, 1, 12),
      next() < 0.5 ? '*' : field(next, 0, 6),
    ].join(' '),
  );
  const locales: readonly Locale[] = ['ru', 'en'];

  it.each(locales)('%s descriptions parse back to an equivalent schedule', (locale) => {
    let checked = 0;
    for (const expression of expressions) {
      const schedule = parseCron(expression);
      const text = describe(schedule, { locale });
      const bothDays = !isAny(schedule.fields.dayOfMonth) && !isAny(schedule.fields.dayOfWeek);
      const days = expandField('dayOfMonth', schedule.fields.dayOfMonth).length;
      const weekdays = expandField('dayOfWeek', schedule.fields.dayOfWeek).length;
      if (bothDays && days < 31 && weekdays < 7) {
        expect(() => parse(text), `${expression} → ${text}`).toThrow();
        continue;
      }
      let parsed;
      try {
        parsed = parse(text);
      } catch (error: unknown) {
        const impossible = error instanceof Error && error.message.includes('never occurs');
        if (impossible) continue;
        throw new Error(`${expression} → "${text}": ${String(error)}`);
      }
      expect(signature(parsed.fields), `${expression} → ${text}`).toBe(signature(schedule.fields));
      checked += 1;
    }
    expect(checked).toBeGreaterThan(1500);
  });
});
