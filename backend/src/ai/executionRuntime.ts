import { randomUUID } from 'crypto';
import { redactSecrets } from '../lib/truthfulExecution.js';
import type { ProjectFile, FilePatch } from './patches.js';
import { applyDeletes, applyPatches, buildFileTrail } from './patches.js';
import type { ModelId } from './models.js';
import { getSupabaseAdmin } from '../config/supabase.js';
import type { IntelligentRoutePlan } from './intelligentRouter.js';
import { MODELS } from './models.js';

export type ExecutionTaskStatus =
  | 'pending'
  | 'ready'
  | 'running'
  | 'waiting_for_authorization'
  | 'waiting_for_user_input'
  | 'waiting_for_provider'
  | 'validating'
  | 'repairing'
  | 'completed'
  | 'blocked'
  | 'failed'
  | 'cancelled';

export interface RetryPolicy {
  maximumAttempts: number;
  initialBackoffMs: number;
  maximumBackoffMs: number;
}

export interface ExecutableTaskNode {
  id: string;
  objective: string;
  operationType: string;
  requiredCapabilities: string[];
  selectedRuntime: string | null;
  selectedProvider: string | null;
  selectedModel: ModelId | null;
  requiredContextReferences: string[];
  allowedFiles: string[];
  expectedOutputSchema: Record<string, unknown>;
  dependencies: string[];
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  timeoutMs: number;
  retryPolicy: RetryPolicy;
  budget: { maximumTokens?: number; maximumUsd?: number };
  validationMethod: string[];
  evidenceRequirements: string[];
  fallbackRoutes: Array<{ provider: string | null; model: ModelId | null }>;
  status: ExecutionTaskStatus;
  attempts: number;
  output?: unknown;
  evidence: ExecutionEvidence[];
  blocker?: string;
  startedAt?: string;
  completedAt?: string;
}

export interface ExecutionEvidence {
  id: string;
  kind: string;
  summary: string;
  identifier?: string;
  timestamp: string;
}

export interface ValidationRecord {
  class: string;
  command?: string;
  exitCode?: number | null;
  ok: boolean;
  safeOutputSummary: string;
  snapshot?: string;
  timestamp: string;
  taskId?: string;
}

export interface ReviewFinding {
  id: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  title: string;
  evidence: string;
  affectedFiles: string[];
  resolved: boolean;
}

export interface CanonicalExecutionState {
  projectId: string;
  runId: string;
  repository: { owner: string; name: string; remote?: string } | null;
  selectedBranch: string;
  startingCommitSha: string | null;
  currentWorkingSnapshot: ProjectFile[];
  productManifest: Record<string, unknown>;
  architectureDecisions: string[];
  requiredCapabilities: string[];
  selectedIntegrations: string[];
  generatedFiles: string[];
  changedFiles: string[];
  deletedFiles: string[];
  pendingPatches: FilePatch[];
  appliedPatches: FilePatch[];
  validationResults: ValidationRecord[];
  reviewFindings: ReviewFinding[];
  reviewer?: { provider: string; model: ModelId; taskId: string };
  repairHistory: Array<{ taskId: string; failureClass: string; files: string[]; timestamp: string }>;
  deploymentState: { status: string; deploymentId?: string; verifiedUrl?: string };
  evidence: ExecutionEvidence[];
  blockers: string[];
  tasks: ExecutableTaskNode[];
  createdAt: string;
  updatedAt: string;
}

export interface ExecutionEvent {
  runId: string;
  taskId: string;
  eventType: string;
  status: ExecutionTaskStatus;
  safeMessage: string;
  timestamp: string;
  evidenceReference?: string;
  progress: number;
}

export interface ExecutionStateStore {
  load(runId: string): Promise<CanonicalExecutionState | null>;
  save(state: CanonicalExecutionState): Promise<void>;
}

export class InMemoryExecutionStateStore implements ExecutionStateStore {
  private readonly states = new Map<string, CanonicalExecutionState>();

  async load(runId: string): Promise<CanonicalExecutionState | null> {
    const value = this.states.get(runId);
    return value ? structuredClone(value) : null;
  }

