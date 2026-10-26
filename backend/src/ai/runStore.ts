/**
 * Swarm run history — hot in-memory + Supabase persistence (survives restarts).
 */

import {
  randomUUID,
} from 'node:crypto';
import { AsyncLocalStorage } from 'node:async_hooks';
import {requireCanonicalDeliveryClaim,type CanonicalDeliveryClaim} from '../workers/googleDeliveryStore.js';

import { getSupabaseAdmin } from '../config/supabase.js';
import { createTenantContext } from '../security/tenantContext.js';
import { TenantAccessError } from '../security/tenantErrors.js';
import { heartbeatOwnedRunAttempt, persistOwnedRunAttempt } from '../security/ownedRunPersistence.js';
import { isEngineeringArtifact } from './engineeringArtifact.js';
import { redactOperationsValue } from '../operations/operationsEngine.js';
import {
  recordTerminalBuildOutcomeFailOpen,
  SupabaseBuildOutcomeStore,
} from './buildOutcomeMemory.js';

export interface SwarmRunEvent {
  sequence: number;
  type: 'progress';
  data: Record<string, unknown>;
  createdAt: string;
}

export interface SwarmRunRecord {
  id: string;
  userId: string;
  databaseProjectId?: string;
  prompt: string;
  status: 'running' | 'complete' | 'error' | 'cancelled';
  output: Record<string, unknown> | null;
  featureCategory?: string;
  tokenUsage?: unknown;
  messages?: unknown[];
  created_at: string;
  completed_at: string | null;
  iteration_count: number;
  events: SwarmRunEvent[];
  lastSequence: number;
}

const runs = new Map<string, SwarmRunRecord>();
const userIndex = new Map<string, string[]>();
const MAX_PER_USER = 40;
const MAX_EVENTS_PER_RUN = 1000;
const persistTimers = new Map<string, ReturnType<typeof setTimeout>>();
const pendingCreations = new Set<string>();
const terminalPersistence = new WeakMap<SwarmRunRecord, Promise<void>>();
// Internal attempt authority never appears in the public run record.
const attemptGenerations = new WeakMap<SwarmRunRecord, string>();
const observedGenerations = new WeakMap<SwarmRunRecord, string | null>();
const attemptScope = new AsyncLocalStorage<{ record?: SwarmRunRecord }>();

/** Keep asynchronous callbacks bound to the attempt created by this request. */
export function withRunAttempt<T>(work: () => T): T {
  return attemptScope.run({}, work);
}

export function hasAdmittedRunAttempt(runId: string): boolean {
  const record = attemptScope.getStore()?.record;
  return Boolean(record && record.id === runId && !pendingCreations.has(runId));
}

export interface AdmittedRunAttempt { readonly runId: string; readonly userId: string; readonly workerId: string; readonly generation: string }
const issuedRunAttempts = new WeakSet<object>();

export function requireAdmittedRunAttempt(attempt: AdmittedRunAttempt): AdmittedRunAttempt {
  if (!attempt || !issuedRunAttempts.has(attempt)) {
    throw Object.assign(new Error('Execution attempt authority was not issued.'), { code: 'RUN_STATE_CONFLICT' });
  }
  return attempt;
}

/** Capture authority once, never let a later callback borrow a resumed generation. */
export function captureAdmittedRunAttempt(runId: string, userId: string): AdmittedRunAttempt {
  const record = attemptScope.getStore()?.record;
  const generation = record && attemptGenerations.get(record);
  if (!record || runs.get(runId) !== record || record.id !== runId || record.userId !== userId ||
      record.status !== 'running' || pendingCreations.has(runId) || !generation) {
    throw Object.assign(new Error('Execution attempt authority is missing.'), { code: 'RUN_STATE_CONFLICT' });
  }
  const attempt = Object.freeze({ runId, userId, workerId: RUN_WORKER_ID, generation });
  issuedRunAttempts.add(attempt);
  return attempt;
}

/** Internal adapter entry point. Identity comes only from this canonical
 * asynchronous worker scope, never from request files or a supplied user ID. */
export function captureCurrentRunAttempt():AdmittedRunAttempt {
  const record=attemptScope.getStore()?.record;
  if(!record)throw Object.assign(new Error('Execution attempt authority is missing.'),{code:'RUN_STATE_CONFLICT'});
  return captureAdmittedRunAttempt(record.id,record.userId);
}

/** A captured capability is identity, not a permanent grant to dispatch work. */
export async function assertCurrentRunAttempt(attempt: AdmittedRunAttempt): Promise<void> {
  const original = requireAdmittedRunAttempt(attempt);
  const sameGeneration = () => {
    const current = captureAdmittedRunAttempt(original.runId, original.userId);
    if (current.workerId !== original.workerId || current.generation !== original.generation) {
      throw Object.assign(new Error('Execution attempt authority changed.'), {code:'RUN_STATE_CONFLICT'});
    }
  };
  sameGeneration();
  if (await isRunCancellationRequested(original.runId, original.userId,{requireRunning:true})) {
    throw Object.assign(new Error('Execution attempt was cancelled.'), {code:'RUN_STATE_CONFLICT'});
  }
  sameGeneration();
}

function mutableAttempt(runId: string): SwarmRunRecord | undefined {
  const record = runs.get(runId);
  const scope = attemptScope.getStore();
  return scope && scope.record !== record ? undefined : record;
}

