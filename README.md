# cronsense

**English** · [Русский](README.ru.md)

[![JSR](https://jsr.io/badges/@mrprolopstar/cronsense)](https://jsr.io/@mrprolopstar/cronsense)
[![JSR Score](https://jsr.io/badges/@mrprolopstar/cronsense/score)](https://jsr.io/@mrprolopstar/cronsense/score)
[![CI](https://github.com/MrProLopstar/cronsense/actions/workflows/ci.yml/badge.svg)](https://github.com/MrProLopstar/cronsense/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

Turn plain Russian or English schedules into cron expressions, and cron back into plain text.

**[▶ Try it in the playground](https://mrprolopstar.github.io/cronsense/)**

```
по будням в 9:30                          →  30 9 * * 1-5
каждые 15 минут с 9 до 18 по будням       →  */15 9-17 * * 1-5
1 и 15 числа в 12:00                      →  0 12 1,15 * *
every other day at noon                   →  0 12 */2 * *
mon, wed and fri at 6pm                   →  0 18 * * 1,3,5

0 23 * * 0,1,5,6    →  с пятницы по понедельник в 23:00  /  from friday through monday at 11pm
```

- **Both directions:** `toCron` for text → cron, `describe` for cron → text
- **Round-trip guarantee:** every description parses back to an equivalent schedule, checked on thousands of random expressions
- **Real Russian:** word forms, «в 3 часа дня», «со вторника по четверг», «каждую 21 минуту»
- **No LLM, no dependencies,** fully deterministic, runs in Node, Deno, Bun and browsers
- **Refuses to guess:** anything cron cannot express exactly is an error with a code and the position of the problem
- **Ready for AI agents:** a built-in [MCP server](#mcp-server-for-ai-agents), because LLMs often get cron wrong

## Install

```bash
npx jsr add @mrprolopstar/cronsense
```

From GitHub Packages (needs a `.npmrc` line `@mrprolopstar:registry=https://npm.pkg.github.com` and a GitHub token with `read:packages`):

```bash
npm install @mrprolopstar/cronsense
```

Or straight from GitHub:

```bash
npm install github:MrProLopstar/cronsense
```

## Usage

```ts
import { describe, nextRuns, parse, safeParse, toCron } from '@mrprolopstar/cronsense';

toCron('каждый день в 9 утра');
// '0 9 * * *'

const schedule = parse('every 2 hours from 8:00 to 20:00');
schedule.cron;
// '0 8-20/2 * * *'
schedule.fields.hour;
// { kind: 'step', from: 8, to: 20, step: 2 }

describe('*/15 9-17 * * 1-5', { locale: 'ru' });
// 'каждые 15 минут с 9 до 18 по будням'
describe('0 12 1,15 * *');
// 'on the 1st and 15th at noon'

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
npx cronsense --cron --explain --locale ru "0 9 * * 1,3,5"
```

## With your scheduler

cronsense only produces cron strings, so it works with any scheduler:

```ts
import cron from 'node-cron';
import { toCron } from '@mrprolopstar/cronsense';

cron.schedule(toCron('по будням в 9:30'), sendDailyReport);
```

```ts
import { Queue } from 'bullmq';
import { toCron } from '@mrprolopstar/cronsense';

await new Queue('reports').add('weekly', {}, { repeat: { pattern: toCron('every monday at 8am') } });
```

For user-facing apps such as Telegram bots, parse what the user typed and echo back the canonical wording to confirm:

```ts
const result = safeParse(message.text);
reply(result.ok ? `Буду напоминать ${describe(result.schedule, { locale: 'ru' })}` : result.error.excerpt);
```

## MCP server for AI agents

LLMs regularly produce subtly wrong cron. `cronsense-mcp` gives agents deterministic tools instead:

| Tool | What it does |
| --- | --- |
| `to_cron` | Schedule text → cron plus canonical description |
| `describe_cron` | Cron → natural Russian or English |
| `next_runs` | Upcoming run times as ISO 8601 |

Claude Code:

```bash
claude mcp add cronsense -- npx -y -p github:MrProLopstar/cronsense cronsense-mcp
```

Claude Desktop, Cursor and other clients (`mcpServers` config):

```json
{
  "mcpServers": {
    "cronsense": {
      "command": "npx",
      "args": ["-y", "-p", "github:MrProLopstar/cronsense", "cronsense-mcp"]
    }
  }
}
```

The server has no dependencies and speaks MCP over stdio (protocol versions 2024-11-05 to 2025-06-18).

## API

| Function | Description |
| --- | --- |
| `parse(text, options?)` | Returns `Schedule`, throws `CronsenseError` |
| `safeParse(text, options?)` | Returns `{ ok: true, schedule }` or `{ ok: false, error }` |
| `toCron(text, options?)` | Returns the cron string |
| `parseCron(expression)` | Parses a 5-field cron expression or macro (`@daily`, …) into a `Schedule` |
| `nextRuns(schedule \| expression, options?)` | Next run times; options: `count` (default 5), `from`, `timezone` (`'local'` or `'utc'`) |
| `describe(schedule \| expression, options?)` | Natural-language description; `locale`: `'en'` (default) or `'ru'` |
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
- Minutes of the hour: «каждый час в 15 минут», "every hour at 15 minutes past"
- Times: `9:30`, `9.30`, `9am`, `7 p.m.`, noon / midnight, «в 3 часа дня», «в 11 ночи», «9 часов 45 минут», several times at once
- Time ranges for intervals: «с 9 до 18», "between 9 and 17", «до 12», overnight windows like «с 22 до 6»
- Weekdays: names, abbreviations, ranges (`пн-пт`, "monday through friday"), weekdays / weekends
- Days of month: «1 и 15 числа», «с 1 по 10 число», "on the 1st and 15th", «15 января», "jan 15"
- Months: names, lists, ranges, including ranges across the new year («с ноября по февраль»)

## Describing cron

`describe` picks the most natural wording: intervals, time ranges, weekday and month ranges, «15 января», noon and midnight. Every description it produces is accepted by `parse` and yields an equivalent schedule; this is checked on thousands of random expressions in both languages. The only exception is a cron that restricts both day-of-month and weekday: cron joins them with OR, so the text says «или» / "or" and is intentionally not parseable.

```
30 9 * * 1-5       по будням в 9:30                            on weekdays at 9:30am
0 23 * * 0,1,5,6   с пятницы по понедельник в 23:00            from friday through monday at 11pm
0 8-20/2 * * *     каждые 2 часа с 8 до 20                     every 2 hours from 8am to 8pm
5-59/10 * * * *    каждый час в 5, 15, 25, 35, 45 и 55 минут   every hour at 5, 15, 25, 35, 45 and 55 minutes past
```

## Semantics worth knowing

- «с 9 до 18» with a minute interval ends before 18:00 (`9-17`); with an hour interval, 18:00 is included (`9-18`).
- Cron ORs day-of-month and day-of-week, so «по понедельникам 1 числа» is rejected instead of silently meaning "every Monday **or** the 1st".
- Several times must form a grid (the same minutes for every hour): `9:00, 9:30, 18:00, 18:30` works, while `9:00 and 18:30` needs two schedules.
- `nextRuns` supports local time and UTC and skips times that fall into a DST gap.

## Versioning

cronsense follows [semver](https://semver.org). The public API (`parse`, `safeParse`, `toCron`, `describe`, `parseCron`, `nextRuns`, `formatCron`, exported types and error codes) only changes in a major release. New vocabulary and new locales can make previously rejected phrases parse; that is not a breaking change. See [CHANGELOG.md](CHANGELOG.md).

To release, run **Actions → Release → Run workflow** and pick `patch`, `minor`, `major` or an exact version.

## License

MIT
