'use client';

import { Square, X } from 'lucide-react';
import { createPortal } from 'react-dom';
import { useCallback, useEffect, useRef, useState } from 'react';
import { transcribeVoiceLocally } from '@/lib/voiceLocal';
import { createVoiceEngine, type VoiceEngine } from '@/lib/voiceEngine';
import {
  DICTATION_ERROR_MESSAGES,
  DictationController,
  dictationLanguage,
  getDictationConstructor,
  type DictationConstructor,
} from '@/lib/terminal/dictation';
import { AudioLinesIcon, type AudioLinesIconHandle } from '../icons/animated/AudioLinesIcon';
import { captureVoiceRecording } from '@/lib/terminal/voiceRecording';

interface CaptureSession { abort: AbortController; stream?: MediaStream; stop?: () => void; audio?: Blob }

type Mode = 'idle' | 'requesting_permission' | 'listening' | 'finalizing';
type SpeechWindow = { SpeechRecognition?: DictationConstructor; webkitSpeechRecognition?: DictationConstructor };

/**
 * Local Whisper (recorded audio, transcribed on this device) is the accurate
 * path for Hindi/English and other languages. It needs a worker, WebAssembly,
 * OfflineAudioContext and enough memory for the model; when the browser or
 * device cannot provide that, the browser's own speech recognition is used
 * instead so the mic still works.
 */
function localWhisperSupported(): boolean {
  if (typeof Worker === 'undefined' || typeof WebAssembly === 'undefined' || typeof OfflineAudioContext === 'undefined' || typeof MediaRecorder === 'undefined') return false;
  const memory = (navigator as Navigator & { deviceMemory?: number }).deviceMemory;
  return !(typeof memory === 'number' && memory < 2);
}

