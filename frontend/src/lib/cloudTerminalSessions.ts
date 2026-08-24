/**
 * Permanent terminal session sync — account storage via API/Supabase.
 * Local history/IndexedDB remains a fast cache; cloud is the source of truth.
 */

import { api, type CloudTerminalSession, type CloudTerminalSessionSummary } from '@/lib/api';
import type { TerminalHistoryEntry } from '@/lib/terminalHistory';
import { messagesForStorage } from '@/lib/storageSafe';
import {
  fingerprintUpload,
  isDuplicateUpload,
  rememberUpload,
  resetUploadCoalescing,
  uploadDelayMs,
} from '@/lib/uploadCoalescing';
import type { ChatMessage } from '@/context/TerminalChatContext';

const CLOUD_EVENT = 'xroga-cloud-terminals-changed';
const ordinalCache = new Map<string, number>();
/** Highest terminal # seen per repo — used to assign #1, #2 immediately on first chat */
const repoMaxNumber = new Map<string, number>();
const pendingUploads = new Map<string, ReturnType<typeof setTimeout>>();
/** sessionId → in-flight upload, so concurrent callers share one request. */
const inFlightUploads = new Map<string, Promise<CloudTerminalSessionSummary | null>>();

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

/** Seed max # from local history titles so #2 works after reload before cloud returns. */
function seedRepoMaxFromLocalHistory(repo: string) {
  if (typeof window === 'undefined') return;
  if ((repoMaxNumber.get(repo) ?? 0) > 0) return;
  try {
    const raw = localStorage.getItem('xroga_terminal_history');
    if (!raw) return;
    const parsed = JSON.parse(raw) as Array<{
      id?: string;
      githubRepoName?: string;
      title?: string;
    }>;
    if (!Array.isArray(parsed)) return;
    let max = 0;
    for (const e of parsed) {
      if (e.githubRepoName !== repo || !e.id) continue;
      const m = e.title?.match(/^#(\d+)\s+terminal/i);
      const n = m ? Number(m[1]) : 0;
      if (n >= 1) {
        rememberTerminalNumber(e.id, n, repo);
        max = Math.max(max, n);
      }
    }
    if (max > 0) repoMaxNumber.set(repo, Math.max(repoMaxNumber.get(repo) ?? 0, max));
  } catch {
    /* ignore */
  }
}

/**
 * Assign #N for this session under a repo immediately (before cloud round-trip)
 * so Repositories shows "#1 terminal" as soon as the user starts chatting.
 * Same session id always keeps its number; a new session under the same repo gets #2, #3, …
 */
export function allocateTerminalNumber(sessionId: string, repo: string): number {
  const existing = ordinalCache.get(sessionId);
  if (existing) return existing;
  seedRepoMaxFromLocalHistory(repo);
  const next = (repoMaxNumber.get(repo) ?? 0) + 1;
  rememberTerminalNumber(sessionId, next, repo);
  return next;
}

async function pushTerminalSessionToCloudNow(
  entry: TerminalHistoryEntry
): Promise<CloudTerminalSessionSummary | null> {
  if (!entry.id || !entry.githubRepoName?.includes('/') || !entry.messages?.length) return null;

  const inFlight = inFlightUploads.get(entry.id);
  if (inFlight) {
    // Never discard a newer terminal snapshot just because an earlier preview upload
    // is still in flight. Wait for that write, then compare/upload this exact entry.
    // This keeps the final commit + preview evidence authoritative after reload.
    await inFlight;
    return pushTerminalSessionToCloudNow(entry);
  }

  const body = {
    githubRepoName: entry.githubRepoName,
    githubBranch: entry.githubBranch || 'main',
    title: entry.title,
    prompt: entry.prompt,
    preview: entry.preview,
    messages: messagesForStorage(entry.messages).slice(-300),
    kind: entry.kind,
    status: entry.status || 'active',
  };

  const fingerprint = fingerprintUpload(body);
  if (isDuplicateUpload(entry.id, fingerprint)) {
    // Byte-identical to what the server already holds. Uploading it again would
    // cost a full round trip to store what is already stored.
    return null;
  }

  const upload = (async () => {
    try {
      const { session } = await api.terminalSessions.upsert(entry.id, body);
      rememberTerminalNumber(session.id, session.terminalNumber, session.githubRepoName);
      rememberUpload(session.id, fingerprint, Date.now());
      // Only announce a change that a listener could act on. Announcing every
      // save turned each upload into a sidebar refresh, and each refresh into
      // more uploads.
      notifyCloudTerminalsChanged();
      return session;
    } catch (err) {
      console.warn('[cloudTerminalSessions] upsert failed:', (err as Error).message);
      return null;
    } finally {
      inFlightUploads.delete(entry.id);
    }
  })();

  inFlightUploads.set(entry.id, upload);
  return upload;
}

/** Debounced upsert — first save for a session is nearly instant so #N appears quickly. */
export function pushTerminalSessionToCloud(
  entry: TerminalHistoryEntry
): Promise<CloudTerminalSessionSummary | null> {
  if (!entry.id || !entry.githubRepoName?.includes('/') || !entry.messages?.length) {
    return Promise.resolve(null);
  }
  const existing = pendingUploads.get(entry.id);
  if (existing) clearTimeout(existing);

  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      pendingUploads.delete(entry.id);
      void pushTerminalSessionToCloudNow(entry).then(resolve);
    }, uploadDelayMs(entry.id));
    pendingUploads.set(entry.id, timer);
  });
}

/** Flush immediately (New Terminal / leave) so #1 is on the server before blank UI. */
export async function flushTerminalSessionToCloud(
  entry: TerminalHistoryEntry
): Promise<CloudTerminalSessionSummary | null> {
  const existing = pendingUploads.get(entry.id);
  if (existing) {
    clearTimeout(existing);
    pendingUploads.delete(entry.id);
  }
  return pushTerminalSessionToCloudNow(entry);
}

export async function listCloudTerminalSessions(
  repo?: string,
  opts?: { limit?: number; offset?: number }
): Promise<CloudTerminalSessionSummary[]> {
  try {
    const { sessions } = await api.terminalSessions.list(repo, opts);
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

/**
 * Upload any local sessions missing from the cloud list (one-time heal).
 *
 * Runs at most once per page load. Previously this ran on every sidebar refresh,
 * and because each upload dispatched the "cloud terminals changed" event that the
 * sidebar listens to, one refresh could queue forty uploads, each of which
 * triggered another refresh, which started another migration pass. That feedback
 * loop is the single largest source of duplicate writes.
 */
let migrationRan = false;

export async function migrateLocalSessionsToCloud(
  local: TerminalHistoryEntry[],
  already: CloudTerminalSessionSummary[]
): Promise<boolean> {
  if (migrationRan) return false;
  migrationRan = true;

  const have = new Set(already.map((s) => s.id));
  const candidates = local.filter(
    (e) => e.githubRepoName?.includes('/') && e.messages?.length && !have.has(e.id)
  );
  if (!candidates.length) return false;

  for (const entry of candidates.slice(0, 40)) {
    // Sequential and awaited: a burst of parallel writes to the same table is what
    // the quota restriction is about.
    await flushTerminalSessionToCloud(entry);
  }
  return true;
}

/** Test-only: allow a fresh migration pass. */
export function resetMigrationGuardForTests(): void {
  migrationRan = false;
  resetUploadCoalescing();
  inFlightUploads.clear();
}
