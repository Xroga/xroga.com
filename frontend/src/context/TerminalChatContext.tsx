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
import { useAppStore } from '@/store/useAppStore';
import { PENDING_PROMPT_KEY } from '@/lib/constants';
import {
  clearWorkspaceSession,
  loadWorkspaceSession,
  saveWorkspaceSession,
} from '@/lib/workspacePersistence';
import toast from 'react-hot-toast';

type MessageRole = 'user' | 'assistant' | 'system';

export interface ChatMessage {
  id: string;
  role: MessageRole;
  content: string;
  agent?: string;
}

interface TerminalChatContextValue {
  messages: ChatMessage[];
  prompt: string;
  setPrompt: (v: string) => void;
  loading: boolean;
  outOfActionsOpen: boolean;
  setOutOfActionsOpen: (v: boolean) => void;
  animatingId: string | null;
  submit: (text?: string) => Promise<void>;
  stop: () => void;
  startNewChat: () => void;
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
  const [prompt, setPrompt] = useState('');
  const [loading, setLoading] = useState(false);
  const [outOfActionsOpen, setOutOfActionsOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [animatingId, setAnimatingId] = useState<string | null>(null);
  const chatPrefill = useAppStore((s) => s.chatPrefill);
  const setChatPrefill = useAppStore((s) => s.setChatPrefill);
  const setSwarmRunning = useAppStore((s) => s.setSwarmRunning);
  const thinkingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const autoRanRef = useRef(false);
  const submitRef = useRef<(text?: string) => Promise<void>>(async () => {});
  const [sessionReady, setSessionReady] = useState(false);

  useEffect(() => {
    const session = loadWorkspaceSession();
    if (session?.messages?.length) setMessages(session.messages);
    if (session?.prompt) setPrompt(session.prompt);
    setSessionReady(true);
  }, []);

  useEffect(() => {
    if (!sessionReady) return;
    saveWorkspaceSession({ prompt, messages });
  }, [sessionReady, prompt, messages]);

  const addProgress = useCallback((agent: string, message: string) => {
    const key = agent.toLowerCase().replace(/\s/g, '_');
    const labels: Record<string, string> = {
      architect: 'Architect',
      builder: 'Builder',
      reviewer: 'Reviewer',
      qa: 'QA Tester',
      truth_council: 'Truth Council',
      complete: 'Complete',
    };
    const label = labels[key] ?? agent.replace(/_/g, ' ');
    setMessages((m) => [
      ...m,
      {
        id: crypto.randomUUID(),
        role: 'system',
        agent: key,
        content: `[${label}] ${message}`,
      },
    ]);
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
    setLoading(false);
    setSwarmRunning(false);
    setAnimatingId(null);
    clearWorkspaceSession();
  }, [setSwarmRunning]);

  const submit = useCallback(
    async (overrideText?: string) => {
      const text = (overrideText ?? prompt).trim();
      if (loading) return;
      if (!text) return;

      setMessages((m) => [...m, { id: crypto.randomUUID(), role: 'user', content: text }]);
      setPrompt('');
      setLoading(true);
      setSwarmRunning(true);

      const assistantId = crypto.randomUUID();
      let gotEvent = false;
      const controller = new AbortController();
      abortRef.current = controller;

      thinkingTimerRef.current = setTimeout(() => {
        if (!gotEvent) {
          addProgress('architect', 'Swarm is thinking...');
        }
      }, 3000);

      try {
        const supabase = createClient();
        const {
          data: { session },
        } = await supabase.auth.getSession();
        if (!session?.access_token) throw new Error('Please sign in to chat.');

        addProgress('architect', 'Planning...');

        setMessages((m) => [...m, { id: assistantId, role: 'assistant', content: '' }]);
        setAnimatingId(assistantId);

        let fullReply = '';

        await streamSwarmExecute(text, {
          projectId,
          signal: controller.signal,
          onProgress: (event) => {
            gotEvent = true;
            if (thinkingTimerRef.current) {
              clearTimeout(thinkingTimerRef.current);
              thinkingTimerRef.current = null;
            }
            const label = event.message ?? event.status ?? 'working';
            if (event.agent) {
              addProgress(event.agent, label);
            }
          },
          onDelta: (delta) => {
            gotEvent = true;
            fullReply += delta;
            setMessages((m) =>
              m.map((msg) =>
                msg.id === assistantId ? { ...msg, content: msg.content + delta } : msg
              )
            );
          },
        });

        if (fullReply) {
          addProgress('complete', fullReply.slice(0, 80) + (fullReply.length > 80 ? '…' : ''));
        }
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') {
          setMessages((m) => [
            ...m,
            { id: crypto.randomUUID(), role: 'system', content: '[Stopped] Response cancelled.' },
          ]);
          return;
        }
        if (err instanceof ApiError && err.status === 402) {
          setOutOfActionsOpen(true);
          setMessages((m) => m.filter((msg) => msg.id !== assistantId || msg.content.length > 0));
          return;
        }
        const message = (err as Error).message;
        toast.error(message);
        setMessages((m) => [
          ...m.filter((msg) => msg.id !== assistantId || msg.content.length > 0),
          { id: crypto.randomUUID(), role: 'assistant', content: `⚠️ ${message}` },
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
      }
    },
    [prompt, loading, projectId, addProgress, setSwarmRunning]
  );

  submitRef.current = submit;

  useEffect(() => {
    if (chatPrefill) {
      setPrompt(chatPrefill);
      setChatPrefill('');
    }
  }, [chatPrefill, setChatPrefill]);

  useEffect(() => {
    if (autoRanRef.current) return;
    const pending =
      typeof window !== 'undefined' ? localStorage.getItem(PENDING_PROMPT_KEY) : null;
    if (pending) {
      autoRanRef.current = true;
      localStorage.removeItem(PENDING_PROMPT_KEY);
      void submitRef.current(pending);
    }
  }, []);

  return (
    <TerminalChatContext.Provider
      value={{
        messages,
        prompt,
        setPrompt,
        loading,
        outOfActionsOpen,
        setOutOfActionsOpen,
        animatingId,
        submit,
        stop,
        startNewChat,
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
