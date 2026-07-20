/**
 * Durable chat/session memory per user (+ optional repo) across API restarts.
 * Prefers the USER's connected Supabase (xroga_session_memory) when provisioned.
 */

import { getSupabaseAdmin } from '../config/supabase.js';
import { ensureShipLoopSchema } from '../db/ensureShipLoopSchema.js';
import { getUserSupabaseAdmin } from '../services/integrations/supabaseProvision.js';

export interface SessionMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

function keyRepo(repo: string | null | undefined): string {
  return repo?.includes('/') ? repo : '_workspace';
}

async function loadFromUserProject(
  userId: string,
  repo: string | null | undefined,
  limit: number,
): Promise<SessionMessage[] | null> {
  try {
    const client = await getUserSupabaseAdmin(userId);
    if (!client) return null;
    const { data, error } = await client
      .from('xroga_session_memory')
      .select('messages')
      .eq('xroga_user_id', userId)
      .eq('repo', keyRepo(repo))
      .maybeSingle();
    if (error) {
      if (!/relation|does not exist|PGRST/i.test(error.message)) {
        console.warn('[sessionMemory] user project load:', error.message);
      }
      return null;
    }
    if (!data) return [];
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
  } catch {
    return null;
  }
}

async function saveToUserProject(
  userId: string,
  repo: string | null | undefined,
  messages: SessionMessage[],
): Promise<boolean> {
  try {
    const client = await getUserSupabaseAdmin(userId);
    if (!client) return false;
    const trimmed = messages
      .filter((m) => m.role === 'user' || m.role === 'assistant')
      .map((m) => ({ role: m.role, content: m.content.slice(0, 8000) }))
      .slice(-40);
    const { error } = await client.from('xroga_session_memory').upsert(
      {
        xroga_user_id: userId,
        repo: keyRepo(repo),
        messages: trimmed,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'xroga_user_id,repo' },
    );
    if (error) {
      console.warn('[sessionMemory] user project save:', error.message);
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

/** Load last N messages for this user/repo from session_memory. */
export async function loadSessionHistory(
  userId: string,
  repo?: string | null,
  limit = 12,
): Promise<SessionMessage[]> {
  const fromUser = await loadFromUserProject(userId, repo, limit);
  if (fromUser) return fromUser;

  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) return [];
  try {
    await ensureShipLoopSchema();
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
  const savedUser = await saveToUserProject(userId, repo, messages);
  if (savedUser) return;

  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) return;
  try {
    await ensureShipLoopSchema();
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
  const out: Array<{ role: 'user' | 'assistant'; content: string }> = [];
  for (const m of merged) {
    const prev = out[out.length - 1];
    if (prev && prev.role === m.role && prev.content === m.content) continue;
    out.push(m);
  }
  return out.slice(-12);
}
