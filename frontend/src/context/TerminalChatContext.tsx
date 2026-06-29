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
import { streamSwarmExecute, ApiError } from '@/lib/api';
import type { SwarmProgressEvent } from '@/lib/swarm';
import { useAppStore } from '@/store/useAppStore';
import { usePrivacyStore } from '@/store/usePrivacyStore';
import { PENDING_PROMPT_KEY } from '@/lib/constants';
import {
  clearWorkspaceSession,
  loadWorkspaceSession,
  saveWorkspaceSession,
} from '@/lib/workspacePersistence';
import { addMediaItem, removeMediaByUrl, removeMediaByMessageId } from '@/lib/mediaStorage';
import { archiveChatTurn, removeChatArchiveEntry } from '@/lib/chatArchive';
import { isBuildPrompt, saveLocalProject } from '@/lib/projectArchive';
import { isImageGenerationPrompt, isVideoGenerationPrompt } from '@/lib/parseImageContent';
import { api } from '@/lib/api';
import toast from 'react-hot-toast';
import { isTrivialPrompt, isSimpleChat } from '@/lib/promptClassifier';

type MessageRole = 'user' | 'assistant' | 'system';

export interface ChatMessage {
  id: string;
  role: MessageRole;
  content: string;
  agent?: string;
  createdAt?: number;
  featureOutput?: unknown;
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
  imageProgressStep: string | null;
  videoProgressStep: string | null;
  followUps: string[];
  reasoning: string | null;
  dag: Array<{ id: string; description: string; agent: string }> | null;
  pipelineCompact: boolean;
  submit: (text?: string) => Promise<void>;
  stop: () => void;
  startNewChat: () => void;
  /** Permanently removes assistant response + its user prompt from chat, archive, and media */
  deleteTurn: (assistantMessageId: string) => void;
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
  const [imageProgressStep, setImageProgressStep] = useState<string | null>(null);
  const [videoProgressStep, setVideoProgressStep] = useState<string | null>(null);
  const [followUps, setFollowUps] = useState<string[]>([]);
  const [reasoning, setReasoning] = useState<string | null>(null);
  const [dag, setDag] = useState<Array<{ id: string; description: string; agent: string }> | null>(null);
  const [pipelineCompact, setPipelineCompact] = useState(false);
  const chatPrefill = useAppStore((s) => s.chatPrefill);
  const setChatPrefill = useAppStore((s) => s.setChatPrefill);
  const setSwarmRunning = useAppStore((s) => s.setSwarmRunning);
  const setActions = useAppStore((s) => s.setActions);
  const thinkingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const autoRanRef = useRef(false);
  const submitRef = useRef<(text?: string, fromQueue?: boolean) => Promise<void>>(async () => {});
  const queueRef = useRef<QueuedPrompt[]>([]);
  const lastTurnRef = useRef<{ userMessageId: string; assistantId: string; text: string } | null>(null);
  const [sessionReady, setSessionReady] = useState(false);

  queueRef.current = promptQueue;

  useEffect(() => {
    if (incognito) {
      setMessages([]);
      setPrompt('');
      setPromptQueue([]);
      return;
    }
    const session = loadWorkspaceSession();
    if (session?.messages?.length) setMessages(session.messages);
    if (session?.prompt) setPrompt(session.prompt);
    setSessionReady(true);
  }, [incognito]);

  useEffect(() => {
    if (!sessionReady || incognito) return;
    saveWorkspaceSession({ prompt, messages });
  }, [sessionReady, prompt, messages, incognito]);

