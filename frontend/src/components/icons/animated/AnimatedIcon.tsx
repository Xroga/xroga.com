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
import { IconMotion } from './MotionProvider';
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
 * Hover and click are bound to the control the icon sits in, not to the icon.
 * These are 16px glyphs inside 32px buttons and full-width nav rows: a listener on
 * the glyph itself only fires when the pointer lands on the glyph exactly, so
 * hovering a sidebar row or pressing a rail button animated nothing. The icon walks
 * up to its nearest interactive ancestor and listens there, which is the thing the
 * reader is actually pointing at.
 *
 * `hovered` overrides that, for a parent that already tracks its own hover state.
 */

/** The control an icon belongs to, for binding hover and click. */
const INTERACTIVE = 'a, button, [role="button"], [role="menuitem"], label, summary';
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
  const hostRef = useRef<HTMLSpanElement>(null);
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

  // Driven by the parent when a parent says so.
  useEffect(() => {
    if (hovered === undefined) return;
    if (hovered) hold();
    else release();
  }, [hovered, hold, release]);

  /*
   * Bound to the button or the row, not to the glyph.
   *
   * Native listeners on the ancestor rather than React props on the icon: the
   * control is somebody else's element — a Link, a HoverTip's child, a menu row —
   * and this is the only way to reach it without every call site passing handlers
   * down. `mouseenter`/`mouseleave` do not bubble, so they fire for the control as
   * a whole and not for each thing inside it.
   */
  useEffect(() => {
    const host = hostRef.current;
    if (!host || hovered !== undefined || reduced) return;
    const target = host.closest(INTERACTIVE) ?? host;
    const enter = () => hold();
    const leave = () => release();
    const press = () => play();
    target.addEventListener('mouseenter', enter);
    target.addEventListener('mouseleave', leave);
    target.addEventListener('click', press);
    return () => {
      target.removeEventListener('mouseenter', enter);
      target.removeEventListener('mouseleave', leave);
      target.removeEventListener('click', press);
    };
  }, [hovered, reduced, hold, release, play]);

  useEffect(() => clearSettle, [clearSettle]);

  return (
    // The wrapper exists to find the control: the icon's own ref is its animation
    // handle, so there is no DOM node to walk up from without one.
    <span ref={hostRef} className={cn('xv-animated-icon-host', className)} onClick={onClick}>
      <IconMotion>
        <Icon ref={handle} size={size} className="xv-animated-icon" />
      </IconMotion>
    </span>
  );
}
