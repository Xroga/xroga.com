'use client';

import { useEffect, useRef, useState, useMemo } from 'react';
import Image from 'next/image';
import { Terminal, Palette, MessageCircleHeart } from 'lucide-react';
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
import { ProcessingPipeline } from './ProcessingPipeline';
import { FollowUpChips, ReasoningPanel, ModernResponseText } from './ReasoningAndFollowUps';
import { UserPromptBubble } from '@/components/settings/PrivacySettingsPanel';
import { generateMessageSuggestions, isBuildRelated, primaryDeploySuggestion } from '@/lib/messageHelpers';
import { IncognitoProfileBox } from '@/components/incognito/IncognitoProfileBox';
import { UserProfileBox } from '@/components/profile/UserProfileBox';
import { TerminalSearchBar } from '@/components/terminal/TerminalSearchBar';
import { usePrivacyStore } from '@/store/usePrivacyStore';
import { cn } from '@/lib/utils';
import toast from 'react-hot-toast';

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
  incognito?: boolean;
}

export function SwarmMessageLog({ compact, incognito = false }: SwarmMessageLogProps) {
  const { messages, loading, animatingId, swarmActiveAgent, pipelineCompact, followUps, reasoning, dag, outOfActionsOpen, setOutOfActionsOpen, setPrompt } =
    useTerminalChat();
  const terminalSkin = useThemeStore((s) => s.terminalSkin);
  const cycleTerminalSkin = useThemeStore((s) => s.cycleTerminalSkin);
  const profile = useAppStore((s) => s.profile);
  const storeIncognito = usePrivacyStore((s) => s.incognito);
  const isIncognito = incognito || storeIncognito;
  const bottomRef = useRef<HTMLDivElement>(null);
  const messageRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [searchHit, setSearchHit] = useState<string | null>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  const displayInitial = profile?.display_name?.charAt(0)?.toUpperCase() ?? 'U';

  const visibleMessages = useMemo(
    () => messages.filter((m) => !(m.role === 'system' && m.agent)),
    [messages]
  );

  const lastAssistantId = useMemo(() => {
    for (let i = visibleMessages.length - 1; i >= 0; i--) {
      if (visibleMessages[i].role === 'assistant' && visibleMessages[i].content) return visibleMessages[i].id;
    }
    return null;
  }, [visibleMessages]);

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

  function jumpToMessage(messageId: string) {
    setSearchHit(messageId);
    messageRefs.current[messageId]?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  function handleDeploy(userText: string, aiText: string) {
    const primary = primaryDeploySuggestion(userText, aiText);
    setPrompt(primary?.prompt ?? '[Deploy] Publish my project to the best platform for this build');
    toast(primary ? `${primary.label} ready — press GO` : 'Deploy prompt added — press GO', { icon: '🚀' });
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
          isIncognito ? 'terminal-skin-dark border-white/15 bg-[#3a3a40]/80 backdrop-blur-md' : `terminal-skin-${terminalSkin}`,
          !isIncognito && (terminalSkin === 'dark' || terminalSkin === 'amoled') ? 'scanlines' : '',
          compact ? '' : 'w-full'
        )}
      >
        <div className="flex items-center gap-1 sm:gap-2 px-2 sm:px-4 py-2 border-b border-[var(--card-border)]/30 overflow-x-auto scrollbar-hide">
          <Terminal className="w-4 h-4 opacity-70 shrink-0 hidden sm:block" />
          <div className="flex-1 min-w-0">
            <h3 className="font-terminal text-xs sm:text-sm opacity-90 truncate">
              {isIncognito ? 'guest@incognito ~ temporary' : 'xroga@swarm ~ terminal'}
            </h3>
            {!isIncognito && <ModelBadge variant="inline" className="text-[8px] sm:text-[9px] opacity-90" />}
            {isIncognito && (
              <p className="text-[8px] sm:text-[9px] text-white/55 font-medium">Private room · not saved</p>
            )}
          </div>
          <div className="hidden sm:flex items-center gap-1 shrink-0">
            {!isIncognito && (
            <>
            <button
              type="button"
              onClick={cycleTerminalSkin}
              className="flex items-center gap-1 p-1.5 rounded-lg hover:bg-white/10 transition-colors text-[10px] font-terminal shrink-0"
              title="Cycle terminal color (white / black / gray) — independent of site theme"
            >
              <Palette className="w-3.5 h-3.5" />
              <span className="hidden md:inline opacity-70">{TERMINAL_SKIN_LABELS[terminalSkin]}</span>
            </button>
            <BrowserPanelToggle />
            </>
            )}
            <TerminalSearchBar messages={messages} searchHit={searchHit} onJump={jumpToMessage} />
            {!isIncognito && (
            <button
              type="button"
              onClick={() => setFeedbackOpen(true)}
              className="xv-feedback-btn p-1.5 rounded-lg shrink-0"
              title="Send feedback"
              aria-label="Feedback"
            >
              <MessageCircleHeart className="w-4 h-4" />
            </button>
            )}
          </div>
          {!isIncognito && (
          <div className="flex sm:hidden items-center gap-0.5 shrink-0">
            <BrowserPanelToggle />
            <TerminalSearchBar messages={messages} searchHit={searchHit} onJump={jumpToMessage} compact />
            <button
              type="button"
              onClick={cycleTerminalSkin}
              className="p-1.5 rounded-lg hover:bg-white/10 shrink-0"
              title="Terminal theme"
              aria-label="Terminal theme"
            >
              <Palette className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => setFeedbackOpen(true)}
              className="xv-feedback-btn p-1.5 rounded-lg shrink-0"
              title="Feedback"
              aria-label="Feedback"
            >
              <MessageCircleHeart className="w-4 h-4" />
            </button>
          </div>
          )}
        </div>

        <div className="px-4 py-3 space-y-3 font-terminal text-[13px]">
          {messages.length === 0 && !loading && (
            <p className="text-[var(--muted)] text-center py-6">
              <span className="opacity-70">&gt;</span>{' '}
              {isIncognito
                ? 'Start a temporary chat — questions & conversation only…'
                : 'Ask Xroga to build anything…'}
            </p>
          )}

          {loading && (
            <ProcessingPipeline
              activeAgent={swarmActiveAgent ?? undefined}
              loading={loading}
              compact={pipelineCompact}
            />
          )}

          {visibleMessages.map((msg) => {
            const isLastAssistant = msg.id === lastAssistantId && !loading;
            const showSuggestions = isLastAssistant && msg.role === 'assistant';
            const showDeploy =
              !isIncognito &&
              msg.role === 'assistant' &&
              !loading &&
              isBuildRelated(msg.content, lastUserText);
            const deploySuggestion = showDeploy ? primaryDeploySuggestion(lastUserText, msg.content) : null;
            const suggestions =
              !isIncognito && showSuggestions ? generateMessageSuggestions(lastUserText, msg.content) : null;

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
                  isIncognito ? (
                    <IncognitoProfileBox size="terminal" />
                  ) : (
                    <UserProfileBox
                      url={profile?.avatar_url}
                      initial={displayInitial}
                      size="terminal"
                    />
                  )
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
                      <UserPromptBubble content={msg.content} />
                      <MessageBubbleActions role="user" content={msg.content} messageId={msg.id} />
                    </>
                  ) : msg.role === 'system' ? (
                    <p className="py-0.5 text-xs xv-swarm-agent-line animate-in fade-in duration-300">{msg.content}</p>
                  ) : (
                    <>
                      <div className="py-1 text-left">
                        <ModernResponseText
                          content={msg.content}
                          streaming={msg.id === animatingId && loading}
                        />
                      </div>
                      {isLastAssistant && reasoning && (
                        <ReasoningPanel reasoning={reasoning} dag={dag ?? undefined} />
                      )}
                      {isLastAssistant && followUps.length > 0 && (
                        <FollowUpChips items={followUps} onSelect={handleSuggestion} />
                      )}
                      {msg.content && (
                        <MessageBubbleActions
                          role="assistant"
                          content={msg.content}
                          messageId={msg.id}
                          showDeploy={showDeploy}
                          deployLabel={deploySuggestion?.label ?? 'Deploy'}
                          onDeploy={() => handleDeploy(lastUserText, msg.content)}
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
