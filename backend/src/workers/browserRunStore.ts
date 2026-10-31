/**
 * Durable browser-run record (`supabase/migrations/20261026100000_browser_runs_durable.sql`).
 *
 * A browser run used to live only in the process that accepted the request: its spec was a closure, its cancel handle an in-memory map and
 * its state went to a store that required a swarm attempt. This record is what lets ANY instance start, continue, cancel or recover it:
 *
 *   - the validated run spec (so a worker that never saw the request can run it),
 *   - the canonical execution state (the same document the scheduler already checkpoints),
 *   - a cancel flag that any instance can set and the running instance polls.
 *
 * Every read and write is scoped by the owner; `loadInternal` exists only for the signed internal endpoints, which then run the record
 * under the owner it names.
 */
import type { Pool } from 'pg';
import type { CanonicalExecutionState, ExecutionStateStore } from '../ai/executionRuntime.js';
import type { Lease } from './leaseStore.js';

export type BrowserRunStatus = 'queued' | 'running' | 'completed' | 'failed' | 'blocked' | 'cancelled';
const TERMINAL: readonly BrowserRunStatus[] = ['completed', 'failed', 'blocked', 'cancelled'];
export const isTerminalRunStatus = (s: BrowserRunStatus): boolean => TERMINAL.includes(s);

/** Everything a worker needs to run the run; written once, after validation, and never client-supplied after that. */
export interface BrowserRunSpec {
  goal: string;
  startUrl: string;
  allowedOrigins: string[];
  limits: Record<string, number>;
  /** the parsed, trusted plan */
  plan: unknown;
  /** Explicit fresh-session continuation stages. No cookies or browser profile is persisted here. */
  continuations?: { startUrl: string; plan: unknown }[];
  /** the Drive project the evidence goes to, or null for the user's own objects */
  driveProject: string | null;
}

export interface BrowserRunRecord {
  runId: string;
  tenantId: string;
  userId: string;
  projectKey: string;
  status: BrowserRunStatus;
  spec: BrowserRunSpec;
  state: CanonicalExecutionState;
  cancelRequested: boolean;
  updatedAt: string;
}

export type CancelOutcome = 'requested' | 'already_finished' | 'not_found';

export interface BrowserRunStore {
  /** Persists a validated run as `queued`. */
  create(input: { tenantId: string; userId: string; state: CanonicalExecutionState; spec: BrowserRunSpec }): Promise<void>;
  /** The canonical execution store for one owner: another owner's run id loads as nothing and cannot be written. */
  stateStore(userId: string, executionLease?: () => Lease): ExecutionStateStore;
  load(userId: string, runId: string): Promise<BrowserRunRecord | null>;
  /** For the signed internal endpoints only. */
  loadInternal(runId: string): Promise<BrowserRunRecord | null>;
  /** Sets the cancel flag on a run that is not finished. Idempotent. */
  requestCancel(userId: string, runId: string): Promise<CancelOutcome>;
  isCancelRequested(runId: string): Promise<boolean>;
  /** Runs of this tenant that are queued or running: the durable, cross-instance admission count. */
  countActive(tenantId: string): Promise<number>;
  /** Queued or running runs untouched for `staleMs`: candidates for recovery. */
  listRecoverable(staleMs: number, limit: number): Promise<BrowserRunRecord[]>;
  markDispatched(runId: string): Promise<void>;
}

/** A completed stage cannot prematurely finalize a durable multi-stage run. */
export function runStatusOf(state: CanonicalExecutionState): BrowserRunStatus {
  if (!state.tasks.length) return 'failed';
  for (const status of ['cancelled', 'failed', 'blocked'] as const) {
    if (state.tasks.some(task => task.status === status)) return status;
  }
  if (state.tasks.every(task => task.status === 'completed')) return 'completed';
  return state.tasks.some(task => task.status === 'running' || task.status === 'completed') ? 'running' : 'queued';
}

export class MemoryBrowserRunStore implements BrowserRunStore {
  private readonly rows = new Map<string, BrowserRunRecord & { touched: number; dispatched: boolean }>();
  constructor(private readonly now: () => number = Date.now) {}

