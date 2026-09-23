# cronsense

Turn plain Russian or English schedules into cron expressions.

```
по будням в 9:30                          →  30 9 * * 1-5
каждые 15 минут с 9 до 18 по будням       →  */15 9-17 * * 1-5
1 и 15 числа в 12:00                      →  0 12 1,15 * *
every other day at noon                   →  0 12 */2 * *
mon, wed and fri at 6pm                   →  0 18 * * 1,3,5
```

- Russian and English, mixed freely, with Russian word forms handled
- No dependencies, no LLM, fully deterministic
- Strict TypeScript types, errors carry a code and the position of the problem
- Refuses to guess: anything cron cannot express exactly is an error, not a silent approximation

## Install

```bash
npm install cronsense
```

## Usage

```ts
import { parse, toCron, safeParse, nextRuns } from 'cronsense';

toCron('каждый день в 9 утра');
// '0 9 * * *'

const schedule = parse('every 2 hours from 8:00 to 20:00');
schedule.cron;
// '0 8-20/2 * * *'
schedule.fields.hour;
// { kind: 'step', from: 8, to: 20, step: 2 }

nextRuns(schedule, { count: 3, timezone: 'utc' });
// [Date, Date, Date]

const result = safeParse('по будням кроме пятницы');
if (!result.ok) {
  result.error.code;    // 'UNSUPPORTED'
  result.error.span;    // { start: 10, end: 15 }
  result.error.excerpt; // input with a ^^^^^ marker under the problem
}
```

### CLI

```bash
npx cronsense "по будням в 9:30"
npx cronsense -n 5 "every 15 minutes between 9 and 17"
npx cronsense --cron -n 3 --utc "0 9 * * 1-5"
npx cronsense --json "1 числа каждого месяца"
```

## API

| Function | Description |
| --- | --- |
| `parse(text, options?)` | Returns `Schedule`, throws `CronsenseError` |
| `safeParse(text, options?)` | Returns `{ ok: true, schedule }` or `{ ok: false, error }` |
| `toCron(text, options?)` | Returns the cron string |
| `parseCron(expression)` | Parses a 5-field cron expression or macro (`@daily`, …) into a `Schedule` |
| `nextRuns(schedule \| expression, options?)` | Next run times; options: `count` (default 5), `from`, `timezone` (`'local'` or `'utc'`) |
| `formatCron(fields)` | Formats structured fields back into a cron string |

`ParseOptions.weeklyOn` sets the weekday used by "weekly" / «еженедельно» (default `0`, Sunday, as in `@weekly`).

### Error codes

| Code | Meaning |
| --- | --- |
| `EMPTY_INPUT` | Nothing to parse |
| `UNKNOWN_WORD` | A word is not in the vocabulary |
| `UNEXPECTED_TOKEN` / `UNEXPECTED_END` | Words are in an order the grammar does not accept |
| `OUT_OF_RANGE` | Hour 25, 30 February, every 90 minutes, … |
| `AMBIGUOUS` | A bare number could be a time or a day: add «в»/"at" or «числа»/"th" |
| `CONFLICT` | Parts contradict each other or cron would treat them with OR semantics |
| `INCOMPLETE` | «с 9 до 18» without an interval, "every" without a unit |
| `UNSUPPORTED` | Last day of month, seconds, exclusions, every 2 weeks, … |
| `INVALID_CRON` | `parseCron` received a malformed expression |

## What it understands

- Intervals: every N minutes / hours / days / months, «через день», "every other hour", «раз в 5 минут», "once a day"
- Frequencies: hourly, daily, weekly, monthly, yearly / «ежечасно», «ежедневно», …
- Times: `9:30`, `9.30`, `9am`, `7 p.m.`, noon / midnight, «в 3 часа дня», «в 11 ночи», «9 часов 45 минут», several times at once
- Time ranges for intervals: «с 9 до 18», "between 9 and 17", «до 12», overnight windows like «с 22 до 6»
- Weekdays: names, abbreviations, ranges (`пн-пт`, "monday through friday"), weekdays / weekends
- Days of month: «1 и 15 числа», «с 1 по 10 число», "on the 1st and 15th", «15 января», "jan 15"
- Months: names, lists, ranges, including ranges across the new year («с ноября по февраль»)

## Semantics worth knowing

- «с 9 до 18» with a minute interval ends before 18:00 (`9-17`); with an hour interval, 18:00 is included (`9-18`).
- Cron ORs day-of-month and day-of-week, so «по понедельникам 1 числа» is rejected instead of silently meaning "every Monday **or** the 1st".
- Several times must form a grid (the same minutes for every hour): `9:00, 9:30, 18:00, 18:30` works, while `9:00 and 18:30` needs two schedules.
- `nextRuns` supports local time and UTC and skips times that fall into a DST gap.

## License

MIT
