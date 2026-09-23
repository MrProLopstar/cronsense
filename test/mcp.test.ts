import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { handleLine, handleMessage, type Json, type Response } from '../src/mcp/server.js';

const info = { name: 'cronsense', version: '0.0.0-test' };

const request = (id: number, method: string, params?: Json): Response | null =>
  handleMessage({ jsonrpc: '2.0', id, method, ...(params === undefined ? {} : { params }) }, info);

const resultOf = (response: Response | null): Json => {
  if (response === null || !('result' in response)) throw new Error(`Expected a result, got ${JSON.stringify(response)}`);
  return response.result;
};

const call = (name: string, args: Json): Json => resultOf(request(1, 'tools/call', { name, arguments: args }));

describe('mcp server', () => {
  it('negotiates the protocol version', () => {
    expect(resultOf(request(1, 'initialize', { protocolVersion: '2025-03-26' }))).toMatchObject({
      protocolVersion: '2025-03-26',
      capabilities: { tools: { listChanged: false } },
      serverInfo: info,
    });
    expect(resultOf(request(2, 'initialize', { protocolVersion: '1999-01-01' }))).toMatchObject({ protocolVersion: '2025-06-18' });
  });

  it('lists tools', () => {
    const result = resultOf(request(1, 'tools/list'));
    expect(JSON.stringify(result)).toContain('"to_cron"');
    expect(JSON.stringify(result)).toContain('"describe_cron"');
    expect(JSON.stringify(result)).toContain('"next_runs"');
  });

  it('converts text to cron', () => {
    expect(call('to_cron', { text: 'по будням в 9:30', locale: 'ru' })).toEqual({
      content: [{ type: 'text', text: '30 9 * * 1-5\nпо будням в 9:30' }],
      structuredContent: { cron: '30 9 * * 1-5', description: 'по будням в 9:30' },
      isError: false,
    });
  });

  it('describes cron', () => {
    expect(call('describe_cron', { cron: '0 12 1,15 * *' })).toMatchObject({
      structuredContent: { cron: '0 12 1,15 * *', description: 'on the 1st and 15th at noon' },
      isError: false,
    });
  });

  it('lists next runs', () => {
    expect(call('next_runs', { cron: '30 9 * * 1-5', count: 2, from: '2026-09-23T10:00:00Z' })).toMatchObject({
      structuredContent: { runs: ['2026-09-24T09:30:00.000Z', '2026-09-25T09:30:00.000Z'] },
      isError: false,
    });
  });

  it('reports schedule errors as tool errors', () => {
    expect(call('to_cron', { text: 'по будням кроме пятницы' })).toMatchObject({
      structuredContent: { code: 'UNSUPPORTED', span: { start: 10, end: 15 } },
      isError: true,
    });
  });

  it.each([
    ['to_cron', {}],
    ['to_cron', { text: 42 }],
    ['describe_cron', { cron: '* * * * *', locale: 'de' }],
    ['next_runs', { cron: '* * * * *', count: 0 }],
    ['next_runs', { cron: '* * * * *', from: 'yesterday' }],
    ['missing_tool', {}],
  ] as const)('rejects invalid params for %s %j', (name, args) => {
    expect(request(1, 'tools/call', { name, arguments: args })).toMatchObject({ error: { code: -32602 } });
  });

  it('handles protocol edge cases', () => {
    expect(handleMessage({ jsonrpc: '2.0', method: 'notifications/initialized' }, info)).toBeNull();
    expect(resultOf(request(1, 'ping'))).toEqual({});
    expect(request(1, 'resources/list')).toMatchObject({ error: { code: -32601 } });
    expect(handleMessage({ id: 1, method: 'ping' }, info)).toMatchObject({ id: 1, error: { code: -32600 } });
    expect(handleMessage([], info)).toMatchObject({ id: null, error: { code: -32600 } });
    expect(handleMessage({ jsonrpc: '2.0', id: { bad: true }, method: 'ping' }, info)).toMatchObject({ error: { code: -32600 } });
    expect(handleMessage({ jsonrpc: '2.0', id: 1, method: 'ping', params: [] }, info)).toMatchObject({ error: { code: -32602 } });
    expect(handleLine('{not json', info)).toMatchObject({ id: null, error: { code: -32700 } });
  });
});

describe('mcp stdio binary', () => {
  it('answers over stdin/stdout', async () => {
    const entry = fileURLToPath(new URL('../dist/mcp.js', import.meta.url));
    const child = spawn(process.execPath, [entry], { stdio: ['pipe', 'pipe', 'pipe'] });
    const output: string[] = [];
    child.stdout.setEncoding('utf8').on('data', (chunk: string) => output.push(chunk));
    child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18' } })}\n`);
    child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' })}\n`);
    child.stdin.end(`${JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'to_cron', arguments: { text: 'hourly' } } })}\n`);
    await new Promise<void>((resolve) => child.on('close', () => resolve()));
    const responses = output.join('').trim().split('\n').map((line) => JSON.parse(line) as { id: number });
    expect(responses.map((response) => response.id)).toEqual([1, 2]);
    expect(JSON.stringify(responses[1])).toContain('0 * * * *');
  });
});
