'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { API_URL, getAccessToken } from '@/lib/api';

export type TalkState = 'idle' | 'connecting' | 'recording' | 'processing' | 'speaking';

function voiceWsUrl(token: string): string {
  const wsBase = API_URL.replace(/^http/, 'ws');
  return `${wsBase}/api/voice/ws?token=${encodeURIComponent(token)}`;
}

export function usePushToTalk() {
  const [state, setState] = useState<TalkState>('idle');
  const [statusLabel, setStatusLabel] = useState<string | null>(null);
  const [lastReply, setLastReply] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const sessionRef = useRef(false);

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

  const resetToIdle = useCallback(() => {
    cleanupMedia();
    closeSocket();
    sessionRef.current = false;
    setState('idle');
    setStatusLabel(null);
  }, [cleanupMedia, closeSocket]);

  useEffect(() => {
    return () => {
      cleanupMedia();
      closeSocket();
      audioRef.current?.pause();
    };
  }, [cleanupMedia, closeSocket]);

  const playAudio = useCallback(
    (buffer: ArrayBuffer) => {
      const blob = new Blob([buffer], { type: 'audio/mpeg' });
      const url = URL.createObjectURL(blob);
      const audio = new Audio(url);
      audioRef.current = audio;
      setState('speaking');
      setStatusLabel('Speaking…');

      const finish = () => {
        URL.revokeObjectURL(url);
        audioRef.current = null;
        resetToIdle();
      };

      audio.onended = finish;
      audio.onerror = finish;
      void audio.play().catch(() => {
        setError('Allow audio playback to hear XROGA');
        finish();
      });
    },
    [resetToIdle]
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
              setStatusLabel('🔍 Searching the web…');
            }
            if (msg.stage === 'speaking') setStatusLabel('Speaking…');
            return;
          }

          if (msg.type === 'transcript' && msg.reply) {
            setLastReply(msg.reply);
            return;
          }

          if (msg.type === 'error') {
            setError(msg.message ?? 'Voice error');
            resetToIdle();
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
        if (sessionRef.current && state !== 'speaking') {
          resetToIdle();
        }
      };
    });
  }, [closeSocket, playAudio, resetToIdle, state]);

  const startTalk = useCallback(async () => {
    if (sessionRef.current) return;
    sessionRef.current = true;
    setError(null);

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

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
      resetToIdle();
    }
  }, [openVoiceSocket, resetToIdle]);

  const stopTalk = useCallback(() => {
    if (!sessionRef.current || state !== 'recording') return;

    const ws = wsRef.current;
    const recorder = recorderRef.current;

    const sendEnd = () => {
      if (ws && ws.readyState === WebSocket.OPEN) {
        setState('processing');
        setStatusLabel('Thinking…');
        ws.send(JSON.stringify({ type: 'end' }));
      } else {
        resetToIdle();
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
  }, [resetToIdle, state]);

  const toggleTalk = useCallback(() => {
    if (state === 'idle') void startTalk();
    else if (state === 'recording') stopTalk();
  }, [state, startTalk, stopTalk]);

  return {
    state,
    statusLabel,
    lastReply,
    error,
    toggleTalk,
    startTalk,
    stopTalk,
    clearError: () => setError(null),
  };
}