  async create(input: { tenantId: string; userId: string; state: CanonicalExecutionState; spec: BrowserRunSpec }): Promise<void> {
    if (this.rows.has(input.state.runId)) throw new Error('run already exists');
    this.rows.set(input.state.runId, { runId: input.state.runId, tenantId: input.tenantId, userId: input.userId, projectKey: input.state.projectId, status: 'queued', spec: structuredClone(input.spec), state: structuredClone(input.state), cancelRequested: false, updatedAt: new Date(this.now()).toISOString(), touched: this.now(), dispatched: false });
  }

  stateStore(userId: string, _executionLease?: () => Lease): ExecutionStateStore {
    return {
      load: async (runId) => { const row = this.rows.get(runId); return row && row.userId === userId ? structuredClone(row.state) : null; },
      save: async (state) => {
        const row = this.rows.get(state.runId);
        if (!row || row.userId !== userId) throw Object.assign(new Error('Execution checkpoint is no longer authoritative.'), { code: 'RUN_STATE_CONFLICT' });
        row.state = structuredClone(state); row.status = runStatusOf(state); row.touched = this.now(); row.updatedAt = new Date(row.touched).toISOString();
      },
    };
  }

  async load(userId: string, runId: string): Promise<BrowserRunRecord | null> { const row = this.rows.get(runId); return row && row.userId === userId ? this.copy(row) : null; }
  async loadInternal(runId: string): Promise<BrowserRunRecord | null> { const row = this.rows.get(runId); return row ? this.copy(row) : null; }

  async requestCancel(userId: string, runId: string): Promise<CancelOutcome> {
    const row = this.rows.get(runId);
    if (!row || row.userId !== userId) return 'not_found';
    if (isTerminalRunStatus(row.status)) return 'already_finished';
    row.cancelRequested = true; row.touched = this.now();
    return 'requested';
  }

  async isCancelRequested(runId: string): Promise<boolean> { return this.rows.get(runId)?.cancelRequested ?? false; }
  async countActive(tenantId: string): Promise<number> { return [...this.rows.values()].filter((r) => r.tenantId === tenantId && !isTerminalRunStatus(r.status)).length; }

  async listRecoverable(staleMs: number, limit: number): Promise<BrowserRunRecord[]> {
    const cutoff = this.now() - staleMs;
    return [...this.rows.values()].filter((r) => !isTerminalRunStatus(r.status) && r.touched <= cutoff).slice(0, limit).map((r) => this.copy(r));
  }

  async markDispatched(runId: string): Promise<void> { const row = this.rows.get(runId); if (row) { row.dispatched = true; row.touched = this.now(); } }

  private copy(row: BrowserRunRecord): BrowserRunRecord {
    const { runId, tenantId, userId, projectKey, status, spec, state, cancelRequested, updatedAt } = row;
    return structuredClone({ runId, tenantId, userId, projectKey, status, spec, state, cancelRequested, updatedAt });
  }
}

interface Row { run_id: string; tenant_id: string; user_id: string; project_key: string; status: BrowserRunStatus; spec: BrowserRunSpec; state: CanonicalExecutionState; cancel_requested_at: Date | null; updated_at: Date }
const COLUMNS = 'run_id, tenant_id, user_id, project_key, status, spec, state, cancel_requested_at, updated_at';
const toRecord = (r: Row): BrowserRunRecord => ({ runId: r.run_id, tenantId: r.tenant_id, userId: r.user_id, projectKey: r.project_key, status: r.status, spec: r.spec, state: r.state, cancelRequested: r.cancel_requested_at !== null, updatedAt: r.updated_at.toISOString() });

export class PostgresBrowserRunStore implements BrowserRunStore {
  constructor(private readonly pool: Pick<Pool, 'query'>) {}

  async create(input: { tenantId: string; userId: string; state: CanonicalExecutionState; spec: BrowserRunSpec }): Promise<void> {
    await this.pool.query(
      'insert into public.browser_runs (run_id, tenant_id, user_id, project_key, status, state, spec) values ($1,$2,$3,$4,\'queued\',$5::jsonb,$6::jsonb)',
      [input.state.runId, input.tenantId, input.userId, input.state.projectId, JSON.stringify(input.state), JSON.stringify(input.spec)],
    );
  }