const RUN_WORKER_ID =
  randomUUID();

const RUN_HEARTBEAT_MS =
  30_000;

const locallyOwnedRunIds =
  new Set<string>();

const heartbeatTimers =
  new Map<
    string,
    ReturnType<
      typeof setInterval
    >
  >();

export function currentRunWorkerId(): string {
  return RUN_WORKER_ID;
}

async function persistRunHeartbeat(
  runId:
    string,
): Promise<void> {
  const rec = runs.get(runId);
  const generation = rec && attemptGenerations.get(rec);
  if (!rec || !generation) return;
  if (
    !process.env
      .SUPABASE_SERVICE_ROLE_KEY ||
    !locallyOwnedRunIds
      .has(
        runId,
      )
  ) {
    return;
  }

  try {
    await heartbeatOwnedRunAttempt(getSupabaseAdmin(),createTenantContext({userId:rec.userId,via:'persisted_owner'}),runId,RUN_WORKER_ID,generation);
  } catch {
    // A periodic bookkeeping failure grants no authority, retries no provider
    // effect and must not leak database diagnostics or reject without a handler.
    console.warn('[runStore] heartbeat was not acknowledged');
  }
}

function claimLocalRun(
  runId:
    string,
): void {
  locallyOwnedRunIds
    .add(
      runId,
    );

  if (
    heartbeatTimers
      .has(
        runId,
      )
  ) {
    return;
  }

  const timer =
    setInterval(
      () => {
        void persistRunHeartbeat(
          runId,
        );
      },
      RUN_HEARTBEAT_MS,
    );

  timer.unref?.();

  heartbeatTimers.set(
    runId,
    timer,
  );
}

function releaseLocalRun(
  runId:
    string,
): void {
  locallyOwnedRunIds
    .delete(
      runId,
    );

  const timer =
    heartbeatTimers.get(
      runId,
    );

  if (
    timer
  ) {
    clearInterval(
      timer,
    );
  }

  heartbeatTimers.delete(
    runId,
  );
}

async function rememberTerminalOutcome(
  rec:
    SwarmRunRecord,
  generation: string,
): Promise<void> {
  if (
    rec.status ===
    'running'
  ) {
    return;
  }

  await recordTerminalBuildOutcomeFailOpen({
    runId:
      rec.id,

    userId:
      rec.userId,

    terminalStatus:
      rec.status,

    featureCategory:
      rec.featureCategory,

    iterationCount:
      rec.iteration_count,

    createdAt:
      rec.created_at,

    completedAt:
      rec.completed_at,

    output:
      rec.output,
  }, new SupabaseBuildOutcomeStore({ generation, completedAt: rec.completed_at!, output: rec.output }));
}

function schedulePersist(rec: SwarmRunRecord) {
  if (persistTimers.has(rec.id)) return;

  const timer = setTimeout(() => {
    persistTimers.delete(rec.id);
    void persistToSupabase(rec).catch(() => {});
  }, 500);

  timer.unref?.();
  persistTimers.set(rec.id, timer);
}

function flushPersist(rec: SwarmRunRecord) {
  const timer = persistTimers.get(rec.id);

  if (timer) clearTimeout(timer);

  persistTimers.delete(rec.id);
  const snapshot = structuredClone(rec);
  const generation = attemptGenerations.get(rec);
  const pending = persistToSupabase(rec).then(async () => {
    // Learning is a side effect of an acknowledged terminal write, not of a
    // local status change. A rejected worker fence must never create evidence.
    // Also discard callbacks superseded by a correction or same-process resume.
    if (generation && process.env.SUPABASE_SERVICE_ROLE_KEY && terminalPersistence.get(rec) === pending && runs.get(rec.id) === rec) {
      await rememberTerminalOutcome(snapshot, generation);
    }
  });
  terminalPersistence.set(rec, pending);
  // Synchronous callers remain compatible, while persistRunState observes the
  // original rejection before a route can acknowledge durable completion.
  void pending.catch(() => console.warn('[runStore] terminal persistence unavailable'));
}

function touchUser(userId: string, runId: string) {
  const list = userIndex.get(userId) ?? [];

  const next = [
    runId,
    ...list.filter((id) => id !== runId),
  ].slice(0, MAX_PER_USER);

  userIndex.set(userId, next);

  for (const [id, run] of runs) {
    if (
      run.userId === userId &&
      !next.includes(id)
    ) {
      // The per-user history cap is a presentation/cache concern. It must never
      // evict a run this worker is still executing, because that would also drop
      // its durable lease heartbeat and let another process reap live work.
      if (
        run.status === 'running' &&
        locallyOwnedRunIds.has(id)
      ) {
        continue;
      }

      releaseLocalRun(
        id,
      );

      runs.delete(id);
    }
  }
}

function createRunHot(
  userId: string,
  prompt: string,
  runId: string,
): SwarmRunRecord {
  const existing = runs.get(runId);
  if (existing && existing.userId !== userId) {
    throw Object.assign(new Error('Run not found.'), { code: 'RUN_NOT_FOUND' });
  }
  const rec: SwarmRunRecord = {
    id: runId,
    userId,
    prompt: prompt.slice(0, 8000),
    status: 'running',
    output: null,
    created_at: new Date().toISOString(),
    completed_at: null,
    iteration_count: 0,
    events: [],
    lastSequence: 0,
  };

  runs.set(runId, rec);
  attemptGenerations.set(rec, randomUUID());
  const scope = attemptScope.getStore();
  if (scope) scope.record = rec;
  touchUser(userId, runId);
  claimLocalRun(
    runId,
  );

  return rec;
}

