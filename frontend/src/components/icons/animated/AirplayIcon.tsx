'use client';

import * as m from 'motion/react-m';
import { useAnimation } from 'motion/react';
import type { Variants } from 'motion/react';
import type { HTMLAttributes } from 'react';
import { forwardRef, useCallback, useImperativeHandle, useRef } from 'react';

import { cn } from '@/lib/utils';

export interface AirplayIconHandle {
  startAnimation: () => void;
  stopAnimation: () => void;
}

interface AirplayIconProps
  extends Omit<
    HTMLAttributes<HTMLDivElement>,
    'onDrag' | 'onDragStart' | 'onDragEnd' | 'onAnimationStart' | 'onAnimationEnd' | 'onAnimationIteration'
  > {
  size?: number;
}

const DURATION = 0.3;

const SCREEN_VARIANTS: Variants = {
  normal: { opacity: 1, pathLength: 1, pathOffset: 0, transition: { duration: DURATION } },
  animate: {
    opacity: [0, 1],
    pathLength: [0, 1],
    pathOffset: [1, 0],
    transition: { duration: DURATION * 2, ease: 'easeInOut' },
  },
};

const TRIANGLE_VARIANTS: Variants = {
  normal: { scale: 1, opacity: 1, transition: { duration: DURATION } },
  animate: {
    scale: [0.6, 1.1, 1],
    opacity: [0, 1],
    transition: { duration: DURATION * 2, ease: 'easeOut' },
  },
};

const AirplayIcon = forwardRef<AirplayIconHandle, AirplayIconProps>(
  ({ onMouseEnter, onMouseLeave, className, size = 28, ...props }, ref) => {
    const controls = useAnimation();
    const isControlledRef = useRef(false);

    useImperativeHandle(ref, () => {
      isControlledRef.current = true;
      return {
        // The screen draws itself and the triangle lands, then it settles back —
        // this one reads as a single gesture rather than a state to hold.
        startAnimation: async () => {
          await controls.start('animate');
          controls.start('normal');
        },
        stopAnimation: () => controls.start('normal'),
      };
    });

    const handleMouseEnter = useCallback(
      async (e: React.MouseEvent<HTMLDivElement>) => {
        if (isControlledRef.current) {
          onMouseEnter?.(e);
          return;
        }
        await controls.start('animate');
        controls.start('normal');
      },
      [controls, onMouseEnter],
    );

    const handleMouseLeave = useCallback(
      (e: React.MouseEvent<HTMLDivElement>) => {
        if (isControlledRef.current) onMouseLeave?.(e);
        else controls.start('normal');
      },
      [controls, onMouseLeave],
    );

    return (
      <div
        className={cn('inline-flex items-center justify-center', className)}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        {...props}
      >
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
          <m.path
            animate={controls}
            d="M5 17H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2h-1"
            initial="normal"
            variants={SCREEN_VARIANTS}
          />
          <m.path animate={controls} d="M12 15l5 6H7z" initial="normal" variants={TRIANGLE_VARIANTS} />
        </svg>
      </div>
    );
  },
);

AirplayIcon.displayName = 'AirplayIcon';

export { AirplayIcon };
