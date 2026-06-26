import { createRemoteJWKSet, jwtVerify, type JWTVerifyOptions } from 'jose';

let jwks: ReturnType<typeof createRemoteJWKSet> | null = null;
let cachedIssuer: string | null = null;

function getSupabaseUrl(): string {
  const url = process.env.SUPABASE_URL?.replace(/\/$/, '');
  if (!url) {
    throw new Error('SUPABASE_URL must be set on the API server');
  }
  return url;
}

function getIssuer(): string {
  return `${getSupabaseUrl()}/auth/v1`;
}

function getJwks(): ReturnType<typeof createRemoteJWKSet> {
  const issuer = getIssuer();
  if (!jwks || cachedIssuer !== issuer) {
    jwks = createRemoteJWKSet(new URL(`${issuer}/.well-known/jwks.json`));
    cachedIssuer = issuer;
  }
  return jwks;
}

export interface VerifiedUser {
  userId: string;
  email?: string;
}

async function verifyWithJwtSecret(token: string): Promise<VerifiedUser | null> {
  const secret = process.env.SUPABASE_JWT_SECRET;
  if (!secret) return null;

  const issuer = getIssuer();
  const key = new TextEncoder().encode(secret);
  const options: JWTVerifyOptions = { issuer, audience: 'authenticated' };

  try {
    const { payload } = await jwtVerify(token, key, options);
    if (!payload.sub) return null;
    return {
      userId: payload.sub,
      email: typeof payload.email === 'string' ? payload.email : undefined,
    };
  } catch {
    try {
      const { payload } = await jwtVerify(token, key, { issuer });
      if (!payload.sub) return null;
      return {
        userId: payload.sub,
        email: typeof payload.email === 'string' ? payload.email : undefined,
      };
    } catch {
      return null;
    }
  }
}

async function verifyWithJwks(token: string): Promise<VerifiedUser | null> {
  const issuer = getIssuer();
  const options: JWTVerifyOptions = { issuer, audience: 'authenticated' };

  try {
    const { payload } = await jwtVerify(token, getJwks(), options);
    if (!payload.sub) return null;
    return {
      userId: payload.sub,
      email: typeof payload.email === 'string' ? payload.email : undefined,
    };
  } catch {
    try {
      const { payload } = await jwtVerify(token, getJwks(), { issuer });
      if (!payload.sub) return null;
      return {
        userId: payload.sub,
        email: typeof payload.email === 'string' ? payload.email : undefined,
      };
    } catch {
      return null;
    }
  }
}

/**
 * Verify Supabase access token.
 * Tries: JWT secret (HS256) → JWKS → caller should fall back to admin getUser().
 */
export async function verifySupabaseAccessToken(token: string): Promise<VerifiedUser> {
  getSupabaseUrl(); // throws if missing

  const fromSecret = await verifyWithJwtSecret(token);
  if (fromSecret) return fromSecret;

  const fromJwks = await verifyWithJwks(token);
  if (fromJwks) return fromJwks;

  throw new Error('Invalid or expired token');
}
