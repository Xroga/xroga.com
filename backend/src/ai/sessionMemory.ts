/**
 * Durable chat/session memory per user (+ optional repo) across API restarts.
 */

import { getSupabaseAdmin } from '../config/supabase.js';

export interface SessionMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

function keyRepo(repo: string | null | undefined): string {
  return repo?.includes('/') ? repo : '_workspace';
}

/** Load last N messages for this user/repo from session_memory. */
export async function loadSessionHistory(
  userId: string,
  repo?: string | null,
  limit = 12,
): Promise<SessionMessage[]> {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) return [];
  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from('session_memory')
      .select('messages')
      .eq('user_id', userId)
      .eq('repo', keyRepo(repo))
      .maybeSingle();
    if (error || !data) return [];
    const msgs = Array.isArray(data.messages) ? data.messages : [];
    return msgs
      .filter(
        (m): m is SessionMessage =>
          !!m &&
          typeof m === 'object' &&
          (m as SessionMessage).role &&
          typeof (m as SessionMessage).content === 'string',
      )
      .slice(-limit);
  } catch (err) {
    console.warn('[sessionMemory] load failed:', (err as Error).message);
    return [];
  }
}

/** Append / replace conversation snapshot for user+repo. */
export async function saveSessionHistory(
  userId: string,
  repo: string | null | undefined,
  messages: SessionMessage[],
): Promise<void> {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) return;
  try {
    const supabase = getSupabaseAdmin();
    const trimmed = messages
      .filter((m) => m.role === 'user' || m.role === 'assistant')
      .map((m) => ({ role: m.role, content: m.content.slice(0, 8000) }))
      .slice(-40);
    await supabase.from('session_memory').upsert(
      {
        user_id: userId,
        repo: keyRepo(repo),
        messages: trimmed,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id,repo' },
    );
  } catch (err) {
    console.warn('[sessionMemory] save failed:', (err as Error).message);
  }
}

/** Merge client history with DB history (DB first, client wins on overlap). */
export function mergeHistories(
  db: SessionMessage[],
  client: Array<{ role: 'user' | 'assistant'; content: string }>,
): Array<{ role: 'user' | 'assistant'; content: string }> {
  if (!db.length) return client.slice(-12);
  if (!client.length) {
    return db
      .filter((m) => m.role === 'user' || m.role === 'assistant')
      .map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content }))
      .slice(-12);
  }
  const merged = [
    ...db
      .filter((m) => m.role === 'user' || m.role === 'assistant')
      .map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content })),
    ...client,
  ];
  // Dedupe consecutive identical
  const out: Array<{ role: 'user' | 'assistant'; content: string }> = [];
  for (const m of merged) {
    const prev = out[out.length - 1];
    if (prev && prev.role === m.role && prev.content === m.content) continue;
    out.push(m);
  }
  return out.slice(-12);
}
