import type { ChatMessage } from '@/context/TerminalChatContext';
import { rehydrateMessagesWithMedia } from '@/lib/messageRehydration';
import { sanitizeChatMessages } from '@/lib/sanitizeChatMessages';
import { messagesForStorage, safeStorageSet } from '@/lib/storageSafe';
import {
  clearWorkspaceFromIndexedDB,
  loadWorkspaceFromIndexedDB,
  saveWorkspaceToIndexedDB,
} from '@/lib/workspaceSessionStorage';

const KEY = 'xroga_workspace_session';

function slimLandingForStorage(messages: ChatMessage[]): ChatMessage[] {
  return messages.map((m) => {
    if (!m.featureOutput || typeof m.featureOutput !== 'object') return m;
    const fo = m.featureOutput as Record<string, unknown>;
    if (fo.type !== 'landing_page') return m;
    const summaryText =
      typeof fo.summary === 'string' && fo.summary.trim()
        ? fo.summary
        : '🎉 YOUR PROJECT IS LIVE!';
    return {
      ...m,
      content: m.content?.trim() ? m.content : summaryText,
      featureOutput: {
        type: 'landing_page',
        deployUrl: fo.deployUrl ?? '',
        deployVerified: fo.deployVerified,
        githubRepoUrl: fo.githubRepoUrl,
        githubRepoName: fo.githubRepoName,
        projectName: fo.projectName,
        pages: fo.pages,
        features: fo.features,
        designTheme: fo.designTheme,
        needsPayment: fo.needsPayment,
        memoryNote: fo.memoryNote,
        summary: fo.summary ?? summaryText,
        heroImageUrl: fo.heroImageUrl,
        vercelPreviewUrl: fo.vercelPreviewUrl,
        netlifyPreviewUrl: fo.netlifyPreviewUrl,
        html: '',
        css: '',
        js: '',
      },
    };
  });
}

export type WorkspaceSource = 'projects' | 'chats' | 'automation' | 'media' | 'dashboard';

export interface WorkspaceSession {
  prompt: string;
  messages: ChatMessage[];
  selectedId?: string;
  selectedLabel?: string;
  source?: WorkspaceSource;
  jumpMessageId?: string;
  updatedAt: string;
}

function readLocalSession(): WorkspaceSession | null {
  if (typeof window === 'undefined') return null;
  try {
    const fromLocal = localStorage.getItem(KEY);
    if (fromLocal) return JSON.parse(fromLocal) as WorkspaceSession;

    const fromSession = sessionStorage.getItem(KEY);
    if (!fromSession) return null;

    const parsed = JSON.parse(fromSession) as WorkspaceSession;
    safeStorageSet(localStorage, KEY, fromSession);
    sessionStorage.removeItem(KEY);
    return parsed;
  } catch {
    return null;
  }
}

function pickNewerSession(a: WorkspaceSession | null, b: WorkspaceSession | null): WorkspaceSession | null {
  if (!a) return b;
  if (!b) return a;
  const aTime = Date.parse(a.updatedAt || '') || 0;
  const bTime = Date.parse(b.updatedAt || '') || 0;
  if (bTime > aTime) return b.messages?.length >= (a.messages?.length ?? 0) ? b : a;
  return a.messages?.length >= (b.messages?.length ?? 0) ? a : b;
}

export function loadWorkspaceSession(): WorkspaceSession | null {
  const session = readLocalSession();
  if (!session) return null;
  if (session.messages?.length) {
    session.messages = sanitizeChatMessages(session.messages);
  }
  return session;
}

/** Load session + IndexedDB landing builds + media URLs (use after refresh). */
export async function loadWorkspaceSessionHydrated(): Promise<WorkspaceSession | null> {
  const [fromLocal, fromIndexed] = await Promise.all([
    Promise.resolve(readLocalSession()),
    loadWorkspaceFromIndexedDB(),
  ]);

  const merged = pickNewerSession(fromLocal, fromIndexed);
  if (!merged?.messages?.length) return merged;

  merged.messages = sanitizeChatMessages(merged.messages);
  const { rehydratePersistedMessages } = await import('@/lib/rehydratePersistedMessages');
  merged.messages = await rehydratePersistedMessages(merged.messages);
  return merged;
}

export function saveWorkspaceSession(session: Omit<WorkspaceSession, 'updatedAt'>) {
  if (typeof window === 'undefined') return;
  if (!session.messages?.length && !session.prompt?.trim()) return;

  const payload: WorkspaceSession = {
    ...session,
    messages: messagesForStorage(slimLandingForStorage(session.messages)),
    updatedAt: new Date().toISOString(),
  };

  try {
    let json: string;
    try {
      json = JSON.stringify(payload);
    } catch {
      const slim: WorkspaceSession = {
        ...payload,
        messages: slimLandingForStorage(rehydrateMessagesWithMedia(payload.messages)).map((m) => ({
          ...m,
          featureOutput:
            m.featureOutput && typeof m.featureOutput === 'object'
              ? (m.featureOutput as { type?: string }).type === 'image'
                ? {
                    type: 'image',
                    imageUrl: (m.featureOutput as { imageUrl?: string }).imageUrl ?? '',
                    prompt: (m.featureOutput as { prompt?: string }).prompt,
                  }
                : (m.featureOutput as { type?: string }).type === 'landing_page'
                  ? m.featureOutput
                  : undefined
              : undefined,
        })),
      };
      json = JSON.stringify(slim);
      payload.messages = slim.messages;
    }

    safeStorageSet(localStorage, KEY, json);
    void saveWorkspaceToIndexedDB(payload);
  } catch (err) {
    console.warn('[workspace] save failed:', (err as Error).message);
    void saveWorkspaceToIndexedDB(payload);
  }
}

export function clearWorkspaceSession() {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(KEY);
  sessionStorage.removeItem(KEY);
  void clearWorkspaceFromIndexedDB();
}

export function resumeToDashboard(opts: {
  prompt?: string;
  messages?: ChatMessage[];
  selectedId: string;
  selectedLabel: string;
  source: WorkspaceSource;
  jumpMessageId?: string;
}) {
  const existing = loadWorkspaceSession();
  const messages = opts.messages?.length
    ? rehydrateMessagesWithMedia(opts.messages)
    : (existing?.messages ?? []);

  saveWorkspaceSession({
    prompt: opts.prompt ?? existing?.prompt ?? '',
    messages,
    selectedId: opts.selectedId,
    selectedLabel: opts.selectedLabel,
    source: opts.source,
    jumpMessageId: opts.jumpMessageId,
  });
}
