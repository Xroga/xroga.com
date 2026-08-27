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
 * Two things about the badge, both learned from it shipping invisible.
 *
 * The plus is drawn in `--card`, the surface behind the icon, not in a fixed white.
 * On the Black theme `--accent` *is* white, so a white plus on an accent disc was
 * white on white and simply gone. Inking it with the surface makes it invert with the
 * theme the way the disc does: dark on a white accent, light on a blue one.
 *
 * And the window is drawn smaller than the 24-unit box so the badge can be large. This
 * renders at 16px in the sidebar toolbar, where the old 2.9-unit disc came out around
 * two device pixels across — too small to hold a plus at all, which is what made the
 * control read as a smudge rather than as "new terminal".
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
          <m.rect x="1.75" y="5.5" width="15.5" height="13" rx="2.4" variants={windowVariants} />
          <m.path d="M4.6 10 6.9 12.3 4.6 14.6" variants={chevronVariants} />
          <m.path
            d="M8.6 14.6h4"
            variants={commandLineVariants}
            style={{ transformOrigin: '8.6px 14.6px' }}
          />
          <m.g variants={badgeVariants}>
            {/*
              A filled accent disc, ringed in the surface behind it, with the plus
              knocked out in that same surface colour.

              All three values follow the theme, and the plus is the one that matters:
              on Black `--accent` is `#ffffff`, so inking it with a fixed white put a
              white plus on a white disc and the control rendered as a smudge. Taking
              `--card` makes it invert with the disc — dark on a white accent, light on
              a blue one.
            */}
            <circle cx="17.5" cy="6.5" r="6.4" fill="var(--card)" stroke="none" />
            <circle cx="17.5" cy="6.5" r="5.4" fill="var(--accent)" stroke="none" />
            <m.path d="M17.5 3.6v5.8" stroke="var(--card)" strokeWidth="2.2" variants={plusVariants} />
            <m.path d="M14.6 6.5h5.8" stroke="var(--card)" strokeWidth="2.2" variants={plusVariants} />
          </m.g>
        </m.svg>
      </m.div>
    );
  },
);

NewTerminalIcon.displayName = 'NewTerminalIcon';
export { NewTerminalIcon };
