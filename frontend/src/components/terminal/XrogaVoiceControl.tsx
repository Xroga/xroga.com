'use client';

import { Square, X } from 'lucide-react';
import { createPortal } from 'react-dom';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError, getAccessToken } from '@/lib/api';
import { transcribeVoiceAudio, warmVoiceBackend } from '@/lib/voiceApi';
import { openVoiceCapture, prepareVoiceAudioContext, voiceCaptureSupported, type VoiceCapture } from '@/lib/voiceCapture';
import { createVoiceSegmenter } from '@/lib/voiceSegmenter';
import { createDictationPipeline, MAX_RECORDING_SECONDS, type DictationPipeline } from '@/lib/voiceDictation';
import {
  DICTATION_ERROR_MESSAGES,
  DictationController,
  dictationLanguage,
  getDictationConstructor,
  type DictationConstructor,
} from '@/lib/terminal/dictation';
import { AudioLinesIcon, type AudioLinesIconHandle } from '../icons/animated/AudioLinesIcon';
import { VoiceWaveform, voiceLevel, WAVE_HISTORY } from './VoiceWaveform';

interface CaptureSession {
  abort: AbortController;
  capture?: VoiceCapture;
  pipeline?: DictationPipeline;
  segmenter?: ReturnType<typeof createVoiceSegmenter>;
  stopping?: boolean;
  clickAt: number;
  recordingAt?: number;
  stoppedAt?: number;
}

type Mode = 'idle' | 'requesting_permission' | 'listening' | 'finalizing';
type SpeechWindow = { SpeechRecognition?: DictationConstructor; webkitSpeechRecognition?: DictationConstructor };

/**
 * Recorded speech is sent in short segments to Xroga's authenticated voice API,
 * which transcribes it with Cloudflare Workers AI Whisper. When the browser
 * cannot capture raw audio, or NEXT_PUBLIC_VOICE_ENGINE=browser, the browser's
 * own speech recognition is used instead so the mic still works.
 */
const preferBrowserSpeech = process.env.NEXT_PUBLIC_VOICE_ENGINE === 'browser';
const cloudSupported = () => !preferBrowserSpeech && voiceCaptureSupported();
const RETRY_WINDOW_MS = 300000;

function describeFailure(failure: unknown): string {
  const name = failure instanceof Error ? failure.name : '';
  const status = (failure as { status?: number } | null)?.status;
  const code = (failure as { data?: { code?: unknown } } | null)?.data?.code;
  if (name === 'NotAllowedError' || name === 'SecurityError') return 'Allow microphone access in your browser to start recording.';
  if (name === 'NotFoundError') return 'No microphone was found. Connect one and try again.';
  if (name === 'NotReadableError') return 'The microphone is busy or unavailable. Close other apps using it and try again.';
  if (status === 401 || code === 'VOICE_SESSION_CHANGED') return 'Please sign in again to use voice input. Your typed text is unchanged.';
  if (status === 429 && failure instanceof Error) return failure.message;
  if (failure instanceof TypeError) return 'Connection lost. Your recording is kept for a few minutes; retry when you are back online.';
  return 'Part of this recording could not be transcribed. Retry or record again. Your typed text is unchanged.';
}

