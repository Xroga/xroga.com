'use client';

import { Pause, Play, Square, X } from 'lucide-react';
import { createPortal } from 'react-dom';
import { useCallback, useEffect, useRef, useState } from 'react';

import { cn } from '@/lib/utils';
import { transcribeVoiceAudio } from '@/lib/voiceApi';
import { AudioLinesIcon } from './AudioLinesIcon';

type VoiceMode = 'idle' | 'listening' | 'paused' | 'finalizing' | 'error';

interface BrowserSpeechRecognitionAlternative {
  transcript: string;
}

interface BrowserSpeechRecognitionResultLike {
  isFinal: boolean;
  0: BrowserSpeechRecognitionAlternative;
}

interface BrowserSpeechRecognitionEvent {
  resultIndex: number;
  results: ArrayLike<BrowserSpeechRecognitionResultLike>;
}

interface BrowserSpeechRecognitionErrorEvent {
  error: string;
}

interface BrowserSpeechRecognition {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onstart: (() => void) | null;
  onresult: ((event: BrowserSpeechRecognitionEvent) => void) | null;
  onerror: ((event: BrowserSpeechRecognitionErrorEvent) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
}

type BrowserSpeechRecognitionConstructor = new () => BrowserSpeechRecognition;

function recognitionConstructor(): BrowserSpeechRecognitionConstructor | null {
  if (typeof window === 'undefined') return null;
  const speechWindow = window as typeof window & {
    SpeechRecognition?: BrowserSpeechRecognitionConstructor;
    webkitSpeechRecognition?: BrowserSpeechRecognitionConstructor;
  };
  return speechWindow.SpeechRecognition ?? speechWindow.webkitSpeechRecognition ?? null;
}

function cleanSpeech(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

function mergeText(base: string, voice: string): string {
  const left = cleanSpeech(base);
  const right = cleanSpeech(voice);
  if (!left) return right;
  if (!right) return left;
  return `${left} ${right}`;
}

function recorderMimeType(): string | undefined {
  if (typeof MediaRecorder === 'undefined') return undefined;
  for (const mime of [
    'audio/webm;codecs=opus',
    'audio/webm',
    'audio/mp4',
    'audio/ogg;codecs=opus',
  ]) {
    if (MediaRecorder.isTypeSupported(mime)) return mime;
  }
  return undefined;
}

function VoiceWave({ level, paused }: { level: number; paused: boolean }) {
  const bars = 54;
  return (
    <span className={cn('xv-simple-voice-wave', paused && 'is-paused')} aria-hidden="true">
      {Array.from({ length: bars }, (_, index) => {
        const center = (bars - 1) / 2;
        const centerWeight = 1 - Math.abs(index - center) / Math.max(center, 1);
        const phase = ((index * 19) % 37) / 100;
        const live = paused ? 0 : Math.max(0.025, level);
        const scale = Math.max(
          0.08,
          Math.min(1, 0.12 + live * (0.72 + centerWeight * 0.68) + phase),
        );
        return <i key={index} style={{ transform: `scaleY(${scale})` }} />;
      })}
    </span>
  );
}

export function XrogaVoiceControl({
  composerText,
  onVoiceDraft,
}: {
  composerText: string;
  onVoiceDraft: (transcript: string) => void;
}) {
  const [mode, setModeState] = useState<VoiceMode>('idle');
  const modeRef = useRef<VoiceMode>('idle');
  const [level, setLevel] = useState(0);
  const [voiceStage, setVoiceStage] = useState<HTMLElement | null>(null);
  const [previewText, setPreviewText] = useState('');

  const composerTextRef = useRef(composerText);
  const baselineRef = useRef('');
  const finalTextRef = useRef('');
  const interimTextRef = useRef('');
  const streamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const recognitionRef = useRef<BrowserSpeechRecognition | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const recorderChunksRef = useRef<Blob[]>([]);
  const recorderResolveRef = useRef<((audio: Blob | null) => void) | null>(null);
  const endingRef = useRef(false);

  useEffect(() => {
    composerTextRef.current = composerText;
  }, [composerText]);

  const setMode = useCallback((next: VoiceMode) => {
    modeRef.current = next;
    setModeState(next);
  }, []);

  useEffect(() => {
    setVoiceStage(document.querySelector<HTMLElement>('[data-xroga-voice-stage]'));
  }, []);

  const stopMeter = useCallback(() => {
    if (animationFrameRef.current !== null) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
    setLevel(0);
  }, []);

  const startMeter = useCallback((stream: MediaStream) => {
    stopMeter();
    const AudioContextCtor =
      window.AudioContext ??
      (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextCtor) return;

    const context = new AudioContextCtor();
    const analyser = context.createAnalyser();
    analyser.fftSize = 256;
    analyser.smoothingTimeConstant = 0.7;
    context.createMediaStreamSource(stream).connect(analyser);
    audioContextRef.current = context;

    const bins = new Uint8Array(analyser.frequencyBinCount);
    const tick = () => {
      analyser.getByteFrequencyData(bins);
      let sum = 0;
      for (let index = 0; index < bins.length; index += 1) sum += bins[index] ?? 0;
      setLevel(Math.min(1, sum / Math.max(1, bins.length) / 105));
      animationFrameRef.current = requestAnimationFrame(tick);
    };
    animationFrameRef.current = requestAnimationFrame(tick);
  }, [stopMeter]);

  const releaseMicrophone = useCallback(() => {
    stopMeter();
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    void audioContextRef.current?.close().catch(() => undefined);
    audioContextRef.current = null;
  }, [stopMeter]);

  const stopRecognition = useCallback((abort = true) => {
    const recognition = recognitionRef.current;
    recognitionRef.current = null;
    try {
      if (abort) recognition?.abort();
      else recognition?.stop();
    } catch {
      // The browser may already have closed this recognition session.
    }
  }, []);

  const stopRecorder = useCallback(async (): Promise<Blob | null> => {
    const recorder = recorderRef.current;
    if (!recorder || recorder.state === 'inactive') return null;

    return new Promise<Blob | null>((resolve) => {
      recorderResolveRef.current = resolve;
      try {
        recorder.stop();
      } catch {
        recorderResolveRef.current = null;
        resolve(null);
      }
    });
  }, []);

  const startRecorder = useCallback((stream: MediaStream) => {
    if (typeof MediaRecorder === 'undefined') return;
    const mimeType = recorderMimeType();

    try {
      const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
      recorderChunksRef.current = [];
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) recorderChunksRef.current.push(event.data);
      };
      recorder.onstop = () => {
        const audio = recorderChunksRef.current.length
          ? new Blob(recorderChunksRef.current, {
              type: recorder.mimeType || mimeType || 'audio/webm',
            })
          : null;
        recorderChunksRef.current = [];
        recorderRef.current = null;
        const resolve = recorderResolveRef.current;
        recorderResolveRef.current = null;
        resolve?.(audio);
      };
      recorder.start(220);
      recorderRef.current = recorder;
    } catch {
      recorderRef.current = null;
    }
  }, []);

