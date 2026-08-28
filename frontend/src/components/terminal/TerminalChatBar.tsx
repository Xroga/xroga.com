'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { useTerminalChat } from '@/context/TerminalChatContext';
import { ChatBarActionsMenu } from './ChatBarActionsMenu';
import { buildComposerPreamble, useComposerToolsStore } from '@/store/useComposerToolsStore';
import { usePrivacyStore } from '@/store/usePrivacyStore';
import { useHydrated } from '@/hooks/useHydrated';
import { uploadChatImage, type ChatAttachment } from '@/lib/api';
import { IntegrationsModal } from './IntegrationsModal';
import { GithubRepoModal } from './GithubRepoModal';
import { RepoWorkspaceGateModal } from './RepoWorkspaceGateModal';
import { ChatbarShell } from '@/components/ui/Uiverse';
import {
  ChatBarDragOverlay,
  ChatBarInputRow,
  } from './ChatBarParts';
import { ChatBarFileGrid } from './ChatBarFileGrid';
import type { SendButtonState } from './ChatBarButtons';
import { autocorrectText } from '@/lib/chatSuggestions';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';
import { dispatchCompanionEvent } from '@/lib/companion';
import toast from 'react-hot-toast';
import { checkRepoWorkspaceReady } from '@/lib/repoWorkspaceGate';
import { ensureSelectedRepoFolder } from '@/lib/repoSessionsIndex';
import { isGeneralAdviceOrKnowledgePrompt, isWebsiteBuildPrompt } from '@/lib/chatMemory';
import { shouldRouteToPhase1 } from '@/lib/phase1Routing';
import { requiresGitHubForBuild } from '@/lib/messageHelpers';
import { composerMaxHeightForViewport } from '@/lib/chatComposerSizing';

const MIN_INPUT_H = 32;

