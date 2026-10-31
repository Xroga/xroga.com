import { createPublicKey, verify } from 'node:crypto';

// A job gets a verification key, never the issuer's signing key or API credentials.
// The issuer must consume the attempt under the canonical fenced lease before
// launch. Signature verification alone is NOT replay protection or network isolation.
export function verifyJobEnvelope(envelope, publicKey, expected, now = Date.now()) {
  const deny = () => { throw new Error('BROWSER_JOB_AUTHORIZATION_DENIED'); };
  if (!envelope || typeof envelope.payload !== 'string' || envelope.payload.length > 2 * 1024 * 1024
      || typeof envelope.signature !== 'string' || !/^[A-Za-z0-9+/]{86}==$/.test(envelope.signature)) deny();
  let key;
  try { key = createPublicKey(publicKey); } catch { deny(); }
  if (key.asymmetricKeyType !== 'ed25519' || !verify(null, Buffer.from(envelope.payload), key, Buffer.from(envelope.signature, 'base64'))) deny();
  let value;
  try { value = JSON.parse(envelope.payload); } catch { deny(); }
  const job = value?.start?.job;
  if (!value || typeof value !== 'object' || !expected || typeof expected !== 'object'
      || value.version !== 1 || !Number.isSafeInteger(value.expiresAt) || !Number.isSafeInteger(value.issuedAt)
      || value.issuedAt > now || value.expiresAt <= now || value.expiresAt - value.issuedAt > 600_000
      || !job || !Number.isSafeInteger(value.fence) || value.fence < 1) deny();
  for (const field of ['tenantId', 'userId', 'runId', 'taskId', 'attempt']) {
    if (expected[field] === undefined || job[field] !== expected[field]) deny();
  }
  if (value.fence !== expected.fence || value.executionId !== expected.executionId
      || typeof value.executionId !== 'string' || !/^[a-zA-Z0-9_-]{1,128}$/.test(value.executionId)) deny();
  if (value.start.type !== 'start' || !Number.isSafeInteger(job.limits?.maxDurationMs)
      || job.limits.maxDurationMs < 1 || job.limits.maxDurationMs > value.expiresAt - value.issuedAt
      || job.limits.maxModelCostMicros !== 0 || !Array.isArray(value.start.plan?.steps)
      || value.start.plan.steps.some(step => typeof step?.op !== 'string' || step.op.startsWith('ai'))
      || value.start.plan.writeGrant) deny();
  return value;
}
