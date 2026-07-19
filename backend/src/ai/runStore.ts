/**
 * Swarm run history — hot in-memory + Supabase persistence (survives restarts).
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
  void persistToSupabase(rec).catch(() => {});
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
  if (!rec) return false;
  rec.messages = Array.isArray(messages) ? messages.slice(-80) : [];
  runs.set(runId, rec);
  void persistToSupabase(rec).catch(() => {});
  return true;
}

export function getRun(runId: string): SwarmRunRecord | null {
  return runs.get(runId) ?? null;
}

/** Hot cache first; fall back to Supabase for cold starts / other instances. */
export async function getRunAsync(runId: string): Promise<SwarmRunRecord | null> {
  const hot = runs.get(runId);
  if (hot) return hot;
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) return null;
  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase.from('swarm_runs').select('*').eq('id', runId).maybeSingle();
    if (error || !data) return null;
    const rec: SwarmRunRecord = {
      id: String(data.id),
      userId: String(data.user_id),
      prompt: String(data.prompt ?? ''),
      status: (data.status === 'error' ? 'error' : data.status === 'running' ? 'running' : 'complete'),
      output: (data.output as Record<string, unknown>) ?? null,
      featureCategory: data.feature_category ?? undefined,
      tokenUsage: data.token_usage ?? undefined,
      messages: Array.isArray(data.messages) ? data.messages : undefined,
      created_at: String(data.created_at ?? new Date().toISOString()),
      completed_at: data.completed_at ? String(data.completed_at) : null,
      iteration_count: Number(data.iteration_count ?? 0),
    };
    runs.set(runId, rec);
    touchUser(rec.userId, runId);
    return rec;
  } catch {
    return null;
  }
}

export function listRunsForUser(userId: string, limit = 30): SwarmRunRecord[] {
  const ids = userIndex.get(userId) ?? [];
  return ids
    .map((id) => runs.get(id))
    .filter((r): r is SwarmRunRecord => Boolean(r))
    .slice(0, limit);
}

export async function listRunsForUserAsync(userId: string, limit = 30): Promise<SwarmRunRecord[]> {
  const hot = listRunsForUser(userId, limit);
  if (hot.length || !process.env.SUPABASE_SERVICE_ROLE_KEY) return hot;
  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from('swarm_runs')
      .select('*')
      .eq('user_id', userId)
      .in('status', ['complete', 'completed', 'error'])
      .order('created_at', { ascending: false })
      .limit(limit);
    if (error || !data?.length) return hot;
    return data.map((row) => {
      const rec: SwarmRunRecord = {
        id: String(row.id),
        userId: String(row.user_id),
        prompt: String(row.prompt ?? ''),
        status: row.status === 'error' ? 'error' : 'complete',
        output: (row.output as Record<string, unknown>) ?? null,
        featureCategory: row.feature_category ?? undefined,
        tokenUsage: row.token_usage ?? undefined,
        messages: Array.isArray(row.messages) ? row.messages : undefined,
        created_at: String(row.created_at ?? new Date().toISOString()),
        completed_at: row.completed_at ? String(row.completed_at) : null,
        iteration_count: Number(row.iteration_count ?? 0),
      };
      runs.set(rec.id, rec);
      touchUser(userId, rec.id);
      return rec;
    });
  } catch {
    return hot;
  }
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
  } catch (err) {
    console.warn('[runStore] persist failed:', (err as Error).message);
  }
}