  stateStore(userId: string, executionLease?: () => Lease): ExecutionStateStore {
    return {
      load: async (runId) => {
        const r = await this.pool.query<{ state: CanonicalExecutionState }>('select state from public.browser_runs where run_id=$1 and user_id=$2', [runId, userId]);
        return r.rows[0]?.state ?? null;
      },
      save: async (state) => {
        // Lock the lease row in the same statement as the checkpoint update. A
        // pre-write lease check alone races with expiry and replacement.
        const lease = executionLease?.();
        if (!lease || lease.runId !== state.runId || lease.taskId !== 'execute') {
          throw Object.assign(new Error('Execution checkpoint is no longer authoritative.'), { code: 'RUN_STATE_CONFLICT' });
        }
        const r = await this.pool.query(
          `with valid_lease as (
             select tenant_id, run_id, expires_at from public.worker_task_leases
             where tenant_id=$5 and run_id=$1::text and task_id='execute' and worker_id=$6
               and token=$7 and held and expires_at>clock_timestamp() for update
           )
           update public.browser_runs b set
             state=case when b.status in ('queued','running') then $3::jsonb else b.state end,
             status=case when b.status in ('queued','running') then $4 else b.status end,
             updated_at=case when b.status in ('queued','running') then now() else b.updated_at end
           from valid_lease l where b.run_id=$1::uuid and b.user_id=$2 and b.tenant_id=l.tenant_id
             and b.project_key=$8 and (b.status in ('queued','running') or b.status=$4)
             and l.expires_at>clock_timestamp() and (b.cancel_requested_at is null or $4<>'completed')`,
          [state.runId, userId, JSON.stringify(state), runStatusOf(state), lease.tenantId, lease.workerId, lease.token, state.projectId],
        );
        if (r.rowCount === 0) {
          throw Object.assign(new Error('Execution checkpoint is no longer authoritative.'), { code: 'RUN_STATE_CONFLICT' });
        }
      },
    };
  }

  async load(userId: string, runId: string): Promise<BrowserRunRecord | null> {
    const r = await this.pool.query<Row>(`select ${COLUMNS} from public.browser_runs where run_id=$1 and user_id=$2`, [runId, userId]);
    return r.rows[0] ? toRecord(r.rows[0]) : null;
  }

  async loadInternal(runId: string): Promise<BrowserRunRecord | null> {
    const r = await this.pool.query<Row>(`select ${COLUMNS} from public.browser_runs where run_id=$1`, [runId]);
    return r.rows[0] ? toRecord(r.rows[0]) : null;
  }

  async requestCancel(userId: string, runId: string): Promise<CancelOutcome> {
    const r = await this.pool.query<{ status: BrowserRunStatus; flagged: boolean }>(
      'with cur as (select status from public.browser_runs where run_id=$1 and user_id=$2), upd as (update public.browser_runs set cancel_requested_at=coalesce(cancel_requested_at, now()), updated_at=now() where run_id=$1 and user_id=$2 and status in (\'queued\',\'running\') returning 1) select (select status from cur) as status, exists(select 1 from upd) as flagged',
      [runId, userId],
    );
    const row = r.rows[0];
    if (!row?.status) return 'not_found';
    return row.flagged ? 'requested' : 'already_finished';
  }

  async isCancelRequested(runId: string): Promise<boolean> {
    const r = await this.pool.query<{ c: boolean }>('select cancel_requested_at is not null as c from public.browser_runs where run_id=$1', [runId]);
    return r.rows[0]?.c ?? false;
  }

  async countActive(tenantId: string): Promise<number> {
    const r = await this.pool.query<{ n: string }>('select count(*)::text as n from public.browser_runs where tenant_id=$1 and status in (\'queued\',\'running\')', [tenantId]);
    return Number(r.rows[0]?.n ?? 0);
  }

  async listRecoverable(staleMs: number, limit: number): Promise<BrowserRunRecord[]> {
    const r = await this.pool.query<Row>(
      `select ${COLUMNS} from public.browser_runs where status in ('queued','running') and updated_at <= now() - ($1::text || ' milliseconds')::interval order by updated_at limit $2`,
      [String(Math.max(0, Math.floor(staleMs))), Math.max(1, Math.min(200, Math.floor(limit)))],
    );
    return r.rows.map(toRecord);
  }

  async markDispatched(runId: string): Promise<void> {
    await this.pool.query('update public.browser_runs set dispatched_at=now(), updated_at=now() where run_id=$1 and status in (\'queued\',\'running\')', [runId]);
  }
}
