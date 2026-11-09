'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Archive, ArrowLeft, Check, ChevronDown, Copy, ExternalLink, FolderInput, Loader2, Pencil, Pin, PinOff, Share2, Trash2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { useTerminalChat } from '@/context/TerminalChatContext';
import { useWorkspaceIdentity } from '@/components/layout/WorkspaceIdentityContext';
import { useProjectWorkspaceStore } from '@/store/useProjectWorkspaceStore';
import { getActiveSidebarProject, SIDEBAR_PROJECT_ACTIVE_EVENT, activateSidebarProject, clearActiveSidebarProject } from '@/lib/sidebarProjectTask';
import { AnchoredPortalPopover } from '@/components/ui/AnchoredPortalPopover';
import { WorkspaceIdentityMenu } from './WorkspaceIdentityMenu';
import { meaningfulSidebarTitle, loadSidebarChatById, loadSidebarMeta, loadSidebarProjects, changeSidebarMeta, deleteSidebarChat, deleteSidebarMeta, type SidebarMeta, type SidebarProject } from '@/lib/sidebarOrganization';
import { loadCloudTerminalSession } from '@/lib/cloudTerminalSessions';
import { removeTerminalHistoryEntry } from '@/lib/terminalHistory';
import { api } from '@/lib/api';

import styles from './WorkspaceConversationMenu.module.css';

type RecentConversation = {
  id: string;
  title: string;
  preview: string;
  updatedAt: string;
  source: 'chat' | 'repo';
  repo?: string;
  branch?: string;
  projectId?: string | null;
};

/** A workspace-header view of the *existing* account-owned conversation history.
 * It does not create a second history store or modify the sidebar.
 */
