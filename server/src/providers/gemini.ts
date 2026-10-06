import type { Env } from '../env';
import { num } from '../env';
import { EXTRACTION_SCHEMA, SYSTEM_PROMPT, assertRaw, parseJsonLoose, type RawExtraction } from '../extraction';
import { ProviderError, failure } from './upstage';

/** Gemini(무료 티어)는 마스킹된 텍스트만 받는다. 원본 이미지는 절대 전송하지 않는다. */
export async function geminiExtract(env: Env, maskedText: string): Promise<RawExtraction> {
  if (!env.GEMINI_API_KEY) throw new ProviderError('GEMINI_API_KEY 미설정', 500, false);
  const model = env.GEMINI_MODEL ?? 'gemini-2.5-flash';
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
    method: 'POST',
    headers: { 'x-goog-api-key': env.GEMINI_API_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
      contents: [{ role: 'user', parts: [{ text: maskedText }] }],
      generationConfig: { temperature: 0, responseMimeType: 'application/json' },
    }),
    signal: AbortSignal.timeout(num(env.PROVIDER_TIMEOUT_MS, 20000)),
  });
  void EXTRACTION_SCHEMA; // 스키마는 프롬프트로 전달(모델별 responseSchema 방언 차이 회피)
  if (!res.ok) throw await failure(res, 'Gemini 호출 실패');
  const j = (await res.json()) as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
  const text = j.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('');
  if (!text) throw new ProviderError('Gemini 응답이 비어 있습니다');
  return assertRaw(parseJsonLoose(text));
}