  async save(state: CanonicalExecutionState): Promise<void> {
    this.states.set(state.runId, structuredClone(state));
  }
}

export class SupabaseExecutionStateStore implements ExecutionStateStore {
  constructor(private readonly userId: string) {}

  async load(runId: string): Promise<CanonicalExecutionState | null> {
    const { data, error } = await getSupabaseAdmin().from('execution_runs').select('state').eq('run_id', runId).eq('user_id', this.userId).maybeSingle();
    if (error) throw error;
    return data?.state ? data.state as CanonicalExecutionState : null;
  }

  async save(state: CanonicalExecutionState): Promise<void> {
    const terminal = state.tasks.every((task) => ['completed', 'blocked', 'failed', 'cancelled'].includes(task.status));
    const hasFailure = state.tasks.some((task) => task.status === 'failed');
    const hasBlocked = state.tasks.some((task) => task.status === 'blocked');
    const hasComplete = state.tasks.some((task) => task.status === 'completed');
    const status = !terminal ? 'running' : hasFailure && !hasComplete ? 'failed' : hasBlocked ? (hasComplete ? 'partially_completed' : 'blocked') : 'completed';
    const { error } = await getSupabaseAdmin().from('execution_runs').upsert({
      run_id: state.runId, user_id: this.userId, project_id: state.projectId,
      repository_identity: state.repository, selected_branch: state.selectedBranch,
      starting_commit_sha: state.startingCommitSha, state, status, updated_at: state.updatedAt,
    });
    if (error) throw error;
  }
}

export function createCanonicalExecutionState(input: {
  projectId: string;
  runId?: string;
  repository?: CanonicalExecutionState['repository'];
  selectedBranch?: string;
  startingCommitSha?: string | null;
  files?: ProjectFile[];
  requiredCapabilities?: string[];
  tasks?: ExecutableTaskNode[];
}): CanonicalExecutionState {
  const now = new Date().toISOString();
  return {
    projectId: input.projectId,
    runId: input.runId ?? randomUUID(),
    repository: input.repository ?? null,
    selectedBranch: input.selectedBranch ?? 'main',
    startingCommitSha: input.startingCommitSha ?? null,
    currentWorkingSnapshot: structuredClone(input.files ?? []),
    productManifest: {},
    architectureDecisions: [],
    requiredCapabilities: [...(input.requiredCapabilities ?? [])],
    selectedIntegrations: [],
    generatedFiles: [],
    changedFiles: [],
    deletedFiles: [],
    pendingPatches: [],
    appliedPatches: [],
    validationResults: [],
    reviewFindings: [],
    repairHistory: [],
    deploymentState: { status: 'not_requested' },
    evidence: [],
    blockers: [],
    tasks: structuredClone(input.tasks ?? []),
    createdAt: now,
    updatedAt: now,
  };
}

export function executableTasksFromRoutePlan(plan: IntelligentRoutePlan): ExecutableTaskNode[] {
  return plan.subtasks.map((task) => ({
    id: task.id,
    objective: task.objective,
    operationType: task.taskClass,
    requiredCapabilities: [task.taskClass],
    selectedRuntime: task.selectedModel ? 'model_provider' : null,
    selectedProvider: task.selectedModel ? MODELS[task.selectedModel].provider : null,
    selectedModel: task.selectedModel,
    requiredContextReferences: [...task.requiredContext],
    allowedFiles: [...task.allowedFiles],
    expectedOutputSchema: { description: task.expectedOutput },
    dependencies: [...task.dependsOn],
    riskLevel: task.risk,
    timeoutMs: task.timeoutMs,
    retryPolicy: { maximumAttempts: 2, initialBackoffMs: 250, maximumBackoffMs: 2_000 },
    budget: { maximumTokens: task.tokenBudget },
    validationMethod: [...task.validation],
    evidenceRequirements: task.validation.map((method) => `${method} evidence`),
    fallbackRoutes: task.fallbackModels.map((model) => ({ provider: MODELS[model].provider, model })),
    status: task.blocker ? 'blocked' : task.dependsOn.length ? 'pending' : 'ready',
    attempts: 0,
    evidence: [],
    blocker: task.blocker,
  }));
}

