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

export interface NewTerminalIconHandle {
  startAnimation: () => void;
  stopAnimation: () => void;
}

interface NewTerminalIconProps
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
 * A terminal window with a plus badge — start a fresh one.
 *
 * Four movements, choreographed rather than driven separately: the window presses in,
 * the prompt chevron shifts, the command line retracts to nothing and comes back, and
 * the badge pops and rocks while its plus draws itself. The badge lands last, which is
 * what makes it read as being added to the terminal rather than as part of it.
 *
 * The badge's cutout takes `--card` rather than a hardcoded white. This sits in the
 * sidebar toolbar, which is a different surface on each theme; a white disc there is
 * the same mistake the mic's white coin was.
 */
const NewTerminalIcon = forwardRef<NewTerminalIconHandle, NewTerminalIconProps>(
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

    const windowVariants: Variants = {
      normal: { scale: 1 },
      animate: {
        scale: [1, 0.96, 1],
        transition: { duration: 0.45 * duration, ease: 'easeInOut' },
      },
    };

    const chevronVariants: Variants = {
      normal: { x: 0, opacity: 1 },
      animate: {
        x: [0, -1.5, 1, 0],
        opacity: [1, 0.65, 1, 1],
        transition: { duration: 0.5 * duration, ease: 'easeInOut' },
      },
    };

    const commandLineVariants: Variants = {
      normal: { scaleX: 1, opacity: 1 },
      animate: {
        scaleX: [1, 0.25, 1],
        opacity: [1, 0.55, 1],
        transition: { duration: 0.6 * duration, ease: 'easeInOut' },
      },
    };

    const badgeVariants: Variants = {
      normal: { scale: 1, rotate: 0 },
      animate: {
        scale: [1, 1.25, 0.9, 1],
        rotate: [0, 12, -6, 0],
        transition: { duration: 0.7 * duration, ease: 'easeInOut', delay: 0.08 * duration },
      },
    };

    const plusVariants: Variants = {
      normal: { pathLength: 1, opacity: 1 },
      animate: {
        pathLength: [0, 1],
        opacity: [0.4, 1],
        transition: { duration: 0.4 * duration, ease: 'easeOut', delay: 0.12 * duration },
      },
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
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
          initial="normal"
          animate={controls}
        >
          <m.rect x="2.75" y="4.25" width="18.5" height="15.5" rx="2.5" variants={windowVariants} />
          <m.path d="M5.5 10 8 12.5 5.5 15" variants={chevronVariants} />
          <m.path
            d="M10 15h4.25"
            variants={commandLineVariants}
            style={{ transformOrigin: '10px 15px' }}
          />
          <m.g variants={badgeVariants}>
            {/*
              The badge is a filled accent disc with a ring the colour of the surface
              behind it, and a plus knocked out in the accent's own ink.
 
              Three theme-aware values rather than the blue and white the design shows:
              `--card` for the ring, so the badge reads as sitting on top of the
              terminal rather than punched through it; `--accent` for the fill, so the
              button follows the colour the reader chose; and `--button-text` for the
              plus, which is what keeps it legible when that accent is a pale one.
            */}
            <circle cx="18" cy="7" r="3.6" fill="var(--card)" stroke="none" />
            <circle cx="18" cy="7" r="2.9" fill="var(--accent)" stroke="none" />
            <m.path d="M18 5.6v2.8" stroke="var(--button-text, #fff)" strokeWidth="1.7" variants={plusVariants} />
            <m.path d="M16.6 7h2.8" stroke="var(--button-text, #fff)" strokeWidth="1.7" variants={plusVariants} />
          </m.g>
        </m.svg>
      </m.div>
    );
  },
);

NewTerminalIcon.displayName = 'NewTerminalIcon';
export { NewTerminalIcon };
