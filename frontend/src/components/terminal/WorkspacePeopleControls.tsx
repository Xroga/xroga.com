'use client';

import { useEffect, useState, useRef } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import { Share2, X } from 'lucide-react';
import { useTerminalChat } from '@/context/TerminalChatContext';
import { useWorkspaceIdentity } from '@/components/layout/WorkspaceIdentityContext';
import { useWorkspaceAuthGate } from '@/components/workspace/WorkspaceAuthGate';
import { UserProfileBox } from '@/components/profile/UserProfileBox';
import { useAppStore } from '@/store/useAppStore';
import { MessageShareModal } from './MessageShareModal';
import styles from './WorkspacePeopleControls.module.css';

export function WorkspacePeopleControls() {
  const { messages } = useTerminalChat();
  const identity = useWorkspaceIdentity();
  const { requestAuthGate } = useWorkspaceAuthGate();
  const profile = useAppStore(state => state.profile);
  const [open, setOpen] = useState(false);
  const [share, setShare] = useState(false);
  const drawerRef = useRef<HTMLElement>(null);
  const transcript = messages.filter(message => message.role === 'user' || message.role === 'assistant').map(message => `${message.role === 'user' ? 'You' : 'Xroga'}:\n${message.content}`).join('\n\n');
  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
      if (event.key === 'Tab') {
        const nodes = drawerRef.current?.querySelectorAll<HTMLElement>('button,a[href]');
        if (!nodes?.length) return;
        const first = nodes[0], last = nodes[nodes.length - 1];
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
        if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
      }
    };
    document.addEventListener('keydown', escape);
    return () => { document.removeEventListener('keydown', escape); previous?.focus(); };
  }, [open]);
  return <>
    <button type="button" className={styles.control} aria-label="Share conversation" title="Share a read-only conversation snapshot" disabled={!transcript.trim()} onClick={() => { if (identity.status === 'guest') { requestAuthGate('integration'); return; } setShare(true); }}><Share2 size={14} /><span>Share</span></button>
    <button type="button" className={styles.control} aria-label="Profile" onClick={() => setOpen(true)}><UserProfileBox url={profile?.avatar_url} initial={identity.displayName.charAt(0).toUpperCase()} size="terminalCompact" /><span>Profile</span></button>
    <MessageShareModal open={share} onClose={() => setShare(false)} response={transcript} contentLabel="conversation snapshot" />
    {open ? createPortal(<div className={styles.overlay} onClick={() => setOpen(false)}>
      <aside ref={drawerRef} className={styles.drawer} role="dialog" aria-label="Workspace profile" aria-modal="true" onClick={event => event.stopPropagation()}>
        <header><strong>Profile</strong><button autoFocus type="button" aria-label="Close profile" onClick={() => setOpen(false)}><X size={18} /></button></header>
        <UserProfileBox url={profile?.avatar_url} initial={identity.displayName.charAt(0).toUpperCase()} size="terminalCompact" />
        <h2>{profile?.display_name || identity.displayName}</h2><p>{identity.email || 'Guest workspace'}</p>
        {identity.status === 'guest' ? <Link href="/auth/signup?next=%2Fworkspace">Create an account</Link> : <><Link href="/settings?tab=profile">Profile settings</Link><Link href="/dashboard">Plan and usage</Link><Link href="/settings?tab=notifications">Notifications</Link></>}
        <p>Sharing creates a read-only snapshot of this conversation. It does not grant access to files, connected accounts or project editing.</p>
      </aside>
    </div>, document.body) : null}
  </>;
}
