'use client';

import { useEffect, useRef, useState } from 'react';
import { Paperclip, Loader2, Search, GitBranch } from 'lucide-react';
import { useTerminalChat } from '@/context/TerminalChatContext';
import { useAppStore } from '@/store/useAppStore';
import { estimateActionCost } from '@/lib/actionCosts';
import { IntegrationsModal } from './IntegrationsModal';
import { GithubRepoModal } from './GithubRepoModal';
import { ActionCostModal } from './ActionCostModal';
import { ChatbarShell, SendDiscoverButton } from '@/components/ui/Uiverse';
import { cn } from '@/lib/utils';

const QUICK_CHIPS = ['GitHub', 'GitLab', 'Vercel', 'Twitter/X'];

export function TerminalChatBar() {
  const { prompt, setPrompt, loading, submit } = useTerminalChat();
  const actions = useAppStore((s) => s.actions);
  const fileRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [integrationsOpen, setIntegrationsOpen] = useState(false);
  const [githubOpen, setGithubOpen] = useState(false);
  const [costOpen, setCostOpen] = useState(false);

  const remaining = actions?.remaining ?? 50;
  const estimate = estimateActionCost(prompt || 'chat');

  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    const lineHeight = 22;
    const maxH = lineHeight * 8;
    el.style.height = `${Math.min(el.scrollHeight, maxH)}px`;
  }, [prompt]);

  return (
    <>
      <IntegrationsModal open={integrationsOpen} onClose={() => setIntegrationsOpen(false)} />
      <GithubRepoModal
        open={githubOpen}
        onClose={() => setGithubOpen(false)}
        onSelect={(t) => setPrompt(prompt + (prompt ? '\n' : '') + t)}
      />
      <ActionCostModal open={costOpen} onClose={() => setCostOpen(false)} />

      <ChatbarShell>
        <div className="flex items-center gap-2 px-3 py-2 flex-wrap border-b border-black/10">
          <button
            type="button"
            onClick={() => setIntegrationsOpen(true)}
            className="p-2 rounded-lg hover:bg-black/5 transition-colors text-black"
            title="Search integrations"
          >
            <Search className="w-4 h-4" />
          </button>

          <button
            type="button"
            onClick={() => setGithubOpen(true)}
            className="flex items-center gap-1 px-2 py-1 rounded-lg text-xs hover:bg-black/5 text-black"
          >
            <GitBranch className="w-3.5 h-3.5" />
            GitHub
          </button>

          {QUICK_CHIPS.slice(1).map((name) => (
            <button
              key={name}
              type="button"
              onClick={() => setIntegrationsOpen(true)}
              className="hidden sm:inline px-2 py-1 rounded-lg text-[10px] hover:bg-black/5 text-black"
            >
              {name}
            </button>
          ))}

          <div className="flex-1" />

          <button
            type="button"
            onClick={() => setCostOpen(true)}
            className="flex items-center gap-1.5 text-[10px] sm:text-xs font-terminal hover:opacity-80 whitespace-nowrap text-black"
          >
            <span className="font-semibold">{remaining.toLocaleString()}</span>
            <span className="opacity-60">actions left</span>
            <span className="opacity-40">|</span>
            <span className="opacity-70">
              Est. <strong className="text-black">{estimate.cost}</strong> for {estimate.label}
            </span>
          </button>
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
          className="px-3 py-3"
        >
          <div className="relative flex items-end gap-2">
            <span className="absolute left-3 bottom-3 text-sm font-terminal text-black opacity-60 z-10">&gt;</span>
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
                'flex-1 pl-8 pr-4 py-3 rounded-xl resize-none',
                'bg-transparent focus:outline-none border-none',
                'text-sm font-terminal leading-[22px] text-black',
                'placeholder:text-black/40',
                !loading && !prompt && 'cursor-blink'
              )}
            />
            <input
              ref={fileRef}
              type="file"
              className="hidden"
              multiple
              accept="image/*,video/*,.pdf"
              onChange={() => setPrompt(prompt + (prompt ? '\n' : '') + '[Attached files] ')}
            />
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="p-2 text-black/60 hover:text-black shrink-0"
              aria-label="Upload"
            >
              <Paperclip className="w-4 h-4" />
            </button>
            {loading ? (
              <div className="shrink-0 p-2 text-black">
                <Loader2 className="w-5 h-5 animate-spin" />
              </div>
            ) : (
              <SendDiscoverButton disabled={!prompt.trim()} loading={loading} />
            )}
          </div>
        </form>
      </ChatbarShell>
    </>
  );
}
