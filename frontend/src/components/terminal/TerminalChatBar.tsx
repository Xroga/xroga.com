'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import {
  Loader2,
  Search,
  GitBranch,
  Rocket,
  Globe,
  X,
  FileText,
  Image as ImageIcon,
  Film,
} from 'lucide-react';
import { useTerminalChat } from '@/context/TerminalChatContext';
import { useAppStore } from '@/store/useAppStore';
import { estimateActionCost } from '@/lib/actionCosts';
import { IntegrationsModal } from './IntegrationsModal';
import { GithubRepoModal } from './GithubRepoModal';
import { ActionCostModal } from './ActionCostModal';
import { DeployModal } from './DeployModal';
import { ChatbarShell, SendDiscoverButton } from '@/components/ui/Uiverse';
import { UploadAnimButton } from '@/components/ui/UploadAnimButton';
import { cn } from '@/lib/utils';

const QUICK_CHIPS = ['GitHub', 'GitLab', 'Vercel', 'Twitter/X'];
const MAX_ROWS = 13;
const LINE_HEIGHT = 22;

function filePreviewIcon(type: string) {
  if (type.startsWith('image/')) return ImageIcon;
  if (type.startsWith('video/')) return Film;
  return FileText;
}

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

  const remaining = actions?.remaining ?? 50;
  const estimate = estimateActionCost(prompt || 'chat');

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

      <ChatbarShell
        className={cn((dragOver || uploading) && 'ring-2 ring-[var(--accent)]/40')}
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

        {files.length > 0 && (
          <div className="flex flex-wrap gap-2 px-3 py-2 border-b border-[var(--card-border)]/30">
            {files.map((f, i) => {
              const Icon = filePreviewIcon(f.type);
              const isImage = f.type.startsWith('image/');
              const url = isImage ? URL.createObjectURL(f) : null;
              return (
                <div
                  key={`${f.name}-${i}`}
                  className="relative flex items-center gap-1.5 text-[10px] px-2 py-1 rounded-lg bg-white/5 border border-[var(--card-border)]"
                >
                  {url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={url} alt="" className="w-8 h-8 rounded object-cover" />
                  ) : (
                    <Icon className="w-4 h-4 text-[var(--muted)]" />
                  )}
                  <span className="max-w-[80px] truncate text-[var(--foreground)]">{f.name}</span>
                  <button
                    type="button"
                    onClick={() => setFiles((prev) => prev.filter((_, j) => j !== i))}
                    className="p-0.5 hover:text-red-400"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              );
            })}
          </div>
        )}

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
              onChange={(e) => setPrompt(e.target.value)}
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
            <input ref={fileRef} type="file" multiple className="hidden" onChange={(e) => addFiles(e.target.files)} />
            <UploadAnimButton
              active={uploading}
              onClick={() => fileRef.current?.click()}
            />
            {loading ? (
              <Loader2 className="w-5 h-5 animate-spin text-[var(--foreground)] shrink-0 m-2" />
            ) : (
              <SendDiscoverButton disabled={!prompt.trim() && files.length === 0} loading={loading} />
            )}
          </div>
        </form>
      </ChatbarShell>
    </>
  );
}
