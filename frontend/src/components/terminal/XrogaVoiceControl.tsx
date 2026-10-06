'use client';

import { ArrowUp, Pause, Play, Square, X } from 'lucide-react';
import { createPortal } from 'react-dom';
import { useCallback, useEffect, useRef, useState } from 'react';

import { cn } from '@/lib/utils';
import { transcribeVoiceAudio } from '@/lib/voiceApi';
import { AudioLinesIcon } from './AudioLinesIcon';

type VoiceMode = 'idle' | 'armed' | 'listening' | 'paused' | 'finalizing' | 'error';
type RecognitionPurpose = 'wake' | 'capture';

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
  onstart: (() => void) | null;
  onresult: ((event: BrowserSpeechRecognitionEvent) => void) | null;
  onerror: ((event: BrowserSpeechRecognitionErrorEvent) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
}

type BrowserSpeechRecognitionConstructor = new () => BrowserSpeechRecognition;

const WAKE_STORAGE_KEY = 'xroga-voice-wake-enabled-v1';

/*
 * Recognition engines often hear the invented brand Xroga differently.
 * Accept those acoustic aliases only for activation; the product name remains Xroga.
 */
const WAKE_ALIAS_SOURCE =
  '(?:x\\s*roga|ex\\s*roga|acroga|a\\s*croga|xroga|zroga|eks\\s*roga|ix\\s*roga)';
const WAKE_ALIAS = new RegExp('\\b' + WAKE_ALIAS_SOURCE + '\\b', 'i');

const STOP_COMMANDS = new Set([
  'stop', 'done', 'finish', 'stop now',
  'بس', 'رک جاؤ', 'روکو', 'ختم',
  'रुको', 'बस', 'बंद करो', 'खत्म',
  'توقف', 'قف', 'انتهى',
  'para', 'pare', 'parar',
  'parar agora', 'terminar',
  'berhenti', 'selesai',
  'dur', 'bitir',
  'arrête', 'arrete', 'terminé', 'termine',
  'stopp', 'fertig',
]);

const SEND_COMMANDS = new Set([
  'send', 'send it', 'send now', 'enter', 'go', 'start now', 'submit',
  'بھیج دو', 'ارسال کرو', 'بھیجیں', 'اب بھیج دو',
  'भेज दो', 'भेजें', 'अभी भेजो',
  'أرسل', 'ارسل', 'أرسل الآن', 'ارسل الآن',
  'envía', 'envia', 'enviar', 'envíalo', 'envialo',
  'envie', 'enviar agora',
  'kirim', 'kirim sekarang',
  'gönder', 'gonder', 'şimdi gönder', 'simdi gonder',
  'envoyer', 'envoie', 'envoie maintenant',
  'senden', 'jetzt senden',
]);

const PAUSE_COMMANDS = new Set([
  'pause', 'hold on', 'wait',
  'رکو', 'ٹھہرو',
  'रुको जरा', 'ठहरो',
  'توقف مؤقتا', 'انتظر',
  'pausa', 'espera',
  'pausar', 'espere',
  'jeda', 'tunggu',
  'bekle', 'duraklat',
  'pausez', 'attends',
  'pausieren', 'warte',
]);

const RESUME_COMMANDS = new Set([
  'resume', 'continue', 'keep going',
  'جاری رکھو', 'چلتے رہو',
  'जारी रखो', 'आगे बढ़ो',
  'تابع', 'استمر',
  'continúa', 'continua',
  'continue', 'continuar',
  'lanjut', 'lanjutkan',
  'devam', 'devam et',
  'continuez', 'reprends',
  'weiter', 'fortsetzen',
]);

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

function normalizedCommand(text: string): string {
  return cleanSpeech(text)
    .toLocaleLowerCase()
    .replace(/[.,!?;:،۔؟]+$/g, '')
    .trim();
}

function mergeText(base: string, voice: string): string {
  const left = cleanSpeech(base);
  const right = cleanSpeech(voice);
  if (!left) return right;
  if (!right) return left;
  const lowerLeft = left.toLocaleLowerCase();
  const lowerRight = right.toLocaleLowerCase();
  if (lowerLeft === lowerRight || lowerLeft.endsWith(lowerRight)) return left;
  if (lowerRight.startsWith(lowerLeft)) return right;
  return `${left} ${right}`;
}

function mergeSeed(seed: string, transcript: string): string {
  const left = cleanSpeech(seed);
  const right = cleanSpeech(transcript);
  if (!left) return right;
  if (!right) return left;
  const lowerLeft = left.toLocaleLowerCase();
  const lowerRight = right.toLocaleLowerCase();
  if (lowerRight.startsWith(lowerLeft) || lowerRight.includes(lowerLeft)) return right;
  if (lowerLeft.endsWith(lowerRight)) return left;
  return `${left} ${right}`;
}

