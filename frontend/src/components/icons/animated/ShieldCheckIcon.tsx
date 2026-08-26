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

export interface ShieldCheckIconHandle {
  startAnimation: () => void;
  stopAnimation: () => void;
}

interface ShieldCheckIconProps
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
 * A shield that draws itself, then takes its tick.
 *
 * The order carries the meaning: the guarantee is made before it is confirmed. Both
 * paths animate their own `strokeDashoffset`, so the shape appears to be drawn rather
 * than to fade in — a fade at 16px reads as the icon dimming, not as anything being
 * established.
 */
const ShieldCheckIcon = forwardRef<ShieldCheckIconHandle, ShieldCheckIconProps>(
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

    const shieldVariants: Variants = {
      normal: { strokeDashoffset: 0, scale: 1, rotate: 0 },
      animate: {
        strokeDashoffset: [300, 24, 0],
        scale: [1, 0.98, 1.04, 1],
        rotate: [0, -2, 1, 0],
        transition: {
          duration: 1 * duration,
          ease: [0.18, 0.85, 0.25, 1],
          times: [0, 0.35, 0.75, 1],
        },
      },
    };

    const checkVariants: Variants = {
      normal: { strokeDashoffset: 0, scale: 1, opacity: 1 },
      animate: {
        strokeDashoffset: [40, 0],
        scale: [1, 1.1, 0.98, 1],
        opacity: [0, 1, 1],
        transition: {
          duration: 1.3 * duration,
          ease: [0.22, 0.9, 0.28, 1],
          delay: 0.25,
          times: [0, 0.5, 1],
        },
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
        >
          <m.path
            d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"
            initial="normal"
            animate={controls}
            variants={shieldVariants}
            style={{ strokeDasharray: 300, transformOrigin: '12px 12px' }}
          />
          <m.path
            d="m9 12 2 2 4-4"
            initial="normal"
            animate={controls}
            variants={checkVariants}
            style={{ strokeDasharray: 40 }}
          />
        </m.svg>
      </m.div>
    );
  },
);

ShieldCheckIcon.displayName = 'ShieldCheckIcon';
export { ShieldCheckIcon };
