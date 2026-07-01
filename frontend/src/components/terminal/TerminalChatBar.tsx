'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { Rocket, Globe, Search } from 'lucide-react';
import { useTerminalChat } from '@/context/TerminalChatContext';
import { useAppStore } from '@/store/useAppStore';
import { usePrivacyStore } from '@/store/usePrivacyStore';
import { useThemeStore } from '@/store/useThemeStore';
import { estimatePrompt, uploadChatImage, type ChatAttachment } from '@/lib/api';
import { IntegrationsModal } from './IntegrationsModal';
import { GithubRepoModal } from './GithubRepoModal';
import { ActionCostModal } from './ActionCostModal';
import { DeployModal } from './DeployModal';
import { ChatbarShell } from '@/components/ui/Uiverse';
import {
  ChatBarDragOverlay,
  ChatBarInputRow,
  ChatBarToolChip,
  ChatBarFuelMeter,
  useSpeechToText,
} from './ChatBarParts';
import { ChatBarFileGrid } from './ChatBarFileGrid';
import type { SendButtonState } from './ChatBarButtons';
import { GitHubChipIcon, GitLabChipIcon, VercelChipIcon, TwitterChipIcon, ChatBarBrandChip } from './ChatBarButtons';
import { ChatBarTip } from '@/components/ui/ChatBarTip';
import { autocorrectText } from '@/lib/chatSuggestions';
import { isVideoGenerationPrompt } from '@/lib/parseImageContent';
import { ensureVideoFormatTag } from '@/lib/videoFormat';
import { cn } from '@/lib/utils';
import toast from 'react-hot-toast';

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
  const actions = useAppStore((s) => s.actions);
  const incognito = usePrivacyStore((s) => s.incognito);
  const theme = useThemeStore((s) => s.theme);
  const darkUi = theme === 'black' || theme === 'gray';
  const fileRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const shellRef = useRef<HTMLDivElement>(null);
  const [integrationsOpen, setIntegrationsOpen] = useState(false);
  const [githubOpen, setGithubOpen] = useState(false);
  const [costOpen, setCostOpen] = useState(false);
  const [deployOpen, setDeployOpen] = useState(false);
  const [files, setFiles] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);
  const [domain, setDomain] = useState('');
  const [showDomain, setShowDomain] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [listening, setListening] = useState(false);
  const [sendState, setSendState] = useState<SendButtonState>('idle');
  const [liveEstimate, setLiveEstimate] = useState({ actions: 1, time: '5s' });

  const remaining = actions?.remaining ?? 50;

  useEffect(() => {
    if (!prompt.trim()) {
      setLiveEstimate({ actions: 1, time: '5s' });
      return;
    }
    const t = setTimeout(() => {
      void estimatePrompt(prompt).then((e) =>
        setLiveEstimate({ actions: e.estimatedActions, time: e.estimatedTime })
      );
    }, 400);
    return () => clearTimeout(t);
  }, [prompt]);

  const estimate = liveEstimate.actions;

  useEffect(() => {
    if (loading) setSendState('thinking');
    else if (sendState === 'thinking') setSendState('launched');
  }, [loading, sendState]);

  useEffect(() => {
    if (sendState !== 'launched') return;
    const t = setTimeout(() => setSendState('idle'), 1400);
    return () => clearTimeout(t);
  }, [sendState]);

  async function handleSubmit(e: React.FormEvent, interrupt = false) {
    e.preventDefault();
    const text = autocorrectText(prompt.trim());
    if (!text && files.length === 0) return;
    if (text !== prompt) setPrompt(text);

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
    const imageFiles = files.filter((f) => f.type.startsWith('image/'));
    if (imageFiles.length > 0) {
      setUploading(true);
      try {
        attachments = await Promise.all(
          imageFiles.slice(0, 4).map(async (f) => ({
            url: await uploadChatImage(f),
            mimeType: f.type,
            name: f.name,
          }))
        );
        setFiles([]);
      } catch {
        toast.error('Image upload failed — try a smaller file');
        setUploading(false);
        setSendState('idle');
        return;
      }
      setUploading(false);
    }

    const rawPrompt =
      text ||
      (attachments?.length
        ? 'Transform this image with a modern professional look'
        : undefined);

    const promptText =
      rawPrompt && isVideoGenerationPrompt(rawPrompt)
        ? ensureVideoFormatTag(rawPrompt)
        : rawPrompt;

    await submit(promptText, false, false, attachments);
    if (!loading) setSendState('launched');
  }

  async function applyStyleFromFile(file: File, stylePrompt: string) {
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

  const appendSpeech = useCallback(
    (text: string) => setPrompt(prompt ? `${prompt} ${text}` : text),
    [setPrompt, prompt]
  );
  const speech = useSpeechToText(appendSpeech);

  const addFiles = useCallback((list: FileList | null) => {
    if (!list?.length) return;
    setUploading(true);
    const incoming = Array.from(list).filter((f) => f.type.startsWith('image/'));
    if (!incoming.length) {
      setUploading(false);
      return;
    }
    setTimeout(() => {
      setFiles((prev) => [...prev, ...incoming]);
      setUploading(false);
    }, Math.min(1200, 300 + incoming.length * 150));
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
  }, [prompt]);

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
  }, [files.length, prompt, showDomain]);

  function handleDeploy() {
    const d = domain.trim() || 'your-app.vercel.app';
    setPrompt(
      (prompt ? prompt + '\n' : '') + `[Deploy] Publish to ${d} via Vercel/GitHub integration`
    );
    setShowDomain(false);
  }

  return (
    <>
      <IntegrationsModal open={integrationsOpen} onClose={() => setIntegrationsOpen(false)} />
      <GithubRepoModal
        open={githubOpen}
        onClose={() => setGithubOpen(false)}
        onSelect={(t) => setPrompt(prompt + (prompt ? '\n' : '') + t)}
      />
      <ActionCostModal open={costOpen} onClose={() => setCostOpen(false)} />
      <DeployModal open={deployOpen} onClose={() => setDeployOpen(false)} />

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
            <ChatBarTip label="GitHub repos" className="shrink-0">
              <span className="inline-flex shrink-0 lg:hidden">
                <ChatBarBrandChip variant="github" label="GitHub" onClick={() => setGithubOpen(true)} plain darkUi={darkUi} />
              </span>
              <span className="hidden lg:inline-flex shrink-0">
                <ChatBarToolChip
                  icon={<GitHubChipIcon />}
                  label="GitHub"
                  onClick={() => setGithubOpen(true)}
                  accent="#24292f"
                />
              </span>
            </ChatBarTip>
            <ChatBarTip label="GitLab" className="shrink-0">
              <span className="inline-flex shrink-0 lg:hidden">
                <ChatBarBrandChip variant="gitlab" label="GitLab" onClick={() => setIntegrationsOpen(true)} plain darkUi={darkUi} />
              </span>
              <span className="hidden lg:inline-flex shrink-0">
                <ChatBarToolChip
                  icon={<GitLabChipIcon />}
                  label="GitLab"
                  onClick={() => setIntegrationsOpen(true)}
                  accent="#fc6d26"
                />
              </span>
            </ChatBarTip>
            <ChatBarTip label="Vercel" className="shrink-0">
              <span className="inline-flex shrink-0 lg:hidden">
                <ChatBarBrandChip variant="vercel" label="Vercel" onClick={() => setIntegrationsOpen(true)} plain darkUi={darkUi} />
              </span>
              <span className="hidden lg:inline-flex shrink-0">
                <ChatBarToolChip
                  icon={<VercelChipIcon />}
                  label="Vercel"
                  onClick={() => setIntegrationsOpen(true)}
                  accent="#000"
                />
              </span>
            </ChatBarTip>
            <ChatBarTip label="X / Twitter" className="shrink-0 hidden xs:inline-flex">
              <span className="inline-flex shrink-0">
                <ChatBarToolChip
                  icon={<TwitterChipIcon />}
                  label="X"
                  onClick={() => setIntegrationsOpen(true)}
                  accent="#000"
                />
              </span>
            </ChatBarTip>
            <ChatBarTip label="Integrations" className="shrink-0">
              <button
                type="button"
                onClick={() => setIntegrationsOpen(true)}
                className={cn(
                  'shrink-0 flex items-center gap-1 text-[9px] font-bold',
                  'lg:px-2.5 lg:h-6 lg:rounded-full lg:border lg:border-[#006aff]/30 lg:bg-gradient-to-r lg:from-[#006aff]/18 lg:to-[#006aff]/6 lg:hover:from-[#006aff]/28',
                  'xv-chatbar-icon-btn lg:w-auto lg:h-6 lg:bg-transparent'
                )}
              >
                <Search className={cn('w-3.5 h-3.5', darkUi ? 'text-white' : 'text-[#006aff]')} />
                <span className="hidden lg:inline text-[var(--foreground)]">Integration</span>
              </button>
            </ChatBarTip>
            <ChatBarTip label="Deploy project" className="shrink-0">
              <button
                type="button"
                onClick={() => setDeployOpen(true)}
                className={cn(
                  'shrink-0 flex items-center gap-1 text-[9px] font-bold',
                  'lg:px-2.5 lg:h-6 lg:rounded-full lg:border lg:border-emerald-500/35 lg:bg-gradient-to-r lg:from-emerald-500/20 lg:to-[#006aff]/15 lg:hover:from-emerald-500/30',
                  'xv-chatbar-icon-btn lg:w-auto lg:h-6 lg:bg-transparent'
                )}
              >
                <Rocket className={cn('w-3.5 h-3.5', darkUi ? 'text-emerald-400' : 'text-emerald-500')} />
                <span className="hidden lg:inline text-[var(--foreground)]">Deploy</span>
              </button>
            </ChatBarTip>
            <div className="flex-1 min-w-[2px]" />
            <ChatBarFuelMeter
              remaining={remaining}
              estimate={estimate}
              onClick={() => setCostOpen(true)}
            />
          </div>
          )}

          {!incognito && showDomain && (
            <div className="flex items-center gap-2 px-3 py-2 border-b border-[var(--card-border)]/30">
              <Globe className="w-3.5 h-3.5 text-[var(--muted)] shrink-0" />
              <input
                value={domain}
                onChange={(e) => setDomain(e.target.value)}
                placeholder="your-domain.com"
                className="flex-1 text-xs bg-transparent border border-[var(--card-border)] rounded-lg px-2 py-1.5 text-[var(--foreground)] focus:outline-none focus:border-[var(--accent)]/50"
              />
              <button
                type="button"
                onClick={handleDeploy}
                className="text-xs px-3 py-1.5 rounded-lg bg-[var(--accent)] text-[var(--background)] font-medium"
              >
                Add to prompt
              </button>
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
              compactGo={!!prompt.trim()}
              onMicToggle={() => {
                if (!speech.supported) {
                  toast.error('Voice input not supported in this browser');
                  return;
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
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                onPaste={handlePaste}
                onBlur={() => {
                  const fixed = autocorrectText(prompt);
                  if (fixed !== prompt) setPrompt(fixed);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && e.shiftKey) {
                    e.preventDefault();
                    if (prompt.trim()) void handleSubmit(e, true);
                    return;
                  }
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    void handleSubmit(e, false);
                  }
                }}
                placeholder={incognito ? 'Type a private message…' : 'Xroga AI do everything..'}
                rows={1}
                className={cn(
                  'w-full pr-2 py-1.5 rounded-xl resize-none max-h-[260px] min-h-[36px]',
                  incognito ? 'pl-3 text-white placeholder:text-white/45' : 'pl-6 text-[var(--foreground)] placeholder:text-[var(--muted)]',
                  'bg-transparent focus:outline-none text-sm font-terminal leading-[20px]',
                  !loading && !prompt && 'cursor-blink'
                )}
              />
            </ChatBarInputRow>
            <input ref={fileRef} type="file" accept="image/*" multiple className="hidden" onChange={(e) => addFiles(e.target.files)} disabled={incognito} />
          </form>
        </ChatbarShell>
      </div>
    </>
  );
}
