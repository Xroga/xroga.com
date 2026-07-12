'use client';

import { useEffect, useRef, useState, useMemo, useCallback } from 'react';
import { Terminal, Palette, MessageCircleHeart } from 'lucide-react';
import { useTerminalChat } from '@/context/TerminalChatContext';
import { useTerminalScroll } from '@/context/TerminalScrollContext';
import { useThemeStore } from '@/store/useThemeStore';
import { useAppStore } from '@/store/useAppStore';
import { OutOfActionsModal } from '@/components/billing/OutOfActionsModal';
import { BrowserPanelToggle } from './BrowserPanel';
import { TERMINAL_SKIN_LABELS } from '@/lib/theme';
import { ProcessingLogo } from '@/components/layout/ProcessingLogo';
import { ModelBadge } from '@/components/ui/ModelBadge';
import { FeedbackModal } from '@/components/feedback/FeedbackModal';
import { MessageBubbleActions } from './MessageBubbleActions';
import { MessageSuggestionChips } from './MessageSuggestionChips';
import { BlackHoleThinkingPanel } from './BlackHoleThinkingPanel';
import { SwarmPhasePanel } from './SwarmPhasePanel';
import { ReasoningPanel, ModernResponseText } from './ReasoningAndFollowUps';
import { WebSourcesPanel } from './WebSourcesPanel';
import { HackathonBriefCard } from './HackathonBriefCard';
import { TerminalFollowUpStrip } from './TerminalFollowUpStrip';
import { FeatureOutputView } from './FeatureOutputView';
import { ChatErrorBoundary } from './ChatErrorBoundary';
import { isImageGenerationPrompt } from '@/lib/parseImageContent';
import { isCodeBuildProcessing } from '@/lib/codeBuildProcessing';
import { ImageGeneratingAnimation } from './ImageStudioCard';
import { UserPromptBubble } from '@/components/settings/PrivacySettingsPanel';
import { generateMessageSuggestions } from '@/lib/messageHelpers';
import { IncognitoProfileBox } from '@/components/incognito/IncognitoProfileBox';
import { UserProfileBox } from '@/components/profile/UserProfileBox';
import { TerminalSearchBar } from '@/components/terminal/TerminalSearchBar';
import { usePrivacyStore } from '@/store/usePrivacyStore';
import { useHydrated } from '@/hooks/useHydrated';
import { loadWorkspaceSession } from '@/lib/workspacePersistence';
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
  const { messages, loading, animatingId, pipelineCompact, pipelineMessage, thinkingSteps, thinkingStartedAt, swarmNegotiationPhase, swarmTodos, swarmStatusLabel, swarmAnalysis, swarmActivityLog, imageProgressStep, imageAttempts, reasoning, dag, outOfActionsOpen, setOutOfActionsOpen, setPrompt, deleteTurn, deleteUserTurn, updateFeatureOutput } =
    useTerminalChat();
  const terminalSkin = useThemeStore((s) => s.terminalSkin);
  const cycleTerminalSkin = useThemeStore((s) => s.cycleTerminalSkin);
  const profile = useAppStore((s) => s.profile);
  const hydrated = useHydrated();
  const storeIncognitoRaw = usePrivacyStore((s) => s.incognito);
  const storeIncognito = hydrated && storeIncognitoRaw;
  const isIncognito = incognito || storeIncognito;
  const { setShowJumpToLatest, registerScrollToLatest } = useTerminalScroll();
  const bottomRef = useRef<HTMLDivElement>(null);
  const messageRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const stickToBottomRef = useRef(true);
  const userScrolledUpRef = useRef(false);
  const prevLoadingRef = useRef(false);
  const jumpHandledRef = useRef<string | null>(null);
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [searchHit, setSearchHit] = useState<string | null>(null);

  const scrollToBottom = useCallback((behavior: ScrollBehavior = 'smooth') => {
    stickToBottomRef.current = true;
    userScrolledUpRef.current = false;
    setShowJumpToLatest(false);
    bottomRef.current?.scrollIntoView({ behavior, block: 'end' });
  }, [setShowJumpToLatest]);

  useEffect(() => {
    registerScrollToLatest(scrollToBottom);
  }, [registerScrollToLatest, scrollToBottom]);

  useEffect(() => {
    const el = bottomRef.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        const atBottom = entry.isIntersecting;
        if (atBottom) {
          stickToBottomRef.current = true;
          userScrolledUpRef.current = false;
          setShowJumpToLatest(false);
        } else if (userScrolledUpRef.current) {
          setShowJumpToLatest(true);
        }
      },
      { threshold: 0, rootMargin: '0px 0px 140px 0px' },
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, [messages.length, setShowJumpToLatest]);

  useEffect(() => {
    const scrollEl =
      document.querySelector<HTMLElement>('main.flex-1.overflow-y-auto') ??
      document.querySelector<HTMLElement>('.xv-fullscreen-overlay .overflow-y-auto') ??
      document.documentElement;

    const onScroll = () => {
      const atBottom = scrollEl.scrollHeight - scrollEl.scrollTop - scrollEl.clientHeight < 140;
      if (atBottom) {
        stickToBottomRef.current = true;
        if (!loading) userScrolledUpRef.current = false;
      } else if (loading) {
        userScrolledUpRef.current = true;
        stickToBottomRef.current = false;
        setShowJumpToLatest(true);
      }
    };

    scrollEl.addEventListener('scroll', onScroll, { passive: true });
    return () => scrollEl.removeEventListener('scroll', onScroll);
  }, [loading, setShowJumpToLatest]);

  useEffect(() => {
    const started = loading && !prevLoadingRef.current;
    const finished = !loading && prevLoadingRef.current;
    prevLoadingRef.current = loading;

    if (started) {
      userScrolledUpRef.current = false;
      stickToBottomRef.current = true;
      scrollToBottom('auto');
      return;
    }

    if (loading && stickToBottomRef.current && !userScrolledUpRef.current) {
      scrollToBottom('auto');
      return;
    }

    if (finished && stickToBottomRef.current && !userScrolledUpRef.current) {
      scrollToBottom('smooth');
    }
  }, [messages, loading, imageAttempts, imageProgressStep, pipelineMessage, scrollToBottom]);

  useEffect(() => {
    const session = loadWorkspaceSession();
    const jumpId = session?.jumpMessageId;
    if (!jumpId || jumpHandledRef.current === jumpId) return;
    jumpHandledRef.current = jumpId;
    const t = setTimeout(() => {
      messageRefs.current[jumpId]?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      setSearchHit(jumpId);
      userScrolledUpRef.current = true;
      setShowJumpToLatest(true);
    }, 450);
    return () => clearTimeout(t);
  }, [messages.length, setShowJumpToLatest]);

  const displayInitial = profile?.display_name?.charAt(0)?.toUpperCase() ?? 'U';

  const visibleMessages = useMemo(
    () => messages.filter((m) => !(m.role === 'system' && m.agent)),
    [messages]
  );

  const lastAssistantId = useMemo(() => {
    for (let i = visibleMessages.length - 1; i >= 0; i--) {
      const m = visibleMessages[i];
      if (m.role === 'assistant' && (m.content || m.featureOutput)) return m.id;
    }
    return null;
  }, [visibleMessages]);

  const lastImageFollowUps = useMemo(() => {
    for (let i = visibleMessages.length - 1; i >= 0; i--) {
      const m = visibleMessages[i];
      if (m.role !== 'assistant' || !m.featureOutput) continue;
      const out = m.featureOutput as { type?: string; followUps?: string[] };
      if (out.type === 'image' && Array.isArray(out.followUps) && out.followUps.length > 0) {
        return out.followUps;
      }
    }
    return undefined;
  }, [visibleMessages]);

  const showImageFollowUps = Boolean(lastImageFollowUps?.length) && !loading;

  const lastUserMessageId = useMemo(() => {
    for (let i = visibleMessages.length - 1; i >= 0; i--) {
      if (visibleMessages[i].role === 'user') return visibleMessages[i].id;
    }
    return null;
  }, [visibleMessages]);

  const lastUserText = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === 'user') return messages[i].content;
    }
    return '';
  }, [messages]);

  const codeBuildActive = isCodeBuildProcessing(lastUserText, messages);

  const showGeneralChatThinking =
    loading &&
    !isImageGenerationPrompt(lastUserText) &&
    !codeBuildActive;

  const showChatThinking = showGeneralChatThinking && pipelineCompact;
  const showProcessingPanel = showGeneralChatThinking && !pipelineCompact;

  function handleEditAI(content: string) {
    setPrompt(content);
    toast('AI text loaded — edit and press GO');
  }

  function jumpToMessage(messageId: string) {
    setSearchHit(messageId);
    messageRefs.current[messageId]?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  function handleSuggestion(text: string) {
    setPrompt(text);
    toast('Suggestion added — press GO', { icon: '💡' });
  }

  return (
    <>
      <div
        className={cn(
          'rounded-xl relative border',
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

        <div className="px-4 py-3 space-y-3 font-terminal text-[13px] overflow-hidden rounded-b-xl">
          {messages.length === 0 && !loading && (
            <p className="text-[var(--muted)] text-center py-6">
              <span className="opacity-70">&gt;</span>{' '}
              {isIncognito
                ? 'Start a temporary chat — questions & conversation only…'
                : 'Ask Xroga to build anything…'}
            </p>
          )}

          {loading && !lastUserMessageId && showChatThinking && (
            <BlackHoleThinkingPanel
              steps={thinkingSteps}
              startedAt={thinkingStartedAt ?? undefined}
              active
              defaultExpanded
            />
          )}

          {visibleMessages.map((msg) => {
            const isLastAssistant = msg.id === lastAssistantId && !loading;
            const showSuggestions = isLastAssistant && msg.role === 'assistant';
            const isImageOutput =
              msg.featureOutput != null &&
              (msg.featureOutput as { type?: string }).type === 'image';
            const suggestions =
              !isIncognito && showSuggestions && !isImageOutput
                ? generateMessageSuggestions(lastUserText, msg.content)
                : null;

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
                      size="terminalCompact"
                    />
                  )
                )}
                {msg.role === 'assistant' && (
                  <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-full overflow-hidden shrink-0 bg-white/10 flex items-center justify-center">
                    <ProcessingLogo
                      variant="response"
                      height={28}
                      processing={loading && msg.id === animatingId}
                      className="!w-7 !h-7 sm:!w-8 sm:!h-8"
                    />
                  </div>
                )}
                <div
                  className={cn(
                    'min-w-0 max-w-[85%] w-full',
                    msg.role === 'user' && 'text-right',
                    msg.role === 'system' && (AGENT_STYLES[msg.agent ?? ''] ?? 'text-[var(--muted)] text-center max-w-full')
                  )}
                >
                  {msg.role === 'user' ? (
                    <>
                      <UserPromptBubble content={msg.content} />
                      <MessageBubbleActions
                        role="user"
                        content={msg.content}
                        messageId={msg.id}
                        onDelete={() => deleteUserTurn(msg.id)}
                      />
                    </>
                  ) : msg.role === 'system' ? (
                    <p className="py-0.5 text-xs xv-swarm-agent-line animate-in fade-in duration-300">{msg.content}</p>
                  ) : (
                    <>
                      <div className="py-1 text-left space-y-2">
                        {loading && msg.id === animatingId && codeBuildActive && (
                          <SwarmPhasePanel
                            activePhase={swarmNegotiationPhase}
                            loading={loading}
                            message={pipelineMessage}
                            statusLabel={swarmStatusLabel}
                            analysis={swarmAnalysis}
                            todos={swarmTodos}
                            activityLog={swarmActivityLog}
                            startedAt={thinkingStartedAt}
                            buildPrompt={lastUserText}
                          />
                        )}
                        {!codeBuildActive &&
                          (msg.thinkingSteps?.length ||
                            (loading && msg.id === animatingId && (showChatThinking || showProcessingPanel))) && (
                          <BlackHoleThinkingPanel
                            steps={
                              loading && msg.id === animatingId
                                ? thinkingSteps
                                : (msg.thinkingSteps ?? [])
                            }
                            startedAt={
                              loading && msg.id === animatingId
                                ? (thinkingStartedAt ?? undefined)
                                : undefined
                            }
                            thoughtMs={msg.thoughtMs}
                            active={loading && msg.id === animatingId && (showChatThinking || showProcessingPanel)}
                            defaultExpanded={loading && msg.id === animatingId}
                          />
                        )}
                        {msg.featureOutput ? (
                          <ChatErrorBoundary>
                            <FeatureOutputView
                              output={msg.featureOutput}
                              messageId={msg.id}
                              onDelete={() => deleteTurn(msg.id)}
                              onPreviewUpdate={updateFeatureOutput}
                            />
                          </ChatErrorBoundary>
                        ) : loading &&
                        msg.id === animatingId &&
                        isImageGenerationPrompt(lastUserText) ? (
                          <ImageGeneratingAnimation
                            message={pipelineMessage ?? undefined}
                            step={imageProgressStep ?? undefined}
                            liveAttempts={imageAttempts}
                            promptHint={pipelineMessage?.startsWith('Prompt:') ? pipelineMessage.replace(/^Prompt:\s*/, '') : lastUserText}
                          />
                        ) : !(
                            loading &&
                            msg.id === animatingId &&
                            (codeBuildActive ||
                              swarmTodos.length > 0 ||
                              swarmNegotiationPhase != null ||
                              swarmActivityLog.length > 0)
                          ) ? (
                          <ModernResponseText
                            content={msg.content}
                            streaming={msg.id === animatingId && loading}
                          />
                        ) : null}
                        {msg.hackathonBrief ? <HackathonBriefCard brief={msg.hackathonBrief} /> : null}
                        {msg.webSources?.length ? (
                          <WebSourcesPanel sources={msg.webSources} />
                        ) : null}
                      </div>
                      {isLastAssistant && reasoning && (
                        <ReasoningPanel reasoning={reasoning} dag={dag ?? undefined} />
                      )}
                      {msg.content && (
                        <MessageBubbleActions
                          role="assistant"
                          content={msg.content}
                          messageId={msg.id}
                          onEdit={() => handleEditAI(msg.content)}
                          onFeedback={() => setFeedbackOpen(true)}
                          onDelete={() => deleteTurn(msg.id)}
                        />
                      )}
                      {!msg.content && msg.featureOutput && (
                        <MessageBubbleActions
                          role="assistant"
                          content=""
                          messageId={msg.id}
                          onDelete={() => deleteTurn(msg.id)}
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

        {showImageFollowUps && (
          <div className="border-t border-[var(--card-border)]/40 px-3 sm:px-4 py-2.5 bg-[var(--background)]/40">
            <TerminalFollowUpStrip items={lastImageFollowUps} />
          </div>
        )}
      </div>
      <OutOfActionsModal open={outOfActionsOpen} onClose={() => setOutOfActionsOpen(false)} />
      <FeedbackModal open={feedbackOpen} onClose={() => setFeedbackOpen(false)} />
    </>
  );
}
