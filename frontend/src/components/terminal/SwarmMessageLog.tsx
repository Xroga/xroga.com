'use client';

import { useEffect, useRef, useState, useMemo, useCallback } from 'react';
import { Terminal, Maximize2, Minimize2 } from 'lucide-react';
import { useTerminalChat } from '@/context/TerminalChatContext';
import { useTerminalScroll } from '@/context/TerminalScrollContext';
import { useThemeStore } from '@/store/useThemeStore';
import { useAppStore } from '@/store/useAppStore';
import { MessageBubbleActions } from './MessageBubbleActions';
import { MessageSuggestionChips } from './MessageSuggestionChips';
import { ModernResponseText } from './ReasoningAndFollowUps';
import { FeatureOutputView } from './FeatureOutputView';
import { ChatErrorBoundary } from './ChatErrorBoundary';
import { StoppedBuildResumeCard } from './StoppedBuildResumeCard';
import { CapacityUnavailableCard } from './CapacityUnavailableCard';
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
import { TerminalSkinPicker } from './TerminalSkinPicker';
import { TerminalLiveActivity } from './TerminalLiveActivity';
import { ChatTurnRail, buildChatTurns } from './ChatTurnRail';
import { api } from '@/lib/api';
import { useProjectWorkspaceStore } from '@/store/useProjectWorkspaceStore';
import { WorkspaceLauncher } from './WorkspaceLauncher';
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
  /**
   * Render only the transcript, with no window frame and no title bar.
   *
   * The workspace shell owns both of those now — it is one application window whose
   * toolbar must stay put while the history scrolls beneath it, which a title bar
   * living inside the scrolling component cannot do. The standalone usages (the
   * compact project view, the incognito room) still render their own frame.
   */
  chromeless?: boolean;
}

/**
 * The element that actually scrolls the transcript.
 *
 * Resolved rather than assumed because the transcript appears in three places with
 * three different scrolling surfaces: inside the workspace shell's terminal pane, and
 * on ordinary pages where the page itself scrolls. Getting this wrong does not throw —
 * it silently disables "jump to latest" and the read-position tracking, so it is worth
 * naming in one place.
 */
function transcriptScrollRoot(): HTMLElement {
  return (
    document.querySelector<HTMLElement>('.xv-terminal-scroll') ??
    document.querySelector<HTMLElement>('main.flex-1.overflow-y-auto') ??
    document.documentElement
  );
}