  const enqueuePrompt = useCallback((text: string) => {
    setPromptQueue((q) => [...q, { id: crypto.randomUUID(), text, createdAt: Date.now() }]);
    toast('Queued — sends when current response finishes', { icon: '⏳' });
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
      removeMediaByMessageId(assistantMessageId);

      if (userIdx >= 0) {
        removeChatArchiveEntry(`chat-${current[userIdx]!.id}`);
      }

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
      setPromptQueue((q) => [item, ...q]);
      toast('Moved to front of queue', { icon: '⏳' });
      return;
    }
    void submitRef.current(item.text, true);
  }, [loading]);

  const clearQueue = useCallback(() => setPromptQueue([]), []);

  const submit = useCallback(
    async (overrideText?: string, fromQueue = false) => {
      const userPrompt = (overrideText ?? prompt).trim();
      if (!userPrompt) return;

      if (loading && !fromQueue) {
        enqueuePrompt(userPrompt);
        setPrompt('');
        return;
      }
      if (loading) return;

      const userMessageId = crypto.randomUUID();
      const assistantId = crypto.randomUUID();
      lastTurnRef.current = { userMessageId, assistantId, text: userPrompt };
      setMessages((m) => [...m, { id: userMessageId, role: 'user', content: userPrompt, createdAt: Date.now() }]);
      if (!fromQueue) setPrompt('');
      setLoading(true);
      setSwarmRunning(true);
      setSwarmActiveAgent(null);
      setPipelineMessage(null);
      setImageProgressStep(null);
      setVideoProgressStep(null);
      setFollowUps([]);
      setReasoning(null);
      setDag(null);

      const useCompactPipeline = isTrivialPrompt(userPrompt) || isSimpleChat(userPrompt);
      setPipelineCompact(useCompactPipeline);

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

        await streamSwarmExecute(userPrompt, {
          projectId,
          signal: controller.signal,
          compact: useCompactPipeline,
          onProgress: (event) => {
            gotEvent = true;
            if (thinkingTimerRef.current) {
              clearTimeout(thinkingTimerRef.current);
              thinkingTimerRef.current = null;
            }
            const label = event.message ?? event.status ?? 'Thinking…';
            setPipelineMessage(label);
            if (event.imageStep) setImageProgressStep(event.imageStep);
            if (event.videoStep) setVideoProgressStep(event.videoStep);
            if (event.agent) setSwarmActiveAgent(event.agent);
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
            if (output?.type === 'image' && typeof output.imageUrl === 'string') {
              addMediaItem({
                name: String(output.prompt ?? 'Xroga image').slice(0, 40),
                type: 'image',
                url: output.imageUrl,
                sourceMessageId: assistantId,
                sourcePrompt: userPrompt,
              });
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
              return;
            }
            if (output?.type === 'video_studio' && typeof output.streamingUrl === 'string') {
              addMediaItem({
                name: String(output.title ?? 'Xroga video').slice(0, 40),
                type: 'video',
                url: output.streamingUrl,
                sourceMessageId: assistantId,
                sourcePrompt: userPrompt,
              });
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
              return;
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

            void api.actions.balance().then(setActions).catch(() => {});
          },
        });

      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') {
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
        if (!incognito && turn) {
          setMessages((current) => {
            archiveChatTurn({
              prompt: turn.text,
              messages: current,
              userMessageId: turn.userMessageId,
              assistantMessageId: turn.assistantId,
            });
            if (isBuildPrompt(turn.text) && !isImageGenerationPrompt(turn.text) && !isVideoGenerationPrompt(turn.text)) {
              saveLocalProject({
                name: turn.text.slice(0, 48),
                prompt: turn.text,
                sourceMessageId: turn.assistantId,
              });
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
        setImageProgressStep(null);
        setVideoProgressStep(null);
        setPipelineCompact(false);
        setTimeout(processNextInQueue, 50);
      }
    },
    [prompt, loading, projectId, incognito, setSwarmRunning, setActions, enqueuePrompt, processNextInQueue]
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
        imageProgressStep,
        videoProgressStep,
        pipelineCompact,
        followUps,
        reasoning,
        dag,
        submit,
        stop,
        startNewChat,
        deleteTurn,
        removeFromQueue,
        editQueuedPrompt,
        sendQueuedNow,
        clearQueue,
        projectId,
      }}
    >
      {children}
    </TerminalChatContext.Provider>
  );
}

export function useTerminalChat() {
  const ctx = useContext(TerminalChatContext);
  if (!ctx) throw new Error('useTerminalChat must be used within TerminalChatProvider');
  return ctx;
}
