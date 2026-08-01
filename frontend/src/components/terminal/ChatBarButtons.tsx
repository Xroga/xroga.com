'use client';

import { cn } from '@/lib/utils';
import { useEffect, useRef, useState } from 'react';
import { CloudUpload, LoaderCircle, Mic, MicOff } from 'lucide-react';
import { ChatBarShipIcon, type SendButtonState } from './ChatBarShipIcon';

export type { SendButtonState };
export type ChatbarSurface = 'homepage' | 'dashboard' | 'incognito';

type SpeechInputState = 'idle' | 'recording' | 'processing' | 'denied' | 'unavailable';

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

function getSpeechRecognitionConstructor(): BrowserSpeechRecognitionConstructor | null {
  if (typeof window === 'undefined') return null;
  const speechWindow = window as typeof window & {
    SpeechRecognition?: BrowserSpeechRecognitionConstructor;
    webkitSpeechRecognition?: BrowserSpeechRecognitionConstructor;
  };
  return speechWindow.SpeechRecognition ?? speechWindow.webkitSpeechRecognition ?? null;
}

export function ChatBarMicrophoneButton({
  onTranscript,
  surface = 'dashboard',
}: {
  onTranscript: (transcript: string) => void;
  surface?: ChatbarSurface;
}) {
  const [state, setState] = useState<SpeechInputState>('idle');
  const recognitionRef = useRef<BrowserSpeechRecognition | null>(null);

  useEffect(() => {
    if (!getSpeechRecognitionConstructor()) setState('unavailable');
    return () => {
      recognitionRef.current?.abort();
      recognitionRef.current = null;
    };
  }, []);

  const label = {
    idle: 'Start voice input',
    recording: 'Stop recording',
    processing: 'Processing voice input',
    denied: 'Voice input permission denied',
    unavailable: 'Voice input unavailable in this browser',
  }[state];

  const handleClick = () => {
    if (state === 'recording') {
      recognitionRef.current?.stop();
      setState('processing');
      return;
    }
    if (state === 'processing' || state === 'unavailable') return;

    const SpeechRecognition = getSpeechRecognitionConstructor();
    if (!SpeechRecognition) {
      setState('unavailable');
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.lang = document.documentElement.lang || navigator.language || 'en-US';
    recognition.onstart = () => setState('recording');
    recognition.onresult = (event) => {
      let finalTranscript = '';
      for (let index = event.resultIndex; index < event.results.length; index += 1) {
        const result = event.results[index];
        if (result.isFinal) finalTranscript += result[0]?.transcript ?? '';
      }
      const transcript = finalTranscript.trim();
      if (transcript) {
        setState('processing');
        onTranscript(transcript);
      }
    };
    recognition.onerror = (event) => {
      if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
        setState('denied');
      } else if (event.error === 'audio-capture') {
        setState('unavailable');
      } else {
        setState('idle');
      }
    };
    recognition.onend = () => {
      recognitionRef.current = null;
      setState((current) => (current === 'denied' || current === 'unavailable' ? current : 'idle'));
    };
    recognitionRef.current = recognition;

    try {
      recognition.start();
    } catch {
      recognitionRef.current = null;
      setState('unavailable');
    }
  };

  const Icon = state === 'processing' ? LoaderCircle : state === 'denied' || state === 'unavailable' ? MicOff : Mic;

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={state === 'processing' || state === 'unavailable'}
      className={cn(
        'h-9 w-9 shrink-0 rounded-full border border-[var(--card-border)] flex items-center justify-center text-[var(--muted)] transition-colors',
        'hover:text-[var(--foreground)] hover:border-[var(--accent)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]',
        state === 'recording' && 'border-red-500 text-red-500 bg-red-500/10',
        (state === 'processing' || state === 'unavailable') && 'cursor-not-allowed opacity-60',
        surface === 'homepage' && 'bg-white/5'
      )}
      title={label}
      aria-label={label}
      aria-pressed={state === 'recording'}
      aria-live="polite"
    >
      <Icon className={cn('h-4 w-4', state === 'processing' && 'animate-spin')} aria-hidden />
    </button>
  );
}

