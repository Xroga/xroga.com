'use client';

import { cn } from '@/lib/utils';
import type { Variants } from 'motion/react';
import * as m from 'motion/react-m';
import { useAnimation, useReducedMotion } from 'motion/react';
import {
  forwardRef,
  useCallback,
  useImperativeHandle,
  useRef,
  type HTMLAttributes,
} from 'react';

export interface EyeClosedIconHandle {
  startAnimation: () => void;
  stopAnimation: () => void;
}

interface EyeClosedIconProps
  extends Omit<
    HTMLAttributes<HTMLDivElement>,
    | 'color'
    | 'onDrag'
    | 'onDragStart'
    | 'onDragEnd'
    | 'onAnimationStart'
    | 'onAnimationEnd'
    | 'onAnimationIteration'
  > {
  size?: number;
  duration?: number;
  isAnimated?: boolean;
  color?: string;
}

/**
 * A closed eye — the mark for putting the composer away.
 *
 * The arc draws itself and the four lashes flick outward in sequence, which reads as
 * an eye shutting rather than as an eye that was always shut. A crossed-out panel
 * glyph said a panel would move; this says the thing stops being looked at.
 */
const EyeClosedIcon = forwardRef<EyeClosedIconHandle, EyeClosedIconProps>(
  (
    {
      onMouseEnter,
      onMouseLeave,
      className,
      size = 24,
      duration = 1,
      isAnimated = true,
      color,
      ...props
    },
    ref,
  ) => {
    const controls = useAnimation();
    const reduced = useReducedMotion();
    const isControlled = useRef(false);

    useImperativeHandle(ref, () => {
      isControlled.current = true;
      return {
        startAnimation: () => controls.start(reduced ? 'normal' : 'animate'),
        stopAnimation: () => controls.start('normal'),
      };
    });

    const handleEnter = useCallback(
      (e: React.MouseEvent<HTMLDivElement>) => {
        if (!isAnimated || reduced) return;
        if (!isControlled.current) controls.start('animate');
        else onMouseEnter?.(e);
      },
      [controls, reduced, isAnimated, onMouseEnter],
    );

    const handleLeave = useCallback(
      (e: React.MouseEvent<HTMLDivElement>) => {
        if (!isControlled.current) controls.start('normal');
        else onMouseLeave?.(e);
      },
      [controls, onMouseLeave],
    );

    const arcVariants: Variants = {
      normal: { pathLength: 1, opacity: 1 },
      animate: {
        pathLength: [0, 1],
        opacity: [0.5, 1],
        transition: { duration: 0.9 * duration, ease: 'easeInOut' },
      },
    };

    const lashVariants: Variants = {
      normal: { rotate: 0, y: 0, opacity: 1 },
      animate: (i: number) => ({
        rotate: [0, -12, 8, 0],
        y: [0, -2, 1, 0],
        opacity: [1, 0.7, 1, 1],
        transition: { duration: 0.6 * duration, delay: i * 0.05, ease: 'easeInOut' },
      }),
    };

    return (
      <m.div
        className={cn('inline-flex items-center justify-center', className)}
        onMouseEnter={handleEnter}
        onMouseLeave={handleLeave}
        {...props}
        style={{ color, ...props.style }}
      >
        <m.svg
          xmlns="http://www.w3.org/2000/svg"
          width={size}
          height={size}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          animate={controls}
          initial="normal"
        >
          <m.path d="M2 8a10.645 10.645 0 0 0 20 0" variants={arcVariants} />
          <m.path d="m15 18-.722-3.25" custom={0} variants={lashVariants} />
          <m.path d="m9 18 .722-3.25" custom={1} variants={lashVariants} />
          <m.path d="m20 15-1.726-2.05" custom={2} variants={lashVariants} />
          <m.path d="m4 15 1.726-2.05" custom={3} variants={lashVariants} />
        </m.svg>
      </m.div>
    );
  },
);

EyeClosedIcon.displayName = 'EyeClosedIcon';
export { EyeClosedIcon };
