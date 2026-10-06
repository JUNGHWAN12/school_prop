import type { LimiterNamespace } from './quota';

export interface Env {
  /** 허용할 웹 출처(쉼표 구분). 예: https://junghwan12.github.io */
  ALLOWED_ORIGIN?: string;
  UPSTAGE_API_KEY?: string;
  GEMINI_API_KEY?: string;
  PRIMARY_PROVIDER?: string;
  FALLBACK_PROVIDER?: string;
  UPSTAGE_SOLAR_MODEL?: string;
  UPSTAGE_PARSE_MODEL?: string;
  UPSTAGE_BASE_URL?: string;
  GEMINI_MODEL?: string;
  PROVIDER_TIMEOUT_MS?: string;
  /** 하루 전체(모든 사용자) 분석 호출 상한 */
  DAILY_CALL_LIMIT?: string;
  /** 하루 IP당 분석 호출 상한 */
  DAILY_PER_IP_LIMIT?: string;
  RATE_LIMIT_PER_MIN?: string;
  /** 업로드 허용 최대 크기(MB) */
  MAX_FILE_MB?: string;
  /** 'true'이면 AI 분석을 즉시 중지(킬 스위치). 품목 직접 입력은 계속 가능 */
  DISABLE_EXTRACT?: string;
  /** 설정되면 Cloudflare Turnstile 검증을 필수로 요구 */
  TURNSTILE_SECRET_KEY?: string;
  /** 전역 카운터(Durable Object). 없으면 인스턴스 메모리로 대체(베스트에포트) */
  LIMITER?: LimiterNamespace;
}

export const num = (v: string | undefined, d: number) => {
  const n = Number(v);
  return v && Number.isFinite(n) && n > 0 ? n : d;
};
