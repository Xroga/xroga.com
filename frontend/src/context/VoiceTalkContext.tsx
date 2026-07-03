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
import { useAppStore } from '@/store/useAppStore';

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
  welcomeText: string | null;
  liveReply: string | null;
  liveUser: string | null;
  interimUser: string | null;
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

const XROGA_LOGO = 'https://i.postimg.cc/9Mfm1jdK/xrogaai.png';
export { XROGA_LOGO };

function voiceWsUrl(token: string): string {
  const wsBase = API_URL.replace(/^http/, 'ws');
  return `${wsBase}/api/voice/ws?token=${encodeURIComponent(token)}`;
}

type SpeechRecognitionInstance = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult: ((ev: { results: SpeechRecognitionResultList }) => void) | null;
  onerror: ((ev: Event) => void) | null;
  onend: (() => void) | null;
};

function getSpeechRecognition(): (new () => SpeechRecognitionInstance) | null {
  if (typeof window === 'undefined') return null;
  const w = window as Window & {
    SpeechRecognition?: new () => SpeechRecognitionInstance;
    webkitSpeechRecognition?: new () => SpeechRecognitionInstance;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

async function toArrayBuffer(data: ArrayBuffer | Blob): Promise<ArrayBuffer> {
  if (data instanceof ArrayBuffer) return data;
  return data.arrayBuffer();
}

export function VoiceTalkProvider({ children }: { children: ReactNode }) {
  const profile = useAppStore((s) => s.profile);
  const displayName = profile?.display_name?.split(' ')[0] ?? 'there';

  const [overlayOpen, setOverlayOpen] = useState(false);
  const [state, setState] = useState<TalkState>('idle');
  const [statusLabel, setStatusLabel] = useState<string | null>(null);
  const [turns, setTurns] = useState<VoiceTurn[]>([]);
  const [welcomeText, setWelcomeText] = useState<string | null>(null);
  const [captionsOn, setCaptionsOn] = useState(true);
  const [speakerOn, setSpeakerOn] = useState(true);
  const [muted, setMuted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [liveReply, setLiveReply] = useState<string | null>(null);
  const [liveUser, setLiveUser] = useState<string | null>(null);
  const [interimUser, setInterimUser] = useState<string | null>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const welcomeWsRef = useRef<WebSocket | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const welcomeAudioRef = useRef<HTMLAudioElement | null>(null);
  const sessionRef = useRef(false);
  const welcomePlayedRef = useRef(false);
  const pendingTurnRef = useRef<{ user: string; reply: string } | null>(null);
  const speechRef = useRef<SpeechRecognitionInstance | null>(null);
  const stateRef = useRef(state);
  stateRef.current = state;
  const speakerOnRef = useRef(speakerOn);
  speakerOnRef.current = speakerOn;

  const cleanupMedia = useCallback(() => {
    speechRef.current?.abort();
    speechRef.current = null;

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
    setInterimUser(null);
    if (stateRef.current !== 'speaking') {
      setState('idle');
      setStatusLabel(null);
    }
  }, [cleanupMedia, closeSocket]);

  const closeOverlay = useCallback(() => {
    audioRef.current?.pause();
    welcomeAudioRef.current?.pause();
    welcomeWsRef.current?.close();
    welcomeWsRef.current = null;
    endVoiceSession();
    setOverlayOpen(false);
    setError(null);
    setWelcomeText(null);
    welcomePlayedRef.current = false;
    setTurns([]);
    setLiveReply(null);
    setLiveUser(null);
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
      welcomeWsRef.current?.close();
      audioRef.current?.pause();
      welcomeAudioRef.current?.pause();
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

  const playAudioBuffer = useCallback(
    (buffer: ArrayBuffer, opts: { welcome?: boolean; onFinish?: () => void }) => {
      const blob = new Blob([buffer], { type: 'audio/mpeg' });
      const url = URL.createObjectURL(blob);
      const audio = new Audio(url);
      audio.volume = speakerOnRef.current ? 1 : 0;

      if (opts.welcome) {
        welcomeAudioRef.current?.pause();
        welcomeAudioRef.current = audio;
      } else {
        audioRef.current?.pause();
        audioRef.current = audio;
        setState('speaking');
        setStatusLabel('Speaking…');
      }

      const finish = () => {
        URL.revokeObjectURL(url);
        if (opts.welcome) {
          welcomeAudioRef.current = null;
          if (!sessionRef.current) {
            setState('idle');
            setStatusLabel(null);
          }
        } else {
          audioRef.current = null;
          const pending = pendingTurnRef.current;
          if (pending) commitTurn(pending.user, pending.reply);
          setLiveReply(null);
          setLiveUser(null);
          setInterimUser(null);
          sessionRef.current = false;
          setState('idle');
          setStatusLabel(null);
          closeSocket();
        }
        opts.onFinish?.();
      };

      audio.onended = finish;
      audio.onerror = finish;
      void audio.play().catch(() => {
        if (!opts.welcome) {
          setError('Allow audio playback to hear XROGA');
        }
        finish();
      });
    },
    [closeSocket, commitTurn]
  );

  const handleWsMessage = useCallback(
    (event: MessageEvent, mode: 'talk' | 'welcome') => {
      if (typeof event.data !== 'string') {
        void toArrayBuffer(event.data as ArrayBuffer | Blob).then((buf) => {
          playAudioBuffer(buf, {
            welcome: mode === 'welcome',
            onFinish: mode === 'welcome' ? () => welcomeWsRef.current?.close() : undefined,
          });
        });
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

        if (msg.type === 'ready' && mode === 'talk') {
          return;
        }

        if (msg.type === 'status') {
          if (msg.stage === 'transcribing') {
            setState('processing');
            setStatusLabel('Transcribing…');
          }
          if (msg.stage === 'routing' || msg.stage === 'thinking') {
            setState('processing');
            setStatusLabel('Thinking…');
          }
          if (msg.stage === 'searching') {
            setState('processing');
            setStatusLabel('Searching the web…');
          }
          if (msg.stage === 'speaking') {
            if (mode === 'welcome') {
              setState('speaking');
              setStatusLabel('XROGA is greeting you…');
            } else {
              setStatusLabel('Speaking…');
            }
          }
          return;
        }

        if (msg.type === 'user_text' && msg.text) {
          setLiveUser(msg.text);
          setInterimUser(null);
          return;
        }

        if (msg.type === 'greeting' && msg.text) {
          setWelcomeText(msg.text);
          if (mode === 'welcome') {
            setState('speaking');
          }
          return;
        }

        if (msg.type === 'transcript') {
          if (msg.text) {
            setLiveUser(msg.text);
            setInterimUser(null);
          }
          if (msg.reply) {
            pendingTurnRef.current = {
              user: msg.text ?? liveUser ?? interimUser ?? '',
              reply: msg.reply,
            };
            setLiveReply(msg.reply);
          }
          return;
        }

        if (msg.type === 'done' && mode === 'talk') {
          return;
        }

        if (msg.type === 'error') {
          setError(msg.message ?? 'Voice error');
          if (mode === 'talk') endVoiceSession();
        }
      } catch { /* ignore */ }
    },
    [endVoiceSession, interimUser, liveUser, playAudioBuffer]
  );

  const playWelcome = useCallback(async () => {
    if (welcomePlayedRef.current || sessionRef.current) return;
    welcomePlayedRef.current = true;

    try {
      const token = await getAccessToken();
      if (!token) return;

      const ws = new WebSocket(voiceWsUrl(token));
      ws.binaryType = 'arraybuffer';
      welcomeWsRef.current = ws;

      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('Welcome timeout')), 15000);

        ws.onopen = () => {
          ws.send(JSON.stringify({ type: 'greeting', displayName }));
        };

        ws.onmessage = (event) => {
          handleWsMessage(event, 'welcome');
          if (typeof event.data === 'string') {
            try {
              const msg = JSON.parse(event.data) as { type: string };
              if (msg.type === 'greeting') clearTimeout(timeout);
              if (msg.type === 'done' || msg.type === 'error') {
                clearTimeout(timeout);
                resolve();
              }
            } catch { /* ignore */ }
          }
        };

        ws.onerror = () => {
          clearTimeout(timeout);
          reject(new Error('Welcome connection failed'));
        };
      });
    } catch {
      welcomePlayedRef.current = false;
    }
  }, [displayName, handleWsMessage]);

  useEffect(() => {
    if (!overlayOpen) return;
    const t = window.setTimeout(() => {
      void playWelcome();
    }, 400);
    return () => window.clearTimeout(t);
  }, [overlayOpen, playWelcome]);

  const startSpeechRecognition = useCallback(() => {
    const Ctor = getSpeechRecognition();
    if (!Ctor) return;

    try {
      const recognition = new Ctor();
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = 'en-US';

      recognition.onresult = (ev) => {
        let interim = '';
        let final = '';
        for (let i = 0; i < ev.results.length; i++) {
          const r = ev.results[i];
          if (r.isFinal) final += r[0].transcript;
          else interim += r[0].transcript;
        }
        if (final.trim()) {
          setInterimUser(final.trim());
        } else if (interim.trim()) {
          setInterimUser(interim.trim());
        }
      };

      recognition.onerror = () => { /* browser may deny — Groq STT is fallback */ };
      recognition.start();
      speechRef.current = recognition;
    } catch { /* unsupported */ }
  }, []);

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
        handleWsMessage(event, 'talk');

        if (typeof event.data === 'string') {
          try {
            const msg = JSON.parse(event.data) as { type: string };
            if (msg.type === 'ready') {
              clearTimeout(timeout);
              setState('recording');
              setStatusLabel('Listening… speak now');
              resolve(ws);
            }
          } catch { /* ignore */ }
        }
      };

      ws.onerror = () => {
        clearTimeout(timeout);
        reject(new Error('Voice connection failed'));
      };

      ws.onclose = () => {
        clearTimeout(timeout);
        if (
          sessionRef.current &&
          stateRef.current !== 'speaking' &&
          stateRef.current !== 'processing'
        ) {
          endVoiceSession();
        }
      };
    });
  }, [closeSocket, endVoiceSession, handleWsMessage]);

  const startTalk = useCallback(async () => {
    if (sessionRef.current) return;

    welcomeAudioRef.current?.pause();
    welcomeAudioRef.current = null;

    sessionRef.current = true;
    setError(null);
    setLiveReply(null);
    setLiveUser(null);
    setInterimUser(null);

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      streamRef.current = stream;
      stream.getAudioTracks().forEach((t) => {
        t.enabled = !muted;
      });

      const mimeCandidates = [
        'audio/webm;codecs=opus',
        'audio/webm',
        'audio/mp4',
        'audio/ogg;codecs=opus',
      ];
      const mimeType = mimeCandidates.find((m) => MediaRecorder.isTypeSupported(m)) ?? 'audio/webm';

      const ws = await openVoiceSocket();
      ws.send(JSON.stringify({ type: 'start', mimeType }));

      const recorder = new MediaRecorder(stream, { mimeType });
      recorderRef.current = recorder;

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0 && ws.readyState === WebSocket.OPEN) {
          void e.data.arrayBuffer().then((buf) => ws.send(buf));
        }
      };

      recorder.start(250);
      startSpeechRecognition();
    } catch (e) {
      sessionRef.current = false;
      setError((e as Error).message);
      endVoiceSession();
    }
  }, [endVoiceSession, muted, openVoiceSocket, startSpeechRecognition]);

  const stopTalk = useCallback(() => {
    if (!sessionRef.current || stateRef.current !== 'recording') return;

    speechRef.current?.stop();
    speechRef.current = null;

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
    setInterimUser(null);
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
      const next = !s;
      const vol = next ? 1 : 0;
      if (audioRef.current) audioRef.current.volume = vol;
      if (welcomeAudioRef.current) welcomeAudioRef.current.volume = vol;
      return next;
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
        welcomeText,
        liveReply,
        liveUser,
        interimUser,
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
