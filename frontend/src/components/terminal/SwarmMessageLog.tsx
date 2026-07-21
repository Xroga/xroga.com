'use client';

import { useEffect, useRef, useState, useMemo, useCallback } from 'react';
import { Terminal, Maximize2, Minimize2 } from 'lucide-react';
import { useTerminalChat } from '@/context/TerminalChatContext';
import { useTerminalScroll } from '@/context/TerminalScrollContext';
import { useThemeStore } from '@/store/useThemeStore';
import { useAppStore } from '@/store/useAppStore';
import { ProcessingLogo } from '@/components/layout/ProcessingLogo';
import { MorphWaitLoader } from '@/components/ui/MorphWaitLoader';
import { ResearchPagesLoader } from '@/components/ui/ResearchPagesLoader';
import { ThemeToggle } from '@/components/layout/ThemeToggle';
import { MessageBubbleActions } from './MessageBubbleActions';
import { MessageSuggestionChips } from './MessageSuggestionChips';
import { SwarmPhasePanel } from './SwarmPhasePanel';
import { ModernResponseText } from './ReasoningAndFollowUps';
import { FeatureOutputView } from './FeatureOutputView';
import { ChatErrorBoundary } from './ChatErrorBoundary';
import { StoppedBuildResumeCard } from './StoppedBuildResumeCard';
import { UpdateFileTrail } from './UpdateFileTrail';
import { WebSourcesPanel } from './WebSourcesPanel';
import { isCodeBuildProcessing } from '@/lib/codeBuildProcessing';
import { promptWantsLiveResearch } from '@/lib/researchWait';
import { UserPromptBubble } from '@/components/settings/PrivacySettingsPanel';
import { generateMessageSuggestions } from '@/lib/messageHelpers';
import { IncognitoProfileBox } from '@/components/incognito/IncognitoProfileBox';
import { UserProfileBox } from '@/components/profile/UserProfileBox';
import { usePrivacyStore } from '@/store/usePrivacyStore';
import { useHydrated } from '@/hooks/useHydrated';
import { loadWorkspaceSession } from '@/lib/workspacePersistence';
import { cn } from '@/lib/utils';
import { ChatTurnRail, buildChatTurns } from './ChatTurnRail';
import { api } from '@/lib/api';
import { useProjectWorkspaceStore } from '@/store/useProjectWorkspaceStore';
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
  const { messages, loading, animatingId, pipelineMessage, thinkingStartedAt, swarmNegotiationPhase, swarmTodos, swarmStatusLabel, swarmAnalysis, swarmActivityLog, setPrompt, deleteTurn, deleteUserTurn, updateFeatureOutput, retryStoppedBuild, heavyBuildActive, heavyAssistantId } =
    useTerminalChat();
  const [rollbackId, setRollbackId] = useState<string | null>(null);
  const applyBuild = useProjectWorkspaceStore((s) => s.applyBuild);
  const clearRollbackBuffer = useProjectWorkspaceStore((s) => s.clearRollbackBuffer);
  const terminalSkin = useThemeStore((s) => s.terminalSkin);
  const terminalFullscreen = useThemeStore((s) => s.terminalFullscreen);
  const setTerminalFullscreen = useThemeStore((s) => s.setTerminalFullscreen);
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
  const [searchHit, setSearchHit] = useState<string | null>(null);
  const [activeTurnId, setActiveTurnId] = useState<string | null>(null);

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
  }, [messages, loading, pipelineMessage, scrollToBottom]);

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

  const chatTurns = useMemo(() => buildChatTurns(visibleMessages), [visibleMessages]);

  useEffect(() => {
    if (chatTurns.length === 0) {
      setActiveTurnId(null);
      return;
    }

    const scrollRoot =
      document.querySelector<HTMLElement>('main.flex-1.overflow-y-auto') ??
      document.querySelector<HTMLElement>('.xv-fullscreen-overlay .overflow-y-auto') ??
      null;

    const ratios = new Map<string, number>();

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const id = entry.target.getAttribute('data-turn-id');
          if (!id) continue;
          ratios.set(id, entry.intersectionRatio);
        }

        let bestId: string | null = null;
        let bestRatio = 0;
        for (const turn of chatTurns) {
          const ratio = ratios.get(turn.id) ?? 0;
          if (ratio > bestRatio) {
            bestRatio = ratio;
            bestId = turn.id;
          }
        }
        if (bestId) setActiveTurnId(bestId);
      },
      {
        root: scrollRoot,
        rootMargin: '-12% 0px -55% 0px',
        threshold: [0, 0.15, 0.35, 0.55, 0.75, 1],
      }
    );

    for (const turn of chatTurns) {
      const el = messageRefs.current[turn.id];
      if (el) observer.observe(el);
    }

    return () => observer.disconnect();
  }, [chatTurns]);

  function jumpToTurn(turnId: string) {
    messageRefs.current[turnId]?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    setSearchHit(turnId);
    setActiveTurnId(turnId);
    userScrolledUpRef.current = true;
    setShowJumpToLatest(true);
  }

  const lastAssistantId = useMemo(() => {
    for (let i = visibleMessages.length - 1; i >= 0; i--) {
      const m = visibleMessages[i];
      if (m.role === 'assistant' && (m.content || m.featureOutput)) return m.id;
    }
    return null;
  }, [visibleMessages]);

  const lastUserText = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === 'user') return messages[i].content;
    }
    return '';
  }, [messages]);

  const codeBuildActive =
    heavyBuildActive ||
    swarmTodos.length > 0 ||
    swarmNegotiationPhase != null ||
    isCodeBuildProcessing(lastUserText, messages);

  const buildPanelMessageId = heavyAssistantId ?? animatingId;

  const researchTodoActive = swarmTodos.some(
    (t) => t.id === 'research' && t.status === 'active'
  );
  const lightResearchWait =
    loading && !heavyBuildActive && promptWantsLiveResearch(lastUserText);
  const showResearchPages = lightResearchWait || researchTodoActive;

  function handleEditAI(content: string) {
    setPrompt(content);
    toast('AI text loaded — edit and press GO');
  }

  function handleSuggestion(text: string) {
    setPrompt(text);
    toast('Suggestion added — press GO', { icon: '💡' });
  }

  return (
    <>
      <div
        className={cn(
          'rounded-xl relative border w-full min-w-0',
          isIncognito ? 'terminal-skin-dark border-white/15 bg-[#3a3a40]/80 backdrop-blur-md' : `terminal-skin-${terminalSkin}`,
          !isIncognito && (terminalSkin === 'dark' || terminalSkin === 'amoled') ? 'scanlines' : '',
          compact ? '' : 'w-full'
        )}
      >
        <div className="xv-terminal-header sticky top-0 z-20 flex items-center gap-1 sm:gap-2 px-2 sm:px-4 py-2 border-b border-[var(--card-border)]/40 overflow-x-auto scrollbar-hide backdrop-blur-xl bg-[var(--card)]/70">
          <Terminal className="w-4 h-4 opacity-70 shrink-0 hidden sm:block text-[var(--accent)]" />
          <div className="flex-1 min-w-0">
            <h3 className="font-coding text-[10px] sm:text-xs tracking-wide opacity-90 truncate text-[var(--foreground)]">
              {isIncognito ? '>_ guest@incognito · temporary' : '>_ xroga@swarm · terminal'}
            </h3>
            {isIncognito && (
              <p className="text-[8px] sm:text-[9px] text-[var(--muted)] font-coding">Private room · not saved</p>
            )}
          </div>
          {!isIncognito && (
            <div className="flex items-center gap-1 shrink-0">
              <ThemeToggle />
              <button
                type="button"
                onClick={() => setTerminalFullscreen(!terminalFullscreen)}
                className="p-1.5 rounded-md hover:bg-[var(--foreground)]/5 transition-colors text-[var(--muted)] hover:text-[var(--foreground)] shrink-0"
                title={terminalFullscreen ? 'Exit fullscreen' : 'Fullscreen terminal'}
                aria-label={terminalFullscreen ? 'Exit fullscreen' : 'Fullscreen terminal'}
              >
                {terminalFullscreen ? (
                  <Minimize2 className="w-3.5 h-3.5" />
                ) : (
                  <Maximize2 className="w-3.5 h-3.5" />
                )}
              </button>
            </div>
          )}
        </div>

        <div className="xv-terminal-body px-4 py-3 space-y-3 font-coding text-[13px] overflow-hidden rounded-b-xl">
          {messages.length === 0 && !loading && (
            <p className="text-[var(--muted)] text-center py-8 font-coding tracking-wide">
              <span className="opacity-70 text-[var(--accent)]">&gt;</span>{' '}
              {isIncognito
                ? 'Start a temporary chat — questions & conversation only…'
                : 'Ask Xroga to build anything…'}
            </p>
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
                data-turn-id={msg.role === 'user' ? msg.id : undefined}
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
                  loading && msg.id === animatingId && !showResearchPages ? (
                    <MorphWaitLoader size="sm" className="shrink-0 mt-0.5" />
                  ) : (
                    <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-full overflow-hidden shrink-0 bg-white/10 flex items-center justify-center">
                      <ProcessingLogo
                        variant="response"
                        height={24}
                        processing={false}
                        className="!w-6 !h-6 sm:!w-7 sm:!h-7"
                      />
                    </div>
                  )
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
                        {showResearchPages &&
                          msg.id === (buildPanelMessageId ?? animatingId) &&
                          loading &&
                          !msg.content?.trim() && (
                            <ResearchPagesLoader className="my-2" />
                          )}
                        {heavyBuildActive &&
                          buildPanelMessageId &&
                          msg.id === buildPanelMessageId &&
                          (swarmTodos.length > 0 || swarmNegotiationPhase != null || loading) && (
                          <SwarmPhasePanel
                            activePhase={swarmNegotiationPhase}
                            loading={heavyBuildActive}
                            message={pipelineMessage}
                            statusLabel={swarmStatusLabel}
                            analysis={swarmAnalysis}
                            todos={swarmTodos}
                            activityLog={swarmActivityLog}
                            startedAt={thinkingStartedAt}
                            buildPrompt={lastUserText}
                          />
                        )}
                        {msg.buildStopped ? (
                          <StoppedBuildResumeCard
                            meta={{
                              originalPrompt: msg.originalBuildPrompt || lastUserText,
                              githubRepoName: msg.githubRepoName,
                              todos: msg.stoppedTodos,
                              phase: msg.stoppedPhase,
                              activityLog: msg.stoppedActivityLog,
                            }}
                            onRetry={() => void retryStoppedBuild(msg.id)}
                          />
                        ) : null}
                        {msg.updateTrail ? (
                          <UpdateFileTrail
                            headline={msg.updateTrail.headline}
                            changes={msg.updateTrail.changes}
                            files={msg.updateTrail.files}
                            statusLine={msg.updateTrail.statusLine}
                            rollingBack={rollbackId === msg.id}
                            onRollback={
                              msg.updateTrail.previousFiles?.length &&
                              msg.updateTrail.githubRepoName?.includes('/')
                                ? () => {
                                    void (async () => {
                                      const trail = msg.updateTrail!;
                                      const repo = trail.githubRepoName!;
                                      setRollbackId(msg.id);
                                      try {
                                        const result = await api.github.pushBuild({
                                          repoName: repo,
                                          branch: trail.githubBranch || 'main',
                                          incremental: true,
                                          files: trail.previousFiles!,
                                          userPrompt: 'Rollback last XROGA update',
                                          projectName: 'Rollback',
                                        });
                                        // Restore dock preview from previous html/css/js if present
                                        const prevHtml =
                                          trail.previousFiles!.find((f) => f.path.endsWith('index.html') || f.path === 'index.html')
                                            ?.content ?? '';
                                        const prevCss =
                                          trail.previousFiles!.find((f) => f.path.endsWith('.css'))?.content ?? '';
                                        const prevJs =
                                          trail.previousFiles!.find((f) => f.path.endsWith('.js') && !f.path.endsWith('.json'))
                                            ?.content ?? '';
                                        applyBuild({
                                          repo: result.githubRepoName,
                                          branch: trail.githubBranch || 'main',
                                          html: prevHtml,
                                          css: prevCss,
                                          js: prevJs,
                                          commitSha: result.commitSha ?? null,
                                          status: 'pushed',
                                          changesSummary: ['Rolled back last update'],
                                          fileTrail: [],
                                          previousFiles: null,
                                          openPreview: true,
                                        });
                                        clearRollbackBuffer();
                                        toast.success('Rolled back last update on GitHub');
                                      } catch (err) {
                                        toast.error((err as Error).message || 'Rollback failed');
                                      } finally {
                                        setRollbackId(null);
                                      }
                                    })();
                                  }
                                : undefined
                            }
                          />
                        ) : null}
                        {msg.featureOutput &&
                        (msg.featureOutput as { type?: string }).type !== 'image' ? (
                          <ChatErrorBoundary>
                            <FeatureOutputView
                              output={msg.featureOutput}
                              messageId={msg.id}
                              onDelete={() => deleteTurn(msg.id)}
                              onPreviewUpdate={updateFeatureOutput}
                            />
                          </ChatErrorBoundary>
                        ) : heavyBuildActive &&
                          msg.id === buildPanelMessageId &&
                          !msg.content?.trim() &&
                          (msg.featureOutput || swarmTodos.length > 0) ? null : msg.updateTrail &&
                          !msg.content?.trim() ? null : showResearchPages &&
                          msg.id === (buildPanelMessageId ?? animatingId) &&
                          loading &&
                          !msg.content?.trim() ? null : (
                          <ModernResponseText
                            content={
                              msg.content?.trim()
                                ? msg.content
                                : !loading && !msg.featureOutput && !msg.buildStopped && !msg.updateTrail
                                  ? (() => {
                                      if (!(codeBuildActive || heavyBuildActive)) {
                                        return 'No answer was delivered for this turn. Send your question again — chat and advice replies should appear here.';
                                      }
                                      // Never show OrbitVault/update copy on a NEW build (e.g. "build a landing page").
                                      const updateAsk =
                                        /\b(update|patch|fix|edit|change|toggle|night\s*\/\s*day|night\/day|theme\s*toggle|dark\s*mode)\b/i.test(
                                          lastUserText
                                        ) &&
                                        !/\b(build|create|make|generate|scaffold)\b[\s\S]{0,80}\b(website|landing|site|page|app|dashboard|chatbot)\b/i.test(
                                          lastUserText
                                        );
                                      return updateAsk
                                        ? '⚠️ No preview was delivered for this update. Send again — we patch your selected GitHub project files, not a brand-new site.'
                                        : '⚠️ No preview was delivered for this build. Send again — we will generate a real preview for your selected repo (or sandbox if push fails).';
                                    })()
                                  : msg.content
                            }
                            streaming={msg.id === animatingId && loading}
                          />
                        )}
                        {msg.webSources && msg.webSources.length > 0 ? (
                          <WebSourcesPanel sources={msg.webSources} />
                        ) : null}
                      </div>
                      {msg.content && (
                        <MessageBubbleActions
                          role="assistant"
                          content={msg.content}
                          messageId={msg.id}
                          onEdit={() => handleEditAI(msg.content)}
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

      </div>
      {!isIncognito && (
        <ChatTurnRail
          turns={chatTurns}
          activeId={activeTurnId ?? chatTurns[chatTurns.length - 1]?.id ?? null}
          onJump={jumpToTurn}
        />
      )}
    </>
  );
}
