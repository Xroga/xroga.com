// Storage side of workflow hints (agent/workflow-hints.ts): reads the list from this browser profile, picks the hints that
// fit the signed-in owner, site and request, and learns from a run that finished with verified evidence.
// The owner is the paired Xroga account; with none, nothing is stored or shown. The list stays on this device.
import { activeBranch } from '@src/store/conversations';
import { savedDevice } from '@src/xroga/device';
import { distill, hintSection, pick, recordStale, remember, type WorkflowHint } from '@src/agent/workflow-hints';

const KEY = 'xroga_hints_v1';

async function load(): Promise<WorkflowHint[]> {
  try {
    const value = (await chrome.storage.local.get(KEY))[KEY];
    return Array.isArray(value) ? (value as WorkflowHint[]).filter(h => h && h.v === 1) : [];
  } catch {
    return [];
  }
}

async function save(list: WorkflowHint[]): Promise<void> {
  try {
    await chrome.storage.local.set({ [KEY]: list });
  } catch {
    /* a hint that cannot be stored is only a missed shortcut */
  }
}

const firstUrl = (text: string) => text.match(/https?:\/\/[^\s)]+/)?.[0];

async function runUrl(tabIds: number[], request: string): Promise<string | undefined> {
  for (const id of tabIds) {
    const url = await chrome.tabs.get(id).then(t => t.url, () => undefined);
    if (url && /^https?:/.test(url)) return url;
  }
  return firstUrl(request);
}

/** The prompt section for this run, and the ids of the hints it contains (to mark them stale if the run fails). */
export async function hintsForRun(tabIds: number[], request: string): Promise<{ text: string; ids: string[] }> {
  const owner = (await savedDevice())?.account;
  const url = await runUrl(tabIds, request);
  if (!owner || !url) return { text: '', ids: [] };
  const hints = pick(await load(), { owner, url, request, now: Date.now() });
  return { text: hintSection(hints), ids: hints.map(h => h.id) };
}

/** After a run: a completed, verified one is remembered; a run that used hints and failed counts them out of date. */
export async function learnFromRun(args: {
  conversationId: string;
  tabIds: number[];
  request: string;
  completed: boolean;
  usedHintIds: string[];
}): Promise<void> {
  const owner = (await savedDevice())?.account;
  if (!owner) return;
  if (!args.completed) {
    if (!args.usedHintIds.length) return;
    let list = await load();
    for (const id of args.usedHintIds) list = recordStale(list, owner, id);
    await save(list);
    return;
  }
  const url = await runUrl(args.tabIds, args.request);
  if (!url) return;
  const steps: Array<{ tool: string; label?: string; ok: boolean }> = [];
  let verified = false;
  for (const entry of await activeBranch(args.conversationId).catch(() => [])) {
    if (entry.type !== 'message' || entry.message.role !== 'tool') continue;
    const result = entry.result as
      | { ok?: boolean; receipt?: { target?: string; sensitive?: string; postcondition?: { status?: string } } }
      | undefined;
    if (result?.receipt?.postcondition?.status === 'met') verified = true;
    for (const part of entry.message.parts) {
      if (part.type !== 'tool-result') continue;
      if (part.toolName === 'confirm_download' && !part.isError && /verified|finished/i.test(part.text)) verified = true;
      // A target the layer marked sensitive (a password or card field) never contributes its name.
      const label = result?.receipt?.sensitive ? undefined : result?.receipt?.target?.replace(/[«»]/g, '');
      steps.push({ tool: part.toolName, label, ok: !part.isError && result?.ok !== false });
    }
  }
  const hint = distill({ owner, url, request: args.request, steps, verified, now: Date.now() });
  if (hint) await save(remember(await load(), hint));
}