function extractWakeCommand(text: string): string | null {
  const clean = cleanSpeech(text);
  const match = WAKE_ALIAS.exec(clean);
  if (!match) return null;
  return clean.slice(match.index + match[0].length).replace(/^[\s,.:;!?،۔؟-]+/, '').trim();
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
  const bars = 58;
  return (
    <span className={cn('xv-voice-v8-wave', paused && 'is-paused')} aria-hidden="true">
      {Array.from({ length: bars }, (_, index) => {
        const center = (bars - 1) / 2;
        const centerWeight = 1 - Math.abs(index - center) / Math.max(center, 1);
        const phase = ((index * 17) % 43) / 100;
        const live = paused ? 0 : Math.max(0.018, level);
        const scale = Math.max(
          0.07,
          Math.min(1, 0.1 + live * (0.74 + centerWeight * 0.74) + phase),
        );
        return <i key={index} style={{ transform: `scaleY(${scale})` }} />;
      })}
    </span>
  );
}

export function XrogaVoiceControl({
  composerText,
  onVoiceDraft,
  onVoiceSend,
}: {
  composerText: string;
  onVoiceDraft: (transcript: string) => void;
  onVoiceSend: (transcript: string) => void | Promise<void>;
}) {
  const [mode, setModeState] = useState<VoiceMode>('idle');
  const modeRef = useRef<VoiceMode>('idle');
  const [level, setLevel] = useState(0);
  const [voiceStage, setVoiceStage] = useState<HTMLElement | null>(null);
  const [previewText, setPreviewText] = useState('');

  const composerTextRef = useRef(composerText);
  const baselineRef = useRef('');
  const seedTextRef = useRef('');
  const finalTextRef = useRef('');
  const interimTextRef = useRef('');
  const streamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const recognitionRef = useRef<BrowserSpeechRecognition | null>(null);
  const recognitionPurposeRef = useRef<RecognitionPurpose | null>(null);
  const recognitionRestartRef = useRef<number | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const recorderChunksRef = useRef<Blob[]>([]);
  const recorderResolveRef = useRef<((audio: Blob | null) => void) | null>(null);
  const endingRef = useRef(false);
  const wakeEnabledRef = useRef(false);
  const startVoiceRef = useRef<(seed?: string) => Promise<void>>(async () => undefined);
  const finishVoiceRef = useRef<(send: boolean) => Promise<void>>(async () => undefined);
  const pauseVoiceRef = useRef<() => void>(() => undefined);
  const resumeVoiceRef = useRef<() => void>(() => undefined);

  useEffect(() => {
    composerTextRef.current = composerText;
  }, [composerText]);

  const setMode = useCallback((next: VoiceMode) => {
    modeRef.current = next;
    setModeState(next);
  }, []);

  useEffect(() => {
    setVoiceStage(document.querySelector<HTMLElement>('[data-xroga-voice-stage]'));
    try {
      wakeEnabledRef.current = window.localStorage.getItem(WAKE_STORAGE_KEY) === '1';
    } catch {
      wakeEnabledRef.current = false;
    }
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
      setLevel(Math.min(1, sum / Math.max(1, bins.length) / 104));
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
    if (recognitionRestartRef.current !== null) {
      window.clearTimeout(recognitionRestartRef.current);
      recognitionRestartRef.current = null;
    }
    const recognition = recognitionRef.current;
    recognitionRef.current = null;
    recognitionPurposeRef.current = null;
    try {
      if (abort) recognition?.abort();
      else recognition?.stop();
    } catch {
      // The browser may already have ended recognition.
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
      recorder.start(200);
      recorderRef.current = recorder;
    } catch {
      recorderRef.current = null;
    }
  }, []);

  const publishLiveDraft = useCallback(
    (finalText: string, interimText = '') => {
      const captureText = cleanSpeech([seedTextRef.current, finalText, interimText].filter(Boolean).join(' '));
      const fullText = mergeText(baselineRef.current, captureText);
      composerTextRef.current = fullText;
      setPreviewText(captureText);
      onVoiceDraft(fullText);
    },
    [onVoiceDraft],
  );

  const handleVoiceControlCommand = useCallback((transcript: string): boolean => {
    const command = normalizedCommand(transcript);
    if (!command) return false;

    if (STOP_COMMANDS.has(command)) {
      void finishVoiceRef.current(false);
      return true;
    }
    if (SEND_COMMANDS.has(command)) {
      void finishVoiceRef.current(true);
      return true;
    }
    if (PAUSE_COMMANDS.has(command)) {
      pauseVoiceRef.current();
      return true;
    }
    if (RESUME_COMMANDS.has(command)) {
      resumeVoiceRef.current();
      return true;
    }
    return false;
  }, []);

  const startRecognition = useCallback((purpose: RecognitionPurpose) => {
    const Recognition = recognitionConstructor();
    if (!Recognition || recognitionRef.current) return;

    const recognition = new Recognition();
    recognition.continuous = true;
    recognition.interimResults = true;

    recognition.onstart = () => {
      if (purpose === 'wake' && modeRef.current === 'idle') setMode('armed');
    };

    recognition.onresult = (event) => {
      if (purpose === 'wake') {
        for (let index = event.resultIndex; index < event.results.length; index += 1) {
          const transcript = cleanSpeech(event.results[index]?.[0]?.transcript ?? '');
          if (!transcript) continue;
          const seed = extractWakeCommand(transcript);
          if (seed !== null) {
            stopRecognition(true);
            void startVoiceRef.current(seed);
            return;
          }
        }
        return;
      }

      let interim = '';
      for (let index = event.resultIndex; index < event.results.length; index += 1) {
        const result = event.results[index];
        const transcript = cleanSpeech(result[0]?.transcript ?? '');
        if (!transcript) continue;

        if (result.isFinal) {
          if (handleVoiceControlCommand(transcript)) return;
          finalTextRef.current = mergeText(finalTextRef.current, transcript);
        } else {
          interim = mergeText(interim, transcript);
        }
      }

      interimTextRef.current = interim;
      publishLiveDraft(finalTextRef.current, interim);
    };

    recognition.onerror = (event) => {
      if (purpose === 'capture') {
        // MediaRecorder remains authoritative; browser recognition is only the
        // low-latency live preview and spoken-control path.
        if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
          setMode('error');
        }
      }
    };

    recognition.onend = () => {
      recognitionRef.current = null;
      recognitionPurposeRef.current = null;

      if (endingRef.current) return;
      if (purpose === 'capture' && modeRef.current === 'listening') {
        recognitionRestartRef.current = window.setTimeout(() => startRecognition('capture'), 140);
        return;
      }
      if (purpose === 'wake' && wakeEnabledRef.current && modeRef.current === 'armed') {
        recognitionRestartRef.current = window.setTimeout(() => startRecognition('wake'), 350);
      }
    };

    recognitionRef.current = recognition;
    recognitionPurposeRef.current = purpose;
    try {
      recognition.start();
    } catch {
      recognitionRef.current = null;
      recognitionPurposeRef.current = null;
    }
  }, [handleVoiceControlCommand, publishLiveDraft, setMode, stopRecognition]);

  const armWakeWord = useCallback(() => {
    if (!wakeEnabledRef.current || modeRef.current !== 'idle') return;
    if (!recognitionConstructor()) return;
    setMode('armed');
    window.setTimeout(() => startRecognition('wake'), 120);
  }, [setMode, startRecognition]);

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
      wakeEnabledRef.current = true;
      try {
        window.localStorage.setItem(WAKE_STORAGE_KEY, '1');
      } catch {
        // Local storage is optional; voice typing still works for this session.
      }
      startMeter(stream);
      return stream;
    } catch {
      setMode('error');
      return null;
    }
  }, [setMode, startMeter]);

  const startVoice = useCallback(async (seed = '') => {
    if (['listening', 'paused', 'finalizing'].includes(modeRef.current)) return;

    stopRecognition(true);
    const stream = await ensureMicrophone();
    if (!stream) return;

    baselineRef.current = composerTextRef.current.trim();
    seedTextRef.current = cleanSpeech(seed);
    finalTextRef.current = '';
    interimTextRef.current = '';
    endingRef.current = false;
    setPreviewText(seedTextRef.current);
    setMode('listening');

    if (seedTextRef.current) publishLiveDraft('', '');
    startRecorder(stream);
    startRecognition('capture');
  }, [ensureMicrophone, publishLiveDraft, setMode, startRecognition, startRecorder, stopRecognition]);

  const pauseVoice = useCallback(() => {
    if (modeRef.current !== 'listening') return;
    setMode('paused');
    stopRecognition(false);
    try {
      if (recorderRef.current?.state === 'recording') recorderRef.current.pause();
    } catch {
      // Continue to preserve text even if MediaRecorder pause is unavailable.
    }
  }, [setMode, stopRecognition]);

  const resumeVoice = useCallback(() => {
    if (modeRef.current !== 'paused') return;
    try {
      if (recorderRef.current?.state === 'paused') recorderRef.current.resume();
    } catch {
      // Browser live recognition can still resume.
    }
    setMode('listening');
    window.setTimeout(() => startRecognition('capture'), 40);
  }, [setMode, startRecognition]);

  const cancelVoice = useCallback(async () => {
    endingRef.current = true;
    stopRecognition(true);
    await stopRecorder();
    onVoiceDraft(baselineRef.current);
    composerTextRef.current = baselineRef.current;
    seedTextRef.current = '';
    finalTextRef.current = '';
    interimTextRef.current = '';
    setPreviewText('');
    releaseMicrophone();
    endingRef.current = false;
    setMode('idle');
    window.setTimeout(armWakeWord, 220);
  }, [armWakeWord, onVoiceDraft, releaseMicrophone, setMode, stopRecognition, stopRecorder]);

  const finishVoice = useCallback(async (send: boolean) => {
    if (endingRef.current || !['listening', 'paused'].includes(modeRef.current)) return;
    endingRef.current = true;
    setMode('finalizing');

    stopRecognition(false);
    const browserVoice = cleanSpeech(
      [seedTextRef.current, finalTextRef.current, interimTextRef.current].filter(Boolean).join(' '),
    );
    const audio = await stopRecorder();

    let finalVoice = browserVoice;
    if (audio && audio.size >= 512) {
      try {
        const authoritative = cleanSpeech(await transcribeVoiceAudio(audio));
        if (authoritative) finalVoice = mergeSeed(seedTextRef.current, authoritative);
      } catch {
        // Preserve the browser text already visible in the composer.
      }
    }

    const fullText = mergeText(baselineRef.current, finalVoice);
    composerTextRef.current = fullText;
    onVoiceDraft(fullText);

    seedTextRef.current = '';
    finalTextRef.current = '';
    interimTextRef.current = '';
    setPreviewText('');
    releaseMicrophone();
    endingRef.current = false;
    setMode('idle');

    if (send && fullText.trim()) {
      await onVoiceSend(fullText);
    } else {
      window.setTimeout(armWakeWord, 220);
    }
  }, [
    armWakeWord,
    onVoiceDraft,
    onVoiceSend,
    releaseMicrophone,
    setMode,
    stopRecognition,
    stopRecorder,
  ]);

  useEffect(() => {
    startVoiceRef.current = startVoice;
    finishVoiceRef.current = finishVoice;
    pauseVoiceRef.current = pauseVoice;
    resumeVoiceRef.current = resumeVoice;
  }, [finishVoice, pauseVoice, resumeVoice, startVoice]);

  useEffect(() => {
    if (!voiceStage) return;
    if (wakeEnabledRef.current) armWakeWord();
  }, [armWakeWord, voiceStage]);

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
            'xv-voice-v8-session',
            mode === 'paused' && 'is-paused',
            mode === 'finalizing' && 'is-finalizing',
          )}
          data-testid="xroga-voice-session"
        >
          <button
            type="button"
            className="xv-voice-v8-control xv-voice-v8-cancel"
            onClick={() => void cancelVoice()}
            aria-label="Cancel voice typing"
            disabled={mode === 'finalizing'}
          >
            <X className="h-4 w-4" aria-hidden />
          </button>

          <button
            type="button"
            className="xv-voice-v8-wave-button"
            onClick={mode === 'paused' ? resumeVoice : pauseVoice}
            aria-label={mode === 'paused' ? 'Resume voice typing' : 'Pause voice typing'}
            disabled={mode === 'finalizing'}
          >
            <VoiceWave level={level} paused={mode === 'paused' || mode === 'finalizing'} />
            <span className="sr-only">
              {previewText || (mode === 'finalizing' ? 'Finishing transcription' : 'Listening')}
            </span>
          </button>

          <div className="xv-voice-v8-actions">
            <button
              type="button"
              className="xv-voice-v8-control"
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
              className="xv-voice-v8-control"
              onClick={() => void finishVoice(false)}
              aria-label="Stop voice typing and keep text"
              disabled={mode === 'finalizing'}
            >
              <Square className="h-3.5 w-3.5" fill="currentColor" aria-hidden />
            </button>

            <button
              type="button"
              className="xv-voice-v8-control xv-voice-v8-send"
              onClick={() => void finishVoice(true)}
              aria-label="Finish voice typing and send"
              disabled={mode === 'finalizing'}
            >
              <ArrowUp className="h-4 w-4" strokeWidth={2.4} aria-hidden />
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
          mode === 'armed' && 'is-armed',
          mode === 'listening' && 'is-listening',
          mode === 'error' && 'is-error',
        )}
        onClick={() => {
          if (mode === 'idle' || mode === 'armed' || mode === 'error') void startVoice();
          else if (mode === 'listening' || mode === 'paused') void finishVoice(false);
        }}
        aria-label={active ? 'Stop voice typing and keep text' : 'Start voice typing'}
        title={mode === 'armed' ? 'Voice ready — say Xroga or click' : 'Voice typing'}
      >
        <AudioLinesIcon size={28} active={mode === 'listening' || mode === 'armed'} />
      </button>
      {session}
    </>
  );
}
