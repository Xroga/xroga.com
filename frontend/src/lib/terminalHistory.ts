import type { ChatMessage } from '@/context/TerminalChatContext';
import { getSelectedRepoContext } from '@/lib/repoContext';
import { messagesForStorage, safeStorageSet } from '@/lib/storageSafe';
import { saveTerminalSessionToIndexedDB, deleteTerminalSessionFromIndexedDB } from '@/lib/terminalSessionStorage';
import {
  markRepoSessionCloudId,
  registerRepoSession,
  type RepoActivityKind,
} from '@/lib/repoSessionsIndex';

const KEY = 'xroga_terminal_history';
const BROWSER_KEYWORDS = /scrape|browser|automate|crawl|linkedin jobs|apply to|web search/i;

export type TerminalHistoryKind = 'chat' | 'code' | 'business' | 'mixed' | 'image' | 'research';
export type TerminalHistoryStatus = 'active' | 'stopped' | 'complete';

export interface TerminalHistoryEntry {
  id: string;
  title: string;
  preview: string;
  prompt: string;
  messages: ChatMessage[];
  kind: TerminalHistoryKind;
  /** stopped = user cancelled mid-build (can Retry later) */
  status?: TerminalHistoryStatus;
  githubRepoUrl?: string;
  githubRepoName?: string;
  /** Branch last used with this session (restore fidelity) */
  githubBranch?: string;
  /** Supabase project id when synced to cloud */
  cloudProjectId?: string;
  deployUrl?: string;
  messageCount: number;
  createdAt: string;
  updatedAt: string;
}

function isAutomationPrompt(prompt: string): boolean {
  return BROWSER_KEYWORDS.test(prompt);
}

function detectKind(messages: ChatMessage[], prompt: string): TerminalHistoryKind {
  const hasLanding = messages.some(
    (m) => (m.featureOutput as { type?: string } | undefined)?.type === 'landing_page'
  );
  const hasImage = messages.some((m) => {
    const t = (m.featureOutput as { type?: string } | undefined)?.type;
    return t === 'image' || t === 'video_studio' || t === 'video_job_pending';
  });
  const isResearch =
    /\b(research|search|find|compare|market|competitor|strategy|advice|hackathon)\b/i.test(prompt) &&
    !hasLanding;
  const isBusiness = /\b(business|startup|dropship|marketing|strategy|revenue|monetiz)\b/i.test(prompt);
  if (hasLanding) return 'code';
  if (hasImage) return 'image';
  if (isResearch || isBusiness) return 'research';
  if (/\b(code|build|api|react|python|script|function|debug|fix)\b/i.test(prompt)) return 'mixed';
  return 'chat';
}

function toActivityKind(kind: TerminalHistoryKind): RepoActivityKind {
  if (kind === 'code') return 'code';
  if (kind === 'image') return 'image';
  if (kind === 'research' || kind === 'business') return 'research';
  if (kind === 'mixed') return 'mixed';
  return 'chat';
}

/**
 * Always prefer the selected repo workspace — chats/images/research belong to that
 * Xroga project. Code may later push to GitHub; chat never goes to GitHub.
 */
function extractProjectMeta(messages: ChatMessage[]) {
  const selectedRepo = getSelectedRepoContext();
  for (let i = messages.length - 1; i >= 0; i--) {
    const fo = messages[i]?.featureOutput as Record<string, unknown> | undefined;
    if (fo?.type === 'landing_page') {
      const repo =
        (typeof fo.githubRepoName === 'string' && fo.githubRepoName.includes('/')
          ? fo.githubRepoName
          : undefined) ?? selectedRepo?.repo;
      return {
        githubRepoUrl:
          typeof fo.githubRepoUrl === 'string'
            ? fo.githubRepoUrl
            : repo
              ? `https://github.com/${repo}`
              : undefined,
        githubRepoName: repo,
        githubBranch: selectedRepo?.branch || 'main',
        deployUrl: typeof fo.deployUrl === 'string' ? fo.deployUrl : undefined,
      };
    }
  }
  return {
    githubRepoUrl: selectedRepo?.repo ? `https://github.com/${selectedRepo.repo}` : undefined,
    githubRepoName: selectedRepo?.repo,
    githubBranch: selectedRepo?.branch || undefined,
  };
}

