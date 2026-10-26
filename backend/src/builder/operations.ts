import { createHash } from 'node:crypto';

import type { Phase2Store } from './phase2Store.js';
import type { BuilderService } from './service.js';
import { BuilderError, type ExternalAction, type ExternalOperation, type ExternalProvider } from './types.js';

/**
 * The shared approval lifecycle for external operations: prepare (persist the exact plan and its
 * digest BEFORE any provider call), approve (an explicit user request quoting the digest, expiring),
 * claim (database-arbitrated single in-flight slot) and finish. Every customer-owned Supabase and
 * Vercel change uses it, so no provider code can skip a step.
 */

export const APPROVAL_TTL_MS = 15 * 60 * 1000;

const stable = (value: unknown): string => {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>).filter(([, v]) => v !== undefined).sort(([a], [b]) => (a < b ? -1 : 1)).map(([k, v]) => `${JSON.stringify(k)}:${stable(v)}`).join(',')}}`;
  }
  return JSON.stringify(value);
};

export const digestOf = (plan: unknown): string => createHash('sha256').update(stable(plan)).digest('hex');
export const markerFor = (projectId: string, operationKey: string): string => `xroga-op:${createHash('sha256').update(`${projectId}:${operationKey}`).digest('hex').slice(0, 12)}`;

export interface OperationDeps {
  readonly phase2: Phase2Store;
  readonly builder: BuilderService;
  readonly now?: () => Date;
}

export class OperationRunner {
  constructor(private readonly deps: OperationDeps) {}

  now(): Date {
    return (this.deps.now ?? (() => new Date()))();
  }

  async prepare(userId: string, projectId: string, input: { provider: ExternalProvider; action: ExternalAction; operationKey: string; revisionId: string; plan: Record<string, unknown> }) {
    const created = await this.deps.phase2.createOperation(userId, projectId, {
      provider: input.provider, action: input.action, operationKey: input.operationKey, revisionId: input.revisionId, plan: input.plan, planDigest: digestOf(input.plan),
    });
    if (!created) throw new BuilderError('not_found', 'Project not found.');
    return { operation: created.operation, created: created.created, requiresApproval: created.operation.status === 'prepared' };
  }

  async require(userId: string, projectId: string, operationId: string): Promise<ExternalOperation> {
    await this.deps.builder.requireProject(userId, projectId);
    const operation = await this.deps.phase2.getOperation(userId, projectId, operationId);
    if (!operation) throw new BuilderError('not_found', 'Operation not found.');
    return operation;
  }

  async approve(userId: string, projectId: string, operationId: string, input: { digest: string }): Promise<ExternalOperation> {
    const operation = await this.require(userId, projectId, operationId);
    if (input.digest !== operation.planDigest || digestOf(operation.plan) !== operation.planDigest) {
      throw new BuilderError('conflict', 'The approval does not match the plan that was prepared. Review the plan and approve it again.');
    }
    const expires = new Date(this.now().getTime() + APPROVAL_TTL_MS).toISOString();
    const moved = await this.deps.phase2.transitionOperation(userId, projectId, operationId, ['prepared', 'failed', 'ambiguous'], 'approved', { approvedAt: this.now().toISOString(), approvalExpiresAt: expires, failure: null });
    if (!moved) {
      const current = await this.require(userId, projectId, operationId);
      if (current.status === 'approved') return current;
      throw new BuilderError('conflict', `This operation is ${current.status} and cannot be approved.`);
    }
    return moved;
  }

  async cancel(userId: string, projectId: string, operationId: string): Promise<ExternalOperation> {
    const moved = await this.deps.phase2.transitionOperation(userId, projectId, operationId, ['prepared', 'approved', 'failed', 'ambiguous'], 'cancelled', { failure: 'Cancelled by the user.' });
    if (!moved) throw new BuilderError('conflict', 'This operation can no longer be cancelled.');
    return moved;
  }

  /**
   * Validates that an operation may run now and claims the single in-flight slot. Returns the claimed
   * operation, or the finished one for a replay (`replay: true`) without claiming anything.
   */
  async claim(userId: string, projectId: string, operationId: string, expected: { provider: ExternalProvider; action: ExternalAction }): Promise<{ operation: ExternalOperation; replay: boolean }> {
    const operation = await this.require(userId, projectId, operationId);
    if (operation.provider !== expected.provider || operation.action !== expected.action) throw new BuilderError('not_found', 'Operation not found.');
    if (operation.status === 'succeeded') return { operation, replay: true };
    if (operation.status === 'executing') throw new BuilderError('conflict', 'This operation is already running.');
    if (operation.status !== 'approved') throw new BuilderError('conflict', `This operation is ${operation.status}. It needs your explicit approval before it can run.`);
    if (!operation.approvalExpiresAt || new Date(operation.approvalExpiresAt).getTime() <= this.now().getTime()) {
      await this.deps.phase2.transitionOperation(userId, projectId, operationId, ['approved'], 'cancelled', { failure: 'The approval expired before the operation ran. Prepare it again.' });
      throw new BuilderError('conflict', 'The approval expired. Prepare the operation again and approve it.');
    }
    if (digestOf(operation.plan) !== operation.planDigest) throw new BuilderError('conflict', 'The stored plan no longer matches its approved digest.');
    const claimed = await this.deps.phase2.transitionOperation(userId, projectId, operationId, ['approved'], 'executing');
    if (!claimed) throw new BuilderError('conflict', 'This operation is already running or finished.');
    return { operation: claimed, replay: false };
  }

  async succeed(userId: string, projectId: string, operationId: string, receipt: Record<string, unknown>): Promise<ExternalOperation> {
    const done = await this.deps.phase2.transitionOperation(userId, projectId, operationId, ['executing'], 'succeeded', { receipt });
    if (!done) throw new BuilderError('storage_failed', 'The change was made but its receipt could not be recorded. Retry to reconcile.');
    return done;
  }

  async fail(userId: string, projectId: string, operationId: string, status: 'failed' | 'ambiguous' | 'diverged', message: string, receipt?: Record<string, unknown>): Promise<never> {
    await this.deps.phase2.transitionOperation(userId, projectId, operationId, ['executing'], status, { failure: message.slice(0, 500), ...(receipt ? { receipt } : {}) });
    throw new BuilderError(status === 'diverged' ? 'conflict' : 'storage_failed', message);
  }

  async list(userId: string, projectId: string, provider: ExternalProvider): Promise<ExternalOperation[]> {
    await this.deps.builder.requireProject(userId, projectId);
    return (await this.deps.phase2.listOperations(userId, projectId)).filter((operation) => operation.provider === provider);
  }

  /** Succeeded operations of a provider, oldest first. */
  async succeeded(userId: string, projectId: string, provider: ExternalProvider): Promise<ExternalOperation[]> {
    return (await this.list(userId, projectId, provider)).filter((operation) => operation.status === 'succeeded' && operation.receipt).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }
}