/** Dictation only. Submission belongs exclusively to the composer's Send action. */
export function XrogaVoiceControl({ onVoiceDraft, disabled = false }: {
  onVoiceDraft: (transcript: string) => void;
  disabled?: boolean;
}) {
  const [mode, setMode] = useState<Mode>('idle');
  const activeMode=useRef<Mode>(mode);activeMode.current=mode;
  const [error, setError] = useState('');
  const [progress, setProgress] = useState<'loading' | 'transcribing'>('loading');
  const [percent,setPercent]=useState<number | undefined>();
  const [retryable,setRetryable]=useState(false);
  const [stage, setStage] = useState<HTMLElement | null>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const meterRef = useRef<AudioLinesIconHandle>(null);
  const session = useRef<CaptureSession | null>(null);
  const speech = useRef<DictationController | null>(null);
  const [heard, setHeard] = useState('');
  const inference = useRef<VoiceEngine | null>(null);
  const retainedAudio = useRef<Blob | null>(null);
  const retryExpiry=useRef<ReturnType<typeof setTimeout> | undefined>();
  const publish = useRef(onVoiceDraft);
  publish.current = onVoiceDraft;
  const cancel = useCallback(() => {
    const current = session.current;
    session.current = null;
    current?.abort.abort();
    current?.stop?.();
    current?.stream?.getTracks().forEach(track => track.stop());
    speech.current?.abort();speech.current=null;setHeard('');
    inference.current?.dispose();inference.current=null;
    clearTimeout(retryExpiry.current);
    retainedAudio.current=null;setRetryable(false);setError('');
    setMode('idle');
  }, []);
  useEffect(() => {
    const composer = trigger.current?.closest('form') ?? trigger.current?.parentElement;
    setStage(composer?.querySelector<HTMLElement>('[data-xroga-voice-stage]') ?? null);
    // Stop hidden capture, but let an already stopped recording finish locally.
    // Account/chat changes and navigation still dispose the complete context.
    const hide = () => { if (document.hidden && activeMode.current!=='finalizing') cancel(); };
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

  const getInference=()=>inference.current??(inference.current=createVoiceEngine());
  const stop = () => {
    if (speech.current) { speech.current.stop(); return; }
    if (!session.current?.stop) return;
    // Fence visibility changes immediately, before React renders the stopped
    // state or MediaRecorder delivers its final chunk.
    activeMode.current = 'finalizing';
    setMode('finalizing');
    session.current.stop();
  };
  const run = async (current:CaptureSession,audioToRetry?:Blob) => {
    try {
      const onProgress=(value:'loading'|'transcribing',valuePercent?:number)=>{
        if(session.current===current){setProgress(value);setPercent(valuePercent);}
      };
      let recording:ReturnType<typeof captureVoiceRecording> | undefined;
      if(!audioToRetry) {
        // Start capture immediately from the gesture, independently of model setup.
        const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, channelCount: 1 } });
        if (session.current !== current) { stream.getTracks().forEach(track => track.stop()); return; }
        current.stream = stream;
        recording = captureVoiceRecording(stream, current.abort.signal);
        current.stop = recording.stop;
        const started = await recording.ready;
        if(session.current!==current || current.abort.signal.aborted)return;
        if(!started){await recording.audio;return;}
        setMode('listening');
      }
      const engine=getInference();
      // Handle rejection now, while the user may still be speaking. A failed
      // warmup is surfaced after Stop, never retried indefinitely in the background.
      const preparation=engine.prepare(current.abort.signal,onProgress).then(()=>null,error=>error);
      const audio = audioToRetry??await recording!.audio;
      if (session.current !== current) return;
      current.audio=audio;retainedAudio.current=audio;
      setMode('finalizing');
      const preparationError=await preparation;
      if(preparationError)throw preparationError;
      const transcript = await transcribeVoiceLocally(audio, current.abort.signal,onProgress,engine.recognize);
      if (session.current !== current || current.abort.signal.aborted) return;
      retainedAudio.current=null;setRetryable(false);
      clearTimeout(retryExpiry.current);
      publish.current(transcript);
    } catch (failure) {
      if (session.current !== current || current.abort.signal.aborted) return;
      const name = failure instanceof Error ? failure.name : '';
      const canRetry=!!current.audio && name!=='VoiceSilenceError';
      setRetryable(canRetry);if(!canRetry)retainedAudio.current=null;
      clearTimeout(retryExpiry.current);
      if(canRetry)retryExpiry.current=setTimeout(()=>{retainedAudio.current=null;setRetryable(false);setError('This recording expired. Please record again.');},300000);
      setError(name === 'NotAllowedError' ? 'Allow microphone access in your browser to start recording.'
        : name === 'NotFoundError' ? 'No microphone was found. Connect one and try again.'
        : name === 'RecordingLimitError' ? 'This recording is too large for this device. Record a shorter message.'
        : name === 'RecordingInterruptedError' ? 'Recording was interrupted. Please record again.'
        : name === 'VoiceDownloadError' ? 'Voice setup was interrupted. Your recording is still here. Retry when your connection is ready.'
        : name === 'VoiceSilenceError' ? 'No speech was heard. Check your microphone and record again.'
        : (failure as {status?: number})?.status === 401 ? 'Please sign in to use voice input. Your typed text is unchanged.'
        : 'This recording could not be transcribed. Retry or record again. Your typed text is unchanged.');
    } finally {
      current.stream?.getTracks().forEach(track => track.stop());
      if (session.current === current) { session.current = null; setMode('idle');inference.current?.idle(); }
    }
  };
  const startSpeechFallback = (Recognition: DictationConstructor) => {
    clearTimeout(retryExpiry.current);retainedAudio.current=null;setRetryable(false);setError('');setHeard('');
    const controller=new DictationController({
      Recognition,
      lang: dictationLanguage(navigator.languages, navigator.language),
      onState: state => {
        if(speech.current!==controller)return;
        setMode(state==='idle' ? 'idle' : state==='requesting' ? 'requesting_permission' : state==='listening' ? 'listening' : 'finalizing');
        setProgress('transcribing');
      },
      onSpoken: (snapshot, done) => {
        if(speech.current!==controller)return;
        if(!done){setHeard([snapshot.final,snapshot.interim].filter(Boolean).join(' '));return;}
        setHeard('');
        if(snapshot.final.trim())publish.current(snapshot.final);
      },
      onError: code => {if(speech.current===controller)setError(DICTATION_ERROR_MESSAGES[code]);},
    });
    speech.current=controller;
    controller.start();
  };
  const start = async () => {
    if(session.current || speech.current || disabled)return;
    const Recognition=getDictationConstructor(window as unknown as SpeechWindow);
    if(!localWhisperSupported() && Recognition){startSpeechFallback(Recognition);return;}
    if(!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder==='undefined'){
      setError('This browser cannot record audio. Try Chrome, Edge or Safari, or type instead.');return;
    }
    clearTimeout(retryExpiry.current);retainedAudio.current=null;setRetryable(false);setError('');setPercent(undefined);setProgress('loading');
    const current:CaptureSession={abort:new AbortController()};session.current=current;setMode('requesting_permission');
    return run(current);
  };
  const retry=async()=>{
    if(session.current || disabled || !retainedAudio.current)return;
    const audio=retainedAudio.current;
    clearTimeout(retryExpiry.current);
    const current:CaptureSession={abort:new AbortController()};session.current=current;
    setError('');setRetryable(false);setProgress('loading');setPercent(undefined);setMode('finalizing');
    return run(current,audio);
  };
  const listening = mode === 'listening';
  const feedback = (mode !== 'idle' || error) ? (<div className="xv-voice-v8-session" data-testid="xroga-voice-session">
      <div className="xv-voice-v8-primary">
        {mode !== 'idle' ? <button type="button" className="xv-voice-v8-control" aria-label="Cancel voice typing" onClick={cancel}><X className="h-4 w-4" aria-hidden /></button> : null}
        <span role="status" className="xv-voice-v8-status">{listening ? (heard ? `Listening… ${heard}` : 'Listening…') : mode === 'finalizing' ? (progress === 'loading' ? `Preparing voice input${percent===undefined?'…':` · ${percent}%`}` : 'Transcribing…') : mode === 'requesting_permission' ? 'Allow microphone access' : 'Voice input'}</span>
        {listening ? <button type="button" className="xv-voice-v8-control" aria-label="Stop recording" onClick={stop}><Square className="h-4 w-4" aria-hidden /></button> : null}
      </div>
      {error ? <p role="alert" className="xv-voice-v8-error">{error}</p> : null}
      {retryable && mode==='idle' ? <div className="xv-voice-v8-primary"><button type="button" className="xv-voice-v8-control xv-voice-v8-action" aria-label="Retry transcription" onClick={()=>void retry()}>Retry</button><button type="button" className="xv-voice-v8-control xv-voice-v8-action" aria-label="Discard voice recording" onClick={cancel}>Discard</button></div> : null}
    </div>) : null;
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
