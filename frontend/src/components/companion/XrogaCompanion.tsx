'use client';

/**
 * Smoky, the Xroga companion.
 *
 * Decorative company, nothing more. Smoky previously opened a control panel on click
 * and read assistant responses aloud through speech synthesis; both were intrusive
 * over a work surface, so the panel and the voice are gone. What remains is the
 * character reacting to real operation state.
 *
 * Companion preferences (skin, accent, size, dock, visibility) live in
 * Settings → Companion. Mic dictation belongs to the composer, not here.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { CompanionRenderer } from './CompanionRenderer';
import { companionEnergy } from '@/lib/companion';
import { useCompanionStore } from '@/store/useCompanionStore';
import { cn } from '@/lib/utils';

export interface XrogaCompanionProps {
  variant?: 'hero' | 'composer' | 'floating' | 'preview';
  className?: string;
}

export function XrogaCompanion({ variant = 'floating', className }: XrogaCompanionProps) {
  const introShown = useRef(false);
  const [intro, setIntro] = useState(false);
  const state = useCompanionStore();
  const energy = useMemo(() => companionEnergy(state), [state]);
  const operation = energy === 'low' && state.operation === 'idle' ? 'low_energy' : state.operation;

  // A one-per-session entrance, so Smoky does not re-animate on every navigation.
  useEffect(() => {
    if (introShown.current) return;
    introShown.current = true;
    const key = 'xroga-companion-intro';
    if (sessionStorage.getItem(key)) return;
    sessionStorage.setItem(key, '1');
    setIntro(true);
    useCompanionStore.getState().applyRuntimeEvent({
      type: 'online',
      operation: 'greeting',
      message: 'Smoky is ready to help with real Xroga work.',
      source: 'deterministic',
    });
    const timer = window.setTimeout(() => setIntro(false), 1_050);
    return () => window.clearTimeout(timer);
  }, []);

  if (!state.visible && variant !== 'preview') return null;

  return (
    <div
      className={cn('xv-companion', `xv-companion--${variant}`, intro && 'is-intro', className)}
      data-testid={`xroga-companion-${variant}`}
      data-operation={operation}
      data-mood={state.mood}
      data-energy={energy}
    >
      <span className="xv-companion-trigger" aria-hidden="true">
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
      </span>
    </div>
  );
}
