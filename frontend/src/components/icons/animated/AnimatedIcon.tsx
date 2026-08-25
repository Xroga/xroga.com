'use client';

import {
  useCallback,
  useEffect,
  useRef,
  type ForwardRefExoticComponent,
  type MouseEvent,
  type RefAttributes,
} from 'react';
import { useReducedMotion } from 'motion/react';
import { cn } from '@/lib/utils';
import { useHydrated } from '@/hooks/useHydrated';
import { useThemeStore } from '@/store/useThemeStore';

/**
 * The contract every animated icon in this folder implements: a handle that starts
 * and stops its animation, and a host element that accepts pointer handlers.
 *
 * Each icon animates itself on hover when it is used bare. Passing a ref flips it
 * into controlled mode, where it stops driving itself and forwards its pointer
 * events instead — which is what `AnimatedIcon` relies on to own the timing.
 */
export interface AnimatedIconHandle {
  startAnimation: () => void;
  stopAnimation: () => void;
}

export type AnimatedIconProps = {
  size?: number;
  className?: string;
  onMouseEnter?: (event: MouseEvent<HTMLDivElement>) => void;
  onMouseLeave?: (event: MouseEvent<HTMLDivElement>) => void;
  onClick?: (event: MouseEvent<HTMLDivElement>) => void;
};

// `forwardRef`, not `ComponentType`: on React 18 `ref` is not an ordinary prop, so
// the handle has to be part of the component's type rather than of its props.
export type AnimatedIconComponent = ForwardRefExoticComponent<
  AnimatedIconProps & RefAttributes<AnimatedIconHandle>
>;

/**
 * How long an icon is left running before it is told to rest.
 *
 * The animations here are between 0.4s and 1s. This is comfortably past the
 * longest of them, so every icon finishes its motion and settles rather than
 * being cut off part-way through.
 */
const SETTLE_MS = 1200;

/**
 * An animated icon that plays once when the page loads, rests, and then plays
 * again on hover or on click.
 *
 * The load pass is deliberately not gated behind a once-per-session marker. It is
 * meant to be seen on every visit to the page, which is what makes the sidebar
 * read as alive on arrival rather than as a column of static glyphs.
 *
 * `hovered` exists because these sit inside rows, and hovering the row is what
 * people actually do — requiring the pointer to land on a 16px glyph would mean
 * most hovers never animated anything. When a row passes it, the row owns the
 * hover; otherwise the icon's own pointer events do.
 */
export function AnimatedIcon({
  icon: Icon,
  size = 16,
  className,
  hovered,
  onClick,
  /** Skips the once-on-load pass, for icons that mount inside a popover or modal. */
  intro = true,
}: {
  icon: AnimatedIconComponent;
  size?: number;
  className?: string;
  hovered?: boolean;
  onClick?: (event: MouseEvent<HTMLDivElement>) => void;
  intro?: boolean;
}) {
  const handle = useRef<AnimatedIconHandle>(null);
  const settleTimer = useRef<number | null>(null);

  const systemReduced = useReducedMotion();
  const hydrated = useHydrated();
  const preferenceReduced = useThemeStore((state) => state.reducedMotion);
  const reduced = Boolean(systemReduced) || (hydrated && preferenceReduced);

  const clearSettle = useCallback(() => {
    if (settleTimer.current !== null) {
      window.clearTimeout(settleTimer.current);
      settleTimer.current = null;
    }
  }, []);

  /** Plays once and settles on its own — for the load pass and for clicks. */
  const play = useCallback(() => {
    if (reduced) return;
    clearSettle();
    handle.current?.startAnimation();
    settleTimer.current = window.setTimeout(() => {
      handle.current?.stopAnimation();
      settleTimer.current = null;
    }, SETTLE_MS);
  }, [reduced, clearSettle]);

  const hold = useCallback(() => {
    if (reduced) return;
    clearSettle();
    handle.current?.startAnimation();
  }, [reduced, clearSettle]);

  const release = useCallback(() => {
    clearSettle();
    handle.current?.stopAnimation();
  }, [clearSettle]);

  // The load pass. Waits for hydration so it runs against a live handle rather
  // than during the server render, where there is nothing to drive.
  useEffect(() => {
    if (!intro || !hydrated || reduced) return;
    play();
    return clearSettle;
  }, [intro, hydrated, reduced, play, clearSettle]);

  // Driven by the row when a row says so.
  useEffect(() => {
    if (hovered === undefined) return;
    if (hovered) hold();
    else release();
  }, [hovered, hold, release]);

  useEffect(() => clearSettle, [clearSettle]);

  const ownsPointer = hovered === undefined;

  return (
    <Icon
      ref={handle}
      size={size}
      className={cn('xv-animated-icon', className)}
      onMouseEnter={ownsPointer ? hold : undefined}
      onMouseLeave={ownsPointer ? release : undefined}
      onClick={(event) => {
        play();
        onClick?.(event);
      }}
    />
  );
}
