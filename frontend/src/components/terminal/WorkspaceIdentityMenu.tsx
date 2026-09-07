'use client';

import { useEffect, useRef, useState } from 'react';
import { Archive, Check, Copy, ExternalLink, GitFork, MessageSquarePlus, Pencil, Pin, Share2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { TerminalPromptIcon } from '@/components/icons/animated/TerminalPromptIcon';
import { useTerminalChat } from '@/context/TerminalChatContext';
import { removeTerminalHistoryEntry, saveTerminalHistorySession } from '@/lib/terminalHistory';

const NAME_KEY = 'xroga_workspace_name';
const PIN_KEY = 'xroga_workspace_pinned';

export function WorkspaceIdentityMenu({ incognito = false }: { incognito?: boolean }) {
  const { messages, prompt, sessionId, startNewChat, restoreTerminalSession } = useTerminalChat();
  const [open, setOpen] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [name, setName] = useState('xroga@swarm');
  const [draft, setDraft] = useState(name);
  const [pinned, setPinned] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setName(localStorage.getItem(NAME_KEY) || 'xroga@swarm');
    setPinned(localStorage.getItem(PIN_KEY) === 'true');
  }, []);

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
    const data = { title: name, text: `Continue ${name} in Xroga`, url: window.location.href };
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

  const saveRename = () => {
    const next = draft.trim().slice(0, 42) || 'xroga@swarm';
    localStorage.setItem(NAME_KEY, next);
    setName(next);
    setRenaming(false);
    toast.success('Workspace renamed');
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
      selectedLabel: entry?.title || `Fork of ${name}`,
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
        <h3>{name}</h3>
        <span className="xv-term-path">~/workspace</span>
        {pinned ? <Pin className="xv-term-pinned" aria-label="Pinned" /> : null}
      </button>

      {open ? (
        <div className="xv-workspace-identity-menu" role="menu" aria-label="Workspace actions">
          {renaming ? (
            <form className="xv-workspace-rename" onSubmit={(event) => { event.preventDefault(); saveRename(); }}>
              <input autoFocus value={draft} onChange={(event) => setDraft(event.target.value)} aria-label="Workspace name" />
              <button type="submit" aria-label="Save name"><Check /></button>
            </form>
          ) : null}
          <button role="menuitem" type="button" onClick={() => { const next = !pinned; setPinned(next); localStorage.setItem(PIN_KEY, String(next)); }}><Pin />{pinned ? 'Unpin' : 'Pin'}</button>
          <button role="menuitem" type="button" onClick={() => { setDraft(name); setRenaming(true); }}><Pencil />Rename</button>
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
