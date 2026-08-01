'use client';

import { useEffect, useState, type ComponentType } from 'react';
import { LazyMotion, domMin, m, useReducedMotion } from 'motion/react';
import type { Variants } from 'motion/react';
import { cn } from '@/lib/utils';
import { useThemeStore } from '@/store/useThemeStore';
import { useHydrated } from '@/hooks/useHydrated';

/**
 * Nav icons that act out what they do on hover.
 *
 * The previous version played a one-per-session entrance and then sat still, with a
 * CSS lift as the whole hover interaction — which is why the icons read as static.
 * Each icon now has motion matched to its own meaning: the rocket launches, the
 * compass needle sweeps, the terminal blinks, the wallet flips open. The point is
 * that the movement says something about the destination, not that everything
 * wiggles.
 *
 * These animate the glyph as a whole rather than its interior paths. Animating paths
 * would mean replacing every lucide glyph with a hand-built motion component; at
 * 16px an internal path tweak moves a pixel or two and is not visible anyway, so
 * this gets the same read for none of that cost.
 */
export type NavIconMotion =
  | 'launch'
  | 'sweep'
  | 'blink'
  | 'flip'
  | 'pulse'
  | 'lift'
  | 'shake'
  | 'grow';

const VARIANTS: Record<NavIconMotion, Variants> = {
  /** Rocket: crouches, then flies up and out. */
  launch: {
    rest: { y: 0, rotate: 0 },
    hover: { y: [0, 2, -5, 0], rotate: [0, 0, -12, 0], transition: { duration: 0.75, ease: 'easeInOut' } },
  },
  /** Compass: the needle swings past and settles. */
  sweep: {
    rest: { rotate: 0 },
    hover: { rotate: [0, 200, 340, 360], transition: { duration: 0.85, ease: 'easeInOut' } },
  },
  /** Terminal: a cursor blink. */
  blink: {
    rest: { opacity: 1, scale: 1 },
    hover: { opacity: [1, 0.35, 1, 0.35, 1], scale: 1.08, transition: { duration: 0.7 } },
  },
  /** Wallet, folder, book: opens on its hinge. */
  flip: {
    rest: { rotateY: 0 },
    hover: { rotateY: [0, -35, 0], transition: { duration: 0.6, ease: 'easeInOut' } },
  },
  /** Live things: a heartbeat. */
  pulse: {
    rest: { scale: 1 },
    hover: { scale: [1, 1.22, 0.96, 1.12, 1], transition: { duration: 0.7 } },
  },
  lift: {
    rest: { y: 0, scale: 1 },
    hover: { y: -2, scale: 1.12, transition: { type: 'spring', stiffness: 420, damping: 15 } },
  },
  /** Settings: the cog rocks as if being turned. */
  shake: {
    rest: { rotate: 0 },
    hover: { rotate: [0, -14, 12, -8, 0], transition: { duration: 0.6 } },
  },
  /** Growth: a step up. */
  grow: {
    rest: { y: 0, scaleY: 1 },
    hover: { y: [0, -3, 0], scaleY: [1, 1.18, 1], transition: { duration: 0.6, ease: 'easeOut' } },
  },
};

export function AnimatedNavIcon({
  Icon,
  className,
  motion = 'lift',
  /** Set when a parent row owns the hover, so the icon plays with the whole row. */
  hovered,
}: {
  Icon: ComponentType<{ className?: string }>;
  className?: string;
  motion?: NavIconMotion;
  hovered?: boolean;
}) {
  const [intro, setIntro] = useState(false);
  const systemReduced = useReducedMotion();
  const hydrated = useHydrated();
  const preferenceReduced = useThemeStore((state) => state.reducedMotion);
  const reduced = systemReduced || (hydrated && preferenceReduced);

  useEffect(() => {
    const key = 'xroga-nav-icon-intro';
    if (sessionStorage.getItem(key)) return;
    sessionStorage.setItem(key, '1');
    setIntro(true);
    const timer = window.setTimeout(() => setIntro(false), 1100);
    return () => window.clearTimeout(timer);
  }, []);

  // Reduced motion gets the plain glyph and no motion runtime at all.
  if (reduced) {
    return (
      <span className={cn('xv-animated-nav-icon', className)} aria-hidden>
        <Icon className="h-4 w-4" />
      </span>
    );
  }

  return (
    <LazyMotion features={domMin} strict>
      <m.span
        className={cn('xv-animated-nav-icon', intro && 'is-intro', className)}
        aria-hidden
        variants={VARIANTS[motion]}
        initial="rest"
        // Driven by the row when it says so, by its own pointer otherwise. Hovering the
        // row is what people actually do — requiring the pointer to land on a 16px
        // glyph would mean most hovers never animate anything.
        animate={hovered === undefined ? undefined : hovered ? 'hover' : 'rest'}
        whileHover={hovered === undefined ? 'hover' : undefined}
      >
        <Icon className="h-4 w-4" />
      </m.span>
    </LazyMotion>
  );
}
