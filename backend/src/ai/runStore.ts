/**
 * In-memory swarm run history (per process). Survives within a deploy instance.
 * Optional Supabase persistence when service role is configured.
 */

import { getSupabaseAdmin } from '../config/supabase.js';

export interface SwarmRunRecord {
  id: string;
  userId: string;
  prompt: string;
  status: 'running' | 'complete' | 'error';
  output: Record<string, unknown> | null;
  featureCategory?: string;
  tokenUsage?: unknown;
  messages?: unknown[];
  created_at: string;
  completed_at: string | null;
  iteration_count: number;
}

const runs = new Map<string, SwarmRunRecord>();
const userIndex = new Map<string, string[]>();
const MAX_PER_USER = 40;

function touchUser(userId: string, runId: string) {
  const list = userIndex.get(userId) ?? [];
  const next = [runId, ...list.filter((id) => id !== runId)].slice(0, MAX_PER_USER);
  userIndex.set(userId, next);
  // Evict old
  for (const [id, run] of runs) {
    if (run.userId === userId && !next.includes(id)) runs.delete(id);
  }
}

export function createRun(userId: string, prompt: string, runId: string): SwarmRunRecord {
  const rec: SwarmRunRecord = {
    id: runId,
    userId,
    prompt: prompt.slice(0, 8000),
    status: 'running',
    output: null,
    created_at: new Date().toISOString(),
    completed_at: null,
    iteration_count: 0,
  };
  runs.set(runId, rec);
  touchUser(userId, runId);
  return rec;
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
  const rec = runs.get(runId);
  if (!rec) return null;
  rec.status = data.success === false ? 'error' : 'complete';
  rec.output = data.output;
  rec.featureCategory = data.featureCategory;
  rec.tokenUsage = data.tokenUsage;
  rec.completed_at = new Date().toISOString();
  rec.iteration_count += 1;
  runs.set(runId, rec);
  void persistToSupabase(rec).catch(() => {});
  return rec;
}

export function saveConversation(runId: string, messages: unknown[]): boolean {
  const rec = runs.get(runId);
  if (!rec) {
    // Allow saving even if create was missed
    return false;
  }
  rec.messages = Array.isArray(messages) ? messages.slice(-80) : [];
  runs.set(runId, rec);
  void persistToSupabase(rec).catch(() => {});
  return true;
}

export function getRun(runId: string): SwarmRunRecord | null {
  return runs.get(runId) ?? null;
}

export function listRunsForUser(userId: string, limit = 30): SwarmRunRecord[] {
  const ids = userIndex.get(userId) ?? [];
  return ids
    .map((id) => runs.get(id))
    .filter((r): r is SwarmRunRecord => Boolean(r))
    .slice(0, limit);
}

async function persistToSupabase(rec: SwarmRunRecord): Promise<void> {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) return;
  try {
    const supabase = getSupabaseAdmin();
    await supabase.from('swarm_runs').upsert(
      {
        id: rec.id,
        user_id: rec.userId,
        prompt: rec.prompt,
        status: rec.status,
        output: rec.output,
        feature_category: rec.featureCategory ?? null,
        token_usage: rec.tokenUsage ?? null,
        messages: rec.messages ?? null,
        created_at: rec.created_at,
        completed_at: rec.completed_at,
        iteration_count: rec.iteration_count,
      },
      { onConflict: 'id' },
    );
  } catch {
    // Table may not exist — memory store remains source of truth
  }
}
