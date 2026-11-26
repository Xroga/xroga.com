// Storage side of memory (agent/memory.ts): the list lives in this browser profile, keyed to the paired Xroga account; with no account nothing is stored or shown.
import { add, approve, forget, listText, section, tidy } from '@src/agent/memory';
import type { Fact, Scope } from '@src/agent/memory';
import { savedDevice } from '@src/xroga/device';

/** Exported so Settings -> Data -> Delete everything can remove it. */
export const MEMORY_KEY = 'xroga_memory_v1';

async function load(): Promise<Fact[]> {
  try {
    const value = (await chrome.storage.local.get(MEMORY_KEY))[MEMORY_KEY];
    return Array.isArray(value) ? (value as Fact[]).filter(f => f && typeof f.id === 'string' && typeof f.text === 'string') : [];
  } catch {
    return [];
  }
}

async function save(list: Fact[]): Promise<void> {
  try {
    await chrome.storage.local.set({ [MEMORY_KEY]: list });
  } catch {
    /* a fact that cannot be stored is only a missed convenience */
  }
}

/** The prompt section for this run (empty when there is nothing, or no paired account). */
export async function memoryForRun(conversationId: string): Promise<string> {
  const owner = (await savedDevice())?.account;
  if (!owner) return '';
  const list = tidy(await load(), Date.now());
  return section(list, owner, conversationId);
}

export async function runMemoryTool(conversationId: string, input: unknown): Promise<{ text: string; isError: boolean }> {
  const args = (input ?? {}) as { action?: string; text?: string; id?: string; scope?: string };
  const owner = (await savedDevice())?.account;
  if (!owner) return { text: 'error: memory needs a signed-in Xroga account; nothing was saved.', isError: true };
  const now = Date.now();
  let list = tidy(await load(), now);
  const scope: Scope = args.scope === 'conversation' ? 'conversation' : 'global';
  switch (args.action) {
    case 'list':
      return { text: listText(list, owner, conversationId), isError: false };
    case 'remember':
    case 'suggest': {
      const made = add(list, owner, scope, conversationId, String(args.text ?? ''), args.action === 'remember' ? 'approved' : 'suggested', now);
      if ('error' in made) return { text: `error: not saved: ${made.error}.`, isError: true };
      await save(made.list);
      return {
        text: args.action === 'remember'
          ? `memory · kept [${made.fact.id}]: ${made.fact.text}`
          : `memory · suggested [${made.fact.id}], not kept yet: ask the person in your answer; keep it only when they say yes (memory approve, id ${made.fact.id}).`,
        isError: false,
      };
    }
    case 'approve': {
      const done = approve(list, owner, String(args.id ?? ''), now);
      if ('error' in done) return { text: `error: ${done.error}.`, isError: true };
      await save(done.list);
      return { text: `memory · kept [${done.fact.id}]: ${done.fact.text}`, isError: false };
    }
    case 'forget':
    case 'forget_all': {
      const r = forget(list, owner, args.action === 'forget_all' ? 'all' : String(args.id ?? ''));
      list = r.list;
      await save(list);
      return { text: r.removed ? `memory · forgot ${r.removed} item${r.removed === 1 ? '' : 's'}` : 'memory · nothing matched; nothing was forgotten', isError: false };
    }
    default:
      return { text: 'error: memory needs an action: remember, suggest, approve, list, forget or forget_all.', isError: true };
  }
}
