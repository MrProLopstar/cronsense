#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { createInterface } from 'node:readline';
import { handleLine, type ServerInfo } from './mcp/server.js';

const readVersion = (): string => {
  const raw: unknown = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
  return typeof raw === 'object' && raw !== null && 'version' in raw && typeof raw.version === 'string' ? raw.version : '0.0.0';
};

const info: ServerInfo = { name: 'cronsense', version: readVersion() };

const lines = createInterface({ input: process.stdin, crlfDelay: Number.POSITIVE_INFINITY });

lines.on('line', (line) => {
  if (line.trim() === '') return;
  try {
    const response = handleLine(line, info);
    if (response !== null) process.stdout.write(`${JSON.stringify(response)}\n`);
  } catch (error: unknown) {
    process.stderr.write(`cronsense-mcp: ${error instanceof Error ? error.message : String(error)}\n`);
  }
});

lines.on('close', () => {
  process.exitCode = 0;
});
