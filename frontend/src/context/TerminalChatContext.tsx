'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useReducer,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { EMPTY_RUN_STATE, type TerminalRunState } from '@/lib/terminal/terminalEvent';
import { adaptTerminalEvent } from '@/lib/terminal/terminalEventAdapter';
import { terminalRunReducer } from '@/lib/terminal/terminalRunReducer';
import { usePathname } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { streamSwarmExecute, ApiError, type ChatAttachment, api } from '@/lib/api';
import { capacityUnavailableLine } from '@/lib/capacityMessage';
import { shouldRouteToPhase1 } from '@/lib/phase1Routing';
import { buildCompletedChatHistory } from '@/lib/chatHistory';
import { isMathQueryPrompt } from '@/lib/mathDetect';
import { streamTextReveal } from '@/lib/streamText';
import type { SwarmProgressEvent } from '@/lib/swarm';
import { useAppStore } from '@/store/useAppStore';
import { usePrivacyStore } from '@/store/usePrivacyStore';
import { PENDING_PROMPT_KEY } from '@/lib/constants';
import {
  clearWorkspaceSession,
  loadWorkspaceSessionHydrated,
  saveWorkspaceSession,
  type WorkspaceSource,
} from '@/lib/workspacePersistence';
import { addMediaItem, removeMediaByUrl, removeMediaByMessageId, purgeMediaUrls } from '@/lib/mediaStorage';
import { collectVariantUrlsFromOutput } from '@/lib/mediaHelpers';
import { archiveChatTurn, removeChatArchiveEntry } from '@/lib/chatArchive';
import { attachCloudProjectId, saveTerminalHistorySession } from '@/lib/terminalHistory';
import { registerRepoSession } from '@/lib/repoSessionsIndex';
import { tokenUsageFromSummary } from '@/lib/tokenUsageFromSummary';
import { buildPromptWithMemory, isBuildThreadContinuation, isGeneralAdviceOrKnowledgePrompt, isPhase1BuildQuestion, isWebsiteBuildPrompt, isWebsiteBuildUpdate, isWebsiteUpdateRequest, looksLikeBuildClarificationAnswer, threadHasCompletedWebsite } from '@/lib/chatMemory';
import { isCodeBuildProcessing } from '@/lib/codeBuildProcessing';
import { mergeBuildTodos, normalizeActiveTodo } from '@/lib/mergeBuildTodos';
import { startPipelineMessageForPrompt } from '@/lib/buildPlanningSteps';
import { formatAgentActivityLine } from '@/lib/agentProcessingFormat';
import { getNewRepoVisibility, getSelectedRepoContext, saveSelectedRepoContext } from '@/lib/repoContext';
import { isKeepaliveActivity } from '@/lib/buildLiveStatus';
import { defaultImageAttachmentPrompt } from '@/lib/parseImageContent';
import { saveLocalProject, shouldSaveToProjects } from '@/lib/projectArchive';
import {
  notifyGithubProjectSaved,
  notifyGithubRepoContext,
} from '@/lib/githubProjectEvents';
import toast from 'react-hot-toast';
import { isTrivialPrompt, isSimpleChat } from '@/lib/promptClassifier';
import { requiresGitHubForBuild } from '@/lib/messageHelpers';
import {
  classifyWorkLane,
  nextHeavyQueuePosition,
  type WorkLane,
} from '@/lib/workLanes';
import { runLightLaneChat } from '@/lib/runLightLaneChat';
import { GitHubBuildGateModal } from '@/components/terminal/GitHubBuildGateModal';
import { VercelBuildGateModal } from '@/components/terminal/VercelBuildGateModal';
import { GitHubActivationOverlay } from '@/components/terminal/GitHubActivationOverlay';
import { GITHUB_CONNECTED_EVENT } from '@/lib/githubEvents';
import {
  clearGitHubConnectedSession,
  isGitHubConnectRequiredText,
  markGitHubConnectedSession,
  sanitizeXrogaTerminalText,
} from '@/lib/xrogaBrand';
import {
  addPendingBuildJob,
  attachPendingBuildRun,
  loadPendingBuildJobs,
  reconcilePendingBuildTranscript,
  removePendingBuildJob,
  updatePendingBuildSequence,
} from '@/lib/pendingBuildJobs';
import { dispatchCompanionEvent, operationFromProgress } from '@/lib/companion';
import { useBackgroundBuildJobs } from '@/hooks/useBackgroundBuildJobs';
import { useBuildCompletionAlerts } from '@/hooks/useBuildCompletionAlerts';
import { requestBuildNotificationPermission, showBuildBrowserNotification } from '@/lib/buildBrowserNotify';
import { deriveLandingOutcome } from '@/lib/landingOutcome';
import { recoveredLandingWorkspaceBuild } from '@/lib/recoveredBuildOutput';
import { swarmOutputToText } from '@/lib/swarm';

const GENERIC_SWARM_FALLBACK =
  "I'm putting the finishing touches on this — here's a helpful answer while XROGA keeps working in the background.";

function lastUserPromptNear(
  messages: ChatMessage[],
  assistantMessageId: string
): string {
  const idx = messages.findIndex((m) => m.id === assistantMessageId);
  for (let i = idx - 1; i >= 0; i--) {
    if (messages[i]?.role === 'user' && messages[i]?.content?.trim()) {
      return messages[i]!.content.trim();
    }
  }
  return '';
}

type MessageRole = 'user' | 'assistant' | 'system';

export interface ChatMessage {
  id: string;
  role: MessageRole;
  content: string;
  agent?: string;
  createdAt?: number;
  featureOutput?: unknown;
  webSources?: Array<{
    title: string;
    url: string;
    snippet: string;
    source: string;
    thumbnailUrl?: string;
    siteDomain?: string;
  }>;
  hackathonBrief?: import('@/lib/hackathonBrief').HackathonBriefCardData;
  /** Behind-the-scenes reasoning steps shown after response */
  thinkingSteps?: string[];
  thoughtMs?: number;
  /** User stopped mid-build — show Retry card, keep in history */
  buildStopped?: boolean;
  stoppedTodos?: Array<{ id: string; label: string; status: 'done' | 'active' | 'pending' | 'skipped' }>;
  stoppedPhase?: number | null;
  stoppedActivityLog?: string[];
  originalBuildPrompt?: string;
  githubRepoName?: string;
  /**
   * The build stopped because today's unlocked AI capacity is used up. Shows an inline
   * card offering to switch to Full Power (unlocks the rest of the month's capacity
   * immediately) and retry, as an alternative to waiting for `nextUnlockAt`.
   */
  capacityUnavailable?: {
    prompt: string;
    nextUnlockAt?: string | null;
  };
  /** Plan A update turn — file trail + diffs (not a landing card) */
  updateTrail?: {
    headline: string;
    changes?: string[];
    files: Array<{
      path: string;
      before: string;
      after: string;
      added: number;
      removed: number;
    }>;
    statusLine?: string;
    previousFiles?: Array<{ path: string; content: string }>;
    githubRepoName?: string;
    githubBranch?: string;
  };
}

export interface QueuedPrompt {
  id: string;
  text: string;
  createdAt: number;
  /** Light = chat/planning; heavy = full build / multi-model job */
  lane: WorkLane;
  /** When true, do not auto-start after current heavy build — wait for Continue */
  hold: boolean;
  /** Display position for heavy queue (#2, #3, …) */
  queueLabel?: string;
}

interface TerminalChatContextValue {
  messages: ChatMessage[];
  /** True only while durable history is being restored after mount or session switch. */
  sessionRestoring: boolean;
  prompt: string;
  setPrompt: (v: string) => void;
  promptQueue: QueuedPrompt[];
  loading: boolean;
  /** True while a website/product build (heavy lane) is running */
  heavyBuildActive: boolean;
  /** Assistant message id that owns the live build todo panel */
  heavyAssistantId: string | null;
  /** Soft DeepSeek peak-hour message (non-blocking) */
  deepseekPeakNudge: string | null;
  outOfActionsOpen: boolean;
  setOutOfActionsOpen: (v: boolean) => void;
  animatingId: string | null;
  swarmActiveAgent: string | null;
  pipelineMessage: string | null;
  councilLayer: 'elite' | 'reserve' | 'blackhole' | null;
  thinkingSteps: string[];
  thinkingStartedAt: number | null;
  imageProgressStep: string | null;
  imageAttempts: Array<{ imageUrl: string; provider: string; matchScore: number; issues?: string[] }>;
  followUps: string[];
  reasoning: string | null;
  dag: Array<{ id: string; description: string; agent: string }> | null;
  pipelineCompact: boolean;
  swarmNegotiationPhase: number | null;
  swarmTodos: Array<{ id: string; label: string; status: 'done' | 'active' | 'pending' | 'skipped' }>;
  swarmStatusLabel: string | null;
  swarmAnalysis: string | null;
  swarmActivityLog: string[];
  /** Execution-terminal log, derived from the live SSE stream. */
  terminalRun: TerminalRunState;
  submit: (
    text?: string,
    fromQueue?: boolean,
    interrupt?: boolean,
    attachments?: ChatAttachment[]
  ) => Promise<void>;
  stop: () => void;
  /** Continue a stopped build from checkpoint + GitHub (not from scratch) */
  retryStoppedBuild: (assistantMessageId: string) => Promise<void>;
  retryWithFullPower: (assistantMessageId: string) => Promise<void>;
  startNewChat: () => void;
  /** Restore session from workspace (e.g. jump from AI Media) */
  hydrateFromSession: () => void;
  /** Restore a saved terminal session exactly where the user left off */
  restoreTerminalSession: (opts: {
    sessionId: string;
    prompt: string;
    messages: ChatMessage[];
    selectedId?: string;
    selectedLabel?: string;
    source?: WorkspaceSource;
    jumpMessageId?: string;
  }) => Promise<void>;
  /** Load an isolated prompt+response thread into terminal (new terminal from AI Media) */
  loadIsolatedThread: (messages: ChatMessage[], prompt: string, jumpMessageId?: string) => void;
  /** Permanently removes assistant response + its user prompt from chat, archive, and media */
  deleteTurn: (assistantMessageId: string) => void;
  /** Permanently removes a user prompt + its assistant reply */
  deleteUserTurn: (userMessageId: string) => void;
  /** Update structured feature output (e.g. user voted on image variant) */
  updateFeatureOutput: (messageId: string, output: unknown) => void;
  removeFromQueue: (id: string) => void;
  editQueuedPrompt: (id: string, text: string) => void;
  /** Release hold so queued heavy build auto-starts when ready */
  continueQueuedWhenReady: (id: string) => void;
  /** Hold a queued heavy build until Continue */
  holdQueuedBuild: (id: string) => void;
  sendQueuedNow: (id: string) => void;
  clearQueue: () => void;
  /** Live terminal session id — used to bind #1 / #2 under the selected repo */
  sessionId: string;
  projectId?: string;
}

const TerminalChatContext = createContext<TerminalChatContextValue | null>(null);

