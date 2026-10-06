import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { num, type Env } from './env';
import { ExtractionFailed, extractQuote } from './router';
import { SlidingLimiter } from './limits';
import { QuotaCounter, takeQuota } from './quota';
import { verifyTurnstile } from './turnstile';

const ALLOWED = new Set(['application/pdf', 'image/jpeg', 'image/png']);

export function createApp(getEnv: (c: { env?: unknown }) => Env) {
  const app = new Hono<{ Bindings: Record<string, unknown> }>();
  // 웹(GitHub Pages)과 API(Cloudflare Workers)가 다른 출처이므로 허용 출처만 CORS 허용
  app.use('/api/*', (c, next) => {
    const allowed = (getEnv(c).ALLOWED_ORIGIN ?? '').split(',').map((o) => o.trim()).filter(Boolean);
    return cors({
      origin: (origin) => (allowed.includes(origin) ? origin : null),
      allowHeaders: ['Content-Type', 'X-Turnstile-Token'],
      allowMethods: ['GET', 'POST', 'OPTIONS'],
      maxAge: 600,
    })(c, next);
  });

  let extractLimiter: SlidingLimiter | undefined;
  const memoryQuota = new QuotaCounter(); // 전역 카운터(Durable Object)를 쓸 수 없을 때의 대체

  const ip = (c: { req: { header: (n: string) => string | undefined } }) =>
    c.req.header('cf-connecting-ip') ?? c.req.header('x-forwarded-for')?.split(',')[0]?.trim() ?? 'local';

  app.get('/api/health', (c) => c.json({ ok: true }));

  app.post('/api/extract', async (c) => {
    const env = getEnv(c);
    const clientIp = ip(c);

    // 1) 출처 검사: 허용된 웹 사이트에서 온 요청만 처리 (브라우저는 항상 Origin을 보냄)
    const allowed = (env.ALLOWED_ORIGIN ?? '').split(',').map((o) => o.trim()).filter(Boolean);
    if (allowed.length > 0 && !allowed.includes(c.req.header('origin') ?? '')) return c.json({ error: 'FORBIDDEN_ORIGIN' }, 403);

    // 2) 킬 스위치: 남용이 감지되면 설정 한 줄로 AI 분석을 즉시 중지
    if (env.DISABLE_EXTRACT === 'true') return c.json({ error: 'SERVICE_DISABLED', manual: true }, 503);

    // 3) IP당 분당 요청 수 (인스턴스 메모리, 단기 폭주 방지)
    extractLimiter ??= new SlidingLimiter(num(env.RATE_LIMIT_PER_MIN, 10), 60_000);
    if (!extractLimiter.allow(clientIp)) return c.json({ error: 'RATE_LIMITED' }, 429);

    // 4) Turnstile: 시크릿이 설정되어 있으면 사람 확인 토큰 필수
    if (env.TURNSTILE_SECRET_KEY) {
      const token = c.req.header('x-turnstile-token') ?? '';
      if (!token) return c.json({ error: 'TURNSTILE_FAILED' }, 403);
      const v = await verifyTurnstile(env.TURNSTILE_SECRET_KEY, token, clientIp);
      if (v === 'fail') return c.json({ error: 'TURNSTILE_FAILED' }, 403);
      if (v === 'unavailable') return c.json({ error: 'TURNSTILE_UNAVAILABLE', manual: true }, 503);
    }

    // 5) 파일 검증(비용이 들기 전에 형식·크기 확인). 잘못된 요청이 일일 상한을 소모하지 않도록 상한 차감보다 먼저 수행
    const maxBytes = num(env.MAX_FILE_MB, 10) * 1024 * 1024;
    const declared = Number(c.req.header('content-length'));
    if (Number.isFinite(declared) && declared > maxBytes + 1024 * 1024) return c.json({ error: 'FILE_TOO_LARGE' }, 413);
    const form = await c.req.formData().catch(() => null);
    const file = form?.get('file');
    if (!(file instanceof File)) return c.json({ error: 'NO_FILE' }, 400);
    if (file.size > maxBytes) return c.json({ error: 'FILE_TOO_LARGE' }, 413);
    if (!ALLOWED.has(file.type)) return c.json({ error: 'UNSUPPORTED_TYPE' }, 415);

    // 6) 일일 상한(전체 + IP별). Durable Object로 모든 인스턴스가 하나의 카운터를 공유
    const q = await takeQuota(env.LIMITER, memoryQuota, clientIp, num(env.DAILY_CALL_LIMIT, 200), num(env.DAILY_PER_IP_LIMIT, 50));
    if (!q.ok) return c.json({ error: q.reason === 'IP' ? 'IP_DAILY_LIMIT' : 'DAILY_LIMIT', manual: true }, 429);

    try {
      const r = await extractQuote(env, file);
      // 본문·개인정보는 로그에 남기지 않고 지표만 기록
      console.log(JSON.stringify({ evt: 'extract', provider: r.provider, fallback: r.fallbackUsed, ms: r.timingsMs, masked: r.maskedCounts }));
      return c.json(r);
    } catch (e) {
      const stage = e instanceof ExtractionFailed ? e.stage : 'llm';
      const detail = e instanceof Error ? e.message : '';
      console.log(JSON.stringify({ evt: 'extract_failed', stage, detail }));
      // 마스킹을 거치지 못했으므로 외부 AI로 원본을 보내지 않고 수동 입력으로 안내
      return c.json({ error: 'EXTRACTION_FAILED', stage, detail, manual: true }, 502);
    }
  });

  return app;
}
