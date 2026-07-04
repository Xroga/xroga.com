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
import type { SwarmProgressEvent } from '@/lib/swarm';
import { useAppStore } from '@/store/useAppStore';
import { usePrivacyStore } from '@/store/usePrivacyStore';
import { PENDING_PROMPT_KEY } from '@/lib/constants';
import {
  clearWorkspaceSession,
  loadWorkspaceSession,
  saveWorkspaceSession,
} from '@/lib/workspacePersistence';
import { addMediaItem, removeMediaByUrl, removeMediaByMessageId, purgeMediaUrls } from '@/lib/mediaStorage';
import { collectVariantUrlsFromOutput } from '@/lib/mediaHelpers';
import { archiveChatTurn, removeChatArchiveEntry } from '@/lib/chatArchive';
import { buildPromptWithMemory, isBuildThreadContinuation, isPhase1BuildQuestion, isWebsiteBuildUpdate, isWebsiteUpdateRequest, looksLikeBuildClarificationAnswer, threadHasCompletedWebsite } from '@/lib/chatMemory';
import { sanitizeChatMessages } from '@/lib/sanitizeChatMessages';
import { defaultImageAttachmentPrompt } from '@/lib/parseImageContent';
import { saveLocalProject, shouldSaveToProjects } from '@/lib/projectArchive';
import toast from 'react-hot-toast';
import { sanitizePlainAiText } from '@/lib/plainAiText';
import { isTrivialPrompt, isSimpleChat } from '@/lib/promptClassifier';
import { isVideoGenerationPrompt, estimateVideoSeconds } from '@/lib/parseImageContent';
import { requiresGitHubForBuild } from '@/lib/messageHelpers';
import { GitHubBuildGateModal } from '@/components/terminal/GitHubBuildGateModal';
import { GitHubActivationOverlay } from '@/components/terminal/GitHubActivationOverlay';
import { GITHUB_CONNECTED_EVENT } from '@/lib/githubEvents';
import {
  clearGitHubConnectedSession,
  isGitHubConnectRequiredText,
  markGitHubConnectedSession,
  sanitizeXrogaTerminalText,
} from '@/lib/xrogaBrand';
import { addPendingVideoJob } from '@/lib/pendingVideoJobs';
import { useBackgroundVideoJobs } from '@/hooks/useBackgroundVideoJobs';

type MessageRole = 'user' | 'assistant' | 'system';

export interface ChatMessage {
  id: string;
  role: MessageRole;
  content: string;
  agent?: string;
  createdAt?: number;
  featureOutput?: unknown;
  /** Behind-the-scenes reasoning steps shown after response */
  thinkingSteps?: string[];
  thoughtMs?: number;
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
  videoProgressStep: string | null;
  videoOmniPhase: string | null;
  videoEstimateSeconds: number | null;
  videoStartedAt: number | null;
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
  startNewChat: () => void;
  /** Restore session from workspace (e.g. jump from AI Media) */
  hydrateFromSession: () => void;
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
  const [videoProgressStep, setVideoProgressStep] = useState<string | null>(null);
  const [videoOmniPhase, setVideoOmniPhase] = useState<string | null>(null);
  const [videoEstimateSeconds, setVideoEstimateSeconds] = useState<number | null>(null);
  const [videoStartedAt, setVideoStartedAt] = useState<number | null>(null);
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
  const [githubActivation, setGithubActivation] = useState<{ open: boolean; username?: string }>({
    open: false,
  });
  const afterGitHubActivationRef = useRef<(() => void) | null>(null);
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
  const setActions = useAppStore((s) => s.setActions);
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

  queueRef.current = promptQueue;

  useBackgroundVideoJobs(
    ({ assistantMessageId, output }) => {
      setMessages((m) =>
        m.map((msg) =>
          msg.id === assistantMessageId ? { ...msg, content: '', featureOutput: output } : msg
        )
      );
      toast.success('Your video is ready!');
    },
    (_jobId, assistantMessageId, error) => {
      setMessages((m) =>
        m.map((msg) =>
          msg.id === assistantMessageId ? { ...msg, content: error, featureOutput: undefined } : msg
        )
      );
      toast.error('Video generation failed');
    }
  );

