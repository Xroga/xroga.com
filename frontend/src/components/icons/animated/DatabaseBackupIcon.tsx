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

export interface DatabaseBackupIconHandle {
  startAnimation: () => void;
  stopAnimation: () => void;
}

interface DatabaseBackupIconProps
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
 * A database with a refresh arrow that turns a full circle.
 *
 * Only the arrow group moves, around its own centre rather than the icon's — a
 * rotation about `12 12` would swing the arrow around the cylinder instead of
 * spinning it in place, which reads as orbiting, not as syncing.
 */
const DatabaseBackupIcon = forwardRef<DatabaseBackupIconHandle, DatabaseBackupIconProps>(
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

    const cycleVariants: Variants = {
      normal: { rotate: 0 },
      animate: {
        rotate: 360,
        transition: { duration: 0.6 * duration, ease: 'easeInOut' },
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
          <ellipse cx="12" cy="5" rx="9" ry="3" />
          <path d="M3 12a9 3 0 0 0 5 2.69" />
          <path d="M21 9.3V5" />
          <path d="M3 5v14a9 3 0 0 0 6.47 2.88" />
          <m.g
            initial="normal"
            animate={controls}
            variants={cycleVariants}
            style={{ transformOrigin: '17.5px 17px' }}
          >
            <path d="M12 12v4h4" />
            <path d="M13 20a5 5 0 0 0 9-3 4.5 4.5 0 0 0-4.5-4.5c-1.33 0-2.54.54-3.41 1.41L12 16" />
          </m.g>
        </m.svg>
      </m.div>
    );
  },
);

DatabaseBackupIcon.displayName = 'DatabaseBackupIcon';
export { DatabaseBackupIcon };
