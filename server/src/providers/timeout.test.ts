import { afterEach, describe, expect, it, vi } from 'vitest';
import { providerTimeoutMs } from '../env';
import { geminiExtract } from './gemini';
import { solarExtract, upstageOcr } from './upstage';

afterEach(() => vi.restoreAllMocks());

describe('외부 AI 호출 제한 시간', () => {
  it('기본은 60초, 환경변수로 변경 가능', () => {
    expect(providerTimeoutMs({})).toBe(60_000);
    expect(providerTimeoutMs({ PROVIDER_TIMEOUT_MS: '30000' })).toBe(30_000);
    expect(providerTimeoutMs({ PROVIDER_TIMEOUT_MS: 'abc' })).toBe(60_000);
  });

  it('문서 파싱·Solar·Gemini 모두 같은 제한 시간을 사용', async () => {
    const spy = vi.spyOn(AbortSignal, 'timeout');
    vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status: 500 })));
    const env = { UPSTAGE_API_KEY: 'u', GEMINI_API_KEY: 'g' };
    await upstageOcr(env, new File(['x'], 'a.pdf', { type: 'application/pdf' })).catch(() => {});
    await solarExtract(env, 't').catch(() => {});
    await geminiExtract(env, 't').catch(() => {});
    expect(spy.mock.calls.map((c) => c[0])).toEqual([60_000, 60_000, 60_000]);
    vi.unstubAllGlobals();
  });
});
