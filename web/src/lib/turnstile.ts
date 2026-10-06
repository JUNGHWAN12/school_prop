/**
 * Cloudflare Turnstile(사람 확인) 토큰 발급. 사이트 키(VITE_TURNSTILE_SITE_KEY)가 없으면 비활성(로컬 개발).
 * 위젯은 평소 보이지 않고, 추가 확인이 필요할 때만 화면 오른쪽 아래에 표시된다. 토큰은 1회용이라 요청마다 새로 받는다.
 */
interface TurnstileApi {
  render(el: HTMLElement, opts: Record<string, unknown>): string;
  execute(id: string): void;
  reset(id: string): void;
}
declare global {
  interface Window { turnstile?: TurnstileApi }
}

const SITE_KEY = import.meta.env.VITE_TURNSTILE_SITE_KEY as string | undefined;
const SCRIPT_URL = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
const TIMEOUT_MS = 30_000;

export const turnstileEnabled = () => Boolean(SITE_KEY);

let scriptPromise: Promise<void> | undefined;
function loadScript(): Promise<void> {
  if (window.turnstile) return Promise.resolve();
  scriptPromise ??= new Promise<void>((resolve, reject) => {
    const s = document.createElement('script');
    s.src = SCRIPT_URL;
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => {
      scriptPromise = undefined; // 다음 시도에서 다시 불러오기
      reject(new Error('보안 확인 스크립트를 불러오지 못했습니다.'));
    };
    document.head.appendChild(s);
  });
  return scriptPromise;
}

let widgetId: string | undefined;
let pending: { resolve(t: string): void; reject(e: Error): void } | undefined;

export async function getTurnstileToken(): Promise<string> {
  if (!SITE_KEY) return '';
  await loadScript();
  const ts = window.turnstile;
  if (!ts) throw new Error('보안 확인을 시작하지 못했습니다.');

  return new Promise<string>((resolve, reject) => {
    const timer = setTimeout(() => settle(() => reject(new Error('보안 확인 시간이 초과되었습니다. 다시 시도해 주세요.'))), TIMEOUT_MS);
    const settle = (fn: () => void) => {
      clearTimeout(timer);
      pending = undefined;
      fn();
    };
    pending = { resolve: (t) => settle(() => resolve(t)), reject: (e) => settle(() => reject(e)) };

    if (widgetId === undefined) {
      const el = document.createElement('div');
      el.style.cssText = 'position:fixed;right:16px;bottom:16px;z-index:50';
      document.body.appendChild(el);
      widgetId = ts.render(el, {
        sitekey: SITE_KEY,
        execution: 'execute',
        appearance: 'interaction-only',
        callback: (t: string) => pending?.resolve(t),
        'error-callback': () => pending?.reject(new Error('보안 확인에 실패했습니다.')),
        'timeout-callback': () => pending?.reject(new Error('보안 확인 시간이 초과되었습니다. 다시 시도해 주세요.')),
      });
    } else {
      ts.reset(widgetId);
    }
    ts.execute(widgetId);
  });
}
