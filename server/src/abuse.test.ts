import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from './app';
import type { Env } from './env';
import { kstDay, Limiter, QuotaCounter, takeQuota, type LimiterNamespace } from './quota';
import { resetBreaker } from './router';

const ORIGIN = 'https://junghwan12.github.io';
const baseEnv: Env = { UPSTAGE_API_KEY: 'u', GEMINI_API_KEY: 'g', ALLOWED_ORIGIN: ORIGIN };

const ocrRes = () => new Response(JSON.stringify({ content: { text: '합계금액 : 일금 만 원 ₩10,000\n책 1 10,000 10,000' } }));
const solarRes = () => new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ vat_mode: 'included', items: [{ item_name: '책', quantity: 1, unit_price: 10000, line_amount: 10000 }] }) } }] }));

let fetchCalls: string[];
const mockAi = (turnstile?: (body: URLSearchParams) => Response) =>
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    fetchCalls.push(url);
    if (url.includes('turnstile')) return turnstile ? turnstile(init?.body as URLSearchParams) : Response.json({ success: true });
    return url.includes('document-digitization') ? ocrRes() : solarRes();
  }));

const send = (app: ReturnType<typeof createApp>, headers: Record<string, string> = { origin: ORIGIN }, file: File = new File(['x'], 'q.pdf', { type: 'application/pdf' })) => {
  const fd = new FormData();
  fd.append('file', file);
  return app.request('/api/extract', { method: 'POST', body: fd, headers });
};

beforeEach(() => { fetchCalls = []; resetBreaker(); });
afterEach(() => vi.unstubAllGlobals());

describe('1단계: Origin 검사 · 킬 스위치 · 파일 크기', () => {
  it('허용되지 않은 출처·Origin 없는 호출(curl)은 403, AI 호출 없음', async () => {
    mockAi();
    const app = createApp(() => baseEnv);
    expect((await send(app, { origin: 'https://evil.example' })).status).toBe(403);
    expect((await send(app, {})).status).toBe(403);
    expect(fetchCalls).toEqual([]);
  });
  it('허용 출처는 통과', async () => {
    mockAi();
    expect((await send(createApp(() => baseEnv))).status).toBe(200);
  });
  it('ALLOWED_ORIGIN이 비어 있으면(로컬 개발) 검사하지 않음', async () => {
    mockAi();
    expect((await send(createApp(() => ({ ...baseEnv, ALLOWED_ORIGIN: undefined })), {})).status).toBe(200);
  });
  it('킬 스위치: 503 + 수동 입력 안내, AI 호출 없음', async () => {
    mockAi();
    const r = await send(createApp(() => ({ ...baseEnv, DISABLE_EXTRACT: 'true' })));
    expect(r.status).toBe(503);
    expect(await r.json()).toMatchObject({ error: 'SERVICE_DISABLED', manual: true });
    expect(fetchCalls).toEqual([]);
  });
  it('파일 크기 상한(MAX_FILE_MB)', async () => {
    mockAi();
    const app = createApp(() => ({ ...baseEnv, MAX_FILE_MB: '1' }));
    const big = new File([new Uint8Array(1024 * 1024 + 10)], 'big.pdf', { type: 'application/pdf' });
    expect((await send(app, { origin: ORIGIN }, big)).status).toBe(413);
    expect(fetchCalls).toEqual([]);
  });
  it('Content-Length가 한도를 크게 넘으면 본문을 읽기 전에 거부', async () => {
    mockAi();
    const app = createApp(() => ({ ...baseEnv, MAX_FILE_MB: '1' }));
    const r = await app.request('/api/extract', { method: 'POST', body: 'x', headers: { origin: ORIGIN, 'content-length': String(50 * 1024 * 1024) } });
    expect(r.status).toBe(413);
  });
  it('CORS: 허용 헤더에 X-Turnstile-Token 포함', async () => {
    const r = await createApp(() => baseEnv).request('/api/extract', { method: 'OPTIONS', headers: { origin: ORIGIN, 'access-control-request-method': 'POST', 'access-control-request-headers': 'x-turnstile-token' } });
    expect(r.headers.get('access-control-allow-headers')).toContain('X-Turnstile-Token');
  });
});