/** Dictation only. Submission belongs exclusively to the composer's Send action. */
export function XrogaVoiceControl({ onVoiceDraft, disabled = false }: {
  onVoiceDraft: (transcript: string) => void;
  disabled?: boolean;
}) {
  const [mode, setMode] = useState<Mode>('idle');
  const activeMode = useRef<Mode>(mode); activeMode.current = mode;
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [retryable, setRetryable] = useState(false);
  const [stage, setStage] = useState<HTMLElement | null>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const meterRef = useRef<AudioLinesIconHandle>(null);
  const session = useRef<CaptureSession | null>(null);
  const kept = useRef<CaptureSession | null>(null);
  const speech = useRef<DictationController | null>(null);
  const [heard, setHeard] = useState('');
  const retryExpiry = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const levels = useRef<number[]>([]);
  const publish = useRef((text: string) => onVoiceDraft(text));
  publish.current = (text: string) => {
    onVoiceDraft(text);
    // Hand the finished text back to the original editor, cursor at the end, ready to edit.
    const root = trigger.current?.closest('form') ?? trigger.current?.parentElement;
    window.setTimeout(() => {
      const editor = root?.querySelector<HTMLTextAreaElement>('textarea');
      if (!editor) return;
      editor.focus();
      editor.setSelectionRange(editor.value.length, editor.value.length);
    }, 60);
  };

  const release = useCallback((target: CaptureSession | null) => {
    if (!target) return;
    target.abort.abort();
    target.capture?.stop();
    target.pipeline?.dispose();
  }, []);
  const cancel = useCallback(() => {
    const current = session.current, retained = kept.current;
    session.current = null; kept.current = null;
    release(current); release(retained);
    speech.current?.abort(); speech.current = null; setHeard('');
    clearTimeout(retryExpiry.current);
    setRetryable(false); setError(''); setNotice('');
    levels.current = [];
    setMode('idle');
  }, [release]);

  const settle = useCallback(async (current: CaptureSession) => {
    try {
      await current.pipeline?.settle();
      if (session.current !== current || current.abort.signal.aborted) return;
      const result = current.pipeline?.result();
      if (!result) { setError('Recording was interrupted. Please record again.'); release(current); return; }
      if (!result.complete) {
        // Keep the unsent audio for a user-initiated retry; never publish a partial transcript.
        // A signed-out or switched account can never resume this audio, so it is dropped.
        const accountLost = (result.error as { status?: number } | null)?.status === 401
          || (result.error as { data?: { code?: unknown } } | null)?.data?.code === 'VOICE_SESSION_CHANGED';
        setError(describeFailure(result.error));
        if (accountLost) { release(current); return; }
        kept.current = current; setRetryable(true);
        clearTimeout(retryExpiry.current);
        retryExpiry.current = setTimeout(() => {
          if (kept.current === current) { kept.current = null; release(current); setRetryable(false); setError('This recording expired. Please record again.'); }
        }, RETRY_WINDOW_MS);
        return;
      }
      if (!result.text) { setError('No speech was heard. Check your microphone and record again.'); release(current); return; }
      const stoppedAt = current.stoppedAt ?? performance.now();
      window.dispatchEvent(new CustomEvent('xroga:voice-metrics', { detail: {
        clickToRecordingMs: Math.round((current.recordingAt ?? stoppedAt) - current.clickAt),
        stopToTextMs: Math.round(performance.now() - stoppedAt),
        recordedSeconds: Math.round(current.segmenter?.seconds ?? 0),
        segmentMs: result.segmentMs.map(Math.round),
      } }));
      release(current);
      publish.current(result.text);
    } catch (failure) {
      if (session.current !== current || current.abort.signal.aborted) return;
      setError(describeFailure(failure)); release(current);
    } finally {
      if (session.current === current) { session.current = null; setMode('idle'); }
    }
  }, [release]);

  const finish = useCallback((current: CaptureSession, message = '') => {
    if (session.current !== current || current.stopping) return;
    current.stopping = true;
    // Fence visibility changes immediately, before React renders the stopped state.
    activeMode.current = 'finalizing';
    setMode('finalizing'); setNotice(message);
    current.stoppedAt = performance.now();
    current.capture?.stop();
    current.segmenter?.flush();
    void settle(current);
  }, [settle]);

  useEffect(() => {
    const composer = trigger.current?.closest('form') ?? trigger.current?.parentElement;
    setStage(composer?.querySelector<HTMLElement>('[data-xroga-voice-stage]') ?? null);
    // A hidden page can lose its microphone. Keep what was said and transcribe it.
    const hide = () => {
      const current = session.current;
      if (document.hidden && current && activeMode.current === 'listening') finish(current, 'Recording stopped because the page was hidden. Transcribing what was captured.');
    };
    document.addEventListener('visibilitychange', hide);
    window.addEventListener('pagehide', cancel);
    return () => {
      document.removeEventListener('visibilitychange', hide);
      window.removeEventListener('pagehide', cancel);
      cancel();
    };
  }, [cancel, finish]);
  useEffect(() => { if (disabled) cancel(); }, [disabled, cancel]);
  useEffect(() => {
    if (mode === 'listening') meterRef.current?.startAnimation();
    else meterRef.current?.stopAnimation();
  }, [mode]);

  const stop = () => {
    if (speech.current) { speech.current.stop(); return; }
    if (session.current) finish(session.current);
  };
  const startSpeechFallback = (Recognition: DictationConstructor) => {
    clearTimeout(retryExpiry.current); setRetryable(false); setError(''); setNotice(''); setHeard('');
    const controller = new DictationController({
      Recognition,
      lang: dictationLanguage(navigator.languages, navigator.language),
      onState: state => {
        if (speech.current !== controller) return;
        setMode(state === 'idle' ? 'idle' : state === 'requesting' ? 'requesting_permission' : state === 'listening' ? 'listening' : 'finalizing');
      },
      onSpoken: (snapshot, done) => {
        if (speech.current !== controller) return;
        if (!done) { setHeard([snapshot.final, snapshot.interim].filter(Boolean).join(' ')); return; }
        setHeard('');
        if (snapshot.final.trim()) publish.current(snapshot.final);
      },
      onError: code => { if (speech.current === controller) setError(DICTATION_ERROR_MESSAGES[code]); },
    });
    speech.current = controller;
    controller.start();
  };
  const start = async () => {
    if (session.current || speech.current || disabled) return;
    const Recognition = getDictationConstructor(window as unknown as SpeechWindow);
    if (!cloudSupported()) {
      if (Recognition) { startSpeechFallback(Recognition); return; }
      setError('This browser cannot record audio. Try Chrome, Edge or Safari, or type instead.');
      return;
    }
    // iOS Safari starts an audio context only from the tap itself, so create it before the first await.
    const prepared = prepareVoiceAudioContext();
    clearTimeout(retryExpiry.current); release(kept.current); kept.current = null; setRetryable(false); setError(''); setNotice('');
    const current: CaptureSession = { abort: new AbortController(), clickAt: performance.now() };
    session.current = current;
    setMode('requesting_permission');
    try {
      const token = await getAccessToken();
      if (!token) throw new ApiError('Please sign in to use voice input.', 401);
      if (session.current !== current) { void prepared?.close().catch(() => {}); return; }
      warmVoiceBackend();
      const capture = await openVoiceCapture(
        () => finish(current, 'Recording was interrupted. Transcribing what was captured.'), current.abort.signal, prepared);
      if (session.current !== current) { capture.stop(); return; }
      current.capture = capture;
      const pipeline = createDictationPipeline({
        signal: current.abort.signal,
        transcribe: (wav, signal) => transcribeVoiceAudio(wav, signal, { freeOnly: true, preparedPcm: true, expectedToken: token }),
      });
      current.pipeline = pipeline;
      current.segmenter = createVoiceSegmenter(capture.rate, segment => {
        pipeline.add(segment);
        if (pipeline.overloaded) finish(current, 'Your connection is too slow to keep up. Recording stopped; transcribing what was captured.');
      });
      levels.current = [];
      await capture.begin(samples => {
        levels.current.push(voiceLevel(samples));
        if (levels.current.length > WAVE_HISTORY) levels.current.splice(0, levels.current.length - WAVE_HISTORY);
        current.segmenter?.push(samples);
        if ((current.segmenter?.seconds ?? 0) >= MAX_RECORDING_SECONDS) finish(current, 'Reached the 30-minute recording limit. Transcribing now.');
      });
      if (session.current !== current) return;
      current.recordingAt = performance.now();
      if (!current.stopping) setMode('listening');
    } catch (failure) {
      void prepared?.close().catch(() => {});
      if (session.current !== current || current.abort.signal.aborted) return;
      session.current = null;
      release(current);
      setError(describeFailure(failure));
      setMode('idle');
    }
  };
  const retry = async () => {
    const current = kept.current;
    if (session.current || disabled || !current) return;
    clearTimeout(retryExpiry.current);
    kept.current = null; session.current = current;
    setError(''); setNotice(''); setRetryable(false); setMode('finalizing');
    current.stoppedAt = performance.now();
    void current.pipeline?.retry();
    await settle(current);
  };

  const listening = mode === 'listening';
  const bar = mode !== 'idle' ? (<div className="xv-voice-capture-wrap">
      <div className={`xv-voice-capture-bar${mode === 'finalizing' ? ' is-transcribing' : ''}`} data-testid="xroga-voice-session">
        <button type="button" className="xv-voice-capture-button xv-voice-capture-cancel" aria-label="Cancel voice typing" onClick={cancel}><X aria-hidden /></button>
        <div className="xv-voice-capture-middle" role="status" aria-live="polite">
          {mode === 'finalizing' ? <span className="xv-voice-capture-label">{notice ? 'Finishing transcription…' : 'Transcribing…'}</span>
            : mode === 'requesting_permission' ? <span className="xv-voice-capture-label">Allow microphone access</span>
            : speech.current ? <span className="xv-voice-capture-label">{heard ? `Listening… ${heard}` : 'Listening…'}</span>
            : <VoiceWaveform levels={levels} active={listening} />}
        </div>
        <button type="button" className="xv-voice-capture-button xv-voice-capture-send" aria-label="Stop dictation" disabled={!listening} onClick={stop}><Square aria-hidden fill="currentColor" /></button>
      </div>
      {notice && mode !== 'finalizing' ? <p role="status" className="xv-voice-v8-hint">{notice}</p> : null}
    </div>) : null;
  const problem = (mode === 'idle' && error) ? (<div className="xv-voice-v8-session">
      <p role="alert" className="xv-voice-v8-error">{error}</p>
      {retryable ? <div className="xv-voice-v8-primary"><button type="button" className="xv-voice-v8-control xv-voice-v8-action" aria-label="Retry transcription" onClick={() => void retry()}>Retry</button><button type="button" className="xv-voice-v8-control xv-voice-v8-action" aria-label="Discard voice recording" onClick={cancel}>Discard</button></div> : null}
    </div>) : null;
  const feedback = bar ?? problem;
  return <>
    <button ref={trigger} type="button" className={`xv-voice-icon-only xv-mic-btn${listening ? ' is-listening' : ''}`}
      disabled={disabled || mode === 'requesting_permission' || mode === 'finalizing'}
      aria-label={listening ? 'Stop voice typing and keep text' : 'Start voice typing'}
      onClick={() => listening ? stop() : void start()}>
      <AudioLinesIcon ref={meterRef} loop size={22} />
    </button>
    {feedback && (stage ? createPortal(feedback, stage) : feedback)}
  </>;
}
