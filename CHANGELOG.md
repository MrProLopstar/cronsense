# Changelog

All notable changes to this project are documented here. The project follows [Semantic Versioning](https://semver.org).

## 1.8.0

- `when()` resolves one-time phrases: «через 4 часа», «завтра в 12:17», «через месяц ровно, в двенадцать семнадцать»; a recurring phrase resolves to its next run
- `toCron` points «через 4 часа», «сегодня» and «завтра» to `when()` instead of failing on an unknown word
- «три раза в месяц, 8, 10 и 12 числа»: counted frequencies, checked against the listed days
- Even and odd months («каждый чётный месяц»); «каждый чётный четверг» as the 2nd and 4th Thursday in RRULE
- «раз в полугодие», «по чётным месяцам», «в одну минуту пополудни» (12:01)
- Idioms that never happen («когда рак на горе свистнет», «после дождичка в четверг») get an honest error

## 1.7.2

- «час ночи» and «час дня» work without «в»
- Hours and minutes said as two numbers: «в час тридцать», «в семь сорок пять утра», «в час пятнадцать дня»

## 1.7.1

- Published to npm as `cronsense`, the main source of the package; JSR and GitHub Packages stay as mirrors
- Releases publish to npm from GitHub Actions with trusted publishing and provenance
- Working-day examples and hints point to `prodcalendar` on npm

## 1.7.0

- `toSystemd`: systemd timer `OnCalendar=` values, including the last day of the month, Nth weekdays and day-of-month AND weekday; checked against `systemd-analyze calendar`. CLI `--systemd`, MCP tool `to_systemd`
- «раз в полгода», «каждые полгода», «ежеквартально», «каждый квартал», "quarterly"
- Parity: «каждый чётный час», «каждый нечётный час», «по чётным числам», «по нечётным дням», "every odd hour"; windows keep the parity («каждый чётный час с 9 до 18» starts at 10)
- «начиная с …» / "starting at …" opens a window until the end of the day: «каждый третий час начиная с часа ночи» → `0 1-23/3 * * *`
- `toRRule` writes month steps that divide the year as `BYMONTH` lists, so «каждые 3 месяца» no longer depends on DTSTART
- Fix: an Nth weekday together with a day of the month («в последнюю пятницу 1 числа») is rejected instead of producing a rule that never fires

## 1.6.0

- Named holidays: Russian public holidays, Orthodox and Western church holidays, fixed and Easter-based, with the calendar picked by language or by «католическое» / «православное» / the `easter` option
- Fix: «23 февраля и 8 марта» used to produce `0 0 8,23 2,3 *`, which also fired on February 8 and March 23. Day-and-month phrases are now exact dates: a grid still becomes cron, anything else is listed exactly by `occurrences` and refused by cron and RRULE
- Playground: holiday examples

## 1.5.0

- Working days: «в первый рабочий день месяца», «в последний рабочий день месяца», «в третий рабочий день», «по рабочим дням» in `occurrences` with an `isWorkday` predicate, for example from `@mrprolopstar/prodcal`
- «будний день» and «рабочий день» are now distinct: weekday positions («в первый будний день месяца») become `BYSETPOS` in `toRRule`, working-day positions need a calendar
- «в первый будний день» used to be an error and now parses

## 1.4.0

- `occurrences(text, { from, to })`: dates in any window without a DTSTART; only true intervals need an `anchor`
- Easter: «в Пасху», «за 7 дней до Пасхи», «через 49 дней после Пасхи», «на 50-й день после Пасхи», "49 days after easter"; Orthodox by default for «Пасха», Western for "Easter", selectable with words or the `easter` option
- `easterDate(year, calendar)` for both computuses, checked on every year from 1583 to 4099
- `toRRule` writes Western Easter as `BYEASTER` and refuses Orthodox Easter, which `BYEASTER` cannot express
- Mixing every-week days with Nth weekdays («по понедельникам и в первую пятницу») is rejected, because rrule.js misreads such rules

## 1.3.0

- `toRRule`: iCalendar RRULE output, including every N weeks, the last day of the month («в последний день месяца»), the Nth weekday («в первый понедельник месяца», «в последнюю пятницу»), intervals longer than cron allows and day-of-month AND weekday
- CLI `--rrule`, MCP tool `to_rrule`
- Conflicting intervals such as «еженедельно и ежемесячно» are rejected
- Tests check every RRULE against rrule.js

## 1.2.0

- `strictHours` option: hours 1–12 without «утра»/«вечера» or am/pm fail with `AMBIGUOUS` instead of being read as morning; `--strict-hours` in the CLI, `strictHours` in the MCP `to_cron` tool
- «без четверти пополудни» is 11:45

## 1.1.0

- Spoken Russian time: «полвторого», «в половину третьего», «в четверть третьего», «без четверти три», «без пяти шестнадцать», «в пять минут седьмого», «в час дня», «в час ночи», «пополудни»
- Number words from 1 to 59: «в три утра», «каждые двадцать пять минут», «без двадцати один»
- «каждые полчаса», «раз в полчаса»
- Ordinal days in words: «пятого числа», «с пятого по десятое число»
- Clear `UNSUPPORTED` error for decades and centuries
- Full weekday, month or day sets now produce `*`
- Fuzz test over 20 000 random phrases

## 1.0.1

- Also published to GitHub Packages as `@mrprolopstar/cronsense`

## 1.0.0

Stable release. The public API is frozen under semver: `parse`, `safeParse`, `toCron`, `describe`, `parseCron`, `nextRuns`, `formatCron`, the exported types and the error codes.

## 0.3.0

- Playground at https://mrprolopstar.github.io/cronsense/
- `cronsense-mcp`: dependency-free MCP server with `to_cron`, `describe_cron` and `next_runs` tools
- Examples for node-cron, BullMQ and chat bots

## 0.2.0

- `describe`: cron → natural Russian or English text that parses back to an equivalent schedule
- Minutes of the hour: «каждый час в 15 минут», "every hour at 15 minutes past"
- «до полуночи», «с полуночи», mixed weekday and month lists with ranges
- CLI: `--explain`, `--locale`

## 0.1.2

- Full module documentation on JSR

## 0.1.1

- Documented public API, CI, JSR publishing with provenance

## 0.1.0

- Russian and English schedule parser, `parseCron`, `nextRuns`, CLI
