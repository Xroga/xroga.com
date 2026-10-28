/**
 * Existing-project changes on Xroga's canonical durable path.
 *
 * Nothing here is a second scheduler or runtime. A change is queued as an ordinary canonical delivery (same outbox, same Cloud Run Job,
 * same claim and generation), runs under that claim's admitted run attempt, and executes commands only through the existing
 * canonical sandbox seam. The Google sandbox admits a command only for a run whose own owner-bound execution state holds the exact
 * files being run, so this module keeps that state in step with the change's working copy: the state is written by the run's own
 * attempt (an attempt-bound, compare-and-set persist), never by an API request, and never with files the change did not hold.
 */
import { createHash } from 'node:crypto';
import type { AdmittedRunAttempt } from '../../ai/runStore.js';
import type { CanonicalExecutionState, ExecutableTaskNode } from '../../ai/executionRuntime.js';
import type { SandboxCaller } from '../../sandbox/google/executionBinding.js';
import type { SandboxExecutionRequest, SandboxExecutionResult } from '../../sandbox/sandboxTypes.js';
import { ExistingSourceError, type SourceBinding } from '../types.js';
import type { ExecutionPort } from './testRunner.js';

/** What the canonical run is for. Every field is read from the verified binding and the persisted change, never from a request. */
export interface CanonicalChangeRun {
  readonly userId: string;
  readonly runId: string;
  readonly changeId: string;
  readonly bindingId: string;
  readonly repository: { readonly owner: string; readonly name: string } | null;
  readonly branch: string;
  readonly baseCommitSha: string;
}

export function canonicalRunFor(userId: string, runId: string, changeId: string, binding: SourceBinding): CanonicalChangeRun {
  const [owner, name] = binding.repositoryFullName.split('/');
  const repository = binding.originKind === 'github' && owner && name ? { owner, name } : null;
  return { userId, runId, changeId, bindingId: binding.id, repository, branch: binding.baseBranch, baseCommitSha: binding.baseCommitSha };
}

const TASK_ID = 'existing-source-change';

function changeTask(run: CanonicalChangeRun): ExecutableTaskNode {
  return {
    id: TASK_ID, objective: 'Make the requested change to the linked project and verify it with the project\'s own tests.', operationType: 'existing_source_change',
    requiredCapabilities: ['code.edit', 'code.test'], selectedRuntime: 'software_agent', selectedProvider: null, selectedModel: null,
    requiredContextReferences: [run.bindingId], allowedFiles: [], expectedOutputSchema: { description: 'A reviewable change set with test evidence' },
    dependencies: [], riskLevel: 'medium', timeoutMs: 55 * 60 * 1000, retryPolicy: { maximumAttempts: 1, initialBackoffMs: 250, maximumBackoffMs: 2_000 },
    budget: {}, validationMethod: ['project_tests'], evidenceRequirements: ['project_tests evidence'], fallbackRoutes: [], status: 'running', attempts: 1, evidence: [],
  };
}

/** The run's canonical state for exactly these working files. */
export async function canonicalStateFor(run: CanonicalChangeRun, files: readonly { path: string; content: string }[]): Promise<CanonicalExecutionState> {
  const { createCanonicalExecutionState } = await import('../../ai/executionRuntime.js');
  return createCanonicalExecutionState({
    projectId: `existing-source:${run.bindingId}`, runId: run.runId, repository: run.repository, selectedBranch: run.branch, startingCommitSha: run.baseCommitSha,
    files: files.map((f) => ({ path: f.path, content: f.content })), tasks: [changeTask(run)],
  });
}

export interface CanonicalPortDeps {
  readonly currentAttempt: () => AdmittedRunAttempt;
  readonly saveState: (attempt: AdmittedRunAttempt, state: CanonicalExecutionState) => Promise<void>;
  readonly sandbox: (caller: SandboxCaller, request: Omit<SandboxExecutionRequest, 'limits' | 'executionBinding'> & { limits?: Partial<SandboxExecutionRequest['limits']> }) => Promise<SandboxExecutionResult>;
}

/** Production wiring, resolved lazily so importing this module never loads the sandbox or the run store. */
export async function productionCanonicalDeps(): Promise<CanonicalPortDeps> {
  const [{ captureCurrentRunAttempt }, { SupabaseExecutionStateStore }, { executeCanonicalSandboxed }] = await Promise.all([
    import('../../ai/runStore.js'), import('../../ai/executionRuntime.js'), import('../../sandbox/sandboxRuntime.js'),
  ]);
  return {
    currentAttempt: captureCurrentRunAttempt,
    saveState: (attempt, state) => new SupabaseExecutionStateStore(attempt.userId, attempt).save(state),
    sandbox: executeCanonicalSandboxed,
  };
}

const fingerprint = (files: readonly { path: string; content: string }[]) =>
  createHash('sha256').update(JSON.stringify([...files].sort((a, b) => (a.path < b.path ? -1 : 1)).map((f) => [f.path, f.content]))).digest('hex');

/**
 * The ExecutionPort for a change running under its canonical attempt. Staged project test plans run as the universal verifier's
 * validation; the agent's own commands run as software-agent commands. A request that carries its own binding is not honoured.
 */
export function canonicalExecutionPort(run: CanonicalChangeRun, depsFor: () => Promise<CanonicalPortDeps> = productionCanonicalDeps): ExecutionPort {
  let synced: string | null = null;
  return {
    async execute(request) {
      const deps = await depsFor();
      const attempt = deps.currentAttempt();
      if (attempt.runId !== run.runId || attempt.userId !== run.userId) throw new ExistingSourceError('EXECUTION_UNAVAILABLE', 'This change is not running under its own canonical attempt.');
      const { executionBinding: _ignored, ...rest } = request;
      const files = (rest.sourceFiles ?? rest.files).map((f) => ({ path: f.path, content: f.content }));
      const key = fingerprint(files);
      if (key !== synced) {
        await deps.saveState(attempt, await canonicalStateFor(run, files));
        synced = key;
      }
      return deps.sandbox(rest.stages ? 'universal-validation' : 'software-agent-command', rest);
    },
  };
}
