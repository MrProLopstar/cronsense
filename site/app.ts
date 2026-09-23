import { formatField, FIELD_ORDER } from '../src/field.js';
import { CronsenseError, describe, nextRuns, parse, parseCron, type ErrorCode, type FieldName, type Locale, type Schedule } from '../src/index.js';

type Mode = 'text' | 'cron';

interface Strings {
  readonly tagline: string;
  readonly modeText: string;
  readonly modeCron: string;
  readonly inputLabel: { readonly [M in Mode]: string };
  readonly copy: string;
  readonly copied: string;
  readonly nextRuns: string;
  readonly install: string;
  readonly footer: string;
  readonly fields: { readonly [F in FieldName]: string };
  readonly examples: readonly string[];
  readonly errors: { readonly [C in ErrorCode]: string };
}

const CRON_EXAMPLES: readonly string[] = ['30 9 * * 1-5', '*/15 9-17 * * 1-5', '0 8-20/2 * * *', '0 10 15 1 *', '0 23 * * 0,1,5,6', '5-59/10 * * * *'];

const STRINGS: { readonly [L in Locale]: Strings } = {
  ru: {
    tagline: 'Расписания на русском и английском → cron и обратно. Без LLM, детерминированно.',
    modeText: 'Текст → cron',
    modeCron: 'cron → текст',
    inputLabel: { text: 'Опишите расписание словами', cron: 'Введите cron-выражение' },
    copy: 'Копировать',
    copied: 'Скопировано',
    nextRuns: 'Ближайшие запуски',
    install: 'Установка',
    footer: 'MIT · <a href="https://github.com/MrProLopstar/cronsense">исходный код</a>',
    fields: { minute: 'минута', hour: 'час', dayOfMonth: 'число', month: 'месяц', dayOfWeek: 'день недели' },
    examples: ['по будням в 9:30', 'каждые 15 минут с 9 до 18 по будням', '1 и 15 числа в полдень', 'с ноября по февраль в 7 утра', 'каждый час в 15 минут', 'по понедельникам и со среды по пятницу в 9'],
    errors: {
      EMPTY_INPUT: 'Пустой ввод',
      UNKNOWN_WORD: 'Незнакомое слово',
      UNEXPECTED_TOKEN: 'Не удалось разобрать фразу',
      UNEXPECTED_END: 'Фраза обрывается',
      OUT_OF_RANGE: 'Значение вне допустимого диапазона',
      AMBIGUOUS: 'Неоднозначно: время это или число месяца?',
      CONFLICT: 'Части расписания противоречат друг другу',
      INCOMPLETE: 'Не хватает части расписания',
      UNSUPPORTED: 'Cron не умеет выражать это точно',
      INVALID_CRON: 'Некорректное cron-выражение',
    },
  },
  en: {
    tagline: 'Plain Russian or English schedules → cron and back. No LLM, fully deterministic.',
    modeText: 'Text → cron',
    modeCron: 'cron → text',
    inputLabel: { text: 'Describe a schedule in words', cron: 'Enter a cron expression' },
    copy: 'Copy',
    copied: 'Copied',
    nextRuns: 'Next runs',
    install: 'Install',
    footer: 'MIT · <a href="https://github.com/MrProLopstar/cronsense">source code</a>',
    fields: { minute: 'minute', hour: 'hour', dayOfMonth: 'day of month', month: 'month', dayOfWeek: 'weekday' },
    examples: ['weekdays at 9:30am', 'every 15 minutes from 9am to 6pm on weekdays', 'on the 1st and 15th at noon', 'every other day at noon', 'every hour at 15 minutes past', 'mon, wed and fri at 6pm'],
    errors: {
      EMPTY_INPUT: 'Empty input',
      UNKNOWN_WORD: 'Unknown word',
      UNEXPECTED_TOKEN: 'Could not parse the phrase',
      UNEXPECTED_END: 'The phrase ends too early',
      OUT_OF_RANGE: 'Value out of range',
      AMBIGUOUS: 'Ambiguous: is it a time or a day of month?',
      CONFLICT: 'Parts of the schedule contradict each other',
      INCOMPLETE: 'Part of the schedule is missing',
      UNSUPPORTED: 'Cron cannot express this exactly',
      INVALID_CRON: 'Invalid cron expression',
    },
  },
};

const element = <T extends HTMLElement>(id: string, type: abstract new () => T): T => {
  const found = document.getElementById(id);
  if (!(found instanceof type)) throw new Error(`Element #${id} is missing`);
  return found;
};

const input = element('input', HTMLInputElement);
const examples = element('examples', HTMLDivElement);
const result = element('result', HTMLDivElement);
const cron = element('cron', HTMLElement);
const copy = element('copy', HTMLButtonElement);
const description = element('description', HTMLParagraphElement);
const fields = element('fields', HTMLDivElement);
const runs = element('runs', HTMLOListElement);
const error = element('error', HTMLDivElement);
const errorTitle = element('error-title', HTMLElement);
const errorExcerpt = element('error-excerpt', HTMLPreElement);

const isMode = (value: string | null | undefined): value is Mode => value === 'text' || value === 'cron';
const isLocale = (value: string | null | undefined): value is Locale => value === 'ru' || value === 'en';

const hash = new URLSearchParams(location.hash.slice(1));
const initialLang = hash.get('lang');
const initialMode = hash.get('mode');

