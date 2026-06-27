'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import {
  Search,
  GitBranch,
  Rocket,
  Globe,
  Share2,
  MessageSquare,
} from 'lucide-react';
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
  ChatBarInputControls,
  ChatBarSuggestions,
  useSpeechToText,
} from './ChatBarParts';
import { cn } from '@/lib/utils';
import toast from 'react-hot-toast';

const QUICK_CHIPS = ['GitHub', 'GitLab', 'Vercel', 'Twitter/X'];
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

  const remaining = actions?.remaining ?? 50;
  const estimate = estimateActionCost(prompt || 'chat');

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
    }, Math.min(1800, 400 + incoming.length * 200));
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

  function handleShare() {
    const text = `I'm building with Xroga AI — ${typeof window !== 'undefined' ? window.location.origin : 'https://xroga.com'}`;
    if (navigator.share) {
      void navigator.share({ title: 'Xroga AI', text, url: 'https://xroga.com' });
    } else {
      void navigator.clipboard.writeText(text);
      toast.success('Link copied to clipboard');
    }
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
            <button
              type="button"
              onClick={() => setGithubOpen(true)}
              className="flex items-center gap-1 px-2 py-1 rounded-lg text-xs hover:bg-white/10 text-[var(--foreground)]"
            >
              <GitBranch className="w-3.5 h-3.5" />
              GitHub
            </button>
            {QUICK_CHIPS.slice(1).map((name) => (
              <button
                key={name}
                type="button"
                onClick={() => setIntegrationsOpen(true)}
                className="hidden sm:inline px-2 py-1 rounded-lg text-[10px] hover:bg-white/10 text-[var(--foreground)]"
              >
                {name}
              </button>
            ))}
            <button
              type="button"
              onClick={() => setDeployOpen(true)}
              className="flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] hover:bg-white/10 text-[var(--foreground)]"
              title="Deploy & domain"
            >
              <Rocket className="w-3.5 h-3.5" />
              Deploy
            </button>
            <button
              type="button"
              onClick={handleShare}
              className="p-1.5 rounded-lg hover:bg-white/10 text-[var(--foreground)]"
              title="Share Xroga"
            >
              <Share2 className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => toast('Feedback opens from Settings → Help soon', { icon: '💬' })}
              className="p-1.5 rounded-lg hover:bg-white/10 text-[var(--foreground)]"
              title="Send feedback"
            >
              <MessageSquare className="w-3.5 h-3.5" />
            </button>
            <div className="flex-1" />
            <button
              type="button"
              onClick={() => setCostOpen(true)}
              className="text-[10px] sm:text-xs font-terminal text-[var(--foreground)] hover:opacity-80"
            >
              <span className="font-semibold">{remaining}</span> actions · Est. {estimate.cost}
            </button>
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

          <form
            onSubmit={(e) => {
              e.preventDefault();
              void submit();
            }}
            className="px-3 py-3"
          >
            <div className="relative flex items-end gap-1">
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
                    void submit();
                  }
                }}
                placeholder="Ask Xroga AI to do everything..."
                disabled={loading}
                rows={1}
                className={cn(
                  'flex-1 pl-7 pr-2 py-2.5 rounded-xl resize-none max-h-[286px]',
                  'bg-transparent focus:outline-none text-sm font-terminal leading-[22px]',
                  'text-[var(--foreground)] placeholder:text-[var(--muted)]',
                  !loading && !prompt && 'cursor-blink'
                )}
              />
              <input
                ref={fileRef}
                type="file"
                multiple
                className="hidden"
                onChange={(e) => addFiles(e.target.files)}
              />
              <ChatBarInputControls
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
                loading={loading}
                canSend={!!prompt.trim() || files.length > 0}
              />
            </div>
          </form>
        </ChatbarShell>
      </div>
    </>
  );
}
