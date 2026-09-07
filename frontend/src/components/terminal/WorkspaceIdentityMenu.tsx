'use client';

import { useEffect, useRef, useState } from 'react';
import { Archive, Copy, ExternalLink, GitFork, MessageSquarePlus, Pin, Share2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { TerminalPromptIcon } from '@/components/icons/animated/TerminalPromptIcon';
import { useTerminalChat } from '@/context/TerminalChatContext';
import { loadTerminalHistory, removeTerminalHistoryEntry, saveTerminalHistorySession } from '@/lib/terminalHistory';
import { getSelectedRepoContext } from '@/lib/repoContext';
import { useProjectWorkspaceStore } from '@/store/useProjectWorkspaceStore';

const PIN_KEY = 'xroga_workspace_pinned';

export function WorkspaceIdentityMenu({ incognito = false }: { incognito?: boolean }) {
  const { messages, prompt, sessionId, startNewChat, restoreTerminalSession } = useTerminalChat();
  const workspaceRepo = useProjectWorkspaceStore((state) => state.repo);
  const [open, setOpen] = useState(false);
  const [repoIdentity, setRepoIdentity] = useState({ fullName: '', label: 'Workspace', terminals: 0 });
  const [pinned, setPinned] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setPinned(localStorage.getItem(PIN_KEY) === 'true');
  }, []);

  useEffect(() => {
    const refreshIdentity = () => {
      const history = loadTerminalHistory();
      const currentEntry = history.find((entry) => entry.id === sessionId);
      const fullName = workspaceRepo || currentEntry?.githubRepoName || getSelectedRepoContext()?.repo || '';
      const savedSessionIds = new Set(
        history.filter((entry) => entry.githubRepoName === fullName).map((entry) => entry.id),
      );
      if (fullName && messages.length > 0) savedSessionIds.add(sessionId);
      setRepoIdentity({
        fullName,
        label: fullName.split('/').pop() || 'Workspace',
        terminals: fullName ? savedSessionIds.size : messages.length > 0 ? 1 : 0,
      });
    };
    refreshIdentity();
    window.addEventListener('storage', refreshIdentity);
    window.addEventListener('xroga-repo-context-change', refreshIdentity);
    return () => {
      window.removeEventListener('storage', refreshIdentity);
      window.removeEventListener('xroga-repo-context-change', refreshIdentity);
    };
  }, [messages.length, sessionId, workspaceRepo]);

  useEffect(() => {
    if (!open) return;
    const close = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const escape = (event: KeyboardEvent) => event.key === 'Escape' && setOpen(false);
    document.addEventListener('pointerdown', close);
    document.addEventListener('keydown', escape);
    return () => {
      document.removeEventListener('pointerdown', close);
      document.removeEventListener('keydown', escape);
    };
  }, [open]);

  if (incognito) {
    return (
      <div className="xv-term-title">
        <TerminalPromptIcon className="shrink-0 opacity-70" aria-hidden="true" />
        <h3>guest@incognito</h3>
        <span className="xv-term-path">~/temporary</span>
      </div>
    );
  }

  const shareWorkspace = async () => {
    const data = { title: repoIdentity.label, text: `Continue ${repoIdentity.label} in Xroga`, url: window.location.href };
    const hasNativeShare = typeof navigator.share === 'function';
    try {
      if (hasNativeShare) await navigator.share(data);
      else await navigator.clipboard.writeText(window.location.href);
      toast.success(hasNativeShare ? 'Share sheet opened' : 'Workspace link copied');
    } catch {
      // Closing the native share sheet is not an error worth surfacing.
    }
    setOpen(false);
  };

  const copyWorkspace = async () => {
    await navigator.clipboard.writeText(window.location.href);
    toast.success('Workspace link copied');
    setOpen(false);
  };

  const forkWorkspace = async () => {
    if (!messages.length) {
      toast.error('Start a conversation before forking');
      return;
    }
    const forkId = crypto.randomUUID();
    const entry = saveTerminalHistorySession({ sessionId: forkId, prompt, messages });
    await restoreTerminalSession({
      sessionId: forkId,
      prompt,
      messages,
      selectedId: forkId,
      selectedLabel: entry?.title || `Fork of ${repoIdentity.label}`,
      source: 'dashboard',
      jumpMessageId: messages.at(-1)?.id,
      githubRepoName: entry?.githubRepoName,
    });
    toast.success('Workspace forked');
    setOpen(false);
  };

  const archiveWorkspace = () => {
    const archivedId = sessionId;
    startNewChat();
    removeTerminalHistoryEntry(archivedId);
    toast.success('Workspace archived');
    setOpen(false);
  };

  return (
    <div ref={rootRef} className="xv-workspace-identity">
      <button type="button" className="xv-term-title xv-term-title--button" onClick={() => setOpen((value) => !value)} aria-haspopup="menu" aria-expanded={open}>
        <TerminalPromptIcon className="shrink-0 opacity-70" aria-hidden="true" />
        <h3 title={repoIdentity.fullName || 'No repository selected'}>{repoIdentity.label}</h3>
        <span className="xv-term-path">{repoIdentity.terminals} {repoIdentity.terminals === 1 ? 'terminal' : 'terminals'}</span>
        {pinned ? <Pin className="xv-term-pinned" aria-label="Pinned" /> : null}
      </button>

      {open ? (
        <div className="xv-workspace-identity-menu" role="menu" aria-label="Workspace actions">
          <button role="menuitem" type="button" onClick={() => { const next = !pinned; setPinned(next); localStorage.setItem(PIN_KEY, String(next)); }}><Pin />{pinned ? 'Unpin' : 'Pin'}</button>
          <button role="menuitem" type="button" onClick={archiveWorkspace}><Archive />Archive</button>
          <i role="separator" />
          <button role="menuitem" type="button" onClick={() => void shareWorkspace()}><Share2 />Share</button>
          <button role="menuitem" type="button" onClick={() => void copyWorkspace()}><Copy />Copy link</button>
          <i role="separator" />
          <button role="menuitem" type="button" onClick={() => window.open('/workspace?new=1', '_blank', 'noopener,noreferrer')}><MessageSquarePlus />New side chat</button>
          <button role="menuitem" type="button" onClick={() => void forkWorkspace()}><GitFork />Fork</button>
          <button role="menuitem" type="button" onClick={() => window.open('/workspace', 'xroga-workspace', 'popup,width=1280,height=840')}><ExternalLink />Open in new window</button>
        </div>
      ) : null}
    </div>
  );
}
