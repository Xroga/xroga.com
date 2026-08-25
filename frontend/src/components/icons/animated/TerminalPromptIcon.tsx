'use client';

import type { Variants } from 'motion/react';
import * as m from 'motion/react-m';
import { useAnimation, useReducedMotion } from 'motion/react';
import type { HTMLAttributes } from 'react';
import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';

import { cn } from '@/lib/utils';
import { IconMotion } from './MotionProvider';
import { useThemeStore } from '@/store/useThemeStore';
import { useHydrated } from '@/hooks/useHydrated';

export interface TerminalPromptIconHandle {
  startAnimation: () => void;
  stopAnimation: () => void;
}

interface TerminalPromptIconProps
  extends Omit<
    HTMLAttributes<HTMLDivElement>,
    'onDrag' | 'onDragStart' | 'onDragEnd' | 'onAnimationStart' | 'onAnimationEnd' | 'onAnimationIteration'
  > {
  size?: number;
}

const LINE_VARIANTS: Variants = {
  normal: { opacity: 1 },
  animate: {
    opacity: [1, 0, 1],
    transition: { duration: 0.8, repeat: Number.POSITIVE_INFINITY, ease: 'linear' },
  },
};

/**
 * The prompt glyph beside `xroga@swarm`, with a cursor that never stops blinking.
 *
 * The only icon here that is not hover-driven. It stands for a live shell, and a
 * shell's cursor blinks whether or not anyone is pointing at it — starting it on
 * hover would say the terminal is only alive while being looked at. So it starts
 * itself once the page is interactive and runs until the page goes away.
 *
 * Reduced motion gets the glyph with the cursor solid: the picture is intact and
 * nothing moves.
 */
const TerminalPromptIcon = forwardRef<TerminalPromptIconHandle, TerminalPromptIconProps>(
  ({ className, size = 14, ...props }, ref) => {
    const controls = useAnimation();
    const systemReduced = useReducedMotion();
    const hydrated = useHydrated();
    const preferenceReduced = useThemeStore((state) => state.reducedMotion);
    const reduced = Boolean(systemReduced) || (hydrated && preferenceReduced);
    const running = useRef(false);

    useImperativeHandle(ref, () => ({
      startAnimation: () => {
        if (reduced) return;
        running.current = true;
        controls.start('animate');
      },
      stopAnimation: () => {
        running.current = false;
        controls.start('normal');
      },
    }));

    useEffect(() => {
      if (!hydrated) return;
      if (reduced) {
        controls.start('normal');
        return;
      }
      running.current = true;
      controls.start('animate');
    }, [hydrated, reduced, controls]);

    return (
        <IconMotion>
        <div className={cn('inline-flex items-center justify-center', className)} {...props}>
          <svg
            fill="none"
            height={size}
            stroke="currentColor"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="2"
            viewBox="0 0 24 24"
            width={size}
            xmlns="http://www.w3.org/2000/svg"
          >
            <polyline points="4 17 10 11 4 5" />
            <m.line
              animate={controls}
              initial="normal"
              variants={LINE_VARIANTS}
              x1="12"
              x2="20"
              y1="19"
              y2="19"
            />
          </svg>
        </div>
        </IconMotion>
    );
  },
);

TerminalPromptIcon.displayName = 'TerminalPromptIcon';

export { TerminalPromptIcon };
