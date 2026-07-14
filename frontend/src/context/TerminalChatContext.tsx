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
import { saveTerminalHistorySession } from '@/lib/terminalHistory';
import { tokenUsageFromSummary } from '@/lib/tokenUsageFromSummary';
import { buildPromptWithMemory, isBuildThreadContinuation, isPhase1BuildQuestion, isWebsiteBuildPrompt, isWebsiteBuildUpdate, isWebsiteUpdateRequest, looksLikeBuildClarificationAnswer, threadHasCompletedWebsite } from '@/lib/chatMemory';
import { isCodeBuildProcessing } from '@/lib/codeBuildProcessing';
import { seedBuildTodos } from '@/lib/buildDefaultTodos';
import { mergeBuildTodos, normalizeActiveTodo } from '@/lib/mergeBuildTodos';
import { BUILD_PLANNING_STEPS } from '@/lib/buildPlanningSteps';
import { formatAgentActivityLine } from '@/lib/agentProcessingFormat';
import { clearSelectedRepoContext, getSelectedRepoContext } from '@/lib/repoContext';
import { buildHeartbeatActivity } from '@/lib/buildLiveStatus';
import { defaultImageAttachmentPrompt } from '@/lib/parseImageContent';
import { saveLocalProject, shouldSaveToProjects } from '@/lib/projectArchive';
import { notifyGithubProjectSaved, GITHUB_REPO_CONTEXT_EVENT } from '@/lib/githubProjectEvents';
import toast from 'react-hot-toast';
import { isTrivialPrompt, isSimpleChat } from '@/lib/promptClassifier';
import { requiresGitHubForBuild } from '@/lib/messageHelpers';
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
}

export interface QueuedPrompt {
  id: string;
  text: string;
  createdAt: number;
}