function composerMaxHeight() {
  if (typeof window === 'undefined') return 320;
  // A long build brief should be comfortably editable on desktop while leaving
  // enough of the terminal visible to preserve context. Phones use the visual
  // viewport so the composer also contracts when the software keyboard opens.
  const viewportHeight = window.visualViewport?.height ?? window.innerHeight;
  return composerMaxHeightForViewport(window.innerWidth, viewportHeight);
}

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

  // Keep the provider's durable draft current without making the entire terminal
  // tree render on every keystroke. The provider persists this value after a short
  // debounce, so route navigation and hard refresh both restore unsent work.
  useEffect(() => {
    if (draft === prompt) return;
    const timer = window.setTimeout(() => {
      lastExternalPrompt.current = draft;
      setPrompt(draft);
    }, 300);
    return () => window.clearTimeout(timer);
  }, [draft, prompt, setPrompt]);
  const [integrationsOpen, setIntegrationsOpen] = useState(false);
  const [githubOpen, setGithubOpen] = useState(false);
  const [githubConnected, setGithubConnected] = useState(false);
  const [vercelConnected, setVercelConnected] = useState(false);
  const [files, setFiles] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
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

  // Sidebar "New Terminal" → clear repo and focus the clean composer. Repository
  // selection stays one click away in the context strip; opening that menu here hid
  // the very ideas and templates a new terminal is meant to reveal.
  useEffect(() => {
    const onNewTerminal = () => {
      if (incognito) return;
      void (async () => {
        const { clearSelectedRepoContext, markFreshTerminalIntent } = await import('@/lib/repoContext');
        const { notifyRepoContextCleared } = await import('@/lib/githubProjectEvents');
        markFreshTerminalIntent();
        clearSelectedRepoContext();
        notifyRepoContextCleared();
        window.setTimeout(() => textareaRef.current?.focus(), 100);
      })();
    };
    window.addEventListener('xroga-request-new-terminal', onNewTerminal);
    return () => window.removeEventListener('xroga-request-new-terminal', onNewTerminal);
  }, [incognito]);

  useEffect(() => {
    const onCompanionAsk = (event: Event) => {
      const text = (event as CustomEvent<{ text?: string }>).detail?.text?.trim() ?? '';
      if (text) {
        setDraft(text);
        draftRef.current = text;
        setPrompt(text);
        lastExternalPrompt.current = text;
      }
      window.setTimeout(() => textareaRef.current?.focus(), 80);
    };
    window.addEventListener('xroga:companion-ask', onCompanionAsk);
    return () => window.removeEventListener('xroga:companion-ask', onCompanionAsk);
  }, [setPrompt]);

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
    // Do NOT auto-bind sticky default_repo here — that silently targets the wrong product
    // when starting a new build. Updates get sticky only when the chat layer detects an update.
    try {
      const status = await api.github.status();
      setGithubConnected(status.connected);
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

    dispatchCompanionEvent({ type: 'prompt_submitted', message: 'Xroga accepted your prompt and is preparing the real execution route.', source: 'runtime' });

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
    // Rules and skill packs are prefixed here rather than stored server-side, because
    // there is no backend field for custom instructions — prefixing the prompt is the
    // only mechanism that genuinely reaches the model. The composer states that the
    // preamble is attached, so nothing is rewritten behind the user's back.
    const preamble = buildComposerPreamble(
      useComposerToolsStore.getState().rules,
      useComposerToolsStore.getState().enabledSkills,
    );
    await submit(
      promptText && preamble ? `${preamble}${promptText}` : promptText,
      false,
      false,
      attachments,
    );
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

  const resizeComposer = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    const maxH = composerMaxHeight();
    const nextH = Math.max(MIN_INPUT_H, Math.min(el.scrollHeight, maxH));
    el.style.height = `${nextH}px`;
    el.style.overflowY = el.scrollHeight > maxH ? 'auto' : 'hidden';
  }, []);

  useEffect(() => {
    resizeComposer();
  }, [draft, resizeComposer]);

  useEffect(() => {
    const onResize = () => resizeComposer();
    window.addEventListener('resize', onResize);
    window.visualViewport?.addEventListener('resize', onResize);
    return () => {
      window.removeEventListener('resize', onResize);
      window.visualViewport?.removeEventListener('resize', onResize);
    };
  }, [resizeComposer]);

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
            (dragOver || uploading || files.length > 0) && !incognito && 'xv-chatbar--upload-active'
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

          {/* The toolbar row above the input is gone.
              It carried Black Hole, Integrations, GitHub and Vercel as chips and
              scrolled horizontally on a phone, which is what made the composer feel
              crowded. Attach and connectors moved into the `+` menu where a composer
              normally puts them, and the remaining controls sit on the single bottom
              row, so the resting bar is the input plus one line of controls. */}

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

          <form onSubmit={handleSubmit} className="px-2 sm:px-2.5 py-0.5 sm:py-1 xv-chatbar-input-form">
            <ChatBarInputRow
              uploading={uploading}
              onUploadClick={() => fileRef.current?.click()}
              hideUpload
              leadingExtras={
                !incognito ? (
                  <ChatBarActionsMenu
                    className="shrink-0"
                    disabled={loading}
                    onAddFiles={() => fileRef.current?.click()}
                    /* Same dialog the removed pill opened, same event dispatched — the
                       trigger moved into the menu, the behaviour did not change. */
                    onOpenIntegrations={() => {
                      dispatchCompanionEvent({ type: 'integration_connecting', message: 'Opening your authorised integrations.', source: 'runtime' });
                      setIntegrationsOpen(true);
                    }}
                    connectorsNeedingAttention={[githubConnected, vercelConnected].filter((c) => !c).length}
                    onInsert={(text) => {
                      // Fills the composer and focuses it. Deliberately not auto-sent:
                      // these are scaffolds the user finishes, and sending a
                      // half-written prompt would burn a real run.
                      setDraft((current) => (current.trim() ? `${text}${current}` : text));
                      draftRef.current = draftRef.current.trim() ? `${text}${draftRef.current}` : text;
                      window.setTimeout(() => textareaRef.current?.focus(), 20);
                    }}
                  />
                ) : null
              }
              onTranscript={(text) => {
                // Append rather than replace, so dictating after typing keeps
                // whatever the user already wrote.
                setDraft((current) => {
                  const next = current.trim() ? `${current.trim()} ${text}` : text;
                  draftRef.current = next;
                  return next;
                });
                textareaRef.current?.focus();
              }}
              surface={incognito ? 'incognito' : 'dashboard'}
              compactGo={!!draft.trim()}
              sendState={sendState}
              stopping={loading}
              onStop={() => {
                stop();
                setSendState('idle');
              }}
            >
              <textarea
                ref={textareaRef}
                data-terminal-composer=""
                value={draft}
                onChange={(e) => {
                  const next = e.target.value;
                  setDraft(next);
                  draftRef.current = next;
                }}
                onFocus={() => dispatchCompanionEvent({ type: 'composer_focused', source: 'runtime' })}
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
                placeholder={incognito ? 'Type a private message…' : 'Describe what you want to build or change…'}
                aria-label="Message Xroga"
                rows={1}
                spellCheck={false}
                autoCorrect="off"
                autoCapitalize="off"
                className={cn(
                  'xv-chatbar-composer w-full pr-2 py-2 rounded-xl resize-none min-h-[34px]',
                  incognito ? 'pl-3 text-white placeholder:text-white/45' : 'pl-3 text-[var(--foreground)] placeholder:text-[var(--muted)]',
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