export function createRun(
  userId: string,
  prompt: string,
  runId: string,
): SwarmRunRecord {
  const rec = createRunHot(
    userId,
    prompt,
    runId,
  );

  void persistToSupabase(rec, true).catch(() => {});

  return rec;
}

/** Persist the recovery record before an expensive provider call begins. */
export async function adoptQueuedRunDurable(claim:CanonicalDeliveryClaim):Promise<SwarmRunRecord>{
  const issued=requireCanonicalDeliveryClaim(claim);
  if(issued.claim.workerId!==RUN_WORKER_ID||!attemptScope.getStore()||runs.has(claim.runId)){
    throw Object.assign(new Error('Queued execution authority is unavailable.'),{code:'RUN_STATE_CONFLICT'});
  }
  const record=await getRunAsync(claim.runId,claim.userId,true);
  if(!record||record.status!=='running'||observedGenerations.get(record)!==claim.generation){
    throw Object.assign(new Error('Queued execution authority changed.'),{code:'RUN_STATE_CONFLICT'});
  }
  // getRunAsync carries an observed generation, never worker authority. Only
  // this branded native Job receipt can adopt it as the current local attempt.
  attemptGenerations.set(record,claim.generation);runs.set(claim.runId,record);
  attemptScope.getStore()!.record=record;touchUser(claim.userId,claim.runId);claimLocalRun(claim.runId);
  try{await assertCurrentRunAttempt(captureAdmittedRunAttempt(claim.runId,claim.userId));}
  catch(error){
    releaseLocalRun(claim.runId);
    if(runs.get(claim.runId)===record)runs.delete(claim.runId);
    if(attemptScope.getStore()?.record===record)attemptScope.getStore()!.record=undefined;
    userIndex.set(claim.userId,(userIndex.get(claim.userId)??[]).filter(id=>id!==claim.runId));
    throw error;
  }
  return record;
}

/** Persist the recovery record before an expensive provider call begins. */
export async function createRunDurable(
  userId: string,
  prompt: string,
  runId: string,
  databaseProjectId?: string,
): Promise<SwarmRunRecord> {
  if(databaseProjectId!==undefined&&!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(databaseProjectId))throw new TenantAccessError(404,'RESOURCE_NOT_FOUND');
  if (pendingCreations.has(runId) || runs.has(runId)) {
    throw Object.assign(new Error('This run cannot be created again. Reconnect or use its recovery action.'), { code: 'RUN_ALREADY_EXISTS' });
  }
  pendingCreations.add(runId);
  let rec: SwarmRunRecord | undefined;
  try {
    rec = createRunHot(userId, prompt, runId);
    if(databaseProjectId)rec.databaseProjectId=databaseProjectId;
    // Creation must never use the update-capable persistence path. The unique
    // database key, not a preceding read, arbitrates competing API processes.
    await persistToSupabase(rec, true);
    return rec;
  } catch (error) {
    if (rec && runs.get(runId) === rec) {
      releaseLocalRun(runId);
      runs.delete(runId);
      userIndex.set(userId, (userIndex.get(userId) ?? []).filter(id => id !== runId));
    }
    throw error;
  } finally {
    pendingCreations.delete(runId);
  }
}

/**
 * Re-open one previously interrupted durable run without destroying its
 * run identity, event sequence, transcript or Agent V2 checkpoint key.
 *
 * This is intentionally different from createRunDurable().
 *
 * A retry of an interrupted Agent V2 task must use the SAME runId because
 * software_agent_checkpoints are keyed by that run id.
 */
