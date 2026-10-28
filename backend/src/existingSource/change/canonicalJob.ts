/**
 * Runs one existing-project change inside the canonical Cloud Run Job, under the claim's admitted run attempt.
 * The Job entrypoint owns claiming, cancellation polling and terminal run authority; this function owns only the change.
 */
import type { AgentSoftwareExecutorInput } from '../../ai/softwareAgent/AgentSoftwareExecutor.js';
import { ExistingSourceError } from '../types.js';
import type { ExistingSourceIntelligence } from '../intelligence/service.js';
import type { ExistingSourceService } from '../service.js';
import type { CanonicalDeliveryClaim } from '../../workers/googleDeliveryStore.js';
import type { TenantContext } from '../../security/tenantContext.js';
import { canonicalExecutionPort, canonicalRunFor } from './canonical.js';
import { ChangeService, type AgentRunner } from './service.js';
import type { ChangeStore } from './store.js';
import type { ExecutionPort } from './testRunner.js';
import { TERMINAL, type ChangeStatus } from './types.js';

export interface ChangeJobDeps {
  readonly source: ExistingSourceService;
  readonly intel: ExistingSourceIntelligence;
  readonly store: ChangeStore;
  readonly runAgent: AgentRunner;
  readonly modelRouteFor: (userId: string, runId: string) => Promise<AgentSoftwareExecutorInput['model']>;
  /** Makes the claim's run attempt the current one. The Job entrypoint's duplicate and cancelled deliveries never reach here. */
  readonly adoptRun: (claim: CanonicalDeliveryClaim) => Promise<unknown>;
  readonly executionFor?: (run: ReturnType<typeof canonicalRunFor>) => ExecutionPort;
}

async function productionDeps(context: TenantContext): Promise<ChangeJobDeps> {
  const [routes, production, storeModule, runStore] = await Promise.all([
    import('../../routes/existingSource.js'), import('./production.js'), import('./store.js'), import('../../ai/runStore.js'),
  ]);
  const source = routes.defaultExistingSourceService(context);
  return {
    source, intel: routes.defaultExistingSourceIntelligence(context, source), store: new storeModule.SupabaseChangeStore(context),
    runAgent: production.productionAgentRunner, modelRouteFor: production.selectCodingModelRoute, adoptRun: runStore.adoptQueuedRunDurable,
  };
}

export async function runExistingSourceChangeJob(input: {
  readonly context: TenantContext;
  readonly claim: CanonicalDeliveryClaim;
  readonly changeId: string;
  readonly signal: AbortSignal;
  readonly progress?: (event: Record<string, unknown>) => void;
  readonly deps?: ChangeJobDeps;
}): Promise<{ readonly success: boolean; readonly status: ChangeStatus }> {
  const { context, claim, changeId, signal } = input;
  const userId = context.userId;
  if (claim.userId !== userId) throw new ExistingSourceError('CHANGE_NOT_FOUND', 'Change not found.');
  const deps = input.deps ?? await productionDeps(context);

  const task = await deps.store.get(userId, changeId);
  if (!task) throw new ExistingSourceError('CHANGE_NOT_FOUND', 'Change not found.');
  // the change must have been queued for exactly this run, so a delivery can never execute a change it was not created for
  if (task.canonicalRunId !== claim.runId) throw new ExistingSourceError('CHANGE_CONFLICT', 'This change is not linked to this run.');
  if (TERMINAL.includes(task.status)) return { success: task.status === 'verified' || task.status === 'delivered', status: task.status };

  const { binding } = await deps.source.activeBinding(userId, task.bindingId);
  if (binding.baseCommitSha !== task.baseCommitSha) throw new ExistingSourceError('CHANGE_CONFLICT', 'The linked commit changed after this change was requested. Create the change again.');
  await deps.adoptRun(claim);

  const run = canonicalRunFor(userId, claim.runId, changeId, binding);
  const changes = new ChangeService({
    source: deps.source, intel: deps.intel, store: deps.store, runAgent: deps.runAgent, maxRunningPerOwner: 1,
    execution: deps.executionFor?.(run) ?? canonicalExecutionPort(run),
    modelRouteFor: (owner) => deps.modelRouteFor(owner, claim.runId),
  });
  const onAbort = () => { void changes.cancel(userId, changeId).catch(() => undefined); };
  if (signal.aborted) onAbort(); else signal.addEventListener('abort', onAbort, { once: true });
  input.progress?.({ agent: 'change', status: 'started', message: 'Making the requested change in an isolated copy of the project.' });
  try {
    const finished = await changes.run(userId, changeId);
    input.progress?.({ agent: 'change', status: finished.status, message: finished.statusReason });
    return { success: finished.status === 'verified', status: finished.status };
  } finally {
    signal.removeEventListener('abort', onAbort);
  }
}