export function ChatBarSendButton({
  stopping = false,
  onStop,
  state = 'idle',
  surface = 'dashboard',
  compact = false,
}: {
  stopping?: boolean;
  onStop?: () => void;
  state?: SendButtonState;
  surface?: ChatbarSurface;
  compact?: boolean;
}) {
  const busy = stopping || state === 'sending' || state === 'thinking';

  if (busy) {
    return (
      <button
        type="button"
        onClick={onStop}
        className={cn(
          'xv-go-btn xv-go-btn--stop shrink-0',
          surface === 'homepage' && 'xv-go-btn--home',
          surface === 'incognito' && 'xv-go-btn--incognito'
        )}
        aria-label="Stop response"
      >
        <span className="xv-go-btn__liquid xv-go-btn__liquid--stop" aria-hidden />
        <span className="xv-go-btn__icon xv-go-btn__icon--stop">
          <ChatBarShipIcon state={stopping ? 'thinking' : state} size={18} bold />
        </span>
      </button>
    );
  }

  return (
    <button
      type="submit"
      className={cn(
        'xv-send shrink-0',
        compact && 'xv-send--compact',
        surface === 'homepage' && 'xv-send--home',
        surface === 'incognito' && 'xv-send--incognito'
      )}
      aria-label="Send prompt"
      title="Send"
    >
      {/* Compact theme-aware send arrow; animation is hover-driven and disabled for reduced motion. */}
      <span className="xv-send__arrow" aria-hidden="true">
        <svg viewBox="0 0 38 15" fill="none">
          <path
            fill="currentColor"
            d="M10 7.519l-.939-.344.939.344zm14.386-1.205-.981-.192.981.192zm1.276 5.509.537.843.148-.094.107-.139-.792-.611zm4.819-4.304-.385-.923.385.923zm7.227.707a1 1 0 0 0 0-1.414L31.343.448a1 1 0 0 0-1.414 0 1 1 0 0 0 0 1.414l5.657 5.657-5.657 5.657a1 1 0 0 0 1.414 1.414l6.364-6.364zM1 7.519l.554.833.123-.08.361-.23 1.277-.77c1.054-.609 2.397-1.32 3.629-1.787.617-.234 1.17-.392 1.623-.455.477-.066.707-.008.788.034.025.013.031.021.039.034a.56.56 0 0 1 .058.235c.029.327-.047.906-.39 1.842l1.878.689c.383-1.044.571-1.949.505-2.705-.072-.815-.45-1.493-1.16-1.865-.627-.329-1.358-.332-1.993-.244-.659.092-1.367.305-2.056.566-1.381.523-2.833 1.297-3.921 1.925l-1.341.808-.385.245-.132.086c-.011.007-.011.007.543.84zm8.061-.344c-.198.54-.328 1.038-.36 1.484-.032.441.024.94.325 1.364.319.45.786.64 1.21.697.403.054.824-.001 1.21-.09.775-.179 1.694-.566 2.633-1.014l3.023-1.554c2.115-1.122 4.107-2.168 5.476-2.524.329-.086.573-.117.742-.115.169.002.195.038.161.014-.15-.105.085-.139-.076.685l1.963.384c.192-.98.152-2.083-.74-2.707-.405-.283-.868-.37-1.28-.376-.412-.006-.849.069-1.274.179-1.65.43-3.888 1.621-5.909 2.693l-2.948 1.517c-.92.439-1.673.743-2.221.87-.276.064-.429.065-.492.057-.043-.006.066.003.155.127.07.099.024.131.038-.063.014-.187.078-.49.243-.94l-1.878-.689zm14.343-1.053c-.361 1.844-.474 3.185-.413 4.161.059.95.294 1.72.811 2.215.567.544 1.242.546 1.664.459.207-.043.38-.111.502-.167l.15-.076.067-.039c.013-.008.013-.008-.524-.852l-.536-.844.019-.012c-.038.018-.064.027-.084.032-.037.008.053-.013.125.056.021.02-.151-.135-.198-.895-.046-.734.034-1.887.38-3.652l-1.963-.384zm2.257 5.701l.791.611.104-.132.311-.377 1.093-1.213c.922-.954 2.005-1.894 2.904-2.27l-.771-1.846c-1.31.547-2.637 1.758-3.572 2.725l-1.184 1.314-.341.414-.118.149c-.01.013-.01.013.781.624zm5.204-3.381c.989-.413 1.791-.42 2.697-.307.871.108 2.083.385 3.437.385v-2c-1.197 0-2.041-.226-3.19-.369-1.114-.139-2.297-.146-3.715.447l.771 1.846z"
          />
        </svg>
      </span>
    </button>
  );
}