export async function resumeRunDurable(
  userId: string,
  prompt: string,
  runId: string,
  databaseProjectId?: string,
): Promise<SwarmRunRecord> {
  if(databaseProjectId!==undefined&&!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(databaseProjectId))throw new TenantAccessError(404,'RESOURCE_NOT_FOUND');
  const codedError = (code: string, message: string) => {
    const error = new Error(message) as Error & { code: string };
    error.code = code;
    return error;
  };

  if (process.env.NODE_ENV === 'production' && !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    throw codedError('RUN_AUTHORITY_UNAVAILABLE', 'Durable run storage is unavailable.');
  }
  const existing = await getRunAsync(runId, userId, Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY));

  if (!existing || existing.userId !== userId) {
    throw codedError(
      'RUN_NOT_FOUND',
      'The build checkpoint could not be found for this account.',
    );
  }

  if(existing.databaseProjectId&&databaseProjectId&&existing.databaseProjectId!==databaseProjectId)throw new TenantAccessError(404,'RESOURCE_NOT_FOUND');

  if (existing.status === 'running') {
    throw codedError(
      'RUN_ALREADY_ACTIVE',
      'This build is already running. Reconnect to the existing run instead of starting another worker.',
    );
  }

  if (existing.status === 'complete') {
    throw codedError(
      'RUN_ALREADY_COMPLETE',
      'This build already completed. Reconnect to its result instead of starting another worker.',
    );
  }

  if (existing.status !== 'error' && existing.status !== 'cancelled') {
    throw codedError(
      'RUN_RESUME_CONFLICT',
      'This build is not in a resumable state.',
    );
  }

  const canonicalPrompt = existing.prompt.trim()
    ? existing.prompt
    : prompt.trim().slice(0, 8_000);

  const canonicalOutput = isEngineeringArtifact(existing.output)
    ? existing.output
    : null;
  const generation = randomUUID();

  /*
   * In production this UPDATE is the worker claim.
   *
   * The status predicate makes the transition atomic across API machines:
   * error/cancelled -> running. Only one process can win.
   */
  if (process.env.SUPABASE_SERVICE_ROLE_KEY) {
    const supabase = getSupabaseAdmin();
    let claim = supabase
      .from('swarm_runs')
      .update({
        ...(databaseProjectId?{project_id:databaseProjectId}:{}),
        status: 'running',
        prompt: canonicalPrompt,
        output: canonicalOutput,
        completed_at: null,
        lease_generation: generation,
        worker_id:
          RUN_WORKER_ID,
        heartbeat_at:
          new Date()
            .toISOString(),
      })
      .eq('id', runId)
      .eq('user_id', userId)
      .in('status', ['error', 'cancelled'])
      .eq('iteration_count', existing.iteration_count)
      .eq('last_sequence', existing.lastSequence);
    const observedGeneration = observedGenerations.get(existing);
    claim = observedGeneration ? claim.eq('lease_generation', observedGeneration) : claim.is('lease_generation', null);
    claim = existing.completed_at ? claim.eq('completed_at', existing.completed_at) : claim.is('completed_at', null);
    const { data, error } = await claim.select('id');

    if (error) {
      if(error.code==='42501')throw new TenantAccessError(404,'RESOURCE_NOT_FOUND');
      throw new Error('Platform run-resume claim is unavailable.');
    }

    if (!data?.length) {
      /*
       * Another API process may have won the claim between our read and conditional
       * UPDATE. Read authority without evicting a locally resumed winner.
       */
      const latest = await getRunAsync(runId, userId, true);

      if (!latest || latest.userId !== userId) {
        throw codedError(
          'RUN_NOT_FOUND',
          'The build checkpoint could not be found for this account.',
        );
      }

      if (latest.status === 'running') {
        throw codedError(
          'RUN_ALREADY_ACTIVE',
          'This build is already running. Reconnect to the existing run instead of starting another worker.',
        );
      }

      if (latest.status === 'complete') {
        throw codedError(
          'RUN_ALREADY_COMPLETE',
          'This build already completed. Reconnect to its result instead of starting another worker.',
        );
      }

      throw codedError(
        'RUN_RESUME_CONFLICT',
        'The build changed state while Xroga was trying to resume it.',
      );
    }
  }

  const resumed: SwarmRunRecord = {
    ...existing,
    ...(databaseProjectId?{databaseProjectId}:{}),
    prompt: canonicalPrompt,
    status: 'running',
    output: canonicalOutput,
    completed_at: null,
  };

  runs.set(runId, resumed);
  attemptGenerations.set(resumed, generation);
  const scope = attemptScope.getStore();
  if (scope) scope.record = resumed;
  touchUser(userId, runId);
  claimLocalRun(
    runId,
  );

  /*
   * Local/test environments have no Supabase claim above.
   */
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    await persistToSupabase(resumed);
  }

  return resumed;
}

export function completeRun(
  runId: string,
  data: {
    output: Record<string, unknown>;
    featureCategory?: string;
    tokenUsage?: unknown;
    success?: boolean;
  },
): SwarmRunRecord | null {
  const rec = mutableAttempt(runId);

  if (!rec) return null;

  /*
   * Finalization is a one-way state transition. A late duplicate callback,
   * stale catch block, or repeated client completion must not increment
   * iteration_count, overwrite terminal evidence, or record another learning
   * outcome. A resumed run explicitly transitions back to running first.
   */
  if (
    rec.status !==
    'running'
  ) {
    return rec;
  }

  rec.status =
    data.success === false
      ? 'error'
      : 'complete';

  rec.output = data.output;
  rec.featureCategory = data.featureCategory;
  rec.tokenUsage = data.tokenUsage;
  rec.completed_at = new Date().toISOString();
  rec.iteration_count += 1;

  releaseLocalRun(
    runId,
  );

  runs.set(
    runId,
    rec,
  );

  flushPersist(
    rec,
  );

  return rec;
}

