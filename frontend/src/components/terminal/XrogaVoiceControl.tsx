'use client';

import Image from 'next/image';
import {
  Bell,
  BellOff,
  Check,
  ChevronDown,
  CirclePause,
  Globe2,
  Mic2,
  Play,
  Settings2,
  Sparkles,
  Square,
  Volume2,
  VolumeX,
  Waves,
  X,
} from 'lucide-react';
import { createPortal } from 'react-dom';
import { useCallback, useEffect, useRef, useState } from 'react';

import { cn } from '@/lib/utils';
import { transcribeVoiceAudio } from '@/lib/voiceApi';
import {
  XROGA_VOICE_LANGUAGES,
  useVoicePrefsStore,
  type VoiceGender,
  type VoiceLanguage,
  type VoiceTone,
} from '@/store/useVoicePrefsStore';

type VoiceMode =
  | 'off'
  | 'armed'
  | 'listening'
  | 'paused'
  | 'transcribing'
  | 'processing'
  | 'speaking'
  | 'denied'
  | 'unavailable'
  | 'error';

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

const FEMALE_VOICE_HINT =
  /\b(?:female|woman|samantha|victoria|karen|zira|susan|aria|ava|jenny|sara|siri|moira|tessa)\b/i;
const MALE_VOICE_HINT =
  /\b(?:male|man|david|mark|daniel|thomas|fred|aaron|guy|jorge|diego|rishi)\b/i;

/*
 * Speech engines do not agree on an invented brand token. Chrome has been observed
 * to return "Acroga", "X Roga", or "ex roga" for the same spoken wake phrase.
 * These are recognition aliases only; the product name rendered to the user remains
 * exactly "Xroga".
 */
const WAKE_ALIAS_SOURCE = '(?:x\\s*roga|ex\\s*roga|acroga|a\\s*croga|zroga|xroga)';
const WAKE_WORD = new RegExp('\\b' + WAKE_ALIAS_SOURCE + '\\b', 'i');
const LEADING_WAKE_ECHO = new RegExp(
  '^(?:[\\s,.:;!?-]*(?:' + WAKE_ALIAS_SOURCE + '))+[\\s,.:;!?-]*',
  'i',
);

const GREETINGS: Record<string, string> = {
  en: "Hi, I'm X Roga. Say X Roga, then tell me what you want me to do.",
  ur: 'السلام علیکم، میں ایکس روگا ہوں۔ ایکس روگا کہیں، پھر مجھے بتائیں آپ کیا کروانا چاہتے ہیں۔',
  hi: 'नमस्ते, मैं X Roga हूँ। X Roga कहें, फिर बताएं कि आप मुझसे क्या करवाना चाहते हैं।',
  ar: 'مرحباً، أنا X Roga. قل X Roga ثم أخبرني بما تريد مني أن أفعله.',
  es: 'Hola, soy X Roga. Di X Roga y luego dime qué quieres que haga.',
  pt: 'Olá, eu sou a X Roga. Diga X Roga e depois me diga o que você quer que eu faça.',
  id: 'Halo, saya X Roga. Ucapkan X Roga, lalu beri tahu apa yang ingin Anda kerjakan.',
  tr: 'Merhaba, ben X Roga. X Roga deyin ve sonra ne yapmamı istediğinizi söyleyin.',
  fr: 'Bonjour, je suis X Roga. Dites X Roga, puis dites-moi ce que vous voulez que je fasse.',
  de: 'Hallo, ich bin X Roga. Sagen Sie X Roga und dann, was ich für Sie tun soll.',
};

const TONE_SETTINGS: Record<VoiceTone, { rate: number; pitch: number }> = {
  warm: { rate: 0.96, pitch: 1.04 },
  calm: { rate: 0.88, pitch: 0.97 },
  professional: { rate: 1, pitch: 0.99 },
  energetic: { rate: 1.08, pitch: 1.08 },
};

function getSpeechRecognitionConstructor(): BrowserSpeechRecognitionConstructor | null {
  if (typeof window === 'undefined') return null;
  const speechWindow = window as typeof window & {
    SpeechRecognition?: BrowserSpeechRecognitionConstructor;
    webkitSpeechRecognition?: BrowserSpeechRecognitionConstructor;
  };
  return speechWindow.SpeechRecognition ?? speechWindow.webkitSpeechRecognition ?? null;
}

function effectiveLanguage(language: VoiceLanguage): string {
  if (language !== 'auto') return language;
  if (typeof navigator === 'undefined') return 'en-US';
  return navigator.language || 'en-US';
}

function greetingFor(language: VoiceLanguage): string {
  const prefix = effectiveLanguage(language).split('-')[0]?.toLowerCase() ?? 'en';
  return GREETINGS[prefix] ?? GREETINGS.en;
}

