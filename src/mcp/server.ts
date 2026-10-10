import { parseCron } from '../cron.js';
import { describe } from '../describe.js';
import { CronsenseError } from '../errors.js';
import { nextRuns } from '../next.js';
import { parse, toRRule } from '../parser.js';
import { toSystemd } from '../systemd.js';
import type { Schedule, Weekday } from '../types.js';
import { when } from '../when.js';

export type Json = null | boolean | number | string | readonly Json[] | { readonly [key: string]: Json };

type Id = string | number;

export type Response =
  | { readonly jsonrpc: '2.0'; readonly id: Id; readonly result: Json }
  | { readonly jsonrpc: '2.0'; readonly id: Id | null; readonly error: { readonly code: number; readonly message: string } };

interface ToolResult {
  readonly content: readonly { readonly type: 'text'; readonly text: string }[];
  readonly structuredContent?: { readonly [key: string]: Json };
  readonly isError: boolean;
}

const SUPPORTED_VERSIONS: readonly string[] = ['2025-06-18', '2025-03-26', '2024-11-05'];

const PARSE_ERROR = -32700;
const INVALID_REQUEST = -32600;
const METHOD_NOT_FOUND = -32601;
const INVALID_PARAMS = -32602;

const TOOLS: Json = [
  {
    name: 'to_cron',
    title: 'Schedule text to cron',
    description:
      'Convert a plain Russian or English schedule description (e.g. "по будням в 9:30", "every 15 minutes from 9am to 6pm on weekdays") into a 5-field cron expression. Deterministic; fails instead of guessing when cron cannot express the schedule exactly.',
    inputSchema: {
      type: 'object',
      properties: {
        text: { type: 'string', description: 'Schedule description in Russian or English' },
        weeklyOn: { type: 'integer', minimum: 0, maximum: 6, description: 'Weekday for "weekly" (0 = Sunday, default)' },
        strictHours: { type: 'boolean', description: 'Reject hours 1-12 without morning/evening or am/pm instead of assuming morning' },
        locale: { type: 'string', enum: ['ru', 'en'], description: 'Language of the returned description (default en)' },
      },
      required: ['text'],
      additionalProperties: false,
    },
  },
  {
    name: 'to_rrule',
    title: 'Schedule text to RRULE',
    description:
      'Convert a Russian or English schedule description into an iCalendar RRULE (RFC 5545). Supports what cron cannot: every N weeks, the last day of the month, the Nth weekday.',
    inputSchema: {
      type: 'object',
      properties: {
        text: { type: 'string', description: 'Schedule description in Russian or English' },
        weeklyOn: { type: 'integer', minimum: 0, maximum: 6, description: 'Weekday for "weekly" (0 = Sunday, default)' },
        strictHours: { type: 'boolean', description: 'Reject hours 1-12 without morning/evening or am/pm instead of assuming morning' },
      },
      required: ['text'],
      additionalProperties: false,
    },
  },
  {
    name: 'to_systemd',
    title: 'Schedule text to systemd OnCalendar',
    description: 'Convert a Russian or English schedule description into systemd timer OnCalendar= values, one per line.',
    inputSchema: {
      type: 'object',
      properties: {
        text: { type: 'string', description: 'Schedule description in Russian or English' },
        strictHours: { type: 'boolean', description: 'Reject hours 1-12 without morning/evening or am/pm instead of assuming morning' },
      },
      required: ['text'],
      additionalProperties: false,
    },
  },
  {
    name: 'describe_cron',
    title: 'Describe cron',
    description:
      'Describe a cron expression in natural Russian or English. The description can be parsed back by to_cron into an equivalent schedule.',
    inputSchema: {
      type: 'object',
      properties: {
        cron: { type: 'string', description: '5-field cron expression or macro such as @daily' },
        locale: { type: 'string', enum: ['ru', 'en'], description: 'Output language (default en)' },
      },
      required: ['cron'],
      additionalProperties: false,
    },
  },
  {
    name: 'next_runs',
    title: 'Next cron runs',
    description: 'List the upcoming run times of a cron expression as ISO 8601 timestamps.',
    inputSchema: {
      type: 'object',
      properties: {
        cron: { type: 'string', description: '5-field cron expression or macro such as @daily' },
        count: { type: 'integer', minimum: 1, maximum: 100, description: 'Number of runs (default 5)' },
        from: { type: 'string', description: 'ISO 8601 start time, exclusive (default now)' },
        timezone: { type: 'string', enum: ['utc', 'local'], description: 'Time zone for computing runs (default utc)' },
      },
      required: ['cron'],
      additionalProperties: false,
    },
  },
  {
    name: 'when',
    title: 'One-time moment',
    description:
      'Resolve a one-time Russian or English phrase such as "через 4 часа", "завтра в 12:17" or "in 3 days at 5pm" to an ISO 8601 timestamp. A recurring phrase resolves to its next run. Use it for reminders instead of computing dates by hand.',
    inputSchema: {
      type: 'object',
      properties: {
        text: { type: 'string', description: 'Phrase in Russian or English' },
        now: { type: 'string', description: 'ISO 8601 moment the phrase is relative to (default now)' },
        timezone: { type: 'string', enum: ['utc', 'local'], description: 'Time zone for calendar arithmetic and times of day (default utc)' },
      },
      required: ['text'],
      additionalProperties: false,
    },
  },
];

