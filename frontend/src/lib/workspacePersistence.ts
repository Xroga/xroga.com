import type { ChatMessage } from '@/context/TerminalChatContext';

const KEY = 'xroga_workspace_session';

export type WorkspaceSource = 'projects' | 'chats' | 'automation' | 'media' | 'dashboard';

export interface WorkspaceSession {
  prompt: string;
  messages: ChatMessage[];
  selectedId?: string;
  selectedLabel?: string;
  source?: WorkspaceSource;
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
  const payload: WorkspaceSession = { ...session, updatedAt: new Date().toISOString() };
  sessionStorage.setItem(KEY, JSON.stringify(payload));
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
}) {
  const existing = loadWorkspaceSession();
  saveWorkspaceSession({
    prompt: opts.prompt ?? existing?.prompt ?? '',
    messages: opts.messages ?? existing?.messages ?? [],
    selectedId: opts.selectedId,
    selectedLabel: opts.selectedLabel,
    source: opts.source,
  });
}
