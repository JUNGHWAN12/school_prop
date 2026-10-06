import { serve } from '@hono/node-server';
import { readFileSync } from 'node:fs';
import { createApp } from './app';
import type { Env } from './env';

// 의존성 없이 .env 로드 (로컬 개발 전용)
try {
  for (const line of readFileSync(new URL('../.env', import.meta.url), 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z_]+)\s*=\s*(.*)\s*$/);
    if (m && !line.trim().startsWith('#') && !(m[1] in process.env)) process.env[m[1]] = m[2];
  }
} catch { /* .env 없음 */ }

const app = createApp(() => process.env as Env);
serve({ fetch: app.fetch, port: 8787 }, (i) => console.log(`API http://localhost:${i.port}`));
