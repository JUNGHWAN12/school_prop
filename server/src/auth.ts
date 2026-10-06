/** 공용 접속 코드 → 서명된 세션 토큰 (Web Crypto, Workers/Node 공용). 코드가 바뀌면 기존 토큰은 모두 무효. */
const enc = new TextEncoder();
const b64url = (b: ArrayBuffer | Uint8Array) =>
  btoa(String.fromCharCode(...new Uint8Array(b))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

async function sign(secret: string, data: string) {
  const key = await crypto.subtle.importKey('raw', enc.encode(`edu-approval:${secret}`), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return b64url(await crypto.subtle.sign('HMAC', key, enc.encode(data)));
}

export function safeEqual(a: string, b: string): boolean {
  const x = enc.encode(a);
  const y = enc.encode(b);
  let diff = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i++) diff |= (x[i] ?? 0) ^ (y[i] ?? 0);
  return diff === 0;
}

export async function issueToken(secret: string, ttlMs = 8 * 3600_000, now = Date.now()) {
  const payload = String(now + ttlMs);
  return `${payload}.${await sign(secret, payload)}`;
}

export async function verifyToken(secret: string, token: string, now = Date.now()) {
  const [payload, sig] = token.split('.');
  if (!payload || !sig) return false;
  if (!safeEqual(sig, await sign(secret, payload))) return false;
  return Number(payload) > now;
}