  useEffect(() => {
    if (incognito) {
      setMessages([]);
      setPrompt('');
      setPromptQueue([]);
      return;
    }
    const session = loadWorkspaceSession();
    if (session?.messages?.length) {
      const restored = sanitizeChatMessages(session.messages);
      setMessages(restored);
      if (threadHasCompletedWebsite(restored)) {
        completedWebsiteBuildRef.current = true;
      }
    }
    if (session?.prompt) setPrompt(session.prompt);
    setSessionReady(true);
  }, [incognito]);

  useEffect(() => {
    const isDashboard = pathname === '/dashboard' || pathname === '/dashboard/';
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
    window.history.replaceState({}, '', '/dashboard');
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
    const line = sanitizeXrogaTerminalText(raw);
    if (!line) return;
    setPipelineMessage(line);
    setSwarmActivityLog((prev) =>
      prev[prev.length - 1] === line ? prev : [...prev, line].slice(-24)
    );
  }, []);

  const hydrateFromSession = useCallback(() => {
    if (incognito) return;
    const session = loadWorkspaceSession();
    if (!session) return;
    if (session.messages?.length) setMessages(sanitizeChatMessages(session.messages));
    if (session.prompt) setPrompt(session.prompt);
  }, [incognito]);

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
      saveWorkspaceSession({
        prompt: threadPrompt,
        messages: thread,
        source: 'media',
        jumpMessageId,
        selectedId: jumpMessageId ?? thread[thread.length - 1]?.id ?? 'isolated',
        selectedLabel: threadPrompt.slice(0, 40),
      });
    },
    [incognito, setSwarmRunning],
  );

  useEffect(() => {
    if (incognito || pathname !== '/dashboard') return;
    hydrateFromSession();
  }, [pathname, incognito, hydrateFromSession]);

  useEffect(() => {
    if (!sessionReady || incognito) return;
    try {
      saveWorkspaceSession({ prompt, messages });
    } catch (err) {
      console.warn('[workspace] persist skipped:', (err as Error).message);
    }
  }, [sessionReady, prompt, messages, incognito]);

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

  const startNewChat = useCallback(() => {
    abortRef.current?.abort();
    if (thinkingTimerRef.current) {
      clearTimeout(thinkingTimerRef.current);
      thinkingTimerRef.current = null;
    }
    setMessages([]);
    setPrompt('');
    setPromptQueue([]);
    setLoading(false);
    setSwarmRunning(false);
    setAnimatingId(null);
    setSwarmActiveAgent(null);
    if (!usePrivacyStore.getState().incognito) clearWorkspaceSession();
  }, [setSwarmRunning]);

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
        setVideoProgressStep(null);
        setVideoOmniPhase(null);
      } else if (loading && !fromQueue) {
        enqueuePrompt(userPrompt);
        setPrompt('');
        return;
      } else if (loading) {
        return;
      }

      if (requiresGitHubForBuild(userPrompt) || isBuildThreadContinuation(userPrompt, messages)) {
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
      }

      const userMessageId = crypto.randomUUID();
      const assistantId = crypto.randomUUID();
      const displayPrompt =
        userPrompt ||
        (attachments?.length ? defaultImageAttachmentPrompt('', true) : '');
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
      setVideoProgressStep(null);
      setVideoOmniPhase(null);
      setVideoEstimateSeconds(isVideoGenerationPrompt(displayPrompt) ? estimateVideoSeconds(displayPrompt) : null);
      setVideoStartedAt(isVideoGenerationPrompt(displayPrompt) ? Date.now() : null);
      setFollowUps([]);
      setReasoning(null);
      setDag(null);
      setSwarmNegotiationPhase(null);
      setSwarmTodos([]);
      setSwarmStatusLabel(null);
      setSwarmAnalysis(null);
      setSwarmActivityLog([]);

      const isWebsiteBuildPrompt =
        /\b(build|create|make)\b[\s\S]{0,60}\b(website|site|shop|coffee|landing|store|restaurant)\b/i.test(
          displayPrompt
        );

      const useCompactPipeline =
        !isBuildThreadContinuation(displayPrompt, messages) &&
        !isWebsiteBuildUpdate(displayPrompt, messages) &&
        !(completedWebsiteBuildRef.current && isWebsiteUpdateRequest(displayPrompt)) &&
        !(activeWebsiteBuildRef.current && looksLikeBuildClarificationAnswer(displayPrompt)) &&
        !isWebsiteBuildPrompt &&
        (isVideoGenerationPrompt(displayPrompt) || isTrivialPrompt(userPrompt) || isSimpleChat(userPrompt));
      setPipelineCompact(useCompactPipeline);

      if (isVideoGenerationPrompt(displayPrompt)) {
        setPipelineMessage('Omni-Reality Studio — starting video production…');
        setVideoOmniPhase('trinity_scripting');
        setVideoProgressStep('scripting');
      }

      let gotEvent = false;
      let fullReply = '';
      const controller = new AbortController();
      abortRef.current = controller;

      thinkingTimerRef.current = setTimeout(() => {
        if (!gotEvent) setPipelineMessage('Thinking…');
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

        let history = threadForMemory
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
            if (event.videoStep) setVideoProgressStep(event.videoStep);
            if ((event as { omniPhase?: string }).omniPhase) setVideoOmniPhase((event as { omniPhase?: string }).omniPhase ?? null);
            if (event.message) setPipelineMessage(sanitizeXrogaTerminalText(event.message));
            const layer = (event as { councilLayer?: 'elite' | 'reserve' | 'blackhole' }).councilLayer;
            if (layer) setCouncilLayer(layer);
            if (event.agent) setSwarmActiveAgent(event.agent);
            const negPhase = (event as SwarmProgressEvent).userFacingPhase ?? (event as SwarmProgressEvent).negotiationPhase;
            if (negPhase != null) setSwarmNegotiationPhase(negPhase);
            const swarmEv = event as SwarmProgressEvent;
            if (swarmEv.swarmTodos?.length) setSwarmTodos(swarmEv.swarmTodos);
            if (swarmEv.swarmStatusLabel) {
              setSwarmStatusLabel(sanitizeXrogaTerminalText(swarmEv.swarmStatusLabel));
            }
            if (swarmEv.swarmAnalysis) {
              setSwarmAnalysis(sanitizeXrogaTerminalText(swarmEv.swarmAnalysis));
            }
            const activity = swarmEv.swarmActivity ?? swarmEv.message;
            if (activity) pushSwarmTerminalLine(activity);
            if (swarmEv.needsGitHub) {
              handleGitHubBuildBlocked(displayPrompt, attachments);
            }
            if (swarmEv.swarmTodos?.some((t) => t.id === 'github' && t.status === 'done')) {
              skipGithubGateRef.current = false;
            }
            const pendingVideo = isVideoGenerationPrompt(displayPrompt);
            if (pendingVideo && event.message) {
              setMessages((m) =>
                m.map((msg) => {
                  if (msg.id !== assistantId) return msg;
                  const fo = msg.featureOutput as Record<string, unknown> | undefined;
                  if (fo?.type !== 'video_job_pending') return msg;
                  return {
                    ...msg,
                    featureOutput: {
                      ...fo,
                      message: event.message,
                      progress: {
                        step: event.videoStep ?? fo.progress,
                        message: event.message,
                        omniPhase: (event as { omniPhase?: string }).omniPhase,
                      },
                    },
                  };
                })
              );
            }
            const ev = event as SwarmProgressEvent & { dag?: typeof dag; thinking?: string };
            if (ev.thinking && !useCompactPipeline) setReasoning(ev.thinking);
            if (ev.dag && !useCompactPipeline) setDag(ev.dag);
          },
          onDelta: (delta) => {
            gotEvent = true;
            fullReply += delta;
            setMessages((m) =>
              m.map((msg) => (msg.id === assistantId ? { ...msg, content: msg.content + delta } : msg))
            );
          },
          onComplete: (complete) => {
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
            if (output?.type === 'landing_page' && typeof output.deployUrl === 'string') {
              activeWebsiteBuildRef.current = null;
              completedWebsiteBuildRef.current = true;
              setMessages((m) =>
                m.map((msg) =>
                  msg.id === assistantId ? { ...msg, content: '', featureOutput: output } : msg
                )
              );
              return;
            }
            if (output?.type === 'video_job_pending' && typeof output.jobId === 'string') {
              const startedAt = Date.now();
              const estimatedSeconds =
                typeof output.estimatedSeconds === 'number' ? output.estimatedSeconds : 120;
              const pendingOutput = { ...output, startedAt, userPrompt: displayPrompt };
              addPendingVideoJob({
                jobId: output.jobId as string,
                assistantMessageId: assistantId,
                userMessageId,
                userPrompt: displayPrompt,
                estimatedSeconds,
                startedAt,
              });
              setMessages((m) =>
                m.map((msg) =>
                  msg.id === assistantId
                    ? { ...msg, content: '', featureOutput: pendingOutput }
                    : msg
                )
              );
              return;
            }
            if (output?.type === 'video_studio') {
              const streamUrl =
                typeof output.streamingUrl === 'string'
                  ? output.streamingUrl
                  : typeof output.videoUrl === 'string'
                    ? output.videoUrl
                    : null;
              if (streamUrl) {
                const videoOutput = { ...output, streamingUrl: streamUrl, prompt: userPrompt };
                setMessages((m) => {
                  const updated = m.map((msg) =>
                    msg.id === assistantId
                      ? { ...msg, content: '', featureOutput: videoOutput }
                      : msg
                  );
                  addMediaItem({
                    name: String(output.title ?? 'Xroga video').slice(0, 40),
                    type: 'video',
                    url: streamUrl,
                    sourceMessageId: assistantId,
                    sourcePrompt: userPrompt,
                    messagesSnapshot: updated,
                  });
                  return updated;
                });
                return;
              }
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

            void api.actions.balance().then(setActions).catch(() => {});
          },
        });

      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') {
          if (interruptRef.current) {
            interruptRef.current = false;
            cleanupInProgressAssistant();
            return;
          }
          setMessages((m) => [
            ...m,
            { id: crypto.randomUUID(), role: 'system', content: '[Stopped] Response cancelled.', createdAt: Date.now() },
          ]);
          return;
        }
        if (err instanceof ApiError && err.status === 402) {
          setOutOfActionsOpen(true);
          setMessages((m) => m.filter((msg) => msg.id !== assistantId || msg.content.length > 0));
          return;
        }
        const friendly =
          "I'm putting the finishing touches on this — here's a helpful answer while XROGA keeps working in the background.";
        setMessages((m) => [
          ...m.filter((msg) => msg.id !== assistantId || msg.content.length > 0),
          {
            id: assistantId,
            role: 'assistant',
            content: fullReply || friendly,
            createdAt: Date.now(),
          },
        ]);
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
              const plain = msg.content ? sanitizePlainAiText(msg.content) : msg.content;
              return {
                ...msg,
                content: plain,
                thinkingSteps: steps.length ? steps : msg.thinkingSteps,
                thoughtMs: thoughtMs > 0 ? thoughtMs : msg.thoughtMs,
              };
            })
          );
        }
        if (turn && isVideoGenerationPrompt(turn.text) && !interruptRef.current) {
          setMessages((m) => {
            const assistant = m.find((msg) => msg.id === turn.assistantId);
            if (assistant && !assistant.featureOutput && !assistant.content?.trim()) {
              return m.map((msg) =>
                msg.id === turn.assistantId
                  ? {
                      ...msg,
                      content:
                        'Video took longer than expected. Please try again — if this persists, ensure the latest backend is deployed.',
                    }
                  : msg
              );
            }
            return m;
          });
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
        setVideoProgressStep(null);
        setVideoOmniPhase(null);
        setPipelineCompact(false);
        interruptRef.current = false;
        if (skipNextQueueRef.current) {
          skipNextQueueRef.current = false;
          return;
        }
        setTimeout(processNextInQueue, 50);
      }
    },
    [prompt, loading, projectId, incognito, messages, setSwarmRunning, setActions, enqueuePrompt, processNextInQueue, cleanupInProgressAssistant, pushSwarmTerminalLine, handleGitHubBuildBlocked]
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
        videoProgressStep,
        videoOmniPhase,
        videoEstimateSeconds,
        videoStartedAt,
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
        startNewChat,
        hydrateFromSession,
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
