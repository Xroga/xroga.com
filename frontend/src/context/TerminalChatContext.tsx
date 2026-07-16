'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { usePathname } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { streamSwarmExecute, ApiError, type ChatAttachment, api } from '@/lib/api';
import { shouldRouteToPhase1 } from '@/lib/phase1Routing';
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
import { seedBuildTodos } from '@/lib/buildDefaultTodos';
import { mergeBuildTodos, normalizeActiveTodo } from '@/lib/mergeBuildTodos';
import { planningStepsForPrompt, startPipelineMessageForPrompt } from '@/lib/buildPlanningSteps';
import { formatAgentActivityLine } from '@/lib/agentProcessingFormat';
import { getSelectedRepoContext, saveSelectedRepoContext } from '@/lib/repoContext';
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
import { getDeepSeekPeakStatus } from '@/lib/deepseekPeakHours';
import { runLightLaneChat } from '@/lib/runLightLaneChat';
import { GitHubBuildGateModal } from '@/components/terminal/GitHubBuildGateModal';
import { VercelBuildGateModal } from '@/components/terminal/VercelBuildGateModal';
import { GitHubActivationOverlay } from '@/components/terminal/GitHubActivationOverlay';
import { GITHUB_CONNECTED_EVENT } from '@/lib/githubEvents';
import {
  clearGitHubConnectedSession,
  isGitHubConnectedSession,
  isGitHubConnectRequiredText,
  markGitHubConnectedSession,
  sanitizeXrogaTerminalText,
} from '@/lib/xrogaBrand';
import { addPendingBuildJob, removePendingBuildJob } from '@/lib/pendingBuildJobs';
import { useBackgroundBuildJobs } from '@/hooks/useBackgroundBuildJobs';
import { useBuildCompletionAlerts } from '@/hooks/useBuildCompletionAlerts';
import { requestBuildNotificationPermission, showBuildBrowserNotification } from '@/lib/buildBrowserNotify';

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
  hackathonBrief?: import('@/components/terminal/HackathonBriefCard').HackathonBriefCardData;
  /** Behind-the-scenes reasoning steps shown after response */
  thinkingSteps?: string[];
  thoughtMs?: number;
  /** User stopped mid-build — show Retry card, keep in history */
  buildStopped?: boolean;
  stoppedTodos?: Array<{ id: string; label: string; status: 'done' | 'active' | 'pending' }>;
  stoppedPhase?: number | null;
  stoppedActivityLog?: string[];
  originalBuildPrompt?: string;
  githubRepoName?: string;
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
  swarmTodos: Array<{ id: string; label: string; status: 'done' | 'active' | 'pending' }>;
  swarmStatusLabel: string | null;
  swarmAnalysis: string | null;
  swarmActivityLog: string[];
  submit: (
    text?: string,
    fromQueue?: boolean,
    interrupt?: boolean,
    attachments?: ChatAttachment[]
  ) => Promise<void>;
  stop: () => void;
  /** Continue a stopped build from checkpoint + GitHub (not from scratch) */
  retryStoppedBuild: (assistantMessageId: string) => Promise<void>;
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
    Array<{ id: string; label: string; status: 'done' | 'active' | 'pending' }>
  >([]);
  const [swarmStatusLabel, setSwarmStatusLabel] = useState<string | null>(null);
  const [swarmAnalysis, setSwarmAnalysis] = useState<string | null>(null);
  const [swarmActivityLog, setSwarmActivityLog] = useState<string[]>([]);
  const [githubGateOpen, setGithubGateOpen] = useState(false);
  const [vercelGateOpen, setVercelGateOpen] = useState(false);
  const [githubActivation, setGithubActivation] = useState<{ open: boolean; username?: string }>({
    open: false,
  });
  const afterGitHubActivationRef = useRef<(() => void) | null>(null);
  const buildTodosSeedRef = useRef<Array<{ id: string; label: string; status: 'done' | 'active' | 'pending' }>>([]);
  const liveBuildSnapshotRef = useRef<{
    todos: Array<{ id: string; label: string; status: 'done' | 'active' | 'pending' }>;
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
  const autoRanRef = useRef(false);
  const submitRef = useRef<
    (text?: string, fromQueue?: boolean, interrupt?: boolean, attachments?: ChatAttachment[]) => Promise<void>
  >(async () => {});
  const queueRef = useRef<QueuedPrompt[]>([]);
  const lastTurnRef = useRef<{ userMessageId: string; assistantId: string; text: string } | null>(null);
  const skipNextQueueRef = useRef(false);
  const interruptRef = useRef(false);
  const [sessionReady, setSessionReady] = useState(false);
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
    ({ assistantMessageId, output }) => {
      toast.success('Your XROGA project is complete!');
      setMessages((m) =>
        m.map((msg) =>
          msg.id === assistantMessageId
            ? { ...msg, content: '', featureOutput: { ...output, type: 'landing_page' } }
            : msg
        )
      );
    },
    (assistantMessageId, error) => {
      toast.error(error.slice(0, 120) || 'Build failed');
      setMessages((m) =>
        m.map((msg) =>
          msg.id === assistantMessageId
            ? { ...msg, content: error, featureOutput: undefined }
            : msg
        )
      );
    }
  );

  useBuildCompletionAlerts();

  useEffect(() => {
    if (incognito) {
      setMessages([]);
      setPrompt('');
      setPromptQueue([]);
      persistReadyRef.current = false;
      setSessionReady(true);
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
      void api.vercel.status().then((vc) => {
        if (vc.connected) {
          void submitRef.current(userPrompt, false, false, attachments);
          return;
        }
        pendingBuildRef.current = {
          userPrompt,
          fromQueue: false,
          interrupt: false,
          attachments,
        };
        setVercelGateOpen(true);
      }).catch(() => {
        pendingBuildRef.current = {
          userPrompt,
          fromQueue: false,
          interrupt: false,
          attachments,
        };
        setVercelGateOpen(true);
      });
    },
    []
  );

  const handleGitHubBuildBlocked = useCallback(
    (userPrompt: string, attachments?: ChatAttachment[]) => {
      const selectedRepo = getSelectedRepoContext()?.repo;
      // Already have a selected repo in the footer — never pop Connect GitHub again
      if (selectedRepo?.includes('/') || isGitHubConnectedSession()) {
        markGitHubConnectedSession();
        return;
      }
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
        // Status flaky — if user already selected a repo, do not block with Connect modal
        if (getSelectedRepoContext()?.repo?.includes('/')) {
          markGitHubConnectedSession();
          return;
        }
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
    void loadWorkspaceSessionHydrated().then((session) => {
      if (!session?.messages?.length) {
        restoringRef.current = false;
        return;
      }
      setMessages(session.messages);
      if (threadHasCompletedWebsite(session.messages)) {
        completedWebsiteBuildRef.current = true;
      }
      if (session.prompt) setPrompt(session.prompt);
      if (session.sessionId) setSessionId(session.sessionId);
      restoringRef.current = false;
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
    if (messages.length === 0) return;
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
          flushCloud: true,
        });
        window.dispatchEvent(new CustomEvent('xroga-resume-workspace'));
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
    // Stop aborts the focused stream; never kill a light reply silent to a build stop preference —
    // prefer aborting heavy when active, else light.
    if (heavyBuildActiveRef.current && abortRef.current) {
      abortRef.current.abort();
      return;
    }
    lightAbortRef.current?.abort();
    abortRef.current?.abort();
  }, []);

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

      const threadForMemory = [
        ...messages,
        { id: userMessageId, role: 'user' as const, content: displayPrompt, createdAt: Date.now() },
      ];
      const history = threadForMemory
        .filter((m) => (m.role === 'user' || m.role === 'assistant') && m.content?.trim())
        .slice(-10)
        .map((m) => ({
          role: m.role as 'user' | 'assistant',
          content: (m.content ?? '').length > 1200 ? `${(m.content ?? '').slice(0, 1200)}…` : (m.content ?? ''),
        }))
        .filter((h) => h.content.length > 0);

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
            ? `${displayPrompt}${displayPrompt ? '\n' : ''}📎 ${attachments.length} image(s) attached`
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
      const isBuildUpdateEarly =
        !adviceTurn &&
        (isWebsiteBuildUpdate(displayPrompt, messages) ||
          (completedWebsiteBuildRef.current && isWebsiteUpdateRequest(displayPrompt)));
      const startingHeavyJob = !adviceTurn && (lane === 'heavy' || codeBuildActive);
      const startingHeavyBuild =
        !adviceTurn &&
        (codeBuildActive ||
          isWebsiteBuildPrompt(displayPrompt) ||
          isWebsiteBuildUpdate(displayPrompt, messages) ||
          isBuildThreadContinuation(displayPrompt, messages));

      if (startingHeavyJob) {
        setHeavyLoading(true);
        heavyJobActiveRef.current = true;
        if (startingHeavyBuild) {
          setHeavyBuildActive(true);
          heavyBuildActiveRef.current = true;
          setHeavyAssistantId(assistantId);
          const peak = getDeepSeekPeakStatus();
          setDeepseekPeakNudge(peak.nudge);
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
        !(completedWebsiteBuildRef.current && isWebsiteUpdateRequest(displayPrompt)) &&
        !(activeWebsiteBuildRef.current && looksLikeBuildClarificationAnswer(displayPrompt)) &&
        !codeBuildActive &&
        (isTrivialPrompt(userPrompt) || isSimpleChat(userPrompt));
      setPipelineCompact(useCompactPipeline);

      if (!codeBuildActive && !useCompactPipeline && !startingHeavyJob) {
        thinkingStepsRef.current = [
          'Searching live sources (SearXNG + YouTube)',
          'Analyzing your question',
          'Composing professional response',
        ];
        setThinkingSteps([...thinkingStepsRef.current]);
        setPipelineMessage('Searching the web…');
      }

      if (startingHeavyBuild) {
        setSwarmNegotiationPhase(0);
        setSwarmStatusLabel('XROGA Architect');
        const seededTodos = seedBuildTodos(displayPrompt);
        buildTodosSeedRef.current = seededTodos;
        liveBuildSnapshotRef.current.todos = seededTodos;
        setSwarmTodos(seededTodos);
        const startMsg = startPipelineMessageForPrompt(displayPrompt);
        const planSteps = planningStepsForPrompt(displayPrompt);
        setPipelineMessage(startMsg);
        thinkingStepsRef.current = [...planSteps];
        setThinkingSteps([...planSteps]);
        const peakLine = getDeepSeekPeakStatus().nudge;
        setSwarmActivityLog([
          startMsg,
          ...(peakLine ? [peakLine] : []),
        ]);
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

      thinkingTimerRef.current = setTimeout(() => {
        if (!gotEvent && !codeBuildActive) setPipelineMessage('Thinking…');
      }, 1500);

      try {
        // Paint assistant row immediately — don't wait on auth before the bubble appears
        setMessages((m) => [...m, { id: assistantId, role: 'assistant', content: '', createdAt: Date.now() }]);
        setAnimatingId(assistantId);
        setPipelineMessage('Connecting…');

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
        // Require a real prior site / update intent — selected repo alone must NOT force a build
        const isBuildUpdate =
          !adviceTurn &&
          (isWebsiteBuildUpdate(displayPrompt, threadForMemory) ||
            (completedWebsiteBuildRef.current && isWebsiteUpdateRequest(displayPrompt)));

        // Sandbox updates need prior HTML — otherwise the AI patches nothing and the stream dies empty
        let priorSite:
          | { html: string; css?: string; js?: string; projectName?: string }
          | undefined;
        if (isBuildUpdate) {
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
              // Cap payload — huge priorSite was freezing send on updates
              priorSite = {
                html: fo.html.slice(0, 80_000),
                css: typeof fo.css === 'string' ? fo.css.slice(0, 40_000) : undefined,
                js: typeof fo.js === 'string' ? fo.js.slice(0, 40_000) : undefined,
                projectName: typeof fo.projectName === 'string' ? fo.projectName : undefined,
              };
              break;
            }
          }
        }

        // Never send prior build essays with "hi"/thanks — that burns tokens and continues the blog guide.
        let history = isTrivialPrompt(displayPrompt)
          ? ([] as Array<{ role: 'user' | 'assistant'; content: string }>)
          : threadForMemory
              .filter((m) => (m.role === 'user' || m.role === 'assistant') && (m.content?.trim() || m.featureOutput))
              .slice(-10)
              .map((m) => {
                let content = m.content?.trim() ?? '';
                if (!content && m.featureOutput && typeof m.featureOutput === 'object') {
                  const o = m.featureOutput as { type?: string; summary?: string; deployUrl?: string };
                  if (o.type === 'landing_page') {
                    content = o.summary ?? `Built website: ${o.deployUrl ?? 'live'}`;
                  }
                }
                // Cap history turn size so old builds don't dominate cost on normal chat.
                if (content.length > 1200) content = `${content.slice(0, 1200)}…`;
                return { role: m.role as 'user' | 'assistant', content };
              })
              .filter((h) => h.content.length > 0);

        if (buildSession && isBuildAnswer) {
          const hasPhase1 = history.some((h) => isPhase1BuildQuestion(h.content));
          if (!hasPhase1) {
            history = [
              { role: 'user', content: buildSession.originalPrompt },
              { role: 'assistant', content: buildSession.phase1Reply },
              ...history.filter((h) => h.content !== displayPrompt),
              { role: 'user', content: displayPrompt },
            ];
          }
        }

        const repoContext = repoContextEarly ?? getSelectedRepoContext();

        const usePhase1Engine = shouldRouteToPhase1(displayPrompt, threadForMemory, attachments, {
          completedWebsiteBuild: completedWebsiteBuildRef.current,
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
          pushSwarmTerminalLine(mathPrompt ? 'Math solver → step-by-step solution…' : 'Live research → professional answer…');

          try {
            const result = await api.phase1.chat(displayPrompt, history);
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

              setTokenUsage({
                ...result.usage,
                totalLimit: result.usage.totalTokensRemaining + result.usage.totalTokensUsed,
              });
              refreshTokenUsage();
            }
          } catch (phase1Err) {
            // Server rejected a product-build that slipped into chat — fall through to real build swarm.
            const code =
              phase1Err instanceof ApiError ? String(phase1Err.data?.code ?? '') : '';
            if (code === 'USE_BUILD_PIPELINE' || (phase1Err instanceof ApiError && phase1Err.status === 409)) {
              runSwarmBuild = true;
              setPipelineMessage('Switching to XROGA build swarm…');
              pushSwarmTerminalLine('Build request detected — starting real site generation…');
              if (isWebsiteBuildPrompt(displayPrompt) || requiresGitHubForBuild(displayPrompt)) {
                setSwarmNegotiationPhase(0);
                setSwarmStatusLabel('XROGA Architect');
                const seededTodos = seedBuildTodos(displayPrompt);
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
            buildUpdate: isBuildUpdate,
            githubTargetRepo: repoContext?.repo,
            githubTargetBranch: repoContext?.branch,
            ...(priorSite ? { priorSite } : {}),
          },
          onProgress: (event) => {
            gotEvent = true;
            if (thinkingTimerRef.current) {
              clearTimeout(thinkingTimerRef.current);
              thinkingTimerRef.current = null;
            }
            const swarmEv = event as SwarmProgressEvent;
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
            // Prefer negotiationPhase so chips advance (userFacingPhase was often stuck at 1).
            const negPhase = swarmEv.negotiationPhase ?? swarmEv.userFacingPhase;
            const prevPhase = liveBuildSnapshotRef.current.phase;
            if (negPhase != null) setSwarmNegotiationPhase(negPhase);
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
            if (negPhase != null) {
              liveBuildSnapshotRef.current.phase = negPhase;
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
            if ((swarmEv as SwarmProgressEvent & { deepseekPeak?: boolean }).deepseekPeak && activity) {
              setDeepseekPeakNudge(sanitizeXrogaTerminalText(activity));
            }
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
            if (realActivity || todosChanged || (negPhase != null && negPhase !== prevPhase)) {
              lastRealProgressAtRef.current = Date.now();
              lastActivityAtRef.current = Date.now();
            }
            if (swarmEv.needsGitHub) {
              handleGitHubBuildBlocked(displayPrompt, attachments);
            }
            if (swarmEv.needsVercel) {
              handleVercelBuildBlocked(displayPrompt, attachments);
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
            setMessages((m) =>
              m.map((msg) => (msg.id === assistantId ? { ...msg, content: msg.content + delta } : msg))
            );
          },
          onComplete: (complete) => {
            if (complete.tokenUsage) {
              const tu = complete.tokenUsage;
              setTokenUsage({
                inputTokensUsed: tu.inputTokensUsed ?? 0,
                outputTokensUsed: tu.outputTokensUsed ?? 0,
                totalTokensUsed: tu.totalTokensUsed ?? 0,
                inputTokensRemaining: tu.inputTokensRemaining ?? 0,
                outputTokensRemaining: tu.outputTokensRemaining ?? 0,
                totalTokensRemaining: tu.totalTokensRemaining ?? 0,
                percentUsed: tu.percentUsed ?? 0,
                quotaPeriodStart: tu.quotaPeriodStart ?? new Date().toISOString().slice(0, 10),
                emergencyTokensAvailable: false,
                emergencyTokensClaimedThisMonth: false,
                totalLimit: (tu.totalTokensUsed ?? 0) + (tu.totalTokensRemaining ?? 0),
              });
            }
            if (complete.followUps?.length) {
              setFollowUps(complete.followUps);
            }
            const output = complete.output as Record<string, unknown> | undefined;
            const chatContent =
              output?.type === 'chat' && typeof output.content === 'string' ? output.content : '';
            if (
              requiresGitHubForBuild(displayPrompt) &&
              (isGitHubConnectRequiredText(chatContent) ||
                complete.followUps?.some((f) => /connect github/i.test(f)))
            ) {
              handleGitHubBuildBlocked(displayPrompt, attachments);
            }
            if (output?.type === 'image_blocked') {
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
              const hasRenderableLanding =
                landingHtml.length > 40 ||
                Boolean((output as { deployUrl?: string }).deployUrl) ||
                Boolean((output as { githubRepoUrl?: string }).githubRepoUrl);
              if (!hasRenderableLanding) {
                // Empty landing payload after spend — never leave a blank "No response" bubble
                const failMsg =
                  '⚠️ **Build finished without a preview.** Tokens were used, but no HTML was returned. Tap Retry — we will ship a sandbox site from your prompt.';
                fullReply = failMsg;
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
              const projectName =
                (typeof output.projectName === 'string' && output.projectName.trim()) ||
                priorSite?.projectName ||
                'Your project';
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
              ).filter((f) => f && typeof f.path === 'string');
              const changesSummary = Array.isArray((output as { changesSummary?: string[] }).changesSummary)
                ? ((output as { changesSummary: string[] }).changesSummary)
                : undefined;
              const previousFiles = Array.isArray((output as { previousFiles?: Array<{ path: string; content: string }> }).previousFiles)
                ? (output as { previousFiles: Array<{ path: string; content: string }> }).previousFiles
                : undefined;

              // Always refresh the one project workspace preview
              void import('@/store/useProjectWorkspaceStore').then(({ useProjectWorkspaceStore }) => {
                useProjectWorkspaceStore.getState().applyBuild({
                  repo: outRepo,
                  branch:
                    (output as { githubBranch?: string }).githubBranch ||
                    repoContext?.branch ||
                    'main',
                  projectName,
                  html: String((output as { html?: string }).html ?? ''),
                  css: String((output as { css?: string }).css ?? ''),
                  js: String((output as { js?: string }).js ?? ''),
                  deployUrl:
                    (typeof (output as { deployUrl?: string }).deployUrl === 'string' &&
                    (output as { deployVerified?: boolean }).deployVerified
                      ? (output as { deployUrl: string }).deployUrl
                      : (output as { vercelPreviewUrl?: string }).vercelPreviewUrl) || null,
                  githubRepoUrl: (output as { githubRepoUrl?: string }).githubRepoUrl ?? null,
                  commitSha: (output as { commitSha?: string }).commitSha ?? null,
                  status: (output as { deployVerified?: boolean }).deployVerified ? 'live' : 'pushed',
                  changesSummary,
                  fileTrail: fileTrailRaw,
                  previousFiles: previousFiles ?? null,
                  openPreview: true,
                });
              });

              showBuildBrowserNotification({
                title: reusePreview
                  ? `${projectName} updated!`
                  : `${projectName} is ready!`,
                body: reusePreview
                  ? `xroga.com · ${projectName} — project rail + preview updated.`
                  : `xroga.com · ${projectName} — project rail + preview are ready.`,
                tag: `build-done-${assistantId}`,
              });
              setMessages((m) => {
                // Updates: file trail on this turn; merge html into first landing_page for thread memory
                if (reusePreview) {
                  let anchorId: string | null = null;
                  for (let i = 0; i < m.length; i++) {
                    const fo = m[i]?.featureOutput as { type?: string } | undefined;
                    if (m[i]!.id !== assistantId && fo?.type === 'landing_page') {
                      anchorId = m[i]!.id;
                      break;
                    }
                  }
                  const paths = Array.isArray((output as { updatedFiles?: string[] }).updatedFiles)
                    ? ((output as { updatedFiles?: string[] }).updatedFiles as string[]).slice(0, 6)
                    : fileTrailRaw.map((f) => f.path);
                  const statusBits = [
                    outRepo ? `Pushed to ${outRepo}` : null,
                    'Preview updated',
                    (output as { deployVerified?: boolean }).deployVerified ? 'Vercel: Ready' : null,
                  ].filter(Boolean);
                  const updated = m.map((msg) => {
                    if (anchorId && msg.id === anchorId) {
                      const prev = (msg.featureOutput ?? {}) as Record<string, unknown>;
                      return {
                        ...msg,
                        featureOutput: {
                          ...prev,
                          ...output,
                          type: 'landing_page',
                          isUpdate: true,
                        },
                      };
                    }
                    if (msg.id === assistantId) {
                      return {
                        ...msg,
                        content: '',
                        featureOutput: undefined,
                        updateTrail: {
                          headline: `Updating ${projectName} · ${paths[0] ? paths.join(', ') : 'targeted files'}`,
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
                  return updated;
                }
                const updated = m.map((msg) =>
                  msg.id === assistantId
                    ? {
                        ...msg,
                        content: '✅ Preview ready — your site is in the project card below.',
                        featureOutput: output,
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
                    const provider = o.provider ? `\n\n*Generated via ${o.provider}*` : '';
                    return `![${alt}](${o.imageUrl})${provider}`;
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
          if (interruptRef.current) {
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
          setOutOfActionsOpen(true);
          setMessages((m) =>
            m.map((msg) =>
              msg.id === assistantId
                ? {
                    ...msg,
                    content:
                      msg.content?.trim() ||
                      '⚠️ **Token quota reached.** Upgrade your plan or claim emergency tokens in the Dashboard to continue building.',
                  }
                : msg
            )
          );
          return;
        }
        setMessages((m) => {
          const existing = m.find((msg) => msg.id === assistantId);
          const hasFeature =
            existing?.featureOutput &&
            typeof existing.featureOutput === 'object' &&
            (existing.featureOutput as { type?: string }).type === 'landing_page';
          if (hasFeature) return m.filter((msg) => msg.id !== assistantId || Boolean(msg.content?.trim()));
          const friendly = codeBuildActive
            ? isBuildUpdateEarly
              ? '⚠️ **Update interrupted.** Keep this chat open and retry — we patch your current preview (night/day, buttons, copy) without rebuilding from scratch. If it keeps failing, reconnect under Integrations and try again.'
              : '⚠️ **Build connection lost.** Check your connection and try again. Connect GitHub under Integrations if you have not already.'
            : GENERIC_SWARM_FALLBACK;
          return [
            ...m.filter((msg) => msg.id !== assistantId || msg.content.length > 0),
            {
              id: assistantId,
              role: 'assistant',
              content: fullReply || friendly,
              createdAt: Date.now(),
            },
          ];
        });
      } finally {
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
    [prompt, loading, heavyLoading, projectId, incognito, messages, setSwarmRunning, refreshTokenUsage, enqueuePrompt, processNextInQueue, cleanupInProgressAssistant, pushSwarmTerminalLine, handleGitHubBuildBlocked, handleVercelBuildBlocked, setTokenUsage, submitLightAlongsideHeavy]
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
        followUps,
        reasoning,
        dag,
        submit,
        stop,
        retryStoppedBuild,
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
