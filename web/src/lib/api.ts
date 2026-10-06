import type { QuoteExtraction } from '../types';

export class ApiError extends Error {
  constructor(message: string, readonly code: string, readonly manual = false, readonly status = 0) {
    super(message);
  }
}

const MESSAGES: Record<string, string> = {
  INVALID_CODE: '접속 코드가 올바르지 않습니다.',
  TOO_MANY_ATTEMPTS: '시도 횟수가 많습니다. 잠시 후 다시 시도하세요.',
  UNAUTHORIZED: '접속 시간이 만료되었습니다. 다시 로그인하세요.',
  RATE_LIMITED: '요청이 너무 많습니다. 잠시 후 다시 시도하세요.',
  DAILY_LIMIT: '오늘 AI 사용 한도를 모두 사용했습니다. 품목을 직접 입력해 주세요.',
  FILE_TOO_LARGE: '파일은 20MB 이하여야 합니다.',
  UNSUPPORTED_TYPE: 'PDF, JPG, PNG 파일만 지원합니다.',
  EXTRACTION_FAILED: 'AI 분석에 실패했습니다. 개인정보 보호를 위해 원본은 외부로 전송하지 않았습니다. 품목을 직접 입력해 주세요.',
  SERVER_NOT_CONFIGURED: '서버 설정이 완료되지 않았습니다. 관리자에게 문의하세요.',
};

async function parse(res: Response) {
  if (res.ok) return res.json();
  const j = (await res.json().catch(() => ({}))) as { error?: string; manual?: boolean };
  const code = j.error ?? 'UNKNOWN';
  throw new ApiError(MESSAGES[code] ?? `요청에 실패했습니다 (${res.status})`, code, !!j.manual, res.status);
}

export async function login(code: string): Promise<string> {
  const res = await fetch('/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code }) });
  return ((await parse(res)) as { token: string }).token;
}

export async function extract(file: File, token: string): Promise<QuoteExtraction> {
  const fd = new FormData();
  fd.append('file', file);
  const res = await fetch('/api/extract', { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: fd });
  return (await parse(res)) as QuoteExtraction;
}
