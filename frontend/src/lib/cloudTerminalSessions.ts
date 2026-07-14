/**
 * Permanent terminal session sync — account storage via API/Supabase.
 * Local history/IndexedDB remains a fast cache; cloud is the source of truth.
 */

import { api, type CloudTerminalSession, type CloudTerminalSessionSummary } from '@/lib/api';
import type { TerminalHistoryEntry } from '@/lib/terminalHistory';
import { messagesForStorage } from '@/lib/storageSafe';
import type { ChatMessage } from '@/context/TerminalChatContext';

const CLOUD_EVENT = 'xroga-cloud-terminals-changed';
const ordinalCache = new Map<string, number>();
/** Highest terminal # seen per repo — used to assign #1, #2 immediately on first chat */
const repoMaxNumber = new Map<string, number>();
const pendingUploads = new Map<string, ReturnType<typeof setTimeout>>();
const lastUploadedAt = new Map<string, number>();

export function notifyCloudTerminalsChanged() {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(CLOUD_EVENT));
}

export function onCloudTerminalsChanged(handler: () => void): () => void {
  if (typeof window === 'undefined') return () => undefined;
  window.addEventListener(CLOUD_EVENT, handler);
  return () => window.removeEventListener(CLOUD_EVENT, handler);
}

export function cloudTerminalLabel(terminalNumber: number): string {
  return `#${terminalNumber} terminal`;
}

export function cachedTerminalNumber(sessionId: string): number | undefined {
  return ordinalCache.get(sessionId);
}

export function rememberTerminalNumber(sessionId: string, n: number, repo?: string) {
  if (sessionId && n >= 1) {
    ordinalCache.set(sessionId, n);
    if (repo?.includes('/')) {
      repoMaxNumber.set(repo, Math.max(repoMaxNumber.get(repo) ?? 0, n));
    }
  }
}

/**
 * Assign #N for this session under a repo immediately (before cloud round-trip)
 * so Repositories shows "#1 terminal" as soon as the user starts chatting.
 */
export function allocateTerminalNumber(sessionId: string, repo: string): number {
  const existing = ordinalCache.get(sessionId);
  if (existing) return existing;
  const next = (repoMaxNumber.get(repo) ?? 0) + 1;
  rememberTerminalNumber(sessionId, next, repo);
  return next;
}

async function pushTerminalSessionToCloudNow(
  entry: TerminalHistoryEntry
): Promise<CloudTerminalSession | null> {
  if (!entry.id || !entry.githubRepoName?.includes('/') || !entry.messages?.length) return null;
  try {
    const slimMessages = messagesForStorage(entry.messages).slice(-300);
    const { session } = await api.terminalSessions.upsert(entry.id, {
      githubRepoName: entry.githubRepoName,
      githubBranch: entry.githubBranch || 'main',
      title: entry.title,
      prompt: entry.prompt,
      preview: entry.preview,
      messages: slimMessages,
      kind: entry.kind,
      status: entry.status || 'active',
    });
    rememberTerminalNumber(session.id, session.terminalNumber, session.githubRepoName);
    lastUploadedAt.set(session.id, Date.now());
    notifyCloudTerminalsChanged();
    return session;
  } catch (err) {
    console.warn('[cloudTerminalSessions] upsert failed:', (err as Error).message);
    return null;
  }
}

/** Debounced upsert — first save for a session is nearly instant so #N appears quickly. */
export function pushTerminalSessionToCloud(
  entry: TerminalHistoryEntry
): Promise<CloudTerminalSession | null> {
  if (!entry.id || !entry.githubRepoName?.includes('/') || !entry.messages?.length) {
    return Promise.resolve(null);
  }
  const existing = pendingUploads.get(entry.id);
  if (existing) clearTimeout(existing);

  const isFirstUpload = !lastUploadedAt.has(entry.id);
  const delay = isFirstUpload ? 80 : 900;

  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      pendingUploads.delete(entry.id);
      void pushTerminalSessionToCloudNow(entry).then(resolve);
    }, delay);
    pendingUploads.set(entry.id, timer);
  });
}

/** Flush immediately (New Terminal / leave) so #1 is on the server before blank UI. */
export async function flushTerminalSessionToCloud(
  entry: TerminalHistoryEntry
): Promise<CloudTerminalSession | null> {
  const existing = pendingUploads.get(entry.id);
  if (existing) {
    clearTimeout(existing);
    pendingUploads.delete(entry.id);
  }
  return pushTerminalSessionToCloudNow(entry);
}

export async function listCloudTerminalSessions(
  repo?: string
): Promise<CloudTerminalSessionSummary[]> {
  try {
    const { sessions } = await api.terminalSessions.list(repo);
    for (const s of sessions) {
      rememberTerminalNumber(s.id, s.terminalNumber, s.githubRepoName);
    }
    return sessions;
  } catch {
    return [];
  }
}

export async function loadCloudTerminalSession(
  sessionId: string
): Promise<TerminalHistoryEntry | null> {
  try {
    const { session } = await api.terminalSessions.get(sessionId);
    rememberTerminalNumber(session.id, session.terminalNumber, session.githubRepoName);
    return cloudToHistoryEntry(session);
  } catch {
    return null;
  }
}

export function cloudToHistoryEntry(session: CloudTerminalSession): TerminalHistoryEntry {
  const messages = (Array.isArray(session.messages) ? session.messages : []) as ChatMessage[];
  return {
    id: session.id,
    title: cloudTerminalLabel(session.terminalNumber),
    preview: session.preview || session.prompt.slice(0, 200),
    prompt: session.prompt,
    messages,
    kind: (session.kind as TerminalHistoryEntry['kind']) || 'chat',
    status: (session.status as TerminalHistoryEntry['status']) || 'complete',
    githubRepoName: session.githubRepoName,
    githubBranch: session.githubBranch || 'main',
    githubRepoUrl: `https://github.com/${session.githubRepoName}`,
    messageCount: session.messageCount || messages.length,
    createdAt: session.createdAt,
    updatedAt: session.updatedAt,
  };
}

/** Upload any local sessions missing from the cloud list (one-time heal). */
export async function migrateLocalSessionsToCloud(
  local: TerminalHistoryEntry[],
  already: CloudTerminalSessionSummary[]
): Promise<void> {
  const have = new Set(already.map((s) => s.id));
  const candidates = local.filter(
    (e) => e.githubRepoName?.includes('/') && e.messages?.length && !have.has(e.id)
  );
  for (const entry of candidates.slice(0, 40)) {
    await pushTerminalSessionToCloud(entry);
  }
}
