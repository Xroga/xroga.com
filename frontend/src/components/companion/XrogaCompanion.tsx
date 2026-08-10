'use client';

/**
 * Smoky, the Xroga companion.
 *
 * Smoky reacts to real operation state, and clicking opens usage.
 *
 * The voice is still gone and is not coming back — unprompted speech over a work
 * surface was the intrusive part. The old click panel is also not restored: that
 * carried voice toggles, a status readout, dictation and a feed control. This opens
 * one thing, current capacity, which is worth a click and cannot talk over you.
 *
 * Because it is interactive again it is a real button: focusable, labelled, and
 * keyboard operable. It was `aria-hidden` only while it was purely decorative.
 *
 * Companion preferences (skin, accent, size, dock, visibility) live in
 * Settings → Companion. Mic dictation belongs to the composer, not here.
 */

import { useEffect, useRef, useState } from 'react';
import { CompanionRenderer } from './CompanionRenderer';
import { CompanionUsagePopover } from './CompanionUsagePopover';
import { useCompanionStore } from '@/store/useCompanionStore';
import { cn } from '@/lib/utils';

export interface XrogaCompanionProps {
  variant?: 'hero' | 'composer' | 'floating' | 'preview';
  className?: string;
}

export function XrogaCompanion({ variant = 'floating', className }: XrogaCompanionProps) {
  const introShown = useRef(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const [usageOpen, setUsageOpen] = useState(false);
  const [intro, setIntro] = useState(false);
  const state = useCompanionStore();
  const operation = state.operation;

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

  useEffect(() => {
    if (!usageOpen) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setUsageOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [usageOpen]);

  if (!state.visible && variant !== 'preview') return null;

  // The preview in Settings is a swatch of the artwork, not a live control.
  const interactive = variant !== 'preview';

  return (
    <div
      ref={rootRef}
      className={cn('xv-companion', `xv-companion--${variant}`, intro && 'is-intro', className)}
      data-testid={`xroga-companion-${variant}`}
      data-operation={operation}
      data-mood={state.mood}
    >
      {interactive ? (
        <button
          type="button"
          className="xv-companion-trigger"
          onClick={() => setUsageOpen((v) => !v)}
          aria-expanded={usageOpen}
          aria-label="Show usage"
          title="Usage"
        >
          <CompanionRenderer
            mood={state.mood}
            operation={operation}
            costume={state.costume}
            accent={state.accent}
            crownEnabled={state.crownEnabled}
            mantleEnabled={state.mantleEnabled}
          />
          {/* The laptop prop. Drawn here rather than baked into the skins, because the
              costumes are single static renders — one CSS-composed prop animates over
              all five instead of needing ten new images. */}
          <span className="xv-companion-laptop" aria-hidden="true">
            <i className="xv-companion-laptop__screen" />
            <i className="xv-companion-laptop__base" />
          </span>
          {variant !== 'hero' ? <span className="xv-companion-operation-dot" aria-hidden /> : null}
        </button>
      ) : (
        <span className="xv-companion-trigger" aria-hidden="true">
          <CompanionRenderer
            mood={state.mood}
            operation={operation}
            costume={state.costume}
            accent={state.accent}
            crownEnabled={state.crownEnabled}
            mantleEnabled={state.mantleEnabled}
          />
        </span>
      )}

      {usageOpen && interactive && <CompanionUsagePopover onClose={() => setUsageOpen(false)} />}
    </div>
  );
}
