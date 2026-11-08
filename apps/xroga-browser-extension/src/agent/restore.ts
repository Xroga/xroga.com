// Restoring a run after the worker restarted. Pure: it reads the run record and the branch and says what to write and
// what to reopen. The worker calls no model and runs no tool on its own; a run continues only when the user acts.
import type { Entry, EntryOf, PendingPrompt, RunRecord, RunStatus } from '@src/store/types';
import { openCalls } from './records';
import { kindOf } from './tools';

export const INTERRUPTED_READ =
  'error INTERRUPTED (nothing dispatched; safe to retry)\nThe extension restarted during this call; nothing was changed. Call it again if needed.';
export const INTERRUPTED_MUTATION =
  'error INTERRUPTED (delivery unknown; look before retrying)\nThe extension restarted during this action; delivered: unknown. Observe before retrying.';
export const SKIPPED_RESTART = 'skipped: the extension restarted before this call ran.';
export const RESTART_NOTE = 'the browser connection restarted; all refs are invalid; take a snapshot first.';

/** Read only results that were durably recorded for this run. Arguments, page text and credentials stay local. */
export function completedBrowserTools(runId: string, branch: Entry[]): string[] {
  const names: string[] = [];
  for (const entry of branch) {
    if (entry.type !== 'message' || entry.meta?.runId !== runId || entry.message.role !== 'tool') continue;
    const result = entry.result as
      { ok?: unknown; receipt?: { dispatched?: unknown; reachedTarget?: unknown } } | undefined;
    if (result?.ok !== true || result.receipt?.dispatched === false || result.receipt?.reachedTarget === false)
      continue;
    for (const part of entry.message.parts) {
      if (part.type === 'tool-result' && !part.isError && part.toolName !== 'done') names.push(part.toolName);
      if (names.length === 48) return names;
    }
  }
  return names;
}

/** An interrupted write has no safe replay key on an arbitrary third-party site. */
export function hasUncertainBrowserWrite(runId: string, branch: Entry[]): boolean {
  const mutations = new Set(
    branch.flatMap(entry => {
      if (
        entry.type !== 'intent' ||
        !['mutate', 'state'].includes(kindOf(entry.tool, (entry.args ?? {}) as Record<string, unknown>))
      )
        return [];
      return [entry.toolCallId];
    }),
  );
  return branch.some(entry => {
    if (entry.type !== 'message' || entry.meta?.runId !== runId || entry.message.role !== 'tool') return false;
    const result = entry.result as { ok?: unknown; error?: { delivered?: unknown } } | undefined;
    return (
      result?.ok === false &&
      result.error?.delivered === 'unknown' &&
      entry.message.parts.some(part => part.type === 'tool-result' && mutations.has(part.toolCallId))
    );
  });
}

export interface RestorePlan {
  /** Results for calls that have none (intents and calls that never started). */
  results: Array<{ toolCallId: string; toolName: string; text: string; isError: true }>;
  status: RunStatus;
  reason?: string;
  /** A card to open again, with a new ID: a hand-over or an ask_user question. */
  reopen?: PendingPrompt & { toolCallId?: string };
  note: string;
}

/**
 * A run stored as paused by Take over, which the panel had until
 * 2026-10-09. It is restored as stopped, as if the user had pressed Stop.
 */
export function takenOver(run: RunRecord): boolean {
  return (run.status as string) === 'paused';
}

export function planRestore(run: RunRecord, branch: Entry[]): RestorePlan {
  // Canonical Chrome runs revalidate authority and tab scope before any handover. A stored numeric tab ID alone is not a binding.
  const prompt = run.canonicalBrowserRunId ? undefined : run.pendingPrompt;
  const handoverCall = prompt?.kind === 'handover' ? prompt.answers?.toolCallId : undefined;
  const calls = openCalls(branch);
  const lastReply = [...branch]
    .reverse()
    .find((e): e is EntryOf<'message'> => e.type === 'message' && e.message.role === 'assistant');
  const inputOf = (toolCallId: string) =>
    (
      lastReply?.message.parts.find(p => p.type === 'tool-call' && p.toolCallId === toolCallId) as
        { input?: unknown } | undefined
    )?.input ?? {};
  const results: RestorePlan['results'] = [];
  let reopen: RestorePlan['reopen'];
  for (const call of calls) {
    if (call.toolCallId === handoverCall) continue;
    // An ask_user question waiting for the user opens again; its answer continues the same call.
    if (
      call.toolName === 'ask_user' &&
      call.hasIntent &&
      prompt?.kind === 'ask-user' &&
      run.status === 'awaiting_user'
    ) {
      reopen = { ...prompt, toolCallId: call.toolCallId };
      continue;
    }
    if (!call.hasIntent) {
      results.push({ toolCallId: call.toolCallId, toolName: call.toolName, text: SKIPPED_RESTART, isError: true });
      continue;
    }
    const kind = kindOf(call.toolName, inputOf(call.toolCallId) as Record<string, unknown>);
    results.push({
      toolCallId: call.toolCallId,
      toolName: call.toolName,
      text: kind === 'read' ? INTERRUPTED_READ : INTERRUPTED_MUTATION,
      isError: true,
    });
  }
  let status: RunStatus = run.status;
  let reason = run.reason;
  if (takenOver(run)) {
    status = 'stopped';
    reason = undefined;
  } else if (run.status === 'running') {
    status = 'interrupted';
    reason = 'The extension restarted during this run.';
  } else if (run.status === 'awaiting_user') {
    if (prompt?.kind === 'handover' && handoverCall) {
      // Only the card opens again; the call is answered by the hand-over and never sent again.
      reopen = { ...prompt, toolCallId: handoverCall };
    } else if (!reopen) {
      // A write card died with the worker: the call is recovered like any interrupted mutation (above).
      status = 'interrupted';
      reason = 'The extension restarted while a card was open.';
    }
  }
  return { results, status, reason, reopen, note: RESTART_NOTE };
}
