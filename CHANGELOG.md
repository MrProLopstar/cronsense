# Changelog

All notable changes to this project are documented here. The project follows [Semantic Versioning](https://semver.org).

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