export function SwarmMessageLog({ compact, incognito = false, chromeless = false }: SwarmMessageLogProps) {
  const { messages, sessionRestoring, loading, animatingId, pipelineMessage, swarmNegotiationPhase, swarmTodos, terminalRun, setPrompt, deleteTurn, deleteUserTurn, updateFeatureOutput, retryStoppedBuild, retryWithFullPower, heavyBuildActive, heavyAssistantId } =
    useTerminalChat();
  const [rollbackId, setRollbackId] = useState<string | null>(null);
  const applyBuild = useProjectWorkspaceStore((s) => s.applyBuild);
  const clearRollbackBuffer = useProjectWorkspaceStore((s) => s.clearRollbackBuffer);
  const terminalSkinRaw = useThemeStore((s) => s.terminalSkin);
  const terminalFullscreenRaw = useThemeStore((s) => s.terminalFullscreen);
  const setTerminalFullscreen = useThemeStore((s) => s.setTerminalFullscreen);
  const profile = useAppStore((s) => s.profile);
  const hydrated = useHydrated();
  const terminalSkin = hydrated ? terminalSkinRaw : 'dark';
  const terminalFullscreen = hydrated && terminalFullscreenRaw;
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
    const scrollEl = transcriptScrollRoot();

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

    // While actively streaming, don't repeatedly yank the view to the bottom on every
    // token — let the user read/scroll freely. Only snap once, when the response finishes.
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

    const root = transcriptScrollRoot();
    // `IntersectionObserver` needs `null` for the viewport; passing the documentElement
    // is not the same thing and quietly reports nothing.
    const scrollRoot = root === document.documentElement ? null : root;

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
          'xv-terminal-window relative w-full min-w-0',
          // Chromeless means the workspace shell already supplies the frame, the skin
          // and the scanline overlay. Repeating them here would draw a card inside a
          // card and stack the overlay twice.
          chromeless
            ? 'xv-terminal-window--flush'
            : [
                'rounded-xl border',
                compact ? 'xv-terminal-window--compact' : 'xv-terminal-window--scrolling',
                isIncognito
                  ? 'terminal-skin-dark border-white/15 bg-[#3a3a40]/80 backdrop-blur-md'
                  : `terminal-skin-${terminalSkin}`,
                !isIncognito && (terminalSkin === 'dark' || terminalSkin === 'amoled') ? 'scanlines' : '',
              ]
        )}
      >
        {/* Window chrome. The pane's own surface, not the page card's — a terminal
            whose title bar is tinted by the page reads as a widget rather than as a
            console, which is the substance of the "doesn't look like a terminal"
            complaint this replaces. */}
        {chromeless ? null : (
        <div className="xv-terminal-header" data-testid="terminal-identity-header">
          <span className="xv-term-lights" aria-hidden="true">
            <i />
            <i />
            <i />
          </span>

          <div className="xv-term-title">
            <Terminal className="h-3.5 w-3.5 shrink-0 opacity-70" aria-hidden="true" />
            <h3>
              {isIncognito ? (
                'guest@incognito'
              ) : (
                <>
                  xroga<span className="xv-term-at">@</span>swarm
                </>
              )}
            </h3>
            <span className="xv-term-path">{isIncognito ? '~/temporary' : '~/workspace'}</span>
          </div>

          {isIncognito ? (
            <span className="xv-term-badge">Private · not saved</span>
          ) : (
            <div className="xv-terminal-header-tools flex items-center gap-1 shrink-0">
              <WorkspaceLauncher />
              <TerminalSkinPicker />
              <button
                type="button"
                onClick={() => setTerminalFullscreen(!terminalFullscreen)}
                className="xv-term-iconbtn"
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
        )}

        <div
          className={cn(
            'xv-terminal-body space-y-3 font-coding text-[13px]',
            chromeless ? 'xv-terminal-body--flush' : 'px-4 py-3 overflow-visible rounded-b-xl'
          )}
        >
          {messages.length === 0 && sessionRestoring && (
            <div className="xv-term-empty" role="status" aria-live="polite" data-testid="terminal-restoring">
              <p className="xv-term-emptyline">
                <span className="xv-term-prompt" aria-hidden="true">
                  xroga<span className="xv-term-at">@</span>swarm
                  <span className="xv-term-sep">:</span>
                  <span className="xv-term-cwd">~</span>
                  <span className="xv-term-sigil">$</span>
                </span>
                <span className="xv-term-hint">Restoring the latest verified terminal stateâ€¦</span>
              </p>
            </div>
          )}
          {messages.length === 0 && !loading && !sessionRestoring && (
            /* Left-aligned on a real prompt line with a live caret, rather than the
               centred grey sentence this replaces — a console's resting state is a
               cursor waiting at column one, and centring it read as placeholder text
               in an empty box. */
            <div className="xv-term-empty">
              <p className="xv-term-emptyline">
                <span className="xv-term-prompt" aria-hidden="true">
                  xroga
                  <span className="xv-term-at">@</span>
                  swarm
                  <span className="xv-term-sep">:</span>
                  <span className="xv-term-cwd">~</span>
                  <span className="xv-term-sigil">$</span>
                </span>
                <span className="xv-term-hint">
                  {isIncognito
                    ? 'Start a temporary chat — questions & conversation only…'
                    : 'Ask Xroga to build or change your product…'}
                </span>
                <span className="xv-term-caret" aria-hidden="true" />
              </p>
            </div>
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
                    <p className="py-0.5 text-xs xv-swarm-agent-line">{msg.content}</p>
                  ) : (
                    <>
                      <div className="py-1 text-left space-y-2">
                        {/* The live transcript. Previously this was one dim line
                            showing only the newest event, which rendered as nothing at
                            all until the first event arrived — the blank terminal a
                            user reported after sending a build prompt. */}
                        {loading && msg.id === (buildPanelMessageId ?? animatingId) ? (
                          <TerminalLiveActivity run={terminalRun} />
                        ) : null}
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
                        {msg.capacityUnavailable ? (
                          <CapacityUnavailableCard
                            meta={msg.capacityUnavailable}
                            onUseFullPower={() => retryWithFullPower(msg.id)}
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
                                        return 'This turn ended without an AI response.';
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
