'use client';

import { cn } from '@/lib/utils';
import type { Variants } from 'motion/react';
import * as m from 'motion/react-m';
import { useAnimation, useReducedMotion } from 'motion/react';
import type { HTMLAttributes } from 'react';
import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';

import { IconMotion } from './MotionProvider';
import { useThemeStore } from '@/store/useThemeStore';
import { useHydrated } from '@/hooks/useHydrated';

export interface VercelIconHandle {
  startAnimation: () => void;
  stopAnimation: () => void;
}

interface VercelIconProps
  extends Omit<
    HTMLAttributes<HTMLDivElement>,
    'color' | 'onDrag' | 'onDragStart' | 'onDragEnd' | 'onAnimationStart' | 'onAnimationEnd' | 'onAnimationIteration'
  > {
  size?: number;
  duration?: number;
  color?: string;
}

const DRIFT_VARIANTS: Variants = {
  normal: { y: 0, scale: 1 },
  animate: {
    y: [0, -0.6, 0],
    scale: [1, 1.035, 1],
    transition: { duration: 2.4, repeat: Number.POSITIVE_INFINITY, ease: 'easeInOut' },
  },
};

const FILL_VARIANTS: Variants = {
  normal: { opacity: 1 },
  animate: {
    opacity: [1, 0.82, 1],
    transition: { duration: 2.4, repeat: Number.POSITIVE_INFINITY, ease: 'easeInOut' },
  },
};

const HALO_VARIANTS: Variants = {
  normal: { scale: 1, opacity: 0 },
  animate: {
    scale: [1, 1.09, 1],
    opacity: [0, 0.22, 0],
    transition: { duration: 2.4, repeat: Number.POSITIVE_INFINITY, ease: 'easeOut' },
  },
};

const TRACE_VARIANTS: Variants = {
  normal: { strokeDashoffset: 0, opacity: 0 },
  animate: {
    strokeDashoffset: [0, -1],
    opacity: [0.3, 0.75, 0.3],
    transition: {
      strokeDashoffset: { duration: 3.4, repeat: Number.POSITIVE_INFINITY, ease: 'linear' },
      opacity: { duration: 2.4, repeat: Number.POSITIVE_INFINITY, ease: 'easeInOut' },
    },
  },
};

/**
 * The Vercel triangle, breathing.
 *
 * A filled mark rather than a stroked one — this is a brand logo, and outlining it
 * would make it a different logo. Three layers over the fill: it drifts and swells
 * very slightly, a halo pulses out past its edge, and a short dash travels the
 * perimeter. All of it is small on purpose; the mark has to stay recognisable as
 * Vercel's, not become an animation that happens to be triangular.
 *
 * Continuous, like the GitHub mark, and for the same reason: it appears on surfaces
 * nobody points at — an integrations row, a deploy card, the homepage tour — where
 * waiting for a hover means it never moves. Being continuous means it is not driven by
 * `AnimatedIcon`, so it wraps its own `IconMotion`: an icon rendered outside that
 * provider has no motion features loaded and is silently static.
 */
const VercelIcon = forwardRef<VercelIconHandle, VercelIconProps>(
  ({ className, size = 24, color, ...props }, ref) => {
    const controls = useAnimation();
    const isControlled = useRef(false);
    const systemReduced = useReducedMotion();
    const hydrated = useHydrated();
    const preferenceReduced = useThemeStore((state) => state.reducedMotion);
    const reduced = Boolean(systemReduced) || (hydrated && preferenceReduced);

    useImperativeHandle(ref, () => {
      isControlled.current = true;
      return {
        startAnimation: () => controls.start(reduced ? 'normal' : 'animate'),
        stopAnimation: () => controls.start('normal'),
      };
    });

    useEffect(() => {
      controls.start(reduced ? 'normal' : 'animate');
    }, [controls, reduced]);

    return (
      <IconMotion>
        <m.div
          className={cn('inline-flex items-center justify-center', className)}
          {...props}
          style={{ color, ...props.style }}
        >
          <m.svg
            xmlns="http://www.w3.org/2000/svg"
            width={size}
            height={size}
            viewBox="0 0 24 24"
            fill="none"
            aria-hidden="true"
            initial="normal"
            animate={controls}
            variants={DRIFT_VARIANTS}
          >
            <m.path d="M12 3 21 19H3L12 3Z" fill="currentColor" variants={FILL_VARIANTS} />
            <m.path
              d="M12 3 21 19H3L12 3Z"
              fill="none"
              stroke="currentColor"
              strokeWidth="0.8"
              strokeLinejoin="round"
              variants={HALO_VARIANTS}
              style={{ transformOrigin: '12px 12px' }}
            />
            <m.path
              d="M12 3 21 19H3L12 3Z"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.1"
              strokeLinecap="round"
              strokeLinejoin="round"
              pathLength={1}
              strokeDasharray="0.1 0.9"
              variants={TRACE_VARIANTS}
            />
          </m.svg>
        </m.div>
      </IconMotion>
    );
  },
);

VercelIcon.displayName = 'VercelIcon';
export { VercelIcon };