class ParamsError extends Error {}

type Args = { readonly [key: string]: Json };

const isRecord = (value: unknown): value is { readonly [key: string]: unknown } =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isId = (value: unknown): value is Id => typeof value === 'string' || (typeof value === 'number' && Number.isFinite(value));

const requiredString = (args: Args, key: string): string => {
  const value = args[key];
  if (typeof value !== 'string' || value.trim() === '') throw new ParamsError(`"${key}" must be a non-empty string`);
  return value;
};

const optionalInteger = (args: Args, key: string, min: number, max: number): number | undefined => {
  const value = args[key];
  if (value === undefined) return undefined;
  if (typeof value !== 'number' || !Number.isInteger(value) || value < min || value > max) {
    throw new ParamsError(`"${key}" must be an integer between ${min} and ${max}`);
  }
  return value;
};

const optionalEnum = <T extends string>(args: Args, key: string, allowed: readonly T[]): T | undefined => {
  const value = args[key];
  if (value === undefined) return undefined;
  const match = allowed.find((option) => option === value);
  if (match === undefined) throw new ParamsError(`"${key}" must be one of ${allowed.join(', ')}`);
  return match;
};

const success = (text: string, structured: { readonly [key: string]: Json }): ToolResult => ({
  content: [{ type: 'text', text }],
  structuredContent: structured,
  isError: false,
});

const failure = (error: CronsenseError): ToolResult => ({
  content: [{ type: 'text', text: `${error.code}: ${error.message}\n${error.excerpt}` }],
  structuredContent: { code: error.code, message: error.message, span: error.span === null ? null : { ...error.span } },
  isError: true,
});

const summary = (schedule: Schedule, locale: 'ru' | 'en'): { readonly [key: string]: Json } => ({
  cron: schedule.cron,
  description: describe(schedule, { locale }),
});

const callTool = (name: string, args: Args): ToolResult => {
  switch (name) {
    case 'to_cron': {
      const text = requiredString(args, 'text');
      const weeklyOn = optionalInteger(args, 'weeklyOn', 0, 6) as Weekday | undefined;
      const locale = optionalEnum(args, 'locale', ['ru', 'en'] as const) ?? 'en';
      const strict = args['strictHours'];
      if (strict !== undefined && typeof strict !== 'boolean') throw new ParamsError('"strictHours" must be a boolean');
      const schedule = parse(text, { strictHours: strict === true, ...(weeklyOn === undefined ? {} : { weeklyOn }) });
      const result = summary(schedule, locale);
      return success(`${schedule.cron}\n${String(result['description'])}`, result);
    }
    case 'to_rrule': {
      const text = requiredString(args, 'text');
      const weeklyOn = optionalInteger(args, 'weeklyOn', 0, 6) as Weekday | undefined;
      const strict = args['strictHours'];
      if (strict !== undefined && typeof strict !== 'boolean') throw new ParamsError('"strictHours" must be a boolean');
      const rrule = toRRule(text, { strictHours: strict === true, ...(weeklyOn === undefined ? {} : { weeklyOn }) });
      return success(rrule, { rrule });
    }
    case 'to_systemd': {
      const text = requiredString(args, 'text');
      const strict = args['strictHours'];
      if (strict !== undefined && typeof strict !== 'boolean') throw new ParamsError('"strictHours" must be a boolean');
      const lines = toSystemd(text, { strictHours: strict === true });
      return success(lines.map((line) => `OnCalendar=${line}`).join('\n'), { onCalendar: lines });
    }
    case 'describe_cron': {
      const schedule = parseCron(requiredString(args, 'cron'));
      const locale = optionalEnum(args, 'locale', ['ru', 'en'] as const) ?? 'en';
      const result = summary(schedule, locale);
      return success(String(result['description']), result);
    }
    case 'next_runs': {
      const schedule = parseCron(requiredString(args, 'cron'));
      const count = optionalInteger(args, 'count', 1, 100) ?? 5;
      const timezone = optionalEnum(args, 'timezone', ['utc', 'local'] as const) ?? 'utc';
      const fromRaw = args['from'];
      if (fromRaw !== undefined && typeof fromRaw !== 'string') throw new ParamsError('"from" must be an ISO 8601 string');
      const from = fromRaw === undefined ? new Date() : new Date(fromRaw);
      if (Number.isNaN(from.getTime())) throw new ParamsError('"from" is not a valid date');
      const runs = nextRuns(schedule, { count, from, timezone }).map((run) => run.toISOString());
      return success(runs.join('\n'), { cron: schedule.cron, runs });
    }
    case 'when': {
      const text = requiredString(args, 'text');
      const timezone = optionalEnum(args, 'timezone', ['utc', 'local'] as const) ?? 'utc';
      const nowRaw = args['now'];
      if (nowRaw !== undefined && typeof nowRaw !== 'string') throw new ParamsError('"now" must be an ISO 8601 string');
      const now = nowRaw === undefined ? new Date() : new Date(nowRaw);
      if (Number.isNaN(now.getTime())) throw new ParamsError('"now" is not a valid date');
      const moment = when(text, { now, timezone }).toISOString();
      return success(moment, { moment });
    }
    default:
      throw new ParamsError(`Unknown tool "${name}"`);
  }
};

