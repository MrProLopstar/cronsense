# cronsense

**English** · [Русский](README.ru.md)

[![npm](https://img.shields.io/npm/v/cronsense)](https://www.npmjs.com/package/cronsense)
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
npm install cronsense
```

No bundler? Load it in the browser straight from jsDelivr, which builds a minified ES module from the npm package:

```html
<script type="module">
  import { toCron } from 'https://cdn.jsdelivr.net/npm/cronsense@1/+esm';
  console.log(toCron('по будням в 9:30'));
</script>
```

`@1` follows the latest 1.x release; pin an exact version such as `@1.7.1` in production.

The same package is published to [JSR](https://jsr.io/@mrprolopstar/cronsense) for Deno and Bun:

```bash
npx jsr add @mrprolopstar/cronsense
```

It is also available from GitHub Packages as `@mrprolopstar/cronsense` and straight from the repository with `npm install github:MrProLopstar/cronsense`.

## Usage

```ts
import { describe, nextRuns, parse, safeParse, toCron } from 'cronsense';

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

## RRULE

`toRRule` builds an iCalendar RRULE (RFC 5545) from the same phrases, and also accepts what cron cannot express:

```ts
toRRule('в последний день месяца в 18:00');       // 'FREQ=MONTHLY;BYMONTHDAY=-1;BYHOUR=18;BYMINUTE=0'
toRRule('в первый понедельник месяца в 9:30');    // 'FREQ=MONTHLY;BYDAY=1MO;BYHOUR=9;BYMINUTE=30'
toRRule('каждые 2 недели по понедельникам в 10'); // 'FREQ=WEEKLY;INTERVAL=2;BYDAY=MO;BYHOUR=10;BYMINUTE=0'
toRRule('каждые 90 минут');                       // 'FREQ=MINUTELY;INTERVAL=90'
toRRule('по понедельникам 1 числа');              // 'FREQ=MONTHLY;BYMONTHDAY=1;BYDAY=MO;...', Monday AND the 1st
```

Steps that divide the hour or the day (every 15 minutes, every 2 hours) become explicit `BYMINUTE`/`BYHOUR` lists, so they do not depend on `DTSTART`. Only true intervals (every 90 minutes, every 3 days, every 2 weeks) use `INTERVAL` and count from `DTSTART`. Tests compare the rules with [rrule.js](https://github.com/jkbrzt/rrule) occurrence by occurrence. CLI: `--rrule`; MCP: `to_rrule`.

## systemd timers

`toSystemd` returns values for `OnCalendar=`. systemd calendar events can do more than cron, so this output also covers the last day of the month, the Nth weekday and day-of-month AND weekday:

```ts
toSystemd('по будням в 9:30');                  // ['Mon..Fri *-*-* 09:30:00']
toSystemd('в последний день месяца в 18:00');   // ['*-*~01 18:00:00']
toSystemd('в первый понедельник месяца в 9:30'); // ['Mon *-*-01..07 09:30:00']
toSystemd('ежеквартально');                     // ['*-01,04,07,10-01 00:00:00']
toSystemd('на 23 февраля и 8 марта');           // ['*-02-23 00:00:00', '*-03-08 00:00:00'], two OnCalendar= lines
```

True intervals such as every 90 minutes are refused with a hint to use a monotonic timer (`OnUnitActiveSec=90min`). Every output is checked against `systemd-analyze calendar` in the test suite. CLI: `--systemd`; MCP: `to_systemd`.

## Dates without DTSTART

`occurrences(text, { from, to })` lists the moments a schedule fires in any window, forward or backward, without a DTSTART. Only true intervals («каждые 2 недели», every 90 minutes) need an `anchor` to know which weeks count.

```ts
occurrences('по пятницам в 19:00', { from: new Date(2026, 9, 1), to: new Date(2026, 9, 31) });
// Fridays of October 2026 at 19:00

occurrences('каждые 2 недели по понедельникам в 19:00', { from, to, anchor: new Date(2026, 0, 5) });
```

Options: `timezone` (`'local'` by default or `'utc'`), `limit` (10 000 by default), plus all parse options. The results are checked against rrule.js on tens of thousands of random phrases.

## One-time moments

Cron describes repeating schedules, but reminders often need a single moment. `when(text, { now })` resolves it:

```ts
when('через 4 часа');                              // now + 4 hours
when('завтра в двенадцать семнадцать');             // tomorrow at 12:17
when('через месяц ровно, в 12:17');                 // same day next month at 12:17
when('по пятницам в 19:00');                        // a recurring phrase resolves to its next run
```

It understands «сегодня», «завтра», «послезавтра», today, tomorrow, «через N минут/часов/дней/недель/месяцев/лет» (also «полчаса», «полтора часа», «2 часа 30 минут») and «in N days», with an optional time. Month arithmetic keeps the day of the month and clamps it, so «через месяц» from January 31 is February 28. Options: `now` (the current time by default), `timezone`, plus all parse options.

In `toCron` «через день» and «через месяц» still mean every other day or month, while «через 4 часа» and «завтра» point you to `when()`.

## Working days

`occurrences` understands the Russian production calendar when you pass a working-day predicate, for example from [prodcalendar](https://jsr.io/@mrprolopstar/prodcalendar). cronsense itself stays dependency-free, so any country's calendar works.

```ts
import { isWorkday } from 'prodcalendar';

occurrences('в первый рабочий день месяца в 9:00', { from, to, isWorkday });  // 2026-01-12, 2026-02-02, ...
occurrences('в последний рабочий день месяца в 18:00', { from, to, isWorkday }); // 2026-12-30, not the 31st
occurrences('по рабочим дням в 9:30', { from, to, isWorkday });              // skips holidays, keeps working Saturdays
```

«Будний день» always means Monday to Friday, so «в первый будний день месяца» also works in `toRRule` as `BYSETPOS`. «Рабочий день» depends on holidays, which neither cron nor RRULE can express: `toRRule` refuses it, and in cron «по рабочим дням» stays Monday to Friday.

## Easter

Russian «Пасха» means Orthodox Easter by default, English "Easter" means Western; «православная», «католическая», "orthodox", "western" or the `easter` option choose explicitly.

```ts
occurrences('в Пасху', { from, to });                          // 2026-04-12, 2027-05-02
occurrences('через 49 дней после Пасхи', { from, to });        // Trinity: 2026-05-31
occurrences('на 50-й день после Пасхи', { from, to });         // the same, counting Easter as day 1
occurrences('за 46 дней до католической Пасхи', { from, to }); // Ash Wednesday: 2026-02-18
toRRule('49 days after easter');                               // 'FREQ=YEARLY;BYHOUR=0;BYMINUTE=0;BYEASTER=49'
easterDate(2026, 'orthodox');                                  // { month: 4, day: 12 }
```

`BYEASTER` is a non-standard extension of rrule.js and python-dateutil that only knows Western Easter, so `toRRule` refuses Orthodox Easter and points to `occurrences`. Cron cannot express Easter at all.

## Holidays

Named holidays work in every format that can express them:

```ts
toCron('в День Победы в 10 утра');                // '0 10 9 5 *'
toCron('в Рождество');                            // '0 0 7 1 *'
toCron('в католическое Рождество');               // '0 0 25 12 *'
occurrences('в Троицу', { from, to });            // 2026-05-31
occurrences('на Масленицу', { from, to });        // the whole week, 2026-02-16 to 2026-02-22
occurrences('на 23 февраля и 8 марта', { from, to }); // exactly two dates
toRRule('good friday');                           // 'FREQ=YEARLY;...;BYEASTER=-2'
```

Covered: Russian public holidays (Новый год, День защитника Отечества, 8 Марта, Праздник Весны и Труда, День Победы, День России, День народного единства, День знаний), Orthodox holidays (Рождество, Крещение, Масленица, Прощёное воскресенье, Чистый понедельник, Вербное воскресенье, Страстная пятница, Радоница, Вознесение, Троица, Духов день) and Western ones (Christmas, Epiphany, Shrove Tuesday, Ash Wednesday, Palm Sunday, Good Friday, Easter Monday, Ascension, Pentecost, Corpus Christi, Halloween). Russian names use the Orthodox calendar by default, English names the Western one; «католическое», «православное» and the `easter` option switch it.

Fixed dates that do not form a grid («23 февраля и 8 марта») are listed exactly in `occurrences`; cron and RRULE refuse them rather than fire on extra days.

## With your scheduler

cronsense only produces cron strings, so it works with any scheduler:

```ts
import cron from 'node-cron';
import { toCron } from 'cronsense';

cron.schedule(toCron('по будням в 9:30'), sendDailyReport);
```

```ts
import { Queue } from 'bullmq';
import { toCron } from 'cronsense';

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
claude mcp add cronsense -- npx -y -p cronsense cronsense-mcp
```

Claude Desktop, Cursor and other clients (`mcpServers` config):

```json
{
  "mcpServers": {
    "cronsense": {
      "command": "npx",
      "args": ["-y", "-p", "cronsense", "cronsense-mcp"]
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
| `toSystemd(text, options?)` | systemd `OnCalendar=` values, see [systemd timers](#systemd-timers) |
| `toRRule(text, options?)` | iCalendar RRULE string, see [RRULE](#rrule) |
| `occurrences(text, { from, to, anchor?, timezone?, limit? })` | Moments in a window without DTSTART, including Orthodox Easter |
| `when(text, { now?, timezone? })` | One moment: «через 4 часа», «завтра в 12:17», or the next run of a schedule |
| `easterDate(year, 'orthodox' \| 'western')` | Easter Sunday of a year |
| `formatCron(fields)` | Formats structured fields back into a cron string |

`ParseOptions.strictHours` rejects hours 1–12 without «утра»/«вечера» or am/pm with `AMBIGUOUS` instead of reading them as morning: «без шести семь» fails, «без шести семь вечера», «в 19:00» and «в 09:30» pass. Use it where a wrong guess is costly, for example in reminder bots. CLI: `--strict-hours`; MCP: `strictHours`.

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
| `UNSUPPORTED` | Last day of month, seconds, exclusions, every 2 weeks, decades and centuries |
| `INVALID_CRON` | `parseCron` received a malformed expression |

## What it understands

- Intervals: every N minutes / hours / days / months, «через день», "every other hour", «раз в 5 минут», "once a day"
- Frequencies: hourly, daily, weekly, monthly, yearly / «ежечасно», «ежедневно», …
- Longer periods and parity: «раз в полгода», «раз в полугодие», «ежеквартально», «каждый чётный час», «по нечётным числам», «каждый чётный месяц», «каждый третий час начиная с часа ночи»; «каждый чётный четверг» is the 2nd and 4th Thursday (RRULE)
- Counted frequencies checked against the list: «три раза в месяц, 8, 10 и 12 числа», «два раза в неделю по вторникам и пятницам»
- Hours and minutes as two numbers: «в час тридцать», «в семь сорок пять утра», «в одну минуту пополудни»
- Minutes of the hour: «каждый час в 15 минут», "every hour at 15 minutes past"
- Spoken Russian time: «полвторого», «в половину третьего», «в четверть девятого вечера», «без пяти шестнадцать», «в пять минут седьмого», «в час дня», number words («в три утра», «каждые двадцать пять минут», «каждые полчаса»)
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

- Without «утра»/«вечера» or am/pm, hours 1–12 are read as said, so «без шести семь» is 6:54 just like «в 7» is 7:00; pass `strictHours: true` to reject them instead.
- Spoken hours follow the words: «полвторого» is 1:30 and «полвторого дня» is 13:30; «первого» means the twelfth hour, so «полпервого» is 12:30 and «полпервого ночи» is 0:30.
- «с 9 до 18» with a minute interval ends before 18:00 (`9-17`); with an hour interval, 18:00 is included (`9-18`).
- Cron ORs day-of-month and day-of-week, so «по понедельникам 1 числа» is rejected instead of silently meaning "every Monday **or** the 1st".
- Several times must form a grid (the same minutes for every hour): `9:00, 9:30, 18:00, 18:30` works, while `9:00 and 18:30` needs two schedules.
- `nextRuns` supports local time and UTC and skips times that fall into a DST gap.

## Versioning

cronsense follows [semver](https://semver.org). The public API (`parse`, `safeParse`, `toCron`, `describe`, `parseCron`, `nextRuns`, `formatCron`, exported types and error codes) only changes in a major release. New vocabulary and new locales can make previously rejected phrases parse; that is not a breaking change. See [CHANGELOG.md](CHANGELOG.md).

To release, run **Actions → Publish → Run workflow** and pick `patch`, `minor`, `major` or an exact version.

## License

MIT
