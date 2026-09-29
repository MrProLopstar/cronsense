import type { EasterCalendar, Meridiem, Unit, Weekday } from './types.js';

export type Lexeme =
  | { readonly t: 'every' }
  | { readonly t: 'other' }
  | { readonly t: 'ordinal'; readonly value: number }
  | { readonly t: 'cardinal'; readonly value: number }
  | { readonly t: 'halfOf'; readonly value: number }
  | { readonly t: 'halfHour' }
  | { readonly t: 'half' }
  | { readonly t: 'quarter' }
  | { readonly t: 'without' }
  | { readonly t: 'last' }
  | { readonly t: 'easter'; readonly calendar: EasterCalendar }
  | { readonly t: 'easterKind'; readonly calendar: EasterCalendar }
  | { readonly t: 'after' }
  | { readonly t: 'before' }
  | { readonly t: 'unit'; readonly unit: Unit; readonly meridiem?: Meridiem }
  | { readonly t: 'freq'; readonly unit: Unit }
  | { readonly t: 'dow'; readonly days: readonly Weekday[]; readonly group?: 'weekday' | 'workday' }
  | { readonly t: 'month'; readonly month: number }
  | { readonly t: 'meridiem'; readonly meridiem: Meridiem }
  | { readonly t: 'clock'; readonly hour: 0 | 12 }
  | { readonly t: 'from' }
  | { readonly t: 'to'; readonly weak: boolean }
  | { readonly t: 'and' }
  | { readonly t: 'at' }
  | { readonly t: 'domMarker' }
  | { readonly t: 'noise' }
  | { readonly t: 'unsupported'; readonly feature: string };

type Rule = readonly [pattern: RegExp, lexeme: Lexeme];

const WEEKDAYS: readonly Weekday[] = [1, 2, 3, 4, 5];
const WEEKEND: readonly Weekday[] = [6, 0];

const ORDINAL_ENDING = '(?:ый|ий|ой|ое|ье|ого|ьего|ая|ья|ую|ью|ым|ьим|ом|ьем)';

const ORDINALS: readonly (readonly [string, number])[] = [
  ['четверт', 4], ['пят', 5], ['шест', 6], ['седьм', 7], ['восьм', 8],
  ['девят', 9], ['десят', 10], ['одиннадцат', 11], ['двенадцат', 12],
];

const HOUR_ORDINALS: readonly (readonly [string, number])[] = [['перв', 1], ['втор', 2], ['трет', 3], ...ORDINALS];

const CARDINALS: readonly (readonly [string, number])[] = [
  ['один|одна|одну|одного|одной', 1], ['два|две|двух', 2], ['три|трех', 3], ['четыре|четырех', 4],
  ['пять|пяти', 5], ['шесть|шести', 6], ['семь|семи', 7], ['восемь|восьми', 8], ['девять|девяти', 9],
  ['десять|десяти', 10], ['одиннадцат[ьи]', 11], ['двенадцат[ьи]', 12], ['тринадцат[ьи]', 13],
  ['четырнадцат[ьи]', 14], ['пятнадцат[ьи]', 15], ['шестнадцат[ьи]', 16], ['семнадцат[ьи]', 17],
  ['восемнадцат[ьи]', 18], ['девятнадцат[ьи]', 19], ['двадцат[ьи]', 20], ['тридцат[ьи]', 30],
  ['сорока?', 40], ['пятьдесят|пятидесяти', 50],
];

const dow = (day: Weekday): Lexeme => ({ t: 'dow', days: [day] });
const month = (value: number): Lexeme => ({ t: 'month', month: value });
const unit = (value: Unit): Lexeme => ({ t: 'unit', unit: value });
const freq = (value: Unit): Lexeme => ({ t: 'freq', unit: value });