const state: { mode: Mode; lang: Locale; schedule: Schedule | null } = {
  mode: isMode(initialMode) ? initialMode : 'text',
  lang: isLocale(initialLang) ? initialLang : navigator.language.toLowerCase().startsWith('ru') ? 'ru' : 'en',
  schedule: null,
};

const strings = (): Strings => STRINGS[state.lang];

const syncHash = (): void => {
  const params = new URLSearchParams({ mode: state.mode, lang: state.lang, q: input.value });
  history.replaceState(null, '', `#${params.toString()}`);
};

const renderChrome = (): void => {
  const text = strings();
  document.documentElement.lang = state.lang;
  for (const node of document.querySelectorAll<HTMLElement>('[data-i18n]')) {
    const key = node.dataset['i18n'];
    if (key === 'tagline' || key === 'modeText' || key === 'modeCron' || key === 'copy' || key === 'nextRuns' || key === 'install') {
      node.textContent = text[key];
    } else if (key === 'inputLabel') {
      node.textContent = text.inputLabel[state.mode];
    }
  }
  for (const node of document.querySelectorAll<HTMLElement>('[data-i18n-html="footer"]')) node.innerHTML = text.footer;
  for (const button of document.querySelectorAll<HTMLButtonElement>('[data-lang]')) {
    button.setAttribute('aria-pressed', String(button.dataset['lang'] === state.lang));
  }
  for (const button of document.querySelectorAll<HTMLButtonElement>('[data-mode]')) {
    button.setAttribute('aria-pressed', String(button.dataset['mode'] === state.mode));
  }
  input.classList.toggle('mono', state.mode === 'cron');
  examples.replaceChildren(
    ...(state.mode === 'text' ? text.examples : CRON_EXAMPLES).map((example) => {
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.textContent = example;
      chip.addEventListener('click', () => {
        input.value = example;
        update();
      });
      return chip;
    }),
  );
};

const formatRun = (date: Date): string =>
  new Intl.DateTimeFormat(state.lang === 'ru' ? 'ru-RU' : 'en-US', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);

const showSchedule = (schedule: Schedule): void => {
  const text = strings();
  cron.textContent = schedule.cron;
  description.textContent = describe(schedule, { locale: state.lang });
  fields.replaceChildren(
    ...FIELD_ORDER.map((name) => {
      const box = document.createElement('div');
      box.className = 'field';
      const value = document.createElement('b');
      value.textContent = formatField(name, schedule.fields[name]);
      const label = document.createElement('span');
      label.textContent = text.fields[name];
      box.append(value, label);
      return box;
    }),
  );
  runs.replaceChildren(
    ...nextRuns(schedule, { count: 5 }).map((run) => {
      const item = document.createElement('li');
      item.textContent = formatRun(run);
      return item;
    }),
  );
  result.hidden = false;
  error.hidden = true;
};

const showError = (failure: CronsenseError): void => {
  errorTitle.textContent = `${strings().errors[failure.code]} · ${failure.message}`;
  const span = failure.span;
  if (span === null) {
    errorExcerpt.textContent = failure.input;
  } else {
    const mark = document.createElement('mark');
    mark.textContent = failure.input.slice(span.start, span.end) || ' ';
    errorExcerpt.replaceChildren(failure.input.slice(0, span.start), mark, failure.input.slice(span.end));
  }
  result.hidden = true;
  error.hidden = false;
};

const update = (): void => {
  syncHash();
  const value = input.value.trim();
  state.schedule = null;
  if (value === '') {
    result.hidden = true;
    error.hidden = true;
    return;
  }
  try {
    state.schedule = state.mode === 'text' ? parse(value) : parseCron(value);
    showSchedule(state.schedule);
  } catch (failure: unknown) {
    if (!(failure instanceof CronsenseError)) throw failure;
    showError(failure);
  }
};

const switchMode = (mode: Mode): void => {
  if (mode === state.mode) return;
  const schedule = state.schedule;
  state.mode = mode;
  if (schedule !== null) input.value = mode === 'cron' ? schedule.cron : describe(schedule, { locale: state.lang });
  else input.value = '';
  renderChrome();
  update();
};

const switchLang = (lang: Locale): void => {
  if (lang === state.lang) return;
  state.lang = lang;
  if (state.mode === 'text' && state.schedule !== null) input.value = describe(state.schedule, { locale: lang });
  renderChrome();
  update();
};

for (const button of document.querySelectorAll<HTMLButtonElement>('[data-mode]')) {
  button.addEventListener('click', () => {
    const mode = button.dataset['mode'];
    if (isMode(mode)) switchMode(mode);
  });
}

for (const button of document.querySelectorAll<HTMLButtonElement>('[data-lang]')) {
  button.addEventListener('click', () => {
    const lang = button.dataset['lang'];
    if (isLocale(lang)) switchLang(lang);
  });
}

copy.addEventListener('click', () => {
  const value = state.schedule?.cron;
  if (value === undefined) return;
  void navigator.clipboard.writeText(value).then(() => {
    copy.textContent = strings().copied;
    setTimeout(() => {
      copy.textContent = strings().copy;
    }, 1500);
  });
});

input.addEventListener('input', update);

input.value = hash.get('q') ?? (state.mode === 'text' ? strings().examples : CRON_EXAMPLES)[0] ?? '';
renderChrome();
update();
input.focus();