export function failRun(
  runId: string,
  error: string,
  status: 'error' | 'cancelled' = 'error',

  // The specific reason code (e.g. CAPACITY_UNAVAILABLE) previously never reached the
  // persisted row — every failure was stored as the generic BUILD_FAILED, so a run
  // reconnected or reloaded after the fact lost the distinction the live stream had.
  extra: {
    code?: string;
    nextUnlockAt?: string | null;
  } = {},
): SwarmRunRecord | null {
  const rec = mutableAttempt(runId);

  if (!rec) return null;

  /*
   * Completion is authoritative and cancellation stays cancelled. An existing
   * error may still be enriched with a later concrete failure reason, or
   * corrected to an explicit cancellation, because the pipeline historically
   * persists a blocked engineering artifact before a late transport/provider
   * failure becomes known. Those terminal corrections do not consume another
   * iteration and never overwrite a successful completion.
   */
  if (
    rec.status ===
      'complete' ||
    rec.status ===
      'cancelled'
  ) {
    return rec;
  }

  const terminalCorrection =
    rec.status ===
      'error';

  rec.status = status;

  // Preserve an engineering artifact that already exists on this record.
  //
  // This used to assign unconditionally, which destroyed the result of any run that produced
  // files and a commit and then threw late — the artifact was written, then overwritten by a
  // bare error object, on both the live and the recovery path. The failure is real and must be
  // recorded; the evidence of what was actually built is what the user needs alongside it, and
  // discarding it makes a late failure indistinguishable from a run that did nothing.
  const existingArtifact =
    isEngineeringArtifact(rec.output)
      ? rec.output
      : null;

  const failure = {
    error: error.slice(0, 1000),

    code:
      status === 'cancelled'
        ? 'BUILD_CANCELLED'
        : (
            extra.code ??
            'BUILD_FAILED'
          ),

    ...(
      extra.nextUnlockAt
        ? {
            nextUnlockAt:
              extra.nextUnlockAt,
          }
        : {}
    ),
  };

  rec.output =
    existingArtifact
      ? {
          ...existingArtifact,
          ...failure,
        }
      : {
          type: 'error',
          ...failure,
        };

  rec.completed_at =
    terminalCorrection &&
    rec.completed_at
      ? rec.completed_at
      : new Date()
          .toISOString();

  if (
    !terminalCorrection
  ) {
    rec.iteration_count +=
      1;
  }

  releaseLocalRun(
    runId,
  );

  runs.set(
    runId,
    rec,
  );

  flushPersist(
    rec,
  );

  return rec;
}

export async function saveConversation(
  runId: string,
  messages: unknown[],
): Promise<boolean> {
  const rec = runs.get(runId);

  if (!rec) return false;
  let snapshot: unknown[];
  try {
    snapshot = structuredClone(Array.isArray(messages) ? messages.slice(-80) : []);
  } catch {
    return false;
  }
  if (process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NODE_ENV === 'production') {
    if (!(await persistConversationOnly(runId, rec.userId, snapshot))) return false;
  }

  // A resumed attempt may replace this cache entry while persistence is pending.
  // Never write the old request's snapshot into that newer attempt.
  if (runs.get(runId) === rec) rec.messages = snapshot;

  return true;
}

/**
 * Saves a conversation for a run this process does not hold in memory.
 *
 * The run map is per-process, and production runs more than one machine, so a
 * conversation save routinely lands on an instance that never saw the build. The
 * route used to handle that by fabricating a stub run and completing it — which
 * upserted on `id` and destroyed the real row: prompt, created_at, the entire
 * event transcript, and the actual outcome, replaced by an empty chat marked
 * complete. Observed in production twice.
 *
 * This writes the one column it means to write. It updates rather than upserts, so
 * it cannot create a row, and it is scoped to the owner so one user cannot write
 * over another's run. If the run does not exist, nothing happens — which is the
 * correct outcome for a conversation with no run.
 */
export async function persistConversationOnly(
  runId: string,
  userId: string,
  messages: unknown[],
): Promise<boolean> {
  if (
    !process.env.SUPABASE_SERVICE_ROLE_KEY
  ) {
    return false;
  }

  try {
    const trimmed = structuredClone(Array.isArray(messages) ? messages.slice(-80) : []);
    const supabase =
      getSupabaseAdmin();

    const {
      data,
      error,
    } =
      await supabase
        .from('swarm_runs')
        .update({
          messages:
            trimmed,
        })
        .eq(
          'id',
          runId,
        )
        .eq(
          'user_id',
          userId,
        )
        .select('id');

    if (error) {
      console.warn('[runStore] conversation-only persistence unavailable');

      return false;
    }

    return Array.isArray(data) && data.length === 1 && data[0]?.id === runId;
  } catch {
    console.warn('[runStore] conversation-only persistence unavailable');

    return false;
  }
}

export function appendRunEvent(
  runId: string,
  type: SwarmRunEvent['type'],
  data: Record<string, unknown>,
): SwarmRunEvent | null {
  const rec = mutableAttempt(runId);

  if (!rec) return null;

  const event: SwarmRunEvent = {
    sequence:
      rec.lastSequence + 1,

    type,

    data:
      redactOperationsValue(
        data,
      ) as Record<string, unknown>,

    createdAt:
      new Date().toISOString(),
  };

  rec.lastSequence =
    event.sequence;

  rec.events = [
    ...rec.events,
    event,
  ].slice(
    -MAX_EVENTS_PER_RUN,
  );

  runs.set(runId, rec);
  schedulePersist(rec);

  return event;
}

export function getRun(
  runId: string,
): SwarmRunRecord | null {
  return (
    runs.get(runId) ??
    null
  );
}

/** Terminal persistence must succeed before notifications or a worker exit. */
export async function persistTerminalRunAuthority(runId:string,userId:string):Promise<'complete'|'error'|'cancelled'>{
  const record=getRun(runId);
  if(!record||record.userId!==userId||record.status==='running')throw new Error('Terminal run authority is unavailable.');
  const status=record.status;await persistRunState(runId);
  if(getRun(runId)!==record||record.status!==status)throw new Error('Terminal run authority changed.');
  return status;
}

