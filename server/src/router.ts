import type { Env } from './env';
import { finalizeExtraction, type Normalized, type RawExtraction } from './extraction';
import { maskPersonalInfo } from './masking/mask';
import { geminiExtract } from './providers/gemini';
import { ProviderError, solarExtract, upstageOcr } from './providers/upstage';

type LlmName = 'upstage' | 'gemini';
type Llm = (env: Env, text: string) => Promise<RawExtraction>;
const LLMS: Record<LlmName, Llm> = { upstage: solarExtract, gemini: geminiExtract };

/** 연속 실패 시 일정 시간 우회 (서킷브레이커, 인스턴스 메모리 기준) */
const breaker = new Map<LlmName, { fails: number; openUntil: number }>();
const FAIL_LIMIT = 3;
const OPEN_MS = 60_000;
export const resetBreaker = () => breaker.clear();
const isOpen = (n: LlmName) => (breaker.get(n)?.openUntil ?? 0) > Date.now();
const recordFail = (n: LlmName) => {
  const b = breaker.get(n) ?? { fails: 0, openUntil: 0 };
  b.fails += 1;
  if (b.fails >= FAIL_LIMIT) { b.openUntil = Date.now() + OPEN_MS; b.fails = 0; }
  breaker.set(n, b);
};
const recordOk = (n: LlmName) => breaker.delete(n);

export interface ExtractResult extends Normalized {
  provider: LlmName;
  fallbackUsed: boolean;
  maskedCounts: Record<string, number>;
  timingsMs: Record<string, number>;
}

export class ExtractionFailed extends Error {
  constructor(message: string, readonly stage: 'ocr' | 'llm') { super(message); }
}

const asName = (v: string | undefined, d: LlmName): LlmName => (v === 'gemini' || v === 'upstage' ? v : d);

/**
 * 파이프라인(마스킹 강제): Upstage 문서 파싱 → 개인정보 마스킹 → LLM(우선) → 실패 시 LLM(폴백).
 * 어떤 LLM에도 원본 파일/이미지는 전달되지 않는다. OCR이 실패하면 외부 전송 없이 실패 처리(수동 입력 안내).
 */
export async function extractQuote(env: Env, file: File): Promise<ExtractResult> {
  const t0 = Date.now();
  let text: string;
  try {
    text = await upstageOcr(env, file);
  } catch (e) {
    throw new ExtractionFailed(e instanceof Error ? e.message : 'OCR 실패', 'ocr');
  }
  const t1 = Date.now();
  const { text: masked, counts } = maskPersonalInfo(text);

  const primary = asName(env.PRIMARY_PROVIDER, 'upstage');
  // FALLBACK_PROVIDER=none 이면 폴백 없이 우선 프로바이더만 사용
  const fallback = env.FALLBACK_PROVIDER === 'none' ? primary : asName(env.FALLBACK_PROVIDER, primary === 'upstage' ? 'gemini' : 'upstage');
  const order: LlmName[] = fallback === primary ? [primary] : [primary, fallback];

  const errors: string[] = [];
  for (const [i, name] of order.entries()) {
    if (isOpen(name)) { errors.push(`${name}: 연속 실패로 일시 우회 중`); continue; }
    try {
      const raw = await LLMS[name](env, masked);
      recordOk(name);
      // 모델이 합계금액을 빠뜨려도 OCR 원문에서 찾아 품목 합계와 대조한다
      const normalized = finalizeExtraction(raw, masked);
      if (i > 0) normalized.warnings.unshift(`${primary} 처리에 실패해 ${name}으로 처리했습니다.`);
      return { ...normalized, provider: name, fallbackUsed: i > 0, maskedCounts: counts, timingsMs: { ocr: t1 - t0, llm: Date.now() - t1 } };
    } catch (e) {
      errors.push(`${name}: ${e instanceof Error ? e.message : '알 수 없는 오류'}`);
      // 일시 장애(429/5xx/타임아웃/스키마 오류)만 서킷브레이커에 집계. 어떤 실패든 다음 프로바이더로 넘어간다.
      if (!(e instanceof ProviderError) || e.retryable) recordFail(name);
    }
  }
  throw new ExtractionFailed(errors.join(' | ') || 'AI 추출 실패', 'llm');
}
