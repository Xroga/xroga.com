'use client';

/**
 * Speech-to-text for the composer.
 *
 * Uses the browser's own SpeechRecognition — no audio leaves the device and no
 * provider key is involved. The button hides itself entirely when the browser has no
 * support, rather than offering a control that cannot work.
 *
 * Recognised text is appended to the existing draft rather than replacing it, so
 * dictating after typing does not destroy what the user already wrote.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { AnimatedIcon } from '@/components/icons/animated/AnimatedIcon';
import { MicIcon } from '@/components/icons/animated/MicIcon';
import { cn } from '@/lib/utils';

interface BrowserSpeechRecognitionEvent {
  resultIndex: number;
  results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }>;
}

interface BrowserSpeechRecognition {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  onresult: ((event: BrowserSpeechRecognitionEvent) => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
}

type RecognitionConstructor = new () => BrowserSpeechRecognition;

function recognitionCtor(): RecognitionConstructor | null {
  if (typeof window === 'undefined') return null;
  const w = window as typeof window & {
    SpeechRecognition?: RecognitionConstructor;
    webkitSpeechRecognition?: RecognitionConstructor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export function ChatBarMicButton({
  onTranscript,
  disabled = false,
  className,
}: {
  /** Called with each finalised phrase, to append to the composer draft. */
  onTranscript: (text: string) => void;
  disabled?: boolean;
  className?: string;
}) {
  const [supported, setSupported] = useState(false);
  const [listening, setListening] = useState(false);
  const [error, setError] = useState(false);
  const recognitionRef = useRef<BrowserSpeechRecognition | null>(null);

  // Support is only knowable in the browser, so decide after mount to keep the
  // server and client markup identical.
  useEffect(() => {
    setSupported(Boolean(recognitionCtor()));
    return () => recognitionRef.current?.stop();
  }, []);

  const stop = useCallback(() => {
    recognitionRef.current?.stop();
    recognitionRef.current = null;
    setListening(false);
  }, []);

  const start = useCallback(() => {
    const Ctor = recognitionCtor();
    if (!Ctor) return;
    setError(false);
    const recognition = new Ctor();
    recognition.lang = document.documentElement.lang || 'en-US';
    // Interim results drive the live animation; only final phrases are inserted.
    recognition.interimResults = true;
    recognition.continuous = true;

    recognition.onresult = (event) => {
      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        const result = event.results[i];
        if (result?.isFinal) {
          const text = result[0]?.transcript?.trim();
          if (text) onTranscript(text);
        }
      }
    };
    recognition.onerror = () => {
      setError(true);
      setListening(false);
      recognitionRef.current = null;
    };
    recognition.onend = () => {
      setListening(false);
      recognitionRef.current = null;
    };

    recognitionRef.current = recognition;
    setListening(true);
    recognition.start();
  }, [onTranscript]);

  // Nothing to offer when the browser cannot do it.
  if (!supported) return null;

  return (
    <button
      type="button"
      onClick={() => (listening ? stop() : start())}
      disabled={disabled}
      aria-pressed={listening}
      aria-label={listening ? 'Stop dictation' : 'Dictate your prompt'}
      title={error ? 'Dictation was unavailable or permission was denied' : listening ? 'Stop dictation' : 'Dictate'}
      className={cn('xv-mic-btn', listening && 'is-listening', error && 'is-error', className)}
    >
      {/* Three bars that animate only while actually listening, so the state is
          legible without relying on colour alone. */}
      <span className="xv-mic-wave" aria-hidden="true">
        <i />
        <i />
        <i />
      </span>
      <AnimatedIcon icon={MicIcon} size={14} className="xv-mic-icon" />
      <span className="sr-only" role="status">
        {listening ? 'Listening' : error ? 'Dictation unavailable' : 'Dictation idle'}
      </span>
    </button>
  );
}
