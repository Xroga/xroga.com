/**
 * Lightweight per-run observability — stages + timings for "why did this fail?"
 */

import { getSupabaseAdmin } from '../config/supabase.js';
import { createTenantContext } from '../security/tenantContext.js';
import { persistOwnedRunTrace } from '../security/ownedRunPersistence.js';

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

  constructor(runId: string, userId: string) {
    this.runId = runId;
    this.userId = userId;
    this.startedAt = Date.now();
  }

  add(agent: string, status: string, message?: string) {
    this.stages.push({
      agent,
      status,
      message: message?.slice(0, 300),
      at: new Date().toISOString(),
      msFromStart: Date.now() - this.startedAt,
    });
  }

  setMeta(partial: Record<string, unknown>) {
    Object.assign(this.meta, partial);
  }

  summary(): { stages: TraceStage[]; meta: Record<string, unknown>; durationMs: number } {
    return {
      stages: this.stages,
      meta: this.meta,
      durationMs: Date.now() - this.startedAt,
    };
  }

  async persist(): Promise<void> {
    if (!process.env.SUPABASE_SERVICE_ROLE_KEY) return;
    try {
      const supabase = getSupabaseAdmin();
      await persistOwnedRunTrace(
        supabase,
        createTenantContext({userId:this.userId,via:'persisted_owner'}),
        {
          run_id: this.runId,
          user_id: this.userId,
          stages: this.stages,
          meta: { ...this.meta, durationMs: Date.now() - this.startedAt },
          updated_at: new Date().toISOString(),
        },
      );
    } catch (err) {
      console.warn('[runTrace] persist failed:', (err as Error).message);
    }
  }
}