// Preserve schema-supported legacy evidence without inventing successful completion.
const persistedRunStates = {
  pending: 'running', planning: 'running', building: 'running', reviewing: 'running',
  testing: 'running', verifying: 'running', running: 'running',
  completed: 'complete', complete: 'complete', failed: 'error', error: 'error', cancelled: 'cancelled',
} as const;

function persistedRunStatus(value: unknown): SwarmRunRecord['status'] | null {
  return typeof value === 'string' && Object.hasOwn(persistedRunStates, value)
    ? persistedRunStates[value as keyof typeof persistedRunStates] : null;
}

/** Hot cache first; fall back to Supabase for cold starts / other instances. */
export async function getRunAsync(
  runId: string,
  ownerId: string,
  fresh = false,
): Promise<SwarmRunRecord | null> {
  const hot =
    runs.get(runId);

  if (hot && !fresh) {
    return hot.userId === ownerId ? hot : null;
  }

  if (
    !process.env.SUPABASE_SERVICE_ROLE_KEY
  ) {
    return null;
  }

  try {
    const supabase =
      getSupabaseAdmin();

    const query = supabase.from('swarm_runs').select('*').eq('id', runId).eq('user_id', ownerId);
    const {
      data,
      error,
    } =
      await query.maybeSingle();

    if (error && fresh) throw new Error('Run authority is unavailable.');
    if (error || !data) {
      return null;
    }
    if (data.id !== runId || data.user_id !== ownerId) return null;
    const status = persistedRunStatus(data.status);
    if (!status) {
      if (fresh) throw new Error('Run authority is unavailable.');
      return null;
    }

    const rec: SwarmRunRecord = {
      id:
        String(data.id),

      userId:
        String(data.user_id),

      ...(typeof data.project_id==='string'?{databaseProjectId:data.project_id}:{}),

      prompt:
        String(
          data.prompt ??
          '',
        ),

      status,

      output:
        (
          data.output as
            Record<string, unknown>
        ) ??
        null,

      featureCategory:
        data.feature_category ??
        undefined,

      tokenUsage:
        data.token_usage ??
        undefined,

      messages:
        Array.isArray(
          data.messages,
        )
          ? data.messages
          : undefined,

      created_at:
        String(
          data.created_at ??
          new Date().toISOString(),
        ),

      completed_at:
        data.completed_at
          ? String(
              data.completed_at,
            )
          : null,

      iteration_count:
        Number(
          data.iteration_count ??
          0,
        ),

      events:
        Array.isArray(
          data.events,
        )
          ? (
              data.events as
                SwarmRunEvent[]
            )
          : [],

      lastSequence:
        Number(
          data.last_sequence ??
          0,
        ),
    };

    observedGenerations.set(rec, typeof data.lease_generation === 'string' ? data.lease_generation : null);
    if (fresh) return rec;
    // A worker may have been admitted while the cold read was awaiting IO.
    // Hydration must never replace the object carrying that attempt's authority.
    const current = runs.get(runId);
    if (current) return current.userId === ownerId ? current : null;
    runs.set(
      runId,
      rec,
    );

    touchUser(
      rec.userId,
      runId,
    );

    return rec;
  } catch {
    if (fresh) throw new Error('Run authority is unavailable.');
    return null;
  }
}

/**
 * Persist an explicit user cancellation independently of the worker that owns the
 * live provider stream. Production runs on more than one process, so an in-memory
 * AbortController alone cannot be the source of truth for Stop.
 */
