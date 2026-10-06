import { Hono } from 'hono';
import { issueToken, safeEqual, verifyToken } from './auth';
import { num, type Env } from './env';
import { ExtractionFailed, extractQuote } from './router';
import { DailyCounter, SlidingLimiter } from './limits';

const MAX_BYTES = 20 * 1024 * 1024;
const ALLOWED = new Set(['application/pdf', 'image/jpeg', 'image/png']);

export function createApp(getEnv: (c: { env?: unknown }) => Env) {
  const app = new Hono<{ Bindings: Record<string, unknown> }>();
  let loginLimiter: SlidingLimiter | undefined;
  let extractLimiter: SlidingLimiter | undefined;
  let daily: DailyCounter | undefined;

  const ip = (c: { req: { header: (n: string) => string | undefined } }) =>
    c.req.header('cf-connecting-ip') ?? c.req.header('x-forwarded-for')?.split(',')[0]?.trim() ?? 'local';

  app.get('/api/health', (c) => c.json({ ok: true }));

  app.post('/api/login', async (c) => {
    const env = getEnv(c);
    if (!env.ACCESS_CODE) return c.json({ error: 'SERVER_NOT_CONFIGURED' }, 500);
    loginLimiter ??= new SlidingLimiter(5, 60_000);
    if (!loginLimiter.allow(ip(c))) return c.json({ error: 'TOO_MANY_ATTEMPTS' }, 429);
    const body = (await c.req.json().catch(() => ({}))) as { code?: string };
    if (!safeEqual(String(body.code ?? ''), env.ACCESS_CODE)) return c.json({ error: 'INVALID_CODE' }, 401);
    return c.json({ token: await issueToken(env.ACCESS_CODE) });
  });

  app.post('/api/extract', async (c) => {
    const env = getEnv(c);
    if (!env.ACCESS_CODE) return c.json({ error: 'SERVER_NOT_CONFIGURED' }, 500);
    const token = c.req.header('authorization')?.replace(/^Bearer\s+/i, '') ?? '';
    if (!(await verifyToken(env.ACCESS_CODE, token))) return c.json({ error: 'UNAUTHORIZED' }, 401);

    extractLimiter ??= new SlidingLimiter(num(env.RATE_LIMIT_PER_MIN, 10), 60_000);
    if (!extractLimiter.allow(ip(c))) return c.json({ error: 'RATE_LIMITED' }, 429);
    daily ??= new DailyCounter(num(env.DAILY_CALL_LIMIT, 200));
    if (!daily.take()) return c.json({ error: 'DAILY_LIMIT', manual: true }, 429);

    const form = await c.req.formData().catch(() => null);
    const file = form?.get('file');
    if (!(file instanceof File)) return c.json({ error: 'NO_FILE' }, 400);
    if (file.size > MAX_BYTES) return c.json({ error: 'FILE_TOO_LARGE' }, 413);
    if (!ALLOWED.has(file.type)) return c.json({ error: 'UNSUPPORTED_TYPE' }, 415);

    try {
      const r = await extractQuote(env, file);
      // 본문·개인정보는 로그에 남기지 않고 지표만 기록
      console.log(JSON.stringify({ evt: 'extract', provider: r.provider, fallback: r.fallbackUsed, ms: r.timingsMs, masked: r.maskedCounts }));
      return c.json(r);
    } catch (e) {
      const stage = e instanceof ExtractionFailed ? e.stage : 'llm';
      console.log(JSON.stringify({ evt: 'extract_failed', stage }));
      // 마스킹을 거치지 못했으므로 외부 AI로 원본을 보내지 않고 수동 입력으로 안내
      return c.json({ error: 'EXTRACTION_FAILED', stage, manual: true }, 502);
    }
  });

  return app;
}
