import type { EasterCalendar } from './types.js';

type Fixed = readonly [month: number, day: number];

export type HolidayRule =
  | { readonly kind: 'fixed'; readonly orthodox: Fixed; readonly western: Fixed }
  | { readonly kind: 'easter'; readonly offsets: readonly number[] };

export interface Holiday {
  readonly name: string;
  readonly calendar: EasterCalendar;
  readonly rule: HolidayRule;
  readonly pattern: RegExp;
}

const fixed = (month: number, day: number, western: Fixed = [month, day]): HolidayRule => ({ kind: 'fixed', orthodox: [month, day], western });
const easter = (...offsets: number[]): HolidayRule => ({ kind: 'easter', offsets });
const holiday = (name: string, calendar: EasterCalendar, rule: HolidayRule, pattern: string): Holiday => ({
  name,
  calendar,
  rule,
  pattern: new RegExp(`(?:${pattern})(?![\\p{L}\\d])`, 'uy'),
});

const RU = 'orthodox';
const EN = 'western';

export const HOLIDAYS: readonly Holiday[] = [
  holiday('Новый год', RU, fixed(1, 1), 'нов(?:ый|ого|ым|ом) год(?:а|ом|у)?'),
  holiday('Рождественский сочельник', RU, fixed(1, 6, [12, 24]), '(?:рождественск(?:ий|ого|им) )?сочельник(?:а|ом|у)?'),
  holiday('Рождество', RU, fixed(1, 7, [12, 25]), 'рождеств(?:о|а|у|ом|е)(?: христов(?:о|а|у|ом))?'),
  holiday('Крещение', RU, fixed(1, 19, [1, 6]), 'крещени(?:е|я|ю|ем)(?: господн(?:е|я|ю))?|крещенье'),
  holiday('День защитника Отечества', RU, fixed(2, 23), 'д(?:ень|ня|ню|нем) защитника отечества'),
  holiday('Международный женский день', RU, fixed(3, 8), '(?:международн(?:ый|ого|ому|ым) )?женск(?:ий|ого|ому|им) д(?:ень|ня|ню|нем)'),
  holiday('Праздник Весны и Труда', RU, fixed(5, 1), '(?:праздник(?:а|у|ом)?|д(?:ень|ня|ню|нем)) весны и труда'),
  holiday('День Победы', RU, fixed(5, 9), 'д(?:ень|ня|ню|нем) победы'),
  holiday('День России', RU, fixed(6, 12), 'д(?:ень|ня|ню|нем) россии'),
  holiday('День знаний', RU, fixed(9, 1), 'д(?:ень|ня|ню|нем) знаний'),
  holiday('День народного единства', RU, fixed(11, 4), 'д(?:ень|ня|ню|нем) народного единства'),
  holiday('День святого Валентина', RU, fixed(2, 14), 'д(?:ень|ня|ню|нем) (?:святого )?валентина'),
  holiday('Масленица', RU, easter(-55, -54, -53, -52, -51, -50, -49), 'маслениц(?:а|ы|у|е|ей)|масленичн(?:ая|ой|ую) недел(?:я|и|ю|е)'),
  holiday('Прощёное воскресенье', RU, easter(-49), 'прощен(?:ое|ого|ому|ым) воскресень(?:е|я|ю|ем)'),
  holiday('Чистый понедельник', RU, easter(-48), 'чист(?:ый|ого|ому|ым) понедельник(?:а|у|ом)?'),
  holiday('Вербное воскресенье', RU, easter(-7), 'вербн(?:ое|ого|ому|ым) воскресень(?:е|я|ю|ем)|вход(?:а|у)? господ(?:ень|ня|ню) в иерусалим'),
  holiday('Чистый четверг', RU, easter(-3), '(?:чист|велик)(?:ий|ого|ому|им) четверг(?:а|у|ом)?'),
  holiday('Страстная пятница', RU, easter(-2), '(?:страстн|велик)(?:ая|ой|ую) пятниц(?:а|ы|у|е)'),
  holiday('Великая суббота', RU, easter(-1), 'велик(?:ая|ой|ую) суббот(?:а|ы|у|е)'),
  holiday('Красная горка', RU, easter(7), 'красн(?:ая|ой|ую) горк(?:а|и|у|е)|фомин(?:о|а|у) воскресень(?:е|я|ю)'),
  holiday('Радоница', RU, easter(9), 'радониц(?:а|ы|у|е)'),
  holiday('Вознесение', RU, easter(39), 'вознесени(?:е|я|ю|ем)(?: господн(?:е|я|ю))?'),
  holiday('Троица', RU, easter(49), '(?:д(?:ень|ня|ню|нем) )?(?:святой )?троиц(?:а|ы|у|е)|пятидесятниц(?:а|ы|у|е)'),
  holiday('Духов день', RU, easter(50), 'духов(?:а)? д(?:ень|ня|ню|нем)'),
  holiday("New Year's Day", EN, fixed(1, 1), "new year(?:'?s)?(?: day)?"),
  holiday("New Year's Eve", EN, fixed(12, 31), "new year(?:'?s)? eve"),
  holiday('Christmas Eve', EN, fixed(1, 6, [12, 24]), 'christmas eve'),
  holiday('Christmas', EN, fixed(1, 7, [12, 25]), 'christmas(?: day)?|xmas'),
  holiday('Epiphany', EN, fixed(1, 19, [1, 6]), 'epiphany'),
  holiday("Valentine's Day", EN, fixed(2, 14), "(?:st\\.? )?valentine(?:'?s)? day"),
  holiday('Halloween', EN, fixed(10, 31), 'halloween'),
  holiday('Shrove Tuesday', EN, easter(-47), 'shrove tuesday|pancake day|mardi gras'),
  holiday('Ash Wednesday', EN, easter(-46), 'ash wednesday'),
  holiday('Palm Sunday', EN, easter(-7), 'palm sunday'),
  holiday('Maundy Thursday', EN, easter(-3), 'maundy thursday|holy thursday'),
  holiday('Good Friday', EN, easter(-2), 'good friday'),
  holiday('Holy Saturday', EN, easter(-1), 'holy saturday'),
  holiday('Easter Monday', EN, easter(1), 'easter monday'),
  holiday('Ascension Day', EN, easter(39), 'ascension(?: day)?'),
  holiday('Pentecost', EN, easter(49), 'pentecost|whit sunday|whitsun'),
  holiday('Whit Monday', EN, easter(50), 'whit monday'),
  holiday('Corpus Christi', EN, easter(60), 'corpus christi'),
];

export const matchHoliday = (text: string, index: number): { readonly holiday: Holiday; readonly length: number } | null => {
  let best: { readonly holiday: Holiday; readonly length: number } | null = null;
  for (const entry of HOLIDAYS) {
    entry.pattern.lastIndex = index;
    const match = entry.pattern.exec(text);
    if (match !== null && (best === null || match[0].length > best.length)) best = { holiday: entry, length: match[0].length };
  }
  return best;
};
