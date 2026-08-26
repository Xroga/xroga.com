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

export interface LogoutIconHandle {
  startAnimation: () => void;
  stopAnimation: () => void;
}

interface LogoutIconProps
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
 * A door with an arrow leaving through it.
 *
 * The arrow pulls back before it goes, the way a thrown thing winds up — without that
 * it slides out evenly and reads as a static arrow that happens to have moved. The
 * door frame stays put, so the direction of travel is unambiguous.
 */
const LogoutIcon = forwardRef<LogoutIconHandle, LogoutIconProps>(
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

    const arrowVariants: Variants = {
      normal: { x: 0, translateX: 0 },
      animate: {
        x: 2,
        translateX: [0, -3, 0],
        transition: { duration: 0.4 * duration },
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
          <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
          <m.polyline
            points="16 17 21 12 16 7"
            variants={arrowVariants}
            initial="normal"
            animate={controls}
          />
          <m.line
            x1="21"
            x2="9"
            y1="12"
            y2="12"
            variants={arrowVariants}
            initial="normal"
            animate={controls}
          />
        </m.svg>
      </m.div>
    );
  },
);

LogoutIcon.displayName = 'LogoutIcon';
export { LogoutIcon };