const toJson = (value: unknown): Json => JSON.parse(JSON.stringify(value)) as Json;

const ok = (id: Id, result: Json): Response => ({ jsonrpc: '2.0', id, result });

const fail = (id: Id | null, code: number, message: string): Response => ({ jsonrpc: '2.0', id, error: { code, message } });

export interface ServerInfo {
  readonly name: string;
  readonly version: string;
}

export const handleMessage = (message: unknown, info: ServerInfo): Response | null => {
  if (!isRecord(message) || message['jsonrpc'] !== '2.0' || typeof message['method'] !== 'string') {
    const id = isRecord(message) && isId(message['id']) ? message['id'] : null;
    return fail(id, INVALID_REQUEST, 'Invalid JSON-RPC request');
  }

  const method = message['method'];
  const rawId = message['id'];
  if (rawId === undefined) return null;
  if (!isId(rawId)) return fail(null, INVALID_REQUEST, 'Invalid request id');
  const params = message['params'] ?? {};
  if (!isRecord(params)) return fail(rawId, INVALID_PARAMS, 'params must be an object');

  switch (method) {
    case 'initialize': {
      const requested = params['protocolVersion'];
      const protocolVersion =
        typeof requested === 'string' && SUPPORTED_VERSIONS.includes(requested) ? requested : (SUPPORTED_VERSIONS[0] ?? '2025-06-18');
      return ok(rawId, {
        protocolVersion,
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: info.name, version: info.version },
        instructions:
          'Use to_cron to turn schedule descriptions into cron, describe_cron to explain cron expressions, next_runs to preview run times, when to resolve one-time phrases like «через 4 часа». Never guess cron by hand when these tools are available.',
      });
    }
    case 'ping':
      return ok(rawId, {});
    case 'tools/list':
      return ok(rawId, { tools: TOOLS });
    case 'tools/call': {
      const name = params['name'];
      const args = params['arguments'] ?? {};
      if (typeof name !== 'string') return fail(rawId, INVALID_PARAMS, 'Tool name must be a string');
      if (!isRecord(args)) return fail(rawId, INVALID_PARAMS, 'Tool arguments must be an object');
      try {
        return ok(rawId, toJson(callTool(name, toJson(args) as Args)));
      } catch (error: unknown) {
        if (error instanceof CronsenseError) return ok(rawId, toJson(failure(error)));
        if (error instanceof ParamsError) return fail(rawId, INVALID_PARAMS, error.message);
        throw error;
      }
    }
    default:
      return fail(rawId, METHOD_NOT_FOUND, `Method "${method}" not found`);
  }
};

export const handleLine = (line: string, info: ServerInfo): Response | null => {
  let message: unknown;
  try {
    message = JSON.parse(line);
  } catch {
    return fail(null, PARSE_ERROR, 'Parse error');
  }
  return handleMessage(message, info);
};
