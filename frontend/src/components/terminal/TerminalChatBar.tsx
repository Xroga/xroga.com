'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { useTerminalChat } from '@/context/TerminalChatContext';
import { usePrivacyStore } from '@/store/usePrivacyStore';
import { useHydrated } from '@/hooks/useHydrated';
import { useThemeStore } from '@/store/useThemeStore';
import { uploadChatImage, type ChatAttachment } from '@/lib/api';
import { IntegrationsModal } from './IntegrationsModal';
import { GithubRepoModal } from './GithubRepoModal';
import { RepoWorkspaceGateModal } from './RepoWorkspaceGateModal';
import { TalkButton } from '@/components/voice/TalkButton';
import { ChatbarShell } from '@/components/ui/Uiverse';
import {
  ChatBarDragOverlay,
  ChatBarInputRow,
  ChatBarToolChip,
  useSpeechToText,
} from './ChatBarParts';
import { ChatBarFileGrid } from './ChatBarFileGrid';
import type { SendButtonState } from './ChatBarButtons';
import { GitHubChipIcon, VercelChipIcon, ChatBarBrandChip } from './ChatBarButtons';
import { Search } from 'lucide-react';
import { ChatBarTip } from '@/components/ui/ChatBarTip';
import { autocorrectText } from '@/lib/chatSuggestions';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';
import toast from 'react-hot-toast';
import { checkRepoWorkspaceReady } from '@/lib/repoWorkspaceGate';
import { ensureSelectedRepoFolder } from '@/lib/repoSessionsIndex';
import { isGeneralAdviceOrKnowledgePrompt, isWebsiteBuildPrompt } from '@/lib/chatMemory';
import { shouldRouteToPhase1 } from '@/lib/phase1Routing';
import { requiresGitHubForBuild } from '@/lib/messageHelpers';

const MAX_ROWS = 13;
const LINE_HEIGHT = 20;
const MIN_INPUT_H = 36;

function renameFile(file: File, newName: string) {
  return new File([file], newName, { type: file.type, lastModified: file.lastModified });
}

