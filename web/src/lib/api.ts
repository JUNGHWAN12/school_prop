import type { QuoteExtraction } from '../types';
import { getTurnstileToken } from './turnstile';
import type { VatChoice } from './vat';

/** 배포 시 Cloudflare Worker 주소(VITE_API_BASE). 로컬은 빈 값 → vite 프록시 */
const API = ((import.meta.env.VITE_API_BASE as string | undefined) ?? '').replace(/\/$/, '');

export class ApiError extends Error {
  constructor(message: string, readonly code: string, readonly manual = false, readonly status = 0, readonly detail = '') {
    super(message);
  }
}

const MESSAGES: Record<string, string> = {
  RATE_LIMITED: '요청이 너무 많습니다. 잠시 후 다시 시도하세요.',
  IP_DAILY_LIMIT: '이 네트워크에서 오늘 사용할 수 있는 분석 횟수를 모두 사용했습니다. 품목을 직접 입력하거나 내일 다시 시도해 주세요.',
  FORBIDDEN_ORIGIN: '허용되지 않은 접속입니다. 학교에서 안내한 주소로 접속해 주세요.',
  SERVICE_DISABLED: '현재 AI 분석이 일시 중지되었습니다. 품목을 직접 입력해 주세요.',
  TURNSTILE_FAILED: '보안 확인에 실패했습니다. 페이지를 새로고침한 뒤 다시 시도해 주세요.',
  TURNSTILE_UNAVAILABLE: '보안 확인 서비스에 연결하지 못했습니다. 잠시 후 다시 시도하거나 품목을 직접 입력해 주세요.',
  DAILY_LIMIT: '오늘 AI 사용 한도를 모두 사용했습니다. 품목을 직접 입력해 주세요.',
  FILE_TOO_LARGE: '파일은 10MB 이하여야 합니다.',
  UNSUPPORTED_TYPE: 'PDF, JPG, PNG 파일만 지원합니다.',
  EXTRACTION_FAILED: 'AI 분석에 실패했습니다. 개인정보 보호를 위해 원본은 외부로 전송하지 않았습니다. 품목을 직접 입력해 주세요.',
};

async function parse(res: Response) {
  if (res.ok) return res.json();
  const j = (await res.json().catch(() => ({}))) as { error?: string; manual?: boolean; stage?: string; detail?: string };
  const code = j.error ?? 'UNKNOWN';
  throw new ApiError(MESSAGES[code] ?? `요청에 실패했습니다 (${res.status})`, code, !!j.manual, res.status, j.detail ? `[${j.stage ?? '?'}] ${j.detail}` : '');
}

export async function extract(file: File, vat: VatChoice = 'auto'): Promise<QuoteExtraction> {
  const fd = new FormData();
  fd.append('file', file);
  fd.append('vat_mode', vat);
  let token = '';
  try {
    token = await getTurnstileToken();
  } catch (e) {
    throw new ApiError(e instanceof Error ? e.message : MESSAGES.TURNSTILE_FAILED, 'TURNSTILE_FAILED', true);
  }
  const res = await fetch(`${API}/api/extract`, { method: 'POST', body: fd, headers: token ? { 'X-Turnstile-Token': token } : {} });
  return (await parse(res)) as QuoteExtraction;
}
