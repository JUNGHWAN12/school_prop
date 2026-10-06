/**
 * 인스턴스 메모리 기반 제한(베스트에포트). 서버리스에서는 인스턴스가 여러 개일 수 있으므로
 * 엄격한 일일 상한이 필요하면 Cloudflare KV/Durable Object로 교체한다.
 */
export class SlidingLimiter {
  private hits = new Map<string, number[]>();
  constructor(private max: number, private windowMs: number) {}
  allow(key: string, now = Date.now()): boolean {
    const arr = (this.hits.get(key) ?? []).filter((t) => now - t < this.windowMs);
    if (arr.length >= this.max) { this.hits.set(key, arr); return false; }
    arr.push(now);
    this.hits.set(key, arr);
    if (this.hits.size > 5000) this.hits.clear();
    return true;
  }
}

export class DailyCounter {
  private day = '';
  private n = 0;
  constructor(private max: number) {}
  take(now = new Date()): boolean {
    const d = now.toISOString().slice(0, 10);
    if (d !== this.day) { this.day = d; this.n = 0; }
    if (this.n >= this.max) return false;
    this.n += 1;
    return true;
  }
}
