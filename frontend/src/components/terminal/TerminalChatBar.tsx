'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { Search, Play, Globe, Layers } from 'lucide-react';
import { useTerminalChat } from '@/context/TerminalChatContext';
import { useAppStore } from '@/store/useAppStore';
import { usePrivacyStore } from '@/store/usePrivacyStore';
import { estimateActionCost } from '@/lib/actionCosts';
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
import { GitHubChipIcon, GitLabChipIcon, VercelChipIcon, TwitterChipIcon } from './ChatBarButtons';
import { BlackHoleVButton } from './BlackHoleVButton';
import { ChatPromptQueue } from './ChatPromptQueue';
import { RepoContextBar } from './RepoContextBar';
import { ChatBarTip } from '@/components/ui/ChatBarTip';
import { autocorrectText } from '@/lib/chatSuggestions';
import { cn } from '@/lib/utils';
import toast from 'react-hot-toast';

const TOOL_CHIPS = [
  { name: 'GitLab', icon: GitLabChipIcon, accent: '#fc6d26' },
  { name: 'Vercel', icon: VercelChipIcon, accent: '#000' },
  { name: 'Twitter/X', icon: TwitterChipIcon, accent: '#1d9bf0' },
] as const;

const MAX_ROWS = 13;
const LINE_HEIGHT = 22;

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
    promptQueue,
    removeFromQueue,
    editQueuedPrompt,
    sendQueuedNow,
    clearQueue,
  } = useTerminalChat();
  const actions = useAppStore((s) => s.actions);
  const incognito = usePrivacyStore((s) => s.incognito);
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

  const remaining = actions?.remaining ?? 50;
  const estimate = estimateActionCost(prompt || 'chat');

  useEffect(() => {
    if (loading) setSendState('thinking');
    else if (sendState === 'thinking') setSendState('launched');
  }, [loading, sendState]);

  useEffect(() => {
    if (sendState !== 'launched') return;
    const t = setTimeout(() => setSendState('idle'), 1400);
    return () => clearTimeout(t);
  }, [sendState]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (loading) {
      stop();
      setSendState('idle');
      return;
    }
    const text = autocorrectText(prompt.trim());
    if (!text && files.length === 0) return;
    if (text !== prompt) setPrompt(text);
    setSendState('sending');
    await submit(text || undefined);
    if (!loading) setSendState('launched');
  }

  const appendSpeech = useCallback(
    (text: string) => setPrompt(prompt ? `${prompt} ${text}` : text),
    [setPrompt, prompt]
  );
  const speech = useSpeechToText(appendSpeech);

  const addFiles = useCallback((list: FileList | null) => {
    if (!list?.length) return;
    setUploading(true);
    const incoming = Array.from(list);
    setTimeout(() => {
      setFiles((prev) => [...prev, ...incoming]);
      setUploading(false);
    }, Math.min(1200, 300 + incoming.length * 150));
  }, []);

  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    const maxH = LINE_HEIGHT * MAX_ROWS;
    el.style.height = `${Math.min(el.scrollHeight, maxH)}px`;
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
  }, [files.length, prompt, showDomain, promptQueue.length]);

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

          {!incognito && <RepoContextBar />}
          {!incognito && (
          <ChatPromptQueue
            queue={promptQueue}
            onSendNow={sendQueuedNow}
            onEdit={editQueuedPrompt}
            onRemove={removeFromQueue}
            onClear={clearQueue}
          />
          )}

          {!incognito && (
          <div className="xv-chatbar-toolbar flex items-center gap-1 sm:gap-1.5 px-2 sm:px-3 py-1.5 sm:py-2 overflow-x-auto scrollbar-hide flex-nowrap">
            <BlackHoleVButton />
            <ChatBarTip label="Tools & integrations" className="shrink-0 sm:hidden">
              <button
                type="button"
                onClick={() => setIntegrationsOpen(true)}
                className="flex items-center gap-1 px-2.5 h-7 rounded-lg border border-[var(--card-border)]/40 bg-white/[0.04] text-[10px] font-semibold shrink-0"
              >
                <Layers className="w-3.5 h-3.5" />
                <span>Tools</span>
              </button>
            </ChatBarTip>
            <div className="hidden sm:contents">
              <ChatBarTip label="Search integrations">
                <button
                  type="button"
                  onClick={() => setIntegrationsOpen(true)}
                  className="p-1.5 h-7 rounded-lg hover:bg-white/10 text-[var(--foreground)] shrink-0"
                >
                  <Search className="w-3.5 h-3.5" />
                </button>
              </ChatBarTip>
              <ChatBarTip label="GitHub repos">
                <span className="inline-flex shrink-0">
                  <ChatBarToolChip
                    icon={<GitHubChipIcon />}
                    label="GitHub"
                    onClick={() => setGithubOpen(true)}
                    accent="#6e40c9"
                  />
                </span>
              </ChatBarTip>
              {TOOL_CHIPS.map(({ name, icon: Icon, accent }) => (
                <ChatBarTip key={name} label={name}>
                  <span className="inline-flex shrink-0">
                    <ChatBarToolChip
                      icon={<Icon />}
                      label={name}
                      onClick={() => setIntegrationsOpen(true)}
                      accent={accent}
                    />
                  </span>
                </ChatBarTip>
              ))}
              <ChatBarTip label="Deploy project">
                <span className="inline-flex shrink-0">
                  <ChatBarToolChip
                    icon={<Play className="w-3 h-3 fill-current text-[var(--accent)]" />}
                    label="Deploy"
                    onClick={() => setDeployOpen(true)}
                    accent="#4a7aff"
                  />
                </span>
              </ChatBarTip>
            </div>
            <div className="flex-1 min-w-[4px]" />
            <ChatBarFuelMeter
              remaining={remaining}
              estimate={estimate.cost}
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
          />
          )}

          <form onSubmit={handleSubmit} className="px-2 sm:px-3 py-2 sm:py-3">
            <ChatBarInputRow
              uploading={uploading}
              onUploadClick={() => fileRef.current?.click()}
              listening={listening}
              hideUpload={incognito}
              surface={incognito ? 'incognito' : 'dashboard'}
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
                <span className="absolute left-2 bottom-3 text-sm font-terminal text-[var(--foreground)] opacity-50 z-10">
                  &gt;
                </span>
              )}
              <textarea
                ref={textareaRef}
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                onBlur={() => {
                  const fixed = autocorrectText(prompt);
                  if (fixed !== prompt) setPrompt(fixed);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    void handleSubmit(e);
                  }
                }}
                placeholder={incognito ? 'Type a private message…' : 'Ask Xroga AI to do everything...'}
                rows={1}
                className={cn(
                  'w-full pr-2 py-2.5 rounded-xl resize-none max-h-[286px]',
                  incognito ? 'pl-3 text-white placeholder:text-white/45' : 'pl-7 text-[var(--foreground)] placeholder:text-[var(--muted)]',
                  'bg-transparent focus:outline-none text-sm font-terminal leading-[22px]',
                  !loading && !prompt && 'cursor-blink'
                )}
              />
            </ChatBarInputRow>
            <input ref={fileRef} type="file" multiple className="hidden" onChange={(e) => addFiles(e.target.files)} disabled={incognito} />
          </form>
        </ChatbarShell>
      </div>
    </>
  );
}