function sanitizeSpeech(text: string): string {
  return text
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/https?:\/\/\S+/g, ' ')
    .replace(/[#>*_~|]/g, ' ')
    .replace(/\[(.*?)\]\([^)]*\)/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();
}

function speechSafeText(text: string): string {
  return sanitizeSpeech(text).replace(/\bXroga\b/gi, 'X Roga');
}

function pickVoice(
  voices: SpeechSynthesisVoice[],
  language: string,
  gender: VoiceGender,
): SpeechSynthesisVoice | null {
  if (!voices.length) return null;
  const prefix = language.split('-')[0]?.toLowerCase();
  const languageMatches = voices.filter((voice) => voice.lang.toLowerCase().startsWith(prefix));
  const candidates = languageMatches.length ? languageMatches : voices;

  if (gender === 'female') {
    return candidates.find((voice) => FEMALE_VOICE_HINT.test(voice.name)) ?? candidates[0] ?? null;
  }
  if (gender === 'male') {
    return candidates.find((voice) => MALE_VOICE_HINT.test(voice.name)) ?? candidates[0] ?? null;
  }
  return candidates.find((voice) => voice.default) ?? candidates[0] ?? null;
}

function extractWakeCommand(text: string): string | null {
  const clean = text.replace(/\s+/g, ' ').trim();
  const match = WAKE_WORD.exec(clean);
  if (!match) return null;
  return clean
    .slice(match.index + match[0].length)
    .replace(LEADING_WAKE_ECHO, '')
    .trim();
}

function directCommand(text: string): string {
  const wakeCommand = extractWakeCommand(text);
  return wakeCommand === null ? text.replace(/\s+/g, ' ').trim() : wakeCommand;
}

function modeLabel(mode: VoiceMode): string {
  switch (mode) {
    case 'armed':
      return 'Voice on';
    case 'listening':
      return 'Listening';
    case 'paused':
      return 'Paused';
    case 'transcribing':
      return 'Transcribing';
    case 'processing':
      return 'Working';
    case 'speaking':
      return 'Speaking';
    case 'denied':
      return 'Mic blocked';
    case 'unavailable':
      return 'Voice unavailable';
    case 'error':
      return 'Voice issue';
    default:
      return 'Voice off';
  }
}

function Waveform({
  level,
  speaking,
  compact = false,
  large = false,
}: {
  level: number;
  speaking?: boolean;
  compact?: boolean;
  large?: boolean;
}) {
  const bars = large ? 23 : compact ? 5 : 11;
  return (
    <span
      className={cn(
        'xv-voice-wave',
        compact && 'xv-voice-wave--compact',
        large && 'xv-voice-wave--large',
        speaking && 'is-speaking',
      )}
      aria-hidden="true"
    >
      {Array.from({ length: bars }, (_, index) => {
        const center = (bars - 1) / 2;
        const weight = 1 - Math.abs(index - center) / Math.max(center, 1);
        const height = speaking
          ? 20 + ((index * 19) % 68)
          : 10 + Math.min(90, level * (52 + weight * 74));
        return (
          <i
            key={index}
            style={{
              transform: 'scaleY(' + Math.max(0.12, height / 100) + ')',
              animationDelay: String(-index * 42) + 'ms',
            }}
          />
        );
      })}
    </span>
  );
}

function Switch({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
}) {
  return (
    <button
      type="button"
      className={cn('xv-voice-switch', checked && 'is-on')}
      onClick={() => onChange(!checked)}
      role="switch"
      aria-checked={checked}
      aria-label={label}
    >
      <span />
    </button>
  );
}

function SelectRow({
  label,
  value,
  onChange,
  children,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  children: React.ReactNode;
}) {
  return (
    <label className="xv-voice-setting-row">
      <span>{label}</span>
      <select value={value} onChange={(event) => onChange(event.target.value)}>
        {children}
      </select>
    </label>
  );
}

function recorderMimeType(): string | undefined {
  if (typeof MediaRecorder === 'undefined') return undefined;
  for (const mime of ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus']) {
    if (MediaRecorder.isTypeSupported(mime)) return mime;
  }
  return undefined;
}

export function XrogaVoiceControl({
  loading,
  latestAssistantId,
  latestAssistantText,
  onVoiceCommand,
  onVoiceDraft,
  onStopRun,
}: {
  loading: boolean;
  latestAssistantId?: string;
  latestAssistantText?: string;
  onVoiceCommand: (transcript: string) => void | Promise<void>;
  onVoiceDraft?: (transcript: string) => void;
  onStopRun?: () => void;
}) {
  const {
    language,
    tone,
    voiceGender,
    handsFreeEnabled,
    autoSpeak,
    notificationsEnabled,
    onboardingComplete,
    setLanguage,
    setTone,
    setVoiceGender,
    setHandsFreeEnabled,
    setAutoSpeak,
    setNotificationsEnabled,
    setOnboardingComplete,
    setOnboardingDismissed,
  } = useVoicePrefsStore();

  const [mounted, setMounted] = useState(false);
  const [mode, setMode] = useState<VoiceMode>('off');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [onboardingOpen, setOnboardingOpen] = useState(false);
  const [micReady, setMicReady] = useState(false);
  const [speakerReady, setSpeakerReady] = useState(false);
  const [recognitionSupported, setRecognitionSupported] = useState(false);
  const [speechOutputSupported, setSpeechOutputSupported] = useState(false);
  const [notificationPermission, setNotificationPermission] = useState<
    NotificationPermission | 'unsupported'
  >('default');
  const [liveTranscript, setLiveTranscript] = useState('');
  const [level, setLevel] = useState(0);
  const [voiceError, setVoiceError] = useState('');
  const [voiceStage, setVoiceStage] = useState<HTMLElement | null>(null);

  const streamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const recognitionRef = useRef<BrowserSpeechRecognition | null>(null);
  const recognitionRestartRef = useRef<number | null>(null);
  const recognitionPausedRef = useRef(false);
  const wakeActiveRef = useRef(false);
  const commandBufferRef = useRef('');
  const commandTimerRef = useRef<number | null>(null);
  const lastSpokenAssistantRef = useRef<string | undefined>(undefined);
  const voicesRef = useRef<SpeechSynthesisVoice[]>([]);
  const sawActiveRunRef = useRef(false);
  const loadingRef = useRef(loading);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const recorderChunksRef = useRef<Blob[]>([]);
  const recorderResolveRef = useRef<((blob: Blob | null) => void) | null>(null);
  const directCaptureRef = useRef(false);

  const currentLanguage = effectiveLanguage(language);

  useEffect(() => {
    loadingRef.current = loading;
  }, [loading]);

  useEffect(() => {
    setMounted(true);
    setVoiceStage(document.querySelector<HTMLElement>('[data-xroga-voice-stage]'));
    setRecognitionSupported(Boolean(getSpeechRecognitionConstructor()));
    setSpeechOutputSupported(
      'speechSynthesis' in window && typeof SpeechSynthesisUtterance !== 'undefined',
    );
    if ('Notification' in window) setNotificationPermission(Notification.permission);
    else setNotificationPermission('unsupported');

    const updateVoices = () => {
      voicesRef.current = window.speechSynthesis?.getVoices?.() ?? [];
    };
    updateVoices();
    window.speechSynthesis?.addEventListener?.('voiceschanged', updateVoices);
    return () => window.speechSynthesis?.removeEventListener?.('voiceschanged', updateVoices);
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
    setMicReady(false);
  }, [stopMeter]);

  const ensureMicrophone = useCallback(async () => {
    if (streamRef.current?.active) {
      setMicReady(true);
      return true;
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      setMode('unavailable');
      setVoiceError('This browser cannot open the microphone.');
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
      setMicReady(true);
      setVoiceError('');
      startMeter(stream);
      return true;
    } catch (error) {
      const denied =
        error instanceof DOMException &&
        (error.name === 'NotAllowedError' || error.name === 'SecurityError');
      setMode(denied ? 'denied' : 'error');
      setVoiceError(
        denied
          ? 'Microphone access is blocked. Allow it in your browser and try again.'
          : 'Xroga could not open the microphone.',
      );
      setMicReady(false);
      return false;
    }
  }, [startMeter]);

  const stopRecognition = useCallback((abort = true) => {
    if (recognitionRestartRef.current !== null) {
      window.clearTimeout(recognitionRestartRef.current);
      recognitionRestartRef.current = null;
    }
    try {
      if (abort) recognitionRef.current?.abort();
      else recognitionRef.current?.stop();
    } catch {
      // The browser may already have ended the recognition session.
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
        const blob = recorderChunksRef.current.length
          ? new Blob(recorderChunksRef.current, { type: recorder.mimeType || mimeType || 'audio/webm' })
          : null;
        recorderChunksRef.current = [];
        recorderRef.current = null;
        const resolve = recorderResolveRef.current;
        recorderResolveRef.current = null;
        resolve?.(blob);
      };
      recorder.start(250);
      recorderRef.current = recorder;
    } catch {
      recorderRef.current = null;
    }
  }, []);

  const submitCommand = useCallback(async () => {
    if (commandTimerRef.current !== null) {
      window.clearTimeout(commandTimerRef.current);
      commandTimerRef.current = null;
    }

    const command = commandBufferRef.current.replace(/\s+/g, ' ').trim();
    commandBufferRef.current = '';
    wakeActiveRef.current = false;
    directCaptureRef.current = false;
    void stopRecorder();

    if (!command) {
      setMode(handsFreeEnabled ? 'armed' : 'off');
      setLiveTranscript('');
      return;
    }

    setLiveTranscript(command);
    onVoiceDraft?.(command);
    setMode('processing');
    setVoiceError('');
    await onVoiceCommand(command);
  }, [handsFreeEnabled, onVoiceCommand, onVoiceDraft, stopRecorder]);

  const scheduleCommand = useCallback(() => {
    if (commandTimerRef.current !== null) window.clearTimeout(commandTimerRef.current);
    commandTimerRef.current = window.setTimeout(() => {
      void submitCommand();
    }, 1050);
  }, [submitCommand]);

  const startRecognition = useCallback(() => {
    if (!handsFreeEnabled || recognitionPausedRef.current || recognitionRef.current) return;
    const Recognition = getSpeechRecognitionConstructor();
    if (!Recognition) return;

    const recognition = new Recognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = currentLanguage;

    recognition.onstart = () => {
      if (directCaptureRef.current || wakeActiveRef.current) setMode('listening');
      else if (!loadingRef.current) setMode('armed');
    };

    recognition.onresult = (event) => {
      for (let index = event.resultIndex; index < event.results.length; index += 1) {
        const result = event.results[index];
        const transcript = (result[0]?.transcript ?? '').replace(/\s+/g, ' ').trim();
        if (!transcript) continue;

        if (!result.isFinal) {
          if (directCaptureRef.current || wakeActiveRef.current) {
            const draft = directCaptureRef.current ? directCommand(transcript) : extractWakeCommand(transcript);
            const shown = draft === null ? '' : draft;
            setLiveTranscript(shown || 'Listening…');
            if (shown) onVoiceDraft?.(shown);
          } else {
            const wake = extractWakeCommand(transcript);
            if (wake !== null) {
              wakeActiveRef.current = true;
              setMode('listening');
              setLiveTranscript(wake || 'Listening…');
              if (wake) onVoiceDraft?.(wake);
            }
          }
          continue;
        }

        if (directCaptureRef.current) {
          const command = directCommand(transcript);
          if (!command) {
            setLiveTranscript('Listening…');
            continue;
          }
          commandBufferRef.current = (commandBufferRef.current + ' ' + command).trim();
          setLiveTranscript(commandBufferRef.current);
          onVoiceDraft?.(commandBufferRef.current);
          scheduleCommand();
          continue;
        }

        if (!wakeActiveRef.current) {
          const command = extractWakeCommand(transcript);
          if (command === null) {
            setLiveTranscript('');
            continue;
          }
          wakeActiveRef.current = true;
          setMode('listening');
          commandBufferRef.current = command;
          setLiveTranscript(command || 'Listening…');
          if (command) {
            onVoiceDraft?.(command);
            scheduleCommand();
          }
          continue;
        }

        const command = directCommand(transcript);
        if (!command) continue;
        commandBufferRef.current = (commandBufferRef.current + ' ' + command).trim();
        setLiveTranscript(commandBufferRef.current);
        onVoiceDraft?.(commandBufferRef.current);
        scheduleCommand();
      }
    };

    recognition.onerror = (event) => {
      if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
        setMode('denied');
        setVoiceError('Microphone access is blocked.');
        setHandsFreeEnabled(false);
        return;
      }
      if (event.error === 'audio-capture') {
        setMode('unavailable');
        setVoiceError('No microphone is available.');
        return;
      }
      // During direct capture, the MediaRecorder + backend transcription path remains
      // active even if browser speech recognition reports no-speech/network errors.
      if (directCaptureRef.current) return;
      if (!recognitionPausedRef.current && handsFreeEnabled && event.error !== 'no-speech') {
        setMode('error');
        setVoiceError('Browser speech recognition stopped. Tap the waveform to talk now.');
      }
    };

    recognition.onend = () => {
      recognitionRef.current = null;
      if (!handsFreeEnabled || recognitionPausedRef.current) return;
      recognitionRestartRef.current = window.setTimeout(() => startRecognition(), 300);
    };

    recognitionRef.current = recognition;
    try {
      recognition.start();
    } catch {
      recognitionRef.current = null;
    }
  }, [
    currentLanguage,
    handsFreeEnabled,
    onVoiceDraft,
    scheduleCommand,
    setHandsFreeEnabled,
  ]);

  const beginDirectCapture = useCallback(async () => {
    const ready = await ensureMicrophone();
    if (!ready) return false;

    directCaptureRef.current = true;
    wakeActiveRef.current = true;
    commandBufferRef.current = '';
    setLiveTranscript('Listening…');
    onVoiceDraft?.('');
    setMode('listening');
    setVoiceError('');

    if (streamRef.current && (!recorderRef.current || recorderRef.current.state === 'inactive')) {
      startRecorder(streamRef.current);
    }
    if (handsFreeEnabled && !recognitionRef.current && !recognitionPausedRef.current) {
      window.setTimeout(() => startRecognition(), 40);
    }
    return true;
  }, [ensureMicrophone, handsFreeEnabled, onVoiceDraft, startRecognition, startRecorder]);

  const finishDirectCapture = useCallback(async () => {
    if (!directCaptureRef.current) return;
    directCaptureRef.current = false;

    if (commandTimerRef.current !== null) {
      window.clearTimeout(commandTimerRef.current);
      commandTimerRef.current = null;
    }

    const browserCommand = commandBufferRef.current.replace(/\s+/g, ' ').trim();
    const recorded = await stopRecorder();

    if (browserCommand) {
      commandBufferRef.current = browserCommand;
      await submitCommand();
      return;
    }

    if (!recorded || recorded.size < 512) {
      wakeActiveRef.current = false;
      setMode(handsFreeEnabled ? 'armed' : 'off');
      setLiveTranscript('');
      setVoiceError('I did not hear enough audio. Tap Talk and try again.');
      return;
    }

    setMode('transcribing');
    setLiveTranscript('Transcribing…');
    try {
      const transcript = await transcribeVoiceAudio(recorded, language);
      const command = directCommand(transcript);
      if (!command) {
        wakeActiveRef.current = true;
        directCaptureRef.current = true;
        setMode('listening');
        setLiveTranscript('I heard Xroga. Keep talking…');
        if (streamRef.current) startRecorder(streamRef.current);
        return;
      }
      commandBufferRef.current = command;
      setLiveTranscript(command);
      onVoiceDraft?.(command);
      await submitCommand();
    } catch (error) {
      wakeActiveRef.current = false;
      setMode('error');
      setLiveTranscript('');
      setVoiceError(error instanceof Error ? error.message : 'Could not transcribe that audio.');
    }
  }, [
    handsFreeEnabled,
    language,
    onVoiceDraft,
    startRecorder,
    stopRecorder,
    submitCommand,
  ]);

  const speak = useCallback(
    (rawText: string, onDone?: () => void) => {
      const text = speechSafeText(rawText);
      if (!text || !('speechSynthesis' in window) || typeof SpeechSynthesisUtterance === 'undefined') {
        onDone?.();
        return;
      }

      recognitionPausedRef.current = true;
      stopRecognition(true);
      window.speechSynthesis.cancel();

      const utterance = new SpeechSynthesisUtterance(text.slice(0, 2200));
      utterance.lang = currentLanguage;
      const toneSettings = TONE_SETTINGS[tone];
      utterance.rate = toneSettings.rate;
      utterance.pitch = toneSettings.pitch;
      const selectedVoice = pickVoice(voicesRef.current, currentLanguage, voiceGender);
      if (selectedVoice) utterance.voice = selectedVoice;

      const finish = () => {
        recognitionPausedRef.current = false;
        setMode(handsFreeEnabled ? 'armed' : 'off');
        if (handsFreeEnabled) window.setTimeout(() => startRecognition(), 240);
        onDone?.();
      };

      utterance.onstart = () => setMode('speaking');
      utterance.onend = finish;
      utterance.onerror = finish;
      window.speechSynthesis.speak(utterance);
    },
    [currentLanguage, handsFreeEnabled, startRecognition, stopRecognition, tone, voiceGender],
  );

  const enableHandsFree = useCallback(async (listenImmediately = false) => {
    const ready = await ensureMicrophone();
    if (!ready) return false;

    recognitionPausedRef.current = false;
    setHandsFreeEnabled(true);
    setMode(listenImmediately ? 'listening' : 'armed');
    setVoiceError('');
    if (listenImmediately) {
      window.setTimeout(() => void beginDirectCapture(), 30);
    }
    return true;
  }, [beginDirectCapture, ensureMicrophone, setHandsFreeEnabled]);

  const disableHandsFree = useCallback(() => {
    setHandsFreeEnabled(false);
    wakeActiveRef.current = false;
    directCaptureRef.current = false;
    commandBufferRef.current = '';
    setLiveTranscript('');
    recognitionPausedRef.current = true;
    stopRecognition(true);
    void stopRecorder();
    window.speechSynthesis?.cancel();
    releaseMicrophone();
    setMode('off');
  }, [releaseMicrophone, setHandsFreeEnabled, stopRecognition, stopRecorder]);

  const pauseVoice = useCallback(() => {
    recognitionPausedRef.current = true;
    stopRecognition(true);
    if (recorderRef.current?.state === 'recording') {
      try {
        recorderRef.current.pause();
      } catch {
        // Browser may not support pausing this recorder.
      }
    }
    setMode('paused');
  }, [stopRecognition]);

  const resumeVoice = useCallback(() => {
    recognitionPausedRef.current = false;
    if (recorderRef.current?.state === 'paused') {
      try {
        recorderRef.current.resume();
      } catch {
        // Browser may not support resuming this recorder.
      }
    }
    setMode(directCaptureRef.current ? 'listening' : 'armed');
    window.setTimeout(() => startRecognition(), 40);
  }, [startRecognition]);

  useEffect(() => {
    if (!mounted) return;

    if (handsFreeEnabled) {
      recognitionPausedRef.current = mode === 'paused' || mode === 'speaking';
      void ensureMicrophone().then((ready) => {
        if (ready && !recognitionPausedRef.current) startRecognition();
      });
    } else {
      recognitionPausedRef.current = true;
      stopRecognition(true);
      if (!onboardingOpen) releaseMicrophone();
      setMode((current) => (['denied', 'unavailable', 'error'].includes(current) ? current : 'off'));
    }

    return () => {
      stopRecognition(true);
      if (commandTimerRef.current !== null) window.clearTimeout(commandTimerRef.current);
    };
  }, [
    ensureMicrophone,
    handsFreeEnabled,
    mode,
    mounted,
    onboardingOpen,
    releaseMicrophone,
    startRecognition,
    stopRecognition,
  ]);

  useEffect(() => {
    if (!handsFreeEnabled) return;
    if (loading) {
      sawActiveRunRef.current = true;
      if (mode !== 'speaking' && mode !== 'listening' && mode !== 'paused') setMode('processing');
      return;
    }
    if (sawActiveRunRef.current && mode === 'processing') {
      sawActiveRunRef.current = false;
      setMode('armed');
      setLiveTranscript('');
    }
  }, [handsFreeEnabled, loading, mode]);

  useEffect(() => {
    if (!handsFreeEnabled && latestAssistantId) {
      lastSpokenAssistantRef.current = latestAssistantId;
    }
  }, [handsFreeEnabled, latestAssistantId]);

  useEffect(() => {
    if (
      !mounted ||
      !handsFreeEnabled ||
      !autoSpeak ||
      loading ||
      !latestAssistantId ||
      !latestAssistantText ||
      latestAssistantId === lastSpokenAssistantRef.current
    ) {
      return;
    }

    lastSpokenAssistantRef.current = latestAssistantId;
    speak(latestAssistantText);

    if (
      notificationsEnabled &&
      'Notification' in window &&
      Notification.permission === 'granted' &&
      document.visibilityState !== 'visible'
    ) {
      const preview = sanitizeSpeech(latestAssistantText).slice(0, 150);
      new Notification('Xroga finished', {
        body: preview || 'Your task is ready.',
        icon: '/brand/xroga-mark.png',
      });
    }
  }, [
    autoSpeak,
    handsFreeEnabled,
    latestAssistantId,
    latestAssistantText,
    loading,
    mounted,
    notificationsEnabled,
    speak,
  ]);

  useEffect(() => {
    return () => {
      recognitionPausedRef.current = true;
      stopRecognition(true);
      void stopRecorder();
      releaseMicrophone();
      window.speechSynthesis?.cancel();
      if (commandTimerRef.current !== null) window.clearTimeout(commandTimerRef.current);
    };
  }, [releaseMicrophone, stopRecognition, stopRecorder]);

  const requestNotifications = useCallback(async () => {
    if (!('Notification' in window)) {
      setNotificationPermission('unsupported');
      setNotificationsEnabled(false);
      return;
    }
    const permission = await Notification.requestPermission();
    setNotificationPermission(permission);
    setNotificationsEnabled(permission === 'granted');
  }, [setNotificationsEnabled]);

  const testSpeaker = useCallback(() => {
    if (
      !('speechSynthesis' in window) ||
      typeof SpeechSynthesisUtterance === 'undefined'
    ) {
      setSpeakerReady(false);
      setSpeechOutputSupported(false);
      setVoiceError('Speech output is unavailable in this browser.');
      return;
    }
    setSpeechOutputSupported(true);
    setSpeakerReady(true);
    setVoiceError('');
    speak(greetingFor(language), () => {
      if (!handsFreeEnabled) setMode('off');
    });
  }, [handsFreeEnabled, language, speak]);

  const finishOnboarding = useCallback(async () => {
    if (!micReady) {
      const ready = await ensureMicrophone();
      if (!ready) return;
    }
    if (!speakerReady && speechOutputSupported) {
      testSpeaker();
      return;
    }
    setOnboardingComplete(true);
    setOnboardingDismissed(false);
    setOnboardingOpen(false);
    await enableHandsFree(false);
  }, [
    enableHandsFree,
    ensureMicrophone,
    micReady,
    setOnboardingComplete,
    setOnboardingDismissed,
    speakerReady,
    speechOutputSupported,
    testSpeaker,
  ]);

  const openSetup = useCallback(() => {
    setVoiceError('');
    setOnboardingOpen(true);
  }, []);

  const primaryButton = useCallback(() => {
    if (!handsFreeEnabled) {
      if (!onboardingComplete) openSetup();
      else void enableHandsFree(true);
      return;
    }
    if (mode === 'paused') {
      resumeVoice();
      return;
    }
    if (directCaptureRef.current || mode === 'listening') {
      void finishDirectCapture();
      return;
    }
    void beginDirectCapture();
  }, [
    beginDirectCapture,
    enableHandsFree,
    finishDirectCapture,
    handsFreeEnabled,
    mode,
    onboardingComplete,
    openSetup,
    resumeVoice,
  ]);

  const onboarding = onboardingOpen && mounted
    ? createPortal(
        <div className="xv-voice-onboarding-backdrop" role="presentation">
          <section
            className="xv-voice-onboarding xv-voice-onboarding--compact"
            role="dialog"
            aria-modal="true"
            aria-labelledby="xv-voice-onboarding-title"
          >
            <button
              type="button"
              className="xv-voice-onboarding__close"
              aria-label="Close voice setup"
              onClick={() => {
                setOnboardingDismissed(true);
                setOnboardingOpen(false);
              }}
            >
              <X className="h-4 w-4" aria-hidden />
            </button>

            <div className="xv-voice-setup-brand">
              <Image
                src="/brand/xroga-orb-mark-v2.webp"
                width={54}
                height={54}
                alt=""
                priority
              />
            </div>
            <div className="text-center">
              <p className="xv-voice-kicker">XROGA VOICE</p>
              <h2 id="xv-voice-onboarding-title">Turn on hands-free voice</h2>
              <p>
                Allow the mic, hear Xroga once, then say <strong>“X Roga”</strong> or tap Talk.
              </p>
            </div>

            <div className="xv-voice-setup-preview" aria-hidden>
              <Image src="/brand/xroga-orb-mark-v2.webp" width={30} height={30} alt="" />
              <Waveform level={micReady ? Math.max(level, 0.08) : 0.04} large />
            </div>

            <div className="xv-voice-permission-grid xv-voice-permission-grid--compact">
              <button
                type="button"
                className={cn('xv-voice-permission', micReady && 'is-ready')}
                onClick={() => void ensureMicrophone()}
              >
                <span className="xv-voice-permission__icon"><Mic2 aria-hidden /></span>
                <span>
                  <strong>{micReady ? 'Microphone ready' : 'Allow microphone'}</strong>
                  <small>{micReady ? 'Xroga can hear you.' : 'Required for voice input.'}</small>
                </span>
                {micReady ? <Check className="h-4 w-4" aria-hidden /> : null}
              </button>

              <button
                type="button"
                className={cn('xv-voice-permission', speakerReady && 'is-ready')}
                onClick={testSpeaker}
              >
                <span className="xv-voice-permission__icon"><Volume2 aria-hidden /></span>
                <span>
                  <strong>{speakerReady ? 'Xroga voice tested' : 'Hear Xroga'}</strong>
                  <small>Confirms the speaker and the X Roga pronunciation.</small>
                </span>
                {speakerReady ? <Check className="h-4 w-4" aria-hidden /> : null}
              </button>

              <button
                type="button"
                className={cn(
                  'xv-voice-permission',
                  notificationPermission === 'granted' && 'is-ready',
                )}
                onClick={() => void requestNotifications()}
                disabled={notificationPermission === 'unsupported'}
              >
                <span className="xv-voice-permission__icon">
                  {notificationPermission === 'denied' ? <BellOff aria-hidden /> : <Bell aria-hidden />}
                </span>
                <span>
                  <strong>
                    {notificationPermission === 'granted'
                      ? 'Notifications ready'
                      : notificationPermission === 'denied'
                        ? 'Notifications blocked'
                        : 'Task notifications'}
                  </strong>
                  <small>Optional for long-running tasks.</small>
                </span>
                {notificationPermission === 'granted' ? <Check className="h-4 w-4" aria-hidden /> : null}
              </button>
            </div>

            <div className="xv-voice-onboarding__language">
              <Globe2 className="h-4 w-4" aria-hidden />
              <select
                value={language}
                onChange={(event) => setLanguage(event.target.value as VoiceLanguage)}
                aria-label="Voice language"
              >
                {XROGA_VOICE_LANGUAGES.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </div>

            {voiceError ? <p className="xv-voice-warning">{voiceError}</p> : null}
            {!recognitionSupported ? (
              <p className="xv-voice-note">
                Wake-word listening is limited in this browser. Tap Talk still uses Xroga&apos;s
                authenticated server transcription fallback.
              </p>
            ) : null}

            <div className="xv-voice-onboarding__footer">
              <button
                type="button"
                className="xv-voice-secondary"
                onClick={() => {
                  setOnboardingDismissed(true);
                  setOnboardingOpen(false);
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                className="xv-voice-primary"
                onClick={() => void finishOnboarding()}
                disabled={!micReady || (speechOutputSupported && !speakerReady)}
              >
                <Waves className="h-4 w-4" aria-hidden />
                Turn on voice
              </button>
            </div>
          </section>
        </div>,
        document.body,
      )
    : null;

  const sessionStage = voiceStage && handsFreeEnabled
    ? createPortal(
        <div
          className={cn(
            'xv-voice-session-bar',
            mode === 'listening' && 'is-listening',
            mode === 'speaking' && 'is-speaking',
            mode === 'processing' && 'is-processing',
            mode === 'paused' && 'is-paused',
          )}
          data-testid="xroga-voice-session"
        >
          <button
            type="button"
            className="xv-voice-session__orb"
            onClick={() => {
              if (mode === 'paused') resumeVoice();
              else if (!loading && mode !== 'speaking') void beginDirectCapture();
            }}
            aria-label={mode === 'paused' ? 'Resume Xroga voice' : 'Talk to Xroga now'}
          >
            <Image src="/brand/xroga-orb-mark-v2.webp" width={34} height={34} alt="" />
          </button>

          <div className="xv-voice-session__copy">
            <strong>{modeLabel(mode)}</strong>
            <span>
              {mode === 'armed'
                ? 'Say “X Roga” or tap the waveform to talk now'
                : mode === 'listening'
                  ? liveTranscript || 'Listening…'
                  : mode === 'transcribing'
                    ? 'Turning your speech into a real Xroga request…'
                    : mode === 'processing'
                      ? 'Running through Xroga agents…'
                      : mode === 'speaking'
                        ? 'Xroga is speaking'
                        : mode === 'paused'
                          ? 'Microphone paused'
                          : voiceError || 'Voice is ready'}
            </span>
          </div>

          <button
            type="button"
            className="xv-voice-session__wave-button"
            onClick={() => {
              if (mode === 'paused') resumeVoice();
              else if (directCaptureRef.current) void finishDirectCapture();
              else if (!loading && mode !== 'speaking') void beginDirectCapture();
            }}
            aria-label={directCaptureRef.current ? 'Finish voice input' : 'Talk to Xroga now'}
          >
            <Waveform
              level={mode === 'paused' ? 0 : level}
              speaking={mode === 'speaking'}
              large
            />
          </button>

          <div className="xv-voice-session__controls">
            <button
              type="button"
              onClick={mode === 'paused' ? resumeVoice : pauseVoice}
              aria-label={mode === 'paused' ? 'Resume voice' : 'Pause voice'}
              title={mode === 'paused' ? 'Resume voice' : 'Pause voice'}
            >
              {mode === 'paused'
                ? <Play className="h-4 w-4" aria-hidden />
                : <CirclePause className="h-4 w-4" aria-hidden />}
            </button>
            {directCaptureRef.current ? (
              <button
                type="button"
                onClick={() => void finishDirectCapture()}
                aria-label="Finish voice input"
                title="Done talking"
              >
                <Check className="h-4 w-4" aria-hidden />
              </button>
            ) : null}
            <button
              type="button"
              onClick={() => {
                if (loading) onStopRun?.();
                disableHandsFree();
              }}
              aria-label={loading ? 'Stop Xroga task and voice' : 'Turn off Xroga voice'}
              title={loading ? 'Stop task and voice' : 'Turn off voice'}
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
      <div className="xv-voice-control">
        <button
          type="button"
          className={cn(
            'xv-voice-toggle',
            handsFreeEnabled && 'is-on',
            ['listening', 'transcribing', 'processing', 'speaking'].includes(mode) && 'is-active',
            ['denied', 'error', 'unavailable'].includes(mode) && 'is-error',
          )}
          aria-pressed={handsFreeEnabled}
          onClick={primaryButton}
          title={
            handsFreeEnabled
              ? directCaptureRef.current
                ? 'Finish voice input'
                : 'Talk to Xroga now'
              : 'Turn on Xroga voice'
          }
        >
          <span className="xv-voice-toggle__icon">
            {mode === 'speaking'
              ? <Volume2 className="h-4 w-4" aria-hidden />
              : mode === 'processing' || mode === 'transcribing'
                ? <Sparkles className="h-4 w-4" aria-hidden />
                : mode === 'error' || mode === 'denied' || mode === 'unavailable'
                  ? <VolumeX className="h-4 w-4" aria-hidden />
                  : <Mic2 className="h-4 w-4" aria-hidden />}
          </span>
          <span className="xv-voice-toggle__label">{modeLabel(mode)}</span>
          {handsFreeEnabled ? (
            <Waveform level={mode === 'paused' ? 0 : level} speaking={mode === 'speaking'} compact />
          ) : null}
        </button>

        <button
          type="button"
          className="xv-voice-settings-trigger"
          aria-label="Voice settings"
          aria-expanded={settingsOpen}
          onClick={() => setSettingsOpen((open) => !open)}
        >
          <ChevronDown
            className={cn('h-3.5 w-3.5 transition-transform', settingsOpen && 'rotate-180')}
            aria-hidden
          />
        </button>

        {settingsOpen ? (
          <div className="xv-voice-settings-panel" role="dialog" aria-label="Xroga voice settings">
            <div className="xv-voice-settings-panel__head">
              <span>
                <Settings2 className="h-4 w-4" aria-hidden />
                Voice
              </span>
              <button type="button" onClick={() => setSettingsOpen(false)} aria-label="Close voice settings">
                <X className="h-4 w-4" aria-hidden />
              </button>
            </div>

            <div className="xv-voice-live">
              <Image src="/brand/xroga-orb-mark-v2.webp" width={38} height={38} alt="" />
              <span className="min-w-0 flex-1">
                <strong>{modeLabel(mode)}</strong>
                <small>
                  {handsFreeEnabled
                    ? 'Say “X Roga” for hands-free, or tap Talk for immediate dictation.'
                    : 'Voice is off.'}
                </small>
              </span>
              <Waveform level={level} speaking={mode === 'speaking'} />
            </div>

            <div className="xv-voice-settings-list">
              <div className="xv-voice-setting-row">
                <span>Hands-free</span>
                <Switch
                  checked={handsFreeEnabled}
                  label="Hands-free Xroga"
                  onChange={(checked) => {
                    if (checked) {
                      if (!onboardingComplete) openSetup();
                      else void enableHandsFree(false);
                    } else {
                      disableHandsFree();
                    }
                  }}
                />
              </div>

              <SelectRow
                label="Language"
                value={language}
                onChange={(value) => setLanguage(value as VoiceLanguage)}
              >
                {XROGA_VOICE_LANGUAGES.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </SelectRow>

              <SelectRow
                label="Voice"
                value={voiceGender}
                onChange={(value) => setVoiceGender(value as VoiceGender)}
              >
                <option value="auto">Device best match</option>
                <option value="female">Prefer female</option>
                <option value="male">Prefer male</option>
              </SelectRow>

              <SelectRow
                label="Tone"
                value={tone}
                onChange={(value) => setTone(value as VoiceTone)}
              >
                <option value="warm">Warm</option>
                <option value="calm">Calm</option>
                <option value="professional">Professional</option>
                <option value="energetic">Energetic</option>
              </SelectRow>

              <div className="xv-voice-setting-row">
                <span>Speak replies</span>
                <Switch checked={autoSpeak} onChange={setAutoSpeak} label="Speak Xroga replies" />
              </div>

              <div className="xv-voice-setting-row">
                <span>Task notifications</span>
                <Switch
                  checked={notificationsEnabled && notificationPermission === 'granted'}
                  label="Task notifications"
                  onChange={(checked) => {
                    if (checked) void requestNotifications();
                    else setNotificationsEnabled(false);
                  }}
                />
              </div>
            </div>

            <div className="xv-voice-settings-actions">
              <button type="button" onClick={() => void beginDirectCapture()}>
                <Mic2 className="h-4 w-4" aria-hidden />
                Talk now
              </button>
              <button type="button" onClick={testSpeaker}>
                <Volume2 className="h-4 w-4" aria-hidden />
                Test Xroga
              </button>
              <button type="button" onClick={openSetup}>
                <Sparkles className="h-4 w-4" aria-hidden />
                Setup
              </button>
            </div>

            {voiceError ? <p className="xv-voice-warning">{voiceError}</p> : null}
          </div>
        ) : null}
      </div>
      {sessionStage}
      {onboarding}
    </>
  );
}
