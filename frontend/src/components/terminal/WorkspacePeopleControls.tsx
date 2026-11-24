'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import { TeamWorkspace } from '@/components/team/TeamWorkspace';
import { ExternalLink, GitBranch, Share2, UsersRound, X } from 'lucide-react';
import { useTerminalChat } from '@/context/TerminalChatContext';
import { useWorkspaceIdentity } from '@/components/layout/WorkspaceIdentityContext';
import { useWorkspaceAuthGate } from '@/components/workspace/WorkspaceAuthGate';
import { useProjectWorkspaceStore } from '@/store/useProjectWorkspaceStore';
import { MessageShareModal } from './MessageShareModal';
import styles from './WorkspacePeopleControls.module.css';
import './teamPanelPush.css';
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
  const transcript = messages.filter(message => message.role === 'user' || message.role === 'assistant').map(message =>
    message.role === 'user' ? `You:\n${message.content}` : `Xroga:\n${publicAnswerExportText(message.content)}`,
  ).join('\n\n');
  const shareConversation = () => {
    if (identity.status === 'guest') { requestAuthGate('integration'); return; }
    setShare(true);
  };

  // While the panel is open the workspace column makes room for it (see the module CSS),
  // the same way it does for the left sidebar. Escape closes it.
  useEffect(() => {
    if (!open) return;
    document.body.dataset.teamPanel = 'open';
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape' && !share) setOpen(false); };
    document.addEventListener('keydown', escape);
    return () => { document.removeEventListener('keydown', escape); delete document.body.dataset.teamPanel; };
  }, [open, share]);

  return <>
    <button type="button" className={styles.control} aria-label="Share conversation" title="Share a read-only conversation snapshot" disabled={!transcript.trim()} onClick={shareConversation}><AnimatedIcon icon={ShareIcon} size={14} intro={false} /></button>
    <button type="button" className={styles.control} aria-label="Team" title="Team" aria-expanded={open} onClick={() => setOpen(value => !value)}><AnimatedIcon icon={UsersRoundIcon} size={15} intro={false} /></button>
    <MessageShareModal open={share} onClose={() => setShare(false)} response={transcript} contentLabel="conversation snapshot" />
    {open ? createPortal(<aside className={styles.teamPanel} role="complementary" aria-label="Team">
      <header className={styles.teamHead}><strong><UsersRound size={17} /> Team</strong><button autoFocus type="button" aria-label="Close team panel" onClick={() => setOpen(false)}><X size={18} /></button></header>
      <div className={styles.teamBody}>
        <div className={styles.quick}>
          <button type="button" className={styles.quickBtn} disabled={!transcript.trim()} onClick={shareConversation} title="Create a read-only link to this conversation"><Share2 size={17} />Share chat</button>
          {activeProject?.repo
            ? <a className={styles.quickBtn} href={`https://github.com/${activeProject.repo}/settings/access`} target="_blank" rel="noreferrer" title="Manage repository collaborators on GitHub"><GitBranch size={17} />GitHub access</a>
            : <button type="button" className={styles.quickBtn} disabled title="Connect a GitHub repository first"><GitBranch size={17} />GitHub access</button>}
          <Link className={styles.quickBtn} href="/team" title="Open the full Team page"><ExternalLink size={17} />Full page</Link>
        </div>
        <div className={styles.divider} />
        <TeamWorkspace variant="panel" />
      </div>
    </aside>, document.body) : null}
  </>;
}
