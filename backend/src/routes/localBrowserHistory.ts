import { getSupabaseAdmin } from '../config/supabase.js';
import { persistOwnedTerminal } from '../security/ownedTerminalPersistence.js';
import { requireTenantContext, type TenantContext } from '../security/tenantContext.js';
import { nextTerminalNumber } from './terminalSessions.js';

/**
 * A finished Chrome task, written into the user's existing Workspace history through the same owner-bound save the Workspace's own
 * autosave uses. One session per canonical run, with a deterministic id, so a repeated finish updates the same row and never adds a
 * second one. Off unless XROGA_BROWSER_HISTORY_SYNC is "true".
 */
export const BROWSER_HISTORY_REPO = 'xroga/browser-tasks';
const COLUMNS = 'id,github_repo_name,github_branch,terminal_number,title,preview,kind,status,message_count,created_at,updated_at';

export const browserHistoryEnabled = () => process.env.XROGA_BROWSER_HISTORY_SYNC === 'true';
export const browserHistorySessionId = (runId: string) => `browser-${runId}`;

export type BrowserHistoryInput = { runId: string; goal: string; result: string; sources?: string[] };
export type BrowserHistoryDeps = { db?: () => ReturnType<typeof getSupabaseAdmin>; now?: () => number };

/** The public web addresses a result names, for the Workspace's sources row. */
export function sourcesOf(text: string, limit = 5): string[] {
  const seen = new Set<string>();
  for (const match of text.matchAll(/https?:\/\/[^\s)>\]"'`]+/gi)) {
    try {
      const url = new URL(match[0].replace(/[.,;:!?]+$/, ''));
      if (url.protocol === 'https:' || url.protocol === 'http:') seen.add(url.href);
    } catch {
      /* not an address */
    }
    if (seen.size >= limit) break;
  }
  return [...seen];
}

export function browserHistoryMessages(input: BrowserHistoryInput, at: number) {
  const sources = (input.sources ?? sourcesOf(input.result)).map(url => ({
    title: new URL(url).hostname.replace(/^www\./, ''),
    url,
    snippet: '',
    source: 'browser',
    siteDomain: new URL(url).hostname.replace(/^www\./, ''),
  }));
  return [
    { id: `${input.runId}-user`, role: 'user', content: input.goal.slice(0, 20_000), createdAt: at },
    {
      id: `${input.runId}-result`,
      role: 'assistant',
      agent: 'browser',
      content: input.result.slice(0, 12_000),
      createdAt: at + 1,
      ...(sources.length ? { webSources: sources } : {}),
    },
  ];
}

export async function syncBrowserRunToHistory(
  context: TenantContext,
  input: BrowserHistoryInput,
  deps: BrowserHistoryDeps = {},
): Promise<{ id: string }> {
  const scope = requireTenantContext(context);
  const db = (deps.db ?? getSupabaseAdmin)();
  const now = deps.now?.() ?? Date.now();
  const id = browserHistorySessionId(input.runId);
  const number = await nextTerminalNumber(scope.userId, BROWSER_HISTORY_REPO, db);
  const row = {
    id,
    user_id: scope.userId,
    github_repo_name: BROWSER_HISTORY_REPO,
    github_branch: 'main',
    terminal_number: number,
    title: input.goal.replace(/\s+/g, ' ').trim().slice(0, 120) || `Browser task #${number}`,
    prompt: input.goal.slice(0, 20_000),
    preview: input.result.replace(/\s+/g, ' ').trim().slice(0, 500),
    messages: browserHistoryMessages(input, now),
    kind: 'chat',
    status: 'active',
    message_count: 2,
    updated_at: new Date(now).toISOString(),
    created_at: new Date(now).toISOString(),
  };
  const { error } = await persistOwnedTerminal(db, scope, row, COLUMNS);
  if (error) throw new Error('BROWSER_HISTORY_WRITE_FAILED');
  return { id };
}
