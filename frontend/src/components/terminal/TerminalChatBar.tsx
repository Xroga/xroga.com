'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { Search, GitBranch, Rocket, Globe } from 'lucide-react';
import { useTerminalChat } from '@/context/TerminalChatContext';
import { useAppStore } from '@/store/useAppStore';
import { estimateActionCost } from '@/lib/actionCosts';
import { IntegrationsModal } from './IntegrationsModal';
import { GithubRepoModal } from './GithubRepoModal';
import { ActionCostModal } from './ActionCostModal';
import { DeployModal } from './DeployModal';
import { ChatbarShell } from '@/components/ui/Uiverse';
import {
  ChatBarDragOverlay,
  ChatBarFileStrip,
  ChatBarInputRow,
  ChatBarSuggestions,
  ChatBarToolChip,
  ChatBarFuelMeter,
  useSpeechToText,
} from './ChatBarParts';
import type { SendButtonState } from './ChatBarButtons';
import { cn } from '@/lib/utils';
import toast from 'react-hot-toast';

const TOOL_CHIPS = [
  { name: 'GitHub', icon: GitBranch, accent: '#6e40c9' },
  { name: 'GitLab', icon: GitBranch, accent: '#fc6d26' },
  { name: 'Vercel', icon: Rocket, accent: '#000' },
  { name: 'Twitter/X', icon: Globe, accent: '#1d9bf0' },
];

const MAX_ROWS = 13;
const LINE_HEIGHT = 22;

export function TerminalChatBar() {
  const { prompt, setPrompt, loading, submit } = useTerminalChat();
  const actions = useAppStore((s) => s.actions);
  const fileRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
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
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [sendState, setSendState] = useState<SendButtonState>('idle');

  const remaining = actions?.remaining ?? 50;
  const estimate = estimateActionCost(prompt || 'chat');

  useEffect(() => {
    if (loading) setSendState('thinking');
    else setSendState((s) => (s === 'thinking' || s === 'sending' ? 'idle' : s));
  }, [loading]);

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

  function handleDeploy() {
    const d = domain.trim() || 'your-app.vercel.app';
    setPrompt(
      (prompt ? prompt + '\n' : '') + `[Deploy] Publish to ${d} via Vercel/GitHub integration`
    );
    setShowDomain(false);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!prompt.trim() && files.length === 0) return;
    setSendState('sending');
    await submit();
    setTimeout(() => setSendState('idle'), 400);
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
        <ChatBarSuggestions
          prompt={prompt}
          visible={showSuggestions && !loading}
          onSelect={(s) => {
            setPrompt(s.text);
            setShowSuggestions(false);
          }}
        />

        <ChatbarShell
          className={cn('relative', (dragOver || uploading) && 'ring-2 ring-[var(--accent)]/40')}
          onDragOver={(e: React.DragEvent) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e: React.DragEvent) => {
            e.preventDefault();
            setDragOver(false);
            addFiles(e.dataTransfer.files);
          }}
        >
          <ChatBarDragOverlay active={dragOver} />

          <div className="flex items-center gap-1.5 px-3 py-2 flex-wrap border-b border-[var(--card-border)]/40">
            <button
              type="button"
              onClick={() => setIntegrationsOpen(true)}
              className="p-2 rounded-lg hover:bg-white/10 text-[var(--foreground)]"
              title="Search integrations"
            >
              <Search className="w-4 h-4" />
            </button>
            <ChatBarToolChip
              icon={<GitBranch className="w-3 h-3" style={{ color: '#6e40c9' }} />}
              label="GitHub"
              onClick={() => setGithubOpen(true)}
              accent="#6e40c9"
            />
            {TOOL_CHIPS.slice(1).map(({ name, icon: Icon, accent }) => (
              <ChatBarToolChip
                key={name}
                icon={<Icon className="w-3 h-3" style={{ color: accent }} />}
                label={name}
                onClick={() => setIntegrationsOpen(true)}
                accent={accent}
              />
            ))}
            <ChatBarToolChip
              icon={<Rocket className="w-3 h-3 text-[var(--accent)]" />}
              label="Deploy"
              onClick={() => setDeployOpen(true)}
              accent="#4a7aff"
            />
            <div className="flex-1" />
            <ChatBarFuelMeter
              remaining={remaining}
              estimate={estimate.cost}
              onClick={() => setCostOpen(true)}
            />
          </div>

          {showDomain && (
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

          <ChatBarFileStrip files={files} onRemove={(i) => setFiles((prev) => prev.filter((_, j) => j !== i))} />

          <form onSubmit={handleSubmit} className="px-3 py-3">
            <ChatBarInputRow
              uploading={uploading}
              onUploadClick={() => fileRef.current?.click()}
              listening={listening}
              onMicToggle={() => {
                if (!speech.supported) {
                  toast.error('Voice input not supported in this browser');
                  return;
                }
                speech.toggle(listening, setListening);
              }}
              micDisabled={!speech.supported}
              sendState={sendState}
              canSend={!!prompt.trim() || files.length > 0}
            >
              <span className="absolute left-2 bottom-3 text-sm font-terminal text-[var(--foreground)] opacity-50 z-10">
                &gt;
              </span>
              <textarea
                ref={textareaRef}
                value={prompt}
                onChange={(e) => {
                  setPrompt(e.target.value);
                  setShowSuggestions(true);
                }}
                onFocus={() => setShowSuggestions(true)}
                onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    void handleSubmit(e);
                  }
                }}
                placeholder="Ask Xroga AI to do everything..."
                disabled={loading}
                rows={1}
                className={cn(
                  'w-full pl-7 pr-2 py-2.5 rounded-xl resize-none max-h-[286px]',
                  'bg-transparent focus:outline-none text-sm font-terminal leading-[22px]',
                  'text-[var(--foreground)] placeholder:text-[var(--muted)]',
                  !loading && !prompt && 'cursor-blink'
                )}
              />
            </ChatBarInputRow>
            <input ref={fileRef} type="file" multiple className="hidden" onChange={(e) => addFiles(e.target.files)} />
          </form>
        </ChatbarShell>
      </div>
    </>
  );
}