export function TerminalChatProvider({
  children,
  projectId: projectIdProp,
}: {
  children: ReactNode;
  projectId?: string;
}) {
  const pathname = usePathname();
  const routeProjectId = pathname.match(/\/dashboard\/projects\/([^/]+)/)?.[1];
  const projectId = projectIdProp ?? routeProjectId;
  const incognito = usePrivacyStore((s) => s.incognito);
  const [prompt, setPrompt] = useState('');
  const [promptQueue, setPromptQueue] = useState<QueuedPrompt[]>([]);
  const [heavyLoading, setHeavyLoading] = useState(false);
  const [lightLoading, setLightLoading] = useState(false);
  const loading = heavyLoading || lightLoading;
  const [heavyBuildActive, setHeavyBuildActive] = useState(false);
  const [heavyAssistantId, setHeavyAssistantId] = useState<string | null>(null);
  const [deepseekPeakNudge, setDeepseekPeakNudge] = useState<string | null>(null);
  const heavyBuildActiveRef = useRef(false);
  /** Any heavy-lane job (build, image, scrape) — max 1 */
  const heavyJobActiveRef = useRef(false);
  const lightBusyRef = useRef(false);
  const lightAbortRef = useRef<AbortController | null>(null);
  const [outOfActionsOpen, setOutOfActionsOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [animatingId, setAnimatingId] = useState<string | null>(null);
  const [swarmActiveAgent, setSwarmActiveAgent] = useState<string | null>(null);
  const [pipelineMessage, setPipelineMessage] = useState<string | null>(null);
  const [councilLayer, setCouncilLayer] = useState<'elite' | 'reserve' | 'blackhole' | null>(null);
  const [thinkingSteps, setThinkingSteps] = useState<string[]>([]);
  const [thinkingStartedAt, setThinkingStartedAt] = useState<number | null>(null);
  const thinkingStepsRef = useRef<string[]>([]);
  const thinkingStartedAtRef = useRef<number>(0);
  const [imageProgressStep, setImageProgressStep] = useState<string | null>(null);
  const [imageAttempts, setImageAttempts] = useState<
    Array<{ imageUrl: string; provider: string; matchScore: number; issues?: string[] }>
  >([]);
  const [followUps, setFollowUps] = useState<string[]>([]);
  const [reasoning, setReasoning] = useState<string | null>(null);
  const [dag, setDag] = useState<Array<{ id: string; description: string; agent: string }> | null>(null);
  const [pipelineCompact, setPipelineCompact] = useState(false);
  const [swarmNegotiationPhase, setSwarmNegotiationPhase] = useState<number | null>(null);
  const [swarmTodos, setSwarmTodos] = useState<
    Array<{ id: string; label: string; status: 'done' | 'active' | 'pending' | 'skipped' }>
  >([]);
  const [swarmStatusLabel, setSwarmStatusLabel] = useState<string | null>(null);
  const [swarmAnalysis, setSwarmAnalysis] = useState<string | null>(null);
  const [swarmActivityLog, setSwarmActivityLog] = useState<string[]>([]);

  /**
   * Execution-terminal log, built from the same SSE events the rest of this file
   * already receives — no second request, no separate transport. Every row is
   * produced by `adaptTerminalEvent`, so a row can only exist if the backend sent
   * something. `terminalSeqRef` holds the sequence counter outside React state
   * because event callbacks capture their closure and would otherwise read a
   * stale value, replaying rows the reducer would then discard.
   */
  const [terminalRun, dispatchTerminalRun] = useReducer(terminalRunReducer, EMPTY_RUN_STATE);
  const terminalSeqRef = useRef(0);

  const pushTerminalEvent = useCallback((event: string, payload: Record<string, unknown>) => {
    const rows = adaptTerminalEvent(event, payload, { fromSeq: terminalSeqRef.current });
    if (rows.length === 0) return;
    terminalSeqRef.current = rows[rows.length - 1].seq;
    dispatchTerminalRun({ type: 'events', events: rows });
  }, []);

  const startTerminalRun = useCallback(() => {
    terminalSeqRef.current = 0;
    dispatchTerminalRun({ type: 'run-started' });
  }, []);
  const [githubGateOpen, setGithubGateOpen] = useState(false);
  const [vercelGateOpen, setVercelGateOpen] = useState(false);
  const [githubActivation, setGithubActivation] = useState<{ open: boolean; username?: string }>({
    open: false,
  });
  const afterGitHubActivationRef = useRef<(() => void) | null>(null);
  const buildTodosSeedRef = useRef<Array<{ id: string; label: string; status: 'done' | 'active' | 'pending' | 'skipped' }>>([]);
  const liveBuildSnapshotRef = useRef<{
    todos: Array<{ id: string; label: string; status: 'done' | 'active' | 'pending' | 'skipped' }>;
    phase: number | null;
    activity: string[];
  }>({ todos: [], phase: null, activity: [] });
  const skipGithubGateRef = useRef(false);
  const githubBuildRetryRef = useRef(false);
  const pendingBuildRef = useRef<{
    userPrompt: string;
    fromQueue: boolean;
    interrupt: boolean;
    attachments?: ChatAttachment[];
  } | null>(null);
  /** Set after Phase 1 questions — next message must continue website build */
  const activeWebsiteBuildRef = useRef<{
    originalPrompt: string;
    phase1Reply: string;
  } | null>(null);
  /** Set after a landing page deploy — enables post-build update routing */
  const completedWebsiteBuildRef = useRef<boolean>(false);
  const chatPrefill = useAppStore((s) => s.chatPrefill);
  const setChatPrefill = useAppStore((s) => s.setChatPrefill);
  const setSwarmRunning = useAppStore((s) => s.setSwarmRunning);
  const setTokenUsage = useAppStore((s) => s.setTokenUsage);
  const setPlanInfo = useAppStore((s) => s.setPlanInfo);

  const refreshTokenUsage = useCallback(() => {
    void api.dashboard
      .summary()
      .then((summary) => {
        const parsed = tokenUsageFromSummary(summary);
        if (parsed.usage) {
          setTokenUsage(parsed.usage);
          setPlanInfo(parsed.planTier, parsed.planName);
        }
      })
      .catch(() => {});
  }, [setTokenUsage, setPlanInfo]);
  const thinkingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const activeRunIdRef = useRef<string | null>(null);
  const autoRanRef = useRef(false);
  const submitRef = useRef<
    (text?: string, fromQueue?: boolean, interrupt?: boolean, attachments?: ChatAttachment[]) => Promise<void>
  >(async () => {});
  const queueRef = useRef<QueuedPrompt[]>([]);
  const lastTurnRef = useRef<{ userMessageId: string; assistantId: string; text: string } | null>(null);
  const skipNextQueueRef = useRef(false);
  const interruptRef = useRef(false);
  const [sessionReady, setSessionReady] = useState(false);
  const [sessionRestoring, setSessionRestoring] = useState(true);
  const persistReadyRef = useRef(false);
  const restoringRef = useRef(false);
  const lastActivityAtRef = useRef(0);
  /** Only advances on real todo/phase/activity — keepalive does not count */
  const lastRealProgressAtRef = useRef(0);
  /** Set when client auto-aborts a stalled fake-busy build */
  const stallAbortRef = useRef(false);
  const sessionIdRef = useRef<string>(
    typeof crypto !== 'undefined' ? crypto.randomUUID() : `session-${Date.now()}`
  );
  const [liveSessionId, setLiveSessionId] = useState(sessionIdRef.current);
  const setSessionId = useCallback((id: string) => {
    sessionIdRef.current = id;
    setLiveSessionId(id);
  }, []);

  queueRef.current = promptQueue;

  useBackgroundBuildJobs(
    ({ assistantMessageId, userMessageId, userPrompt, startedAt, output, runStatus }) => {
      setMessages((messages) =>
        reconcilePendingBuildTranscript(messages, {
          assistantMessageId,
          userMessageId,
          userPrompt,
          startedAt,
        }),
      );
      activeRunIdRef.current = null;
      setHeavyLoading(false);
      setHeavyBuildActive(false);
      heavyBuildActiveRef.current = false;
      heavyJobActiveRef.current = false;
      setHeavyAssistantId(null);
      setSwarmRunning(false);
      const recoveredLanding = output.type === 'landing_page';
      if (recoveredLanding) {
        void import('@/store/useProjectWorkspaceStore').then(({ useProjectWorkspaceStore }) => {
          const ws = useProjectWorkspaceStore.getState();
          const payload = recoveredLandingWorkspaceBuild(output, ws, getSelectedRepoContext());
          if (payload) ws.applyBuild(payload);
        });
      }
      if (runStatus === 'error') {
        toast('Your XROGA build was restored with shipping or validation evidence.');
      } else {
        toast.success('Your XROGA project is complete!');
      }
      const renderAsFeature = recoveredLanding || output.type === 'engineering_artifact';
      setMessages((m) =>
        m.map((msg) =>
          msg.id === assistantMessageId
            ? {
                ...msg,
                content: renderAsFeature ? '' : swarmOutputToText(output),
                featureOutput: renderAsFeature ? output : undefined,
              }
            : msg
        )
      );
    },
    ({ assistantMessageId, userMessageId, userPrompt, startedAt, error }) => {
      setMessages((messages) =>
        reconcilePendingBuildTranscript(messages, {
          assistantMessageId,
          userMessageId,
          userPrompt,
          startedAt,
        }),
      );
      activeRunIdRef.current = null;
      setHeavyLoading(false);
      setHeavyBuildActive(false);
      heavyBuildActiveRef.current = false;
      heavyJobActiveRef.current = false;
      setHeavyAssistantId(null);
      setSwarmRunning(false);
      toast.error(error.slice(0, 120) || 'Build failed');
      setMessages((m) =>
        m.map((msg) =>
          msg.id === assistantMessageId
            ? { ...msg, content: error, featureOutput: undefined }
            : msg
        )
      );
    },
    ({ assistantMessageId, userMessageId, userPrompt, startedAt, runId, status, events }) => {
      setMessages((messages) =>
        reconcilePendingBuildTranscript(messages, {
          assistantMessageId,
          userMessageId,
          userPrompt,
          startedAt,
        }),
      );
      activeRunIdRef.current = runId;
      if (status === 'running') {
        setHeavyLoading(true);
        setHeavyBuildActive(true);
        heavyBuildActiveRef.current = true;
        heavyJobActiveRef.current = true;
        setHeavyAssistantId(assistantMessageId);
        setSwarmRunning(true);
        setSwarmStatusLabel('Reconnected');
        setPipelineMessage('Restored the active build from its persisted run.');
      }
      for (const event of events) {
        pushTerminalEvent('progress', event.data);
        if (event.data.needsGitHub === true) setGithubGateOpen(true);
        if (event.data.needsVercel === true) setVercelGateOpen(true);
        if (event.data.needsRepoPick === true) {
          void import('@/lib/githubProjectEvents').then(({ notifyOpenRepoPicker }) => {
            notifyOpenRepoPicker();
          });
        }
        const restoredStatus = String(event.data.status ?? '');
        if (/waiting_for_(user|authorization|permission)/i.test(restoredStatus)) {
          setSwarmStatusLabel('Waiting for you');
          setPipelineMessage(
            sanitizeXrogaTerminalText(
              String(event.data.message ?? 'This run is waiting for your input or permission.'),
            ),
          );
        }
      }
    },
  );

  useBuildCompletionAlerts();

  // Restore the visible build shell synchronously from durable local identity. The
  // network poll still supplies authoritative events/output, but users should never
  // see an empty terminal or a dead Stop button during that first request after reload.
  useEffect(() => {
    if (incognito) return;
    const pending = loadPendingBuildJobs().find((job) => Boolean(job.runId));
    if (!pending?.runId) return;
    activeRunIdRef.current = pending.runId;
    setMessages((current) => reconcilePendingBuildTranscript(current, pending));
    setHeavyLoading(true);
    setHeavyBuildActive(true);
    heavyBuildActiveRef.current = true;
    heavyJobActiveRef.current = true;
    setHeavyAssistantId(pending.assistantMessageId);
    setSwarmRunning(true);
    setSwarmStatusLabel('Reconnecting');
    setPipelineMessage('Restoring your active build…');
  }, [incognito, setSwarmRunning]);

  useEffect(() => {
    if (!heavyBuildActive) return;
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    const onVisibilityChange = () => {
      if (document.visibilityState !== 'hidden') return;
      toast('Xroga is still building safely in the background. Return anytime to reconnect.', {
        icon: '↻',
        duration: 5000,
      });
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      window.removeEventListener('beforeunload', onBeforeUnload);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [heavyBuildActive]);

  useEffect(() => {
    if (incognito) {
      setMessages([]);
      setPrompt('');
      setPromptQueue([]);
      persistReadyRef.current = false;
      setSessionReady(true);
      setSessionRestoring(false);
      return;
    }
    // Allow #1 terminal saves immediately — do not wait for hydrate (race caused empty sidebar).
    persistReadyRef.current = true;
    setSessionReady(true);
    let cancelled = false;
    void loadWorkspaceSessionHydrated()
      .then((session) => {
        if (cancelled) return;
        let adoptedStored = false;
        // Never wipe a live conversation the user already started while hydrate was in flight.
        setMessages((current) => {
          if (current.length > 0) return current;
          if (session?.messages?.length) {
            adoptedStored = true;
            if (threadHasCompletedWebsite(session.messages)) {
              completedWebsiteBuildRef.current = true;
            }
            return session.messages;
          }
          return current;
        });
        if (adoptedStored && session?.sessionId) {
          setSessionId(session.sessionId);
        }
        setPrompt((current) => (current?.trim() ? current : session?.prompt || ''));
        persistReadyRef.current = true;
        setSessionReady(true);
        setSessionRestoring(false);
        if (adoptedStored && session?.messages?.length && session.sessionId) {
          void import('@/lib/syncRepoTerminalSessions').then(({ ensureLiveTerminalUnderSelectedRepo }) => {
            ensureLiveTerminalUnderSelectedRepo({
              sessionId: session.sessionId,
              messages: session.messages,
              prompt: session.prompt || '',
              flushCloud: true,
            });
            window.dispatchEvent(new CustomEvent('xroga-resume-workspace'));
          });
        }
      })
      .catch(() => {
        if (cancelled) return;
        persistReadyRef.current = true;
        setSessionReady(true);
        setSessionRestoring(false);
      });
    return () => {
      cancelled = true;
    };
  }, [incognito, setSessionId]);

  useEffect(() => {
  const isDashboard = pathname === '/workspace' || pathname === '/workspace/';
    if (!isDashboard || typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    if (params.get('github') !== 'connected') return;
    const rawUser = params.get('username');
    void api.github.status().then((gh) => {
      if (!gh.connected) {
        clearGitHubConnectedSession();
        skipGithubGateRef.current = false;
        return;
      }
      markGitHubConnectedSession();
      setGithubActivation({
        open: true,
        username: rawUser ? decodeURIComponent(rawUser) : gh.username,
      });
    });
    window.history.replaceState({}, '', '/workspace');
  }, [pathname]);

  useEffect(() => {
    const onGitHubConnected = (e: Event) => {
      const detail = (e as CustomEvent<{ username?: string }>).detail;
      void api.github.status().then((gh) => {
        if (!gh.connected) {
          clearGitHubConnectedSession();
          skipGithubGateRef.current = false;
          return;
        }
        markGitHubConnectedSession();
        setGithubActivation({ open: true, username: detail?.username ?? gh.username });
      });
    };
    window.addEventListener(GITHUB_CONNECTED_EVENT, onGitHubConnected);
    return () => window.removeEventListener(GITHUB_CONNECTED_EVENT, onGitHubConnected);
  }, []);

  const finishGitHubActivation = useCallback(() => {
    setGithubActivation({ open: false });
    const next = afterGitHubActivationRef.current;
    afterGitHubActivationRef.current = null;
    next?.();
  }, []);

  const queueBuildAfterGitHubActivation = useCallback(() => {
    const pending = pendingBuildRef.current;
    pendingBuildRef.current = null;
    if (!pending) return;
    afterGitHubActivationRef.current = () => {
      window.setTimeout(() => {
        void submitRef.current(
          pending.userPrompt,
          pending.fromQueue,
          pending.interrupt,
          pending.attachments
        );
      }, 800);
    };
  }, []);

  const handleVercelBuildBlocked = useCallback(
    (userPrompt: string, attachments?: ChatAttachment[]) => {
      void userPrompt;
      void attachments;
      void api.vercel.status().then((vc) => {
        if (!vc.connected) setVercelGateOpen(true);
      }).catch(() => {
        setVercelGateOpen(true);
      });
    },
    []
  );

  const handleGitHubBuildBlocked = useCallback(
    (userPrompt: string, attachments?: ChatAttachment[]) => {
      // A selected repository or old session marker is not proof that this authenticated
      // user still has a valid server-side GitHub token. Always verify the connection.
      void api.github.status().then((gh) => {
        if (!gh.connected) {
          clearGitHubConnectedSession();
          skipGithubGateRef.current = false;
          pendingBuildRef.current = {
            userPrompt,
            fromQueue: false,
            interrupt: false,
            attachments,
          };
          setGithubGateOpen(true);
          return;
        }
        markGitHubConnectedSession();
        if (githubBuildRetryRef.current) return;
        githubBuildRetryRef.current = true;
        pendingBuildRef.current = {
          userPrompt,
          fromQueue: false,
          interrupt: false,
          attachments,
        };
        afterGitHubActivationRef.current = () => {
          window.setTimeout(() => {
            githubBuildRetryRef.current = false;
            void submitRef.current(userPrompt, false, false, attachments);
          }, 900);
        };
        setGithubActivation({ open: true, username: gh.username });
      }).catch(() => {
        clearGitHubConnectedSession();
        skipGithubGateRef.current = false;
        pendingBuildRef.current = {
          userPrompt,
          fromQueue: false,
          interrupt: false,
          attachments,
        };
        setGithubGateOpen(true);
      });
    },
    []
  );

  const pushSwarmTerminalLine = useCallback((raw: string) => {
    const line = formatAgentActivityLine(sanitizeXrogaTerminalText(raw));
    if (!line) return;
    lastActivityAtRef.current = Date.now();
    setPipelineMessage(line);
    setSwarmActivityLog((prev) =>
      prev[prev.length - 1] === line ? prev : [...prev, line].slice(-24)
    );
  }, []);

  const hydrateFromSession = useCallback(() => {
    if (incognito) return;
    restoringRef.current = true;
    setSessionRestoring(true);
    void loadWorkspaceSessionHydrated().then((session) => {
      if (!session?.messages?.length) {
        restoringRef.current = false;
        setSessionRestoring(false);
        return;
      }
      setMessages(session.messages);
      if (threadHasCompletedWebsite(session.messages)) {
        completedWebsiteBuildRef.current = true;
      }
      if (session.prompt) setPrompt(session.prompt);
      if (session.sessionId) setSessionId(session.sessionId);
      restoringRef.current = false;
      setSessionRestoring(false);
    }).catch(() => {
      restoringRef.current = false;
      setSessionRestoring(false);
    });
  }, [incognito, setSessionId]);

  const restoreTerminalSession = useCallback(
    async (opts: {
      sessionId: string;
      prompt: string;
      messages: ChatMessage[];
      selectedId?: string;
      selectedLabel?: string;
      source?: WorkspaceSource;
      jumpMessageId?: string;
    }) => {
      if (incognito) return;
      restoringRef.current = true;
      setSessionRestoring(true);
      abortRef.current?.abort();
      lightAbortRef.current?.abort();
      setHeavyLoading(false);
      setLightLoading(false);
      setHeavyBuildActive(false);
      heavyBuildActiveRef.current = false;
      heavyJobActiveRef.current = false;
      setHeavyAssistantId(null);
      setDeepseekPeakNudge(null);
      lightBusyRef.current = false;
      setSwarmRunning(false);
      setAnimatingId(null);
      setSwarmActiveAgent(null);
      setPipelineMessage(null);
      setSwarmNegotiationPhase(null);
      setSwarmTodos([]);
      buildTodosSeedRef.current = [];
      setSwarmStatusLabel(null);
      setSwarmAnalysis(null);
      setSwarmActivityLog([]);
      setFollowUps([]);
      setReasoning(null);
      setDag(null);

      setSessionId(opts.sessionId);
      const { rehydratePersistedMessages } = await import('@/lib/rehydratePersistedMessages');
      const hydrated = await rehydratePersistedMessages(opts.messages);
      setMessages(hydrated);
      setPrompt(opts.prompt);
      completedWebsiteBuildRef.current = threadHasCompletedWebsite(hydrated);

      saveWorkspaceSession({
        prompt: opts.prompt,
        messages: hydrated,
        sessionId: opts.sessionId,
        selectedId: opts.selectedId ?? opts.sessionId,
        selectedLabel: opts.selectedLabel ?? opts.prompt.slice(0, 40),
        source: opts.source ?? 'dashboard',
        jumpMessageId: opts.jumpMessageId,
      });
      persistReadyRef.current = true;
      window.dispatchEvent(new CustomEvent('xroga-resume-workspace'));
      restoringRef.current = false;
      setSessionRestoring(false);
    },
    [incognito, setSwarmRunning, setSessionId]
  );

  useEffect(() => {
    const onResume = () => hydrateFromSession();
    window.addEventListener('xroga-resume-workspace', onResume);
    return () => window.removeEventListener('xroga-resume-workspace', onResume);
  }, [hydrateFromSession]);

  const loadIsolatedThread = useCallback(
    (thread: ChatMessage[], threadPrompt: string, jumpMessageId?: string) => {
      if (incognito) return;
      abortRef.current?.abort();
      lightAbortRef.current?.abort();
      setHeavyLoading(false);
      setLightLoading(false);
      setHeavyBuildActive(false);
      heavyBuildActiveRef.current = false;
      heavyJobActiveRef.current = false;
      setHeavyAssistantId(null);
      setDeepseekPeakNudge(null);
      lightBusyRef.current = false;
      setSwarmRunning(false);
      setAnimatingId(null);
      setPromptQueue([]);
      setMessages(thread);
      setPrompt(threadPrompt);
      persistReadyRef.current = true;
      saveWorkspaceSession({
        prompt: threadPrompt,
        messages: thread,
        sessionId: sessionIdRef.current,
        source: 'media',
        jumpMessageId,
        selectedId: jumpMessageId ?? thread[thread.length - 1]?.id ?? 'isolated',
        selectedLabel: threadPrompt.slice(0, 40),
      });
    },
    [incognito, setSwarmRunning],
  );

  useEffect(() => {
    if (!sessionReady || incognito || !persistReadyRef.current || restoringRef.current) return;
    // Debounce — streaming deltas were writing IndexedDB every token and freezing the UI
    const timer = window.setTimeout(() => {
      for (const m of messages) {
        const fo = m.featureOutput as { type?: string; html?: string; css?: string; js?: string } | undefined;
        if (fo?.type === 'landing_page' && fo.html?.trim()) {
          void import('@/lib/landingBuildStorage').then(({ saveLandingBuild }) =>
            saveLandingBuild({
              messageId: m.id,
              html: fo.html!,
              css: fo.css ?? '',
              js: fo.js ?? '',
            })
          );
        }
      }
      try {
        saveWorkspaceSession({ prompt, messages, sessionId: sessionIdRef.current });
      } catch (err) {
        console.warn('[workspace] persist skipped:', (err as Error).message);
      }
    }, 450);
    return () => window.clearTimeout(timer);
  }, [sessionReady, prompt, messages, incognito]);

  /** Persist terminal history while user works — not only after submit completes */
  useEffect(() => {
    if (!sessionReady || incognito || !persistReadyRef.current || restoringRef.current) return;
    if (messages.length === 0) return;
    const selected = getSelectedRepoContext();
    const timer = window.setTimeout(() => {
      // Sticky binding inside save/ensure — do not relocate #N when selected repo changes.
      saveTerminalHistorySession({
        sessionId: sessionIdRef.current,
        prompt,
        messages,
        forceRepo: selected?.repo,
        forceBranch: selected?.branch,
      });
      void import('@/lib/syncRepoTerminalSessions').then(({ ensureLiveTerminalUnderSelectedRepo }) => {
        ensureLiveTerminalUnderSelectedRepo({
          sessionId: sessionIdRef.current,
          messages,
          prompt,
          // Deliberately not `flushCloud`. This effect re-arms on every change to
          // `messages`, so during a response it lands once per settled token batch;
          // flushing bypassed the upload debounce and sent the whole transcript each
          // time. The turn-completion handler below still flushes, so a finished turn
          // is on the server just as promptly.
        });
      });
    }, 500);
    return () => window.clearTimeout(timer);
  }, [sessionReady, prompt, messages, incognito]);

  /**
   * Soft stall WARNING only — never abort mid-build.
   * Aborting at 150s was cancelling real DeepSeek calls after credits were spent
   * (HelpBee screenshot). Server budget ships early; client must not kill paid work.
   */
  useEffect(() => {
    if (!loading || !heavyBuildActive) return;
    const WARN_MS = 3 * 60_000;
    const started = thinkingStartedAt ?? Date.now();
    let warned = false;
    const id = window.setInterval(() => {
      if (!heavyBuildActiveRef.current) return;
      const wall = Date.now() - started;
      if (!warned && wall >= WARN_MS) {
        warned = true;
        toast('Still building — waiting on AI (do not stop unless you want to cancel)', {
          icon: '⏳',
          duration: 6000,
        });
      }
    }, 10_000);
    return () => window.clearInterval(id);
  }, [loading, heavyBuildActive, thinkingStartedAt]);

  const enqueuePrompt = useCallback((text: string, lane: WorkLane = 'heavy') => {
    const position = lane === 'heavy' ? nextHeavyQueuePosition(queueRef.current) : undefined;
    const label = lane === 'heavy' ? `#${position}` : undefined;
    setPromptQueue((q) => [
      ...q,
      {
        id: crypto.randomUUID(),
        text,
        createdAt: Date.now(),
        lane,
        hold: false,
        queueLabel: label,
      },
    ]);
    if (lane === 'heavy') {
      toast.success(`Queued as ${label} — finishes after current build. Chat still open.`);
    } else {
      toast.success('Queued — sends when current reply finishes');
    }
  }, []);

  const cleanupInProgressAssistant = useCallback(() => {
    setMessages((m) => {
      const last = m[m.length - 1];
      if (last?.role === 'assistant' && !last.content && !last.featureOutput) {
        return m.slice(0, -1);
      }
      return m;
    });
    setAnimatingId(null);
    lastTurnRef.current = null;
  }, []);

  const processNextInQueue = useCallback(() => {
    // Prefer releasing the next heavy build that is not on hold; never steal a hold.
    const q = queueRef.current;
    const nextHeavy = q.find((p) => p.lane === 'heavy' && !p.hold);
    const nextLight = q.find((p) => p.lane === 'light' && !p.hold);
    const next = heavyJobActiveRef.current ? nextLight : nextHeavy ?? nextLight;
    if (!next) return;
    setPromptQueue((prev) => prev.filter((p) => p.id !== next.id));
    void submitRef.current(next.text, true);
  }, []);

  const stop = useCallback(() => {
    interruptRef.current = true;
    const runId =
      activeRunIdRef.current ??
      loadPendingBuildJobs().find((job) => Boolean(job.runId))?.runId ??
      null;
    if (runId) {
      activeRunIdRef.current = runId;
      setSwarmStatusLabel('Stopping');
      setPipelineMessage('Stopping this build safely…');
      void api.swarm
        .cancelRun(runId)
        .then((result) => {
          if (!result.cancelled && result.status !== 'cancelled') {
            throw new Error('The build is still running. Please try Stop again.');
          }
          // The durable run is the source of truth. Only end the local stream after the
          // server confirms cancellation; otherwise a failed POST made the UI look stopped
          // while paid work continued remotely.
          if (heavyBuildActiveRef.current && abortRef.current) {
            abortRef.current.abort();
          } else {
            lightAbortRef.current?.abort();
            abortRef.current?.abort();
          }
          setHeavyLoading(false);
          setHeavyBuildActive(false);
          heavyBuildActiveRef.current = false;
          heavyJobActiveRef.current = false;
          setHeavyAssistantId(null);
          setSwarmRunning(false);
          setPipelineMessage('Build stopped. Progress already written remains saved.');
          toast.success('Build stopped.');
        })
        .catch((error) => {
          interruptRef.current = false;
          setSwarmStatusLabel('Running');
          setPipelineMessage('The build is still running — Stop was not confirmed.');
          toast.error((error as Error).message || 'Could not stop this build. Please try again.');
        });
    } else {
      interruptRef.current = false;
      toast.error('Restoring the build connection. Try Stop again in a moment.');
    }
  }, [setSwarmRunning]);

  const retryStoppedBuild = useCallback(async (assistantMessageId: string) => {
    const msg = messages.find((m) => m.id === assistantMessageId && m.buildStopped);
    if (!msg) {
      toast.error('Stopped build not found');
      return;
    }
    const original = msg.originalBuildPrompt?.trim() || lastUserPromptNear(messages, assistantMessageId);
    if (!original) {
      toast.error('Original build prompt missing');
      return;
    }
    if (msg.githubRepoName?.includes('/')) {
      // keep / reconnect the same repo so engine loads existing files
      const { saveSelectedRepoContext } = await import('@/lib/repoContext');
      const { notifyGithubRepoContext } = await import('@/lib/githubProjectEvents');
      saveSelectedRepoContext({ repo: msg.githubRepoName, branch: 'main' });
      notifyGithubRepoContext(msg.githubRepoName, 'main');
    }

    const continuePrompt = [
      'Continue this build from where it was stopped.',
      'Analyze existing GitHub project files first.',
      'Finish remaining todos and incomplete sections only.',
      'Do NOT rebuild the entire website from scratch.',
      '',
      `Original request:\n${original}`,
      msg.stoppedTodos?.length
        ? `\nLast progress:\n${msg.stoppedTodos.map((t) => `- [${t.status}] ${t.label}`).join('\n')}`
        : '',
    ]
      .filter(Boolean)
      .join('\n');

    await submitRef.current(continuePrompt, false, false);
  }, [messages]);

  /**
   * "Use full power now" — switches the account off the daily drip and onto Full
   * Power pacing, which unlocks the rest of the month's capacity immediately, then
   * resends the exact prompt that got refused.
   *
   * `confirmed: true` matches the explicit-consent requirement on the backend
   * (`setUsagePacing` refuses `full_access` without it) — the click itself is the
   * confirmation, since the card states the trade-off before the button is shown.
   */
  const retryWithFullPower = useCallback(async (assistantMessageId: string) => {
    const msg = messages.find((m) => m.id === assistantMessageId && m.capacityUnavailable);
    if (!msg?.capacityUnavailable) {
      toast.error('Nothing to retry here');
      return;
    }
    const { prompt: original } = msg.capacityUnavailable;
    try {
      await api.billing.setPacing('full_access', true);
    } catch {
      toast.error('Could not switch to Full Power — please try again');
      return;
    }
    setMessages((m) =>
      m.map((message) =>
        message.id === assistantMessageId
          ? { ...message, capacityUnavailable: undefined }
          : message
      )
    );
    toast.success('Full Power on — resuming your build');
    await submitRef.current(original, false, false);
  }, [messages]);

  const startNewChat = useCallback(() => {
    abortRef.current?.abort();
    if (thinkingTimerRef.current) {
      clearTimeout(thinkingTimerRef.current);
      thinkingTimerRef.current = null;
    }
    if (!usePrivacyStore.getState().incognito && messages.length > 0) {
      // Keep prior chat under the selected GitHub repo (#N) in permanent account storage
      // BEFORE wiping the live workspace — so clicking #1 later restores exact history.
      const priorId = sessionIdRef.current;
      saveTerminalHistorySession({
        sessionId: priorId,
        prompt,
        messages,
        status: messages.some((m) => m.buildStopped) ? 'stopped' : undefined,
      });
      void import('@/lib/cloudTerminalSessions').then(async ({ flushTerminalSessionToCloud }) => {
        const { loadTerminalHistory } = await import('@/lib/terminalHistory');
        const entry = loadTerminalHistory().find((e) => e.id === priorId);
        if (entry?.messages?.length) await flushTerminalSessionToCloud(entry);
        window.dispatchEvent(new CustomEvent('xroga-resume-workspace'));
      });
    }
    setSessionId(
      typeof crypto !== 'undefined' ? crypto.randomUUID() : `session-${Date.now()}`
    );
    setMessages([]);
    setPrompt('');
    setPromptQueue([]);
    setHeavyLoading(false);
    setLightLoading(false);
    setHeavyBuildActive(false);
    heavyBuildActiveRef.current = false;
    heavyJobActiveRef.current = false;
    setHeavyAssistantId(null);
    setDeepseekPeakNudge(null);
    lightBusyRef.current = false;
    lightAbortRef.current?.abort();
    lightAbortRef.current = null;
    setSwarmRunning(false);
    setAnimatingId(null);
    setSwarmActiveAgent(null);
    persistReadyRef.current = false;
    if (!usePrivacyStore.getState().incognito) clearWorkspaceSession();
    // Keep selected GitHub repo — new chat is another session under the same Xroga repo workspace.
    // (Code still goes to GitHub; chats/images/research stay on Xroga under that repo.)
    persistReadyRef.current = true;
    // Refresh Repositories sidebar so the prior terminal stays listed (not "lost").
    window.dispatchEvent(new CustomEvent('xroga-resume-workspace'));
  }, [setSwarmRunning, messages, prompt, setSessionId]);

  const deleteTurn = useCallback((assistantMessageId: string) => {
    setMessages((current) => {
      const assistantIdx = current.findIndex((m) => m.id === assistantMessageId);
      if (assistantIdx < 0) return current;

      let userIdx = assistantIdx - 1;
      while (userIdx >= 0 && current[userIdx].role !== 'user') userIdx--;

      const assistant = current[assistantIdx];
      const removeIds = new Set<string>([assistantMessageId]);
      if (userIdx >= 0) removeIds.add(current[userIdx]!.id);

      const output = assistant.featureOutput as Record<string, unknown> | undefined;
      if (typeof output?.imageUrl === 'string') removeMediaByUrl(output.imageUrl);
      if (typeof output?.streamingUrl === 'string') removeMediaByUrl(output.streamingUrl);
      const rejected = output?.rejectedImages;
      const allAttempts = output?.allAttempts;
      const urls = [
        ...(Array.isArray(rejected)
          ? rejected.map((r) => (r && typeof r === 'object' && 'imageUrl' in r ? String((r as { imageUrl: string }).imageUrl) : ''))
          : []),
        ...(Array.isArray(allAttempts)
          ? allAttempts.map((r) => (r && typeof r === 'object' && 'imageUrl' in r ? String((r as { imageUrl: string }).imageUrl) : ''))
          : []),
      ].filter(Boolean);
      if (urls.length) purgeMediaUrls(...urls);
      removeMediaByMessageId(assistantMessageId);

      if (userIdx >= 0) {
        removeChatArchiveEntry(`chat-${current[userIdx]!.id}`);
      }

      return current.filter((m) => !removeIds.has(m.id));
    });
    toast.success('Deleted permanently');
  }, []);

  const deleteUserTurn = useCallback((userMessageId: string) => {
    setMessages((current) => {
      const userIdx = current.findIndex((m) => m.id === userMessageId);
      if (userIdx < 0) return current;

      const removeIds = new Set<string>([userMessageId]);
      let assistantIdx: number | null = null;
      for (let i = userIdx + 1; i < current.length; i++) {
        if (current[i]!.role === 'user') break;
        if (current[i]!.role === 'assistant') {
          assistantIdx = i;
          removeIds.add(current[i]!.id);
          break;
        }
      }

      if (assistantIdx != null) {
        const assistant = current[assistantIdx]!;
        const output = assistant.featureOutput as Record<string, unknown> | undefined;
        if (typeof output?.imageUrl === 'string') removeMediaByUrl(output.imageUrl);
        if (typeof output?.streamingUrl === 'string') removeMediaByUrl(output.streamingUrl);
        const rejected = output?.rejectedImages;
        const allAttempts = output?.allAttempts;
        const urls = [
          ...(Array.isArray(rejected)
            ? rejected.map((r) => (r && typeof r === 'object' && 'imageUrl' in r ? String((r as { imageUrl: string }).imageUrl) : ''))
            : []),
          ...(Array.isArray(allAttempts)
            ? allAttempts.map((r) => (r && typeof r === 'object' && 'imageUrl' in r ? String((r as { imageUrl: string }).imageUrl) : ''))
            : []),
        ].filter(Boolean);
        if (urls.length) purgeMediaUrls(...urls);
        removeMediaByMessageId(assistant.id);
      }

      removeChatArchiveEntry(`chat-${userMessageId}`);
      return current.filter((m) => !removeIds.has(m.id));
    });
    toast.success('Deleted permanently');
  }, []);

  const removeFromQueue = useCallback((id: string) => {
    setPromptQueue((q) => q.filter((p) => p.id !== id));
  }, []);

  const editQueuedPrompt = useCallback((id: string, text: string) => {
    setPromptQueue((q) => q.map((p) => (p.id === id ? { ...p, text } : p)));
    setPrompt(text);
  }, []);

  const continueQueuedWhenReady = useCallback((id: string) => {
    setPromptQueue((q) => q.map((p) => (p.id === id ? { ...p, hold: false } : p)));
    toast.success('Will start when the current build finishes');
    if (!heavyBuildActiveRef.current) {
      setTimeout(() => {
        const item = queueRef.current.find((p) => p.id === id && !p.hold);
        if (!item) return;
        setPromptQueue((prev) => prev.filter((p) => p.id !== item.id));
        void submitRef.current(item.text, true);
      }, 40);
    }
  }, []);

  const holdQueuedBuild = useCallback((id: string) => {
    setPromptQueue((q) => q.map((p) => (p.id === id ? { ...p, hold: true } : p)));
    toast('Held — tap Continue when ready');
  }, []);

  const sendQueuedNow = useCallback((id: string) => {
    const item = queueRef.current.find((p) => p.id === id);
    if (!item) return;

    // Never kill an in-progress heavy build for a queued second build.
    if (item.lane === 'heavy' && heavyBuildActiveRef.current) {
      setPromptQueue((q) => q.map((p) => (p.id === id ? { ...p, hold: false } : p)));
      toast.success('Priority kept — starts right after the current build (won’t stop it)');
      return;
    }

    setPromptQueue((q) => q.filter((p) => p.id !== id));
    if (item.lane === 'light' && lightBusyRef.current) {
      lightAbortRef.current?.abort();
      setLightLoading(false);
      lightBusyRef.current = false;
    } else if (loading && !heavyBuildActiveRef.current) {
      skipNextQueueRef.current = true;
      interruptRef.current = true;
      abortRef.current?.abort();
      cleanupInProgressAssistant();
      setHeavyLoading(false);
      setLightLoading(false);
      setSwarmRunning(false);
    }
    void submitRef.current(item.text, false, item.lane !== 'heavy');
  }, [loading, cleanupInProgressAssistant, setSwarmRunning]);

  const clearQueue = useCallback(() => setPromptQueue([]), []);

  const updateFeatureOutput = useCallback((messageId: string, output: unknown) => {
    setMessages((m) =>
      m.map((msg) => (msg.id === messageId ? { ...msg, featureOutput: output } : msg))
    );
  }, []);

  /** Light lane while a heavy build runs — chat/planning without clearing todos. */
  const submitLightAlongsideHeavy = useCallback(
    async (userPrompt: string) => {
      if (lightBusyRef.current) {
        enqueuePrompt(userPrompt, 'light');
        setPrompt('');
        return;
      }

      const userMessageId = crypto.randomUUID();
      const assistantId = crypto.randomUUID();
      const displayPrompt = userPrompt.trim();
      setMessages((m) => [
        ...m,
        { id: userMessageId, role: 'user', content: displayPrompt, createdAt: Date.now() },
      ]);
      setPrompt('');
      setLightLoading(true);
      lightBusyRef.current = true;

      const controller = new AbortController();
      lightAbortRef.current = controller;
      setAnimatingId(assistantId);
      setMessages((m) => [
        ...m,
        { id: assistantId, role: 'assistant', content: '', createdAt: Date.now(), agent: 'Xroga AI Brain' },
      ]);

      const history = buildCompletedChatHistory(
        messages.map((m) => ({
          role: m.role,
          content:
            (m.content ?? '').length > 1200
              ? `${(m.content ?? '').slice(0, 1200)}…`
              : (m.content ?? ''),
        })),
      );

      try {
        const result = await runLightLaneChat({
          prompt: displayPrompt,
          history,
          signal: controller.signal,
          onPartial: (partial) => {
            setMessages((m) =>
              m.map((msg) =>
                msg.id === assistantId
                  ? { ...msg, content: partial, agent: 'Xroga AI Brain' }
                  : msg
              )
            );
          },
        });
        if (result.webSources?.length || result.hackathonBrief) {
          setMessages((m) =>
            m.map((msg) =>
              msg.id === assistantId
                ? {
                    ...msg,
                    webSources: result.webSources,
                    hackathonBrief: result.hackathonBrief as ChatMessage['hackathonBrief'],
                  }
                : msg
            )
          );
        }
        if (
          result.usage &&
          typeof result.usage.totalTokensRemaining === 'number' &&
          result.usage.totalTokensRemaining + result.usage.totalTokensUsed > 0
        ) {
          setTokenUsage({
            ...result.usage,
            totalLimit: result.usage.totalTokensRemaining + result.usage.totalTokensUsed,
            quotaPeriodStart: new Date().toISOString().slice(0, 10),
            emergencyTokensAvailable: false,
            emergencyTokensClaimedThisMonth: false,
          });
        }
        // Always re-fetch DB-authoritative usage after a chat turn
        refreshTokenUsage();
        if (!incognito) {
          setMessages((current) => {
            try {
              archiveChatTurn({
                prompt: displayPrompt,
                messages: current,
                userMessageId,
                assistantMessageId: assistantId,
              });
              const selected = getSelectedRepoContext();
              saveTerminalHistorySession({
                sessionId: sessionIdRef.current,
                prompt: displayPrompt,
                messages: current,
                forceRepo: selected?.repo,
                forceBranch: selected?.branch,
              });
              void import('@/lib/syncRepoTerminalSessions').then(({ ensureLiveTerminalUnderSelectedRepo }) => {
                ensureLiveTerminalUnderSelectedRepo({
                  sessionId: sessionIdRef.current,
                  messages: current,
                  prompt: displayPrompt,
                  flushCloud: true,
                });
                window.dispatchEvent(new CustomEvent('xroga-resume-workspace'));
              });
            } catch {
              /* ignore */
            }
            return current;
          });
        }
      } catch (err) {
        if ((err as Error)?.name !== 'AbortError') {
          const msg = (err as Error)?.message || 'Chat failed';
          setMessages((m) =>
            m.map((msgRow) => (msgRow.id === assistantId ? { ...msgRow, content: msg } : msgRow))
          );
          toast.error(msg);
        }
      } finally {
        lightBusyRef.current = false;
        lightAbortRef.current = null;
        setLightLoading(false);
        // Keep animatingId on heavy assistant if build still running.
        if (heavyBuildActiveRef.current && heavyAssistantId) {
          setAnimatingId(heavyAssistantId);
        } else {
          setAnimatingId(null);
        }
        setTimeout(processNextInQueue, 50);
      }
    },
    [
      messages,
      enqueuePrompt,
      incognito,
      refreshTokenUsage,
      setTokenUsage,
      heavyAssistantId,
      processNextInQueue,
    ]
  );

  const submit = useCallback(
    async (
      overrideText?: string,
      fromQueue = false,
      interrupt = false,
      attachments?: ChatAttachment[]
    ) => {
      const userPrompt = (overrideText ?? prompt).trim();
      if (!userPrompt && !attachments?.length) return;

      const lane = classifyWorkLane(userPrompt, messages, attachments, {
        completedWebsiteBuild: completedWebsiteBuildRef.current,
      });

      // Two lanes: light chat/planning always open during any heavy job.
      if (heavyJobActiveRef.current && lane === 'light' && !interrupt) {
        await submitLightAlongsideHeavy(userPrompt);
        return;
      }

      if (heavyJobActiveRef.current && lane === 'heavy' && !fromQueue) {
        enqueuePrompt(userPrompt, 'heavy');
        setPrompt('');
        return;
      }

      if (heavyJobActiveRef.current && lane === 'heavy' && fromQueue) {
        if (heavyLoading) {
          enqueuePrompt(userPrompt, 'heavy');
          return;
        }
      }

      if (loading && interrupt) {
        // Interrupt never kills an active heavy build unless the user pressed Stop on that build.
        if (heavyJobActiveRef.current && lane === 'heavy') {
          toast.error('Finish or stop the current build before starting another');
          enqueuePrompt(userPrompt, 'heavy');
          setPrompt('');
          return;
        }
        skipNextQueueRef.current = true;
        interruptRef.current = true;
        abortRef.current?.abort();
        cleanupInProgressAssistant();
        setHeavyLoading(false);
        setLightLoading(false);
        setSwarmRunning(false);
        setPipelineMessage(null);
        setImageProgressStep(null);
        setImageAttempts([]);
      } else if (loading && !fromQueue) {
        enqueuePrompt(userPrompt, lane);
        setPrompt('');
        return;
      } else if (loading) {
        return;
      }

      // Website/blog builds: do NOT hard-block on GitHub — ship sandbox preview first.
      // GitHub gate only for update continuations that already depend on an existing repo.
      const websiteBuildStart = isWebsiteBuildPrompt(userPrompt);
      if (
        !websiteBuildStart &&
        (requiresGitHubForBuild(userPrompt) || isBuildThreadContinuation(userPrompt, messages))
      ) {
        try {
          const gh = await api.github.status();
          if (!gh.connected) {
            clearGitHubConnectedSession();
            skipGithubGateRef.current = false;
            pendingBuildRef.current = { userPrompt, fromQueue, interrupt, attachments };
            setGithubGateOpen(true);
            return;
          }
          markGitHubConnectedSession();
        } catch {
          pendingBuildRef.current = { userPrompt, fromQueue, interrupt, attachments };
          setGithubGateOpen(true);
          return;
        }
      } else if (websiteBuildStart) {
        // Soft-check GitHub in background — never block the build card
        void api.github
          .status()
          .then((gh) => {
            if (gh.connected) markGitHubConnectedSession();
            else clearGitHubConnectedSession();
          })
          .catch(() => clearGitHubConnectedSession());
      }

      const userMessageId = crypto.randomUUID();
      const assistantId = crypto.randomUUID();
      const displayPrompt =
        userPrompt ||
        (attachments?.length ? defaultImageAttachmentPrompt('') : '');
      lastTurnRef.current = { userMessageId, assistantId, text: displayPrompt };
      setMessages((m) => [
        ...m,
        {
          id: userMessageId,
          role: 'user',
          content: attachments?.length
            ? `${displayPrompt}${displayPrompt ? '\n' : ''}📎 ${attachments.length} file(s) attached`
            : displayPrompt,
          createdAt: Date.now(),
        },
      ]);
      if (!fromQueue) setPrompt('');

      // Advice/Q&A inside a repo terminal must never look like a code build
      const adviceTurn = isGeneralAdviceOrKnowledgePrompt(displayPrompt);
      const codeBuildActive =
        !adviceTurn &&
        isCodeBuildProcessing(displayPrompt, messages, {
          completedBuildRef: completedWebsiteBuildRef.current,
        });
      const selectedRepoForUpdate = getSelectedRepoContext()?.repo;
      const isBuildUpdateEarly =
        !adviceTurn &&
        (isWebsiteBuildUpdate(displayPrompt, messages) ||
          (completedWebsiteBuildRef.current && isWebsiteUpdateRequest(displayPrompt)) ||
          (Boolean(selectedRepoForUpdate?.includes('/')) && isWebsiteUpdateRequest(displayPrompt)));
      const startingHeavyJob = !adviceTurn && (lane === 'heavy' || codeBuildActive || isBuildUpdateEarly);
      const startingHeavyBuild =
        !adviceTurn &&
        (codeBuildActive ||
          isWebsiteBuildPrompt(displayPrompt) ||
          isWebsiteBuildUpdate(displayPrompt, messages) ||
          isBuildUpdateEarly ||
          isBuildThreadContinuation(displayPrompt, messages));

      if (startingHeavyJob) {
        setHeavyLoading(true);
        heavyJobActiveRef.current = true;
        if (startingHeavyBuild) {
          setHeavyBuildActive(true);
          heavyBuildActiveRef.current = true;
          setHeavyAssistantId(assistantId);
          setDeepseekPeakNudge(null);
        }
      } else {
        setLightLoading(true);
      }
      setSwarmRunning(true);
      setSwarmActiveAgent(null);
      setPipelineMessage(null);
      setCouncilLayer(null);
      thinkingStepsRef.current = [];
      thinkingStartedAtRef.current = Date.now();
      setThinkingSteps([]);
      setThinkingStartedAt(Date.now());
      setImageProgressStep(null);
      setImageAttempts([]);
      setFollowUps([]);
      setReasoning(null);
      setDag(null);

      // Never wipe live build todos unless this submit is starting a heavy build.
      // Light/advice turns clear leftover build chrome so #1 terminal can show chat thinking again.
      if (startingHeavyBuild) {
        setSwarmNegotiationPhase(null);
        setSwarmTodos([]);
        buildTodosSeedRef.current = [];
        liveBuildSnapshotRef.current = { todos: [], phase: null, activity: [] };
        setSwarmStatusLabel(null);
        setSwarmAnalysis(null);
        setSwarmActivityLog([]);
      } else if (adviceTurn || lane === 'light') {
        setSwarmNegotiationPhase(null);
        setSwarmTodos([]);
        setSwarmStatusLabel(null);
        setSwarmAnalysis(null);
        setHeavyBuildActive(false);
        heavyBuildActiveRef.current = false;
      }

      const useCompactPipeline =
        !isBuildThreadContinuation(displayPrompt, messages) &&
        !isWebsiteBuildUpdate(displayPrompt, messages) &&
        !isBuildUpdateEarly &&
        !(completedWebsiteBuildRef.current && isWebsiteUpdateRequest(displayPrompt)) &&
        !(activeWebsiteBuildRef.current && looksLikeBuildClarificationAnswer(displayPrompt)) &&
        !codeBuildActive &&
        (isTrivialPrompt(userPrompt) || isSimpleChat(userPrompt));
      setPipelineCompact(useCompactPipeline);

      if (!codeBuildActive && !useCompactPipeline && !startingHeavyJob) {
        thinkingStepsRef.current = [
          'Analyzing your question',
          'Composing a clear response',
        ];
        setThinkingSteps([...thinkingStepsRef.current]);
        setPipelineMessage('Composing your answer…');
      }

      if (startingHeavyBuild) {
        setSwarmNegotiationPhase(0);
        setSwarmStatusLabel('Connected');
        const seededTodos: typeof liveBuildSnapshotRef.current.todos = [];
        buildTodosSeedRef.current = seededTodos;
        liveBuildSnapshotRef.current.todos = seededTodos;
        setSwarmTodos(seededTodos);
        const startMsg = startPipelineMessageForPrompt(displayPrompt);
        setPipelineMessage(startMsg);
        thinkingStepsRef.current = [];
        setThinkingSteps([]);
        setSwarmActivityLog([startMsg]);
        lastActivityAtRef.current = Date.now();
        lastRealProgressAtRef.current = Date.now();
        stallAbortRef.current = false;
        addPendingBuildJob({
          assistantMessageId: assistantId,
          userMessageId: userMessageId,
          userPrompt: displayPrompt,
          startedAt: Date.now(),
        });
        void requestBuildNotificationPermission();
      }

      let gotEvent = false;
      let fullReply = '';
      let buildHadVisibleResult = false;
      const controller = new AbortController();
      abortRef.current = controller;

      startTerminalRun();

      thinkingTimerRef.current = setTimeout(() => {
        if (!gotEvent && !codeBuildActive) setPipelineMessage('Thinking…');
      }, 1500);

      try {
        // Paint assistant row immediately — don't wait on auth before the bubble appears
        setMessages((m) => [...m, { id: assistantId, role: 'assistant', content: '', createdAt: Date.now() }]);
        setAnimatingId(assistantId);
        setPipelineMessage('Starting build…');

        const supabase = createClient();
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.access_token) throw new Error('Please sign in to chat.');
        const accessToken = session.access_token;

        const threadForMemory: ChatMessage[] = [
          ...messages,
          {
            id: userMessageId,
            role: 'user',
            content: displayPrompt,
            createdAt: Date.now(),
          },
        ];
        const apiPrompt = buildPromptWithMemory(displayPrompt, threadForMemory);
        const buildSession = activeWebsiteBuildRef.current;
        const isBuildAnswer =
          Boolean(buildSession) && looksLikeBuildClarificationAnswer(displayPrompt);
        const repoContextEarly = getSelectedRepoContext();
        // Selected repo + update language → incremental GitHub patch (not advice essays)
        const isBuildUpdate =
          !adviceTurn &&
          (isWebsiteBuildUpdate(displayPrompt, threadForMemory) ||
            (completedWebsiteBuildRef.current && isWebsiteUpdateRequest(displayPrompt)) ||
            (Boolean(repoContextEarly?.repo?.includes('/')) &&
              isWebsiteUpdateRequest(displayPrompt)));

        // Prefer the LIVE workspace project (OrbitVault), not a later bad "Crypto Pulse" card.
        let priorSite:
          | { html: string; css?: string; js?: string; projectName?: string }
          | undefined;
        if (isBuildUpdate) {
          try {
            const { useProjectWorkspaceStore } = await import('@/store/useProjectWorkspaceStore');
            const ws = useProjectWorkspaceStore.getState();
            if (ws.html?.trim().length > 40) {
              priorSite = {
                html: ws.html.slice(0, 80_000),
                css: ws.css?.slice(0, 40_000),
                js: ws.js?.slice(0, 40_000),
                projectName: ws.projectName || undefined,
              };
            }
          } catch {
            /* ignore */
          }

          const candidates: Array<{
            html: string;
            css?: string;
            js?: string;
            projectName?: string;
            score: number;
          }> = [];
          for (let i = threadForMemory.length - 1; i >= 0; i--) {
            const fo = threadForMemory[i]?.featureOutput as
              | {
                  type?: string;
                  html?: string;
                  css?: string;
                  js?: string;
                  projectName?: string;
                }
              | undefined;
            if (fo?.type === 'landing_page' && typeof fo.html === 'string' && fo.html.trim().length > 40) {
              const name = (fo.projectName || '').toLowerCase();
              const html = fo.html;
              let score = html.length;
              if (/orbit|vault/i.test(name) || /orbitvault/i.test(html)) score += 50_000;
              if (/swap|stake|connect wallet/i.test(html)) score += 20_000;
              if (/crypto\s*pulse/i.test(name) || /crypto\s*pulse/i.test(html)) score -= 40_000;
              if (priorSite?.projectName && name === priorSite.projectName.toLowerCase()) score += 30_000;
              candidates.push({
                html: html.slice(0, 80_000),
                css: typeof fo.css === 'string' ? fo.css.slice(0, 40_000) : undefined,
                js: typeof fo.js === 'string' ? fo.js.slice(0, 40_000) : undefined,
                projectName: typeof fo.projectName === 'string' ? fo.projectName : undefined,
                score,
              });
            }
          }
          candidates.sort((a, b) => b.score - a.score);
          const best = candidates[0];
          if (best) {
            const wsPulse =
              priorSite &&
              /crypto\s*pulse/i.test(`${priorSite.projectName || ''} ${priorSite.html.slice(0, 2500)}`);
            const bestOrbit =
              /orbit\s*vault|orbitvault/i.test(`${best.projectName || ''} ${best.html.slice(0, 2500)}`) ||
              (/\bswap\b/i.test(best.html) && /\bstake\b/i.test(best.html));
            // Restore OrbitVault if workspace was overwritten by Crypto Pulse
            if (!priorSite || (wsPulse && bestOrbit)) {
              priorSite = {
                html: best.html,
                css: best.css,
                js: best.js,
                projectName: best.projectName,
              };
            }
          }
        }

        // Never send prior build essays with "hi"/thanks — that burns tokens and continues the blog guide.
        let history = isTrivialPrompt(displayPrompt)
          ? ([] as Array<{ role: 'user' | 'assistant'; content: string }>)
          : buildCompletedChatHistory(
              messages.map((m) => {
                let content = m.content?.trim() ?? '';
                if (!content && m.featureOutput && typeof m.featureOutput === 'object') {
                  const output = m.featureOutput as {
                    type?: string;
                    summary?: string;
                    deployUrl?: string;
                  };
                  if (output.type === 'landing_page') {
                    content = output.summary ?? `Built website: ${output.deployUrl ?? 'preview ready'}`;
                  }
                }
                if (content.length > 1200) content = `${content.slice(0, 1200)}…`;
                return { role: m.role, content };
              }),
            );
        if (buildSession && isBuildAnswer) {
          const hasPhase1 = history.some((h) => isPhase1BuildQuestion(h.content));
          if (!hasPhase1) {
            history = [
              { role: 'user', content: buildSession.originalPrompt },
              { role: 'assistant', content: buildSession.phase1Reply },
              ...history,
            ];
          }
        }

        const repoContext = repoContextEarly ?? getSelectedRepoContext();
        // Sticky fallback ONLY for updates — never for greenfield (wrong-product risk).
        let stickyTargetRepo = repoContext?.repo;
        let stickyTargetBranch = repoContext?.branch ?? 'main';
        if (isBuildUpdate && !stickyTargetRepo?.includes('/')) {
          try {
            const ghStatus = await api.github.status();
            if (ghStatus.defaultRepo?.includes('/')) {
              stickyTargetRepo = ghStatus.defaultRepo;
              stickyTargetBranch = 'main';
              saveSelectedRepoContext({ repo: stickyTargetRepo, branch: stickyTargetBranch });
              notifyGithubRepoContext(stickyTargetRepo, stickyTargetBranch);
            }
          } catch {
            /* non-blocking */
          }
        }

        const usePhase1Engine =
          !isBuildUpdate &&
          shouldRouteToPhase1(displayPrompt, threadForMemory, attachments, {
            completedWebsiteBuild: completedWebsiteBuildRef.current,
            selectedRepo: stickyTargetRepo ?? repoContext?.repo ?? repoContextEarly?.repo,
          });

        let runSwarmBuild = !usePhase1Engine;

        if (usePhase1Engine) {
          setPipelineCompact(false);
          setHeavyBuildActive(false);
          heavyBuildActiveRef.current = false;
          setSwarmTodos([]);
          setSwarmNegotiationPhase(null);
          const mathPrompt = isMathQueryPrompt(displayPrompt);
          setPipelineMessage(mathPrompt ? 'Working through the math…' : 'Composing your answer…');
          setSwarmStatusLabel('XROGA AI');
          setSwarmActiveAgent('architect');
          thinkingStepsRef.current = mathPrompt
            ? [
                'Reading your math problem',
                'Working through each step',
                'Formatting a clear solution',
              ]
            : [
                'Understanding your question',
                'Composing a structured response',
              ];
          setThinkingSteps([...thinkingStepsRef.current]);
          pushSwarmTerminalLine(
            mathPrompt ? 'Math solver → step-by-step solution…' : 'Composing a clear answer…'
          );

          try {
            const result = await api.phase1.chat(displayPrompt, history, attachments);
            gotEvent = true;
            fullReply = (result.response || '').trim();
            // Empty Phase 1 must never leave a blank bubble — fall through to swarm or show retry text
            if (!fullReply) {
              if (isWebsiteBuildPrompt(displayPrompt) || requiresGitHubForBuild(displayPrompt)) {
                runSwarmBuild = true;
                setPipelineMessage('Switching to XROGA build swarm…');
              } else {
                fullReply =
                  'I could not finish that reply. Please send your question again — I am ready to answer.';
              }
            }

            if (fullReply && !runSwarmBuild) {
              await streamTextReveal(
                fullReply,
                (partial) => {
                  setMessages((m) =>
                    m.map((msg) =>
                      msg.id === assistantId
                        ? {
                            ...msg,
                            content: partial,
                            agent: 'Xroga AI Brain',
                            webSources: result.webSources,
                            hackathonBrief: result.hackathonBrief,
                          }
                        : msg
                    )
                  );
                },
                controller.signal
              );

              if (result.webSources?.length || result.hackathonBrief) {
                setMessages((m) =>
                  m.map((msg) =>
                    msg.id === assistantId
                      ? { ...msg, webSources: result.webSources, hackathonBrief: result.hackathonBrief }
                      : msg
                  )
                );
              }

              if (
                result.usage &&
                typeof result.usage.totalTokensRemaining === 'number' &&
                result.usage.totalTokensRemaining + (result.usage.totalTokensUsed ?? 0) > 0
              ) {
                setTokenUsage({
                  ...result.usage,
                  totalLimit:
                    result.usage.totalTokensRemaining + (result.usage.totalTokensUsed ?? 0),
                  quotaPeriodStart: new Date().toISOString().slice(0, 10),
                  emergencyTokensAvailable: false,
                  emergencyTokensClaimedThisMonth: false,
                });
              }
              refreshTokenUsage();
            }
          } catch (phase1Err) {
            // Server rejected a product-build that slipped into chat — fall through to real build swarm.
            const code =
              phase1Err instanceof ApiError ? String(phase1Err.data?.code ?? '') : '';
            if (code === 'USE_BUILD_PIPELINE' || (phase1Err instanceof ApiError && phase1Err.status === 409)) {
              runSwarmBuild = true;
              setPipelineMessage('Switching to XROGA build swarm…');
              pushSwarmTerminalLine(
                isWebsiteUpdateRequest(displayPrompt)
                  ? 'Update request detected — patching your GitHub files…'
                  : 'Build request detected — starting real site generation…'
              );
              if (
                isWebsiteBuildPrompt(displayPrompt) ||
                requiresGitHubForBuild(displayPrompt) ||
                isWebsiteUpdateRequest(displayPrompt)
              ) {
                setHeavyBuildActive(true);
                heavyBuildActiveRef.current = true;
                setSwarmNegotiationPhase(0);
                setSwarmStatusLabel('XROGA Architect');
                const seededTodos: typeof liveBuildSnapshotRef.current.todos = [];
                buildTodosSeedRef.current = seededTodos;
                liveBuildSnapshotRef.current.todos = seededTodos;
                setSwarmTodos(seededTodos);
              }
            } else {
              throw phase1Err;
            }
          }
        }

        if (runSwarmBuild) {
        let bufferedDelta = '';
        let deltaTimer: ReturnType<typeof setTimeout> | null = null;
        const flushBufferedDelta = () => {
          if (deltaTimer) clearTimeout(deltaTimer);
          deltaTimer = null;
          if (!bufferedDelta) return;
          const chunk = bufferedDelta;
          bufferedDelta = '';
          setMessages((current) =>
            current.map((message) =>
              message.id === assistantId
                ? { ...message, content: message.content + chunk }
                : message,
            ),
          );
        };
        await streamSwarmExecute(apiPrompt, {
          projectId,
          signal: controller.signal,
          compact: useCompactPipeline,
          accessToken,
          attachments,
          history,
          clientMeta: {
            assistantMessageId: assistantId,
            userMessageId: userMessageId,
            userPrompt: displayPrompt,
            buildContinuation: isBuildAnswer,
            buildOriginalPrompt: buildSession?.originalPrompt,
            buildUpdate:
              isBuildUpdate ||
              (Boolean(stickyTargetRepo?.includes('/')) && isWebsiteUpdateRequest(displayPrompt)),
            githubTargetRepo: stickyTargetRepo,
            githubTargetBranch: stickyTargetBranch,
            // Only meaningful when no repo is selected, since that is the case where the
            // build creates one. Read at send time rather than captured earlier so the
            // value sent is the one currently shown in the chatbar.
            githubVisibility: getNewRepoVisibility(),
            preferredVercelProject: (() => {
              try {
                return localStorage.getItem('xroga_vercel_preferred_project')?.trim() || undefined;
              } catch {
                return undefined;
              }
            })(),
            ...(priorSite ? { priorSite } : {}),
          },
          onStart: (runId) => {
            activeRunIdRef.current = runId;
            if (startingHeavyBuild) attachPendingBuildRun(assistantId, runId);
          },
          onReconnect: () => {
            setPipelineMessage('Build continues safely in the background... reconnecting');
            setSwarmStatusLabel('Reconnecting');
          },
          onProgress: (event) => {
            gotEvent = true;
            if (typeof event.sequence === 'number') {
              updatePendingBuildSequence(assistantId, event.sequence);
            }
            if (thinkingTimerRef.current) {
              clearTimeout(thinkingTimerRef.current);
              thinkingTimerRef.current = null;
            }
            const swarmEv = event as SwarmProgressEvent;
            // Fed before the keepalive bail-out below: the adapter drops keepalive
            // noise itself, but still surfaces a permission gate attached to one.
            pushTerminalEvent('progress', swarmEv as unknown as Record<string, unknown>);
            // Silent keepalives: refresh todos only — never fake pipeline activity
            if (swarmEv.keepalive) {
              if (swarmEv.swarmTodos?.length) {
                setSwarmTodos((prev) => {
                  const seeded = buildTodosSeedRef.current.length ? buildTodosSeedRef.current : prev;
                  const merged = normalizeActiveTodo(mergeBuildTodos(seeded, swarmEv.swarmTodos!));
                  liveBuildSnapshotRef.current.todos = merged;
                  return merged;
                });
              }
              return;
            }

            const rawLabel = event.message || event.status || '';
            const label = sanitizeXrogaTerminalText(rawLabel);
            const isKeepaliveLine = !label || isKeepaliveActivity(label) || /^phase_\d+$/i.test(label);

            if (label && !isKeepaliveLine) {
              setPipelineMessage(label);
              if (!thinkingStepsRef.current.includes(label)) {
                thinkingStepsRef.current = [...thinkingStepsRef.current, label];
                setThinkingSteps([...thinkingStepsRef.current]);
              }
            }
            if (event.imageStep) setImageProgressStep(event.imageStep);
            if (event.imageAttempt?.imageUrl) {
              setImageAttempts((prev) => {
                if (prev.some((a) => a.imageUrl === event.imageAttempt!.imageUrl)) return prev;
                return [...prev, event.imageAttempt!].slice(0, 4);
              });
            }
            if (event.message && !isKeepaliveLine) {
              setPipelineMessage(sanitizeXrogaTerminalText(event.message));
            }
            const layer = (event as { councilLayer?: 'elite' | 'reserve' | 'blackhole' }).councilLayer;
            if (layer) setCouncilLayer(layer);
            if (event.agent) setSwarmActiveAgent(event.agent);
            if (!isKeepaliveLine) {
              dispatchCompanionEvent({
                type: 'runtime_progress',
                operation: operationFromProgress(event.agent, label),
                message: label || undefined,
                source: 'runtime',
              });
            }
            // Prefer negotiationPhase so chips advance (userFacingPhase was often stuck at 1).
            const negPhase = swarmEv.negotiationPhase ?? swarmEv.userFacingPhase;
            const agentPhase =
              negPhase != null
                ? negPhase
                : event.agent === 'converter'
                  ? 2
                  : event.agent === 'architect'
                    ? 3
                    : event.agent === 'builder'
                      ? 4
                      : event.agent === 'qa' || event.agent === 'reviewer' || event.agent === 'compiler'
                        ? 6
                        : event.agent === 'security'
                          ? 7
                          : event.agent === 'deploy'
                            ? 8
                            : event.agent === 'research'
                              ? 1
                              : null;
            const prevPhase = liveBuildSnapshotRef.current.phase;
            if (agentPhase != null) setSwarmNegotiationPhase(agentPhase);
            let todosChanged = false;
            if (swarmEv.swarmTodos?.length) {
              const seeded = buildTodosSeedRef.current.length
                ? buildTodosSeedRef.current
                : liveBuildSnapshotRef.current.todos;
              const merged = normalizeActiveTodo(mergeBuildTodos(seeded, swarmEv.swarmTodos));
              const prevKey = liveBuildSnapshotRef.current.todos
                .map((t) => `${t.id}:${t.status}`)
                .join('|');
              const nextKey = merged.map((t) => `${t.id}:${t.status}`).join('|');
              todosChanged = prevKey !== nextKey;
              liveBuildSnapshotRef.current.todos = merged;
              setSwarmTodos(merged);
            }
            if (agentPhase != null) {
              liveBuildSnapshotRef.current.phase = agentPhase;
            }
            if (swarmEv.swarmStatusLabel) {
              setSwarmStatusLabel(sanitizeXrogaTerminalText(swarmEv.swarmStatusLabel));
            }
            if (swarmEv.swarmStatusLabel && codeBuildActive && !isKeepaliveLine) {
              const modelLabel = sanitizeXrogaTerminalText(swarmEv.swarmStatusLabel);
              if (modelLabel && !thinkingStepsRef.current.some((s) => s.includes(modelLabel))) {
                const stepLine = `[${modelLabel}] ${sanitizeXrogaTerminalText(event.message ?? 'Working…')}`;
                if (!thinkingStepsRef.current.includes(stepLine)) {
                  thinkingStepsRef.current = [...thinkingStepsRef.current, stepLine];
                  setThinkingSteps([...thinkingStepsRef.current]);
                }
              }
            }
            if (swarmEv.swarmAnalysis) {
              setSwarmAnalysis(sanitizeXrogaTerminalText(swarmEv.swarmAnalysis));
            }
            const activity = swarmEv.swarmActivity ?? swarmEv.message;
            const activityText = activity ? sanitizeXrogaTerminalText(activity) : '';
            const realActivity = Boolean(activityText) && !isKeepaliveActivity(activityText);
            if (realActivity) {
              liveBuildSnapshotRef.current.activity = [
                ...liveBuildSnapshotRef.current.activity,
                activityText,
              ].slice(-24);
              pushSwarmTerminalLine(activityText);
            }
            // Stall clock only moves on real progress (todo/phase/activity), not heartbeats
            if (realActivity || todosChanged || (agentPhase != null && agentPhase !== prevPhase)) {
              lastRealProgressAtRef.current = Date.now();
              lastActivityAtRef.current = Date.now();
            }
            if (swarmEv.needsGitHub) {
              // Backend said GitHub OAuth is missing — force the gate (ignore stale session flag)
              clearGitHubConnectedSession();
              skipGithubGateRef.current = false;
              pendingBuildRef.current = {
                userPrompt: displayPrompt,
                fromQueue: false,
                interrupt: false,
                attachments,
              };
              setGithubGateOpen(true);
              pushSwarmTerminalLine(
                'Authorize GitHub now — connect before ship so this build can push live.'
              );
            } else if (swarmEv.needsRepoPick) {
              pendingBuildRef.current = {
                userPrompt: displayPrompt,
                fromQueue: false,
                interrupt: false,
                attachments,
              };
              void api.github.status().then(async (gh) => {
                if (gh.connected) {
                  const { notifyOpenRepoPicker } = await import('@/lib/githubProjectEvents');
                  notifyOpenRepoPicker();
                  pushSwarmTerminalLine(
                    'Pick the live product repo in the chat bar — then re-send your update.',
                  );
                } else {
                  setGithubGateOpen(true);
                  pushSwarmTerminalLine(
                    'Connect GitHub, then pick the repo to update before shipping.',
                  );
                }
              });
            }
            if (swarmEv.needsVercel) {
              handleVercelBuildBlocked(displayPrompt, attachments);
              pushSwarmTerminalLine(
                'Authorize Vercel now — connect before ship so deploy can finish live.'
              );
            }
            if (swarmEv.status === 'skipped' && swarmEv.agent === 'research') {
              pushSwarmTerminalLine(
                sanitizeXrogaTerminalText(
                  swarmEv.message || 'Research skipped — no live sources available'
                )
              );
            }
            if (swarmEv.status === 'model_fallback' || swarmEv.status === 'model_active') {
              const line = sanitizeXrogaTerminalText(swarmEv.message || '');
              if (line) pushSwarmTerminalLine(line);
            }
            if (swarmEv.hackathonBrief) {
              setMessages((m) =>
                m.map((msg) =>
                  msg.id === assistantId ? { ...msg, hackathonBrief: swarmEv.hackathonBrief } : msg
                )
              );
            }
            if (swarmEv.swarmTodos?.some((t) => t.id === 'github' && t.status === 'done')) {
              skipGithubGateRef.current = false;
            }
            const ev = event as SwarmProgressEvent & { dag?: typeof dag; thinking?: string };
            if (ev.thinking && !useCompactPipeline) setReasoning(ev.thinking);
            if (ev.dag && !useCompactPipeline) setDag(ev.dag);
          },
          onDelta: (delta) => {
            if (!delta) return;
            // Only suppress stream text during intentional product builds (landing card path).
            // Broader codeBuildActive was swallowing chat/error replies → blank bubbles.
            if (startingHeavyBuild) return;
            gotEvent = true;
            fullReply += delta;
            bufferedDelta += delta;
            if (!deltaTimer) deltaTimer = setTimeout(flushBufferedDelta, 32);
          },
          onPreview: (preview) => {
            // LLM finished — show code NOW (do not wait for GitHub/Vercel complete)
            const output = preview.output as Record<string, unknown> | undefined;
            if (!output || output.type !== 'landing_page') return;
            const landingHtml = String((output as { html?: string }).html ?? '').trim();
            const gen = (output as { generatedFiles?: unknown }).generatedFiles;
            const hasFiles =
              landingHtml.length > 40 ||
              (Array.isArray(gen) && gen.length > 0);
            if (!hasFiles) return;
            gotEvent = true;
            buildHadVisibleResult = true;
            setPipelineMessage('Preview ready — finishing GitHub / Vercel…');
            setMessages((m) =>
              m.map((msg) =>
                msg.id === assistantId
                  ? {
                      ...msg,
                      content: '',
                      featureOutput: {
                        ...output,
                        artifactRunId: (preview as { runId?: string }).runId,
                        shipPending: true,
                        type: 'landing_page',
                      },
                    }
                  : msg
              )
            );
            void import('@/store/useProjectWorkspaceStore').then(({ useProjectWorkspaceStore }) => {
              const ws = useProjectWorkspaceStore.getState();
              const projectName =
                (typeof output.projectName === 'string' && output.projectName.trim()) ||
                ws.projectName ||
                'Your project';
              ws.applyBuild({
                projectName,
                html: String(output.html ?? ''),
                css: String(output.css ?? ''),
                js: String(output.js ?? ''),
                projectFiles: Array.isArray((output as { projectFiles?: unknown }).projectFiles)
                  ? (
                      (output as { projectFiles: Array<{ path: string; content: string }> }).projectFiles
                    )
                      .filter((f) => f && typeof f.path === 'string')
                      .map((f) => ({
                        path: f.path,
                        content: typeof f.content === 'string' ? f.content : '',
                        flag: 'generated' as const,
                      }))
                  : undefined,
                status: 'updating',
                changesSummary: Array.isArray(output.changesSummary)
                  ? (output.changesSummary as string[])
                  : ['Preview ready — shipping…'],
                openPreview: true,
                terminalLine: 'Preview ready — finishing GitHub / Vercel…',
              });
            });
          },
          onComplete: (complete) => {
            pushTerminalEvent('complete', complete as unknown as Record<string, unknown>);
            // End "Building…" as soon as the swarm finishes — don't wait for finally /
            // archive work. Waiting time after this is not model spend.
            if (startingHeavyBuild) {
              const finalTodos = Array.isArray(
                (complete.output as { completedTodos?: unknown } | undefined)?.completedTodos,
              )
                ? ((complete.output as { completedTodos: typeof liveBuildSnapshotRef.current.todos })
                    .completedTodos)
                : liveBuildSnapshotRef.current.todos;
              if (finalTodos?.length) {
                const normalized = normalizeActiveTodo(
                  mergeBuildTodos(
                    buildTodosSeedRef.current.length ? buildTodosSeedRef.current : finalTodos,
                    finalTodos,
                  ),
                );
                setSwarmTodos(normalized);
                liveBuildSnapshotRef.current.todos = normalized;
              }
              setHeavyLoading(false);
              setHeavyBuildActive(false);
              heavyBuildActiveRef.current = false;
              heavyJobActiveRef.current = false;
              setSwarmRunning(false);
              setPipelineMessage(null);
            }
            if (complete.tokenUsage) {
              const tu = complete.tokenUsage;
              // Never invent 0 remaining when the field is missing — that flashed “0 tokens left”
              // after builds/hard refresh even when quota was fine.
              const prevUsage = useAppStore.getState().tokenUsage;
              const remaining =
                typeof tu.totalTokensRemaining === 'number'
                  ? tu.totalTokensRemaining
                  : prevUsage?.totalTokensRemaining;
              const used =
                typeof tu.totalTokensUsed === 'number'
                  ? tu.totalTokensUsed
                  : prevUsage?.totalTokensUsed ?? 0;
              if (typeof remaining === 'number') {
                setTokenUsage({
                  inputTokensUsed: tu.inputTokensUsed ?? prevUsage?.inputTokensUsed ?? 0,
                  outputTokensUsed: tu.outputTokensUsed ?? prevUsage?.outputTokensUsed ?? 0,
                  totalTokensUsed: used,
                  inputTokensRemaining:
                    typeof tu.inputTokensRemaining === 'number'
                      ? tu.inputTokensRemaining
                      : prevUsage?.inputTokensRemaining ?? 0,
                  outputTokensRemaining:
                    typeof tu.outputTokensRemaining === 'number'
                      ? tu.outputTokensRemaining
                      : prevUsage?.outputTokensRemaining ?? 0,
                  totalTokensRemaining: remaining,
                  percentUsed: tu.percentUsed ?? prevUsage?.percentUsed ?? 0,
                  quotaPeriodStart:
                    tu.quotaPeriodStart ??
                    prevUsage?.quotaPeriodStart ??
                    new Date().toISOString().slice(0, 10),
                  emergencyTokensAvailable: false,
                  emergencyTokensClaimedThisMonth: false,
                  totalLimit:
                    typeof tu.totalLimit === 'number'
                      ? tu.totalLimit
                      : remaining + used > 0
                        ? remaining + used
                        : prevUsage?.totalLimit || 6_172_222,
                  planBudgetUsd: tu.planBudgetUsd ?? prevUsage?.planBudgetUsd,
                  rolloverUsd: tu.rolloverUsd ?? prevUsage?.rolloverUsd,
                  spentUsd: tu.spentUsd ?? prevUsage?.spentUsd,
                  creditRemainingUsd:
                    tu.creditRemainingUsd ?? prevUsage?.creditRemainingUsd,
                  percentCreditUsed:
                    tu.percentCreditUsed ?? prevUsage?.percentCreditUsed,
                  planTier: tu.planTier ?? prevUsage?.planTier,
                });
              }
            }
            if (complete.followUps?.length) {
              setFollowUps(complete.followUps);
            }
            const output = complete.output as Record<string, unknown> | undefined;
            const chatContent =
              output?.type === 'chat' && typeof output.content === 'string' ? output.content : '';
            const githubConnectionBlocked =
              requiresGitHubForBuild(displayPrompt) &&
              (isGitHubConnectRequiredText(chatContent) ||
                complete.followUps?.some((f) => /connect github/i.test(f)));
            if (githubConnectionBlocked) {
              handleGitHubBuildBlocked(displayPrompt, attachments);
            }
            if (output?.type === 'image_blocked') {
              dispatchCompanionEvent({
                type: 'task_warning',
                message: 'Image generation requires attention before it can continue.',
                source: 'runtime',
              });
              buildHadVisibleResult = true;
              setMessages((m) =>
                m.map((msg) =>
                  msg.id === assistantId
                    ? {
                        ...msg,
                        content: '',
                        featureOutput: output,
                      }
                    : msg
                )
              );
              const blockedFollowUps = Array.isArray(output.followUps)
                ? (output.followUps as string[])
                : undefined;
              if (blockedFollowUps?.length) setFollowUps(blockedFollowUps);
              return;
            }
            if (output?.type === 'image' && typeof output.imageUrl === 'string') {
              dispatchCompanionEvent({
                type: 'task_success',
                message: 'The requested image was generated.',
                source: 'runtime',
              });
              buildHadVisibleResult = true;
              setMessages((m) => {
                const updated = m.map((msg) =>
                  msg.id === assistantId
                    ? { ...msg, content: '', featureOutput: output }
                    : msg
                );
                addMediaItem({
                  name: String(output.prompt ?? 'Xroga image').slice(0, 40),
                  type: 'image',
                  url: output.imageUrl as string,
                  sourceMessageId: assistantId,
                  sourcePrompt: userPrompt,
                  variantUrls: collectVariantUrlsFromOutput(output),
                  messagesSnapshot: updated,
                });
                return updated;
              });
              return;
            }
            if (output?.type === 'landing_page') {
              const landingHtml = String((output as { html?: string }).html ?? '').trim();
              const generatedFiles = Array.isArray(
                (output as { generatedFiles?: unknown }).generatedFiles,
              )
                ? (output as { generatedFiles: unknown[] }).generatedFiles
                : [];
              const hasRenderableLanding =
                landingHtml.length > 40 ||
                Boolean((output as { deployUrl?: string }).deployUrl) ||
                Boolean((output as { githubRepoUrl?: string }).githubRepoUrl) ||
                generatedFiles.some(
                  (path) => typeof path === 'string' && path.trim().length > 0,
                );
              if (!hasRenderableLanding) {
                // Empty landing payload after spend — never leave a blank "No response" bubble
                const failMsg =
                  '⚠️ **Build finished without a preview.** Tokens were used, but no HTML was returned. Tap Retry — we will ship a sandbox site from your prompt.';
                fullReply = failMsg;
                dispatchCompanionEvent({
                  type: 'task_failure',
                  message: 'The build ended without a valid preview.',
                  source: 'runtime',
                });
                setMessages((m) =>
                  m.map((msg) =>
                    msg.id === assistantId
                      ? { ...msg, content: failMsg, featureOutput: undefined }
                      : msg
                  )
                );
                removePendingBuildJob(assistantId);
                return;
              }
              buildHadVisibleResult = true;
              activeWebsiteBuildRef.current = null;
              // Plan A: updates refresh the single docked preview — never spawn a new card/tabs
              const reusePreview =
                Boolean((output as { isUpdate?: boolean }).isUpdate) || isBuildUpdate;
              completedWebsiteBuildRef.current = true;
              removePendingBuildJob(assistantId);
              const outRepo =
                (typeof (output as { githubRepoName?: string }).githubRepoName === 'string' &&
                (output as { githubRepoName: string }).githubRepoName.includes('/')
                  ? (output as { githubRepoName: string }).githubRepoName
                  : undefined) ||
                (repoContext?.repo?.includes('/') ? repoContext.repo : undefined);
              const fileTrailRaw = (
                Array.isArray((output as { fileTrail?: unknown }).fileTrail)
                  ? (output as { fileTrail: NonNullable<ChatMessage['updateTrail']>['files'] }).fileTrail
                  : []
              )
                .filter(
                  (f): f is NonNullable<ChatMessage['updateTrail']>['files'][number] =>
                    Boolean(f) &&
                    typeof f.path === 'string' &&
                    f.path.trim().length > 0,
                )
                .map((f) => ({
                  path: f.path,
                  before: typeof f.before === 'string' ? f.before : '',
                  after: typeof f.after === 'string' ? f.after : '',
                  added: Number.isFinite(Number(f.added)) ? Number(f.added) : 0,
                  removed: Number.isFinite(Number(f.removed)) ? Number(f.removed) : 0,
                }));
              const changesSummary = Array.isArray((output as { changesSummary?: string[] }).changesSummary)
                ? ((output as { changesSummary: string[] }).changesSummary)
                : undefined;
              const previousFiles = Array.isArray((output as { previousFiles?: Array<{ path: string; content: string }> }).previousFiles)
                ? (output as { previousFiles: Array<{ path: string; content: string }> }).previousFiles
                : undefined;

              // Always refresh the one project workspace preview
              let projectName =
                (typeof output.projectName === 'string' && output.projectName.trim()) ||
                priorSite?.projectName ||
                'Your project';
              void import('@/store/useProjectWorkspaceStore').then(({ useProjectWorkspaceStore }) => {
                const ws = useProjectWorkspaceStore.getState();
                // Updates keep current project name (OrbitVault) — never swap to a new invented brand
                projectName = reusePreview
                  ? ws.projectName ||
                    priorSite?.projectName ||
                    (typeof output.projectName === 'string' && output.projectName.trim()) ||
                    'Your project'
                  : (typeof output.projectName === 'string' && output.projectName.trim()) ||
                    priorSite?.projectName ||
                    ws.projectName ||
                    'Your project';
                const nextHtml = String((output as { html?: string }).html ?? '');
                const nextCss = String((output as { css?: string }).css ?? '');
                const nextJs = String((output as { js?: string }).js ?? '');
                // If update returned empty HTML, keep showing the current project preview
                let html = reusePreview && !nextHtml.trim() && ws.html?.trim() ? ws.html : nextHtml;
                let css = reusePreview && !nextCss.trim() && ws.css?.trim() ? ws.css : nextCss;
                let js = reusePreview && !nextJs.trim() && ws.js?.trim() ? ws.js : nextJs;
                // Never replace the current project with a differently branded rebuild on updates
                if (reusePreview && ws.html?.trim() && nextHtml.trim()) {
                  const wsBrand = (ws.projectName || '').trim().toLowerCase();
                  const nextBrand = (projectName || '').trim().toLowerCase();
                  const wsSnippet = ws.html.slice(0, 2500);
                  const nextSnippet = nextHtml.slice(0, 2500);
                  const brandsDiffer =
                    (wsBrand && nextBrand && wsBrand !== nextBrand) ||
                    (/orbit\s*vault|orbitvault/i.test(wsSnippet) &&
                      /crypto\s*pulse/i.test(nextSnippet) &&
                      !/orbit\s*vault|orbitvault/i.test(nextSnippet));
                  const wiped =
                    nextHtml.length < ws.html.length * 0.45 && ws.html.length > 2500;
                  if (brandsDiffer || wiped) {
                    html = ws.html;
                    css = ws.css || css;
                    js = ws.js || js;
                    projectName = ws.projectName || projectName;
                  }
                }
                const workspaceOutcome = deriveLandingOutcome(output, {
                  projectName,
                  isUpdate: reusePreview,
                });
                ws.applyBuild({
                  repo: outRepo,
                  branch:
                    (output as { githubBranch?: string }).githubBranch ||
                    repoContext?.branch ||
                    'main',
                  projectName,
                  html,
                  css,
                  js,
                  projectFiles: Array.isArray((output as { projectFiles?: unknown }).projectFiles)
                    ? (
                        (output as { projectFiles: Array<{ path: string; content: string }> })
                          .projectFiles
                      )
                        .filter((f) => f && typeof f.path === 'string')
                        .map((f) => ({
                          path: f.path,
                          content: typeof f.content === 'string' ? f.content : '',
                          flag: 'generated' as const,
                        }))
                    : undefined,
                  deployUrl:
                    (typeof (output as { deployUrl?: string }).deployUrl === 'string' &&
                    (output as { deployUrl: string }).deployUrl.trim()
                      ? (output as { deployUrl: string }).deployUrl
                      : typeof (output as { vercelPreviewUrl?: string }).vercelPreviewUrl ===
                          'string'
                        ? (output as { vercelPreviewUrl: string }).vercelPreviewUrl
                        : null) || null,
                  githubRepoUrl: (output as { githubRepoUrl?: string }).githubRepoUrl ?? null,
                  commitSha: (output as { commitSha?: string }).commitSha ?? null,
                  status: workspaceOutcome.workspaceStatus,
                  changesSummary,
                  fileTrail: fileTrailRaw,
                  previousFiles: previousFiles ?? null,
                  openPreview: true,
                  terminalLine: workspaceOutcome.terminalLine,
                });
              });

              const browserOutcome = deriveLandingOutcome(output, {
                projectName,
                isUpdate: reusePreview,
              });
              showBuildBrowserNotification({
                title: browserOutcome.headline,
                body: browserOutcome.completionNote,
                tag: `build-done-${assistantId}`,
              });
              setMessages((m) => {
                const paths = Array.isArray((output as { updatedFiles?: string[] }).updatedFiles)
                  ? ((output as { updatedFiles?: string[] }).updatedFiles as string[]).slice(0, 6)
                  : fileTrailRaw.map((f) => f.path);
                const messageOutcome = deriveLandingOutcome(output, {
                  projectName,
                  isUpdate: reusePreview,
                });
                const statusBits = [
                  ...messageOutcome.statusLines,
                  (output as { usedSurgicalPatches?: boolean }).usedSurgicalPatches
                    ? 'Patches · surgical'
                    : null,
                ].filter(Boolean) as string[];

                // Updates + new builds: terminal trail (no separate project card)
                if (reusePreview) {
                  let anchorId: string | null = null;
                  for (let i = 0; i < m.length; i++) {
                    const fo = m[i]?.featureOutput as { type?: string } | undefined;
                    if (m[i]!.id !== assistantId && fo?.type === 'landing_page') {
                      anchorId = m[i]!.id;
                      break;
                    }
                  }
                  const updated = m.map((msg) => {
                    if (anchorId && msg.id === anchorId) {
                      const prev = (msg.featureOutput ?? {}) as Record<string, unknown>;
                      // Keep anchor for memory/preview — do not mark isUpdate (that hid the report)
                      return {
                        ...msg,
                        featureOutput: {
                          ...prev,
                          ...output,
                          artifactRunId: (complete as { runId?: string }).runId,
                          html: (output as { html?: string }).html ?? prev.html,
                          css: (output as { css?: string }).css ?? prev.css,
                          js: (output as { js?: string }).js ?? prev.js,
                          githubRepoName: outRepo ?? prev.githubRepoName,
                          githubRepoUrl:
                            (output as { githubRepoUrl?: string }).githubRepoUrl ?? prev.githubRepoUrl,
                          githubPushConfirmed:
                            (output as { githubPushConfirmed?: boolean }).githubPushConfirmed ??
                            prev.githubPushConfirmed,
                          deployUrl: (output as { deployUrl?: string }).deployUrl ?? prev.deployUrl,
                          deployVerified:
                            (output as { deployVerified?: boolean }).deployVerified ??
                            prev.deployVerified,
                          type: 'landing_page',
                        },
                      };
                    }
                    if (msg.id === assistantId) {
                      return {
                        ...msg,
                        content: '',
                        featureOutput: undefined,
                        updateTrail: {
                          headline: `${messageOutcome.headline}${paths[0] ? ` · ${paths.join(', ')}` : ''}`,
                          changes: changesSummary,
                          files: fileTrailRaw,
                          statusLine: statusBits.join(' · '),
                          previousFiles,
                          githubRepoName: outRepo,
                          githubBranch:
                            (output as { githubBranch?: string }).githubBranch ||
                            repoContext?.branch ||
                            'main',
                        },
                      };
                    }
                    return msg;
                  });
                  const runIdReuse = (complete as { runId?: string }).runId;
                  if (runIdReuse) {
                    void api.swarm.saveConversation(runIdReuse, updated).catch(() => {});
                  }
                  // Persist the final authoritative landing snapshot before any sidebar
                  // refresh or hard reload can restore the earlier ship-pending version.
                  saveWorkspaceSession({
                    prompt: displayPrompt,
                    messages: updated,
                    sessionId: sessionIdRef.current,
                  });
                  saveTerminalHistorySession({
                    sessionId: sessionIdRef.current,
                    prompt: displayPrompt,
                    messages: updated,
                    status: 'complete',
                    forceRepo: outRepo,
                    forceBranch:
                      (output as { githubBranch?: string }).githubBranch ||
                      repoContext?.branch ||
                      'main',
                  });
                  if (anchorId) {
                    const anchor = updated.find((message) => message.id === anchorId);
                    const anchorOutput = anchor?.featureOutput as
                      | { html?: string; css?: string; js?: string }
                      | undefined;
                    if (anchorOutput?.html?.trim()) {
                      void import('@/lib/landingBuildStorage').then(({ saveLandingBuild }) =>
                        saveLandingBuild({
                          messageId: anchorId!,
                          html: anchorOutput.html!,
                          css: anchorOutput.css ?? '',
                          js: anchorOutput.js ?? '',
                        }),
                      );
                    }
                  }
                  void import('@/lib/syncRepoTerminalSessions').then(
                    ({ ensureLiveTerminalUnderSelectedRepo }) => {
                      ensureLiveTerminalUnderSelectedRepo({
                        sessionId: sessionIdRef.current,
                        messages: updated,
                        prompt: displayPrompt,
                        flushCloud: true,
                      });
                    },
                  );
                  return updated;
                }
                const updated = m.map((msg) =>
                  msg.id === assistantId
                    ? {
                        ...msg,
                        content: '',
                        // Terminal report via FeatureOutputView (no card chrome)
                        featureOutput: {
                          ...output,
                          artifactRunId: (complete as { runId?: string }).runId,
                          type: 'landing_page',
                          isUpdate: false,
                          changesSummary:
                            changesSummary ??
                            [
                              messageOutcome.headline,
                              fileTrailRaw.length
                                ? `${fileTrailRaw.length} files in trail`
                                : undefined,
                            ].filter(Boolean),
                          fileTrail: fileTrailRaw.length
                            ? fileTrailRaw
                            : [
                                {
                                  path: 'index.html',
                                  before: '',
                                  after: String((output as { html?: string }).html ?? ''),
                                  added: 0,
                                  removed: 0,
                                },
                              ],
                        },
                        updateTrail: undefined,
                      }
                    : msg
                );
                const runId = (complete as { runId?: string }).runId;
                if (runId) {
                  void api.swarm.saveConversation(runId, updated).catch(() => {});
                }
                const ghName =
                  (typeof output.githubRepoName === 'string' && output.githubRepoName.includes('/')
                    ? output.githubRepoName
                    : undefined) ||
                  (repoContext?.repo?.includes('/') ? repoContext.repo : undefined);
                if (ghName) {
                  registerRepoSession({
                    githubRepoName: ghName,
                    githubBranch: repoContext?.branch ?? 'main',
                    title: projectName.slice(0, 80),
                    sessionId: sessionIdRef.current,
                    status: 'complete',
                  });
                  saveSelectedRepoContext({
                    repo: ghName,
                    branch: repoContext?.branch ?? 'main',
                  });
                  notifyGithubRepoContext(ghName, repoContext?.branch ?? 'main');
                  // Persist sticky default on the server so later prompts / devices hit the same repo
                  void api.github.updateSettings('manual', ghName).catch(() => {});
                  // Save to Supabase even if push later — so sidebar cloud list is never empty
                  void api.projects
                    .create({
                      name: projectName.slice(0, 120),
                      type: 'website',
                      github_repo_url:
                        typeof output.githubRepoUrl === 'string'
                          ? output.githubRepoUrl
                          : `https://github.com/${ghName}`,
                      github_repo_name: ghName,
                      github_branch: repoContext?.branch ?? 'main',
                      deploy_url: typeof output.deployUrl === 'string' ? output.deployUrl : undefined,
                      user_prompt: displayPrompt,
                    })
                    .then((saved) => {
                      attachCloudProjectId(sessionIdRef.current, saved.id);
                      notifyGithubProjectSaved(saved.id);
                    })
                    .catch((err) => console.warn('[projects] save failed', err));
                }
                // Always persist history immediately for sidebar (don't wait for debounce)
                saveTerminalHistorySession({
                  sessionId: sessionIdRef.current,
                  prompt: displayPrompt,
                  messages: updated,
                  status: 'complete',
                });
                return updated;
              });
              return;
            }
            if (codeBuildActive && output && typeof output === 'object' && 'type' in output && output.type !== 'chat') {
              buildHadVisibleResult = true;
              setMessages((m) =>
                m.map((msg) =>
                  msg.id === assistantId ? { ...msg, content: '', featureOutput: output } : msg
                )
              );
              return;
            }
            // Builds previously ignored chat/error completes → blank terminal after a few seconds.
            if (chatContent && !fullReply.trim()) {
              buildHadVisibleResult = true;
              fullReply = chatContent;
              const webSources = (output as { webSources?: ChatMessage['webSources'] })?.webSources;
              const hackathonBrief = (output as { hackathonBrief?: ChatMessage['hackathonBrief'] })?.hackathonBrief;
              setMessages((m) =>
                m.map((msg) =>
                  msg.id === assistantId
                    ? {
                        ...msg,
                        content: chatContent,
                        webSources: webSources ?? msg.webSources,
                        hackathonBrief: hackathonBrief ?? msg.hackathonBrief,
                      }
                    : msg
                )
              );
            }
            if (
              codeBuildActive &&
              (chatContent.includes(GENERIC_SWARM_FALLBACK) || fullReply.includes(GENERIC_SWARM_FALLBACK))
            ) {
              setMessages((m) => {
                const existing = m.find((msg) => msg.id === assistantId);
                const hasLanding =
                  existing?.featureOutput &&
                  typeof existing.featureOutput === 'object' &&
                  (existing.featureOutput as { type?: string }).type === 'landing_page';
                if (hasLanding) return m;
                const buildError =
                  '⚠️ **Build could not finish.** Connect GitHub under Integrations, then try again.';
                fullReply = buildError;
                return m.map((msg) => (msg.id === assistantId ? { ...msg, content: buildError } : msg));
              });
            }
            const text = complete.output
              ? (() => {
                  const o = complete.output as {
                    type?: string;
                    imageUrl?: string;
                    prompt?: string;
                    provider?: string;
                  };
                  if (o.type === 'image' && o.imageUrl) {
                    const alt = (o.prompt ?? 'Generated image').slice(0, 80);
                    return `![${alt}](${o.imageUrl})`;
                  }
                  return null;
                })()
              : null;
            if (text) {
              fullReply = text;
              setMessages((m) =>
                m.map((msg) => (msg.id === assistantId ? { ...msg, content: text } : msg))
              );
            }
            const outputFollowUps = (complete.output as { followUps?: string[] } | undefined)?.followUps;
            if (outputFollowUps?.length) {
              setFollowUps(outputFollowUps);
            }

            const sessionReply = (fullReply || chatContent).trim();
            const unsuccessfulBuildReply =
              codeBuildActive &&
              /build (?:could not|did not|ended without)|update interrupted|connection (?:lost|interrupted)/i.test(sessionReply);
            if (githubConnectionBlocked) {
              dispatchCompanionEvent({
                type: 'task_warning',
                message: 'GitHub authorisation is required before this build can finish.',
                source: 'runtime',
              });
            } else if (unsuccessfulBuildReply) {
              dispatchCompanionEvent({
                type: 'task_failure',
                message: 'The build did not complete successfully.',
                source: 'runtime',
              });
            } else {
              dispatchCompanionEvent({
                type: 'task_success',
                message: codeBuildActive ? 'Xroga completed the build execution.' : 'Xroga completed the response.',
                source: 'runtime',
              });
            }
            if (sessionReply && !githubConnectionBlocked && !unsuccessfulBuildReply) {
              dispatchCompanionEvent({
                type: 'assistant_response',
                message: 'A real Xroga AI response is ready.',
                assistantText: sessionReply,
                source: 'ai',
              });
            }
            if (sessionReply && isPhase1BuildQuestion(sessionReply)) {
              const original =
                [...messages]
                  .reverse()
                  .find(
                    (m) =>
                      m.role === 'user' &&
                      /\b(build|create|make)\b[\s\S]{0,60}\b(website|site|shop|coffee|landing)\b/i.test(
                        m.content ?? ''
                      )
                  )
                  ?.content?.trim() ||
                lastTurnRef.current?.text ||
                displayPrompt;
              activeWebsiteBuildRef.current = {
                originalPrompt: original,
                phase1Reply: sessionReply,
              };
            }

            void refreshTokenUsage();
          },
        });
        flushBufferedDelta();

        // Stream ended empty → never leave a blank bubble (chat or build).
        if (!fullReply.trim() && !buildHadVisibleResult) {
          setMessages((m) => {
            const existing = m.find((msg) => msg.id === assistantId);
            const fo = existing?.featureOutput as { type?: string; html?: string } | undefined;
            const foOk =
              fo?.type === 'landing_page' && typeof fo.html === 'string' && fo.html.trim().length > 40;
            if (existing?.content?.trim() || foOk) return m;
            const fallback = codeBuildActive
              ? '⚠️ **Build ended without a preview.** Tap **Retry** or send the prompt again — if a GitHub repo is already selected, you should not need the Connect popup.'
              : 'I could not finish that reply. Please send your question again — advice and research answers should appear here in the terminal.';
            fullReply = fallback;
            return m.map((msg) =>
              msg.id === assistantId
                ? { ...msg, content: fallback, featureOutput: undefined }
                : msg
            );
          });
        }
        }

      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') {
          // A user-initiated stop is an interruption, not a failure — the run did
          // not fail on its own, and labelling it an error would misreport it.
          dispatchTerminalRun({ type: 'interrupted' });
        } else {
          // ApiError.data carries `code` and, for CAPACITY_UNAVAILABLE, `nextUnlockAt`
          // — spread it through so the adapter can append the unlock time instead of
          // just the bare sentence.
          const errData = err instanceof ApiError ? err.data : {};
          pushTerminalEvent('error', {
            error: err instanceof Error ? err.message : 'Run failed',
            ...errData,
          });
        }
        if (err instanceof DOMException && err.name === 'AbortError') {
          if (interruptRef.current) {
            dispatchCompanionEvent({
              type: 'task_interrupted',
              message: 'You stopped the current operation.',
              source: 'runtime',
            });
            interruptRef.current = false;
            cleanupInProgressAssistant();
            return;
          }
          const wasStall = stallAbortRef.current;
          stallAbortRef.current = false;
          const repo = getSelectedRepoContext()?.repo;
          const snap = liveBuildSnapshotRef.current;
          const todosSnapshot = snap.todos.length ? [...snap.todos] : [...buildTodosSeedRef.current];
          const phaseSnapshot = snap.phase;
          const activitySnapshot = [...snap.activity].slice(-12);
          const original = lastTurnRef.current?.text || displayPrompt;
          dispatchCompanionEvent({
            type: wasStall ? 'task_failure' : 'task_interrupted',
            message: wasStall
              ? 'The build stalled and was safely stopped.'
              : 'The build was stopped with progress preserved.',
            source: 'runtime',
          });
          const stallMessage =
            '⚠️ **Build stalled — no real progress.** Fake busy animations were stopped and further API calls were cancelled to protect your credits.\n\nTap **Retry** to continue, or start a new chat with a clearer prompt.';
          const userStopMessage =
            'Build stopped. Your progress is saved — tap Retry to continue from where you left off (GitHub files kept; not a fresh rebuild).';

          setMessages((m) => {
            const next = m.map((msg) => {
              if (msg.id !== assistantId) return msg;
              return {
                ...msg,
                content: msg.content?.trim() || (wasStall ? stallMessage : userStopMessage),
                buildStopped: true,
                originalBuildPrompt: original,
                githubRepoName: repo,
                stoppedTodos: todosSnapshot.length ? todosSnapshot : msg.stoppedTodos,
                stoppedPhase: phaseSnapshot,
                stoppedActivityLog: activitySnapshot,
                thinkingSteps: thinkingStepsRef.current.length
                  ? [...thinkingStepsRef.current]
                  : msg.thinkingSteps,
                thoughtMs: Date.now() - thinkingStartedAtRef.current,
              };
            });
            // Persist immediately so sidebar history shows Open/stopped even after New chat.
            try {
              if (!usePrivacyStore.getState().incognito) {
                saveTerminalHistorySession({
                  sessionId: sessionIdRef.current,
                  prompt: original,
                  messages: next,
                  status: 'stopped',
                });
                if (shouldSaveToProjects(original)) {
                  saveLocalProject({
                    name: original.slice(0, 48),
                    prompt: original,
                    sourceMessageId: assistantId,
                  });
                }
                window.dispatchEvent(new Event('xroga-resume-workspace'));
              }
            } catch {
              /* ignore */
            }
            return next;
          });
          return;
        }
        if (err instanceof ApiError && err.status === 402) {
          dispatchCompanionEvent({
            type: 'task_warning',
            message: 'This account has reached its current plan capacity.',
            source: 'runtime',
          });
          setOutOfActionsOpen(true);
          setMessages((m) =>
            m.map((msg) =>
              msg.id === assistantId
                ? {
                    ...msg,
                    content:
                      msg.content?.trim() ||
                      '⚠️ **Token quota reached.** Upgrade your plan to continue building.',
                  }
                : msg
            )
          );
          return;
        }
        dispatchCompanionEvent({
          type: 'task_failure',
          message: 'The current operation failed. Xroga preserved any valid work already produced.',
          source: 'runtime',
        });
        setMessages((m) => {
          const existing = m.find((msg) => msg.id === assistantId);
          const fo = existing?.featureOutput as { type?: string; html?: string } | undefined;
          const hasFeature =
            fo?.type === 'landing_page' &&
            (typeof fo.html === 'string' ? fo.html.trim().length > 40 : true);
          // Keep preview if LLM already delivered code — connection loss after that is ship-only
          if (hasFeature || buildHadVisibleResult) {
            return m.map((msg) =>
              msg.id === assistantId
                ? {
                    ...msg,
                    content:
                      msg.content?.trim() ||
                      '⚠️ **Ship connection interrupted** after your preview was ready. Check GitHub for pushed files, or tap Retry to finish deploy.',
                    featureOutput: msg.featureOutput,
                  }
                : msg
            );
          }
          // A capacity-cap failure gets its own line with the unlock time, rather than
          // being folded into the generic "could not start" wording — the whole point
          // of surfacing nextUnlockAt is that it answers "when can I try again", and
          // that answer belongs in the message the user actually reads, not only in
          // the terminal transcript underneath it.
          const errData = err instanceof ApiError ? (err.data as { code?: string; nextUnlockAt?: unknown }) : null;
          const capacityLine =
            errData?.code === 'CAPACITY_UNAVAILABLE' && err instanceof Error
              ? capacityUnavailableLine(err.message, errData.nextUnlockAt)
              : null;
          const friendly =
            capacityLine ??
            (codeBuildActive
              ? isBuildUpdateEarly
                ? `**Update could not start.** ${err instanceof Error ? err.message : 'The server did not accept the run.'}`
                : `**Build could not start.** ${err instanceof Error ? err.message : 'The server did not accept the run.'}`
              : GENERIC_SWARM_FALLBACK);
          // Carries the original prompt so "Use full power now" can resend it the
          // moment more capacity is unlocked, instead of just naming when to come back.
          const capacityUnavailable =
            capacityLine != null
              ? {
                  prompt: lastTurnRef.current?.text || displayPrompt,
                  nextUnlockAt:
                    typeof errData?.nextUnlockAt === 'string' ? errData.nextUnlockAt : null,
                }
              : undefined;
          return [
            ...m.filter((msg) => msg.id !== assistantId || msg.content.length > 0),
            {
              id: assistantId,
              role: 'assistant',
              content: fullReply || friendly,
              createdAt: Date.now(),
              ...(capacityUnavailable ? { capacityUnavailable } : {}),
            },
          ];
        });
      } finally {
        // If the stream ended without a terminal event, the reducer resolves the run
        // to 'interrupted'. A run left marked active would spin forever with nothing
        // behind it — the exact failure the old fixed checklist had.
        dispatchTerminalRun({ type: 'stream-closed' });
        if (thinkingTimerRef.current) {
          clearTimeout(thinkingTimerRef.current);
          thinkingTimerRef.current = null;
        }
        const turn = lastTurnRef.current;
        if (turn && !interruptRef.current) {
          const thoughtMs = Date.now() - thinkingStartedAtRef.current;
          const steps = [...thinkingStepsRef.current];
          setMessages((m) =>
            m.map((msg) => {
              if (msg.id !== turn.assistantId) return msg;
              return {
                ...msg,
                content: msg.content,
                thinkingSteps: steps.length ? steps : msg.thinkingSteps,
                thoughtMs: thoughtMs > 0 ? thoughtMs : msg.thoughtMs,
              };
            })
          );
        }
        if (!incognito && turn && !interruptRef.current) {
          setMessages((current) => {
            try {
              archiveChatTurn({
                prompt: turn.text,
                messages: current,
                userMessageId: turn.userMessageId,
                assistantMessageId: turn.assistantId,
              });
              saveTerminalHistorySession({
                sessionId: sessionIdRef.current,
                prompt: turn.text,
                messages: current,
              });
              if (shouldSaveToProjects(turn.text)) {
                saveLocalProject({
                  name: turn.text.slice(0, 48),
                  prompt: turn.text,
                  sourceMessageId: turn.assistantId,
                });
              }
            } catch (err) {
              console.warn('[chat] archive save skipped:', (err as Error).message);
            }
            return current;
          });
        }
        lastTurnRef.current = null;
        activeRunIdRef.current = null;
        abortRef.current = null;
        if (startingHeavyJob) {
          setHeavyLoading(false);
          heavyJobActiveRef.current = false;
          if (startingHeavyBuild) {
            setHeavyBuildActive(false);
            heavyBuildActiveRef.current = false;
            setHeavyAssistantId(null);
            setDeepseekPeakNudge(null);
            setSwarmNegotiationPhase(null);
            // Clear build todos so the next Q&A in #1 is not stuck in "build mode" UI
            setSwarmTodos([]);
          }
          setSwarmRunning(false);
          setAnimatingId(null);
          setSwarmActiveAgent(null);
          setPipelineMessage(null);
          setCouncilLayer(null);
          setThinkingSteps([]);
          setThinkingStartedAt(null);
          setImageProgressStep(null);
          setImageAttempts([]);
          setPipelineCompact(false);
        } else {
          setLightLoading(false);
          if (!heavyBuildActiveRef.current) {
            setSwarmRunning(false);
            setAnimatingId(null);
            setSwarmActiveAgent(null);
            setPipelineMessage(null);
            setCouncilLayer(null);
            setThinkingSteps([]);
            setThinkingStartedAt(null);
            setImageProgressStep(null);
            setImageAttempts([]);
            setPipelineCompact(false);
          }
        }
        interruptRef.current = false;
        if (skipNextQueueRef.current) {
          skipNextQueueRef.current = false;
          return;
        }
        setTimeout(processNextInQueue, 50);
      }
    },
    [prompt, loading, heavyLoading, projectId, incognito, messages, setSwarmRunning, refreshTokenUsage, enqueuePrompt, processNextInQueue, cleanupInProgressAssistant, pushSwarmTerminalLine, handleGitHubBuildBlocked, handleVercelBuildBlocked, setTokenUsage, submitLightAlongsideHeavy, pushTerminalEvent, startTerminalRun]
  );

  submitRef.current = submit;

  useEffect(() => {
    if (chatPrefill) {
      setPrompt(chatPrefill);
      setChatPrefill('');
    }
  }, [chatPrefill, setChatPrefill]);

  useEffect(() => {
    if (autoRanRef.current || incognito) return;
    const pending = typeof window !== 'undefined' ? localStorage.getItem(PENDING_PROMPT_KEY) : null;
    if (pending) {
      autoRanRef.current = true;
      localStorage.removeItem(PENDING_PROMPT_KEY);
      void submitRef.current(pending);
    }
  }, [incognito]);

  return (
    <TerminalChatContext.Provider
      value={{
        messages,
        sessionRestoring,
        prompt,
        setPrompt,
        promptQueue,
        loading,
        heavyBuildActive,
        heavyAssistantId,
        deepseekPeakNudge,
        outOfActionsOpen,
        setOutOfActionsOpen,
        animatingId,
        swarmActiveAgent,
        pipelineMessage,
        councilLayer,
        thinkingSteps,
        thinkingStartedAt,
        imageProgressStep,
        imageAttempts,
        pipelineCompact,
        swarmNegotiationPhase,
        swarmTodos,
        swarmStatusLabel,
        swarmAnalysis,
        swarmActivityLog,

        terminalRun,
        followUps,
        reasoning,
        dag,
        submit,
        stop,
        retryStoppedBuild,
        retryWithFullPower,
        startNewChat,
        hydrateFromSession,
        restoreTerminalSession,
        loadIsolatedThread,
        deleteTurn,
        deleteUserTurn,
        updateFeatureOutput,
        removeFromQueue,
        editQueuedPrompt,
        continueQueuedWhenReady,
        holdQueuedBuild,
        sendQueuedNow,
        clearQueue,
        sessionId: liveSessionId,
        projectId,
      }}
    >
      <GitHubBuildGateModal
        open={githubGateOpen}
        onClose={() => {
          setGithubGateOpen(false);
          pendingBuildRef.current = null;
          afterGitHubActivationRef.current = null;
        }}
        onConnected={(username) => {
          void api.github.status().then((gh) => {
            if (!gh.connected) {
              clearGitHubConnectedSession();
              skipGithubGateRef.current = false;
              return;
            }
            markGitHubConnectedSession();
            skipGithubGateRef.current = true;
            setGithubGateOpen(false);
            queueBuildAfterGitHubActivation();
            setGithubActivation({ open: true, username: username ?? gh.username });
          });
        }}
      />
      <VercelBuildGateModal
        open={vercelGateOpen}
        onClose={() => {
          setVercelGateOpen(false);
          pendingBuildRef.current = null;
        }}
        onConnected={() => {
          setVercelGateOpen(false);
          const pending = pendingBuildRef.current;
          pendingBuildRef.current = null;
          if (pending) {
            window.setTimeout(() => {
              void submitRef.current(
                pending.userPrompt,
                pending.fromQueue,
                pending.interrupt,
                pending.attachments
              );
            }, 600);
          }
        }}
      />
      <GitHubActivationOverlay
        open={githubActivation.open}
        username={githubActivation.username}
        onDone={finishGitHubActivation}
      />
      {children}
    </TerminalChatContext.Provider>
  );
}

export function useTerminalChat() {
  const ctx = useContext(TerminalChatContext);
  if (!ctx) throw new Error('useTerminalChat must be used within TerminalChatProvider');
  return ctx;
}
