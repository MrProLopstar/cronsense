# cronsense

[English](README.md) · **Русский**

[![JSR](https://jsr.io/badges/@mrprolopstar/cronsense)](https://jsr.io/@mrprolopstar/cronsense)
[![JSR Score](https://jsr.io/badges/@mrprolopstar/cronsense/score)](https://jsr.io/@mrprolopstar/cronsense/score)
[![CI](https://github.com/MrProLopstar/cronsense/actions/workflows/ci.yml/badge.svg)](https://github.com/MrProLopstar/cronsense/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

Переводит расписания, написанные обычными словами на русском или английском, в cron-выражения, а cron обратно в текст.

**[▶ Попробовать в playground](https://mrprolopstar.github.io/cronsense/)**

```
по будням в 9:30                          →  30 9 * * 1-5
каждые 15 минут с 9 до 18 по будням       →  */15 9-17 * * 1-5
1 и 15 числа в 12:00                      →  0 12 1,15 * *
every other day at noon                   →  0 12 */2 * *
mon, wed and fri at 6pm                   →  0 18 * * 1,3,5

0 23 * * 0,1,5,6    →  с пятницы по понедельник в 23:00  /  from friday through monday at 11pm
```

- **В обе стороны:** `toCron` превращает текст в cron, `describe` превращает cron в текст
- **Гарантия round-trip:** любое описание разбирается обратно в то же расписание, это проверено на тысячах случайных выражений
- **Нормальный русский:** словоформы, «в 3 часа дня», «со вторника по четверг», «каждую 21 минуту»
- **Без LLM и без зависимостей:** результат детерминирован, работает в Node, Deno, Bun и браузере
- **Не угадывает:** то, что cron не может выразить точно, даёт ошибку с кодом и позицией проблемного места
- **Для ИИ-агентов:** встроенный [MCP-сервер](#mcp-сервер-для-ии-агентов), потому что LLM часто ошибаются в cron

## Установка

```bash
npx jsr add @mrprolopstar/cronsense
```

Из GitHub Packages (нужна строка `@mrprolopstar:registry=https://npm.pkg.github.com` в `.npmrc` и GitHub-токен с правом `read:packages`):

```bash
npm install @mrprolopstar/cronsense
```

Или напрямую с GitHub:

```bash
npm install github:MrProLopstar/cronsense
```

## Использование

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
  result.error.excerpt; // ввод с отметкой ^^^^^ под проблемным словом
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

`toRRule` строит iCalendar RRULE (RFC 5545) из тех же фраз и принимает то, чего cron не умеет:

```ts
toRRule('в последний день месяца в 18:00');       // 'FREQ=MONTHLY;BYMONTHDAY=-1;BYHOUR=18;BYMINUTE=0'
toRRule('в первый понедельник месяца в 9:30');    // 'FREQ=MONTHLY;BYDAY=1MO;BYHOUR=9;BYMINUTE=30'
toRRule('каждые 2 недели по понедельникам в 10'); // 'FREQ=WEEKLY;INTERVAL=2;BYDAY=MO;BYHOUR=10;BYMINUTE=0'
toRRule('каждые 90 минут');                       // 'FREQ=MINUTELY;INTERVAL=90'
toRRule('по понедельникам 1 числа');              // 'FREQ=MONTHLY;BYMONTHDAY=1;BYDAY=MO;...', понедельник И 1 число
```

Шаги, которые делят час или сутки нацело («каждые 15 минут», «каждые 2 часа»), превращаются в явные списки `BYMINUTE`/`BYHOUR` и не зависят от `DTSTART`. `INTERVAL` используется только для настоящих интервалов («каждые 90 минут», «каждые 3 дня», «каждые 2 недели»), они отсчитываются от `DTSTART`. Тесты сверяют правила с [rrule.js](https://github.com/jkbrzt/rrule) по каждому запуску. В CLI: `--rrule`, в MCP: `to_rrule`.

## Даты без DTSTART

`occurrences(text, { from, to })` выдаёт моменты срабатывания расписания в любом окне, вперёд или назад, без DTSTART. Точка отсчёта `anchor` нужна только для настоящих интервалов («каждые 2 недели», «каждые 90 минут»), чтобы знать, какие именно недели считать.

```ts
occurrences('по пятницам в 19:00', { from: new Date(2026, 9, 1), to: new Date(2026, 9, 31) });
// пятницы октября 2026 года в 19:00

occurrences('каждые 2 недели по понедельникам в 19:00', { from, to, anchor: new Date(2026, 0, 5) });
```

Опции: `timezone` (`'local'` по умолчанию или `'utc'`), `limit` (по умолчанию 10 000) и все опции разбора. Результаты сверены с rrule.js на десятках тысяч случайных фраз.

## Рабочие дни

`occurrences` учитывает производственный календарь, если передать функцию проверки рабочего дня, например из [prodcal](https://jsr.io/@mrprolopstar/prodcal). Сам cronsense остаётся без зависимостей, поэтому подойдёт календарь любой страны.

```ts
import { isWorkday } from '@mrprolopstar/prodcal';

occurrences('в первый рабочий день месяца в 9:00', { from, to, isWorkday });  // 2026-01-12, 2026-02-02, ...
occurrences('в последний рабочий день месяца в 18:00', { from, to, isWorkday }); // 2026-12-30, а не 31-е
occurrences('по рабочим дням в 9:30', { from, to, isWorkday });              // без праздников, с рабочими субботами
```

«Будний день» всегда означает понедельник–пятницу, поэтому «в первый будний день месяца» работает и в `toRRule` через `BYSETPOS`. «Рабочий день» зависит от праздников, которые не выражаются ни в cron, ни в RRULE: `toRRule` такую фразу отклоняет, а в cron «по рабочим дням» по-прежнему означает пн–пт.

## Пасха

Русское «Пасха» по умолчанию означает православную Пасху, английское "Easter" — западную. Явно выбрать можно словами «православная», «католическая», "orthodox", "western" или опцией `easter`.

```ts
occurrences('в Пасху', { from, to });                          // 2026-04-12, 2027-05-02
occurrences('через 49 дней после Пасхи', { from, to });        // Троица: 2026-05-31
occurrences('на 50-й день после Пасхи', { from, to });         // то же самое, Пасха считается первым днём
occurrences('за 46 дней до католической Пасхи', { from, to }); // Пепельная среда: 2026-02-18
toRRule('49 days after easter');                               // 'FREQ=YEARLY;BYHOUR=0;BYMINUTE=0;BYEASTER=49'
easterDate(2026, 'orthodox');                                  // { month: 4, day: 12 }
```

`BYEASTER` — нестандартное расширение rrule.js и python-dateutil, которое знает только западную Пасху. Поэтому `toRRule` для православной Пасхи возвращает ошибку и предлагает `occurrences`. Cron Пасху не выражает вовсе.

## С вашим планировщиком

cronsense выдаёт обычные cron-строки, поэтому подходит к любому планировщику:

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

В приложениях для пользователей, например в Telegram-ботах, удобно разобрать то, что ввёл человек, и ответить каноническим описанием, чтобы он увидел, как его поняли:

```ts
const result = safeParse(message.text);
reply(result.ok ? `Буду напоминать ${describe(result.schedule, { locale: 'ru' })}` : result.error.excerpt);
```

## MCP-сервер для ИИ-агентов

LLM регулярно выдают cron с незаметными ошибками. `cronsense-mcp` даёт агентам детерминированные инструменты:

| Инструмент | Что делает |
| --- | --- |
| `to_cron` | Текст расписания → cron и каноническое описание |
| `describe_cron` | Cron → текст на русском или английском |
| `next_runs` | Ближайшие запуски в формате ISO 8601 |

Claude Code:

```bash
claude mcp add cronsense -- npx -y -p github:MrProLopstar/cronsense cronsense-mcp
```

Claude Desktop, Cursor и другие клиенты (конфиг `mcpServers`):

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

Сервер без зависимостей, работает по MCP через stdio (версии протокола от 2024-11-05 до 2025-06-18).

## API

| Функция | Описание |
| --- | --- |
| `parse(text, options?)` | Возвращает `Schedule`, при ошибке бросает `CronsenseError` |
| `safeParse(text, options?)` | Возвращает `{ ok: true, schedule }` или `{ ok: false, error }` |
| `toCron(text, options?)` | Возвращает cron-строку |
| `parseCron(expression)` | Разбирает cron из 5 полей или макрос (`@daily` и т. п.) в `Schedule` |
| `nextRuns(schedule \| expression, options?)` | Ближайшие запуски; опции: `count` (по умолчанию 5), `from`, `timezone` (`'local'` или `'utc'`) |
| `describe(schedule \| expression, options?)` | Описание словами; `locale`: `'en'` (по умолчанию) или `'ru'` |
| `toRRule(text, options?)` | Строка iCalendar RRULE, см. [RRULE](#rrule) |
| `occurrences(text, { from, to, anchor?, timezone?, limit? })` | Моменты срабатывания в окне без DTSTART, включая православную Пасху |
| `easterDate(year, 'orthodox' \| 'western')` | Дата Пасхи в году |
| `formatCron(fields)` | Собирает cron-строку из структурированных полей |

`ParseOptions.strictHours` отклоняет часы от 1 до 12 без «утра»/«вечера» или am/pm с ошибкой `AMBIGUOUS` и не считает их утренними: «без шести семь» не пройдёт, а «без шести семь вечера», «в 19:00» и «в 09:30» пройдут. Включайте там, где ошибиться дорого, например в ботах-напоминалках. В CLI: `--strict-hours`, в MCP: `strictHours`.

`ParseOptions.weeklyOn` задаёт день недели для «еженедельно» / "weekly" (по умолчанию `0`, воскресенье, как в `@weekly`).

### Коды ошибок

| Код | Значение |
| --- | --- |
| `EMPTY_INPUT` | Пустой ввод |
| `UNKNOWN_WORD` | Слова нет в словаре |
| `UNEXPECTED_TOKEN` / `UNEXPECTED_END` | Порядок слов, который грамматика не принимает |
| `OUT_OF_RANGE` | 25 часов, 30 февраля, каждые 90 минут и т. п. |
| `AMBIGUOUS` | Непонятно, время это или число месяца: добавьте «в»/"at" или «числа»/"th" |
| `CONFLICT` | Части расписания противоречат друг другу, или cron объединил бы их через ИЛИ |
| `INCOMPLETE` | «с 9 до 18» без интервала, «каждые» без единицы |
| `UNSUPPORTED` | Последний день месяца, секунды, исключения, каждые 2 недели, десятилетия и века |
| `INVALID_CRON` | `parseCron` получил некорректное выражение |

## Что понимает парсер

- Интервалы: каждые N минут / часов / дней / месяцев, «через день», "every other hour", «раз в 5 минут», "once a day"
- Частоты: «ежечасно», «ежедневно», «еженедельно», «ежемесячно», «ежегодно» и английские аналоги
- Минуты часа: «каждый час в 15 минут», "every hour at 15 minutes past"
- Разговорное время: «полвторого», «в половину третьего», «в четверть девятого вечера», «без пяти шестнадцать», «в пять минут седьмого», «в час дня», числительные словами («в три утра», «каждые двадцать пять минут», «каждые полчаса»)
- Время: `9:30`, `9.30`, `9am`, `7 p.m.`, полдень и полночь, «в 3 часа дня», «в 11 ночи», «9 часов 45 минут», несколько времён сразу
- Окна для интервалов: «с 9 до 18», "between 9 and 17", «до 12», через полночь, например «с 22 до 6»
- Дни недели: названия, сокращения, диапазоны (`пн-пт`, "monday through friday"), будни и выходные
- Числа месяца: «1 и 15 числа», «с 1 по 10 число», "on the 1st and 15th", «15 января», "jan 15"
- Месяцы: названия, списки, диапазоны, в том числе через новый год («с ноября по февраль»)

## Описание cron словами

`describe` выбирает самую естественную формулировку: интервалы, окна времени, диапазоны дней и месяцев, «15 января», полдень и полночь. Любое описание, которое он выдаёт, `parse` разбирает обратно в эквивалентное расписание; это проверено на тысячах случайных выражений на обоих языках. Исключение одно: если в cron ограничены и число месяца, и день недели, cron объединяет их через ИЛИ, поэтому в тексте стоит «или» / "or", и парсер такую фразу намеренно не принимает.

```
30 9 * * 1-5       по будням в 9:30                            on weekdays at 9:30am
0 23 * * 0,1,5,6   с пятницы по понедельник в 23:00            from friday through monday at 11pm
0 8-20/2 * * *     каждые 2 часа с 8 до 20                     every 2 hours from 8am to 8pm
5-59/10 * * * *    каждый час в 5, 15, 25, 35, 45 и 55 минут   every hour at 5, 15, 25, 35, 45 and 55 minutes past
```

## Тонкости

- Без «утра»/«вечера» или am/pm часы от 1 до 12 читаются как сказаны: «без шести семь» это 6:54, так же как «в 7» это 7:00. С `strictHours: true` такие фразы дают ошибку.
- Часы в разговорной форме читаются как сказаны: «полвторого» это 1:30, а «полвторого дня» 13:30. «Первого» означает двенадцатый час, поэтому «полпервого» это 12:30, а «полпервого ночи» 0:30.
- «С 9 до 18» при интервале в минутах заканчивается до 18:00 (`9-17`), а при интервале в часах включает 18:00 (`9-18`).
- Cron объединяет число месяца и день недели через ИЛИ, поэтому «по понедельникам 1 числа» даёт ошибку и не превращается молча в «каждый понедельник **или** 1 число».
- Несколько времён должны образовывать сетку (одни и те же минуты для каждого часа): `9:00, 9:30, 18:00, 18:30` работает, а для `9:00 и 18:30` нужны два расписания.
- `nextRuns` считает в локальном времени или UTC и пропускает время, выпавшее на перевод часов.

## Версии

cronsense следует [semver](https://semver.org). Публичный API (`parse`, `safeParse`, `toCron`, `describe`, `parseCron`, `nextRuns`, `formatCron`, экспортируемые типы и коды ошибок) меняется только в мажорных релизах. Новые слова и языки могут начать принимать фразы, которые раньше отклонялись; это не считается ломающим изменением. История изменений в [CHANGELOG.md](CHANGELOG.md).

Релиз делается через **Actions → Release → Run workflow**: выбрать `patch`, `minor`, `major` или точную версию.

## Лицензия

MIT
