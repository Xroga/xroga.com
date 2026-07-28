import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

interface OAuthStatePayload {
  sub: string;
  exp: number;
  nonce: string;
}

function signature(payload: string, secret: string): Buffer {
  return createHmac('sha256', secret).update(payload).digest();
}

export function createOAuthState(
  userId: string,
  secret: string,
  now = Date.now(),
): string {
  if (!secret) throw new Error('OAuth state secret is required');
  const payload = Buffer.from(JSON.stringify({
    sub: userId,
    exp: now + 10 * 60_000,
    nonce: randomBytes(18).toString('base64url'),
  } satisfies OAuthStatePayload)).toString('base64url');
  return `${payload}.${signature(payload, secret).toString('base64url')}`;
}

export function verifyOAuthState(
  value: string,
  expectedUserId: string,
  secret: string,
  now = Date.now(),
): boolean {
  try {
    const [payload, encodedSignature, extra] = value.split('.');
    if (!payload || !encodedSignature || extra || !secret) return false;
    const received = Buffer.from(encodedSignature, 'base64url');
    const expected = signature(payload, secret);
    if (received.length !== expected.length || !timingSafeEqual(received, expected)) return false;
    const parsed = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as Partial<OAuthStatePayload>;
    return parsed.sub === expectedUserId
      && typeof parsed.exp === 'number'
      && parsed.exp >= now
      && parsed.exp <= now + 10 * 60_000
      && typeof parsed.nonce === 'string'
      && parsed.nonce.length >= 16;
  } catch {
    return false;
  }
}
