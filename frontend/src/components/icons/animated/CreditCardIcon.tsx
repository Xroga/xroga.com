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

export interface CreditCardIconHandle {
  startAnimation: () => void;
  stopAnimation: () => void;
}

interface CreditCardIconProps
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
 * A card that tilts, with its stripe sliding in and a line drawn across it.
 *
 * Four movements on one control rather than four separate ones: they are choreographed
 * by delay, so there is nothing to keep in sync. The tilt is small — four degrees —
 * because this heads a billing panel, and a card that lurches reads as an error state.
 */
const CreditCardIcon = forwardRef<CreditCardIconHandle, CreditCardIconProps>(
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

    const cardTilt: Variants = {
      normal: { rotate: 0, scale: 1, x: 0, y: 0 },
      animate: {
        rotate: [0, -4, 2, 0],
        scale: [1, 1.02, 1],
        x: [0, -0.4, 0],
        y: [0, -0.3, 0],
        transition: { duration: 0.6 * duration, ease: 'easeInOut' },
      },
    };

    const stripeSlide: Variants = {
      normal: { x: 0, opacity: 1 },
      animate: {
        x: [-2, 0],
        opacity: [0.7, 1],
        transition: { duration: 0.4 * duration, ease: 'easeOut', delay: 0.08 },
      },
    };

    const swipeLine: Variants = {
      normal: { pathLength: 0, opacity: 0 },
      animate: {
        pathLength: [0, 1],
        opacity: [0, 1, 0.9],
        transition: { duration: 0.5 * duration, ease: 'easeInOut', delay: 0.18 },
      },
    };

    const embossPulse: Variants = {
      normal: { scale: 1 },
      animate: {
        scale: [1, 1.035, 1],
        transition: { duration: 0.28 * duration, ease: 'easeOut', delay: 0.3 },
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
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          animate={controls}
          initial="normal"
        >
          <m.g variants={cardTilt}>
            <m.rect width="20" height="14" x="2" y="5" rx="2" variants={embossPulse} />
            <m.line x1="2" x2="22" y1="10" y2="10" variants={stripeSlide} />
            <m.path d="M5 15 H15" variants={swipeLine} />
          </m.g>
        </m.svg>
      </m.div>
    );
  },
);

CreditCardIcon.displayName = 'CreditCardIcon';
export { CreditCardIcon };