  const publishLiveDraft = useCallback(
    (finalText: string, interimText = '') => {
      const voice = cleanSpeech([finalText, interimText].filter(Boolean).join(' '));
      const fullText = mergeText(baselineRef.current, voice);
      composerTextRef.current = fullText;
      setPreviewText(voice);
      onVoiceDraft(fullText);
    },
    [onVoiceDraft],
  );

  const startRecognition = useCallback(() => {
    const Recognition = recognitionConstructor();
    if (!Recognition) return;

    const recognition = new Recognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = 'en-US';

    recognition.onresult = (event) => {
      let interim = '';
      for (let index = event.resultIndex; index < event.results.length; index += 1) {
        const result = event.results[index];
        const transcript = cleanSpeech(result[0]?.transcript ?? '');
        if (!transcript) continue;
        if (result.isFinal) {
          finalTextRef.current = mergeText(finalTextRef.current, transcript);
        } else {
          interim = mergeText(interim, transcript);
        }
      }

      interimTextRef.current = interim;
      publishLiveDraft(finalTextRef.current, interim);
    };

    recognition.onerror = (_event) => {
      // Browser recognition is only the live-caption path. Never tear down an
      // active recording because that service hiccups: MediaRecorder keeps the
      // audio and Stop still performs the authoritative backend transcription.
    };

    recognition.onend = () => {
      recognitionRef.current = null;
      if (!endingRef.current && modeRef.current === 'listening') {
        window.setTimeout(() => {
          if (!endingRef.current && modeRef.current === 'listening') startRecognition();
        }, 120);
      }
    };

    recognitionRef.current = recognition;
    try {
      recognition.start();
    } catch {
      recognitionRef.current = null;
    }
  }, [publishLiveDraft]);

