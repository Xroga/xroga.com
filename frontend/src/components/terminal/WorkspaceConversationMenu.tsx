'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Check, ChevronDown, Loader2, MessageSquareText, Plus, Search } from 'lucide-react';
import toast from 'react-hot-toast';
import { useTerminalChat } from '@/context/TerminalChatContext';
import { useWorkspaceIdentity } from '@/components/layout/WorkspaceIdentityContext';
import { AnchoredPortalPopover } from '@/components/ui/AnchoredPortalPopover';
import { meaningfulSidebarTitle, loadSidebarChats, loadSidebarChatById, loadSidebarMeta } from '@/lib/sidebarOrganization';
import { listCloudTerminalSessions, loadCloudTerminalSession } from '@/lib/cloudTerminalSessions';
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
  const { sessionId, messages, loading, sessionRestoring, startNewChat, restoreTerminalSession } = useTerminalChat();
  const accountId = status === 'authenticated' ? userId : undefined;
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [recent, setRecent] = useState<RecentConversation[]>([]);
  const [fetching, setFetching] = useState(false);
  const [switchingId, setSwitchingId] = useState<string | null>(null);
  const [error, setError] = useState(false);
  const anchorRef = useRef<HTMLButtonElement>(null);
  const requestIdRef = useRef(0);

  const firstUserPrompt = useMemo(
    () => messages.find((message) => message.role === 'user')?.content || '',
    [messages],
  );
  const savedCurrentTitle = recent.find((entry) => entry.id === sessionId)?.title;
  const activeTitle = firstUserPrompt
    ? meaningfulSidebarTitle(savedCurrentTitle, firstUserPrompt)
    : 'New chat';
  const displayTitle = sessionRestoring ? 'Opening conversation…' : activeTitle;

  const closeMenu = useCallback(() => {
    setOpen(false);
    setQuery('');
  }, []);

  useEffect(() => {
    // Never reveal another account's loaded titles during an auth transition.
    setRecent([]);
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
      setRecent([...merged.values()].sort((a, b) =>
        (Date.parse(b.updatedAt) || 0) - (Date.parse(a.updatedAt) || 0),
      ).slice(0, 50));
    }).finally(() => {
      if (!cancelled && currentRequest === requestIdRef.current) setFetching(false);
    });
    return () => { cancelled = true; };
  }, [open, accountId]);

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
          <button
            type="button"
            className={styles.newChat}
            role="menuitem"
            onClick={() => { startNewChat(); closeMenu(); }}
            aria-label="New chat"
            title="New chat"
          >
            <Plus size={16} aria-hidden="true" /> New chat
          </button>
        </div>
        {accountId ? (
          <>
            <label className={styles.searchBox}>
              <Search size={15} aria-hidden="true" />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                type="search"
                placeholder="Search recent chats"
                aria-label="Search recent chats"
                autoComplete="off"
              />
            </label>
            <div className={styles.sectionHeading}>Recent</div>
            <div className={styles.list}>
              {fetching ? (
                <div className={styles.empty}><Loader2 size={16} className={styles.loading} /> Loading conversations…</div>
              ) : filtered.length ? filtered.map((entry) => (
                <button
                  type="button"
                  role="menuitem"
                  key={entry.id}
                  className={entry.id === sessionId ? `${styles.item} ${styles.selected}` : styles.item}
                  disabled={Boolean(switchingId) || loading || sessionRestoring}
                  title={entry.title}
                  onClick={() => void selectConversation(entry)}
                >
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
          </>
        ) : <div className={styles.empty}>Sign in to access your saved conversations.</div>}
      </AnchoredPortalPopover>
    </div>
  );
}
