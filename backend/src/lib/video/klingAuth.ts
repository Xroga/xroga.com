import { SignJWT } from 'jose';
import { getSecret } from '../../config/envSecrets.js';

function looksLikeJwt(value: string): boolean {
  return value.split('.').length === 3 && value.length > 40;
}

/** Kling official API uses short-lived HS256 JWT from access key + secret key */
export async function getKlingBearerToken(): Promise<string> {
  const accessKey = getSecret('KLING_API_KEY') ?? getSecret('KLING_ACCESS_KEY');
  const secretKey = getSecret('KLING_API_SECRET') ?? getSecret('KLING_SECRET_KEY');

  if (!accessKey) throw new Error('KLING_API_KEY not configured');

  if (!secretKey) {
    if (looksLikeJwt(accessKey)) return accessKey;
    throw new Error('KLING_API_SECRET required for JWT auth');
  }

  const now = Math.floor(Date.now() / 1000);
  return new SignJWT({})
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .setIssuer(accessKey)
    .setIssuedAt(now)
    .setNotBefore(now - 5)
    .setExpirationTime(now + 1800)
    .sign(new TextEncoder().encode(secretKey));
}

export function isKlingConfigured(): boolean {
  const accessKey = getSecret('KLING_API_KEY') ?? getSecret('KLING_ACCESS_KEY');
  const secretKey = getSecret('KLING_API_SECRET') ?? getSecret('KLING_SECRET_KEY');
  if (!accessKey) return false;
  if (secretKey) return true;
  return looksLikeJwt(accessKey);
}