export function transitionTask(
  state: CanonicalExecutionState,
  taskId: string,
  status: ExecutionTaskStatus,
  input?: { evidence?: ExecutionEvidence[]; output?: unknown; blocker?: string },
): void {
  const task = state.tasks.find((candidate) => candidate.id === taskId);
  if (!task) return;
  if (status === 'completed' && !(input?.evidence?.length || task.evidence.length)) throw new Error('Cannot complete a task without evidence');
  task.status = status;
  if (input?.evidence) { task.evidence.push(...input.evidence); state.evidence.push(...input.evidence); }
  if (input?.output !== undefined) task.output = input.output;
  if (input?.blocker) task.blocker = redactSecrets(input.blocker);
  if (status === 'running') task.startedAt = new Date().toISOString();
  if (['completed', 'blocked', 'failed', 'cancelled'].includes(status)) task.completedAt = new Date().toISOString();
  state.updatedAt = new Date().toISOString();
}

function safePath(path: string): string {
  const normalized = path.replaceAll('\\', '/').replace(/^\.\//, '');
  if (!normalized || normalized.startsWith('/') || /^[a-z]:/i.test(normalized)) throw new Error('absolute paths are not allowed');
  if (normalized.split('/').some((part) => part === '..' || part === '')) throw new Error('path traversal is not allowed');
  if (normalized.includes('\0')) throw new Error('invalid path');
  return normalized;
}

export type MutationOperation =
  | { type: 'create'; path: string; content: string }
  | { type: 'update'; patch: FilePatch }
  | { type: 'delete'; path: string }
  | { type: 'rename'; path: string; destination: string }
  | { type: 'restore'; path: string };

/** The only stateful mutation boundary. Existing patch helpers remain pure primitives. */
export class CanonicalMutationService {
  private lock: Promise<void> = Promise.resolve();
  private readonly snapshots = new Map<string, string | null>();

  async mutate(state: CanonicalExecutionState, operations: MutationOperation[]): Promise<ExecutionEvidence[]> {
    const previous = this.lock;
    let release!: () => void;
    this.lock = new Promise<void>((resolve) => { release = resolve; });
    await previous;
    try {
      return this.applyAtomic(state, operations);
    } finally {
      release();
    }
  }

  private applyAtomic(state: CanonicalExecutionState, operations: MutationOperation[]): ExecutionEvidence[] {
    const validated = operations.map((operation) => {
      if (operation.type === 'update') {
        const path = safePath(operation.patch.path);
        if (typeof operation.patch.search !== 'string' || typeof operation.patch.replace !== 'string') throw new Error('malformed patch');
        return { ...operation, patch: { ...operation.patch, path } };
      }
      const path = safePath(operation.path);
      return operation.type === 'rename' ? { ...operation, path, destination: safePath(operation.destination) } : { ...operation, path };
    });
    let files = structuredClone(state.currentWorkingSnapshot);
    const before = structuredClone(files);
    const appliedPatches: FilePatch[] = [];
    const deleted: string[] = [];
    for (const operation of validated) {
      const operationPath = operation.type === 'update' ? operation.patch.path : operation.path;
      const current = files.find((file) => file.path === operationPath);
      if (!this.snapshots.has(operationPath)) this.snapshots.set(operationPath, current?.content ?? null);
      if (operation.type === 'create') {
        if (current) throw new Error(`file already exists: ${operation.path}`);
        files.push({ path: operation.path, content: operation.content });
      } else if (operation.type === 'update') {
        const result = applyPatches(files, [operation.patch]);
        if (result.failed.length) throw new Error(result.failureReasons[0] ?? 'patch rejected');
        files = result.files;
        appliedPatches.push(...result.applied);
      } else if (operation.type === 'delete') {
        if (!current) throw new Error(`file does not exist: ${operation.path}`);
        const result = applyDeletes(files, [operation.path]);
        files = result.files;
        deleted.push(...result.deleted);
      } else if (operation.type === 'rename') {
        if (!current) throw new Error(`file does not exist: ${operation.path}`);
        if (files.some((file) => file.path === operation.destination)) throw new Error(`destination exists: ${operation.destination}`);
        files = files.map((file) => file.path === operation.path ? { ...file, path: operation.destination } : file);
        deleted.push(operation.path);
      } else {
        const snapshot = this.snapshots.get(operation.path);
        if (snapshot === undefined) throw new Error(`no snapshot for: ${operation.path}`);
        files = files.filter((file) => file.path !== operation.path);
        if (snapshot !== null) files.push({ path: operation.path, content: snapshot });
      }
    }
    const trail = buildFileTrail(before, files);
    state.currentWorkingSnapshot = files;
    state.changedFiles = [...new Set([...state.changedFiles, ...trail.map((item) => item.path)])];
    state.generatedFiles = [...new Set([...state.generatedFiles, ...trail.filter((item) => !item.before).map((item) => item.path)])];
    state.deletedFiles = [...new Set([...state.deletedFiles, ...deleted])];
    state.appliedPatches.push(...appliedPatches);
    state.pendingPatches = state.pendingPatches.filter((pending) => !appliedPatches.some((applied) => JSON.stringify(applied) === JSON.stringify(pending)));
    state.updatedAt = new Date().toISOString();
    const evidence = trail.map<ExecutionEvidence>((item) => ({
      id: randomUUID(), kind: 'file_mutation', summary: `${item.path}: +${item.added} -${item.removed}`,
      identifier: item.path, timestamp: state.updatedAt,
    }));
    state.evidence.push(...evidence);
    return evidence;
  }
}

export type TaskHandler = (task: ExecutableTaskNode, state: CanonicalExecutionState, signal: AbortSignal) => Promise<{ output: unknown; evidence: ExecutionEvidence[]; validated: boolean }>;

export class ExecutionScheduler {
  private readonly providerCalls = new Map<string, Promise<ReturnType<TaskHandler> extends Promise<infer T> ? T : never>>();
  constructor(private readonly store: ExecutionStateStore, private readonly onEvent?: (event: ExecutionEvent) => void) {}

  async run(state: CanonicalExecutionState, handlers: Record<string, TaskHandler>, signal?: AbortSignal): Promise<CanonicalExecutionState> {
    await this.store.save(state);
    while (true) {
      if (signal?.aborted) {
        for (const task of state.tasks.filter((item) => !['completed', 'failed', 'blocked', 'cancelled'].includes(item.status))) task.status = 'cancelled';
        await this.persist(state);
        break;
      }
      for (const task of state.tasks.filter((item) => ['pending', 'ready'].includes(item.status))) {
        const deps = task.dependencies.map((id) => state.tasks.find((candidate) => candidate.id === id));
        if (deps.some((dep) => dep && ['failed', 'blocked', 'cancelled'].includes(dep.status))) {
          task.status = 'blocked'; task.blocker = 'terminal upstream dependency';
        } else if (deps.every((dep) => dep?.status === 'completed')) task.status = 'ready';
      }
      await this.persist(state);
      const ready = state.tasks.filter((task) => task.status === 'ready');
      if (!ready.length) break;
      const safe = ready.filter((task) => !task.allowedFiles.length || !/mutat|implement|patch|write|delete|rename/i.test(task.operationType));
      const mutation = ready.find((task) => !safe.includes(task));
      const batch = safe.length ? safe : mutation ? [mutation] : [];
      await Promise.all(batch.map((task) => this.execute(task, state, handlers[task.operationType])));
    }
    return state;
  }

  private async execute(task: ExecutableTaskNode, state: CanonicalExecutionState, handler?: TaskHandler): Promise<void> {
    if (!handler) { task.status = 'blocked'; task.blocker = `no handler for ${task.operationType}`; await this.persist(state); return; }
    task.status = 'running'; task.startedAt = new Date().toISOString(); task.attempts += 1; await this.persist(state);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), task.timeoutMs);
    let terminal = true;
    try {
      const dedupeKey = `${state.runId}:${task.id}:${task.selectedProvider ?? ''}:${task.selectedModel ?? ''}:${task.attempts}`;
      const promise = this.providerCalls.get(dedupeKey) ?? handler(task, state, controller.signal);
      if (!this.providerCalls.has(dedupeKey)) this.providerCalls.set(dedupeKey, promise);
      const result = await promise;
      task.output = result.output; task.evidence.push(...result.evidence);
      // Two independent reasons a task can fail here, and they need different
      // repairs. The old message collapsed both into "not validated with evidence",
      // which is what made a validation-gate bug in synthesis-architecture look
      // like an unexplained four-second death in production.
      const missingEvidence = result.evidence.length === 0;
      task.status = result.validated && !missingEvidence ? 'completed' : 'failed';
      if (task.status === 'failed') {
        task.blocker = missingEvidence && !result.validated
          ? `${task.operationType} produced neither a validated result nor evidence`
          : missingEvidence
            ? `${task.operationType} validated but produced no evidence`
            : `${task.operationType} produced evidence but did not pass its validation rule`;
      }
    } catch (error) {
      task.blocker = redactSecrets(error instanceof Error ? error.message : String(error)).slice(0, 500);
      const mutation = task.allowedFiles.length > 0 && /mutat|implement|patch|write|delete|rename/i.test(task.operationType);
      if (!mutation && task.attempts < task.retryPolicy.maximumAttempts) {
        task.status = 'waiting_for_provider';
        await this.persist(state);
        const delay = Math.min(task.retryPolicy.maximumBackoffMs, task.retryPolicy.initialBackoffMs * 2 ** (task.attempts - 1));
        await new Promise((resolve) => setTimeout(resolve, delay));
        task.status = 'ready';
        terminal = false;
      } else task.status = 'failed';
    } finally {
      clearTimeout(timeout);
      if (terminal) task.completedAt = new Date().toISOString();
      await this.persist(state);
    }
  }

  private async persist(state: CanonicalExecutionState): Promise<void> {
    state.updatedAt = new Date().toISOString();
    await this.store.save(state);
    const terminal = state.tasks.filter((task) => ['completed', 'blocked', 'failed', 'cancelled'].includes(task.status)).length;
    for (const task of state.tasks) this.onEvent?.({
      runId: state.runId, taskId: task.id, eventType: 'task_state', status: task.status,
      safeMessage: task.blocker ? redactSecrets(task.blocker) : task.objective,
      timestamp: state.updatedAt, evidenceReference: task.evidence.at(-1)?.id,
      progress: state.tasks.length ? Math.round((terminal / state.tasks.length) * 100) : 0,
    });
  }
}

