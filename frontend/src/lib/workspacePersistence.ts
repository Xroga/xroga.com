import type { ChatMessage } from '@/context/TerminalChatContext';
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

export function loadWorkspaceSession(): WorkspaceSession | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return null;
    return JSON.parse(raw) as WorkspaceSession;
  } catch {
    return null;
  }
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
    if (!safeStorageSet(sessionStorage, KEY, json)) {
      const slim: WorkspaceSession = {
        ...payload,
        messages: payload.messages.map((m) => ({
          ...m,
          featureOutput: undefined,
        })),
      };
      safeStorageSet(sessionStorage, KEY, JSON.stringify(slim));
    }
  } catch (err) {
    console.warn('[workspace] save failed:', (err as Error).message);
  }
}

export function clearWorkspaceSession() {
  if (typeof window === 'undefined') return;
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
  saveWorkspaceSession({
    prompt: opts.prompt ?? existing?.prompt ?? '',
    messages: opts.messages ?? existing?.messages ?? [],
    selectedId: opts.selectedId,
    selectedLabel: opts.selectedLabel,
    source: opts.source,
    jumpMessageId: opts.jumpMessageId,
  });
}
