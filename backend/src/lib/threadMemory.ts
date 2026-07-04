/**
 * Server-side thread memory — rebuilds conversation context when the frontend
 * sends only the latest line (e.g. "Cozy Cup, warm brown & gold, yes").
 */

import { getSupabaseAdmin } from '../config/supabase.js';
import type { ChatTurn } from './conversationContext.js';
import { routingPrompt } from './promptRouting.js';
import {
  hasThreadContext,
  looksLikeBuildClarificationAnswer,
  threadHasBuildIntent,
} from './buildContinuation.js';

const BUILD_INTENT =
  /\b(build|create|make|design|develop)\b[\s\S]{0,80}\b(website|web\s*page|landing|site|coffee|shop|store|restaurant|bakery|app)\b/i;

const PHASE_1_MARKERS =
  /\[Phase 1\]|let me understand what you need|what(?:'|'| is) the name of your project|what colors do you like|online ordering/i;

export function threadHasBuildFromTurns(turns: ChatTurn[]): boolean {
  for (const t of turns) {
    if (t.role === 'user' && BUILD_INTENT.test(t.content)) return true;
    if (t.role === 'assistant' && PHASE_1_MARKERS.test(t.content)) return true;
  }
  return false;
}

export function isBuildContinuationFromTurns(current: string, turns: ChatTurn[]): boolean {
  if (!turns.length) return false;
  return threadHasBuildFromTurns(turns) && looksLikeBuildClarificationAnswer(current);
}

export function formatThreadBlock(turns: ChatTurn[], current: string): string {
  const lines = turns.map((t) => {
    const label = t.role === 'user' ? 'User' : 'Assistant';
    return `${label}: ${t.content.replace(/\s+/g, ' ').trim().slice(0, 400)}`;
  });
  return `[Previous conversation for context — refer when user asks about earlier messages]\n${lines.join('\n')}\n\n[Current message]\n${current}`;
}

/** Merge client or DB history into the prompt when this is a build continuation. */
export function enrichPromptWithThread(prompt: string, turns?: ChatTurn[]): string {
  if (hasThreadContext(prompt)) return prompt;
  const current = routingPrompt(prompt);
  if (!turns?.length) return prompt;
  if (!isBuildContinuationFromTurns(current, turns)) return prompt;
  return formatThreadBlock(turns, current);
}

export async function loadRecentChatTurns(userId: string, limit = 8): Promise<ChatTurn[]> {
  const turns: ChatTurn[] = [];

  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from('messages')
      .select('role, content')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (!error && data?.length) {
      turns.push(
        ...data
          .reverse()
          .filter((r) => (r.role === 'user' || r.role === 'assistant') && typeof r.content === 'string')
          .map((r) => ({
            role: r.role as 'user' | 'assistant',
            content: String(r.content).trim(),
          }))
          .filter((t) => t.content.length > 0)
      );
    }
  } catch {
    /* messages table optional */
  }

  if (turns.length >= 2) return turns.slice(-limit);

  try {
    const supabase = getSupabaseAdmin();
    const { data: runs } = await supabase
      .from('swarm_runs')
      .select('prompt, output, created_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(4);

    for (const run of runs ?? []) {
      const p = String(run.prompt ?? '').trim();
      if (!BUILD_INTENT.test(p)) continue;
      turns.push({ role: 'user', content: p });
      const output = run.output as { polishedReply?: string; featureOutput?: { summary?: string } } | null;
      const assistant =
        output?.polishedReply?.trim() ||
        output?.featureOutput?.summary?.trim() ||
        '[Phase 1] Website build in progress.';
      turns.push({ role: 'assistant', content: assistant });
      break;
    }
  } catch {
    /* swarm_runs optional */
  }

  return turns.slice(-limit);
}

export async function persistChatTurns(
  userId: string,
  userContent: string,
  assistantContent: string
): Promise<void> {
  try {
    const supabase = getSupabaseAdmin();
    await supabase.from('messages').insert([
      { user_id: userId, content: userContent, role: 'user' },
      { user_id: userId, content: assistantContent, role: 'assistant' },
    ]);
  } catch {
    /* non-fatal */
  }
}

/** True when prompt + optional history indicates Phase 1 answer continuing a website build. */
export function shouldContinueWebsiteBuild(prompt: string, history?: ChatTurn[]): boolean {
  const enriched = enrichPromptWithThread(prompt, history);
  if (hasThreadContext(enriched) && threadHasBuildIntent(enriched)) {
    return looksLikeBuildClarificationAnswer(enriched);
  }
  if (history?.length && isBuildContinuationFromTurns(routingPrompt(prompt), history)) {
    return true;
  }
  return false;
}
