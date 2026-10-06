export interface Env {
  ACCESS_CODE?: string;
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
  DAILY_CALL_LIMIT?: string;
  RATE_LIMIT_PER_MIN?: string;
}

export const num = (v: string | undefined, d: number) => {
  const n = Number(v);
  return v && Number.isFinite(n) && n > 0 ? n : d;
};
