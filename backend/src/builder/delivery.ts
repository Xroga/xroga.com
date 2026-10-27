import type { ExternalOperation } from './types.js';

/**
 * Delivery provenance: for each source revision, what actually reached each provider, and how far
 * each claim has been verified. It only reports what operation receipts record; it never infers a
 * deployment, repository or database that has no receipt.
 *
 * Verification levels follow the specification:
 *   RECORDED           the provider operation succeeded and its receipt was verified read-back
 *   NOT_ATTEMPTED      no operation exists for this step
 *   FAILED / PENDING   an operation exists but did not complete
 */

export type DeliveryLevel = 'RECORDED' | 'PENDING' | 'FAILED' | 'NOT_ATTEMPTED';

export interface DeliveryStep {
  readonly level: DeliveryLevel;
  readonly operationId: string | null;
  readonly detail: string;
  readonly link: string | null;
}

export interface RevisionDelivery {
  readonly revisionId: string;
  readonly revisionNumber: number | null;
  readonly github: DeliveryStep;
  readonly supabase: DeliveryStep;
  readonly vercelPreview: DeliveryStep;
  readonly remoteTests: DeliveryStep;
  readonly production: DeliveryStep;
}

const none = (detail: string): DeliveryStep => ({ level: 'NOT_ATTEMPTED', operationId: null, detail, link: null });

function stepFrom(operations: readonly ExternalOperation[], describe: (operation: ExternalOperation) => { detail: string; link: string | null }, absent: string): DeliveryStep {
  if (operations.length === 0) return none(absent);
  const ordered = [...operations].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const done = ordered.find((operation) => operation.status === 'succeeded');
  if (done) return { level: 'RECORDED', operationId: done.id, ...describe(done) };
  const latest = ordered[0];
  const open = ['prepared', 'approved', 'executing', 'ambiguous'].includes(latest.status);
  return { level: open ? 'PENDING' : 'FAILED', operationId: latest.id, detail: `${latest.status}${latest.failure ? `: ${latest.failure}` : ''}`, link: null };
}

export function deliveryByRevision(operations: readonly ExternalOperation[], revisions: ReadonlyArray<{ id: string; revisionNumber: number }>): RevisionDelivery[] {
  const numbers = new Map(revisions.map((revision) => [revision.id, revision.revisionNumber]));
  const revisionIds = [...new Set([...revisions.map((revision) => revision.id), ...operations.map((operation) => operation.revisionId)])];
  return revisionIds
    .map((revisionId): RevisionDelivery => {
      const mine = operations.filter((operation) => operation.revisionId === revisionId);
      const by = (provider: string, action: string) => mine.filter((operation) => operation.provider === provider && operation.action === action);
      const previews = by('vercel', 'deploy_preview');
      const latestPreview = [...previews].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).find((operation) => operation.status === 'succeeded');
      const remote = latestPreview?.receipt?.remote as { status?: string; reason?: string } | undefined;
      return {
        revisionId,
        revisionNumber: numbers.get(revisionId) ?? null,
        github: stepFrom([...by('github', 'create_repository'), ...by('github', 'push_revision')], (operation) => {
          const receipt = operation.receipt as { repository?: { owner?: string; name?: string; url?: string }; commit?: { sha?: string } } | null;
          return { detail: `${receipt?.repository?.owner}/${receipt?.repository?.name} at ${String(receipt?.commit?.sha ?? '').slice(0, 7)}`, link: receipt?.repository?.url ?? null };
        }, 'Not exported to GitHub.'),
        supabase: stepFrom(by('supabase', 'apply_migration'), (operation) => {
          const receipt = operation.receipt as { projectRef?: string; tables?: string[] } | null;
          return { detail: `Schema (${(receipt?.tables ?? []).join(', ')}) applied and read back in project ${receipt?.projectRef}`, link: null };
        }, 'No customer database schema applied.'),
        vercelPreview: stepFrom(previews, (operation) => {
          const receipt = operation.receipt as { deployment?: { url?: string; id?: string } } | null;
          return { detail: `Preview ${receipt?.deployment?.id}`, link: receipt?.deployment?.url ?? null };
        }, 'No preview deployed.'),
        remoteTests: latestPreview
          ? { level: remote?.status === 'passed' ? 'RECORDED' : remote?.status === 'failed' ? 'FAILED' : 'PENDING', operationId: latestPreview.id, detail: `${remote?.status ?? 'unknown'}: ${remote?.reason ?? ''}`, link: null }
          : none('No deployed preview to test.'),
        production: stepFrom(by('vercel', 'promote_production'), (operation) => {
          const receipt = operation.receipt as { production?: { url?: string } } | null;
          return { detail: 'Published and read-only verified', link: receipt?.production?.url ?? null };
        }, 'Not published to production.'),
      };
    })
    .sort((a, b) => (b.revisionNumber ?? 0) - (a.revisionNumber ?? 0));
}
