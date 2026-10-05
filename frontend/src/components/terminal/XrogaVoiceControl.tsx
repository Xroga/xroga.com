'use client';

import {
  Bell,
  BellOff,
  Check,
  ChevronDown,
  Globe2,
  Mic2,
  Settings2,
  Sparkles,
  Volume2,
  VolumeX,
  Waves,
  X,
} from 'lucide-react';
import { createPortal } from 'react-dom';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { cn } from '@/lib/utils';
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

const WAKE_WORD = /\bxroga\b/i;
const WAKE_PREFIX =
  /^(?:(?:hi|hey|hello|salam|salaam|assalam(?:u|o)?\s*alaikum|hola|oi|olá|namaste|bonjour|merhaba)\s+)?xroga[\s,.:;!?-]*/i;

const GREETINGS: Record<string, string> = {
  en: "Hi, I'm Xroga. Say Xroga, then tell me what you want me to do.",
  ur: 'السلام علیکم، میں ایکسروگا ہوں۔ ایکسروگا کہیں، پھر مجھے بتائیں آپ کیا کروانا چاہتے ہیں۔',
  hi: 'नमस्ते, मैं Xroga हूँ। Xroga कहें, फिर बताएं कि आप मुझसे क्या करवाना चाहते हैं।',
  ar: 'مرحباً، أنا Xroga. قل Xroga ثم أخبرني بما تريد مني أن أفعله.',
  es: 'Hola, soy Xroga. Di Xroga y luego dime qué quieres que haga.',
  pt: 'Olá, eu sou a Xroga. Diga Xroga e depois me diga o que você quer que eu faça.',
  id: 'Halo, saya Xroga. Ucapkan Xroga, lalu beri tahu apa yang ingin Anda kerjakan.',
  tr: 'Merhaba, ben Xroga. Xroga deyin ve sonra ne yapmamı istediğinizi söyleyin.',
  fr: 'Bonjour, je suis Xroga. Dites Xroga, puis dites-moi ce que vous voulez que je fasse.',
  de: 'Hallo, ich bin Xroga. Sagen Sie Xroga und dann, was ich für Sie tun soll.',
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
    .replace(/\x60\x60\x60[\s\S]*?\x60\x60\x60/g, ' ')
    .replace(/\x60([^\x60]+)\x60/g, '$1')
    .replace(/https?:\/\/\S+/g, ' ')
    .replace(/[#>*_~|]/g, ' ')
    .replace(/\[(.*?)\]\([^)]*\)/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();
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

function stripWakeWord(text: string): string {
  return text.replace(WAKE_PREFIX, '').trim();
}

function modeLabel(mode: VoiceMode): string {
  switch (mode) {
    case 'armed':
      return 'Voice on';
    case 'listening':
      return 'Listening';
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
}: {
  level: number;
  speaking?: boolean;
  compact?: boolean;
}) {
  const bars = compact ? 5 : 11;
  return (
    <span
      className={cn('xv-voice-wave', compact && 'xv-voice-wave--compact', speaking && 'is-speaking')}
      aria-hidden="true"
    >
      {Array.from({ length: bars }, (_, index) => {
        const center = (bars - 1) / 2;
        const weight = 1 - Math.abs(index - center) / Math.max(center, 1);
        const height = speaking
          ? 22 + ((index * 17) % 46)
          : 12 + Math.min(84, level * (45 + weight * 52));
        return (
          <i
            key={index}
            style={{
              transform: 'scaleY(' + Math.max(0.16, height / 100) + ')',
              animationDelay: String(-index * 55) + 'ms',
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

export function XrogaVoiceControl({
  loading,
  latestAssistantId,
  latestAssistantText,
  onVoiceCommand,
}: {
  loading: boolean;
  latestAssistantId?: string;
  latestAssistantText?: string;
  onVoiceCommand: (transcript: string) => void | Promise<void>;
}) {
  const {
    language,
    tone,
    voiceGender,
    handsFreeEnabled,
    autoSpeak,
    notificationsEnabled,
    onboardingComplete,
    onboardingDismissed,
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
  const [notificationPermission, setNotificationPermission] = useState<
    NotificationPermission | 'unsupported'
  >('default');
  const [liveTranscript, setLiveTranscript] = useState('');
  const [level, setLevel] = useState(0);

  const streamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
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

  const currentLanguage = effectiveLanguage(language);

  useEffect(() => {
    setMounted(true);
    setOnboardingOpen(!onboardingComplete && !onboardingDismissed);
    if ('Notification' in window) setNotificationPermission(Notification.permission);
    else setNotificationPermission('unsupported');

    const updateVoices = () => {
      voicesRef.current = window.speechSynthesis?.getVoices?.() ?? [];
    };
    updateVoices();
    window.speechSynthesis?.addEventListener?.('voiceschanged', updateVoices);
    return () => window.speechSynthesis?.removeEventListener?.('voiceschanged', updateVoices);
  }, [onboardingComplete, onboardingDismissed]);

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
    analyser.smoothingTimeConstant = 0.72;
    context.createMediaStreamSource(stream).connect(analyser);
    audioContextRef.current = context;
    analyserRef.current = analyser;

    const bins = new Uint8Array(analyser.frequencyBinCount);
    const tick = () => {
      analyser.getByteFrequencyData(bins);
      let sum = 0;
      for (let index = 0; index < bins.length; index += 1) sum += bins[index] ?? 0;
      setLevel(Math.min(1, sum / Math.max(1, bins.length) / 110));
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
    analyserRef.current = null;
    setMicReady(false);
  }, [stopMeter]);

  const ensureMicrophone = useCallback(async () => {
    if (streamRef.current?.active) {
      setMicReady(true);
      return true;
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      setMode('unavailable');
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
      startMeter(stream);
      return true;
    } catch (error) {
      const denied =
        error instanceof DOMException &&
        (error.name === 'NotAllowedError' || error.name === 'SecurityError');
      setMode(denied ? 'denied' : 'error');
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
      // Already stopped by the browser.
    }
    recognitionRef.current = null;
  }, []);

  const submitCommand = useCallback(async () => {
    if (commandTimerRef.current !== null) {
      window.clearTimeout(commandTimerRef.current);
      commandTimerRef.current = null;
    }
    const command = commandBufferRef.current.replace(/\s+/g, ' ').trim();
    commandBufferRef.current = '';
    wakeActiveRef.current = false;
    setLiveTranscript('');
    if (!command) {
      setMode(handsFreeEnabled ? 'armed' : 'off');
      return;
    }
    setMode('processing');
    await onVoiceCommand(command);
  }, [handsFreeEnabled, onVoiceCommand]);

  const scheduleCommand = useCallback(() => {
    if (commandTimerRef.current !== null) window.clearTimeout(commandTimerRef.current);
    commandTimerRef.current = window.setTimeout(() => {
      void submitCommand();
    }, 950);
  }, [submitCommand]);

  const startRecognition = useCallback(() => {
    if (!handsFreeEnabled || recognitionPausedRef.current || recognitionRef.current) return;
    const Recognition = getSpeechRecognitionConstructor();
    if (!Recognition) {
      setMode('unavailable');
      return;
    }

    const recognition = new Recognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = currentLanguage;

    recognition.onstart = () => {
      if (!wakeActiveRef.current) setMode('armed');
    };

    recognition.onresult = (event) => {
      for (let index = event.resultIndex; index < event.results.length; index += 1) {
        const result = event.results[index];
        const transcript = (result[0]?.transcript ?? '').trim();
        if (!transcript) continue;

        if (!result.isFinal) {
          setLiveTranscript(transcript);
          continue;
        }

        if (!wakeActiveRef.current) {
          if (!WAKE_WORD.test(transcript)) {
            setLiveTranscript('');
            continue;
          }
          wakeActiveRef.current = true;
          setMode('listening');
          const command = stripWakeWord(transcript);
          commandBufferRef.current = command;
          setLiveTranscript(command);
          if (command) scheduleCommand();
          continue;
        }

        commandBufferRef.current = (commandBufferRef.current + ' ' + transcript).trim();
        setLiveTranscript(commandBufferRef.current);
        scheduleCommand();
      }
    };

    recognition.onerror = (event) => {
      if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
        setMode('denied');
        setHandsFreeEnabled(false);
      } else if (event.error === 'audio-capture') {
        setMode('unavailable');
      } else if (!recognitionPausedRef.current && handsFreeEnabled) {
        setMode('error');
      }
    };

    recognition.onend = () => {
      recognitionRef.current = null;
      if (!handsFreeEnabled || recognitionPausedRef.current) return;
      recognitionRestartRef.current = window.setTimeout(() => startRecognition(), 350);
    };

    recognitionRef.current = recognition;
    try {
      recognition.start();
    } catch {
      recognitionRef.current = null;
      setMode('unavailable');
    }
  }, [currentLanguage, handsFreeEnabled, scheduleCommand, setHandsFreeEnabled]);

  const speak = useCallback(
    (rawText: string, onDone?: () => void) => {
      const text = sanitizeSpeech(rawText);
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
        if (handsFreeEnabled) window.setTimeout(() => startRecognition(), 250);
        onDone?.();
      };

      utterance.onstart = () => setMode('speaking');
      utterance.onend = finish;
      utterance.onerror = finish;
      window.speechSynthesis.speak(utterance);
    },
    [currentLanguage, handsFreeEnabled, startRecognition, stopRecognition, tone, voiceGender],
  );

  const enableHandsFree = useCallback(async () => {
    if (!getSpeechRecognitionConstructor()) {
      setMode('unavailable');
      return false;
    }
    const ready = await ensureMicrophone();
    if (!ready) return false;
    setHandsFreeEnabled(true);
    setMode('armed');
    return true;
  }, [ensureMicrophone, setHandsFreeEnabled]);

  const disableHandsFree = useCallback(() => {
    setHandsFreeEnabled(false);
    wakeActiveRef.current = false;
    commandBufferRef.current = '';
    setLiveTranscript('');
    recognitionPausedRef.current = false;
    stopRecognition(true);
    window.speechSynthesis?.cancel();
    releaseMicrophone();
    setMode('off');
  }, [releaseMicrophone, setHandsFreeEnabled, stopRecognition]);

  useEffect(() => {
    if (!mounted) return;
    if (handsFreeEnabled) {
      void ensureMicrophone().then((ready) => {
        if (ready) startRecognition();
      });
    } else {
      stopRecognition(true);
      releaseMicrophone();
      setMode('off');
    }
    return () => {
      stopRecognition(true);
      if (commandTimerRef.current !== null) window.clearTimeout(commandTimerRef.current);
    };
  }, [
    handsFreeEnabled,
    mounted,
    currentLanguage,
    ensureMicrophone,
    releaseMicrophone,
    startRecognition,
    stopRecognition,
  ]);

  useEffect(() => {
    if (!handsFreeEnabled) return;
    if (loading) {
      sawActiveRunRef.current = true;
      if (mode !== 'speaking' && mode !== 'listening') setMode('processing');
      return;
    }
    if (sawActiveRunRef.current && mode === 'processing') {
      sawActiveRunRef.current = false;
      setMode('armed');
    }
  }, [handsFreeEnabled, loading, mode]);

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
      stopRecognition(true);
      releaseMicrophone();
      window.speechSynthesis?.cancel();
      if (commandTimerRef.current !== null) window.clearTimeout(commandTimerRef.current);
    };
  }, [releaseMicrophone, stopRecognition]);

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
    setSpeakerReady(true);
    speak(greetingFor(language), () => {
      if (!handsFreeEnabled) setMode('off');
    });
  }, [handsFreeEnabled, language, speak]);

  const finishOnboarding = useCallback(async () => {
    if (!micReady) {
      const ready = await ensureMicrophone();
      if (!ready) return;
    }
    setOnboardingComplete(true);
    setOnboardingDismissed(false);
    setOnboardingOpen(false);
    await enableHandsFree();
  }, [
    enableHandsFree,
    ensureMicrophone,
    micReady,
    setOnboardingComplete,
    setOnboardingDismissed,
  ]);

  const StatusIcon = useMemo(() => {
    if (mode === 'speaking') return Volume2;
    if (mode === 'listening') return Waves;
    if (mode === 'processing') return Sparkles;
    if (mode === 'denied' || mode === 'error' || mode === 'unavailable') return VolumeX;
    return Mic2;
  }, [mode]);

  const onboarding = onboardingOpen && mounted
    ? createPortal(
        <div className="xv-voice-onboarding-backdrop" role="presentation">
          <section
            className="xv-voice-onboarding"
            role="dialog"
            aria-modal="true"
            aria-labelledby="xv-voice-onboarding-title"
          >
            <button
              type="button"
              className="xv-voice-onboarding__close"
              aria-label="Not now"
              onClick={() => {
                setOnboardingDismissed(true);
                setOnboardingOpen(false);
              }}
            >
              <X className="h-4 w-4" aria-hidden />
            </button>

            <div className="xv-voice-orb" aria-hidden>
              <span />
              <span />
              <span />
            </div>

            <div className="text-center">
              <p className="xv-voice-kicker">HANDS-FREE XROGA</p>
              <h2 id="xv-voice-onboarding-title">Talk to Xroga naturally</h2>
              <p>
                Enable your microphone once. While this workspace is open, say <strong>“Xroga”</strong>,
                then tell it what you want done. Voice requests use the same Xroga agents, evidence,
                Stop controls, billing, and durable execution as typed requests.
              </p>
            </div>

            <div className="xv-voice-permission-grid">
              <button
                type="button"
                className={cn('xv-voice-permission', micReady && 'is-ready')}
                onClick={() => void ensureMicrophone()}
              >
                <span className="xv-voice-permission__icon"><Mic2 aria-hidden /></span>
                <span>
                  <strong>{micReady ? 'Microphone ready' : 'Enable microphone'}</strong>
                  <small>Needed to hear “Xroga” and your request.</small>
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
                  <strong>{speakerReady ? 'Speaker tested' : 'Hear Xroga first'}</strong>
                  <small>Xroga will explain how hands-free mode works.</small>
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
                        : 'Enable notifications'}
                  </strong>
                  <small>Optional: know when a long task finishes in another tab.</small>
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

            <div className="xv-voice-onboarding__footer">
              <button
                type="button"
                className="xv-voice-secondary"
                onClick={() => {
                  setOnboardingDismissed(true);
                  setOnboardingOpen(false);
                }}
              >
                Not now
              </button>
              <button
                type="button"
                className="xv-voice-primary"
                onClick={() => void finishOnboarding()}
                disabled={!micReady || !speakerReady}
              >
                <Waves className="h-4 w-4" aria-hidden />
                Finish & turn on voice
              </button>
            </div>

            <p className="xv-voice-privacy">
              Your browser controls microphone permission. Xroga only activates hands-free commands
              after hearing the wake word while this page is open.
            </p>
          </section>
        </div>,
        document.body,
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
            ['listening', 'processing', 'speaking'].includes(mode) && 'is-active',
            ['denied', 'error', 'unavailable'].includes(mode) && 'is-error',
          )}
          aria-pressed={handsFreeEnabled}
          onClick={() => {
            if (handsFreeEnabled) disableHandsFree();
            else if (!onboardingComplete) setOnboardingOpen(true);
            else void enableHandsFree();
          }}
          title={handsFreeEnabled ? 'Turn off hands-free Xroga' : 'Turn on hands-free Xroga'}
        >
          <span className="xv-voice-toggle__icon">
            <StatusIcon className="h-4 w-4" aria-hidden />
          </span>
          <span className="xv-voice-toggle__label">{modeLabel(mode)}</span>
          {handsFreeEnabled ? <Waveform level={level} speaking={mode === 'speaking'} compact /> : null}
        </button>

        <button
          type="button"
          className="xv-voice-settings-trigger"
          aria-label="Voice settings"
          aria-expanded={settingsOpen}
          onClick={() => setSettingsOpen((open) => !open)}
        >
          <ChevronDown className={cn('h-3.5 w-3.5 transition-transform', settingsOpen && 'rotate-180')} aria-hidden />
        </button>

        {settingsOpen ? (
          <div className="xv-voice-settings-panel" role="dialog" aria-label="Xroga voice settings">
            <div className="xv-voice-settings-panel__head">
              <span>
                <Settings2 className="h-4 w-4" aria-hidden />
                Voice settings
              </span>
              <button type="button" onClick={() => setSettingsOpen(false)} aria-label="Close voice settings">
                <X className="h-4 w-4" aria-hidden />
              </button>
            </div>

            <div className="xv-voice-live">
              <div className={cn('xv-voice-orb xv-voice-orb--small', handsFreeEnabled && 'is-live')} aria-hidden>
                <span />
                <span />
                <span />
              </div>
              <span className="min-w-0 flex-1">
                <strong>{modeLabel(mode)}</strong>
                <small>
                  {mode === 'armed'
                    ? 'Say “Xroga”, then speak your request.'
                    : mode === 'listening'
                      ? liveTranscript || 'I’m listening…'
                      : mode === 'processing'
                        ? 'Your request is running through the same Xroga backend.'
                        : mode === 'speaking'
                          ? 'Xroga is speaking the completed response.'
                          : handsFreeEnabled
                            ? 'Hands-free mode is active.'
                            : 'Hands-free mode is off.'}
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
                      if (!onboardingComplete) setOnboardingOpen(true);
                      else void enableHandsFree();
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
              <button type="button" onClick={testSpeaker}>
                <Volume2 className="h-4 w-4" aria-hidden />
                Test voice
              </button>
              <button type="button" onClick={() => setOnboardingOpen(true)}>
                <Sparkles className="h-4 w-4" aria-hidden />
                Setup
              </button>
            </div>

            {mode === 'unavailable' ? (
              <p className="xv-voice-warning">
                Hands-free speech recognition is not available in this browser. Use a current
                Chromium-based browser or keep typing; Xroga’s normal chat remains unchanged.
              </p>
            ) : null}
            {mode === 'denied' ? (
              <p className="xv-voice-warning">
                Microphone access is blocked. Allow microphone access for this site in your browser,
                then turn Voice on again.
              </p>
            ) : null}
          </div>
        ) : null}
      </div>
      {onboarding}
    </>
  );
}
