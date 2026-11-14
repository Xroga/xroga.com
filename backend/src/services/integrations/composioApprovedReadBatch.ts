/**
 * Bounded concurrent execution of independently approved connected-app reads.
 * This is NOT Composio's unrestricted MULTI_EXECUTE meta-tool: every operation
 * reuses Xroga's existing single-action permit, account, egress and receipt
 * validation. Nothing in this module grants a new approval or tool privilege.
 */
import { preparedActionDigest } from '../../security/authority/digest.js';
import { requireTenantContext, type TenantContext } from '../../security/tenantContext.js';
import { confirmBusinessAction, getBusinessActionConfirmation } from './businessActionConfirmations.js';
import { assertAuthorityPermit, authorityContextForPermit } from '../../security/authority/enforce.js';
import type { AuthorityDispatchBinding, AuthorityPermit } from '../../security/authority/types.js';
import {
  classifyComposioToolRisk, ComposioClientError,
  executeComposioActionTool, getComposioToolDetails,
  type ComposioExecuteResponse,
} from './composioClient.js';

const MAX_BATCH_READS = 3;

interface ApprovedRead {
  sessionId: string;
  useCase: string;
  toolSlug: string;
  arguments: Record<string, unknown>;
  authorityPermit: AuthorityPermit;
  authorityBinding: AuthorityDispatchBinding;
}

export type ApprovedReadBatchResult =
  | { index: number; toolSlug: string; status: 'completed'; response: ComposioExecuteResponse }
  | { index: number; toolSlug: string; status: 'failed'; errorCode: string };

/** Pure admission check used before any remote metadata request. */
export function validateReadBatchTargets(
  tasks: readonly Pick<ApprovedRead, 'sessionId' | 'toolSlug' | 'useCase' | 'arguments'>[],
): void {
  if (!Array.isArray(tasks) || tasks.length < 2 || tasks.length > MAX_BATCH_READS) {
    throw new ComposioClientError('A batch must contain two or three independent reads.', {
      status: 422, code: 'COMPOSIO_READ_BATCH_SIZE',
    });
  }
  const seen = new Set<string>();
  for (const task of tasks) {
    if (!task || typeof task.sessionId !== 'string' || !/^trs_[A-Za-z0-9_-]+$/.test(task.sessionId) ||
      typeof task.toolSlug !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9_-]{2,199}$/.test(task.toolSlug) ||
      typeof task.useCase !== 'string' || !task.useCase.trim() || task.useCase.length > 500 ||
      !task.arguments || typeof task.arguments !== 'object' || Array.isArray(task.arguments) ||
      task.toolSlug.toUpperCase().startsWith('COMPOSIO_') ||
      classifyComposioToolRisk(task.toolSlug) !== 'read') {
      throw new ComposioClientError('Only exact, independently authorized read actions may be batched.', {
        status: 403, code: 'COMPOSIO_READ_BATCH_TOOL_BLOCKED',
      });
    }
    const key = preparedActionDigest({
      sessionId: task.sessionId, toolSlug: task.toolSlug, arguments: task.arguments,
      useCase: task.useCase,
    });
    if (seen.has(key)) {
      throw new ComposioClientError('Duplicate read action in the same batch.', {
        status: 422, code: 'COMPOSIO_READ_BATCH_DUPLICATE',
      });
    }
    seen.add(key);
  }
}

/**
 * The caller must obtain the existing exact-action permits through Xroga's
 * authorization flow. No permits, no batch. No write/destructive/meta tools.
 *
 * All authority and metadata checks complete BEFORE any provider dispatch.
 * Individual existing single-action executors then consume their own permits
 * and independently recheck connected accounts and Egress decisions.
 *
 * A completed read may coexist with another failed read. No automatic retries.
 */
export async function executeApprovedComposioReadBatch(
  userId: string,
  tasks: readonly ApprovedRead[],
  signal?: AbortSignal,
): Promise<ApprovedReadBatchResult[]> {
  signal?.throwIfAborted();
  validateReadBatchTargets(tasks);
  if (typeof userId !== 'string' || !userId.trim()) {
    throw new ComposioClientError('Authenticated user required for connected-app reads.', {
      status: 401, code: 'COMPOSIO_READ_BATCH_USER_REQUIRED',
    });
  }
  const immutableTasks = tasks.map((task) => ({
    ...task,
    arguments: structuredClone(task.arguments),
    authorityBinding: { ...task.authorityBinding },
  }));
  const actors = immutableTasks.map((task) => {
    const exact = { ...task.authorityBinding, userId, operation: task.toolSlug,
      targetDigest: preparedActionDigest({
        sessionId: task.sessionId, useCase: task.useCase,
        toolSlug: task.toolSlug, arguments: task.arguments,
      }),
    };
    assertAuthorityPermit(task.authorityPermit, exact);
    return authorityContextForPermit(task.authorityPermit, exact);
  });
  // Metadata is untrusted and cannot downgrade a risky operation into a read.
  // A single unsafe or unavailable tool blocks the entire batch pre-dispatch.
  const details = await Promise.all(immutableTasks.map((task, index) =>
    getComposioToolDetails(task.toolSlug, actors[index])));
  for (let i = 0; i < details.length; i++) {
    if (details[i]!.slug !== immutableTasks[i]!.toolSlug ||
      details[i]!.toolkit.toLowerCase() !== immutableTasks[i]!.authorityBinding.provider.toLowerCase() ||
      details[i]!.risk !== 'read' || details[i]!.deprecated) {
      throw new ComposioClientError('A requested read is not approved for concurrent execution.', {
        status: 403, code: 'COMPOSIO_READ_BATCH_METADATA_BLOCKED',
      });
    }
  }
  signal?.throwIfAborted();
  const outcomes = await Promise.allSettled(immutableTasks.map((task) =>
    executeComposioActionTool(userId, {
      ...task, authorization: { confirmed: true }, signal,
    })));
  return outcomes.map((outcome, index): ApprovedReadBatchResult => {
    const toolSlug = immutableTasks[index]!.toolSlug;
    if (outcome.status === 'fulfilled' && !outcome.value.error &&
        !outcome.value.needsConfirmation) {
      return { index, toolSlug, status: 'completed', response: outcome.value };
    }
    const errorCode = outcome.status === 'rejected' && outcome.reason instanceof ComposioClientError
      ? outcome.reason.code : 'COMPOSIO_READ_BATCH_ITEM_FAILED';
    return { index, toolSlug, status: 'failed', errorCode };
  });
}

