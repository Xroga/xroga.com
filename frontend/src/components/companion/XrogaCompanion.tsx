'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Mic, MicOff, Settings2, Sparkles, Volume2, VolumeX, X } from 'lucide-react';
import { usePathname, useRouter } from 'next/navigation';
import { CompanionRenderer } from './CompanionRenderer';
import { companionEnergy, dispatchCompanionEvent, safeCompanionSpeech } from '@/lib/companion';
import { useCompanionStore } from '@/store/useCompanionStore';
import { cn } from '@/lib/utils';
import { PENDING_PROMPT_KEY } from '@/lib/constants';

interface BrowserSpeechRecognitionEvent {
  results: ArrayLike<{ 0: { transcript: string } }>;
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
type BrowserSpeechRecognitionConstructor = new () => BrowserSpeechRecognition;

function speechRecognition(): BrowserSpeechRecognitionConstructor | null {
  if (typeof window === 'undefined') return null;
  const speechWindow = window as typeof window & {
    SpeechRecognition?: BrowserSpeechRecognitionConstructor;
    webkitSpeechRecognition?: BrowserSpeechRecognitionConstructor;
  };
  return speechWindow.SpeechRecognition ?? speechWindow.webkitSpeechRecognition ?? null;
}

export interface XrogaCompanionProps {
  variant?: 'hero' | 'composer' | 'floating' | 'preview';
  className?: string;
  interactive?: boolean;
}

export function XrogaCompanion({ variant = 'floating', className, interactive = true }: XrogaCompanionProps) {
  const router = useRouter();
  const pathname = usePathname();
  const recognitionRef = useRef<BrowserSpeechRecognition | null>(null);
  const [voiceListening, setVoiceListening] = useState(false);
  const [intro, setIntro] = useState(false);
  const [askText, setAskText] = useState('');
  const state = useCompanionStore();
  const energy = useMemo(() => companionEnergy(state), [state]);
  const operation = energy === 'low' && state.operation === 'idle' ? 'low_energy' : state.operation;
  const status = energy === 'low' && state.operation === 'idle'
    ? 'A weekly code-energy recharge is available. Core work is never blocked.'
    : state.statusMessage;
  const availableSpeech = typeof window !== 'undefined' && !!speechRecognition();

  useEffect(() => {
    const key = 'xroga-companion-intro';
    if (sessionStorage.getItem(key)) return;
    sessionStorage.setItem(key, '1');
    setIntro(true);
    useCompanionStore.getState().applyRuntimeEvent({
      type: 'online',
      operation: 'greeting',
      message: 'Welcome. I follow Xroga’s real work and hand your questions to the real Workspace.',
      source: 'deterministic',
    });
    const timer = window.setTimeout(() => setIntro(false), 1_050);
    return () => window.clearTimeout(timer);
  }, []);

  if (!state.visible && variant !== 'preview') return null;

  function focusRealComposer(text?: string) {
    const prompt = text?.trim();
    if (pathname === '/' || pathname === '/workspace') {
      window.dispatchEvent(new CustomEvent('xroga:companion-ask', { detail: { text: prompt ?? '' } }));
    } else {
      if (prompt) localStorage.setItem(PENDING_PROMPT_KEY, prompt);
      router.push('/workspace');
    }
    state.setPanelOpen(false);
  }

  function speakStatus() {
    if (!state.voiceEnabled || typeof window.speechSynthesis === 'undefined') return;
    const speech = safeCompanionSpeech(status);
    if (!speech) return;
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(new SpeechSynthesisUtterance(speech));
  }

  function toggleListening() {
    if (voiceListening) {
      recognitionRef.current?.stop();
      return;
    }
    const Recognition = speechRecognition();
    if (!Recognition) return;
    const recognition = new Recognition();
    recognition.lang = document.documentElement.lang || 'en-US';
    recognition.interimResults = false;
    recognition.continuous = false;
    recognition.onresult = (event) => {
      const text = event.results[0]?.[0]?.transcript?.trim();
      if (text) {
        setAskText(text);
        window.dispatchEvent(new CustomEvent('xroga:companion-ask', { detail: { text } }));
      }
    };
    recognition.onerror = () => {
      setVoiceListening(false);
      dispatchCompanionEvent({ type: 'task_warning', message: 'Voice input was unavailable or permission was denied.', source: 'runtime' });
    };
    recognition.onend = () => setVoiceListening(false);
    recognitionRef.current = recognition;
    setVoiceListening(true);
    dispatchCompanionEvent({ type: 'voice_listening', source: 'runtime' });
    recognition.start();
  }

  return (
    <div
      className={cn('xv-companion', `xv-companion--${variant}`, intro && 'is-intro', className)}
      data-testid={`xroga-companion-${variant}`}
      data-operation={operation}
      data-mood={state.mood}
      data-energy={energy}
    >
      <button
        type="button"
        className="xv-companion-trigger"
        aria-label={`Open ${state.name}, your Xroga companion`}
        aria-expanded={state.panelOpen}
        onClick={() => interactive && state.setPanelOpen(!state.panelOpen)}
        disabled={!interactive}
      >
        <CompanionRenderer
          mood={state.mood}
          operation={operation}
          costume={state.costume}
          accent={state.accent}
          crownEnabled={state.crownEnabled}
          mantleEnabled={state.mantleEnabled}
        />
        {variant !== 'hero' && variant !== 'preview' ? (
          <span className="xv-companion-operation-dot" aria-hidden />
        ) : null}
      </button>

      {interactive && state.panelOpen ? (
        <section className="xv-companion-panel" aria-label={`${state.name} companion panel`}>
          <div className="xv-companion-panel-head">
            <div>
              <p className="xv-companion-eyebrow">XROGA COMPANION</p>
              <h2>{state.name}</h2>
            </div>
            <button type="button" onClick={() => state.setPanelOpen(false)} aria-label="Close companion panel">
              <X className="h-4 w-4" />
            </button>
          </div>
          <p className="xv-companion-greeting">
            {state.accountName ? `Here with you, ${state.accountName}.` : 'Here when you need Xroga.'}
          </p>
          <p className="xv-companion-context-note">
            {state.accountName
              ? 'Questions continue through your authenticated Xroga account and current Workspace context.'
              : 'Public questions continue through the real Xroga signup and Workspace flow.'}
          </p>
          <div className="xv-companion-live-status" data-source={state.eventSource}>
            <span className="xv-companion-live-pulse" aria-hidden />
            <div>
              <strong>{operation.replaceAll('_', ' ')}</strong>
              <p>{status}</p>
              <small>{state.eventSource === 'ai' ? 'From a real Xroga AI response' : state.eventSource === 'runtime' ? 'From a real workspace event' : 'Deterministic companion status'}</small>
            </div>
          </div>

          <form
            className="xv-companion-ask"
            onSubmit={(event) => {
              event.preventDefault();
              focusRealComposer(askText);
            }}
          >
            <label htmlFor={`companion-ask-${variant}`}>Ask through Xroga workspace</label>
            <div>
              <input
                id={`companion-ask-${variant}`}
                value={askText}
                onChange={(event) => setAskText(event.target.value)}
                placeholder="What should we build or change?"
              />
              <button type="submit" aria-label="Move question to Xroga workspace">
                <Sparkles className="h-4 w-4" />
              </button>
            </div>
          </form>

          <div className="xv-companion-panel-actions">
            <button
              type="button"
              aria-pressed={state.voiceEnabled}
              onClick={() => state.updatePreferences({ voiceEnabled: !state.voiceEnabled })}
            >
              {state.voiceEnabled ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
              {state.voiceEnabled ? 'Voice on' : 'Enable voice'}
            </button>
            {state.voiceEnabled ? (
              <button type="button" onClick={speakStatus}>
                <Volume2 className="h-4 w-4" /> Speak status
              </button>
            ) : null}
            <button type="button" disabled={!availableSpeech} aria-pressed={voiceListening} onClick={toggleListening}>
              {voiceListening ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
              {availableSpeech ? (voiceListening ? 'Stop listening' : 'Voice input') : 'Voice unavailable'}
            </button>
          </div>

          <div className="xv-companion-panel-foot">
            <span>Energy: {energy}</span>
            {state.careEnabled && !state.reducedGamification ? (
              <button type="button" onClick={state.feed}>Recharge with code</button>
            ) : null}
            <button
              type="button"
              onClick={() => {
                state.setPanelOpen(false);
                router.push('/settings?tab=companion');
              }}
            >
              <Settings2 className="h-3.5 w-3.5" /> Customize
            </button>
          </div>
        </section>
      ) : null}
    </div>
  );
}