interface TerminalChatContextValue {
  messages: ChatMessage[];
  prompt: string;
  setPrompt: (v: string) => void;
  promptQueue: QueuedPrompt[];
  loading: boolean;
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
  sendQueuedNow: (id: string) => void;
  clearQueue: () => void;
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
  const [loading, setLoading] = useState(false);
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
  const buildHeartbeatTickRef = useRef(0);
  const lastActivityAtRef = useRef(0);
  const sessionIdRef = useRef<string>(
    typeof crypto !== 'undefined' ? crypto.randomUUID() : `session-${Date.now()}`
  );

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
    let cancelled = false;
    void loadWorkspaceSessionHydrated()
      .then((session) => {
        if (cancelled) return;
        if (session?.messages?.length) {
          setMessages(session.messages);
          if (threadHasCompletedWebsite(session.messages)) {
            completedWebsiteBuildRef.current = true;
          }
        }
        if (session?.sessionId) {
          sessionIdRef.current = session.sessionId;
        }
        if (session?.prompt) setPrompt(session.prompt);
        persistReadyRef.current = true;
        setSessionReady(true);
      })
      .catch(() => {
        if (cancelled) return;
        clearWorkspaceSession();
        persistReadyRef.current = true;
        setSessionReady(true);
      });
    return () => {
      cancelled = true;
    };
  }, [incognito]);

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
      if (session.sessionId) sessionIdRef.current = session.sessionId;
      restoringRef.current = false;
    });
  }, [incognito]);

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
      setLoading(false);
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

      sessionIdRef.current = opts.sessionId;
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
    [incognito, setSwarmRunning]
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
      setLoading(false);
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
  }, [sessionReady, prompt, messages, incognito]);

  /** Persist terminal history while user works — not only after submit completes */
  useEffect(() => {
    if (!sessionReady || incognito || !persistReadyRef.current || restoringRef.current) return;
    if (messages.length === 0) return;
    const timer = window.setTimeout(() => {
      saveTerminalHistorySession({
        sessionId: sessionIdRef.current,
        prompt,
        messages,
      });
    }, 800);
    return () => window.clearTimeout(timer);
  }, [sessionReady, prompt, messages, incognito]);

  /** Live status text only — do NOT invent file-create activity (felt fake). */
  useEffect(() => {
    if (!loading || swarmNegotiationPhase == null) return;
    const started = thinkingStartedAt ?? Date.now();
    const id = setInterval(() => {
      const elapsed = Math.max(1, Math.round((Date.now() - started) / 1000));
      const sinceActivity = Date.now() - (lastActivityAtRef.current || started);
      if (sinceActivity < 3500) return;
      buildHeartbeatTickRef.current += 1;
      const line = buildHeartbeatActivity(
        elapsed,
        swarmNegotiationPhase,
        buildHeartbeatTickRef.current
      );
      setPipelineMessage(line);
    }, 4000);
    return () => clearInterval(id);
  }, [loading, swarmNegotiationPhase, thinkingStartedAt]);

  const enqueuePrompt = useCallback((text: string) => {
    setPromptQueue((q) => [...q, { id: crypto.randomUUID(), text, createdAt: Date.now() }]);
    toast.success('Queued — sends when current response finishes');
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
    const next = queueRef.current[0];
    if (!next) return;
    setPromptQueue((q) => q.slice(1));
    void submitRef.current(next.text, true);
  }, []);

  const stop = useCallback(() => {
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
      saveTerminalHistorySession({
        sessionId: sessionIdRef.current,
        prompt,
        messages,
        status: messages.some((m) => m.buildStopped) ? 'stopped' : undefined,
      });
    }
    sessionIdRef.current =
      typeof crypto !== 'undefined' ? crypto.randomUUID() : `session-${Date.now()}`;
    setMessages([]);
    setPrompt('');
    setPromptQueue([]);
    setLoading(false);
    setSwarmRunning(false);
    setAnimatingId(null);
    setSwarmActiveAgent(null);
    persistReadyRef.current = false;
    if (!usePrivacyStore.getState().incognito) clearWorkspaceSession();
    clearSelectedRepoContext();
    window.dispatchEvent(new CustomEvent(GITHUB_REPO_CONTEXT_EVENT, { detail: { repo: null, branch: null } }));
    persistReadyRef.current = true;
  }, [setSwarmRunning, messages, prompt]);

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

  const sendQueuedNow = useCallback((id: string) => {
    const item = queueRef.current.find((p) => p.id === id);
    if (!item) return;
    setPromptQueue((q) => q.filter((p) => p.id !== id));
    if (loading) {
      skipNextQueueRef.current = true;
      interruptRef.current = true;
      abortRef.current?.abort();
      cleanupInProgressAssistant();
      setLoading(false);
      setSwarmRunning(false);
    }
    void submitRef.current(item.text, false, true);
  }, [loading, cleanupInProgressAssistant, setSwarmRunning]);

  const clearQueue = useCallback(() => setPromptQueue([]), []);

  const updateFeatureOutput = useCallback((messageId: string, output: unknown) => {
    setMessages((m) =>
      m.map((msg) => (msg.id === messageId ? { ...msg, featureOutput: output } : msg))
    );
  }, []);

  const submit = useCallback(
    async (
      overrideText?: string,
      fromQueue = false,
      interrupt = false,
      attachments?: ChatAttachment[]
    ) => {
      const userPrompt = (overrideText ?? prompt).trim();
      if (!userPrompt && !attachments?.length) return;

      if (loading && interrupt) {
        skipNextQueueRef.current = true;
        interruptRef.current = true;
        abortRef.current?.abort();
        cleanupInProgressAssistant();
        setLoading(false);
        setSwarmRunning(false);
        setPipelineMessage(null);
        setImageProgressStep(null);
        setImageAttempts([]);
      } else if (loading && !fromQueue) {
        enqueuePrompt(userPrompt);
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
      setLoading(true);
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
      setSwarmNegotiationPhase(null);
      setSwarmTodos([]);
      buildTodosSeedRef.current = [];
      liveBuildSnapshotRef.current = { todos: [], phase: null, activity: [] };
      setSwarmStatusLabel(null);
      setSwarmAnalysis(null);
      setSwarmActivityLog([]);

      const codeBuildActive = isCodeBuildProcessing(displayPrompt, messages, {
        completedBuildRef: completedWebsiteBuildRef.current,
      });

      const useCompactPipeline =
        !isBuildThreadContinuation(displayPrompt, messages) &&
        !isWebsiteBuildUpdate(displayPrompt, messages) &&
        !(completedWebsiteBuildRef.current && isWebsiteUpdateRequest(displayPrompt)) &&
        !(activeWebsiteBuildRef.current && looksLikeBuildClarificationAnswer(displayPrompt)) &&
        !codeBuildActive &&
        (isTrivialPrompt(userPrompt) || isSimpleChat(userPrompt));
      setPipelineCompact(useCompactPipeline);

      if (!codeBuildActive && !useCompactPipeline) {
        thinkingStepsRef.current = [
          'Searching live sources (SearXNG + YouTube)',
          'Analyzing your question',
          'Composing professional response',
        ];
        setThinkingSteps([...thinkingStepsRef.current]);
        setPipelineMessage('Searching the web…');
      }

      if (codeBuildActive) {
        setSwarmNegotiationPhase(0);
        setSwarmStatusLabel('XROGA Architect');
        const seededTodos = seedBuildTodos(displayPrompt);
        buildTodosSeedRef.current = seededTodos;
        liveBuildSnapshotRef.current.todos = seededTodos;
        setSwarmTodos(seededTodos);
        setPipelineMessage('XROGA Architect — planning architecture, database & API routes…');
        thinkingStepsRef.current = [...BUILD_PLANNING_STEPS];
        setThinkingSteps([...BUILD_PLANNING_STEPS]);
        setSwarmActivityLog(['XROGA Architect — analyzing your project and planning the build…']);
        lastActivityAtRef.current = Date.now();
        buildHeartbeatTickRef.current = 0;
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
        const supabase = createClient();
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.access_token) throw new Error('Please sign in to chat.');

        setMessages((m) => [...m, { id: assistantId, role: 'assistant', content: '', createdAt: Date.now() }]);
        setAnimatingId(assistantId);

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
        const isBuildUpdate =
          isWebsiteBuildUpdate(displayPrompt, threadForMemory) ||
          (completedWebsiteBuildRef.current && isWebsiteUpdateRequest(displayPrompt));

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

        const repoContext = getSelectedRepoContext();

        const usePhase1Engine = shouldRouteToPhase1(displayPrompt, threadForMemory, attachments, {
          completedWebsiteBuild: completedWebsiteBuildRef.current,
        });

        let runSwarmBuild = !usePhase1Engine;

        if (usePhase1Engine) {
          setPipelineCompact(false);
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
            fullReply = result.response;

            await streamTextReveal(
              result.response,
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
          },
          onProgress: (event) => {
            gotEvent = true;
            if (thinkingTimerRef.current) {
              clearTimeout(thinkingTimerRef.current);
              thinkingTimerRef.current = null;
            }
            const label = sanitizeXrogaTerminalText(event.message ?? event.status ?? 'Thinking…');
            setPipelineMessage(label);
            if (label && !thinkingStepsRef.current.includes(label)) {
              thinkingStepsRef.current = [...thinkingStepsRef.current, label];
              setThinkingSteps([...thinkingStepsRef.current]);
            }
            if (event.imageStep) setImageProgressStep(event.imageStep);
            if (event.imageAttempt?.imageUrl) {
              setImageAttempts((prev) => {
                if (prev.some((a) => a.imageUrl === event.imageAttempt!.imageUrl)) return prev;
                return [...prev, event.imageAttempt!].slice(0, 4);
              });
            }
            if (event.message) setPipelineMessage(sanitizeXrogaTerminalText(event.message));
            const layer = (event as { councilLayer?: 'elite' | 'reserve' | 'blackhole' }).councilLayer;
            if (layer) setCouncilLayer(layer);
            if (event.agent) setSwarmActiveAgent(event.agent);
            // Prefer negotiationPhase so chips advance (userFacingPhase was often stuck at 1).
            const swarmPhaseEv = event as SwarmProgressEvent;
            const negPhase = swarmPhaseEv.negotiationPhase ?? swarmPhaseEv.userFacingPhase;
            if (negPhase != null) setSwarmNegotiationPhase(negPhase);
            const swarmEv = event as SwarmProgressEvent;
            if (swarmEv.swarmTodos?.length) {
              setSwarmTodos((prev) => {
                const seeded = buildTodosSeedRef.current.length ? buildTodosSeedRef.current : prev;
                const merged = normalizeActiveTodo(mergeBuildTodos(seeded, swarmEv.swarmTodos!));
                liveBuildSnapshotRef.current.todos = merged;
                return merged;
              });
            }
            if (negPhase != null) {
              liveBuildSnapshotRef.current.phase = negPhase;
            }
            if (swarmEv.swarmStatusLabel) {
              setSwarmStatusLabel(sanitizeXrogaTerminalText(swarmEv.swarmStatusLabel));
            }
            if (swarmEv.swarmStatusLabel && codeBuildActive) {
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
            if (activity) {
              liveBuildSnapshotRef.current.activity = [
                ...liveBuildSnapshotRef.current.activity,
                sanitizeXrogaTerminalText(activity),
              ].slice(-24);
              pushSwarmTerminalLine(activity);
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
            if (codeBuildActive) return;
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
              buildHadVisibleResult = true;
              activeWebsiteBuildRef.current = null;
              completedWebsiteBuildRef.current = true;
              removePendingBuildJob(assistantId);
              const projectName =
                typeof output.projectName === 'string' ? output.projectName : 'Your project';
              showBuildBrowserNotification({
                title: 'Your XROGA project is complete!',
                body: `${projectName} — open the dashboard to view your build.`,
                tag: `build-done-${assistantId}`,
              });
              setMessages((m) => {
                const updated = m.map((msg) =>
                  msg.id === assistantId
                    ? { ...msg, content: '', featureOutput: output }
                    : msg
                );
                const runId = (complete as { runId?: string }).runId;
                if (runId) {
                  void api.swarm.saveConversation(runId, updated).catch(() => {});
                }
                const ghName = typeof output.githubRepoName === 'string' ? output.githubRepoName : undefined;
                if (output.githubPushConfirmed && ghName) {
                  void api.projects
                    .create({
                      name: projectName.slice(0, 120),
                      type: 'website',
                      github_repo_url:
                        typeof output.githubRepoUrl === 'string' ? output.githubRepoUrl : undefined,
                      github_repo_name: ghName.includes('/') ? ghName : undefined,
                      github_branch: repoContext?.branch ?? 'main',
                      deploy_url: typeof output.deployUrl === 'string' ? output.deployUrl : undefined,
                      user_prompt: displayPrompt,
                    })
                    .then((saved) => notifyGithubProjectSaved(saved.id))
                    .catch((err) => console.warn('[projects] save failed', err));
                }
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

        // Stream ended with no visible build result → never leave a blank assistant bubble.
        if (codeBuildActive && !fullReply.trim() && !buildHadVisibleResult) {
          setMessages((m) => {
            const existing = m.find((msg) => msg.id === assistantId);
            if (existing?.content?.trim() || existing?.featureOutput) return m;
            const fallback =
              '⚠️ **Build ended without output.** Check GitHub under Integrations, then retry. If this keeps happening, open a new chat and try again.';
            fullReply = fallback;
            return m.map((msg) =>
              msg.id === assistantId ? { ...msg, content: fallback } : msg
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
          const repo = getSelectedRepoContext()?.repo;
          const snap = liveBuildSnapshotRef.current;
          const todosSnapshot = snap.todos.length ? [...snap.todos] : [...buildTodosSeedRef.current];
          const phaseSnapshot = snap.phase;
          const activitySnapshot = [...snap.activity].slice(-12);
          const original = lastTurnRef.current?.text || displayPrompt;

          setMessages((m) => {
            const next = m.map((msg) => {
              if (msg.id !== assistantId) return msg;
              return {
                ...msg,
                content:
                  msg.content?.trim() ||
                  'Build stopped. Your progress is saved — tap Retry to continue from where you left off (GitHub files kept; not a fresh rebuild).',
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
            ? '⚠️ **Build connection lost.** Check your connection and try again. Connect GitHub under Integrations if you have not already.'
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
        setLoading(false);
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
        interruptRef.current = false;
        if (skipNextQueueRef.current) {
          skipNextQueueRef.current = false;
          return;
        }
        setTimeout(processNextInQueue, 50);
      }
    },
    [prompt, loading, projectId, incognito, messages, setSwarmRunning, refreshTokenUsage, enqueuePrompt, processNextInQueue, cleanupInProgressAssistant, pushSwarmTerminalLine, handleGitHubBuildBlocked, handleVercelBuildBlocked, setTokenUsage]
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
        sendQueuedNow,
        clearQueue,
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