export interface FinalExecutionOutcome {
  status: 'completed' | 'partially_completed' | 'blocked' | 'failed' | 'cancelled';
  requestedOutcome: string;
  executedOperations: string[];
  filesChanged: string[];
  completedRequirements: string[];
  incompleteRequirements: string[];
  blockers: string[];
  evidenceReferences: string[];
  validNextActions: string[];
}

export function evaluateFinalExecution(state: CanonicalExecutionState, requestedOutcome: string, requiredTaskIds = state.tasks.map((task) => task.id)): FinalExecutionOutcome {
  const required = requiredTaskIds.map((id) => state.tasks.find((task) => task.id === id)).filter(Boolean) as ExecutableTaskNode[];
  const complete = required.filter((task) => task.status === 'completed' && task.evidence.length);
  const cancelled = required.some((task) => task.status === 'cancelled');
  const failed = required.some((task) => task.status === 'failed');
  const blocked = required.some((task) => task.status === 'blocked');
  const status = complete.length === required.length ? 'completed' : cancelled ? 'cancelled' : complete.length ? 'partially_completed' : failed ? 'failed' : blocked ? 'blocked' : 'blocked';
  return {
    status, requestedOutcome,
    executedOperations: complete.map((task) => task.operationType), filesChanged: [...state.changedFiles],
    completedRequirements: complete.map((task) => task.objective),
    incompleteRequirements: required.filter((task) => task.status !== 'completed').map((task) => task.objective),
    blockers: [...new Set([...state.blockers, ...required.map((task) => task.blocker).filter(Boolean) as string[]])],
    evidenceReferences: [...new Set([...state.evidence.map((item) => item.id), ...complete.flatMap((task) => task.evidence.map((item) => item.id))])],
    validNextActions: blocked ? ['Resolve the reported blocker and resume the same run'] : failed ? ['Inspect validation evidence and run a targeted repair'] : [],
  };
}
