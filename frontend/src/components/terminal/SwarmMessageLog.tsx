'use client';

import { useEffect, useRef, useState, useMemo } from 'react';
import Image from 'next/image';
import { Terminal, Palette, MessageCircleHeart, Search, X } from 'lucide-react';
import { useTerminalChat } from '@/context/TerminalChatContext';
import { useThemeStore } from '@/store/useThemeStore';
import { useAppStore } from '@/store/useAppStore';
import { OutOfActionsModal } from '@/components/billing/OutOfActionsModal';
import { BrowserPanelToggle } from './BrowserPanel';
import { AI_RESPONSE_LOGO_URL, TERMINAL_SKIN_LABELS } from '@/lib/theme';
import { ModelBadge } from '@/components/ui/ModelBadge';
import { FeedbackModal } from '@/components/feedback/FeedbackModal';
import { MessageBubbleActions } from './MessageBubbleActions';
import { MessageSuggestionChips } from './MessageSuggestionChips';
import { SwarmProcessingIndicator } from './SwarmProcessingIndicator';
import { generateMessageSuggestions, isBuildRelated } from '@/lib/messageHelpers';
import { cn } from '@/lib/utils';
import toast from 'react-hot-toast';

function useTypewriter(text: string, active: boolean, speed = 12) {
  const [displayed, setDisplayed] = useState('');
  useEffect(() => {
    if (!active) {
      setDisplayed(text);
      return;
    }
    setDisplayed('');
    let i = 0;
    const timer = setInterval(() => {
      i += 1;
      setDisplayed(text.slice(0, i));
      if (i >= text.length) clearInterval(timer);
    }, speed);
    return () => clearInterval(timer);
  }, [text, active, speed]);
  return displayed;
}

function TypewriterMessage({ content, animate }: { content: string; animate: boolean }) {
  const displayed = useTypewriter(content, animate);
  return (
    <span>
      {displayed}
      {animate && displayed.length < content.length && <span className="cursor-blink" />}
    </span>
  );
}

const AGENT_STYLES: Record<string, string> = {
  architect: 'text-[var(--primary)]',
  builder: 'text-[var(--accent)]',
  reviewer: 'text-[var(--warning)]',
  qa: 'text-[var(--muted)]',
  truth_council: 'text-[var(--foreground)]',
  complete: 'text-[var(--foreground)]',
};

interface SwarmMessageLogProps {
  compact?: boolean;
}

