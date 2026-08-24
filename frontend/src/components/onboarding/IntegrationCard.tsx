'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Check, Loader2, ArrowRight } from 'lucide-react';
import { OnboardingCard, type OnboardingArtwork } from './OnboardingCard';

export type IntegrationPhase = 'idle' | 'connecting' | 'connected' | 'error';

/**
 * A connect-or-skip stage.
 *
 * The provider's own connect and status functions are passed in, so this holds the
 * card's shape and none of the OAuth: GitHub and Vercel already have working flows
 * with different mechanics — GitHub leaves the tab entirely — and reimplementing
 * either here would be a second, quieter version of logic that already exists.
 *
 * `connected` is never assumed. It comes from the provider's own status endpoint,
 * so the tick means the account is genuinely linked rather than that a button was
 * pressed and a timer elapsed.
 */
export function IntegrationCard({
  artwork,
  headline,
  description,
  providerName,
  brandIcon,
  alreadyConnected,
  active,
  onConnect,
  onSkip,
  onConnected,
}: {
  artwork: OnboardingArtwork;
  headline: string;
  description: string;
  providerName: string;
  brandIcon: React.ReactNode;
  alreadyConnected: boolean;
  /**
   * Whether this card is the one being shown.
   *
   * Every card in the stack is mounted at once, so without this an integration that
   * was already connected fired its advance from behind the card the reader was
   * actually on — connecting Vercel in a previous session threw them from the first
   * question straight to the preparing screen, having answered nothing.
   */
  active: boolean;
  /** Starts the provider's real flow. Resolves once it has been handed off. */
  onConnect: () => Promise<{ started: boolean; error?: string }>;
  onSkip: () => void;
  /** Called once the account is confirmed linked, after the success state is seen. */
  onConnected: () => void;
}) {
  const [phase, setPhase] = useState<IntegrationPhase>(alreadyConnected ? 'connected' : 'idle');
  const [error, setError] = useState<string | null>(null);
  const advanced = useRef(false);

  /**
   * Hold the tick on screen briefly before moving on.
   *
   * Advancing the instant the status flips would mean the reader never sees that the
   * thing they asked for happened — the card would simply be replaced.
   */
  const settleThenAdvance = useCallback(() => {
    if (advanced.current) return;
    advanced.current = true;
    const t = setTimeout(onConnected, 900);
    return () => clearTimeout(t);
  }, [onConnected]);

  useEffect(() => {
    if (!alreadyConnected) return;
    // The tick is shown whenever the provider says so, but only the card in front is
    // allowed to move the flow on.
    setPhase('connected');
    if (!active) return;
    return settleThenAdvance();
  }, [alreadyConnected, active, settleThenAdvance]);

  const connect = async () => {
    // The guard is the state itself: a second press while connecting cannot start a
    // second authorize.
    if (phase === 'connecting' || phase === 'connected') return;
    setPhase('connecting');
    setError(null);
    try {
      const result = await onConnect();
      if (!result.started) {
        setPhase('error');
        setError(result.error ?? `Couldn't connect ${providerName}.`);
      }
      // When it did start, this tab is either navigating away or waiting on the
      // popup. Either way the status check decides what happens next, not this call.
    } catch (e) {
      setPhase('error');
      setError((e as Error)?.message || `Couldn't connect ${providerName}.`);
    }
  };

  const connecting = phase === 'connecting';
  const connected = phase === 'connected';

  return (
    <OnboardingCard
      artwork={artwork}
      eyebrow={<span className="xv-onb-brand">{brandIcon}</span>}
      headline={headline}
      description={description}
      footer={
        <div className="xv-onb-actions">
          <button
            type="button"
            onClick={connected ? undefined : connect}
            disabled={connecting || connected}
            className="xv-onb-cta"
            // The button's own text is the live region: a screen reader hears
            // "Connecting" and then "Connected" without watching an icon change.
            aria-live="polite"
          >
            {connecting ? (
              <>
                <Loader2 className="xv-onb-spin h-4 w-4" aria-hidden="true" />
                Connecting…
              </>
            ) : connected ? (
              <>
                <Check className="h-4 w-4" aria-hidden="true" />
                {providerName} connected
              </>
            ) : (
              <>
                {phase === 'error' ? 'Try again' : `Connect ${providerName}`}
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </>
            )}
          </button>

          {!connected ? (
            <button type="button" onClick={onSkip} className="xv-onb-skip-inline">
              Skip for now
            </button>
          ) : null}
        </div>
      }
    >
      {error ? (
        // Contained in the card. A failed authorize is not a reason to lose the
        // answers already given, and never a browser alert.
        <p className="xv-onb-error" role="status">
          {error}
        </p>
      ) : null}
    </OnboardingCard>
  );
}
