'use client';

import { ArrowUp, ChevronDown, MicOff, Pause, PhoneOff, Play, Square, VolumeX, X } from 'lucide-react';
import { createPortal } from 'react-dom';
import { useCallback, useEffect, useRef, useState } from 'react';

import { cn } from '@/lib/utils';
import { transcribeVoiceAudio } from '@/lib/voiceApi';
import { useTerminalChat } from '@/context/TerminalChatContext';
import { acceptMicStream, preferredSpeechLanguage, requiresVoiceReview, spokenReply } from '@/lib/terminal/voiceConversation';
import { AudioLinesIcon } from './AudioLinesIcon';

type VoiceMode = 'idle' | 'requesting_permission' | 'listening' | 'muted' | 'paused' | 'finalizing' | 'error';

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
  'send', 'send it', 'send now', 'enter', 'enter now', 'go', 'start now', 'submit',
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
        const live = paused ? 0 : level;
        const scale = Math.max(
          0.04,
          Math.min(1, live * (0.74 + centerWeight * 0.74)),
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
  const [conversation, setConversation] = useState(false);
  const [awaitingReply, setAwaitingReply] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [needsReview, setNeedsReview] = useState(false);
  const [optionsOpen, setOptionsOpen] = useState(false);
  const [voiceError, setVoiceError] = useState('');
  const [privacyVisible, setPrivacyVisible] = useState(false);
  const [speechLanguage, setSpeechLanguage] = useState('auto');
  const { messages, loading, heavyBuildActive, stop } = useTerminalChat();

  const composerTextRef = useRef(composerText);
  const conversationRef = useRef(false);
  const awaitingAfterRef = useRef<string | null>(null);
  const latestAssistantIdRef = useRef<string | null>(null);
  const speechGenerationRef = useRef(0);
  const autoSendTimerRef = useRef<number | null>(null);
  const recordingTimeoutRef = useRef<number | null>(null);
  const startVoiceRef = useRef<() => Promise<void>>(async () => undefined);
  const seedTextRef = useRef('');
  const finalTextRef = useRef('');
  const interimTextRef = useRef('');
  const streamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const recognitionRef = useRef<BrowserSpeechRecognition | null>(null);
  const recognitionRestartRef = useRef<number | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const recorderChunksRef = useRef<Blob[]>([]);
  const recorderResolveRef = useRef<((audio: Blob | null) => void) | null>(null);
  const endingRef = useRef(false);
  const captureGenerationRef = useRef(0);
  const finishVoiceRef = useRef<(send: boolean, automatic?: boolean) => Promise<void>>(async () => undefined);
  const pauseVoiceRef = useRef<() => void>(() => undefined);
  const resumeVoiceRef = useRef<() => void>(() => undefined);

  useEffect(() => {
    composerTextRef.current = composerText;
  }, [composerText]);

  latestAssistantIdRef.current = [...messages].reverse().find((message) => message.role === 'assistant')?.id ?? null;

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

    let context: AudioContext | null = null;
    let analyser: AnalyserNode;
    try {
      context = new AudioContextCtor();
      analyser = context.createAnalyser();
      analyser.fftSize = 256;
      analyser.smoothingTimeConstant = 0.68;
      context.createMediaStreamSource(stream).connect(analyser);
      audioContextRef.current = context;
    } catch {
      // Capture and transcription still work when the level meter is unavailable.
      void context?.close().catch(() => undefined);
      return;
    }

    const bins = new Uint8Array(analyser.frequencyBinCount);
    let lastPaint = 0;
    const tick = (now: number) => {
      if (now - lastPaint < 50) {
        animationFrameRef.current = requestAnimationFrame(tick);
        return;
      }
      lastPaint = now;
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
    if (autoSendTimerRef.current !== null) {
      window.clearTimeout(autoSendTimerRef.current);
      autoSendTimerRef.current = null;
    }
    if (recognitionRestartRef.current !== null) {
      window.clearTimeout(recognitionRestartRef.current);
      recognitionRestartRef.current = null;
    }
    const recognition = recognitionRef.current;
    recognitionRef.current = null;
    try {
      if (abort) recognition?.abort();
      else recognition?.stop();
    } catch {
      // The browser may already have ended recognition.
    }
  }, []);

  const clearRecordingTimeout = useCallback(() => {
    if (recordingTimeoutRef.current !== null) {
      window.clearTimeout(recordingTimeoutRef.current);
      recordingTimeoutRef.current = null;
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
      setPreviewText(captureText);
    },
    [],
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

  const startRecognition = useCallback(() => {
    if (modeRef.current !== 'listening' || endingRef.current || !streamRef.current?.active) return;
    const Recognition = recognitionConstructor();
    if (!Recognition || recognitionRef.current) return;

    const recognition = new Recognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = speechLanguage === 'auto' ? navigator.language || 'en-US' : speechLanguage;

    recognition.onstart = () => undefined;

    recognition.onresult = (event) => {
      if (recognitionRef.current !== recognition || modeRef.current !== 'listening') return;
      let interim = '';
      let finalized = false;
      for (let index = event.resultIndex; index < event.results.length; index += 1) {
        const result = event.results[index];
        const transcript = cleanSpeech(result[0]?.transcript ?? '');
        if (!transcript) continue;

        if (result.isFinal) {
          if (handleVoiceControlCommand(transcript)) return;
          finalTextRef.current = mergeText(finalTextRef.current, transcript);
          finalized = true;
        } else {
          interim = mergeText(interim, transcript);
        }
      }

      interimTextRef.current = interim;
      publishLiveDraft(finalTextRef.current, interim);
      if (autoSendTimerRef.current !== null) window.clearTimeout(autoSendTimerRef.current);
      autoSendTimerRef.current = null;
      if (conversationRef.current && finalized && finalTextRef.current && !interim) {
        if (requiresVoiceReview(finalTextRef.current)) {
          setNeedsReview(true);
        } else {
          setNeedsReview(false);
          autoSendTimerRef.current = window.setTimeout(() => {
            if (conversationRef.current && modeRef.current === 'listening') void finishVoiceRef.current(true, true);
          }, 950);
        }
      }
    };

    recognition.onerror = (event) => {
      // MediaRecorder remains authoritative. Browser recognition is only a
      // live preview; its failure must not hide an active microphone session.
      void event;
    };

    recognition.onend = () => {
      if (recognitionRef.current !== recognition) return;
      recognitionRef.current = null;
      if (endingRef.current) return;
      if (modeRef.current === 'listening')
        recognitionRestartRef.current = window.setTimeout(() => startRecognition(), 140);
    };

    recognitionRef.current = recognition;
    try {
      recognition.start();
    } catch {
      recognitionRef.current = null;
    }
  }, [handleVoiceControlCommand, publishLiveDraft, speechLanguage]);

  const ensureMicrophone = useCallback(async (generation: number) => {
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
      if (!acceptMicStream(stream.getTracks(), generation, captureGenerationRef.current, endingRef.current)) return null;
      streamRef.current = stream;
      startMeter(stream);
      return stream;
    } catch {
      if (generation === captureGenerationRef.current) setMode('error');
      return null;
    }
  }, [setMode, startMeter]);

  const startVoice = useCallback(async () => {
    if (modeRef.current !== 'idle' && modeRef.current !== 'error') return;

    endingRef.current = false;
    const generation = ++captureGenerationRef.current;
    setVoiceError('');
    setNeedsReview(false);
    setMode('requesting_permission');
    stopRecognition(true);
    const stream = await ensureMicrophone(generation);
    if (!stream) {
      if (generation === captureGenerationRef.current && !endingRef.current) setVoiceError('Microphone access was denied or unavailable. Use text or try again.');
      return;
    }

    if (typeof MediaRecorder === 'undefined' && !recognitionConstructor()) {
      releaseMicrophone();
      setVoiceError('This browser cannot record or recognize speech. Use text or another browser.');
      setMode('error');
      return;
    }

    seedTextRef.current = '';
    finalTextRef.current = '';
    interimTextRef.current = '';
    setPreviewText('');
    setMode('listening');

    startRecorder(stream);
    startRecognition();
    clearRecordingTimeout();
    recordingTimeoutRef.current = window.setTimeout(() => {
      if (modeRef.current === 'listening' || modeRef.current === 'paused' || modeRef.current === 'muted')
        void finishVoiceRef.current(false);
    }, 120_000);
  }, [clearRecordingTimeout, ensureMicrophone, releaseMicrophone, setMode, startRecognition, startRecorder, stopRecognition]);

  const pauseVoice = useCallback(() => {
    if (modeRef.current !== 'listening') return;
    setMode('paused');
    streamRef.current?.getAudioTracks().forEach((track) => { track.enabled = false; });
    stopRecognition(false);
    try {
      if (recorderRef.current?.state === 'recording') recorderRef.current.pause();
    } catch {
      // Continue to preserve text even if MediaRecorder pause is unavailable.
    }
  }, [setMode, stopRecognition]);

  const resumeVoice = useCallback(() => {
    if (modeRef.current !== 'paused') return;
    streamRef.current?.getAudioTracks().forEach((track) => { track.enabled = true; });
    try {
      if (recorderRef.current?.state === 'paused') recorderRef.current.resume();
    } catch {
      // Browser live recognition can still resume.
    }
    setMode('listening');
    window.setTimeout(() => startRecognition(), 40);
  }, [setMode, startRecognition]);

  const muteVoice = useCallback(() => {
    if (modeRef.current !== 'listening') return;
    streamRef.current?.getAudioTracks().forEach((track) => { track.enabled = false; });
    stopRecognition(true);
    try { if (recorderRef.current?.state === 'recording') recorderRef.current.pause(); } catch { /* unsupported */ }
    setMode('muted');
  }, [setMode, stopRecognition]);

  const unmuteVoice = useCallback(() => {
    if (modeRef.current !== 'muted') return;
    streamRef.current?.getAudioTracks().forEach((track) => { track.enabled = true; });
    try { if (recorderRef.current?.state === 'paused') recorderRef.current.resume(); } catch { /* unsupported */ }
    setMode('listening');
    window.setTimeout(() => startRecognition(), 40);
  }, [setMode, startRecognition]);

  const cancelVoice = useCallback(async () => {
    endingRef.current = true;
    ++captureGenerationRef.current;
    clearRecordingTimeout();
    stopRecognition(true);
    const stopped = stopRecorder();
    releaseMicrophone();
    await stopped;
    seedTextRef.current = '';
    finalTextRef.current = '';
    interimTextRef.current = '';
    setPreviewText('');
    endingRef.current = false;
    setMode('idle');
  }, [clearRecordingTimeout, releaseMicrophone, setMode, stopRecognition, stopRecorder]);

  const finishVoice = useCallback(async (send: boolean, automatic = false) => {
    if (endingRef.current || !['listening', 'paused', 'muted'].includes(modeRef.current)) return;
    const generation = captureGenerationRef.current;
    endingRef.current = true;
    setMode('finalizing');
    clearRecordingTimeout();

    stopRecognition(false);
    const browserVoice = cleanSpeech(
      [seedTextRef.current, finalTextRef.current, interimTextRef.current].filter(Boolean).join(' '),
    );
    const audio = await stopRecorder();
    releaseMicrophone();

    let finalVoice = browserVoice;
    if (audio && audio.size >= 512) {
      try {
        const authoritative = cleanSpeech(await transcribeVoiceAudio(audio));
        if (authoritative) finalVoice = mergeSeed(seedTextRef.current, authoritative);
      } catch {
        // Preserve the browser text already visible in the composer.
      }
    }

    if (generation !== captureGenerationRef.current) return;
    if (automatic && !finalVoice) {
      setVoiceError('No speech was detected. Select Listen again or type your request.');
      endingRef.current = false;
      setMode('idle');
      return;
    }

    const fullText = mergeText(composerTextRef.current, finalVoice);
    composerTextRef.current = fullText;
    onVoiceDraft(fullText);

    seedTextRef.current = '';
    finalTextRef.current = '';
    interimTextRef.current = '';
    setPreviewText('');
    endingRef.current = false;
    setMode('idle');

    if (send && automatic && requiresVoiceReview(fullText)) {
      setNeedsReview(true);
      return;
    }

    if (send && fullText.trim()) {
      if (conversationRef.current) {
        awaitingAfterRef.current = latestAssistantIdRef.current;
        setAwaitingReply(true);
      }
      await onVoiceSend(fullText);
    }
  }, [
    clearRecordingTimeout,
    onVoiceDraft,
    onVoiceSend,
    releaseMicrophone,
    setMode,
    stopRecognition,
    stopRecorder,
  ]);

  const stopAudio = useCallback(() => {
    ++speechGenerationRef.current;
    window.speechSynthesis?.cancel();
    setSpeaking(false);
    if (conversationRef.current && modeRef.current === 'idle' && !awaitingAfterRef.current)
      void startVoiceRef.current();
  }, []);

  const endConversation = useCallback(() => {
    conversationRef.current = false;
    setConversation(false);
    setAwaitingReply(false);
    setNeedsReview(false);
    awaitingAfterRef.current = null;
    ++speechGenerationRef.current;
    window.speechSynthesis?.cancel();
    setSpeaking(false);
    if (modeRef.current !== 'idle' && modeRef.current !== 'error') void cancelVoice();
  }, [cancelVoice]);

  const startConversation = useCallback(() => {
    if (conversationRef.current) return;
    if (modeRef.current !== 'idle' && modeRef.current !== 'error') return;
    conversationRef.current = true;
    setConversation(true);
    setOptionsOpen(false);
    setPrivacyVisible(true);
    void startVoiceRef.current();
  }, []);

  const sendReviewed = useCallback(() => {
    const text = composerTextRef.current.trim();
    if (!text) return;
    awaitingAfterRef.current = latestAssistantIdRef.current;
    setNeedsReview(false);
    setAwaitingReply(true);
    void onVoiceSend(text);
  }, [onVoiceSend]);

  useEffect(() => {
    startVoiceRef.current = startVoice;
    finishVoiceRef.current = finishVoice;
    pauseVoiceRef.current = pauseVoice;
    resumeVoiceRef.current = resumeVoice;
  }, [finishVoice, pauseVoice, resumeVoice, startVoice]);

  useEffect(() => {
    const closeOnBackground = (event: Event) => {
      if (event.type !== 'pagehide' && !document.hidden) return;
      if (conversationRef.current) endConversation();
      else if (modeRef.current !== 'idle' && modeRef.current !== 'error') void cancelVoice();
    };
    document.addEventListener('visibilitychange', closeOnBackground);
    window.addEventListener('pagehide', closeOnBackground);
    return () => {
      document.removeEventListener('visibilitychange', closeOnBackground);
      window.removeEventListener('pagehide', closeOnBackground);
    };
  }, [cancelVoice, endConversation]);

  useEffect(() => {
    if (!conversation || !awaitingReply || loading) return;
    const answer = [...messages].reverse().find((message) => message.role === 'assistant' && message.content.trim() && message.id !== awaitingAfterRef.current);
    if (!answer) return;
    awaitingAfterRef.current = null;
    setAwaitingReply(false);
    const text = spokenReply(answer.content);
    if (!text || !window.speechSynthesis || typeof SpeechSynthesisUtterance === 'undefined') {
      if (conversationRef.current) void startVoiceRef.current();
      return;
    }
    const language = preferredSpeechLanguage(text);
    const voices = window.speechSynthesis.getVoices();
    const voice = voices.find((candidate) => candidate.lang.toLowerCase().startsWith(language.slice(0, 2).toLowerCase()));
    if (language !== 'en-US' && !voice) {
      setVoiceError(`Spoken ${language} output is unavailable on this device; the answer remains in chat.`);
      if (conversationRef.current) void startVoiceRef.current();
      return;
    }
    const generation = ++speechGenerationRef.current;
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = language;
    if (voice) utterance.voice = voice;
    utterance.onend = () => {
      if (generation !== speechGenerationRef.current) return;
      setSpeaking(false);
      if (conversationRef.current) void startVoiceRef.current();
    };
    utterance.onerror = () => {
      if (generation !== speechGenerationRef.current) return;
      setSpeaking(false);
      setVoiceError('Audio playback was unavailable; the response is still in chat.');
      if (conversationRef.current) void startVoiceRef.current();
    };
    setSpeaking(true);
    window.speechSynthesis.speak(utterance);
  }, [awaitingReply, conversation, loading, messages]);

  useEffect(() => {
    const captureGeneration = captureGenerationRef;
    const speechGeneration = speechGenerationRef;
    return () => {
      endingRef.current = true;
      ++captureGeneration.current;
      ++speechGeneration.current;
      window.speechSynthesis?.cancel();
      clearRecordingTimeout();
      stopRecognition(true);
      void stopRecorder();
      releaseMicrophone();
    };
  }, [clearRecordingTimeout, releaseMicrophone, stopRecognition, stopRecorder]);

  const active = conversation || mode !== 'idle';
  const captureReady = mode === 'listening' || mode === 'paused' || mode === 'muted';
  const statusText = speaking ? 'Xroga is speaking' : awaitingReply ? 'Xroga is working' : needsReview ? 'Review transcript before sending' :
    mode === 'requesting_permission' ? 'Waiting for microphone permission' :
    mode === 'finalizing' ? 'Finishing transcription' :
    mode === 'muted' ? 'Microphone muted' :
    mode === 'paused' ? 'Listening paused' :
    mode === 'listening' ? 'Listening' :
    mode === 'error' ? 'Voice unavailable' : 'Voice conversation ready';

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
          <div className="xv-voice-v8-primary">
            <button
              type="button"
              className="xv-voice-v8-control xv-voice-v8-cancel"
              onClick={() => conversation ? endConversation() : void cancelVoice()}
              aria-label={conversation ? 'End voice conversation' : 'Cancel voice typing'}
            >
              {conversation ? <PhoneOff className="h-4 w-4" aria-hidden /> : <X className="h-4 w-4" aria-hidden />}
            </button>
            <VoiceWave level={level} paused={mode !== 'listening'} />
            <span role="status" className="xv-voice-v8-status">{statusText}</span>
            <div className="xv-voice-v8-actions">
              {captureReady ? <button type="button" className="xv-voice-v8-control" onClick={mode === 'muted' ? unmuteVoice : muteVoice} aria-label={mode === 'muted' ? 'Unmute microphone' : 'Mute microphone'}>
                <MicOff className="h-4 w-4" aria-hidden />
              </button> : null}
              {captureReady ? <button type="button" className="xv-voice-v8-control" onClick={mode === 'paused' ? resumeVoice : pauseVoice} aria-label={mode === 'paused' ? 'Resume voice typing' : 'Pause voice typing'} disabled={mode === 'muted'}>
                {mode === 'paused' ? <Play className="h-4 w-4" aria-hidden /> : <Pause className="h-4 w-4" aria-hidden />}
              </button> : null}
              {captureReady ? <button type="button" className="xv-voice-v8-control" onClick={() => void finishVoice(false)} aria-label="Stop voice typing and keep text"><Square className="h-3.5 w-3.5" fill="currentColor" aria-hidden /></button> : null}
              {captureReady ? <button type="button" className="xv-voice-v8-control xv-voice-v8-send" onClick={() => void finishVoice(true)} aria-label="Finish voice typing and send"><ArrowUp className="h-4 w-4" strokeWidth={2.4} aria-hidden /></button> : null}
              {speaking ? <button type="button" className="xv-voice-v8-control" onClick={stopAudio} aria-label="Stop response audio without cancelling work"><VolumeX className="h-4 w-4" aria-hidden /></button> : null}
              {conversation && needsReview && mode === 'idle' ? <button type="button" className="xv-voice-v8-control xv-voice-v8-send" onClick={sendReviewed} aria-label="Send reviewed voice transcript"><ArrowUp className="h-4 w-4" aria-hidden /></button> : null}
              {conversation && mode === 'idle' && !speaking && !awaitingReply && !needsReview ? <button type="button" className="xv-voice-v8-control" onClick={() => void startVoice()} aria-label="Listen again"><Play className="h-4 w-4" aria-hidden /></button> : null}
            </div>
          </div>
          {previewText ? <p className="xv-voice-v8-caption" dir="auto">{previewText}</p> : null}
          {needsReview ? <p className="xv-voice-v8-hint">Review this instruction before sending. Xroga will not auto-send requests with restrictions or consequential actions.</p> : null}
          {voiceError ? <p role="alert" className="xv-voice-v8-error">{voiceError} {mode === 'error' ? <button type="button" onClick={() => void startVoice()}>Try again</button> : null}</p> : null}
          {privacyVisible ? <p className="xv-voice-v8-hint">Your browser requests microphone access. Speech may be processed by your browser or Xroga’s transcription provider; raw recordings are not saved in chat. <button type="button" onClick={() => setPrivacyVisible(false)}>Got it</button></p> : null}
          {conversation && heavyBuildActive ? <div className="xv-voice-v8-task"><span>Build continues independently of voice.</span><button type="button" onClick={stop}>Cancel build</button></div> : null}
        </div>,
        voiceStage,
      )
    : null;

  return (
    <>
      <span className="xv-voice-v8-entry">
      <button
        type="button"
        className={cn(
          'xv-voice-icon-only',
          mode === 'listening' && 'is-listening',
          mode === 'error' && 'is-error',
        )}
        onClick={() => {
          if ((mode === 'idle' || mode === 'error') && !awaitingReply && !speaking && !needsReview) { setPrivacyVisible(true); void startVoice(); }
          else if (captureReady) void finishVoice(false);
        }}
        aria-label={captureReady ? 'Stop voice typing and keep text' : 'Start voice typing'}
        title="Voice typing"
      >
        <AudioLinesIcon size={28} active={mode === 'listening'} />
      </button>
      <button type="button" className="xv-voice-v8-options-trigger" onClick={() => setOptionsOpen((value) => !value)} aria-label="Voice options" aria-expanded={optionsOpen}><ChevronDown className="h-3.5 w-3.5" aria-hidden /></button>
      {optionsOpen ? <div className="xv-voice-v8-menu"><button type="button" onClick={() => { setOptionsOpen(false); setPrivacyVisible(true); void startVoice(); }}>Dictate message</button><button type="button" onClick={startConversation}>Start voice conversation</button><label className="xv-voice-v8-language">Live caption language<select value={speechLanguage} onChange={(event) => setSpeechLanguage(event.target.value)}><option value="auto">Device language</option><option value="en-US">English</option><option value="ur-PK">Urdu</option><option value="hi-IN">Hindi</option><option value="ar-SA">Arabic</option></select></label></div> : null}
      </span>
      {session}
    </>
  );
}
