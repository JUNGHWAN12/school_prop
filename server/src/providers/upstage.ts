import type { Env } from '../env';
import { num } from '../env';
import { EXTRACTION_SCHEMA, SYSTEM_PROMPT, assertRaw, parseJsonLoose, type RawExtraction } from '../extraction';

/**
 * 엔드포인트·모델명은 Upstage 공식 문서 기준 기본값이며 환경변수로 교체 가능하다.
 * (Document Parse: POST {base}/document-digitization, Solar: OpenAI 호환 {base}/chat/completions)
 */
const base = (env: Env) => env.UPSTAGE_BASE_URL ?? 'https://api.upstage.ai/v1';

export class ProviderError extends Error {
  constructor(message: string, readonly status?: number, readonly retryable = true) {
    super(message);
  }
}

const classify = (status: number) => status === 429 || status >= 500;

/** 1단계: 견적서 파일 → 텍스트(OCR/문서 파싱) */
export async function upstageOcr(env: Env, file: File): Promise<string> {
  if (!env.UPSTAGE_API_KEY) throw new ProviderError('UPSTAGE_API_KEY 미설정', 500, false);
  const form = new FormData();
  form.append('document', file);
  form.append('model', env.UPSTAGE_PARSE_MODEL ?? 'document-parse');
  const res = await fetch(`${base(env)}/document-digitization`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.UPSTAGE_API_KEY}` },
    body: form,
    signal: AbortSignal.timeout(num(env.PROVIDER_TIMEOUT_MS, 20000)),
  });
  if (!res.ok) throw new ProviderError(`Upstage 문서 파싱 실패(${res.status})`, res.status, classify(res.status));
  const j = (await res.json()) as {
    content?: { markdown?: string; text?: string; html?: string };
    text?: string;
    pages?: { text?: string }[];
  };
  const text =
    j.content?.markdown || j.content?.text || j.content?.html || j.text || j.pages?.map((p) => p.text ?? '').join('\n') || '';
  if (!text.trim()) throw new ProviderError('문서에서 텍스트를 추출하지 못했습니다', 422, false);
  return text;
}

/** 2단계: 마스킹된 텍스트 → 구조화 JSON (Solar) */
export async function solarExtract(env: Env, maskedText: string): Promise<RawExtraction> {
  if (!env.UPSTAGE_API_KEY) throw new ProviderError('UPSTAGE_API_KEY 미설정', 500, false);
  const res = await fetch(`${base(env)}/chat/completions`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.UPSTAGE_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: env.UPSTAGE_SOLAR_MODEL ?? 'solar-pro2',
      temperature: 0,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: maskedText },
      ],
      response_format: { type: 'json_schema', json_schema: { name: 'quote', schema: EXTRACTION_SCHEMA, strict: false } },
    }),
    signal: AbortSignal.timeout(num(env.PROVIDER_TIMEOUT_MS, 20000)),
  });
  if (!res.ok) throw new ProviderError(`Solar 호출 실패(${res.status})`, res.status, classify(res.status));
  const j = (await res.json()) as { choices?: { message?: { content?: string } }[] };
  const content = j.choices?.[0]?.message?.content;
  if (!content) throw new ProviderError('Solar 응답이 비어 있습니다');
  return assertRaw(parseJsonLoose(content));
}
