'use client';

import { useEffect, useState, useRef } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import { TeamWorkspace } from '@/components/team/TeamWorkspace';
import { Share2, UsersRound, ExternalLink, X } from 'lucide-react';
import { useTerminalChat } from '@/context/TerminalChatContext';
import { useWorkspaceIdentity } from '@/components/layout/WorkspaceIdentityContext';
import { useWorkspaceAuthGate } from '@/components/workspace/WorkspaceAuthGate';
import { useProjectWorkspaceStore } from '@/store/useProjectWorkspaceStore';
import { MessageShareModal } from './MessageShareModal';
import styles from './WorkspacePeopleControls.module.css';
import { AnimatedIcon } from '@/components/icons/animated/AnimatedIcon';
import { publicAnswerExportText } from '@/lib/publicAnswerText';
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
  const transcript = messages.filter(message => message.role === 'user' || message.role === 'assistant').map(message =>
    message.role === 'user' ? `You:\n${message.content}` : `Xroga:\n${publicAnswerExportText(message.content)}`,
  ).join('\n\n');
  const shareConversation = () => {
    setOpen(false);
    if (identity.status === 'guest') { requestAuthGate('integration'); return; }
    setShare(true);
  };
  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
      if (event.key === 'Tab') {
        const nodes = drawerRef.current?.querySelectorAll<HTMLElement>('button:not(:disabled),a[href],input:not(:disabled),select:not(:disabled)');
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
    <button type="button" className={styles.control} aria-label="Share conversation" title="Share a read-only conversation snapshot" disabled={!transcript.trim()} onClick={shareConversation}><AnimatedIcon icon={ShareIcon} size={14} intro={false} /></button>
    <button type="button" className={styles.control} aria-label="Team" title="Team" aria-haspopup="dialog" aria-expanded={open} onClick={() => setOpen(true)}><AnimatedIcon icon={UsersRoundIcon} size={15} intro={false} /></button>
    <MessageShareModal open={share} onClose={() => setShare(false)} response={transcript} contentLabel="conversation snapshot" />
    {open ? createPortal(<div className={styles.teamOverlay} onClick={() => setOpen(false)}>
      <aside ref={drawerRef} className={styles.teamDrawer} role="dialog" aria-label="Team workspace" aria-modal="true" onClick={event => event.stopPropagation()}>
        <header className={styles.teamHead}><strong><UsersRound size={17} /> Team</strong><button autoFocus type="button" aria-label="Close team panel" onClick={() => setOpen(false)}><X size={18} /></button></header>
        <div className={styles.teamBody}>
          <TeamWorkspace variant="panel" />
          <div className={styles.teamExtras}>
            <button type="button" disabled={!transcript.trim()} onClick={shareConversation}><Share2 size={14} /> Share conversation (read-only)</button>
            {activeProject?.repo ? <a href={`https://github.com/${activeProject.repo}/settings/access`} target="_blank" rel="noreferrer">GitHub collaborators <ExternalLink size={13} /></a> : null}
            <Link href="/team" onClick={() => setOpen(false)}>Open full Team page <ExternalLink size={13} /></Link>
          </div>
        </div>
      </aside>
    </div>, document.body) : null}
  </>;
}
