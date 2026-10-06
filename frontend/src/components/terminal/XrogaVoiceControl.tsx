'use client';

import {
  ArrowUp,
  Check,
  Mic2,
  Pause,
  Play,
  Square,
  X,
} from 'lucide-react';
import { createPortal } from 'react-dom';
import { useCallback, useEffect, useRef, useState } from 'react';

import { cn } from '@/lib/utils';
import { transcribeVoiceAudio } from '@/lib/voiceApi';
import { useVoicePrefsStore } from '@/store/useVoicePrefsStore';

type VoiceMode =
  | 'off'
  | 'armed'
  | 'listening'
  | 'paused'
  | 'transcribing'
  | 'error';

type VoiceControlAction =
  | 'pause'
  | 'resume'
  | 'stop'
  | 'done'
  | 'send'
  | 'cancel';

interface BrowserSpeechRecognitionEvent {
  resultIndex: number;
  results: ArrayLike<{
    isFinal: boolean;
    0: { transcript: string };
  }>;
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

/*
 * Xroga is a coined brand name, so speech engines routinely return near-phonetic
 * spellings. These aliases are recognition-only. The product is always rendered as
 * "Xroga".
 */
const WAKE_ALIAS_SOURCE =
  '(?:x\\s*roga|ex\\s*roga|acroga|a\\s*croga|zroga|xroga|eks\\s*roga|کس\\s*روگا|ایکس\\s*روگا)';
const WAKE_WORD = new RegExp('\\b' + WAKE_ALIAS_SOURCE + '\\b', 'iu');

const CONTROL_PHRASES: Record<VoiceControlAction, string[]> = {
  send: [
    'send',
    'send it',
    'submit',
    'enter',
    'enter now',
    'go',
    'start now',
    'now start',
    'bhej do',
    'بھیج دو',
    'ارسال',
    'ارسل',
    'أرسل',
    'भेज दो',
    'भेजें',
    'envia',
    'envíalo',
    'enviar',
    'manda',
    'envoyer',
    'senden',
    'invia',
    'gönder',
    'kirim',
    ' পাঠাও',
    '发送',
    '送信',
    '보내',
  ],
  stop: [
    'stop',
    'stop recording',
    'بس',
    'رک جاؤ',
    'رکیں',
    'रुको',
    'रुक जाओ',
    'para',
    'parar',
    'detener',
    'pare',
    'arrête',
    'stopp',
    'stoppen',
    'dur',
    'berhenti',
    'থামো',
    '停止',
    'やめて',
    '중지',
  ],
  done: [
    'done',
    'finish',
    'finished',
    'i am done',
    'im done',
    'ختم',
    'ہو گیا',
    'हो गया',
    'समाप्त',
    'انتهيت',
    'تم',
    'listo',
    'terminé',
    'pronto',
    'fini',
    'fertig',
    'finito',
    'tamam',
    'selesai',
    'শেষ',
    '完成',
    '完了',
    '완료',
  ],
  pause: [
    'pause',
    'hold',
    'hold on',
    'وقف',
    'توقف مؤقت',
    'رکو',
    'रुकना',
    'ठहरो',
    'pausa',
    'pausar',
    'pausez',
    'pausieren',
    'duraklat',
    'jeda',
    'বিরতি',
    '暂停',
    '一時停止',
    '일시정지',
  ],
  resume: [
    'resume',
    'continue',
    'carry on',
    'keep going',
    'جاری رکھو',
    'جاری رکھیں',
    'जारी रखो',
    'تابع',
    'استمر',
    'continuar',
    'continua',
    'continuez',
    'fortsetzen',
    'devam',
    'lanjut',
    'চালিয়ে যাও',
    '继续',
    '再開',
    '계속',
  ],
  cancel: [
    'cancel',
    'discard',
    'never mind',
    'forget it',
    'منسوخ',
    'چھوڑ دو',
    'रद्द',
    'छोड़ दो',
    'الغاء',
    'إلغاء',
    'cancelar',
    'cancela',
    'annuler',
    'abbrechen',
    'annulla',
    'iptal',
    'batal',
    'বাতিল',
    '取消',
    'キャンセル',
    '취소',
  ],
};

const TASK_STOP_PHRASES = new Set([
  'stop task',
  'stop working',
  'cancel task',
  'cancel build',
  'stop build',
  'halt task',
]);

const CONTROL_MATCH_ORDER = (
  Object.entries(CONTROL_PHRASES) as Array<[VoiceControlAction, string[]]>
).flatMap(([action, phrases]) =>
  phrases.map((phrase) => ({ action, phrase: phrase.trim().toLocaleLowerCase() })),
).sort((a, b) => b.phrase.length - a.phrase.length);

function recognitionConstructor(): BrowserSpeechRecognitionConstructor | null {
  if (typeof window === 'undefined') return null;
  const speechWindow = window as typeof window & {
    SpeechRecognition?: BrowserSpeechRecognitionConstructor;
    webkitSpeechRecognition?: BrowserSpeechRecognitionConstructor;
  };
  return speechWindow.SpeechRecognition ?? speechWindow.webkitSpeechRecognition ?? null;
}

function recognitionLanguage(): string {
  if (typeof navigator === 'undefined') return 'en-US';
  return navigator.language || 'en-US';
}

function cleanSpeech(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

function extractWakeCommand(text: string): string | null {
  const clean = cleanSpeech(text);
  const match = WAKE_WORD.exec(clean);
  if (!match) return null;
  return clean
    .slice(match.index + match[0].length)
    .replace(/^[\s,.:;!?،۔-]+/u, '')
    .trim();
}

function stripWakeWord(text: string): string {
  const command = extractWakeCommand(text);
  return command === null ? cleanSpeech(text) : command;
}

function trimControlPunctuation(text: string): string {
  return text.replace(/[\s,.:;!?،۔…-]+$/gu, '').trim();
}

function controlAtEnd(text: string): {
  action: VoiceControlAction;
  content: string;
} | null {
  const clean = trimControlPunctuation(cleanSpeech(text));
  const lower = clean.toLocaleLowerCase();

  for (const candidate of CONTROL_MATCH_ORDER) {
    if (lower === candidate.phrase) {
      return { action: candidate.action, content: '' };
    }

    if (!lower.endsWith(candidate.phrase)) continue;
    const boundaryIndex = lower.length - candidate.phrase.length - 1;
    if (boundaryIndex >= 0 && /[\p{L}\p{N}]/u.test(lower[boundaryIndex] ?? '')) continue;

    return {
      action: candidate.action,
      content: trimControlPunctuation(clean.slice(0, clean.length - candidate.phrase.length)),
    };
  }

  return null;
}

function mergeText(base: string, voice: string): string {
  const left = cleanSpeech(base);
  const right = cleanSpeech(voice);
  if (!left) return right;
  if (!right) return left;
  return `${left} ${right}`;
}

function mergeWakeSeed(seed: string, transcript: string): string {
  const left = cleanSpeech(seed);
  const right = cleanSpeech(transcript);
  if (!left) return right;
  if (!right) return left;

  const a = left.toLocaleLowerCase();
  const b = right.toLocaleLowerCase();
  if (b.includes(a)) return right;
  if (a.includes(b)) return left;
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
  const bars = 52;
  return (
    <span className={cn('xv-voice-line-wave', paused && 'is-paused')} aria-hidden="true">
      {Array.from({ length: bars }, (_, index) => {
        const phase = (index * 17) % 31;
        const centerWeight = 1 - Math.abs(index - (bars - 1) / 2) / ((bars - 1) / 2);
        const live = paused ? 0 : Math.max(0.03, level);
        const scale = Math.max(
          0.08,
          Math.min(1, 0.12 + live * (0.7 + centerWeight * 0.72) + phase / 150),
        );
        return (
          <i
            key={index}
            style={{
              transform: `scaleY(${scale})`,
              animationDelay: `${-index * 24}ms`,
            }}
          />
        );
      })}
    </span>
  );
}

export function XrogaVoiceControl({
  loading,
  composerText,
  onVoiceDraft,
  onVoiceSend,
  onStopRun,
}: {
  loading: boolean;
  composerText: string;
  onVoiceDraft: (transcript: string) => void;
  onVoiceSend: (transcript: string) => void | Promise<void>;
  onStopRun?: () => void;
}) {
  const {
    handsFreeEnabled,
    setHandsFreeEnabled,
    setOnboardingComplete,
  } = useVoicePrefsStore();

  const [mounted, setMounted] = useState(false);
  const [mode, setModeState] = useState<VoiceMode>('off');
  const [level, setLevel] = useState(0);
  const [voiceStage, setVoiceStage] = useState<HTMLElement | null>(null);
  const [errorMessage, setErrorMessage] = useState('');

  const modeRef = useRef<VoiceMode>('off');
  const enabledRef = useRef(handsFreeEnabled);
  const streamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const recognitionRef = useRef<BrowserSpeechRecognition | null>(null);
  const restartTimerRef = useRef<number | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const recorderChunksRef = useRef<Blob[]>([]);
  const recorderResolveRef = useRef<((audio: Blob | null) => void) | null>(null);
  const captureActiveRef = useRef(false);
  const finalizingRef = useRef(false);
  const baselineRef = useRef('');
  const wakeSeedRef = useRef('');
  const browserTextRef = useRef('');

  const setMode = useCallback((next: VoiceMode) => {
    modeRef.current = next;
    setModeState(next);
  }, []);

  useEffect(() => {
    enabledRef.current = handsFreeEnabled;
  }, [handsFreeEnabled]);

  useEffect(() => {
    setMounted(true);
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
    analyser.smoothingTimeConstant = 0.68;
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

  const ensureMicrophone = useCallback(async () => {
    if (streamRef.current?.active) return true;
    if (!navigator.mediaDevices?.getUserMedia) {
      setMode('error');
      setErrorMessage('Microphone is unavailable in this browser.');
      return false;
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
      setErrorMessage('');
      return true;
    } catch (error) {
      const blocked =
        error instanceof DOMException &&
        (error.name === 'NotAllowedError' || error.name === 'SecurityError');
      setMode('error');
      setErrorMessage(
        blocked
          ? 'Allow microphone access to use Xroga voice.'
          : 'Xroga could not open the microphone.',
      );
      return false;
    }
  }, [setMode, startMeter]);

  const stopRecognition = useCallback(() => {
    if (restartTimerRef.current !== null) {
      window.clearTimeout(restartTimerRef.current);
      restartTimerRef.current = null;
    }
    try {
      recognitionRef.current?.abort();
    } catch {
      // Browser may already have closed it.
    }
    recognitionRef.current = null;
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

  const emitVoiceText = useCallback(
    (voiceText: string) => {
      onVoiceDraft(mergeText(baselineRef.current, voiceText));
    },
    [onVoiceDraft],
  );

  const appendBrowserText = useCallback(
    (segment: string) => {
      const clean = stripWakeWord(segment);
      if (!clean) return;
      browserTextRef.current = mergeText(browserTextRef.current, clean);
      emitVoiceText(browserTextRef.current);
    },
    [emitVoiceText],
  );

  const activateCapture = useCallback(
    (seed = '') => {
      if (captureActiveRef.current || finalizingRef.current) return;
      baselineRef.current = composerText.trim();
      wakeSeedRef.current = cleanSpeech(seed);
      browserTextRef.current = cleanSpeech(seed);
      captureActiveRef.current = true;
      setMode('listening');
      setErrorMessage('');
      emitVoiceText(browserTextRef.current);

      if (streamRef.current) {
        startRecorder(streamRef.current);
      }
    },
    [composerText, emitVoiceText, setMode, startRecorder],
  );

  const pauseCapture = useCallback(() => {
    if (!captureActiveRef.current || finalizingRef.current) return;
    try {
      if (recorderRef.current?.state === 'recording') recorderRef.current.pause();
    } catch {
      // Some browsers do not implement recorder pause; the UI can still ignore speech.
    }
    setMode('paused');
  }, [setMode]);

  const resumeCapture = useCallback(() => {
    if (!captureActiveRef.current || finalizingRef.current) return;
    try {
      if (recorderRef.current?.state === 'paused') recorderRef.current.resume();
    } catch {
      // Recorder will continue through browser recognition even if resume is unsupported.
    }
    setMode('listening');
  }, [setMode]);

  const disableVoice = useCallback(async () => {
    enabledRef.current = false;
    setHandsFreeEnabled(false);
    captureActiveRef.current = false;
    finalizingRef.current = false;
    wakeSeedRef.current = '';
    browserTextRef.current = '';
    await stopRecorder();
    stopRecognition();
    releaseMicrophone();
    setMode('off');
  }, [releaseMicrophone, setHandsFreeEnabled, setMode, stopRecognition, stopRecorder]);

  const cancelCapture = useCallback(
    async (disableAfter = false) => {
      if (!captureActiveRef.current && !finalizingRef.current) {
        if (disableAfter) await disableVoice();
        return;
      }

      finalizingRef.current = true;
      await stopRecorder();
      captureActiveRef.current = false;
      finalizingRef.current = false;
      wakeSeedRef.current = '';
      browserTextRef.current = '';
      onVoiceDraft(baselineRef.current);
      baselineRef.current = '';

      if (disableAfter) {
        await disableVoice();
      } else {
        setMode(enabledRef.current ? 'armed' : 'off');
      }
    },
    [disableVoice, onVoiceDraft, setMode, stopRecorder],
  );

  const finalizeCapture = useCallback(
    async ({
      send,
      disableAfter = false,
    }: {
      send: boolean;
      disableAfter?: boolean;
    }) => {
      if (!captureActiveRef.current || finalizingRef.current) return;

      finalizingRef.current = true;
      setMode('transcribing');
      const audio = await stopRecorder();

      let serverText = '';
      if (audio && audio.size >= 512) {
        try {
          serverText = await transcribeVoiceAudio(audio, 'auto');
        } catch {
          // Browser recognition remains a zero-extra-roundtrip fallback.
        }
      }

      const serverControl = serverText ? controlAtEnd(serverText) : null;
      if (serverControl) serverText = serverControl.content;

      const browserText = cleanSpeech(browserTextRef.current);
      const seed = cleanSpeech(wakeSeedRef.current);
      let voiceText = serverText
        ? mergeWakeSeed(seed, stripWakeWord(serverText))
        : browserText || seed;

      voiceText = cleanSpeech(voiceText);
      const fullText = mergeText(baselineRef.current, voiceText);

      captureActiveRef.current = false;
      finalizingRef.current = false;
      wakeSeedRef.current = '';
      browserTextRef.current = '';
      baselineRef.current = '';

      if (fullText) {
        onVoiceDraft(fullText);
      }

      if (disableAfter) {
        enabledRef.current = false;
        setHandsFreeEnabled(false);
        stopRecognition();
        releaseMicrophone();
        setMode('off');
      } else {
        setMode(enabledRef.current ? 'armed' : 'off');
      }

      if (send && fullText) {
        await onVoiceSend(fullText);
      } else if (!fullText) {
        setErrorMessage('No speech detected. Try again.');
      }
    },
    [
      onVoiceDraft,
      onVoiceSend,
      releaseMicrophone,
      setHandsFreeEnabled,
      setMode,
      stopRecognition,
      stopRecorder,
    ],
  );

  const handleFinalSegment = useCallback(
    (rawTranscript: string) => {
      const transcript = stripWakeWord(rawTranscript);
      const control = controlAtEnd(transcript);

      if (modeRef.current === 'paused') {
        if (!control) return;
        if (control.action === 'resume') {
          resumeCapture();
          return;
        }
        if (control.action === 'cancel') {
          void cancelCapture(false);
          return;
        }
        if (control.action === 'stop') {
          void finalizeCapture({ send: false });
          return;
        }
        if (control.action === 'done') {
          void finalizeCapture({ send: false, disableAfter: true });
          return;
        }
        if (control.action === 'send') {
          void finalizeCapture({ send: true });
        }
        return;
      }

      if (!control) {
        appendBrowserText(transcript);
        return;
      }

      if (control.content) appendBrowserText(control.content);

      switch (control.action) {
        case 'pause':
          pauseCapture();
          break;
        case 'resume':
          resumeCapture();
          break;
        case 'stop':
          void finalizeCapture({ send: false });
          break;
        case 'done':
          void finalizeCapture({ send: false, disableAfter: true });
          break;
        case 'send':
          void finalizeCapture({ send: true });
          break;
        case 'cancel':
          void cancelCapture(false);
          break;
      }
    },
    [
      appendBrowserText,
      cancelCapture,
      finalizeCapture,
      pauseCapture,
      resumeCapture,
    ],
  );

  const startRecognition = useCallback(() => {
    if (!enabledRef.current || recognitionRef.current) return;
    const Recognition = recognitionConstructor();
    if (!Recognition) {
      // Manual tap-to-talk still works through MediaRecorder + server transcription.
      if (!captureActiveRef.current) setMode('armed');
      return;
    }

    const recognition = new Recognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = recognitionLanguage();

    recognition.onstart = () => {
      if (!captureActiveRef.current && modeRef.current !== 'paused') setMode('armed');
    };

    recognition.onresult = (event) => {
      if (finalizingRef.current) return;

      for (let index = event.resultIndex; index < event.results.length; index += 1) {
        const result = event.results[index];
        const transcript = cleanSpeech(result[0]?.transcript ?? '');
        if (!transcript) continue;

        if (!captureActiveRef.current) {
          const wakeCommand = extractWakeCommand(transcript);
          if (wakeCommand === null) continue;

          const lowerWakeCommand = trimControlPunctuation(wakeCommand).toLocaleLowerCase();
          if (loading && TASK_STOP_PHRASES.has(lowerWakeCommand)) {
            onStopRun?.();
            continue;
          }

          activateCapture(wakeCommand);
          continue;
        }

        if (!result.isFinal) {
          if (modeRef.current !== 'paused') {
            const partial = stripWakeWord(transcript);
            const control = controlAtEnd(partial);
            const preview = control ? control.content : partial;
            emitVoiceText(mergeText(browserTextRef.current, preview));
          }
          continue;
        }

        handleFinalSegment(transcript);
      }
    };

    recognition.onerror = (event) => {
      if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
        setErrorMessage('Allow microphone access to use Xroga voice.');
        enabledRef.current = false;
        setHandsFreeEnabled(false);
        setMode('error');
        return;
      }

      if (event.error === 'audio-capture') {
        setErrorMessage('No microphone is available.');
        setMode('error');
        return;
      }

      // Chrome frequently emits no-speech/network between wake phrases. That is not
      // a product failure; onend restarts the lightweight wake listener.
      if (event.error !== 'no-speech' && event.error !== 'network') {
        setErrorMessage('Wake listening paused. Tap the mic to continue.');
      }
    };

    recognition.onend = () => {
      recognitionRef.current = null;
      if (!enabledRef.current) return;
      restartTimerRef.current = window.setTimeout(() => startRecognition(), 260);
    };

    recognitionRef.current = recognition;
    try {
      recognition.start();
    } catch {
      recognitionRef.current = null;
      restartTimerRef.current = window.setTimeout(() => startRecognition(), 420);
    }
  }, [
    activateCapture,
    emitVoiceText,
    handleFinalSegment,
    loading,
    onStopRun,
    setHandsFreeEnabled,
    setMode,
  ]);

  const enableAndCapture = useCallback(async () => {
    const ready = await ensureMicrophone();
    if (!ready) return;

    enabledRef.current = true;
    setHandsFreeEnabled(true);
    setOnboardingComplete(true);
    setMode('armed');
    startRecognition();
    activateCapture('');
  }, [
    activateCapture,
    ensureMicrophone,
    setHandsFreeEnabled,
    setMode,
    setOnboardingComplete,
    startRecognition,
  ]);

  const manualTalk = useCallback(async () => {
    if (captureActiveRef.current || finalizingRef.current) return;

    if (!enabledRef.current) {
      await enableAndCapture();
      return;
    }

    const ready = await ensureMicrophone();
    if (!ready) return;
    startRecognition();
    activateCapture('');
  }, [activateCapture, enableAndCapture, ensureMicrophone, startRecognition]);

  useEffect(() => {
    if (!mounted) return;

    if (!handsFreeEnabled) {
      enabledRef.current = false;
      if (!captureActiveRef.current) setMode('off');
      return;
    }

    enabledRef.current = true;
    void ensureMicrophone().then((ready) => {
      if (!ready) return;
      setMode(captureActiveRef.current ? modeRef.current : 'armed');
      startRecognition();
    });
  }, [
    ensureMicrophone,
    handsFreeEnabled,
    mounted,
    setMode,
    startRecognition,
  ]);

  useEffect(() => {
    return () => {
      enabledRef.current = false;
      if (restartTimerRef.current !== null) window.clearTimeout(restartTimerRef.current);
      stopRecognition();
      void stopRecorder();
      releaseMicrophone();
    };
  }, [releaseMicrophone, stopRecognition, stopRecorder]);

  const captureVisible =
    captureActiveRef.current ||
    mode === 'listening' ||
    mode === 'paused' ||
    mode === 'transcribing';

  const captureBar =
    mounted && voiceStage && captureVisible
      ? createPortal(
          <div
            className={cn(
              'xv-voice-capture-bar',
              mode === 'paused' && 'is-paused',
              mode === 'transcribing' && 'is-transcribing',
            )}
            data-testid="xroga-voice-capture"
            aria-label={
              mode === 'paused'
                ? 'Xroga voice paused'
                : mode === 'transcribing'
                  ? 'Xroga is transcribing'
                  : 'Xroga is listening'
            }
          >
            <button
              type="button"
              className="xv-voice-capture-button xv-voice-capture-cancel"
              onClick={() => void cancelCapture(true)}
              aria-label="Close voice and discard this dictation"
              title="Close voice"
            >
              <X className="h-4 w-4" aria-hidden />
            </button>

            <button
              type="button"
              className="xv-voice-wave-button"
              onClick={mode === 'paused' ? resumeCapture : pauseCapture}
              aria-label={mode === 'paused' ? 'Resume voice' : 'Pause voice'}
              title={mode === 'paused' ? 'Resume' : 'Pause'}
            >
              <VoiceWave level={mode === 'transcribing' ? 0.08 : level} paused={mode === 'paused'} />
            </button>

            <div className="xv-voice-capture-actions">
              <button
                type="button"
                className="xv-voice-capture-button"
                onClick={mode === 'paused' ? resumeCapture : pauseCapture}
                aria-label={mode === 'paused' ? 'Resume voice' : 'Pause voice'}
                title={mode === 'paused' ? 'Resume' : 'Pause'}
                disabled={mode === 'transcribing'}
              >
                {mode === 'paused'
                  ? <Play className="h-3.5 w-3.5" fill="currentColor" aria-hidden />
                  : <Pause className="h-3.5 w-3.5" fill="currentColor" aria-hidden />}
              </button>

              <button
                type="button"
                className="xv-voice-capture-button"
                onClick={() => void finalizeCapture({ send: false })}
                aria-label="Stop recording and keep text"
                title="Stop"
                disabled={mode === 'transcribing'}
              >
                <Square className="h-3.5 w-3.5" fill="currentColor" aria-hidden />
              </button>

              <button
                type="button"
                className="xv-voice-capture-button"
                onClick={() => void finalizeCapture({ send: false, disableAfter: true })}
                aria-label="Done with voice and keep text"
                title="Done"
                disabled={mode === 'transcribing'}
              >
                <Check className="h-4 w-4" aria-hidden />
              </button>

              <button
                type="button"
                className="xv-voice-capture-button xv-voice-capture-send"
                onClick={() => void finalizeCapture({ send: true })}
                aria-label="Send voice message"
                title="Send"
                disabled={mode === 'transcribing'}
              >
                <ArrowUp className="h-4 w-4" strokeWidth={2.6} aria-hidden />
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
          handsFreeEnabled && 'is-armed',
          captureVisible && 'is-listening',
          mode === 'error' && 'is-error',
        )}
        onClick={() => void manualTalk()}
        aria-label={
          handsFreeEnabled
            ? 'Talk to Xroga'
            : 'Enable Xroga voice'
        }
        aria-pressed={handsFreeEnabled}
        title={
          handsFreeEnabled
            ? 'Voice ready — say “Xroga” or click to talk'
            : errorMessage || 'Enable voice, then say “Xroga” anytime'
        }
      >
        <Mic2 className="h-4 w-4" aria-hidden />
        {handsFreeEnabled ? <span className="xv-voice-armed-dot" aria-hidden /> : null}
      </button>

      <span className="sr-only" aria-live="polite">
        {errorMessage ||
          (mode === 'armed'
            ? 'Xroga wake word is ready'
            : mode === 'listening'
              ? 'Listening'
              : mode === 'paused'
                ? 'Voice paused'
                : mode === 'transcribing'
                  ? 'Transcribing voice'
                  : '')}
      </span>

      {captureBar}
    </>
  );
}