export async function requestRunCancellation(
  runId: string,
  userId: string,
): Promise<boolean> {
  if (process.env.NODE_ENV === 'production' && !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error('Platform cancellation write is unavailable.');
  }
  const hot =
    runs.get(runId);

  if (
    hot &&
    hot.userId !== userId
  ) {
    return false;
  }

  /*
   * Without durable storage the hot record is authoritative. In production,
   * however, another API process may have resumed the same run after this
   * process cached an older terminal copy, so the conditional Supabase UPDATE
   * below remains the source of truth.
   */
  if (
    !process.env
      .SUPABASE_SERVICE_ROLE_KEY &&
    hot &&
    hot.status !==
      'running'
  ) {
    return false;
  }

  let cancelledAt =
    new Date().toISOString();
  let iterationCount = (hot?.iteration_count ?? 0) + 1;
  let featureCategory = hot?.featureCategory;
  let createdAt = hot?.created_at;

  const cancelledOutput = {
    type: 'error',
    error: 'Build stopped.',
    code: 'BUILD_CANCELLED',
  };

  if (
    process.env.SUPABASE_SERVICE_ROLE_KEY
  ) {
    const supabase =
      getSupabaseAdmin();

    const {
      data,
      error,
    } =
      await supabase.rpc('cancel_swarm_run_owned', { p_run_id: runId, p_owner_id: userId });

    if (error) {
      throw new Error(
        'Platform cancellation write is unavailable.',
      );
    }

    if (data === null) return false;
    if (!data || typeof data !== 'object' || Array.isArray(data) || data.id !== runId || data.user_id !== userId ||
        data.status !== 'cancelled' || data.lease_generation !== null ||
        typeof data.completed_at !== 'string' || !Number.isFinite(Date.parse(data.completed_at)) ||
        typeof data.created_at !== 'string' || !Number.isFinite(Date.parse(data.created_at)) ||
        !Number.isSafeInteger(data.iteration_count) || data.iteration_count < 1 ||
        !(data.feature_category === null || typeof data.feature_category === 'string') ||
        data.output?.type !== cancelledOutput.type || data.output?.code !== cancelledOutput.code || data.output?.error !== cancelledOutput.error) {
      throw new Error('Platform cancellation receipt is invalid.');
    }
    cancelledAt = data.completed_at;
    iterationCount = data.iteration_count;
    featureCategory = data.feature_category ?? undefined;
    createdAt = data.created_at;
  } else if (!hot) {
    return false;
  }

  if (
    hot?.status === 'running' && runs.get(runId) === hot
  ) {
    hot.status =
      'cancelled';

    hot.output =
      cancelledOutput;

    hot.completed_at =
      cancelledAt;

    hot.iteration_count = iterationCount;

    runs.set(
      runId,
      hot,
    );

    releaseLocalRun(
      runId,
    );
  }

  if (process.env.SUPABASE_SERVICE_ROLE_KEY) await recordTerminalBuildOutcomeFailOpen({
    runId,

    userId,

    terminalStatus:
      'cancelled',

    featureCategory:
      featureCategory,

    iterationCount:
      iterationCount,

    createdAt:
      createdAt,

    completedAt:
      cancelledAt,

    output:
      cancelledOutput,
  }, new SupabaseBuildOutcomeStore({ kind: 'cancellation', completedAt: cancelledAt, output: cancelledOutput }));

  return true;
}

/** Read the durable cancellation flag without accepting a potentially stale hot row. */
export async function isRunCancellationRequested(
  runId: string,
  userId: string,
  options: {requireRunning?:boolean} = {},
): Promise<boolean> {
  const hot =
    runs.get(runId);
  const scope = attemptScope.getStore();
  if (scope && scope.record !== hot) throw new Error('Run authority is unavailable.');

  if (
    hot?.userId === userId && hot.status ===
    'cancelled'
  ) {
    return true;
  }

  if (
    !process.env.SUPABASE_SERVICE_ROLE_KEY
  ) {
    if (process.env.NODE_ENV === 'production') throw new Error('Run authority is unavailable.');
    return false;
  }

  try {
    const supabase =
      getSupabaseAdmin();

    const {
      data,
      error,
    } =
      await supabase
        .from('swarm_runs')
        .select('id,user_id,status,lease_generation,worker_id')
        .eq(
          'id',
          runId,
        )
        .eq('user_id', userId)
        .maybeSingle();

    if (error || !data || data.id !== runId || data.user_id !== userId ||
        !['running', 'complete', 'completed', 'error', 'cancelled'].includes(data.status) ||
        (options.requireRunning && !['running','cancelled'].includes(data.status)) ||
        (scope && (scope.record !== runs.get(runId) || scope.record !== hot))) {
      throw new Error('Run authority is unavailable.');
    }
    const generation = hot && attemptGenerations.get(hot);
    if (data.status !== 'cancelled' && generation &&
      (data.lease_generation !== generation || (data.status === 'running' && data.worker_id !== RUN_WORKER_ID))) {
      throw new Error('Run authority is unavailable.');
    }
    return data.status === 'cancelled';
  } catch {
    throw new Error('Run authority is unavailable.');
  }
}

/**
 * The runs this process is currently holding.
 *
 * Used by the shutdown handler: a deploy kills the process, and anything still
 * `running` here would otherwise be left orphaned in the database with no worker.
 */
export function activeRunIds(): string[] {
  const active: string[] = [];

  for (
    const id of
    locallyOwnedRunIds
  ) {
    const run =
      runs.get(
        id,
      );

    if (
      run?.status ===
      'running'
    ) {
      active.push(id);
    }
  }

  return active;
}

export function listRunsForUser(
  userId: string,
  limit = 30,
): SwarmRunRecord[] {
  const ids =
    userIndex.get(userId) ??
    [];

  return ids
    .map(
      (id) =>
        runs.get(id),
    )
    .filter(
      (
        r,
      ): r is SwarmRunRecord =>
        Boolean(r && r.userId === userId),
    )
    .slice(
      0,
      limit,
    );
}

export function mergeRunHistory(
  persisted: SwarmRunRecord[],
  hot: SwarmRunRecord[],
  limit: number,
): SwarmRunRecord[] {
  const merged =
    new Map(
      persisted.map(
        (run) => [
          run.id,
          run,
        ],
      ),
    );

  for (
    const run of hot
  ) {
    merged.set(
      run.id,
      run,
    );
  }

  return [
    ...merged.values(),
  ]
    .sort(
      (
        a,
        b,
      ) =>
        Date.parse(
          b.created_at,
        ) -
        Date.parse(
          a.created_at,
        ),
    )
    .slice(
      0,
      limit,
    );
}

