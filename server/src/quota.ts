/**
 * 일일 호출 상한 (전체 + IP별). 한국 시간(KST) 자정 기준으로 초기화한다.
 * - Cloudflare Durable Object(`Limiter`)에 저장하면 모든 서버 인스턴스가 하나의 카운터를 공유해 정확하다.
 * - 바인딩이 없거나 호출이 실패하면 인스턴스 메모리 카운터로 대체한다(베스트에포트).
 */
export const kstDay = (now = Date.now()) => new Date(now + 9 * 3600_000).toISOString().slice(0, 10);

export type QuotaResult = { ok: true } | { ok: false; reason: 'GLOBAL' | 'IP' };

export interface SerializedQuota { day: string; total: number; perIp: [string, number][] }

const MAX_TRACKED_IPS = 10_000;

export class QuotaCounter {
  private day = '';
  private total = 0;
  private perIp = new Map<string, number>();

  static from(saved?: SerializedQuota): QuotaCounter {
    const c = new QuotaCounter();
    if (saved) {
      c.day = saved.day;
      c.total = saved.total;
      c.perIp = new Map(saved.perIp);
    }
    return c;
  }

  serialize(): SerializedQuota {
    return { day: this.day, total: this.total, perIp: [...this.perIp] };
  }

  take(ip: string, globalLimit: number, ipLimit: number, now = Date.now()): QuotaResult {
    const day = kstDay(now);
    if (day !== this.day) {
      this.day = day;
      this.total = 0;
      this.perIp = new Map();
    }
    if (this.total >= globalLimit) return { ok: false, reason: 'GLOBAL' };
    const used = this.perIp.get(ip) ?? 0;
    if (used >= ipLimit) return { ok: false, reason: 'IP' };
    this.total += 1;
    if (this.perIp.has(ip) || this.perIp.size < MAX_TRACKED_IPS) this.perIp.set(ip, used + 1);
    return { ok: true };
  }
}

/** Durable Object 구현(클래식 fetch 방식). 한 인스턴스('global')가 모든 요청을 직렬 처리하므로 카운트가 정확하다. */
interface DurableState {
  storage: { get<T>(key: string): Promise<T | undefined>; put(key: string, value: unknown): Promise<void> };
}

export class Limiter {
  constructor(private state: DurableState) {}

  async fetch(request: Request): Promise<Response> {
    const { ip, globalLimit, ipLimit } = (await request.json()) as { ip: string; globalLimit: number; ipLimit: number };
    const counter = QuotaCounter.from(await this.state.storage.get<SerializedQuota>('quota'));
    const result = counter.take(String(ip), globalLimit, ipLimit);
    await this.state.storage.put('quota', counter.serialize());
    return Response.json(result);
  }
}

export interface LimiterNamespace {
  idFromName(name: string): unknown;
  get(id: unknown): { fetch(input: string, init?: RequestInit): Promise<Response> };
}

export async function takeQuota(
  limiter: LimiterNamespace | undefined,
  fallback: QuotaCounter,
  ip: string,
  globalLimit: number,
  ipLimit: number,
): Promise<QuotaResult> {
  if (limiter) {
    try {
      const stub = limiter.get(limiter.idFromName('global'));
      const res = await stub.fetch('https://limiter/take', { method: 'POST', body: JSON.stringify({ ip, globalLimit, ipLimit }) });
      if (res.ok) return (await res.json()) as QuotaResult;
      console.log(JSON.stringify({ evt: 'limiter_error', status: res.status }));
    } catch (e) {
      console.log(JSON.stringify({ evt: 'limiter_error', detail: e instanceof Error ? e.message : 'unknown' }));
    }
  }
  return fallback.take(ip, globalLimit, ipLimit);
}
