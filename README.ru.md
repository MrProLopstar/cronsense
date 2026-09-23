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
| `formatCron(fields)` | Собирает cron-строку из структурированных полей |

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
| `UNSUPPORTED` | Последний день месяца, секунды, исключения, каждые 2 недели и т. п. |
| `INVALID_CRON` | `parseCron` получил некорректное выражение |

## Что понимает парсер

- Интервалы: каждые N минут / часов / дней / месяцев, «через день», "every other hour", «раз в 5 минут», "once a day"
- Частоты: «ежечасно», «ежедневно», «еженедельно», «ежемесячно», «ежегодно» и английские аналоги
- Минуты часа: «каждый час в 15 минут», "every hour at 15 minutes past"
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

- «С 9 до 18» при интервале в минутах заканчивается до 18:00 (`9-17`), а при интервале в часах включает 18:00 (`9-18`).
- Cron объединяет число месяца и день недели через ИЛИ, поэтому «по понедельникам 1 числа» даёт ошибку и не превращается молча в «каждый понедельник **или** 1 число».
- Несколько времён должны образовывать сетку (одни и те же минуты для каждого часа): `9:00, 9:30, 18:00, 18:30` работает, а для `9:00 и 18:30` нужны два расписания.
- `nextRuns` считает в локальном времени или UTC и пропускает время, выпавшее на перевод часов.

## Версии

cronsense следует [semver](https://semver.org). Публичный API (`parse`, `safeParse`, `toCron`, `describe`, `parseCron`, `nextRuns`, `formatCron`, экспортируемые типы и коды ошибок) меняется только в мажорных релизах. Новые слова и языки могут начать принимать фразы, которые раньше отклонялись; это не считается ломающим изменением. История изменений в [CHANGELOG.md](CHANGELOG.md).

Релиз делается через **Actions → Release → Run workflow**: выбрать `patch`, `minor`, `major` или точную версию.

## Лицензия

MIT