describe('2단계: Turnstile', () => {
  const env = { ...baseEnv, TURNSTILE_SECRET_KEY: 'secret' };
  it('시크릿이 없으면 검증하지 않음', async () => {
    mockAi();
    expect((await send(createApp(() => baseEnv))).status).toBe(200);
    expect(fetchCalls.some((u) => u.includes('turnstile'))).toBe(false);
  });
  it('토큰이 없으면 403, AI 호출 없음', async () => {
    mockAi();
    const r = await send(createApp(() => env));
    expect(r.status).toBe(403);
    expect(await r.json()).toMatchObject({ error: 'TURNSTILE_FAILED' });
    expect(fetchCalls).toEqual([]);
  });
  it('유효한 토큰이면 통과하고 secret·response를 검증 서버에 전달', async () => {
    let sent: URLSearchParams | undefined;
    mockAi((b) => { sent = b; return Response.json({ success: true }); });
    expect((await send(createApp(() => env), { origin: ORIGIN, 'x-turnstile-token': 'tok-1', 'cf-connecting-ip': '1.2.3.4' })).status).toBe(200);
    expect(sent?.get('secret')).toBe('secret');
    expect(sent?.get('response')).toBe('tok-1');
    expect(sent?.get('remoteip')).toBe('1.2.3.4');
  });
  it('검증 실패(success=false) 403', async () => {
    mockAi(() => Response.json({ success: false, 'error-codes': ['invalid-input-response'] }));
    expect((await send(createApp(() => env), { origin: ORIGIN, 'x-turnstile-token': 'bad' })).status).toBe(403);
    expect(fetchCalls.some((u) => u.includes('document-digitization'))).toBe(false);
  });
  it('검증 서버에 접속할 수 없으면 열어주지 않고 503(수동 입력 안내)', async () => {
    mockAi(() => new Response('', { status: 500 }));
    const r = await send(createApp(() => env), { origin: ORIGIN, 'x-turnstile-token': 'tok' });
    expect(r.status).toBe(503);
    expect(await r.json()).toMatchObject({ error: 'TURNSTILE_UNAVAILABLE', manual: true });
  });
});

