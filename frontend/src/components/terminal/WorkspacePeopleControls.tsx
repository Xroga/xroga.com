'use client';

import { useEffect, useState, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Share2, UsersRound, ExternalLink, X } from 'lucide-react';
import { useTerminalChat } from '@/context/TerminalChatContext';
import { useWorkspaceIdentity } from '@/components/layout/WorkspaceIdentityContext';
import { useWorkspaceAuthGate } from '@/components/workspace/WorkspaceAuthGate';
import { useProjectWorkspaceStore } from '@/store/useProjectWorkspaceStore';
import { MessageShareModal } from './MessageShareModal';
import styles from './WorkspacePeopleControls.module.css';
import { AnimatedIcon } from '@/components/icons/animated/AnimatedIcon';
import { UsersRoundIcon } from '@/components/icons/animated/UsersRoundIcon';
import { ShareIcon } from '@/components/icons/animated/ShareIcon';

export function WorkspacePeopleControls() {
  const { messages } = useTerminalChat();
  const identity = useWorkspaceIdentity();
  const { requestAuthGate } = useWorkspaceAuthGate();
  const activeProject = useProjectWorkspaceStore(state => state.activeProjectContext);
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
    <button type="button" className={styles.control} aria-label="Team" onClick={() => setOpen(true)}><AnimatedIcon icon={UsersRoundIcon} size={15} intro={false} /><span>Team</span></button>
    <button type="button" className={styles.control} aria-label="Share conversation" title="Share a read-only conversation snapshot" disabled={!transcript.trim()} onClick={() => { if (identity.status === 'guest') { requestAuthGate('integration'); return; } setShare(true); }}><AnimatedIcon icon={ShareIcon} size={14} intro={false} /><span>Share</span></button>
    <MessageShareModal open={share} onClose={() => setShare(false)} response={transcript} contentLabel="conversation snapshot" />
    {open ? createPortal(<div className={styles.overlay} onClick={() => setOpen(false)}>
      <aside ref={drawerRef} className={styles.drawer} role="dialog" aria-label="Team workspace" aria-modal="true" onClick={event => event.stopPropagation()}>
        <header><strong>Team</strong><button autoFocus type="button" aria-label="Close team panel" onClick={() => setOpen(false)}><X size={18} /></button></header>
        <div className={styles.teamIntro}><UsersRound size={22} /><h2>Work together, with clear access.</h2><p>{activeProject?.repo || 'This workspace'} · {identity.displayName}</p></div>
        <section className={styles.teamSection}><h3>Conversation sharing</h3><p>Share a read-only snapshot of this conversation. It does not grant access to files, connected accounts or project editing.</p><button type="button" disabled={!transcript.trim()} onClick={() => { setOpen(false); setShare(true); }}><Share2 size={15} /> Share conversation</button></section>
        <section className={styles.teamSection}><h3>Project collaborators</h3><p>Repository collaborators are managed by GitHub. Inviting someone there does not give them Xroga workspace access or charge your plan.</p>{activeProject?.repo ? <a href={`https://github.com/${activeProject.repo}/settings/access`} target="_blank" rel="noreferrer">Manage GitHub access <ExternalLink size={14} /></a> : <p>Connect a GitHub repository to manage its collaborators.</p>}</section>
        <section className={styles.teamSection}><h3>Xroga workspace roles</h3><p>Viewer, client, worker and owner invitations are not backed by workspace membership yet. No invite or owner-funded usage can be granted from this panel.</p></section>
      </aside>
    </div>, document.body) : null}
  </>;
}
