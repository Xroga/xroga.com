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
import type { SoftwarePreviewEvidence } from '../../ai/softwareAgent/contracts.js';
import type { ExecutionPort } from './testRunner.js';
import type { PreviewVerifier } from './toolHost.js';

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

type WebGate = Awaited<ReturnType<ReturnType<typeof import('../../synthesis/browserVerificationAdapter.js').browserVerificationAdapter>>>;

function previewEvidenceFromGate(result: WebGate): SoftwarePreviewEvidence {
  return {
    status: result.status, attempted: result.attempted, url: result.url, notCheckedReason: result.notCheckedReason, blocker: result.blocker,
    evidenceForRepair: result.evidenceForRepair, criteriaNotChecked: [...result.criteriaNotChecked], screenshots: [...result.screenshots], rungReached: result.verdict?.rungReached,
  };
}

export interface CanonicalChangeRuntime {
  /** Runs the project's tests and the agent's commands through the canonical sandbox seam. */
  readonly port: ExecutionPort;
  /** Observes a visual change in a browser inside the same isolated runtime. */
  previewVerifier(criteria: readonly string[]): PreviewVerifier;
}

/**
 * The execution a change gets under its canonical attempt. Staged project test plans run as the universal verifier's validation, the
 * agent's own commands as software-agent commands and the browser check as browser verification. Before any of them the run's own
 * state is written with exactly the files being run, only when they changed. A request that carries its own binding is not honoured.
 */
export function canonicalChangeRuntime(run: CanonicalChangeRun, depsFor: () => Promise<CanonicalPortDeps> = productionCanonicalDeps,
  adapterFor?: () => Promise<typeof import('../../synthesis/browserVerificationAdapter.js').browserVerificationAdapter>): CanonicalChangeRuntime {
  let synced: string | null = null;
  const prepare = async (files: readonly { path: string; content: string }[]): Promise<CanonicalPortDeps> => {
    const deps = await depsFor();
    const attempt = deps.currentAttempt();
    if (attempt.runId !== run.runId || attempt.userId !== run.userId) throw new ExistingSourceError('EXECUTION_UNAVAILABLE', 'This change is not running under its own canonical attempt.');
    const plain = files.map((f) => ({ path: f.path, content: f.content }));
    const key = fingerprint(plain);
    if (key !== synced) {
      await deps.saveState(attempt, await canonicalStateFor(run, plain));
      synced = key;
    }
    return deps;
  };
  const port: ExecutionPort = {
    async execute(request) {
      const { executionBinding: _ignored, ...rest } = request;
      const deps = await prepare(rest.sourceFiles ?? rest.files);
      return deps.sandbox(rest.stages ? 'universal-validation' : 'software-agent-command', rest);
    },
  };
  return {
    port,
    previewVerifier: (criteria) => async (files, context) => {
      const adapter = await (adapterFor ?? (async () => (await import('../../synthesis/browserVerificationAdapter.js')).browserVerificationAdapter))();
      const verify = adapter({
        acceptanceCriteria: criteria,
        execute: async (request) => {
          const deps = await prepare(request.sourceFiles ?? request.files);
          const r = await deps.sandbox('browser-verification', { ...request, files: [...request.files], args: [...request.args], sourceFiles: request.sourceFiles ? [...request.sourceFiles] : undefined } as never);
          return { exitCode: r.exitCode, stdout: r.stdout, stderr: r.stderr, timedOut: r.timedOut };
        },
      });
      return previewEvidenceFromGate(await verify({ files, buildPassed: context.buildPassed, testsPassed: context.testsPassed }));
    },
  };
}

/** The execution port alone, for callers that need no browser check. */
export function canonicalExecutionPort(run: CanonicalChangeRun, depsFor: () => Promise<CanonicalPortDeps> = productionCanonicalDeps): ExecutionPort {
  return canonicalChangeRuntime(run, depsFor).port;
}