export function TerminalChatBar() {
  const {
    prompt,
    setPrompt,
    loading,
    submit,
    stop,
  } = useTerminalChat();
  const hydrated = useHydrated();
  const incognitoRaw = usePrivacyStore((s) => s.incognito);
  const incognito = hydrated && incognitoRaw;
  const theme = useThemeStore((s) => s.theme);
  const darkUi = theme === 'black' || theme === 'gray';
  const fileRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const shellRef = useRef<HTMLDivElement>(null);
  /**
   * Cursor-style typing: local draft owns keystrokes so the swarm tree does not
   * re-render on every letter (that caused double characters / rewritten input).
   */
  const [draft, setDraft] = useState(prompt);
  const draftRef = useRef(draft);
  draftRef.current = draft;
  const composingRef = useRef(false);
  const lastExternalPrompt = useRef(prompt);

  // Sync only when parent injects a new prompt (prefill / clear) — never while typing
  useEffect(() => {
    if (prompt === lastExternalPrompt.current) return;
    lastExternalPrompt.current = prompt;
    if (prompt !== draftRef.current) {
      setDraft(prompt);
      draftRef.current = prompt;
    }
  }, [prompt]);
  const [integrationsOpen, setIntegrationsOpen] = useState(false);
  const [githubOpen, setGithubOpen] = useState(false);
  const [githubConnected, setGithubConnected] = useState(false);
  const [vercelConnected, setVercelConnected] = useState(false);
  const [files, setFiles] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [listening, setListening] = useState(false);
  const [sendState, setSendState] = useState<SendButtonState>('idle');
  const [repoGate, setRepoGate] = useState<{
    open: boolean;
    reason: 'not_connected' | 'no_repo_selected';
    message: string;
  }>({ open: false, reason: 'not_connected', message: '' });

  useEffect(() => {
    if (loading) setSendState('thinking');
    else if (sendState === 'thinking') setSendState('launched');
  }, [loading, sendState]);

  useEffect(() => {
    if (sendState !== 'launched') return;
    const t = setTimeout(() => setSendState('idle'), 1400);
    return () => clearTimeout(t);
  }, [sendState]);

  useEffect(() => {
    void api.github
      .status()
      .then((s) => setGithubConnected(s.connected))
      .catch(() => setGithubConnected(false));
    void api.vercel
      .status()
      .then((s) => setVercelConnected(s.connected))
      .catch(() => setVercelConnected(false));
  }, []);

  // Sidebar "New Terminal" → clear repo, open chatbar picker (do NOT auto-select)
  useEffect(() => {
    const onNewTerminal = () => {
      if (incognito) return;
      void (async () => {
        const { clearSelectedRepoContext, markFreshTerminalIntent } = await import('@/lib/repoContext');
        const {
          notifyOpenRepoPicker,
          notifyRepoContextCleared,
        } = await import('@/lib/githubProjectEvents');
        markFreshTerminalIntent();
        clearSelectedRepoContext();
        notifyRepoContextCleared();
        try {
          const ghStatus = await api.github.status();
          setGithubConnected(ghStatus.connected);
          if (!ghStatus.connected) {
            setRepoGate({
              open: true,
              reason: 'not_connected',
              message:
                'Connect GitHub first, then select a repository in the chat bar to start #1 terminal.',
            });
            return;
          }
          // Prefer sticky default from first ship so New Terminal still updates the live product.
          // User can switch repos in the bar when they want a brand-new product.
          if (ghStatus.defaultRepo?.includes('/')) {
            const { saveSelectedRepoContext } = await import('@/lib/repoContext');
            const { notifyGithubRepoContext } = await import('@/lib/githubProjectEvents');
            saveSelectedRepoContext({ repo: ghStatus.defaultRepo, branch: 'main' });
            notifyGithubRepoContext(ghStatus.defaultRepo, 'main');
            return;
          }
        } catch {
          setRepoGate({
            open: true,
            reason: 'not_connected',
            message: 'Connect GitHub first so you can select a repository.',
          });
          return;
        }
        // First-time: open picker so they pick once
        notifyOpenRepoPicker();
      })();
    };
    window.addEventListener('xroga-request-new-terminal', onNewTerminal);
    return () => window.removeEventListener('xroga-request-new-terminal', onNewTerminal);
  }, [incognito]);

  async function ensureRepoWorkspace(promptText?: string): Promise<boolean> {
    if (incognito) return true;
    // Sandbox website/landing/chatbot/crypto builds must not be blocked by a flaky GitHub status
    // when the user already selected a repo in the footer (or when building a simple site).
    const p = (promptText || draftRef.current || prompt || '').trim();
    // Advice / Q&A / research must never be blocked by the Connect-GitHub modal
    if (
      p &&
      (isGeneralAdviceOrKnowledgePrompt(p) ||
        shouldRouteToPhase1(p, [], undefined, { completedWebsiteBuild: false }))
    ) {
      return true;
    }
    if (p && (isWebsiteBuildPrompt(p) || requiresGitHubForBuild(p))) {
      const selected = (await import('@/lib/repoContext')).getSelectedRepoContext();
      if (selected?.repo?.includes('/')) {
        ensureSelectedRepoFolder();
        setGithubConnected(true);
        return true;
      }
    }
    // Auto-bind sticky default_repo from first ship when nothing is selected yet.
    try {
      const status = await api.github.status();
      setGithubConnected(status.connected);
      if (status.connected && status.defaultRepo?.includes('/')) {
        const selected = (await import('@/lib/repoContext')).getSelectedRepoContext();
        if (!selected?.repo?.includes('/')) {
          const { saveSelectedRepoContext } = await import('@/lib/repoContext');
          const { notifyGithubRepoContext } = await import('@/lib/githubProjectEvents');
          saveSelectedRepoContext({ repo: status.defaultRepo, branch: 'main' });
          notifyGithubRepoContext(status.defaultRepo, 'main');
        }
      }
    } catch {
      /* gate will handle */
    }
    const ready = await checkRepoWorkspaceReady();
    if (ready.ok) {
      ensureSelectedRepoFolder();
      return true;
    }
    // Website builds can run in sandbox without GitHub — never brick the user on Connect modal
    if (p && (isWebsiteBuildPrompt(p) || requiresGitHubForBuild(p))) {
      console.warn('[TerminalChatBar] allowing sandbox build without repo gate');
      return true;
    }
    if (ready.reason === 'no_repo_selected') {
      const { notifyOpenRepoPicker } = await import('@/lib/githubProjectEvents');
      notifyOpenRepoPicker();
    }
    setRepoGate({ open: true, reason: ready.reason, message: ready.message });
    return false;
  }

  async function handleSubmit(e: React.FormEvent, interrupt = false) {
    e.preventDefault();
    if (composingRef.current) return;
    const raw = (textareaRef.current?.value ?? draft).trim();
    const text = autocorrectText(raw);
    if (!text && files.length === 0) return;
    setDraft(text);
    draftRef.current = text;
    setPrompt(text);
    lastExternalPrompt.current = text;

    if (!(await ensureRepoWorkspace(text))) {
      setSendState('idle');
      return;
    }

    if (loading && !interrupt) {
      await submit(text, false, false);
      return;
    }

    if (loading && interrupt) {
      setSendState('sending');
      await submit(text, false, true);
      if (!loading) setSendState('launched');
      return;
    }

    setSendState('sending');

    let attachments: ChatAttachment[] | undefined;
    const uploadable = files.filter(
      (f) =>
        f.type.startsWith('image/') ||
        f.type === 'application/pdf' ||
        f.type.startsWith('text/') ||
        /json|markdown|csv|msword|officedocument/i.test(f.type) ||
        /\.(png|jpe?g|webp|gif|pdf|txt|md|csv|json|docx)$/i.test(f.name),
    );
    if (uploadable.length > 0) {
      setUploading(true);
      try {
        const { uploadChatFile } = await import('@/lib/api');
        attachments = await Promise.all(
          uploadable.slice(0, 4).map(async (f) => ({
            url: await uploadChatFile(f),
            mimeType: f.type || undefined,
            name: f.name,
          }))
        );
        setFiles([]);
      } catch {
        toast.error('Upload failed — try a smaller file');
        setUploading(false);
        setSendState('idle');
        return;
      }
      setUploading(false);
    }

    const hasAttach = Boolean(attachments?.length);
    const promptText =
      text ||
      (hasAttach
        ? (await import('@/lib/parseImageContent')).defaultAttachmentPrompt('', uploadable)
        : undefined);

    setDraft('');
    draftRef.current = '';
    lastExternalPrompt.current = '';
    setPrompt('');
    await submit(promptText, false, false, attachments);
    if (!loading) setSendState('launched');
  }

  async function applyStyleFromFile(file: File, stylePrompt: string) {
    if (!(await ensureRepoWorkspace(stylePrompt))) return;
    setUploading(true);
    try {
      const url = await uploadChatImage(file);
      const text =
        stylePrompt.trim() ||
        'Transform this image with a modern cinematic look while keeping the same subject';
      setFiles([]);
      setPrompt('');
      await submit(text, false, false, [{ url, mimeType: file.type, name: file.name }]);
    } catch {
      toast.error('Could not upload image for style transfer');
    } finally {
      setUploading(false);
    }
  }

  /** Baseline prompt before the current mic session — speech replaces after baseline. */
  const speechBaseRef = useRef('');
  const speechActiveRef = useRef(false);
  const applySpeech = useCallback((transcript: string) => {
    if (!speechActiveRef.current) {
      speechBaseRef.current = draftRef.current;
      speechActiveRef.current = true;
    }
    const base = speechBaseRef.current.trim();
    const next = transcript.trim();
    const merged = base && next ? `${base} ${next}` : next || base;
    setDraft(merged);
    draftRef.current = merged;
  }, []);
  const speech = useSpeechToText(applySpeech);

  const addFiles = useCallback((list: FileList | null) => {
    if (!list?.length) return;
    const incoming = Array.from(list).filter(
      (f) =>
        f.type.startsWith('image/') ||
        f.type === 'application/pdf' ||
        f.type.startsWith('text/') ||
        /json|markdown|csv|msword|officedocument/i.test(f.type) ||
        /\.(png|jpe?g|webp|gif|pdf|txt|md|csv|json|docx)$/i.test(f.name),
    );
    if (!incoming.length) {
      toast.error('Supported: images, PDF, TXT, MD, CSV, JSON, DOCX');
      return;
    }
    setFiles((prev) => [...prev, ...incoming].slice(0, 4));
  }, []);

  const handlePaste = useCallback(
    (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
      if (incognito) return;
      const items = e.clipboardData?.items;
      if (!items?.length) return;

      const imageFiles: File[] = [];
      for (let i = 0; i < items.length; i += 1) {
        const item = items[i];
        if (item?.kind === 'file' && item.type.startsWith('image/')) {
          const file = item.getAsFile();
          if (file) imageFiles.push(file);
        }
      }

      if (imageFiles.length > 0) {
        e.preventDefault();
        const dt = new DataTransfer();
        imageFiles.forEach((f) => dt.items.add(f));
        addFiles(dt.files);
        toast.success(imageFiles.length === 1 ? 'Image pasted' : `${imageFiles.length} images pasted`);
      }
    },
    [addFiles, incognito]
  );

  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    const maxH = LINE_HEIGHT * MAX_ROWS;
    const nextH = Math.max(MIN_INPUT_H, Math.min(el.scrollHeight, maxH));
    el.style.height = `${nextH}px`;
  }, [draft]);

  useEffect(() => {
    const el = shellRef.current;
    if (!el) return;
    const sync = () => {
      document.documentElement.style.setProperty('--xv-chatbar-height', `${el.offsetHeight}px`);
    };
    sync();
    const ro = new ResizeObserver(sync);
    ro.observe(el);
    return () => ro.disconnect();
  }, [files.length, draft]);

  return (
    <>
      <IntegrationsModal open={integrationsOpen} onClose={() => setIntegrationsOpen(false)} />
      <GithubRepoModal
        open={githubOpen}
        onClose={() => setGithubOpen(false)}
        onSelect={(t) => {
          const next = draftRef.current + (draftRef.current ? '\n' : '') + t;
          setDraft(next);
          draftRef.current = next;
        }}
      />
      <RepoWorkspaceGateModal
        open={repoGate.open}
        reason={repoGate.reason}
        message={repoGate.message}
        onClose={() => setRepoGate((g) => ({ ...g, open: false }))}
        onReady={() => {
          setRepoGate((g) => ({ ...g, open: false }));
          void api.github
            .status()
            .then((s) => setGithubConnected(s.connected))
            .catch(() => {});
          ensureSelectedRepoFolder();
        }}
      />
      <div className="relative">
        <ChatbarShell
          ref={shellRef}
          className={cn(
            'relative',
            incognito && 'xv-chatbar-incognito',
            (dragOver || uploading) && !incognito && 'ring-2 ring-[var(--accent)]/40'
          )}
          onDragOver={(e: React.DragEvent) => {
            if (incognito) return;
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => !incognito && setDragOver(false)}
          onDrop={(e: React.DragEvent) => {
            if (incognito) return;
            e.preventDefault();
            setDragOver(false);
            addFiles(e.dataTransfer.files);
          }}
        >
          <ChatBarDragOverlay active={!incognito && dragOver} />

          {!incognito && (
          <div className="xv-chatbar-toolbar flex items-center gap-1 px-2 sm:px-2.5 py-0.5 sm:py-1 overflow-x-auto scrollbar-hide flex-nowrap">
            <ChatBarTip label="Search integrations" className="shrink-0">
              <ChatBarToolChip
                icon={<Search className="w-3.5 h-3.5" />}
                label="Integrations"
                onClick={() => setIntegrationsOpen(true)}
                accent="#006aff"
              />
            </ChatBarTip>
            <ChatBarTip label="GitHub repos" className="shrink-0">
              <span className="inline-flex shrink-0 lg:hidden">
                <ChatBarBrandChip variant="github" label="GitHub" onClick={() => setGithubOpen(true)} plain darkUi={darkUi} connected={githubConnected} />
              </span>
              <span className="hidden lg:inline-flex shrink-0">
                <ChatBarToolChip
                  icon={<GitHubChipIcon />}
                  label="GitHub"
                  onClick={() => setGithubOpen(true)}
                  accent="#24292f"
                  connected={githubConnected}
                />
              </span>
            </ChatBarTip>
            <ChatBarTip label="Vercel" className="shrink-0">
              <span className="inline-flex shrink-0 lg:hidden">
                <ChatBarBrandChip variant="vercel" label="Vercel" onClick={() => setIntegrationsOpen(true)} plain darkUi={darkUi} connected={vercelConnected} />
              </span>
              <span className="hidden lg:inline-flex shrink-0">
                <ChatBarToolChip
                  icon={<VercelChipIcon />}
                  label="Vercel"
                  onClick={() => setIntegrationsOpen(true)}
                  accent="#000"
                  connected={vercelConnected}
                />
              </span>
            </ChatBarTip>
            <div className="flex-1 min-w-[2px]" />
          </div>
          )}

          {!incognito && (
          <ChatBarFileGrid
            files={files}
            onRemove={(i) => setFiles((prev) => prev.filter((_, j) => j !== i))}
            onRename={(i, name) =>
              setFiles((prev) => prev.map((f, j) => (j === i ? renameFile(f, name) : f)))
            }
            onApplyStyle={(file, stylePrompt) => void applyStyleFromFile(file, stylePrompt)}
          />
          )}

          <form onSubmit={handleSubmit} className="px-2 sm:px-2.5 py-1 sm:py-1.5 xv-chatbar-input-form">
            <ChatBarInputRow
              uploading={uploading}
              onUploadClick={() => fileRef.current?.click()}
              listening={listening}
              hideUpload={incognito}
              surface={incognito ? 'incognito' : 'dashboard'}
              compactGo={!!draft.trim()}
              talkSlot={incognito ? undefined : <TalkButton variant="inline" />}
              onMicToggle={() => {
                if (!speech.supported) {
                  toast.error('Voice input not supported in this browser');
                  return;
                }
                if (listening) {
                  speechActiveRef.current = false;
                } else {
                  speechBaseRef.current = draftRef.current;
                  speechActiveRef.current = true;
                }
                speech.toggle(listening, setListening);
              }}
              micDisabled={!speech.supported}
              sendState={sendState}
              stopping={loading}
              onStop={() => {
                stop();
                setSendState('idle');
              }}
            >
              {!incognito && (
                <span className="absolute left-2 bottom-2 text-sm font-terminal text-[var(--foreground)] opacity-50 z-10">
                  &gt;
                </span>
              )}
              <textarea
                ref={textareaRef}
                value={draft}
                onChange={(e) => {
                  speechActiveRef.current = false;
                  const next = e.target.value;
                  setDraft(next);
                  draftRef.current = next;
                }}
                onCompositionStart={() => {
                  composingRef.current = true;
                }}
                onCompositionEnd={(e) => {
                  composingRef.current = false;
                  const next = e.currentTarget.value;
                  setDraft(next);
                  draftRef.current = next;
                }}
                onPaste={handlePaste}
                onKeyDown={(e) => {
                  if (composingRef.current || (e.nativeEvent as KeyboardEvent).isComposing) return;
                  if (e.key === 'Enter' && e.shiftKey) {
                    e.preventDefault();
                    if (draftRef.current.trim()) void handleSubmit(e, true);
                    return;
                  }
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    void handleSubmit(e, false);
                  }
                }}
                placeholder={incognito ? 'Type a private message…' : 'Xroga AI do everything..'}
                rows={1}
                spellCheck={false}
                autoCorrect="off"
                autoCapitalize="off"
                className={cn(
                  'w-full pr-2 py-1.5 rounded-xl resize-none max-h-[260px] min-h-[40px]',
                  incognito ? 'pl-3 text-white placeholder:text-white/45' : 'pl-6 text-[var(--foreground)] placeholder:text-[var(--muted)]',
                  'bg-transparent focus:outline-none text-sm font-terminal leading-[20px]',
                  !loading && !draft && 'cursor-blink'
                )}
              />
            </ChatBarInputRow>
            <input
              ref={fileRef}
              type="file"
              accept="image/*,.pdf,.txt,.md,.csv,.json,.docx,application/pdf,text/plain,text/markdown,text/csv,application/json,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
              multiple
              className="hidden"
              onChange={(e) => addFiles(e.target.files)}
              disabled={incognito}
            />
          </form>
        </ChatbarShell>
      </div>
    </>
  );
}