/** Exact user-reviewed inputs. Every item must match the already displayed
 * persisted approval digest and account, before any operation is dispatched.
 */
export interface ReviewedComposioRead {
  id: string;
  actionDigest: string;
  accountReference: string;
}

export function validateReviewedComposioReadBatch(items: readonly ReviewedComposioRead[]): void {
  if (!Array.isArray(items) || items.length < 2 || items.length > 3) {
    throw new ComposioClientError('Review two or three read actions before approving them together.', {
      status: 422, code: 'COMPOSIO_REVIEWED_READ_BATCH_SIZE',
    });
  }
  const ids = new Set<string>();
  for (const item of items) {
    if (!item || typeof item.id !== 'string' ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(item.id) ||
      typeof item.actionDigest !== 'string' || !/^[a-f0-9]{64}$/.test(item.actionDigest) ||
      typeof item.accountReference !== 'string' || !item.accountReference.trim() ||
      item.accountReference.length > 180 || ids.has(item.id.toLowerCase())) {
      throw new ComposioClientError('The exact read approvals are missing or duplicated.', {
        status: 422, code: 'COMPOSIO_REVIEWED_READ_BATCH_INVALID',
      });
    }
    ids.add(item.id.toLowerCase());
  }
}

export type ReviewedReadBatchOutcome =
  | { id: string; status: 'completed'; confirmation: Awaited<ReturnType<typeof confirmBusinessAction>>['confirmation'];
      execution: Awaited<ReturnType<typeof confirmBusinessAction>>['execution'] }
  | { id: string; status: 'failed'; errorCode: string };

/**
 * The reachable batch entrypoint. Confirmation claims, authority permits,
 * tenant+account revalidation, egress and receipts remain inside the existing
 * approved single-action executor, run concurrently for independent READS.
 * Writes/destructive/unknown/meta tools are always rejected pre-dispatch.
 */
export async function confirmReviewedComposioReadBatch(
  context: TenantContext, reviewed: readonly ReviewedComposioRead[],
): Promise<ReviewedReadBatchOutcome[]> {
  const { userId } = requireTenantContext(context);
  validateReviewedComposioReadBatch(reviewed);
  const confirmations = await Promise.all(reviewed.map((item) =>
    getBusinessActionConfirmation(userId, item.id)));
  for (let i = 0; i < confirmations.length; i++) {
    const found = confirmations[i]!;
    const expected = reviewed[i]!;
    if (found.id.toLowerCase() !== expected.id.toLowerCase() ||
      found.status !== 'pending' || Date.parse(found.expiresAt) <= Date.now() ||
      found.risk !== 'read' || !found.approval ||
      found.approval.actionDigest !== expected.actionDigest ||
      found.approval.accountReference !== expected.accountReference ||
      found.approval.operation !== found.toolSlug ||
      !found.toolSlug || found.toolSlug.toUpperCase().startsWith('COMPOSIO_') ||
      classifyComposioToolRisk(found.toolSlug) !== 'read') {
      throw new ComposioClientError('The reviewed connected-app read changed. Review each action again.', {
        status: 409, code: 'COMPOSIO_REVIEWED_READ_CHANGED',
      });
    }
  }
  // Provider metadata can change after a user first reviewed a confirmation.
  // Revalidate ALL candidate tools before issuing ANY concurrent provider calls.
  const details = await Promise.all(confirmations.map((item) =>
    getComposioToolDetails(item.toolSlug!, context)));
  for (let i = 0; i < details.length; i++) {
    if (details[i]!.slug !== confirmations[i]!.toolSlug ||
      details[i]!.toolkit.toLowerCase() !== confirmations[i]!.toolkit.toLowerCase() ||
      details[i]!.risk !== 'read' || details[i]!.deprecated) {
      throw new ComposioClientError('The reviewed read tool changed. Review each action again.', {
        status: 409, code: 'COMPOSIO_REVIEWED_READ_METADATA_CHANGED',
      });
    }
  }
  // Each confirmation's independent durable claim prevents replay, even if
  // another request attempts the same grant concurrently.
  const results = await Promise.allSettled(confirmations.map((item) =>
    confirmBusinessAction(context, item.id, {
      toolkit: item.toolkit, toolSlug: item.toolSlug!,
    })));
  return results.map((result, index): ReviewedReadBatchOutcome => {
    if (result.status === 'fulfilled') {
      return { id: confirmations[index]!.id, status: 'completed',
        confirmation: result.value.confirmation, execution: result.value.execution };
    }
    return { id: confirmations[index]!.id, status: 'failed',
      errorCode: result.reason instanceof ComposioClientError
        ? result.reason.code : 'COMPOSIO_REVIEWED_READ_FAILED' };
  });
}
