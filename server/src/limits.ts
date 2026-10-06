/**
 * 인스턴스 메모리 기반의 분당 요청 제한(단기 폭주 방지용 베스트에포트).
 * 일일 상한처럼 정확해야 하는 제한은 quota.ts(Durable Object)가 담당한다.
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