export function loadTerminalHistory(): TerminalHistoryEntry[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as TerminalHistoryEntry[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function save(entries: TerminalHistoryEntry[]) {
  if (typeof window === 'undefined') return;
  const slim = entries.slice(0, 100).map((e) => ({
    ...e,
    messages: messagesForStorage(e.messages),
  }));
  safeStorageSet(localStorage, KEY, JSON.stringify(slim));
}

function detectStatus(messages: ChatMessage[], kind: TerminalHistoryKind): TerminalHistoryStatus {
  if (messages.some((m) => m.buildStopped)) return 'stopped';
  if (kind === 'code' || messages.some((m) => (m.featureOutput as { type?: string } | undefined)?.type === 'landing_page')) {
    return 'complete';
  }
  return 'active';
}

export function saveTerminalHistorySession(opts: {
  sessionId: string;
  prompt: string;
  messages: ChatMessage[];
  status?: TerminalHistoryStatus;
}): TerminalHistoryEntry | null {
  if (!opts.messages.length) return null;

  const firstUser = opts.messages.find((m) => m.role === 'user');
  const titlePrompt = firstUser?.content?.trim() || opts.prompt.trim() || 'Terminal session';
  // Keep automation out of the Repositories tree; everything else (chat/image/research/code)
  // saves under the selected GitHub repo workspace on Xroga.
  if (isAutomationPrompt(titlePrompt)) return null;

  const preview =
    opts.messages
      .filter((m) => m.role === 'assistant')
      .map((m) => m.content)
      .join(' ')
      .slice(0, 200) || titlePrompt.slice(0, 200);

  const meta = extractProjectMeta(opts.messages);
  const existing = loadTerminalHistory().find((e) => e.id === opts.sessionId);
  const now = new Date().toISOString();
  const kind = detectKind(opts.messages, titlePrompt);
  const status = opts.status ?? detectStatus(opts.messages, kind);

  // Prefer sticky repo from an existing session if user briefly lost selection
  const githubRepoName = meta.githubRepoName ?? existing?.githubRepoName;
  const githubBranch = meta.githubBranch ?? existing?.githubBranch ?? 'main';

  const entry: TerminalHistoryEntry = {
    id: opts.sessionId,
    title: titlePrompt.slice(0, 56),
    preview,
    prompt: opts.prompt || titlePrompt,
    messages: opts.messages,
    kind,
    status,
    githubRepoUrl: meta.githubRepoUrl ?? (githubRepoName ? `https://github.com/${githubRepoName}` : undefined),
    githubRepoName,
    githubBranch,
    cloudProjectId: existing?.cloudProjectId,
    deployUrl: meta.deployUrl ?? existing?.deployUrl,
    messageCount: opts.messages.length,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };

  const rest = loadTerminalHistory().filter((e) => e.id !== opts.sessionId);
  save([entry, ...rest]);
  void saveTerminalSessionToIndexedDB(entry);

  if (entry.githubRepoName?.includes('/')) {
    registerRepoSession({
      githubRepoName: entry.githubRepoName,
      githubBranch: entry.githubBranch,
      title: entry.title,
      sessionId: entry.id,
      cloudProjectId: entry.cloudProjectId,
      status: entry.status,
      activityKind: toActivityKind(kind),
    });
  }

  return entry;
}

export function removeTerminalHistoryEntry(id: string) {
  save(loadTerminalHistory().filter((e) => e.id !== id));
  void deleteTerminalSessionFromIndexedDB(id);
}

/** Link a local terminal session to a Supabase projects row (cloud badge in sidebar). */
export function attachCloudProjectId(sessionId: string, cloudProjectId: string) {
  const entries = loadTerminalHistory();
  const next = entries.map((e) =>
    e.id === sessionId ? { ...e, cloudProjectId, updatedAt: new Date().toISOString() } : e
  );
  save(next);
  const hit = next.find((e) => e.id === sessionId);
  if (hit) void saveTerminalSessionToIndexedDB(hit);
  markRepoSessionCloudId(sessionId, cloudProjectId);
}

export function isTerminalHistoryEntry(entry: TerminalHistoryEntry): boolean {
  if (isAutomationPrompt(entry.prompt)) return false;
  return true;
}