  const ensureMicrophone = useCallback(async () => {
    if (streamRef.current?.active) return streamRef.current;
    if (!navigator.mediaDevices?.getUserMedia) {
      setMode('error');
      return null;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          channelCount: 1,
        },
      });
      streamRef.current = stream;
      startMeter(stream);
      return stream;
    } catch {
      setMode('error');
      return null;
    }
  }, [startMeter]);

  const startVoice = useCallback(async () => {
    if (mode === 'listening' || mode === 'paused' || mode === 'finalizing') return;

    const stream = await ensureMicrophone();
    if (!stream) return;

    baselineRef.current = composerTextRef.current.trim();
    finalTextRef.current = '';
    interimTextRef.current = '';
    endingRef.current = false;
    setPreviewText('');
    setMode('listening');

    startRecorder(stream);
    startRecognition();
  }, [ensureMicrophone, mode, startRecognition, startRecorder]);

  const pauseVoice = useCallback(() => {
    if (mode !== 'listening') return;
    stopRecognition(false);
    try {
      if (recorderRef.current?.state === 'recording') recorderRef.current.pause();
    } catch {
      // Some browsers do not expose MediaRecorder pause.
    }
    setMode('paused');
  }, [mode, stopRecognition]);

  const resumeVoice = useCallback(() => {
    if (mode !== 'paused') return;
    try {
      if (recorderRef.current?.state === 'paused') recorderRef.current.resume();
    } catch {
      // Continue with browser recognition even if the recorder could not resume.
    }
    setMode('listening');
    window.setTimeout(() => startRecognition(), 30);
  }, [mode, startRecognition]);

  const cancelVoice = useCallback(async () => {
    endingRef.current = true;
    stopRecognition(true);
    await stopRecorder();
    onVoiceDraft(baselineRef.current);
    composerTextRef.current = baselineRef.current;
    finalTextRef.current = '';
    interimTextRef.current = '';
    setPreviewText('');
    releaseMicrophone();
    setMode('idle');
  }, [onVoiceDraft, releaseMicrophone, stopRecognition, stopRecorder]);

  const finishVoice = useCallback(async () => {
    if (endingRef.current || (mode !== 'listening' && mode !== 'paused')) return;
    endingRef.current = true;
    setMode('finalizing');

    stopRecognition(false);
    const browserVoice = cleanSpeech(
      [finalTextRef.current, interimTextRef.current].filter(Boolean).join(' '),
    );
    const audio = await stopRecorder();

    let finalVoice = browserVoice;
    if (audio && audio.size >= 512) {
      try {
        const authoritative = cleanSpeech(await transcribeVoiceAudio(audio));
        if (authoritative) finalVoice = authoritative;
      } catch {
        // Do not erase what the user already saw in the composer if the
        // final server pass is unavailable.
      }
    }

    const fullText = mergeText(baselineRef.current, finalVoice);
    composerTextRef.current = fullText;
    onVoiceDraft(fullText);

    finalTextRef.current = '';
    interimTextRef.current = '';
    setPreviewText('');
    releaseMicrophone();
    endingRef.current = false;
    setMode('idle');
  }, [mode, onVoiceDraft, releaseMicrophone, stopRecognition, stopRecorder]);

  useEffect(() => {
    return () => {
      endingRef.current = true;
      stopRecognition(true);
      void stopRecorder();
      releaseMicrophone();
    };
  }, [releaseMicrophone, stopRecognition, stopRecorder]);

  const active = mode === 'listening' || mode === 'paused' || mode === 'finalizing';

  const session = voiceStage && active
    ? createPortal(
        <div
          className={cn(
            'xv-simple-voice-session',
            mode === 'paused' && 'is-paused',
            mode === 'finalizing' && 'is-finalizing',
          )}
          data-testid="xroga-voice-session"
        >
          <button
            type="button"
            className="xv-simple-voice-control xv-simple-voice-cancel"
            onClick={() => void cancelVoice()}
            aria-label="Cancel voice typing"
            disabled={mode === 'finalizing'}
          >
            <X className="h-4 w-4" aria-hidden />
          </button>

          <div className="xv-simple-voice-main" aria-live="polite">
            <div className="xv-simple-voice-transcript">
              {mode === 'finalizing'
                ? 'Finishing transcription…'
                : previewText || (mode === 'paused' ? 'Paused' : 'Listening…')}
            </div>
            <VoiceWave level={level} paused={mode === 'paused' || mode === 'finalizing'} />
          </div>

          <div className="xv-simple-voice-actions">
            <button
              type="button"
              className="xv-simple-voice-control"
              onClick={mode === 'paused' ? resumeVoice : pauseVoice}
              aria-label={mode === 'paused' ? 'Resume voice typing' : 'Pause voice typing'}
              disabled={mode === 'finalizing'}
            >
              {mode === 'paused'
                ? <Play className="h-4 w-4" aria-hidden />
                : <Pause className="h-4 w-4" aria-hidden />}
            </button>
            <button
              type="button"
              className="xv-simple-voice-control xv-simple-voice-stop"
              onClick={() => void finishVoice()}
              aria-label="Stop voice typing and keep text"
              disabled={mode === 'finalizing'}
            >
              <Square className="h-3.5 w-3.5" fill="currentColor" aria-hidden />
            </button>
          </div>
        </div>,
        voiceStage,
      )
    : null;

  return (
    <>
      <button
        type="button"
        className={cn(
          'xv-voice-icon-only',
          active && 'is-listening',
          mode === 'error' && 'is-error',
        )}
        onClick={() => {
          if (mode === 'idle' || mode === 'error') void startVoice();
          else if (mode === 'listening' || mode === 'paused') void finishVoice();
        }}
        aria-label={active ? 'Stop voice typing and keep text' : 'Start voice typing'}
        title={active ? 'Stop voice typing' : 'Voice typing'}
      >
        <AudioLinesIcon size={28} active={mode === 'listening'} />
      </button>
      {session}
    </>
  );
}