export function SwarmMessageLog({ compact }: SwarmMessageLogProps) {
  const { messages, loading, animatingId, swarmActiveAgent, outOfActionsOpen, setOutOfActionsOpen, setPrompt } =
    useTerminalChat();
  const terminalSkin = useThemeStore((s) => s.terminalSkin);
  const cycleTerminalSkin = useThemeStore((s) => s.cycleTerminalSkin);
  const profile = useAppStore((s) => s.profile);
  const bottomRef = useRef<HTMLDivElement>(null);
  const messageRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [terminalSearch, setTerminalSearch] = useState('');
  const [searchHit, setSearchHit] = useState<string | null>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  const avatarUrl = profile?.avatar_url;
  const displayInitial = profile?.display_name?.charAt(0)?.toUpperCase() ?? 'U';

  const lastAssistantIdx = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === 'assistant' && messages[i].content) return i;
    }
    return -1;
  }, [messages]);

  const lastUserText = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === 'user') return messages[i].content;
    }
    return '';
  }, [messages]);

  function handleEditAI(content: string) {
    setPrompt(content);
    toast('AI text loaded — edit and press GO');
  }

  function runTerminalSearch() {
    const q = terminalSearch.trim().toLowerCase();
    if (!q) {
      setSearchHit(null);
      return;
    }
    const hit = messages.find((m) => m.content.toLowerCase().includes(q));
    if (hit) {
      setSearchHit(hit.id);
      messageRefs.current[hit.id]?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      toast.success('Found in this terminal');
    } else {
      setSearchHit(null);
      toast.error('Not found in this terminal — search is only for current chat');
    }
  }

  function handleDeploy() {
    setPrompt('[Deploy] Publish my project to Vercel with production settings');
    toast('Deploy prompt added — press GO', { icon: '🚀' });
  }

  function handleSuggestion(text: string) {
    setPrompt(text);
    toast('Suggestion added — press GO', { icon: '💡' });
  }

  return (
    <>
      <div
        className={cn(
          'rounded-xl relative overflow-hidden border',
          `terminal-skin-${terminalSkin}`,
          terminalSkin === 'dark' || terminalSkin === 'amoled' ? 'scanlines' : '',
          compact ? '' : 'w-full'
        )}
      >
        <div className="flex items-center gap-2 px-4 py-2 border-b border-[var(--card-border)]/30">
          <Terminal className="w-4 h-4 opacity-70 shrink-0" />
          <div className="flex-1 min-w-0">
            <h3 className="font-terminal text-sm opacity-90 truncate">xroga@swarm ~ terminal</h3>
            <ModelBadge variant="inline" className="text-[9px] opacity-90" />
          </div>
          <button
            type="button"
            onClick={cycleTerminalSkin}
            className="flex items-center gap-1 p-1.5 rounded-lg hover:bg-white/10 transition-colors text-[10px] font-terminal shrink-0"
            title="Cycle terminal color (white / black / gray) — independent of site theme"
          >
            <Palette className="w-3.5 h-3.5" />
            <span className="hidden sm:inline opacity-70">{TERMINAL_SKIN_LABELS[terminalSkin]}</span>
          </button>
          <BrowserPanelToggle />
          <div className="hidden sm:flex items-center gap-1 max-w-[140px] lg:max-w-[180px]">
            <Search className="w-3 h-3 text-[var(--muted)] shrink-0" />
            <input
              value={terminalSearch}
              onChange={(e) => setTerminalSearch(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && runTerminalSearch()}
              placeholder="Search terminal…"
              className="w-full min-w-0 text-[10px] bg-transparent border-none outline-none text-[var(--foreground)] placeholder:text-[var(--muted)]"
            />
            {terminalSearch && (
              <button type="button" onClick={() => { setTerminalSearch(''); setSearchHit(null); }} className="p-0.5 text-[var(--muted)]">
                <X className="w-3 h-3" />
              </button>
            )}
          </div>
          <button
            type="button"
            onClick={() => setFeedbackOpen(true)}
            className="xv-feedback-btn p-1.5 rounded-lg shrink-0"
            title="Send feedback"
            aria-label="Feedback"
          >
            <MessageCircleHeart className="w-4 h-4" />
          </button>
        </div>

        <div className="px-4 py-3 space-y-3 font-terminal text-[13px]">
          {messages.length === 0 && !loading && (
            <p className="text-[var(--muted)] text-center py-6">
              <span className="opacity-70">&gt;</span> Ask Xroga to build anything…
            </p>
          )}

          {loading && (
            <SwarmProcessingIndicator activeAgent={swarmActiveAgent ?? undefined} loading={loading} />
          )}

          {messages.map((msg, idx) => {
            const isLastAssistant = idx === lastAssistantIdx && !loading;
            const showSuggestions = isLastAssistant && msg.role === 'assistant';
            const showDeploy =
              msg.role === 'assistant' &&
              !loading &&
              (isBuildRelated(msg.content) || isBuildRelated(lastUserText));
            const suggestions =
              showSuggestions ? generateMessageSuggestions(lastUserText, msg.content) : null;

            return (
              <div
                key={msg.id}
                ref={(el) => { messageRefs.current[msg.id] = el; }}
                className={cn(
                  'group flex gap-2',
                  msg.role === 'user' ? 'flex-row-reverse' : 'flex-row',
                  msg.role === 'system' && 'justify-center',
                  searchHit === msg.id && 'ring-1 ring-[#006aff]/40 rounded-lg'
                )}
              >
                {msg.role === 'user' && (
                  <div className="w-7 h-7 rounded-full border border-[var(--card-border)] overflow-hidden shrink-0 flex items-center justify-center bg-[var(--accent)]/10 text-[10px] font-bold">
                    {avatarUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={avatarUrl} alt="" className="w-full h-full object-cover" />
                    ) : (
                      displayInitial
                    )}
                  </div>
                )}
                {msg.role === 'assistant' && (
                  <div className="w-7 h-7 rounded-full overflow-hidden shrink-0 bg-white/10 flex items-center justify-center">
                    <Image src={AI_RESPONSE_LOGO_URL} alt="Xroga" width={22} height={22} unoptimized className="object-contain" />
                  </div>
                )}
                <div
                  className={cn(
                    'min-w-0 max-w-[85%]',
                    msg.role === 'user' && 'text-right',
                    msg.role === 'system' && (AGENT_STYLES[msg.agent ?? ''] ?? 'text-[var(--muted)] text-center max-w-full')
                  )}
                >
                  {msg.role === 'user' ? (
                    <>
                      <span className="inline-block px-3 py-2 rounded-xl bg-gradient-to-br from-[#006aff]/15 to-slate-500/10 border border-[var(--card-border)]/50 text-left shadow-sm">
                        <span className="opacity-60 mr-2">&gt;</span>
                        {msg.content}
                      </span>
                      <MessageBubbleActions role="user" content={msg.content} messageId={msg.id} />
                    </>
                  ) : msg.role === 'system' ? (
                    <p className="py-0.5 text-xs xv-swarm-agent-line animate-in fade-in duration-300">{msg.content}</p>
                  ) : (
                    <>
                      <p className="py-1 whitespace-pre-wrap text-left">
                        <TypewriterMessage
                          content={msg.content}
                          animate={msg.id === animatingId && loading}
                        />
                      </p>
                      {msg.content && (
                        <MessageBubbleActions
                          role="assistant"
                          content={msg.content}
                          messageId={msg.id}
                          showDeploy={showDeploy}
                          onDeploy={handleDeploy}
                          onEdit={() => handleEditAI(msg.content)}
                          onFeedback={() => setFeedbackOpen(true)}
                        />
                      )}
                      {suggestions && (
                        <MessageSuggestionChips
                          suggestions={suggestions}
                          onSelect={handleSuggestion}
                        />
                      )}
                    </>
                  )}
                </div>
              </div>
            );
          })}
          <div ref={bottomRef} />
        </div>
      </div>
      <OutOfActionsModal open={outOfActionsOpen} onClose={() => setOutOfActionsOpen(false)} />
      <FeedbackModal open={feedbackOpen} onClose={() => setFeedbackOpen(false)} />
    </>
  );
}
