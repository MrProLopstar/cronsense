#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { CronsenseError } from './errors.js';
import { nextRuns } from './next.js';
import { parse } from './parser.js';
import { parseCron } from './cron.js';
import type { Schedule, Timezone, Weekday } from './types.js';

const USAGE = `Usage: cronsense [options] <schedule...>

Examples:
  cronsense "по будням в 9:30"
  cronsense -n 3 "every 15 minutes from 9 to 18 on weekdays"
  cronsense --cron -n 5 "0 9 * * 1-5"

Options:
  -n, --next <count>   Print the next <count> run times
      --utc            Compute run times in UTC instead of local time
      --cron           Treat input as a cron expression
      --weekly-on <d>  Weekday for "weekly" (0-6, Sunday = 0; default 0)
      --json           Print machine-readable JSON
  -h, --help           Show this help
  -v, --version        Show version`;

const version = (): string => {
  const raw: unknown = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
  return typeof raw === 'object' && raw !== null && 'version' in raw && typeof raw.version === 'string' ? raw.version : '0.0.0';
};

const toInteger = (raw: string | undefined, flag: string, min: number, max: number): number | undefined => {
  if (raw === undefined) return undefined;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new RangeError(`${flag} must be an integer between ${min} and ${max}`);
  }
  return value;
};

const formatDate = (date: Date, timezone: Timezone): string => {
  if (timezone === 'utc') return date.toISOString().replace(/:\d{2}\.\d{3}Z$/, 'Z');
  const pad = (value: number): string => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
};

const main = (argv: readonly string[]): number => {
  const { values, positionals } = parseArgs({
    args: [...argv],
    allowPositionals: true,
    options: {
      next: { type: 'string', short: 'n' },
      utc: { type: 'boolean', default: false },
      cron: { type: 'boolean', default: false },
      'weekly-on': { type: 'string' },
      json: { type: 'boolean', default: false },
      help: { type: 'boolean', short: 'h', default: false },
      version: { type: 'boolean', short: 'v', default: false },
    },
  });

  if (values.help) {
    process.stdout.write(`${USAGE}\n`);
    return 0;
  }
  if (values.version) {
    process.stdout.write(`${version()}\n`);
    return 0;
  }

  const input = positionals.join(' ').trim();
  if (input.length === 0) {
    process.stderr.write(`${USAGE}\n`);
    return 2;
  }

  const count = toInteger(values.next, '--next', 1, 1000);
  const weeklyOn = toInteger(values['weekly-on'], '--weekly-on', 0, 6) as Weekday | undefined;
  const timezone: Timezone = values.utc ? 'utc' : 'local';
  const schedule: Schedule = values.cron ? parseCron(input) : parse(input, weeklyOn === undefined ? {} : { weeklyOn });
  const runs = count === undefined ? [] : nextRuns(schedule, { count, timezone });

  if (values.json) {
    const payload = { cron: schedule.cron, fields: schedule.fields, next: runs.map((run) => run.toISOString()) };
    process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
    return 0;
  }

  process.stdout.write(`${schedule.cron}\n`);
  for (const run of runs) process.stdout.write(`  ${formatDate(run, timezone)}\n`);
  return 0;
};

try {
  process.exitCode = main(process.argv.slice(2));
} catch (error: unknown) {
  if (error instanceof CronsenseError) {
    process.stderr.write(`error [${error.code}]: ${error.message}\n${error.excerpt}\n`);
    process.exitCode = 1;
  } else if (error instanceof Error) {
    process.stderr.write(`error: ${error.message}\n`);
    process.exitCode = 2;
  } else {
    throw error;
  }
}