export async function listRunsForUserAsync(
  userId: string,
  limit = 30,
): Promise<SwarmRunRecord[]> {
  const hot =
    listRunsForUser(
      userId,
      limit,
    );

  if (
    !process.env.SUPABASE_SERVICE_ROLE_KEY
  ) {
    return hot;
  }

  try {
    const supabase =
      getSupabaseAdmin();

    const {
      data,
      error,
    } =
      await supabase
        .from('swarm_runs')
        .select('*')
        .eq(
          'user_id',
          userId,
        )
        .in(
          'status',
          Object.keys(persistedRunStates),
        )
        .order(
          'created_at',
          {
            ascending:
              false,
          },
        )
        .limit(limit);

    if (
      error ||
      !data?.length
    ) {
      return hot;
    }

    const persisted =
      data.flatMap(
        (row) => {
          if (row.user_id !== userId || typeof row.id !== 'string' || !row.id) return [];
          const status = persistedRunStatus(row.status);
          if (!status) return [];
          const current = runs.get(row.id);
          if (current && current.userId !== userId) return [];
          if (current && attemptGenerations.has(current)) return [current];
          const rec: SwarmRunRecord = {
            id:
              String(
                row.id,
              ),

            userId:
              String(
                row.user_id,
              ),

            prompt:
              String(
                row.prompt ??
                '',
              ),

            status,

            output:
              (
                row.output as
                  Record<
                    string,
                    unknown
                  >
              ) ??
              null,

            featureCategory:
              row.feature_category ??
              undefined,

            tokenUsage:
              row.token_usage ??
              undefined,

            messages:
              Array.isArray(
                row.messages,
              )
                ? row.messages
                : undefined,

            created_at:
              String(
                row.created_at ??
                new Date()
                  .toISOString(),
              ),

            completed_at:
              row.completed_at
                ? String(
                    row.completed_at,
                  )
                : null,

            iteration_count:
              Number(
                row.iteration_count ??
                0,
              ),

            events:
              Array.isArray(
                row.events,
              )
                ? (
                    row.events as
                      SwarmRunEvent[]
                  )
                : [],

            lastSequence:
              Number(
                row.last_sequence ??
                0,
              ),
          };

          runs.set(
            rec.id,
            rec,
          );

          touchUser(
            userId,
            rec.id,
          );

          return [rec];
        },
      );

    // A warm process may only know about the newest run. Returning that partial hot
    // cache made older durable runs disappear from History and prevented legacy
    // terminal snapshots from finding their authoritative build artifact. Merge both
    // sources, preferring the live record for an ID that exists in each.
    return mergeRunHistory(
      persisted,
      hot.map(rec => runs.get(rec.id) ?? rec),
      limit,
    );
  } catch {
    return hot;
  }
}

export async function persistRunState(
  runId: string,
): Promise<void> {
  const rec =
    mutableAttempt(runId);

  if (!rec) {
    throw new Error(
      'Cannot persist an unknown swarm run',
    );
  }

  await terminalPersistence.get(rec);

  await persistToSupabase(
    rec,
  );
}

async function persistToSupabase(
  rec: SwarmRunRecord,
  createOnly = false,
): Promise<void> {
  const generation = attemptGenerations.get(rec);
  // Capture before any await so late callbacks cannot borrow a resumed attempt.
  rec = structuredClone(rec);
  if (
    !process.env.SUPABASE_SERVICE_ROLE_KEY
  ) {
    if (process.env.NODE_ENV === 'production') throw new Error('Durable run storage is unavailable.');
    return;
  }

  const supabase =
    getSupabaseAdmin();

  const context = createTenantContext({ userId: rec.userId, via: 'persisted_owner' });
  if (!generation) throw Object.assign(new Error('Execution attempt authority is missing.'), { code: 'RUN_STATE_CONFLICT' });
  const row = {
          ...(rec.databaseProjectId?{project_id:rec.databaseProjectId}:{}),
          id:
            rec.id,

          user_id:
            rec.userId,

          prompt:
            rec.prompt,

          status:
            rec.status,

          output:
            rec.output,

          feature_category:
            rec.featureCategory ??
            null,

          token_usage:
            rec.tokenUsage ??
            null,

          messages:
            rec.messages ??
            null,

          created_at:
            rec.created_at,

          completed_at:
            rec.completed_at,

          iteration_count:
            rec.iteration_count,

          events:
            rec.events,

          last_sequence:
            rec.lastSequence,

          ...(
            rec.status !==
              'running'
              ? {
                  worker_id:
                    null,

                  heartbeat_at:
                    null,
                }
              : locallyOwnedRunIds
                  .has(
                    rec.id,
                  )
                ? {
                    worker_id:
                      RUN_WORKER_ID,

                    heartbeat_at:
                      new Date()
                        .toISOString(),
                  }
                : {}
          ),
        };
  if (createOnly) {
    const { error } = await supabase.from('swarm_runs').insert({ ...row, lease_generation: generation });
    if (error) {
      if(error.code==='42501')throw new TenantAccessError(404,'RESOURCE_NOT_FOUND');
      if (error.code === '23505') throw Object.assign(new Error('This run already exists.'), { code: 'RUN_ALREADY_EXISTS' });
      throw new Error('Durable run creation failed.');
    }
  } else {
    const { id, user_id, project_id, messages, created_at, worker_id, heartbeat_at, ...state } = { worker_id: null as string | null, heartbeat_at: null as string | null, ...row };
    await persistOwnedRunAttempt(supabase, context, id, RUN_WORKER_ID, generation, state);
  }
}
