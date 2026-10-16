/**
 * Lightweight per-run observability — stages + timings for "why did this fail?"
 */

import { getSupabaseAdmin } from '../config/supabase.js';
import { requireAdmittedRunAttempt, type AdmittedRunAttempt } from './runStore.js';
import { redactSecrets } from '../lib/truthfulExecution.js';

function diagnosticSnapshot(value:unknown,depth=0,seen=new WeakSet<object>()):unknown {
  if(typeof value==='string')return redactSecrets(value).replace(/Bearer\s+[A-Za-z0-9._~+\/-]+=*/gi,'Bearer [REDACTED]').slice(0,3000);
  if(value===null||typeof value==='boolean'||typeof value==='number')return value;
  if(!value||typeof value!=='object')return null;
  if(depth>8||seen.has(value))return '[OMITTED]';seen.add(value);
  if(Array.isArray(value))return value.slice(-1000).map(item=>diagnosticSnapshot(item,depth+1,seen));
  return Object.fromEntries(Object.entries(value).slice(0,100).map(([key,item])=>[key,
    /password|secret|authorization|api.?key|access.?token|refresh.?token|credential/i.test(key)?'[REDACTED]':diagnosticSnapshot(item,depth+1,seen)]));
}

export interface TraceStage {
  agent: string;
  status: string;
  message?: string;
  at: string;
  msFromStart?: number;
}

export class RunTrace {
  readonly runId: string;
  readonly userId: string;
  readonly startedAt: number;
  stages: TraceStage[] = [];
  meta: Record<string, unknown> = {};
  private attempt?: AdmittedRunAttempt;

  constructor(runId: string, userId: string) {
    this.runId = runId;
    this.userId = userId;
    this.startedAt = Date.now();
  }

  bindAttempt(attempt:AdmittedRunAttempt):void {
    requireAdmittedRunAttempt(attempt);
    if(this.attempt || attempt.runId!==this.runId || attempt.userId!==this.userId)throw Object.assign(new Error('Trace attempt binding is invalid.'),{code:'RUN_STATE_CONFLICT'});
    this.attempt=attempt;
  }

  add(agent: string, status: string, message?: string) {
    this.stages.push({
      agent,
      status,
      message: message ? redactSecrets(message).slice(0, 300) : undefined,
      at: new Date().toISOString(),
      msFromStart: Date.now() - this.startedAt,
    });
  }

  setMeta(partial: Record<string, unknown>) {
    Object.assign(this.meta, partial);
  }

  summary(): { stages: TraceStage[]; meta: Record<string, unknown>; durationMs: number } {
    return {
      stages: diagnosticSnapshot(this.stages) as TraceStage[],
      meta: diagnosticSnapshot(this.meta) as Record<string,unknown>,
      durationMs: Date.now() - this.startedAt,
    };
  }

  async persist(): Promise<void> {
    if (!process.env.SUPABASE_SERVICE_ROLE_KEY) return;
    try {
      const attempt=this.attempt;
      if(!attempt||attempt.runId!==this.runId||attempt.userId!==this.userId)throw new Error('Trace admission is missing.');
      requireAdmittedRunAttempt(attempt);
      const snapshot=this.summary();
      const supabase = getSupabaseAdmin();
      const {data,error}=await supabase.rpc('persist_run_trace_attempt',{
        p_run_id:this.runId,p_owner_id:this.userId,p_worker_id:attempt.workerId,p_generation:attempt.generation,
        p_stages:snapshot.stages,p_meta:{...snapshot.meta,durationMs:snapshot.durationMs},
      });
      if(error||data!==true)throw new Error('Trace persistence unavailable.');
    } catch (err) {
      console.warn('[runTrace] diagnostic persistence unavailable');
    }
  }
}