export function WorkspaceConversationMenu() {
  const { status, userId } = useWorkspaceIdentity();
  const { sessionId, messages, loading, sessionRestoring, startNewChat, discardCurrentChat } = useTerminalChat();
  const activeRepo = useProjectWorkspaceStore((state) => state.activeProjectContext?.repo || '');
  const accountId = status === 'authenticated' ? userId : undefined;
  const [open, setOpen] = useState(false);
  const [recent, setRecent] = useState<RecentConversation[]>([]);
  const [fetching, setFetching] = useState(false);
  const [metadata, setMetadata] = useState<SidebarMeta[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [projectName, setProjectName] = useState('');
  const [editor, setEditor] = useState<'rename' | 'project' | 'archive' | 'delete' | null>(null);
  const [editorText, setEditorText] = useState('');
  const [projects, setProjects] = useState<SidebarProject[]>([]);
  const [projectsLoading, setProjectsLoading] = useState(false);
  const [busyAction, setBusyAction] = useState(false);
  const anchorRef = useRef<HTMLButtonElement>(null);
  const requestIdRef = useRef(0);

  const firstUserPrompt = useMemo(
    () => messages.find((message) => message.role === 'user')?.content || '',
    [messages],
  );
  const currentEntry = recent.find((entry) => entry.id === sessionId);
  const currentMeta = metadata.find((item) => item.item_type === 'conversation' && item.item_id === sessionId);
  const canManage = Boolean(accountId && currentEntry && messages.length && !loading && !sessionRestoring && !fetching && !busyAction);
  const savedCurrentTitle = currentMeta?.title_override || currentEntry?.title;
  const activeTitle = firstUserPrompt
    ? meaningfulSidebarTitle(savedCurrentTitle, firstUserPrompt)
    : 'New chat';
  const displayTitle = sessionRestoring ? 'Opening conversation…' : activeTitle;
  // Context prefix only for active GitHub or project work. Other recent chats
  // display their conversation title directly, with no artificial label.
  const contextPrefix = activeRepo ? `Repo · ${activeRepo.split('/').pop() || activeRepo}` :
    projectName ? `Project · ${projectName}` : '';
  const headerTitle = contextPrefix ? `${contextPrefix} / ${displayTitle}` : displayTitle;

  const closeMenu = useCallback(() => {
    setOpen(false);
    setEditor(null);
    setEditorText('');
  }, []);

  useEffect(() => {
    // Never reveal another account's loaded titles during an auth transition.
    setRecent([]);
    setMetadata([]);
    setProjects([]);
    setEditor(null);
    setOpen(false);
    requestIdRef.current += 1;
  }, [accountId]);

  // Use the same account-scoped project selection as the workspace sidebar.
  useEffect(() => {
    if (!accountId) { setSelectedProjectId(null); return; }
    const sync = () => setSelectedProjectId(getActiveSidebarProject(accountId)?.projectId ?? null);
    sync();
    window.addEventListener(SIDEBAR_PROJECT_ACTIVE_EVENT, sync);
    return () => window.removeEventListener(SIDEBAR_PROJECT_ACTIVE_EVENT, sync);
  }, [accountId, sessionId]);

  useEffect(() => {
    const projectId = currentMeta?.project_id ?? selectedProjectId;
    if (!accountId || !projectId || activeRepo) { setProjectName(''); return; }
    let cancelled = false;
    void loadSidebarProjects(accountId, 0, 100)
      .then((items) => { if (!cancelled) setProjectName(items.find((item) => item.id === projectId)?.name || ''); })
      .catch(() => { if (!cancelled) setProjectName(''); });
    return () => { cancelled = true; };
  }, [accountId, currentMeta?.project_id, selectedProjectId, activeRepo]);

  // Header popup manages ONLY the active owner-scoped conversation; it does
  // not fetch or render a second recent-chat browser.
  useEffect(() => {
    if (!open || !accountId) return;
    let cancelled = false;
    const currentRequest = ++requestIdRef.current;
    setFetching(true);
    void (async () => {
      const [chatResult, metaResult] = await Promise.allSettled([
        loadSidebarChatById(accountId, sessionId),
        loadSidebarMeta(accountId),
      ]);
      if (cancelled || currentRequest !== requestIdRef.current) return;
      const meta = metaResult.status === 'fulfilled' ? metaResult.value : [];
      setMetadata(meta);
      const ownerMeta = meta.find((item) => item.item_type === 'conversation' && item.item_id === sessionId);
      let current: RecentConversation | null = null;
      if (chatResult.status === 'fulfilled' && chatResult.value?.messages?.length) {
        const chat = chatResult.value;
        current = {
          id: chat.id, title: meaningfulSidebarTitle(ownerMeta?.title_override || chat.title, chat.prompt || chat.preview),
          preview: chat.preview || chat.prompt || '', updatedAt: chat.updatedAt,
          source: 'chat', projectId: ownerMeta?.project_id,
        };
      } else {
        try {
          const repo = await loadCloudTerminalSession(sessionId);
          if (repo?.messages?.length) current = {
            id: repo.id, title: meaningfulSidebarTitle(ownerMeta?.title_override || repo.title, repo.preview),
            preview: repo.preview || '', updatedAt: repo.updatedAt, source: 'repo',
            repo: repo.githubRepoName, branch: repo.githubBranch, projectId: ownerMeta?.project_id,
          };
        } catch { /* Unsaved chats have no owner-scoped record yet. */ }
      }
      if (!cancelled && currentRequest === requestIdRef.current) setRecent(current ? [current] : []);
    })().catch(() => {
      if (!cancelled && currentRequest === requestIdRef.current) setRecent([]);
    }).finally(() => {
      if (!cancelled && currentRequest === requestIdRef.current) setFetching(false);
    });
    return () => { cancelled = true; };
  }, [open, accountId, sessionId]);

  // All actions below apply to the active conversation, not the sidebar list.
  // A saved owner-scoped record must be present before any mutation is offered.
  function conversationUrl(): string {
    return `${window.location.origin}/workspace?conversation=${encodeURIComponent(sessionId)}`;
  }

  async function shareLink(action: 'share' | 'copy' | 'open') {
    if (!canManage || !currentEntry) return;
    const url = conversationUrl();
    if (action === 'open') {
      window.open(url, '_blank', 'noopener,noreferrer');
      return;
    }
    if (action === 'share' && typeof navigator.share === 'function') {
      try {
        await navigator.share({ title: currentEntry.title, url });
      } catch (err) {
        if ((err as Error).name !== 'AbortError') toast.error('Could not share this conversation.');
      }
      return;
    }
    try {
      await navigator.clipboard.writeText(url);
      toast.success(action === 'share'
        ? 'Private link copied. Only your signed-in account can open it.'
        : 'Conversation link copied');
    } catch {
      toast.error('Could not copy the conversation link.');
    }
  }

  async function persistMetadata(changes: Partial<SidebarMeta>): Promise<boolean> {
    if (!accountId || !canManage || !currentEntry) return false;
    setBusyAction(true);
    try {
      await changeSidebarMeta(accountId, 'conversation', sessionId, changes);
      setMetadata((existing) => {
        const rest = existing.filter((entry) => !(entry.item_type === 'conversation' && entry.item_id === sessionId));
        const base: SidebarMeta = currentMeta || {
          user_id: accountId, item_type: 'conversation', item_id: sessionId,
          title_override: null, pin_order: null, archived_at: null, project_id: null, section_id: null,
        };
        return [...rest, { ...base, ...changes }];
      });
      if (changes.title_override !== undefined) {
        setRecent((existing) => existing.map((entry) =>
          entry.id === sessionId ? { ...entry, title: changes.title_override || entry.title } : entry,
        ));
      }
      if (changes.project_id !== undefined) {
        setRecent((existing) => existing.map((entry) =>
          entry.id === sessionId ? { ...entry, projectId: changes.project_id } : entry,
        ));
      }
      window.dispatchEvent(new Event('xroga-sidebar-chats-changed'));
      return true;
    } catch (err) {
      toast.error((err as Error).message || 'Could not save conversation changes.');
      return false;
    } finally {
      setBusyAction(false);
    }
  }

  async function togglePin() {
    const wasPinned = currentMeta?.pin_order != null;
    const highest = Math.max(0, ...metadata.map((entry) => entry.pin_order ?? 0));
    if (await persistMetadata({ pin_order: wasPinned ? null : highest + 1000 })) {
      toast.success(wasPinned ? 'Conversation unpinned' : 'Conversation pinned');
    }
  }

  function beginEditor(mode: 'rename' | 'project' | 'archive' | 'delete') {
    if (!canManage) return;
    setEditor(mode);
    setEditorText(mode === 'rename' ? activeTitle : '');
    if (mode === 'project' && accountId) {
      setProjectsLoading(true);
      void loadSidebarProjects(accountId, 0, 100)
        .then(setProjects)
        .catch(() => toast.error('Could not load your projects.'))
        .finally(() => setProjectsLoading(false));
    }
  }

  async function renameCurrent() {
    const newTitle = editorText.trim();
    if (!newTitle || newTitle.length > 120) {
      toast.error('Enter a conversation title between 1 and 120 characters.');
      return;
    }
    if (await persistMetadata({ title_override: newTitle })) {
      setEditor(null);
      toast.success('Conversation renamed');
    }
  }

  async function moveToProject(projectId: string | null) {
    if (await persistMetadata({ project_id: projectId, section_id: null }) && accountId) {
      if (projectId) activateSidebarProject(accountId, projectId);
      else clearActiveSidebarProject();
      setEditor(null);
      toast.success(projectId ? 'Conversation moved to project' : 'Conversation removed from project');
    }
  }

  async function archiveCurrent() {
    if (await persistMetadata({ archived_at: new Date().toISOString() })) {
      // Existing reset preserves the conversation, but archived metadata keeps it out of recents.
      startNewChat();
      closeMenu();
      toast.success('Conversation archived');
    }
  }

  async function deleteCurrent() {
    if (!accountId || !canManage || !currentEntry) return;
    setBusyAction(true);
    try {
      // The owner-scoped delete must succeed before clearing the visible transcript.
      if (currentEntry.source === 'repo') await api.terminalSessions.delete(sessionId);
      else await deleteSidebarChat(accountId, sessionId);
      await deleteSidebarMeta(accountId, 'conversation', sessionId);
      discardCurrentChat();
      removeTerminalHistoryEntry(sessionId);
      window.dispatchEvent(new Event('xroga-sidebar-chats-changed'));
      closeMenu();
      toast.success('Conversation permanently deleted');
    } catch (err) {
      toast.error((err as Error).message || 'Could not delete this conversation.');
    } finally {
      setBusyAction(false);
    }
  }

  return (
    <div className={styles.root} data-testid="workspace-conversation-menu">
      <button ref={anchorRef} type="button" className={styles.trigger}
        title={headerTitle}
        aria-label={`Conversation: ${headerTitle}. Open conversation actions`}
        aria-expanded={open} aria-haspopup="menu"
        onClick={() => setOpen((value) => !value)}>
        <span className={styles.title}>{headerTitle}</span>
        <ChevronDown size={15} aria-hidden="true" className={open ? styles.chevronOpen : styles.chevron} />
      </button>
      <AnchoredPortalPopover open={open} onClose={closeMenu} anchorRef={anchorRef}
        width={318} placement="bottom-start" ariaLabel="Conversation actions" className={styles.popover}>
        <div className={styles.actionPane}>
          {activeRepo ? <WorkspaceIdentityMenu embedded onAction={closeMenu} /> : null}
          <div className={styles.compactHeading}>
            <span className={styles.compactLabel} title={displayTitle}>Conversation actions</span>
            {accountId && currentEntry && messages.length && !fetching ? (
              <div className={styles.compactTools}>
                <button role="menuitem" type="button" title="Rename conversation" aria-label="Rename conversation"
                  className={styles.iconAction} disabled={!canManage}
                  onClick={() => beginEditor('rename')}><Pencil size={15} aria-hidden="true" /></button>
                <button role="menuitem" type="button" className={styles.iconAction}
                  title={currentMeta?.pin_order != null ? 'Unpin conversation' : 'Pin conversation'}
                  aria-label={currentMeta?.pin_order != null ? 'Unpin conversation' : 'Pin conversation'}
                  disabled={!canManage} onClick={() => void togglePin()}>
                  {currentMeta?.pin_order != null ? <PinOff size={15} aria-hidden="true" /> : <Pin size={15} aria-hidden="true" />}
                </button>
              </div>
            ) : null}
          </div>
          {!accountId ? (
            <p className={styles.actionHint}>Sign in to manage saved conversations.</p>
          ) : fetching ? (
            <p className={styles.actionHint}><Loader2 size={14} className={styles.loading} aria-hidden="true" /> Loading conversation actions…</p>
          ) : !currentEntry || !messages.length ? (
            <p className={styles.actionHint}>Open a saved conversation to rename, pin, move, archive or delete it.</p>
          ) : editor === 'rename' ? (
                  <form className={styles.inlineEditor} onSubmit={(event) => { event.preventDefault(); void renameCurrent(); }}>
                    <button className={styles.backButton} type="button" onClick={() => setEditor(null)}>
                      <ArrowLeft size={14} aria-hidden="true" /> Back
                    </button>
                    <label htmlFor="xv-conversation-rename" className={styles.contextLabel}>Rename conversation</label>
                    <input id="xv-conversation-rename" autoFocus value={editorText} maxLength={120}
                      onChange={(event) => setEditorText(event.target.value)} className={styles.editInput}
                      aria-label="Conversation title" />
                    <div className={styles.editorButtons}>
                      <button type="button" onClick={() => setEditor(null)} className={styles.cancelButton}>Cancel</button>
                      <button type="submit" className={styles.saveButton} disabled={busyAction || !editorText.trim()}>
                        {busyAction ? 'Saving…' : 'Save name'}
                      </button>
                    </div>
                  </form>
                ) : editor === 'project' ? (
                  <div className={styles.inlineEditor}>
                    <button type="button" className={styles.backButton} onClick={() => setEditor(null)}>
                      <ArrowLeft size={14} aria-hidden="true" /> Back
                    </button>
                    <label htmlFor="xv-conversation-project" className={styles.contextLabel}>Move to project</label>
                    <input id="xv-conversation-project" autoFocus value={editorText}
                      onChange={(event) => setEditorText(event.target.value)}
                      className={styles.editInput} placeholder="Search your projects" />
                    <div className={styles.projectList}>
                      <button type="button" className={styles.subAction} disabled={busyAction}
                        onClick={() => void moveToProject(null)}>
                        <FolderInput size={15} aria-hidden="true" /> No project
                        {!currentMeta?.project_id ? <Check size={14} className={styles.activeMark} aria-label="Selected" /> : null}
                      </button>
                      {projectsLoading ? <p className={styles.actionHint}>Loading projects…</p> :
                        projects.filter((project) => project.name.toLowerCase().includes(editorText.toLowerCase()))
                          .map((project) => (
                            <button type="button" key={project.id} disabled={busyAction}
                              className={styles.subAction} onClick={() => void moveToProject(project.id)}>
                              <FolderInput size={15} aria-hidden="true" />
                              <span className={styles.projectName}>{project.name}</span>
                              {currentMeta?.project_id === project.id ? <Check size={14} className={styles.activeMark} aria-label="Selected" /> : null}
                            </button>
                          ))}
                      {!projectsLoading && projects.length === 0 ?
                        <p className={styles.actionHint}>No saved projects found.</p> : null}
                    </div>
                  </div>
                ) : editor === 'archive' || editor === 'delete' ? (
                  <div className={styles.inlineEditor}>
                    <button type="button" className={styles.backButton} onClick={() => setEditor(null)}>
                      <ArrowLeft size={14} aria-hidden="true" /> Back
                    </button>
                    <strong className={styles.confirmTitle}>{editor === 'delete' ? 'Delete this conversation?' : 'Archive this conversation?'}</strong>
                    <p className={styles.actionHint}>
                      {editor === 'delete'
                        ? 'This permanently deletes its saved messages. This cannot be undone.'
                        : 'This removes the conversation from recent chats. You can restore it from your archive.'}
                    </p>
                    <div className={styles.editorButtons}>
                      <button type="button" onClick={() => setEditor(null)} className={styles.cancelButton}>Cancel</button>
                      <button type="button" disabled={busyAction} className={editor === 'delete' ? styles.dangerButton : styles.saveButton}
                        onClick={() => void (editor === 'delete' ? deleteCurrent() : archiveCurrent())}>
                        {busyAction ? 'Working…' : editor === 'delete' ? 'Delete permanently' : 'Archive'}
                      </button>
                    </div>
                  </div>
                ) : (
            <div className={styles.actionList}>
              <button role="menuitem" type="button" className={styles.subAction} disabled={!canManage}
                onClick={() => beginEditor('project')}><FolderInput size={15} aria-hidden="true" /> Move to project</button>
              <div className={styles.quickActions}>
                <button role="menuitem" type="button" className={styles.quickAction} disabled={!canManage}
                  title="Share private link" aria-label="Share private link"
                  onClick={() => void shareLink('share')}><Share2 size={15} aria-hidden="true" /><span>Share</span></button>
                <button role="menuitem" type="button" className={styles.quickAction} disabled={!canManage}
                  title="Copy link" aria-label="Copy link"
                  onClick={() => void shareLink('copy')}><Copy size={15} aria-hidden="true" /><span>Copy link</span></button>
                <button role="menuitem" type="button" className={styles.quickAction} disabled={!canManage}
                  title="Open in new tab" aria-label="Open in new tab"
                  onClick={() => void shareLink('open')}><ExternalLink size={15} aria-hidden="true" /><span>Open tab</span></button>
              </div>
              <div role="separator" className={styles.actionDivider} />
              <div className={styles.bottomActions}>
                <button role="menuitem" type="button" className={styles.subAction} disabled={!canManage}
                  onClick={() => beginEditor('archive')}><Archive size={15} aria-hidden="true" /> Archive</button>
                <button role="menuitem" type="button" className={`${styles.subAction} ${styles.dangerText}`} disabled={!canManage}
                  onClick={() => beginEditor('delete')}><Trash2 size={15} aria-hidden="true" /> Delete</button>
              </div>
            </div>
          )}
        </div>
      </AnchoredPortalPopover>
    </div>
  );
}
