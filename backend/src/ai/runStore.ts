/**
 * Swarm run history — hot in-memory + Supabase persistence (survives restarts).
 */

import { getSupabaseAdmin } from '../config/supabase.js';
import { ensureShipLoopSchema } from '../db/ensureShipLoopSchema.js';
import { redactOperationsValue } from '../operations/operationsEngine.js';

export interface SwarmRunEvent {
  sequence: number;
  type: 'progress';
  data: Record<string, unknown>;
  createdAt: string;
}

export interface SwarmRunRecord {
  id: string;
  userId: string;
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
const MAX_EVENTS_PER_RUN = 240;
const persistTimers = new Map<string, ReturnType<typeof setTimeout>>();

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
  void persistToSupabase(rec).catch(() => {});
}

function touchUser(userId: string, runId: string) {
  const list = userIndex.get(userId) ?? [];
  const next = [runId, ...list.filter((id) => id !== runId)].slice(0, MAX_PER_USER);
  userIndex.set(userId, next);
  for (const [id, run] of runs) {
    if (run.userId === userId && !next.includes(id)) runs.delete(id);
  }
}

function createRunHot(userId: string, prompt: string, runId: string): SwarmRunRecord {
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
  touchUser(userId, runId);
  return rec;
}

export function createRun(userId: string, prompt: string, runId: string): SwarmRunRecord {
  const rec = createRunHot(userId, prompt, runId);
  flushPersist(rec);
  return rec;
}

/** Persist the recovery record before an expensive provider call begins. */
export async function createRunDurable(
  userId: string,
  prompt: string,
  runId: string,
): Promise<SwarmRunRecord> {
  const rec = createRunHot(userId, prompt, runId);
  await persistToSupabase(rec);
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
  flushPersist(rec);
  return rec;
}

export function failRun(
  runId: string,
  error: string,
  status: 'error' | 'cancelled' = 'error',
): SwarmRunRecord | null {
  const rec = runs.get(runId);
  if (!rec) return null;
  rec.status = status;
  rec.output = {
    type: 'error',
    error: error.slice(0, 1000),
    code: status === 'cancelled' ? 'BUILD_CANCELLED' : 'BUILD_FAILED',
  };
  rec.completed_at = new Date().toISOString();
  rec.iteration_count += 1;
  runs.set(runId, rec);
  flushPersist(rec);
  return rec;
}

export function saveConversation(runId: string, messages: unknown[]): boolean {
  const rec = runs.get(runId);
  if (!rec) return false;
  rec.messages = Array.isArray(messages) ? messages.slice(-80) : [];
  runs.set(runId, rec);
  schedulePersist(rec);
  return true;
}

export function appendRunEvent(
  runId: string,
  type: SwarmRunEvent['type'],
  data: Record<string, unknown>,
): SwarmRunEvent | null {
  const rec = runs.get(runId);
  if (!rec) return null;
  const event: SwarmRunEvent = {
    sequence: rec.lastSequence + 1,
    type,
    data: redactOperationsValue(data) as Record<string, unknown>,
    createdAt: new Date().toISOString(),
  };
  rec.lastSequence = event.sequence;
  rec.events = [...rec.events, event].slice(-MAX_EVENTS_PER_RUN);
  runs.set(runId, rec);
  schedulePersist(rec);
  return event;
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
      status: data.status === 'error'
        ? 'error'
        : data.status === 'cancelled'
          ? 'cancelled'
          : data.status === 'running'
            ? 'running'
            : 'complete',
      output: (data.output as Record<string, unknown>) ?? null,
      featureCategory: data.feature_category ?? undefined,
      tokenUsage: data.token_usage ?? undefined,
      messages: Array.isArray(data.messages) ? data.messages : undefined,
      created_at: String(data.created_at ?? new Date().toISOString()),
      completed_at: data.completed_at ? String(data.completed_at) : null,
      iteration_count: Number(data.iteration_count ?? 0),
      events: Array.isArray(data.events) ? (data.events as SwarmRunEvent[]) : [],
      lastSequence: Number(data.last_sequence ?? 0),
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
      .in('status', ['running', 'complete', 'completed', 'error', 'cancelled'])
      .order('created_at', { ascending: false })
      .limit(limit);
    if (error || !data?.length) return hot;
    return data.map((row) => {
      const rec: SwarmRunRecord = {
        id: String(row.id),
        userId: String(row.user_id),
        prompt: String(row.prompt ?? ''),
        status: row.status === 'error'
          ? 'error'
          : row.status === 'cancelled'
            ? 'cancelled'
            : row.status === 'running'
              ? 'running'
              : 'complete',
        output: (row.output as Record<string, unknown>) ?? null,
        featureCategory: row.feature_category ?? undefined,
        tokenUsage: row.token_usage ?? undefined,
        messages: Array.isArray(row.messages) ? row.messages : undefined,
        created_at: String(row.created_at ?? new Date().toISOString()),
        completed_at: row.completed_at ? String(row.completed_at) : null,
        iteration_count: Number(row.iteration_count ?? 0),
        events: Array.isArray(row.events) ? (row.events as SwarmRunEvent[]) : [],
        lastSequence: Number(row.last_sequence ?? 0),
      };
      runs.set(rec.id, rec);
      touchUser(userId, rec.id);
      return rec;
    });
  } catch {
    return hot;
  }
}

export async function persistRunState(runId: string): Promise<void> {
  const rec = runs.get(runId);
  if (!rec) throw new Error('Cannot persist an unknown swarm run');
  await persistToSupabase(rec);
}

async function persistToSupabase(rec: SwarmRunRecord): Promise<void> {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) return;
  await ensureShipLoopSchema();
  const supabase = getSupabaseAdmin();
  const { error } = await supabase.from('swarm_runs').upsert(
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
      events: rec.events,
      last_sequence: rec.lastSequence,
    },
    { onConflict: 'id' },
  );
  if (error) {
    throw new Error(`Platform swarm-run write failed: ${error.message}`);
  }
}
