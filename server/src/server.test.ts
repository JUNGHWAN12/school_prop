import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from './app';
import { ExtractionFailed, extractQuote, resetBreaker } from './router';
import type { Env } from './env';

const env: Env = { UPSTAGE_API_KEY: 'u', GEMINI_API_KEY: 'g' };
const file = () => new File(['x'], 'q.pdf', { type: 'application/pdf' });
const ocrText = '견적서 담당 010-1234-5678 농협 301-1234-5678-91\n책 2 15300 30600';
const good = { vat_mode: 'exempt', items: [{ item_name: '책', quantity: 2, unit_price: 15300, line_amount: 30600 }] };

const ocrRes = () => new Response(JSON.stringify({ content: { text: ocrText } }));
const solarRes = () => new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(good) } }] }));
const geminiRes = () => new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify(good) }] } }] }));

let calls: { url: string; body: unknown }[];
const mockFetch = (handler: (url: string) => Response) =>
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    calls.push({ url, body: init?.body });
    return handler(url);
  }));

beforeEach(() => { calls = []; resetBreaker(); });
afterEach(() => vi.unstubAllGlobals());

describe('extractQuote', () => {
  it('마스킹 후 Solar 호출, 개인정보가 LLM에 전달되지 않음', async () => {
    mockFetch((u) => (u.includes('document-digitization') ? ocrRes() : solarRes()));
    const r = await extractQuote(env, file());
    expect(r.provider).toBe('upstage');
    expect(r.fallbackUsed).toBe(false);
    const llm = calls.find((c) => c.url.includes('chat/completions'))!;
    expect(String(llm.body)).not.toContain('1234-5678');
    expect(String(llm.body)).toContain('010-****-5678');
    expect(r.items[0].unitPrice).toBe(15300);
  });
  it('Solar 실패 시 Gemini 폴백(마스킹된 텍스트만)', async () => {
    mockFetch((u) => (u.includes('document-digitization') ? ocrRes() : u.includes('chat/completions') ? new Response('', { status: 503 }) : geminiRes()));
    const r = await extractQuote(env, file());
    expect(r.provider).toBe('gemini');
    expect(r.fallbackUsed).toBe(true);
    const g = calls.find((c) => c.url.includes('generativelanguage'))!;
    expect(String(g.body)).not.toContain('301-1234');
  });
  it('FALLBACK_PROVIDER=none 이면 폴백하지 않음', async () => {
    mockFetch((u) => (u.includes('document-digitization') ? ocrRes() : new Response('', { status: 503 })));
    await expect(extractQuote({ ...env, FALLBACK_PROVIDER: 'none' }, file())).rejects.toBeInstanceOf(ExtractionFailed);
    expect(calls.some((c) => c.url.includes('generativelanguage'))).toBe(false);
  });
  it('OCR 실패 시 외부 LLM 호출 없이 실패', async () => {
    mockFetch(() => new Response('', { status: 500 }));
    await expect(extractQuote(env, file())).rejects.toBeInstanceOf(ExtractionFailed);
    expect(calls.every((c) => c.url.includes('document-digitization'))).toBe(true);
  });
  it('둘 다 실패하면 실패', async () => {
    mockFetch((u) => (u.includes('document-digitization') ? ocrRes() : new Response('bad', { status: 500 })));
    await expect(extractQuote(env, file())).rejects.toBeInstanceOf(ExtractionFailed);
  });
  it('연속 실패 시 서킷브레이커로 우회', async () => {
    mockFetch((u) => (u.includes('document-digitization') ? ocrRes() : u.includes('chat/completions') ? new Response('', { status: 503 }) : geminiRes()));
    for (let i = 0; i < 3; i++) await extractQuote(env, file());
    calls = [];
    await extractQuote(env, file());
    expect(calls.some((c) => c.url.includes('chat/completions'))).toBe(false);
  });
});

describe('CORS', () => {
  const app = createApp(() => ({ ...env, ALLOWED_ORIGIN: 'https://junghwan12.github.io' }));
  it('허용된 출처만 응답 헤더 부여', async () => {
    const ok = await app.request('/api/health', { headers: { origin: 'https://junghwan12.github.io' } });
    expect(ok.headers.get('access-control-allow-origin')).toBe('https://junghwan12.github.io');
    const bad = await app.request('/api/health', { headers: { origin: 'https://evil.example' } });
    expect(bad.headers.get('access-control-allow-origin')).toBeNull();
  });
  it('프리플라이트', async () => {
    const r = await app.request('/api/extract', { method: 'OPTIONS', headers: { origin: 'https://junghwan12.github.io', 'access-control-request-method': 'POST', 'access-control-request-headers': 'content-type' } });
    expect(r.headers.get('access-control-allow-headers')).toContain('Content-Type');
  });
});

describe('API', () => {
  const app = createApp(() => env);
  const upload = (f: File = file()) => {
    const fd = new FormData();
    fd.append('file', f);
    return app.request('/api/extract', { method: 'POST', body: fd });
  };

  it('로그인 없이 지원하지 않는 형식 415, 정상 처리 200', async () => {
    expect((await upload(new File(['x'], 'a.txt', { type: 'text/plain' }))).status).toBe(415);
    mockFetch((u) => (u.includes('document-digitization') ? ocrRes() : solarRes()));
    const r = await upload();
    expect(r.status).toBe(200);
    expect((await r.json() as { items: unknown[] }).items).toHaveLength(1);
  });
  it('파일 없으면 400', async () => {
    const r = await app.request('/api/extract', { method: 'POST', body: new FormData() });
    expect(r.status).toBe(400);
  });
  it('분당 요청 수 제한', async () => {
    const limited = createApp(() => ({ ...env, RATE_LIMIT_PER_MIN: '2' }));
    mockFetch((u) => (u.includes('document-digitization') ? ocrRes() : solarRes()));
    const send = () => { const fd = new FormData(); fd.append('file', file()); return limited.request('/api/extract', { method: 'POST', body: fd }); };
    expect((await send()).status).toBe(200);
    expect((await send()).status).toBe(200);
    expect((await send()).status).toBe(429);
  });
  it('일일 상한 초과 시 수동 입력 안내', async () => {
    const capped = createApp(() => ({ ...env, DAILY_CALL_LIMIT: '1' }));
    mockFetch((u) => (u.includes('document-digitization') ? ocrRes() : solarRes()));
    const send = () => { const fd = new FormData(); fd.append('file', file()); return capped.request('/api/extract', { method: 'POST', body: fd }); };
    expect((await send()).status).toBe(200);
    const r = await send();
    expect(r.status).toBe(429);
    expect(await r.json()).toMatchObject({ error: 'DAILY_LIMIT', manual: true });
  });
  it('추출 실패는 manual 안내', async () => {
    mockFetch(() => new Response('', { status: 500 }));
    const r = await upload();
    expect(r.status).toBe(502);
    expect(await r.json()).toMatchObject({ manual: true });
  });
});
