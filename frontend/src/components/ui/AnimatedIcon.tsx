'use client';

import { LazyMotion, domMin, m, useReducedMotion } from 'motion/react';
import type { Variants } from 'motion/react';
import type { ComponentType, SVGProps } from 'react';
import { cn } from '@/lib/utils';

/**
 * Hover animation for any icon.
 *
 * A wrapper rather than a rewritten icon set. Reimplementing every glyph as its own
 * motion component is how an icon library turns into hundreds of near-identical
 * files — and the two spinners that arrived that way were already byte-identical
 * apart from their paths. This animates whatever icon it is given, so a lucide import
 * gains hover motion without being replaced.
 *
 * `LazyMotion` with `domMin` keeps the cost down: the minimal feature set, loaded
 * once, shared by every icon on the page.
 *
 * The variant names describe the motion, not the icon, so the same six cover a nav
 * list, a toolbar, and a button row without inventing per-icon behaviour.
 */
export type IconMotion = 'lift' | 'spin' | 'pulse' | 'nudge' | 'wiggle' | 'pop';

const VARIANTS: Record<IconMotion, Variants> = {
  lift: {
    rest: { y: 0, scale: 1 },
    hover: { y: -2, scale: 1.08, transition: { type: 'spring', stiffness: 420, damping: 16 } },
  },
  spin: {
    rest: { rotate: 0 },
    hover: { rotate: 360, transition: { duration: 0.6, ease: 'easeInOut' } },
  },
  pulse: {
    rest: { scale: 1 },
    hover: { scale: [1, 1.16, 1], transition: { duration: 0.5, repeat: Infinity, repeatType: 'mirror' } },
  },
  nudge: {
    rest: { x: 0 },
    hover: { x: 3, transition: { type: 'spring', stiffness: 500, damping: 14 } },
  },
  wiggle: {
    rest: { rotate: 0 },
    hover: { rotate: [0, -9, 9, -6, 0], transition: { duration: 0.55 } },
  },
  pop: {
    rest: { scale: 1 },
    hover: { scale: 1.22, transition: { type: 'spring', stiffness: 500, damping: 12 } },
  },
};

export function AnimatedIcon({
  icon: Icon,
  motion = 'lift',
  size = 16,
  className,
}: {
  icon: ComponentType<SVGProps<SVGSVGElement>>;
  motion?: IconMotion;
  size?: number;
  className?: string;
}) {
  const reduced = useReducedMotion();

  // Reduced motion gets the icon and nothing else — no wrapper, no motion runtime.
  if (reduced) return <Icon width={size} height={size} className={className} aria-hidden="true" />;

  return (
    <LazyMotion features={domMin} strict>
      <m.span
        className={cn('inline-flex shrink-0', className)}
        initial="rest"
        animate="rest"
        variants={VARIANTS[motion]}
        whileHover="hover"
      >
        <Icon width={size} height={size} aria-hidden="true" />
      </m.span>
    </LazyMotion>
  );
}