const RULES: readonly Rule[] = [
  [/^(?:кажд(?:ый|ая|ое|ые|ую|ого|ой|ом|ым|ых)|every|each|раз|once)$/, { t: 'every' }],
  [/^(?:other|через)$/, { t: 'other' }],

  [/^(?:перв(?:ый|ое|ого|ая|ую|ой|ым|ом)|first)$/, { t: 'ordinal', value: 1 }],
  [/^(?:втор(?:ой|ое|ого|ая|ую|ым|ом)|second)$/, { t: 'ordinal', value: 2 }],
  [/^(?:трет(?:ий|ье|ьего|ья|ью|ьим|ьем)|third)$/, { t: 'ordinal', value: 3 }],

  ...ORDINALS.map(([stem, value]): Rule => [new RegExp(`^${stem}${ORDINAL_ENDING}$`), { t: 'ordinal', value }]),
  ...CARDINALS.map(([pattern, value]): Rule => [new RegExp(`^(?:${pattern})$`), { t: 'cardinal', value }]),
  [/^полчаса$/, { t: 'halfHour' }],
  [/^(?:половин[аеуы]|пол)$/, { t: 'half' }],
  [/^четверт[ьи]$/, { t: 'quarter' }],
  [/^без$/, { t: 'without' }],

  [/^дня$/, { t: 'unit', unit: 'day', meridiem: 'pm' }],
  [/^(?:минут[аыу]?|мин|minutes?|mins?)$/, unit('minute')],
  [/^(?:час(?:а|ов)?|hours?|hrs?)$/, unit('hour')],
  [/^(?:день|дней|сутки|суток|days?)$/, unit('day')],
  [/^(?:недел(?:я|и|ю|ь)|weeks?)$/, unit('week')],
  [/^(?:месяц(?:а|ев)?|months?)$/, unit('month')],
  [/^(?:год(?:а)?|лет|years?)$/, unit('year')],

  [/^(?:ежеминутн[а-я]*)$/, freq('minute')],
  [/^(?:ежечасн[а-я]*|hourly)$/, freq('hour')],
  [/^(?:ежедневн[а-я]*|каждодневн[а-я]*|daily)$/, freq('day')],
  [/^(?:еженедельн[а-я]*|weekly)$/, freq('week')],
  [/^(?:ежемесячн[а-я]*|monthly)$/, freq('month')],
  [/^(?:ежегодн[а-я]*|yearly|annually)$/, freq('year')],

  [/^(?:понедельник(?:а|ам|и|ов|у)?|пн|mondays?|mon)$/, dow(1)],
  [/^(?:вторник(?:а|ам|и|ов|у)?|вт|tuesdays?|tues?)$/, dow(2)],
  [/^(?:сред(?:а|у|ам|ы|е)|ср|wednesdays?|wed|weds)$/, dow(3)],
  [/^(?:четверг(?:а|ам|и|ов|у)?|чт|thursdays?|thu|thur|thurs)$/, dow(4)],
  [/^(?:пятниц(?:а|у|ам|ы|е)|пт|fridays?|fri)$/, dow(5)],
  [/^(?:суббот(?:а|у|ам|ы|е)|сб|saturdays?|sat)$/, dow(6)],
  [/^(?:воскресень(?:е|я|ям|ю)|вс|sundays?|sun)$/, dow(0)],
  [/^(?:будн[а-я]*|weekdays?)$/, { t: 'dow', days: WEEKDAYS, group: 'weekday' }],
  [/^(?:рабоч[а-я]*|workdays?|working|business)$/, { t: 'dow', days: WEEKDAYS, group: 'workday' }],
  [/^(?:выходн[а-я]*|weekends?)$/, { t: 'dow', days: WEEKEND }],

  [/^(?:январ[а-яь]*|january|jan)$/, month(1)],
  [/^(?:феврал[а-яь]*|february|feb)$/, month(2)],
  [/^(?:март[аеу]?|march|mar)$/, month(3)],
  [/^(?:апрел[а-яь]*|april|apr)$/, month(4)],
  [/^(?:ма[йяею]|may)$/, month(5)],
  [/^(?:июн[а-яь]*|june|jun)$/, month(6)],
  [/^(?:июл[а-яь]*|july|jul)$/, month(7)],
  [/^(?:август[а-я]*|august|aug)$/, month(8)],
  [/^(?:сентябр[а-яь]*|september|sept|sep)$/, month(9)],
  [/^(?:октябр[а-яь]*|october|oct)$/, month(10)],
  [/^(?:ноябр[а-яь]*|november|nov)$/, month(11)],
  [/^(?:декабр[а-яь]*|december|dec)$/, month(12)],

  [/^(?:утра|пополуночи|am|morning)$/, { t: 'meridiem', meridiem: 'am' }],
  [/^(?:вечера|пополудни|pm|evening|afternoon)$/, { t: 'meridiem', meridiem: 'pm' }],
  [/^(?:ночи|night)$/, { t: 'meridiem', meridiem: 'night' }],
  [/^(?:полдень|полудня|noon|midday)$/, { t: 'clock', hour: 12 }],
  [/^(?:полночь|полуночи|midnight)$/, { t: 'clock', hour: 0 }],

  [/^(?:с|со|from|between|starting)$/, { t: 'from' }],
  [/^(?:до|to|through|thru|till|until)$/, { t: 'to', weak: false }],
  [/^по$/, { t: 'to', weak: true }],
  [/^(?:и|and|плюс)$/, { t: 'and' }],
  [/^(?:в|во|на|at|on|in|per|a|an)$/, { t: 'at' }],
  [/^(?:числа|число|числам)$/, { t: 'domMarker' }],

  [/^(?:the|of|o|clock|ровно|дни|дням|днями|also|также|past|за)$/, { t: 'noise' }],

  [/^(?:последн[а-я]*|last)$/, { t: 'last' }],
  [/^(?:пасх[аиуеой]|пасхой)$/, { t: 'easter', calendar: 'orthodox' }],
  [/^easter$/, { t: 'easter', calendar: 'western' }],
  [/^(?:православн[а-я]*|orthodox)$/, { t: 'easterKind', calendar: 'orthodox' }],
  [/^(?:католическ[а-я]*|западн[а-я]*|western|catholic)$/, { t: 'easterKind', calendar: 'western' }],
  [/^(?:после|after)$/, { t: 'after' }],
  [/^before$/, { t: 'before' }],
  [/^(?:секунд[а-я]*|seconds?|secs?)$/, { t: 'unsupported', feature: 'second-level precision' }],
  [/^(?:кроме|except|excluding)$/, { t: 'unsupported', feature: 'exclusions' }],
  [/^(?:десятилет[а-я]*|век[аеу]?|веков|столет[а-я]*|decades?|centur(?:y|ies))$/, { t: 'unsupported', feature: 'intervals longer than a year' }],
];

const HALF_OF = new RegExp(`^пол-?(${HOUR_ORDINALS.map(([stem]) => stem).join('|')})(?:ого|ьего)$`);

export const lookupWord = (word: string): Lexeme | null => {
  const half = HALF_OF.exec(word);
  const stem = half?.[1];
  if (stem !== undefined) {
    const value = HOUR_ORDINALS.find(([candidate]) => candidate === stem)?.[1];
    if (value !== undefined) return { t: 'halfOf', value };
  }
  for (const [pattern, lexeme] of RULES) {
    if (pattern.test(word)) return lexeme;
  }
  return null;
};
