import type { QuoteExtraction } from '../types';

/** 배포 시 Cloudflare Worker 주소(VITE_API_BASE). 로컬은 빈 값 → vite 프록시 */
const API = ((import.meta.env.VITE_API_BASE as string | undefined) ?? '').replace(/\/$/, '');

export class ApiError extends Error {
  constructor(message: string, readonly code: string, readonly manual = false, readonly status = 0) {
    super(message);
  }
}

const MESSAGES: Record<string, string> = {
  RATE_LIMITED: '요청이 너무 많습니다. 잠시 후 다시 시도하세요.',
  DAILY_LIMIT: '오늘 AI 사용 한도를 모두 사용했습니다. 품목을 직접 입력해 주세요.',
  FILE_TOO_LARGE: '파일은 20MB 이하여야 합니다.',
  UNSUPPORTED_TYPE: 'PDF, JPG, PNG 파일만 지원합니다.',
  EXTRACTION_FAILED: 'AI 분석에 실패했습니다. 개인정보 보호를 위해 원본은 외부로 전송하지 않았습니다. 품목을 직접 입력해 주세요.',
};

async function parse(res: Response) {
  if (res.ok) return res.json();
  const j = (await res.json().catch(() => ({}))) as { error?: string; manual?: boolean };
  const code = j.error ?? 'UNKNOWN';
  throw new ApiError(MESSAGES[code] ?? `요청에 실패했습니다 (${res.status})`, code, !!j.manual, res.status);
}

export async function extract(file: File): Promise<QuoteExtraction> {
  const fd = new FormData();
  fd.append('file', file);
  const res = await fetch(`${API}/api/extract`, { method: 'POST', body: fd });
  return (await parse(res)) as QuoteExtraction;
}