export function ChatBarUploadButton({
  onClick,
  active,
  surface = 'dashboard',
}: {
  onClick: () => void;
  active?: boolean;
  surface?: ChatbarSurface;
}) {
  return (
    <div className={cn('xv-power-smash-upload shrink-0', surface === 'homepage' && 'xv-power-smash-upload--home')}>
      <button
        type="button"
        onClick={onClick}
        className={cn('xv-power-smash-upload__shell', active && 'xv-power-smash-upload__shell--active')}
        title="Attach files"
        aria-label="Upload files"
        aria-busy={active}
      >
        <span className="xv-power-smash-upload__shine" aria-hidden />
        <span className="xv-power-smash-upload__gloss" aria-hidden />
        <CloudUpload
          className={cn(
            'w-4 h-4 relative z-[1] transition-transform',
            active && 'xv-cloud-upload-bounce text-white'
          )}
          strokeWidth={2.25}
        />
        {active && <span className="xv-upload-pulse-ring" aria-hidden />}
      </button>
    </div>
  );
}

export function GitHubChipIcon({ lightBg = false, white = false, plain = false }: { lightBg?: boolean; white?: boolean; plain?: boolean }) {
  void lightBg;
  return (
    <svg viewBox="0 0 24 24" className="w-3.5 h-3.5 shrink-0" aria-hidden>
      <path
        fill={white || plain ? 'currentColor' : '#ffffff'}
        d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0 0 24 12c0-6.63-5.37-12-12-12Z"
      />
    </svg>
  );
}

export function GitLabChipIcon({ white = false }: { white?: boolean }) {
  return (
    <svg viewBox="0 0 24 24" className="w-3.5 h-3.5 shrink-0" aria-hidden>
      <path
        fill={white ? 'currentColor' : '#FC6D26'}
        d="m23.6 9.6-.8-2.4a1.2 1.2 0 0 0-1.1-.8h-3.4L16.2 2a1.2 1.2 0 0 0-2.2 0l-2.1 4.4H8.5a1.2 1.2 0 0 0-1.1.8L6.6 9.6a1.2 1.2 0 0 0 .4 1.4l2.7 2-1 3.1a1.2 1.2 0 0 0 1.8 1.3l2.8-2 2.8 2a1.2 1.2 0 0 0 1.8-1.3l-1-3.1 2.7-2a1.2 1.2 0 0 0 .4-1.4Z"
      />
    </svg>
  );
}

export function VercelChipIcon({ white = false }: { white?: boolean }) {
  return (
    <svg viewBox="0 0 76 65" className="w-3.5 h-3.5 shrink-0" aria-hidden>
      <path fill={white ? '#ffffff' : 'currentColor'} d="M37.5274 0L75.0548 65H0L37.5274 0Z" />
    </svg>
  );
}

export function ChatBarBrandChip({
  variant,
  label,
  onClick,
  plain = false,
  darkUi = false,
  connected = false,
}: {
  variant: 'github' | 'gitlab' | 'vercel';
  label: string;
  onClick: () => void;
  plain?: boolean;
  darkUi?: boolean;
  connected?: boolean;
}) {
  const icons = {
    github: <GitHubChipIcon lightBg={!plain} white={plain && darkUi} plain={plain} />,
    gitlab: <GitLabChipIcon white={plain} />,
    vercel: <VercelChipIcon white={plain ? darkUi : true} />,
  };
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'xv-brand-chip',
        plain && 'xv-brand-chip--plain',
        darkUi && 'xv-brand-chip--dark-ui',
        `xv-brand-chip--${variant}`
      )}
      aria-label={label}
      title={label}
    >
      {connected ? <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 absolute -top-0.5 -right-0.5" /> : null}
      {icons[variant]}
    </button>
  );
}

export function TwitterChipIcon() {
  return (
    <svg viewBox="0 0 24 24" className="w-3.5 h-3.5 shrink-0" aria-hidden>
      <path fill="currentColor" d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
    </svg>
  );
}
