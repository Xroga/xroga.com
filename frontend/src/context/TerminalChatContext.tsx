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
import toast from 'react-hot-toast';
import { isTrivialPrompt, isSimpleChat } from '@/lib/promptClassifier';

type MessageRole = 'user' | 'assistant' | 'system';

export interface ChatMessage {
  id: string;
  role: MessageRole;
  content: string;
  agent?: string;
  createdAt?: number;
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
  followUps: string[];
  reasoning: string | null;
  dag: Array<{ id: string; description: string; agent: string }> | null;
  pipelineCompact: boolean;
  submit: (text?: string) => Promise<void>;
  stop: () => void;
  startNewChat: () => void;
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
  const [followUps, setFollowUps] = useState<string[]>([]);
  const [reasoning, setReasoning] = useState<string | null>(null);
  const [dag, setDag] = useState<Array<{ id: string; description: string; agent: string }> | null>(null);
  const [pipelineCompact, setPipelineCompact] = useState(false);
  const chatPrefill = useAppStore((s) => s.chatPrefill);
  const setChatPrefill = useAppStore((s) => s.setChatPrefill);
  const setSwarmRunning = useAppStore((s) => s.setSwarmRunning);
  const thinkingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const autoRanRef = useRef(false);
  const submitRef = useRef<(text?: string, fromQueue?: boolean) => Promise<void>>(async () => {});
  const queueRef = useRef<QueuedPrompt[]>([]);
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
      const text = (overrideText ?? prompt).trim();
      if (!text) return;

      if (loading && !fromQueue) {
        enqueuePrompt(text);
        setPrompt('');
        return;
      }
      if (loading) return;

      setMessages((m) => [...m, { id: crypto.randomUUID(), role: 'user', content: text, createdAt: Date.now() }]);
      if (!fromQueue) setPrompt('');
      setLoading(true);
      setSwarmRunning(true);
      setSwarmActiveAgent(null);
      setPipelineMessage(null);
      setFollowUps([]);
      setReasoning(null);
      setDag(null);

      const useCompactPipeline = isTrivialPrompt(text) || isSimpleChat(text);
      setPipelineCompact(useCompactPipeline);

      const assistantId = crypto.randomUUID();
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

        await streamSwarmExecute(text, {
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
            const text = complete.output
              ? (() => {
                  const o = complete.output as { type?: string; imageUrl?: string; prompt?: string; provider?: string };
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
        abortRef.current = null;
        setLoading(false);
        setSwarmRunning(false);
        setAnimatingId(null);
        setSwarmActiveAgent(null);
        setPipelineMessage(null);
        setImageProgressStep(null);
        setPipelineCompact(false);
        setTimeout(processNextInQueue, 50);
      }
    },
    [prompt, loading, projectId, setSwarmRunning, enqueuePrompt, processNextInQueue]
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
        pipelineCompact,
        followUps,
        reasoning,
        dag,
        submit,
        stop,
        startNewChat,
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
