import type { SupabaseClient } from '@supabase/supabase-js';
import { requireTenantContext, type TenantContext } from './tenantContext.js';
import { TenantAccessError } from './tenantErrors.js';

/** Update an existing execution attempt under a database row lock, never upsert. */
export async function persistOwnedRunAttempt(client: SupabaseClient, context: TenantContext,
  runId: string, workerId: string, generation: string, state: Record<string, unknown>): Promise<void> {
  const scope = requireTenantContext(context);
  const { data, error } = await client.rpc('persist_swarm_run_attempt', {
    p_run_id: runId, p_owner_id: scope.userId, p_worker_id: workerId,
    p_generation: generation, p_state: state,
  });
  if (error) throw new TenantAccessError(503, 'RESOURCE_ACCESS_UNAVAILABLE');
  if (data !== true) throw Object.assign(new Error('The execution attempt is no longer authoritative.'), { code: 'RUN_STATE_CONFLICT' });
}

/** Extend the existing run store's writer: insert-ignore, then an owner-bound update. */
export async function persistOwnedRun(client: SupabaseClient, context: TenantContext, row: {id:string;user_id:string;[column:string]:unknown}): Promise<void> {
  return persistOwnerBoundRecord(client,context,'swarm_runs','id',row);
}

/** Same guard for the existing project-runtime store; never caller-selected table/column. */
export async function persistOwnedRuntimeSession(client: SupabaseClient, context: TenantContext, row: {session_id:string;user_id:string;[column:string]:unknown}): Promise<void> {
  return persistOwnerBoundRecord(client,context,'project_runtime_sessions','session_id',row);
}

/** Existing best-effort trace store shares the same global-ID collision boundary. */
export async function persistOwnedRunTrace(client: SupabaseClient, context: TenantContext, row: {run_id:string;user_id:string;[column:string]:unknown}): Promise<void> {
  return persistOwnerBoundRecord(client,context,'swarm_run_traces','run_id',row);
}

/** Canonical execution state uses the existing globally unique run_id key. */
export async function persistOwnedExecutionState(client: SupabaseClient, context: TenantContext, row: {run_id:string;user_id:string;[column:string]:unknown}): Promise<void> {
  return persistOwnerBoundRecord(client,context,'execution_runs','run_id',row);
}

const universalRecords = {
  spec: {table:'project_specs',key:'spec_id'},
  plan: {table:'architecture_plans',key:'plan_id'},
  research_run: {table:'research_runs',key:'research_run_id'},
  research_evidence: {table:'research_evidence',key:'evidence_id'},
  repository_index: {table:'repository_indexes',key:'index_id'},
  build_outcome: {table:'build_outcomes',key:'run_id'},
  mutation: {table:'plan_mutations',key:'mutation_key'},
} as const;
export type OwnedUniversalRecordKind = keyof typeof universalRecords;

/** Finite inspected tables/keys only; not a caller-selected table or new store. */
export async function persistOwnedUniversalRecord(client: SupabaseClient, context: TenantContext, kind: OwnedUniversalRecordKind, row: {user_id:string;[column:string]:unknown}): Promise<void> {
  if(!Object.hasOwn(universalRecords,kind))throw new TenantAccessError(404,'RESOURCE_NOT_FOUND');
  const policy=universalRecords[kind];
  return persistOwnerBoundRecord(client,context,policy.table,policy.key,row,kind==='mutation');
}

async function persistOwnerBoundRecord(client: SupabaseClient, context: TenantContext, table:'swarm_runs'|'project_runtime_sessions'|'swarm_run_traces'|'execution_runs'|typeof universalRecords[OwnedUniversalRecordKind]['table'], key:'id'|'session_id'|'run_id'|typeof universalRecords[OwnedUniversalRecordKind]['key'], row:{user_id:string;[column:string]:unknown},appendOnly=false): Promise<void> {
  const scope = requireTenantContext(context);
  // Bind both writes and their predicates to the same caller-independent snapshot.
  row = structuredClone(row);
  if (row.user_id !== scope.userId) throw new TenantAccessError(404,'RESOURCE_NOT_FOUND');
  if(typeof row[key]!=='string'||!row[key]||String(row[key]).length>2000)throw new TenantAccessError(404,'RESOURCE_NOT_FOUND');
  const inserted = await client.from(table).upsert(row,{onConflict:key,ignoreDuplicates:true});
  if (inserted.error) throw new TenantAccessError(503,'RESOURCE_ACCESS_UNAVAILABLE');
  let query=appendOnly?client.from(table).select(key):client.from(table).update(row).select(key);
  query=query.eq(key,row[key]).eq('user_id',scope.userId);
  if(appendOnly)query=query.eq('run_id',row.run_id).eq('project_id',row.project_id);
  const {data,error} = await query;
  if (error) throw new TenantAccessError(503,'RESOURCE_ACCESS_UNAVAILABLE');
  if (data?.length !== 1) throw new TenantAccessError(404,'RESOURCE_NOT_FOUND');
}
