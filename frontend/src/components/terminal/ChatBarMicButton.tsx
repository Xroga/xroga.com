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
import {
  AudioLinesIcon,
  type AudioLinesIconHandle,
} from '@/components/icons/animated/AudioLinesIcon';
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
  const meterRef = useRef<AudioLinesIconHandle>(null);

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

  /*
   * The meter runs while the recording does.
   *
   * Driven from `listening` rather than from the click, because the recording can end
   * without one: the browser stops it on silence, on an error, or when permission is
   * refused. Those all set `listening` false, and the bars have to settle with it or
   * they would go on claiming to be recording after the microphone was released.
   */
  useEffect(() => {
    if (listening) meterRef.current?.startAnimation();
    else meterRef.current?.stopAnimation();
  }, [listening]);

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
      {/* The meter is the state. It used to be hidden while listening and replaced by
          three CSS bars behind it — two drawings of the same thing, one of which was
          always wrong. The bars run for as long as the recording does and stop when
          it stops, which is what the reader is actually being told. */}
      <AudioLinesIcon ref={meterRef} loop size={16} className="xv-mic-icon" />
      <span className="sr-only" role="status">
        {listening ? 'Listening' : error ? 'Dictation unavailable' : 'Dictation idle'}
      </span>
    </button>
  );
}
