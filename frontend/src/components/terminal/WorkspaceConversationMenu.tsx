'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Archive, ArrowLeft, Check, ChevronDown, ChevronRight, Copy, ExternalLink, FolderInput, Link2, Loader2, MessageSquareText, Pencil, Pin, PinOff, Plus, Search, Share2, Trash2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { useTerminalChat } from '@/context/TerminalChatContext';
import { useWorkspaceIdentity } from '@/components/layout/WorkspaceIdentityContext';
import { AnchoredPortalPopover } from '@/components/ui/AnchoredPortalPopover';
import { meaningfulSidebarTitle, loadSidebarChats, loadSidebarChatById, loadSidebarMeta, loadSidebarProjects, changeSidebarMeta, deleteSidebarChat, deleteSidebarMeta, type SidebarMeta, type SidebarProject } from '@/lib/sidebarOrganization';
import { listCloudTerminalSessions, loadCloudTerminalSession } from '@/lib/cloudTerminalSessions';
import { removeTerminalHistoryEntry } from '@/lib/terminalHistory';
import { api } from '@/lib/api';
import { clearSelectedRepoContext, saveSelectedRepoContext } from '@/lib/repoContext';
import { notifyGithubRepoContext } from '@/lib/githubProjectEvents';
import { activateSidebarProject, clearActiveSidebarProject } from '@/lib/sidebarProjectTask';
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
  const { sessionId, messages, loading, sessionRestoring, startNewChat, discardCurrentChat, restoreTerminalSession } = useTerminalChat();
  const accountId = status === 'authenticated' ? userId : undefined;
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [recent, setRecent] = useState<RecentConversation[]>([]);
  const [fetching, setFetching] = useState(false);
  const [switchingId, setSwitchingId] = useState<string | null>(null);
  const [error, setError] = useState(false);
  const [metadata, setMetadata] = useState<SidebarMeta[]>([]);
  const [tab, setTab] = useState<'chats' | 'actions'>('chats');
  const [expandedGroup, setExpandedGroup] = useState<'share' | 'organize' | 'more' | null>(null);
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
  const canManage = Boolean(accountId && currentEntry && messages.length && !loading && !sessionRestoring && !busyAction);
  const savedCurrentTitle = currentEntry?.title;
  const activeTitle = firstUserPrompt
    ? meaningfulSidebarTitle(savedCurrentTitle, firstUserPrompt)
    : 'New chat';
  const displayTitle = sessionRestoring ? 'Opening conversation…' : activeTitle;

  const closeMenu = useCallback(() => {
    setOpen(false);
    setQuery('');
    setTab('chats');
    setExpandedGroup(null);
    setEditor(null);
    setEditorText('');
  }, []);

  useEffect(() => {
    // Never reveal another account's loaded titles during an auth transition.
    setRecent([]);
    setMetadata([]);
    setProjects([]);
    setTab('chats');
    setExpandedGroup(null);
    setEditor(null);
    setError(false);
    setOpen(false);
    requestIdRef.current += 1;
  }, [accountId]);

  useEffect(() => {
    if (!open || !accountId) return;
    let cancelled = false;
    const currentRequest = ++requestIdRef.current;
    setFetching(true);
    setError(false);
    void Promise.allSettled([
      loadSidebarChats(accountId, 0, 60),
      listCloudTerminalSessions(undefined, { limit: 80, offset: 0 }),
      loadSidebarMeta(accountId),
    ]).then(([chatsResult, reposResult, metaResult]) => {
      if (cancelled || currentRequest !== requestIdRef.current) return;
      const chats = chatsResult.status === 'fulfilled' ? chatsResult.value : [];
      const repos = reposResult.status === 'fulfilled' ? reposResult.value : [];
      const metadata = metaResult.status === 'fulfilled' ? metaResult.value : [];
      setMetadata(metadata);
      setError(chatsResult.status === 'rejected' && repos.length === 0);
      const meta = new Map(metadata.filter((item) => item.item_type === 'conversation').map((item) => [item.item_id, item]));
      const merged = new Map<string, RecentConversation>();

      for (const chat of chats) {
        if (!chat.id || chat.message_count < 1 || meta.get(chat.id)?.archived_at) continue;
        const info = meta.get(chat.id);
        merged.set(chat.id, {
          id: chat.id,
          title: meaningfulSidebarTitle(info?.title_override || chat.title, chat.prompt || chat.preview),
          preview: chat.preview || chat.prompt || '',
          updatedAt: chat.updated_at,
          source: 'chat',
          projectId: info?.project_id,
        });
      }
      for (const repo of repos) {
        if (!repo.id || repo.messageCount < 1 || meta.get(repo.id)?.archived_at) continue;
        const info = meta.get(repo.id);
        merged.set(repo.id, {
          id: repo.id,
          title: meaningfulSidebarTitle(info?.title_override || repo.title, repo.preview),
          preview: repo.preview || '',
          updatedAt: repo.updatedAt,
          source: 'repo',
          repo: repo.githubRepoName,
          branch: repo.githubBranch,
          projectId: info?.project_id,
        });
      }
      const sorted = [...merged.values()].sort((a, b) =>
        (Date.parse(b.updatedAt) || 0) - (Date.parse(a.updatedAt) || 0),
      );
      const visible = sorted.slice(0, 50);
      const current = merged.get(sessionId);
      if (current && !visible.some((item) => item.id === sessionId)) visible.push(current);
      setRecent(visible);
    }).finally(() => {
      if (!cancelled && currentRequest === requestIdRef.current) setFetching(false);
    });
    return () => { cancelled = true; };
  }, [open, accountId, sessionId]);

  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return recent.slice(0, 20);
    return recent.filter((entry) =>
      (entry.title + ' ' + entry.preview).toLowerCase().includes(normalized),
    ).slice(0, 20);
  }, [query, recent]);

  async function selectConversation(entry: RecentConversation) {
    if (!accountId || switchingId) return;
    if (entry.id === sessionId && messages.length) { closeMenu(); return; }
    setSwitchingId(entry.id);
    try {
      // Each record was returned by a user-scoped list. Fetch the actual
      // transcript again from its owner-verified backend, never localStorage.
      const full = entry.source === 'repo'
        ? await loadCloudTerminalSession(entry.id)
        : await loadSidebarChatById(accountId, entry.id);
      if (!full?.messages?.length) {
        toast.error('This conversation has no saved messages to restore.');
        return;
      }

      if (full.githubRepoName?.includes('/')) {
        saveSelectedRepoContext({
          repo: full.githubRepoName,
          branch: full.githubBranch || 'main',
          projectRoot: full.projectRoot || '/',
        });
        notifyGithubRepoContext(full.githubRepoName, full.githubBranch || 'main');
      } else {
        clearSelectedRepoContext();
      }
      if (entry.projectId) activateSidebarProject(accountId, entry.projectId);
      else clearActiveSidebarProject();

      await restoreTerminalSession({
        sessionId: full.id,
        prompt: full.prompt,
        messages: full.messages,
        selectedId: full.id,
        selectedLabel: entry.title,
        source: 'projects',
        jumpMessageId: full.messages[full.messages.length - 1]?.id,
        githubRepoName: full.githubRepoName,
      });
      closeMenu();
    } catch {
      toast.error('Could not open this conversation. Please try again.');
    } finally {
      setSwitchingId(null);
    }
  }

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
    setExpandedGroup(null);
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

  const toggleGroup = (group: 'share' | 'organize' | 'more') =>
    setExpandedGroup((previous) => previous === group ? null : group);

  return (
    <div className={styles.root} data-testid="workspace-conversation-menu">
      <button
        ref={anchorRef}
        type="button"
        className={styles.trigger}
        title={displayTitle}
        aria-label={`Conversation: ${displayTitle}. Open recent chats`}
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={() => setOpen((value) => !value)}
      >
        <span className={styles.title}>{displayTitle}</span>
        <ChevronDown size={15} aria-hidden="true" className={open ? styles.chevronOpen : styles.chevron} />
      </button>

      <AnchoredPortalPopover
        open={open}
        onClose={closeMenu}
        anchorRef={anchorRef}
        width={345}
        placement="bottom-start"
        ariaLabel="Recent conversations"
        className={styles.popover}
      >
        <div className={styles.topRow}>
          <span className={styles.menuHeading}>Conversations</span>
          <button type="button" className={styles.newChat} role="menuitem"
            onClick={() => { startNewChat(); closeMenu(); }} aria-label="New chat" title="New chat">
            <Plus size={16} aria-hidden="true" /> New chat
          </button>
        </div>
        {accountId ? (
          <>
            <div className={styles.tabs} role="tablist" aria-label="Conversation menu views">
              <button type="button" role="tab" aria-selected={tab === 'chats'}
                className={tab === 'chats' ? `${styles.tab} ${styles.tabActive}` : styles.tab}
                onClick={() => { setTab('chats'); setEditor(null); setExpandedGroup(null); }}>
                <MessageSquareText size={14} aria-hidden="true" /> Chats
              </button>
              <button type="button" role="tab" aria-selected={tab === 'actions'}
                className={tab === 'actions' ? `${styles.tab} ${styles.tabActive}` : styles.tab}
                onClick={() => { setTab('actions'); setEditor(null); setExpandedGroup(null); }}>
                <ChevronDown size={14} aria-hidden="true" /> Actions
              </button>
            </div>
            {tab === 'chats' ? (
              <div role="tabpanel" aria-label="Recent chats">
                <label className={styles.searchBox}>
                  <Search size={15} aria-hidden="true" />
                  <input value={query} onChange={(event) => setQuery(event.target.value)}
                    type="search" placeholder="Search recent chats" aria-label="Search recent chats"
                    autoComplete="off" />
                </label>
                <div className={styles.sectionHeading}>Recent</div>
                <div className={styles.list}>
                  {fetching ? (
                    <div className={styles.empty}><Loader2 size={16} className={styles.loading} /> Loading conversations…</div>
                  ) : filtered.length ? filtered.map((entry) => (
                    <button type="button" role="menuitem" key={entry.id}
                      className={entry.id === sessionId ? `${styles.item} ${styles.selected}` : styles.item}
                      disabled={Boolean(switchingId) || loading || sessionRestoring || busyAction}
                      title={entry.title} onClick={() => void selectConversation(entry)}>
                      <MessageSquareText size={16} className={styles.chatIcon} aria-hidden="true" />
                      <span className={styles.itemText}>
                        <span className={styles.itemTitle}>{entry.title}</span>
                        {entry.repo ? <span className={styles.itemSubtitle}>{entry.repo}</span> : null}
                      </span>
                      {switchingId === entry.id ? <Loader2 size={15} className={styles.loading} aria-hidden="true" /> :
                        entry.id === sessionId ? <Check size={15} className={styles.activeMark} aria-label="Current conversation" /> : null}
                    </button>
                  )) : (
                    <div className={styles.empty}>
                      {error ? 'Could not load recent chats.' : query ? 'No matching conversations.' : 'No saved conversations yet.'}
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div role="tabpanel" aria-label="Current conversation actions" className={styles.actionPane}>
                <div className={styles.actionContext}>
                  <span className={styles.contextLabel}>Current conversation</span>
                  <span className={styles.contextTitle}>{displayTitle}</span>
                </div>
                {!currentEntry || !messages.length ? (
                  <p className={styles.actionHint}>Start or open a saved conversation to manage it.</p>
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
                  <div className={styles.groupStack}>
                    <button type="button" className={styles.groupButton} disabled={!canManage}
                      aria-expanded={expandedGroup === 'share'} onClick={() => toggleGroup('share')}>
                      <Share2 size={16} aria-hidden="true" /><span>Share & links</span>
                      <ChevronRight size={15} aria-hidden="true" className={expandedGroup === 'share' ? styles.groupChevronOpen : styles.groupChevron} />
                    </button>
                    {expandedGroup === 'share' ? <div className={styles.groupItems}>
                      <button type="button" className={styles.subAction} disabled={busyAction} onClick={() => void shareLink('share')}>
                        <Link2 size={15} aria-hidden="true" /> Share private link
                      </button>
                      <button type="button" className={styles.subAction} disabled={busyAction} onClick={() => void shareLink('copy')}>
                        <Copy size={15} aria-hidden="true" /> Copy link
                      </button>
                      <button type="button" className={styles.subAction} disabled={busyAction} onClick={() => void shareLink('open')}>
                        <ExternalLink size={15} aria-hidden="true" /> Open in new tab
                      </button>
                      <p className={styles.groupNote}>Links require your signed-in account.</p>
                    </div> : null}

                    <button type="button" className={styles.groupButton} disabled={!canManage}
                      aria-expanded={expandedGroup === 'organize'} onClick={() => toggleGroup('organize')}>
                      <FolderInput size={16} aria-hidden="true" /><span>Organize</span>
                      <ChevronRight size={15} aria-hidden="true" className={expandedGroup === 'organize' ? styles.groupChevronOpen : styles.groupChevron} />
                    </button>
                    {expandedGroup === 'organize' ? <div className={styles.groupItems}>
                      <button type="button" className={styles.subAction} disabled={busyAction} onClick={() => beginEditor('rename')}>
                        <Pencil size={15} aria-hidden="true" /> Rename
                      </button>
                      <button type="button" className={styles.subAction} disabled={busyAction} onClick={() => void togglePin()}>
                        {currentMeta?.pin_order != null ? <PinOff size={15} aria-hidden="true" /> : <Pin size={15} aria-hidden="true" />}
                        {currentMeta?.pin_order != null ? 'Unpin' : 'Pin'}
                      </button>
                      <button type="button" className={styles.subAction} disabled={busyAction} onClick={() => beginEditor('project')}>
                        <FolderInput size={15} aria-hidden="true" /> Move to project
                      </button>
                    </div> : null}

                    <button type="button" className={styles.groupButton} disabled={!canManage}
                      aria-expanded={expandedGroup === 'more'} onClick={() => toggleGroup('more')}>
                      <Archive size={16} aria-hidden="true" /><span>More</span>
                      <ChevronRight size={15} aria-hidden="true" className={expandedGroup === 'more' ? styles.groupChevronOpen : styles.groupChevron} />
                    </button>
                    {expandedGroup === 'more' ? <div className={styles.groupItems}>
                      <button type="button" className={styles.subAction} disabled={busyAction} onClick={() => beginEditor('archive')}>
                        <Archive size={15} aria-hidden="true" /> Archive
                      </button>
                      <button type="button" className={`${styles.subAction} ${styles.dangerText}`}
                        disabled={busyAction} onClick={() => beginEditor('delete')}>
                        <Trash2 size={15} aria-hidden="true" /> Delete
                      </button>
                    </div> : null}
                  </div>
                )}
              </div>
            )}
          </>
        ) : <div className={styles.empty}>Sign in to access your saved conversations.</div>}
      </AnchoredPortalPopover>
    </div>
  );
}
