import { createRemoteJWKSet, jwtVerify, type JWTVerifyOptions } from 'jose';

let jwks: ReturnType<typeof createRemoteJWKSet> | null = null;
let cachedIssuer: string | null = null;

function getSupabaseAuthBase(): string {
  const url = process.env.SUPABASE_URL?.replace(/\/$/, '');
  if (!url) {
    throw new Error('SUPABASE_URL must be set on the API server');
  }
  return `${url}/auth/v1`;
}

function getJwks(): ReturnType<typeof createRemoteJWKSet> {
  const authBase = getSupabaseAuthBase();
  if (!jwks || cachedIssuer !== authBase) {
    jwks = createRemoteJWKSet(new URL(`${authBase}/.well-known/jwks.json`));
    cachedIssuer = authBase;
  }
  return jwks;
}

export interface VerifiedUser {
  userId: string;
  email?: string;
}

/**
 * Verify a Supabase access token via public JWKS.
 * Only requires SUPABASE_URL on the server (no anon/service keys needed for verification).
 */
export async function verifySupabaseAccessToken(token: string): Promise<VerifiedUser> {
  const issuer = getSupabaseAuthBase();
  const verifyOptions: JWTVerifyOptions = {
    issuer,
    audience: 'authenticated',
  };

  try {
    const { payload } = await jwtVerify(token, getJwks(), verifyOptions);
    if (!payload.sub) {
      throw new Error('Token missing subject');
    }
    return {
      userId: payload.sub,
      email: typeof payload.email === 'string' ? payload.email : undefined,
    };
  } catch (err) {
    // Some legacy tokens use aud as array or omit strict audience
    const { payload } = await jwtVerify(token, getJwks(), { issuer });
    if (!payload.sub) {
      throw err instanceof Error ? err : new Error('Invalid token');
    }
    return {
      userId: payload.sub,
      email: typeof payload.email === 'string' ? payload.email : undefined,
    };
  }
}
