import type { ChatMessage } from '@/context/TerminalChatContext';
import { rehydrateMessagesWithMedia } from '@/lib/messageRehydration';
import { sanitizeChatMessages } from '@/lib/sanitizeChatMessages';
import { messagesForStorage, safeStorageSet } from '@/lib/storageSafe';

const KEY = 'xroga_workspace_session';

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

function readRawSession(): WorkspaceSession | null {
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

export function loadWorkspaceSession(): WorkspaceSession | null {
  const session = readRawSession();
  if (!session) return null;
  if (session.messages?.length) {
    session.messages = rehydrateMessagesWithMedia(sanitizeChatMessages(session.messages));
  }
  return session;
}

export function saveWorkspaceSession(session: Omit<WorkspaceSession, 'updatedAt'>) {
  if (typeof window === 'undefined') return;
  const payload: WorkspaceSession = {
    ...session,
    messages: messagesForStorage(session.messages),
    updatedAt: new Date().toISOString(),
  };
  try {
    let json: string;
    try {
      json = JSON.stringify(payload);
    } catch {
      const slim: WorkspaceSession = {
        ...payload,
        messages: payload.messages.map((m) => ({
          ...m,
          featureOutput: undefined,
        })),
      };
      json = JSON.stringify(slim);
    }
    if (!safeStorageSet(localStorage, KEY, json)) {
      const slim: WorkspaceSession = {
        ...payload,
        messages: rehydrateMessagesWithMedia(payload.messages).map((m) => ({
          ...m,
          featureOutput:
            m.featureOutput && typeof m.featureOutput === 'object' && (m.featureOutput as { type?: string }).type === 'image'
              ? {
                  type: 'image',
                  imageUrl: (m.featureOutput as { imageUrl?: string }).imageUrl ?? '',
                  prompt: (m.featureOutput as { prompt?: string }).prompt,
                }
              : undefined,
        })),
      };
      safeStorageSet(localStorage, KEY, JSON.stringify(slim));
    }
  } catch (err) {
    console.warn('[workspace] save failed:', (err as Error).message);
  }
}

export function clearWorkspaceSession() {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(KEY);
  sessionStorage.removeItem(KEY);
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
