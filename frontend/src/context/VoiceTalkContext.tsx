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
import { API_URL, getAccessToken } from '@/lib/api';

export type TalkState = 'idle' | 'connecting' | 'recording' | 'processing' | 'speaking';

export interface VoiceTurn {
  id: string;
  role: 'user' | 'assistant';
  text: string;
}

interface VoiceTalkContextValue {
  overlayOpen: boolean;
  openOverlay: () => void;
  closeOverlay: () => void;
  state: TalkState;
  statusLabel: string | null;
  turns: VoiceTurn[];
  liveReply: string | null;
  liveUser: string | null;
  captionsOn: boolean;
  speakerOn: boolean;
  muted: boolean;
  toggleCaptions: () => void;
  toggleSpeaker: () => void;
  toggleMute: () => void;
  orbPress: () => void;
  cancelTalk: () => void;
  error: string | null;
  clearError: () => void;
}

const VoiceTalkContext = createContext<VoiceTalkContextValue | null>(null);

function voiceWsUrl(token: string): string {
  const wsBase = API_URL.replace(/^http/, 'ws');
  return `${wsBase}/api/voice/ws?token=${encodeURIComponent(token)}`;
}

export function VoiceTalkProvider({ children }: { children: ReactNode }) {
  const [overlayOpen, setOverlayOpen] = useState(false);
  const [state, setState] = useState<TalkState>('idle');
  const [statusLabel, setStatusLabel] = useState<string | null>(null);
  const [turns, setTurns] = useState<VoiceTurn[]>([]);
  const [captionsOn, setCaptionsOn] = useState(true);
  const [speakerOn, setSpeakerOn] = useState(true);
  const [muted, setMuted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [liveReply, setLiveReply] = useState<string | null>(null);
  const [liveUser, setLiveUser] = useState<string | null>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const sessionRef = useRef(false);
  const pendingTurnRef = useRef<{ user: string; reply: string } | null>(null);
  const stateRef = useRef(state);
  stateRef.current = state;

  const cleanupMedia = useCallback(() => {
    if (recorderRef.current && recorderRef.current.state !== 'inactive') {
      try {
        recorderRef.current.stop();
      } catch { /* ignore */ }
    }
    recorderRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  const closeSocket = useCallback(() => {
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
  }, []);

  const endVoiceSession = useCallback(() => {
    cleanupMedia();
    closeSocket();
    sessionRef.current = false;
    setState('idle');
    setStatusLabel(null);
  }, [cleanupMedia, closeSocket]);

  const closeOverlay = useCallback(() => {
    audioRef.current?.pause();
    endVoiceSession();
    setOverlayOpen(false);
    setError(null);
  }, [endVoiceSession]);

  const openOverlay = useCallback(() => {
    setOverlayOpen(true);
    setError(null);
  }, []);

  useEffect(() => {
    if (!overlayOpen) return;
    document.body.classList.add('xv-voice-overlay-open');
    return () => document.body.classList.remove('xv-voice-overlay-open');
  }, [overlayOpen]);

  useEffect(() => {
    return () => {
      cleanupMedia();
      closeSocket();
      audioRef.current?.pause();
    };
  }, [cleanupMedia, closeSocket]);

  const commitTurn = useCallback((user: string, reply: string) => {
    const id = `${Date.now()}`;
    setTurns((prev) => [
      ...prev,
      { id: `${id}-u`, role: 'user', text: user },
      { id: `${id}-a`, role: 'assistant', text: reply },
    ]);
    pendingTurnRef.current = null;
  }, []);

  const playAudio = useCallback(
    (buffer: ArrayBuffer) => {
      const blob = new Blob([buffer], { type: 'audio/mpeg' });
      const url = URL.createObjectURL(blob);
      const audio = new Audio(url);
      audio.volume = speakerOn ? 1 : 0;
      audioRef.current = audio;
      setState('speaking');
      setStatusLabel('Speaking…');

      const finish = () => {
        URL.revokeObjectURL(url);
        audioRef.current = null;
        const pending = pendingTurnRef.current;
        if (pending) commitTurn(pending.user, pending.reply);
        setLiveReply(null);
        setLiveUser(null);
        endVoiceSession();
      };

      audio.onended = finish;
      audio.onerror = finish;
      void audio.play().catch(() => {
        setError('Allow audio playback to hear XROGA');
        finish();
      });
    },
    [commitTurn, endVoiceSession, speakerOn]
  );

  const openVoiceSocket = useCallback(async (): Promise<WebSocket> => {
    closeSocket();
    const token = await getAccessToken();
    if (!token) throw new Error('Sign in to use voice talk');

    setState('connecting');
    setStatusLabel('Connecting…');

    return new Promise((resolve, reject) => {
      const ws = new WebSocket(voiceWsUrl(token));
      ws.binaryType = 'arraybuffer';
      wsRef.current = ws;

      const timeout = setTimeout(() => {
        reject(new Error('Voice connection timed out'));
        ws.close();
      }, 12000);

      ws.onmessage = (event) => {
        if (typeof event.data !== 'string') {
          if (event.data instanceof ArrayBuffer) playAudio(event.data);
          return;
        }

        try {
          const msg = JSON.parse(event.data) as {
            type: string;
            stage?: string;
            message?: string;
            text?: string;
            reply?: string;
          };

          if (msg.type === 'ready') {
            clearTimeout(timeout);
            setState('recording');
            setStatusLabel('Listening…');
            resolve(ws);
            return;
          }

          if (msg.type === 'status') {
            if (msg.stage === 'transcribing') setStatusLabel('Listening…');
            if (msg.stage === 'routing' || msg.stage === 'thinking') {
              setState('processing');
              setStatusLabel('Thinking…');
            }
            if (msg.stage === 'searching') {
              setState('processing');
              setStatusLabel('Searching the web…');
            }
            if (msg.stage === 'speaking') setStatusLabel('Speaking…');
            return;
          }

          if (msg.type === 'transcript' && msg.reply) {
            pendingTurnRef.current = {
              user: msg.text ?? '',
              reply: msg.reply,
            };
            setLiveReply(msg.reply);
            setLiveUser(msg.text ?? null);
            return;
          }

          if (msg.type === 'error') {
            setError(msg.message ?? 'Voice error');
            endVoiceSession();
            return;
          }
        } catch { /* ignore */ }
      };

      ws.onerror = () => {
        clearTimeout(timeout);
        reject(new Error('Voice connection failed'));
      };

      ws.onclose = () => {
        clearTimeout(timeout);
        if (sessionRef.current && stateRef.current !== 'speaking') {
          endVoiceSession();
        }
      };
    });
  }, [closeSocket, endVoiceSession, playAudio]);

  const startTalk = useCallback(async () => {
    if (sessionRef.current) return;
    sessionRef.current = true;
    setError(null);

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      stream.getAudioTracks().forEach((t) => {
        t.enabled = !muted;
      });

      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : 'audio/webm';

      const ws = await openVoiceSocket();
      ws.send(JSON.stringify({ type: 'start', mimeType }));

      const recorder = new MediaRecorder(stream, { mimeType });
      recorderRef.current = recorder;

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0 && ws.readyState === WebSocket.OPEN) {
          void e.data.arrayBuffer().then((buf) => ws.send(buf));
        }
      };

      recorder.start(1000);
    } catch (e) {
      sessionRef.current = false;
      setError((e as Error).message);
      endVoiceSession();
    }
  }, [endVoiceSession, muted, openVoiceSocket]);

  const stopTalk = useCallback(() => {
    if (!sessionRef.current || stateRef.current !== 'recording') return;

    const ws = wsRef.current;
    const recorder = recorderRef.current;

    const sendEnd = () => {
      if (ws && ws.readyState === WebSocket.OPEN) {
        setState('processing');
        setStatusLabel('Thinking…');
        ws.send(JSON.stringify({ type: 'end' }));
      } else {
        endVoiceSession();
      }
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
      recorderRef.current = null;
    };

    if (recorder && recorder.state === 'recording') {
      recorder.addEventListener('stop', sendEnd, { once: true });
      recorder.stop();
    } else {
      sendEnd();
    }
  }, [endVoiceSession]);

  const orbPress = useCallback(() => {
    if (stateRef.current === 'idle') void startTalk();
    else if (stateRef.current === 'recording') stopTalk();
  }, [startTalk, stopTalk]);

  const cancelTalk = useCallback(() => {
    audioRef.current?.pause();
    audioRef.current = null;
    pendingTurnRef.current = null;
    setLiveReply(null);
    setLiveUser(null);
    endVoiceSession();
  }, [endVoiceSession]);

  const toggleMute = useCallback(() => {
    setMuted((m) => {
      const next = !m;
      streamRef.current?.getAudioTracks().forEach((t) => {
        t.enabled = !next;
      });
      return next;
    });
  }, []);

  const toggleCaptions = useCallback(() => setCaptionsOn((c) => !c), []);
  const toggleSpeaker = useCallback(() => {
    setSpeakerOn((s) => {
      if (audioRef.current) audioRef.current.volume = s ? 0 : 1;
      return !s;
    });
  }, []);

  return (
    <VoiceTalkContext.Provider
      value={{
        overlayOpen,
        openOverlay,
        closeOverlay,
        state,
        statusLabel,
        turns,
        liveReply,
        liveUser,
        captionsOn,
        speakerOn,
        muted,
        toggleCaptions,
        toggleSpeaker,
        toggleMute,
        orbPress,
        cancelTalk,
        error,
        clearError: () => setError(null),
      }}
    >
      {children}
    </VoiceTalkContext.Provider>
  );
}

export function useVoiceTalk() {
  const ctx = useContext(VoiceTalkContext);
  if (!ctx) throw new Error('useVoiceTalk must be used within VoiceTalkProvider');
  return ctx;
}

/** @deprecated Use useVoiceTalk */
export function usePushToTalk() {
  const v = useVoiceTalk();
  return {
    state: v.state,
    statusLabel: v.statusLabel,
    lastReply: v.turns.at(-1)?.role === 'assistant' ? v.turns.at(-1)?.text ?? null : null,
    error: v.error,
    toggleTalk: v.orbPress,
    startTalk: v.orbPress,
    stopTalk: v.orbPress,
    clearError: v.clearError,
  };
}
