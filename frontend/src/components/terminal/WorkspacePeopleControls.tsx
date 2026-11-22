'use client';

import { useEffect, useId, useState, useRef } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import { Share2, ExternalLink, X } from 'lucide-react';
import { useTerminalChat } from '@/context/TerminalChatContext';
import { useWorkspaceIdentity } from '@/components/layout/WorkspaceIdentityContext';
import { useWorkspaceAuthGate } from '@/components/workspace/WorkspaceAuthGate';
import { useProjectWorkspaceStore } from '@/store/useProjectWorkspaceStore';
import { MessageShareModal } from './MessageShareModal';
import styles from './WorkspacePeopleControls.module.css';
import { AnimatedIcon } from '@/components/icons/animated/AnimatedIcon';
import { UsersRoundIcon } from '@/components/icons/animated/UsersRoundIcon';
import { ShareIcon } from '@/components/icons/animated/ShareIcon';
import { teamMembershipPreviewAvailable } from './TeamMembershipPanel';
import { TeamMembershipAccess, TEAM_SETTINGS_PATH } from './TeamMembershipAccess';

export function WorkspacePeopleControls() {
  const { messages } = useTerminalChat();
  const identity = useWorkspaceIdentity();
  const { requestAuthGate } = useWorkspaceAuthGate();
  const activeProject = useProjectWorkspaceStore(state => state.activeProjectContext);
  const [open, setOpen] = useState(false);
  const [share, setShare] = useState(false);
  const drawerRef = useRef<HTMLElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const headingId = useId();
  const transcript = messages.filter(message => message.role === 'user' || message.role === 'assistant').map(message => `${message.role === 'user' ? 'You' : 'Xroga'}:\n${message.content}`).join('\n\n');
  useEffect(() => {
    if (teamMembershipPreviewAvailable() && new URLSearchParams(location.search).get('teamInvites') === '1') setOpen(true);
  }, []);
  useEffect(() => {
    if (!open) return;
    const trigger = triggerRef.current;
    closeRef.current?.focus();
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
      if (event.key === 'Tab') {
        const nodes = drawerRef.current?.querySelectorAll<HTMLElement>('button:not([disabled]),a[href],input:not([disabled]),select:not([disabled])');
        if (!nodes?.length) return;
        const first = nodes[0], last = nodes[nodes.length - 1];
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
        if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
      }
    };
    document.addEventListener('keydown', escape);
    return () => { document.removeEventListener('keydown', escape); trigger?.focus(); };
  }, [open]);
  return <>
    <button type="button" className={styles.control} aria-label="Share conversation" title="Share a read-only conversation snapshot" disabled={!transcript.trim()} onClick={() => { if (identity.status === 'guest') { requestAuthGate('integration'); return; } setShare(true); }}><AnimatedIcon icon={ShareIcon} size={14} intro={false} /><span>Share</span></button>
    <button ref={triggerRef} type="button" className={styles.control} aria-label="Team" aria-haspopup="dialog" aria-expanded={open} onClick={() => setOpen(true)}><AnimatedIcon icon={UsersRoundIcon} size={15} intro={false} /><span>Team</span></button>
    <MessageShareModal open={share} onClose={() => setShare(false)} response={transcript} contentLabel="conversation snapshot" />
    {open ? createPortal(<div className={styles.overlay} onClick={() => setOpen(false)}>
      <aside ref={drawerRef} className={styles.drawer} role="dialog" aria-labelledby={headingId} aria-modal="true" onClick={event => event.stopPropagation()}>
        <header className={styles.drawerHeader}>
          <div><h2 id={headingId}>Team workspace</h2><p>{activeProject?.repo || 'This workspace'} · {identity.displayName}</p></div>
          <button ref={closeRef} type="button" aria-label="Close team panel" onClick={() => setOpen(false)}><X size={18} aria-hidden="true" /></button>
        </header>
        <Link className={styles.settingsLink} href={TEAM_SETTINGS_PATH} prefetch={false} onClick={() => setOpen(false)}>
          Open full Team settings <ExternalLink size={14} aria-hidden="true" />
        </Link>
        <TeamMembershipAccess inDrawer />
        <section className={styles.teamSection}><h2>Conversation sharing</h2><p>Share a read-only snapshot. This does not share files, connected accounts or project editing.</p><button type="button" disabled={!transcript.trim()} onClick={() => { setOpen(false); setShare(true); }}><Share2 size={15} aria-hidden="true" /> Share conversation</button></section>
        <section className={styles.teamSection}><h2>Project collaborators</h2><p>GitHub repository access is separate from Xroga team membership.</p>{activeProject?.repo ? <a href={`https://github.com/${activeProject.repo}/settings/access`} target="_blank" rel="noreferrer">Manage GitHub access <ExternalLink size={14} aria-hidden="true" /></a> : <p>Connect a GitHub repository to manage its collaborators.</p>}</section>
      </aside>
    </div>, document.body) : null}
  </>;
}
