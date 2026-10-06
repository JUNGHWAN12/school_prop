/** Cloudflare Turnstile 서버 검증. 토큰은 1회용이며 siteverify 응답의 success로 판정한다. */
export type TurnstileResult = 'ok' | 'fail' | 'unavailable';

export async function verifyTurnstile(secret: string, token: string, ip: string): Promise<TurnstileResult> {
  try {
    const body = new URLSearchParams({ secret, response: token });
    if (ip && ip !== 'local') body.set('remoteip', ip);
    const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      body,
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return 'unavailable';
    const j = (await res.json()) as { success?: boolean };
    return j.success === true ? 'ok' : 'fail';
  } catch {
    return 'unavailable';
  }
}