describe('3단계: 전역 일일 카운터', () => {
  it('전체 상한과 IP별 상한', () => {
    const c = new QuotaCounter();
    const t = Date.UTC(2026, 9, 6, 3, 0, 0);
    expect(c.take('a', 3, 2, t).ok).toBe(true);
    expect(c.take('a', 3, 2, t).ok).toBe(true);
    expect(c.take('a', 3, 2, t)).toEqual({ ok: false, reason: 'IP' });
    expect(c.take('b', 3, 2, t).ok).toBe(true);
    expect(c.take('c', 3, 2, t)).toEqual({ ok: false, reason: 'GLOBAL' });
  });
  it('한국 시간 자정에 초기화(UTC 15:00)', () => {
    const c = new QuotaCounter();
    const before = Date.UTC(2026, 9, 6, 14, 59, 0);
    const after = Date.UTC(2026, 9, 6, 15, 0, 1);
    expect(kstDay(before)).toBe('2026-10-06');
    expect(kstDay(after)).toBe('2026-10-07');
    expect(c.take('a', 1, 1, before).ok).toBe(true);
    expect(c.take('a', 1, 1, before).ok).toBe(false);
    expect(c.take('a', 1, 1, after).ok).toBe(true);
  });
  it('직렬화·복원 후에도 카운트 유지', () => {
    const t = Date.UTC(2026, 9, 6, 3);
    const c = new QuotaCounter();
    c.take('a', 5, 5, t); c.take('a', 5, 5, t);
    const r = QuotaCounter.from(JSON.parse(JSON.stringify(c.serialize())));
    expect(r.take('a', 5, 2, t)).toEqual({ ok: false, reason: 'IP' });
  });
  it('특이한 IP 문자열(__proto__)도 안전하게 처리', () => {
    const c = new QuotaCounter();
    expect(c.take('__proto__', 5, 1).ok).toBe(true);
    expect(c.take('__proto__', 5, 1).ok).toBe(false);
  });

  // Durable Object 흉내: 같은 이름이면 같은 Limiter 인스턴스(저장소 공유)를 돌려준다
  const fakeNamespace = (): LimiterNamespace => {
    const store = new Map<string, unknown>();
    const limiter = new Limiter({ storage: { get: async (k) => store.get(k) as never, put: async (k, v) => void store.set(k, JSON.parse(JSON.stringify(v))) } });
    return { idFromName: (n) => n, get: () => ({ fetch: (url, init) => limiter.fetch(new Request(url, init)) }) };
  };

  it('Durable Object 경유: 서로 다른 서버 인스턴스(app)가 하나의 카운터를 공유', async () => {
    mockAi();
    const ns = fakeNamespace();
    const mk = () => createApp(() => ({ ...baseEnv, LIMITER: ns, DAILY_CALL_LIMIT: '2', RATE_LIMIT_PER_MIN: '100' }));
    const [a, b] = [mk(), mk()]; // 인스턴스 2개
    expect((await send(a)).status).toBe(200);
    expect((await send(b)).status).toBe(200);
    const r = await send(a);
    expect(r.status).toBe(429);
    expect(await r.json()).toMatchObject({ error: 'DAILY_LIMIT', manual: true });
    expect((await send(b)).status).toBe(429);
  });
  it('IP별 상한 초과는 IP_DAILY_LIMIT', async () => {
    mockAi();
    const ns = fakeNamespace();
    const app = createApp(() => ({ ...baseEnv, LIMITER: ns, DAILY_PER_IP_LIMIT: '1', RATE_LIMIT_PER_MIN: '100' }));
    const h = { origin: ORIGIN, 'cf-connecting-ip': '9.9.9.9' };
    expect((await send(app, h)).status).toBe(200);
    const r = await send(app, h);
    expect(await r.json()).toMatchObject({ error: 'IP_DAILY_LIMIT' });
    expect((await send(app, { origin: ORIGIN, 'cf-connecting-ip': '8.8.8.8' })).status).toBe(200);
  });
  it('잘못된 요청(형식·크기)은 일일 상한을 소모하지 않음', async () => {
    mockAi();
    const ns = fakeNamespace();
    const app = createApp(() => ({ ...baseEnv, LIMITER: ns, DAILY_CALL_LIMIT: '1', RATE_LIMIT_PER_MIN: '100' }));
    for (let i = 0; i < 5; i++) expect((await send(app, { origin: ORIGIN }, new File(['x'], 'a.txt', { type: 'text/plain' }))).status).toBe(415);
    expect((await send(app)).status).toBe(200); // 잘못된 요청 5건이 상한(1)을 소모했다면 여기서 429
    expect((await send(app)).status).toBe(429);
  });
  it('Durable Object 오류 시 메모리 카운터로 대체(요청은 계속 처리)', async () => {
    mockAi();
    const broken: LimiterNamespace = { idFromName: (n) => n, get: () => ({ fetch: async () => { throw new Error('do down'); } }) };
    const app = createApp(() => ({ ...baseEnv, LIMITER: broken, DAILY_CALL_LIMIT: '1', RATE_LIMIT_PER_MIN: '100' }));
    expect((await send(app)).status).toBe(200);
    expect((await send(app)).status).toBe(429); // 메모리 대체 카운터도 상한 적용
  });
  it('takeQuota: 바인딩이 없으면 메모리 카운터', async () => {
    const mem = new QuotaCounter();
    expect((await takeQuota(undefined, mem, 'x', 1, 1)).ok).toBe(true);
    expect((await takeQuota(undefined, mem, 'x', 1, 1)).ok).toBe(false);
  });
});
