import { generateApproverKeyPair, signApproval, type ApprovalClaims, type Environment } from '../migration/approvals.js';
import type { MigrationLedger } from '../migration/ledger.js';
import type { Stage } from '../migration/types.js';

export const KEYS = generateApproverKeyPair();
export const OTHER_KEYS = generateApproverKeyPair();
export const TEST_APPROVAL = { publicKeyPem: KEYS.publicKeyPem, environment: 'test' as Environment };

/** Signs and stores an approval for the job's CURRENT plan (what an operator would do after reading the dry run). */
export async function approve(
  ledger: MigrationLedger, jobId: string, stage: Stage,
  o: { keys?: { privateKeyPem: string }; operator?: string; environment?: Environment; ttlMs?: number; now?: number; tenantScope?: string[]; digest?: string; jobIdClaim?: string } = {},
): Promise<string> {
  const job = await ledger.getJob(jobId);
  if (!job) throw new Error('job not found');
  const now = o.now ?? Date.now();
  const claims: ApprovalClaims = {
    v: 1, jobId: o.jobIdClaim ?? jobId, stage, operator: o.operator ?? 'test-operator', environment: o.environment ?? 'test',
    sourceProvider: job.sourceProvider, destinationBucket: job.destinationBucket, planDigest: o.digest ?? job.plan?.digest ?? 'no-plan',
    issuedAt: now, expiresAt: now + (o.ttlMs ?? 24 * 3600_000), tenantScope: o.tenantScope,
  };
  const token = signApproval((o.keys ?? KEYS).privateKeyPem, claims);
  await ledger.approve(jobId, stage, token);
  return token;
}
