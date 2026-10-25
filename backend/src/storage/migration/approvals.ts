import { createHash, createPrivateKey, createPublicKey, generateKeyPairSync, sign, verify } from 'node:crypto';
import type { Stage } from './types.js';

/**
 * Signed, scoped, expiring operator approvals (Ed25519).
 *
 * The approver holds the PRIVATE key (an operator's machine / HSM). The system that runs migrations holds only the PUBLIC key
 * (`STORAGE_MIGRATION_APPROVER_PUBKEY`). A flag, an environment variable, a JSON field or a database row can therefore not grant
 * approval: without the private key there is no valid signature. An approval is bound to one job, one stage, one environment, one
 * source/destination pair, the exact plan digest (so new or changed source objects invalidate it), an expiry, and optionally a
 * set of tenants.
 */
export type Environment = 'test' | 'staging' | 'production';

export interface ApprovalClaims {
  v: 1;
  jobId: string;
  stage: Stage;
  operator: string;
  environment: Environment;
  sourceProvider: string;
  destinationBucket: string;
  planDigest: string;
  issuedAt: number;
  expiresAt: number;
  /** when present, only objects owned by these tenants may be processed */
  tenantScope?: string[];
}

const b64u = (b: Buffer) => b.toString('base64url');

export function generateApproverKeyPair(): { publicKeyPem: string; privateKeyPem: string } {
  const { publicKey, privateKey } = generateKeyPairSync('ed25519');
  return { publicKeyPem: publicKey.export({ type: 'spki', format: 'pem' }).toString(), privateKeyPem: privateKey.export({ type: 'pkcs8', format: 'pem' }).toString() };
}

export function signApproval(privateKeyPem: string, claims: ApprovalClaims): string {
  const payload = Buffer.from(JSON.stringify(claims));
  return `${b64u(payload)}.${b64u(sign(null, payload, createPrivateKey(privateKeyPem)))}`;
}

export interface ApprovalExpectation {
  jobId: string;
  stage: Stage;
  environment: Environment;
  sourceProvider: string;
  destinationBucket: string;
  planDigest: string | null;
  now: number;
}

export type ApprovalVerdict = { ok: true; claims: ApprovalClaims } | { ok: false; reason: string };

export function verifyApproval(publicKeyPem: string, token: unknown, e: ApprovalExpectation): ApprovalVerdict {
  if (typeof token !== 'string' || token.split('.').length !== 2) return { ok: false, reason: 'MALFORMED' };
  const [p, s] = token.split('.');
  let claims: ApprovalClaims;
  try {
    const payload = Buffer.from(p, 'base64url');
    if (!verify(null, payload, createPublicKey(publicKeyPem), Buffer.from(s, 'base64url'))) return { ok: false, reason: 'BAD_SIGNATURE' };
    claims = JSON.parse(payload.toString());
  } catch { return { ok: false, reason: 'MALFORMED' }; }
  if (claims.v !== 1) return { ok: false, reason: 'VERSION' };
  if (claims.jobId !== e.jobId) return { ok: false, reason: 'WRONG_JOB' };
  if (claims.stage !== e.stage) return { ok: false, reason: 'WRONG_STAGE' };
  if (claims.environment !== e.environment) return { ok: false, reason: 'WRONG_ENVIRONMENT' };
  if (claims.sourceProvider !== e.sourceProvider || claims.destinationBucket !== e.destinationBucket) return { ok: false, reason: 'WRONG_SCOPE' };
  if (e.planDigest === null) return { ok: false, reason: 'NO_PLAN' };
  if (claims.planDigest !== e.planDigest) return { ok: false, reason: 'PLAN_CHANGED' };
  if (!(claims.expiresAt > e.now) || claims.issuedAt > e.now + 60_000) return { ok: false, reason: 'EXPIRED' };
  if (claims.tenantScope && (!Array.isArray(claims.tenantScope) || claims.tenantScope.some((t) => typeof t !== 'string'))) return { ok: false, reason: 'MALFORMED' };
  return { ok: true, claims };
}

/** Order-independent digest of the exact objects a plan covers. */
export function planDigest(items: Array<{ sourceId: string; fingerprint: string | null; size: number | null }>): string {
  const h = createHash('sha256');
  for (const i of [...items].sort((a, b) => (a.sourceId < b.sourceId ? -1 : 1))) h.update(`${i.sourceId}\u0000${i.fingerprint ?? ''}\u0000${i.size ?? ''}\n`);
  return h.digest('hex');
}
