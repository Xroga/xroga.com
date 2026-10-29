'use client';

import { Square, X } from 'lucide-react';
import { createPortal } from 'react-dom';
import { useCallback, useEffect, useRef, useState } from 'react';
import { transcribeVoiceLocally } from '@/lib/voiceLocal';
import { AudioLinesIcon, type AudioLinesIconHandle } from '../icons/animated/AudioLinesIcon';
import { captureVoiceRecording } from '@/lib/terminal/voiceRecording';

interface CaptureSession { abort: AbortController; stream?: MediaStream; stop?: () => void }

type Mode = 'idle' | 'requesting_permission' | 'listening' | 'finalizing';

/** Dictation only. Submission belongs exclusively to the composer's Send action. */
export function XrogaVoiceControl({ onVoiceDraft, disabled = false }: {
  onVoiceDraft: (transcript: string) => void;
  disabled?: boolean;
}) {
  const [mode, setMode] = useState<Mode>('idle');
  const [error, setError] = useState('');
  const [progress, setProgress] = useState<'loading' | 'transcribing'>('loading');
  const [stage, setStage] = useState<HTMLElement | null>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const meterRef = useRef<AudioLinesIconHandle>(null);
  const session = useRef<CaptureSession | null>(null);
  const publish = useRef(onVoiceDraft);
  publish.current = onVoiceDraft;
  const cancel = useCallback(() => {
    const current = session.current;
    session.current = null;
    current?.abort.abort();
    current?.stop?.();
    current?.stream?.getTracks().forEach(track => track.stop());
    setMode('idle');
  }, []);
  useEffect(() => {
    const composer = trigger.current?.closest('form') ?? trigger.current?.parentElement;
    setStage(composer?.querySelector<HTMLElement>('[data-xroga-voice-stage]') ?? null);
    const hide = () => { if (document.hidden) cancel(); };
    document.addEventListener('visibilitychange', hide);
    window.addEventListener('pagehide', cancel);
    return () => {
      document.removeEventListener('visibilitychange', hide);
      window.removeEventListener('pagehide', cancel);
      cancel();
    };
  }, [cancel]);
  useEffect(() => { if (disabled) cancel(); }, [disabled, cancel]);
  useEffect(() => {
    if (mode === 'listening') meterRef.current?.startAnimation();
    else meterRef.current?.stopAnimation();
  }, [mode]);

  const start = async () => {
    if (session.current || disabled) return;
    setError('');
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      setError('This browser cannot record audio securely. Please type your message or use a supported browser.');
      return;
    }
    const current: CaptureSession = { abort: new AbortController() };
    session.current = current;
    setMode('requesting_permission');
    try {
      // Capture is requested directly from the click. Never reopen automatically.
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, channelCount: 1 } });
      if (session.current !== current) { stream.getTracks().forEach(track => track.stop()); return; }
      current.stream = stream;
      const recording = captureVoiceRecording(stream, current.abort.signal);
      current.stop = recording.stop;
      const started = await recording.ready;
      if (started && session.current === current) setMode('listening');
      const audio = await recording.audio;
      if (session.current !== current) return;
      setMode('finalizing');
      setProgress('loading');
      const transcript = await transcribeVoiceLocally(audio, current.abort.signal, value => {
        if (session.current === current) setProgress(value);
      });
      if (session.current !== current || current.abort.signal.aborted) return;
      publish.current(transcript);
    } catch (failure) {
      if (session.current !== current || current.abort.signal.aborted) return;
      const name = failure instanceof Error ? failure.name : '';
      setError(name === 'NotAllowedError' ? 'Microphone permission was denied. Allow access in your browser or type your message.'
        : name === 'NotFoundError' ? 'No microphone was found. Connect one or type your message.'
        : name === 'RecordingLimitError' ? 'Recording exceeded this device’s audio size limit. Please record a shorter message.'
        : name === 'RecordingInterruptedError' ? 'Recording was interrupted. Please record again. Your typed text is unchanged.'
        : 'Speech recognition could not finish on this device. Try a shorter recording or type your message. Your typed text is unchanged.');
    } finally {
      current.stream?.getTracks().forEach(track => track.stop());
      if (session.current === current) { session.current = null; setMode('idle'); }
    }
  };
  const listening = mode === 'listening';
  const feedback = (mode !== 'idle' || error) ? (<div className="xv-voice-v8-session" data-testid="xroga-voice-session">
      <div className="xv-voice-v8-primary">
        {mode !== 'idle' ? <button type="button" className="xv-voice-v8-control" aria-label="Cancel voice typing" onClick={cancel}><X className="h-4 w-4" aria-hidden /></button> : null}
        <span role="status" className="xv-voice-v8-status">{listening ? 'Listening. Click Stop when finished.' : mode === 'finalizing' ? (progress === 'loading' ? 'Loading the on-device voice model. First use can take a few minutes.' : 'Transcribing on your device...') : mode === 'requesting_permission' ? 'Waiting for microphone permission' : 'Voice input unavailable'}</span>
        {listening ? <button type="button" className="xv-voice-v8-control" aria-label="Stop recording" onClick={() => session.current?.stop?.()}><Square className="h-4 w-4" aria-hidden /></button> : null}
      </div>
      {error ? <p role="alert" className="xv-voice-v8-error">{error}</p> : <p className="xv-voice-v8-hint">Audio stays on your device. First use downloads about 250 MB. Up to 30 minutes per recording. Review the text, then press Send.</p>}
    </div>) : null;
  return <>
    <button ref={trigger} type="button" className={`xv-voice-icon-only xv-mic-btn${listening ? ' is-listening' : ''}`}
      disabled={disabled || mode === 'requesting_permission' || mode === 'finalizing'}
      aria-label={listening ? 'Stop voice typing and keep text' : 'Start voice typing'}
      onClick={() => listening ? session.current?.stop?.() : void start()}>
      <AudioLinesIcon ref={meterRef} loop size={22} />
    </button>
    {feedback && (stage ? createPortal(feedback, stage) : feedback)}
  </>;
}
