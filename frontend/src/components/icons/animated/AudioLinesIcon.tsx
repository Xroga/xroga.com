'use client';

import * as m from 'motion/react-m';
import { useAnimation } from 'motion/react';
import type { HTMLAttributes } from 'react';
import { forwardRef, useCallback, useImperativeHandle, useRef } from 'react';

import { cn } from '@/lib/utils';

export interface AudioLinesIconHandle {
  startAnimation: () => void;
  stopAnimation: () => void;
}

interface AudioLinesIconProps
  extends Omit<
    HTMLAttributes<HTMLDivElement>,
    'onDrag' | 'onDragStart' | 'onDragEnd' | 'onAnimationStart' | 'onAnimationEnd' | 'onAnimationIteration'
  > {
  size?: number;
}

/** Each bar breathes on its own clock, so the set never pulses in lockstep. */
const BARS = [
  { rest: 'M6 6v11', beat: 'M6 10v3', duration: 1.5 },
  { rest: 'M10 3v18', beat: 'M10 9v5', duration: 1 },
  { rest: 'M14 8v7', beat: 'M14 6v11', duration: 0.8 },
  { rest: 'M18 5v13', beat: 'M18 7v9', duration: 1.5 },
];

const AudioLinesIcon = forwardRef<AudioLinesIconHandle, AudioLinesIconProps>(
  ({ onMouseEnter, onMouseLeave, className, size = 28, ...props }, ref) => {
    const controls = useAnimation();
    const isControlledRef = useRef(false);

    useImperativeHandle(ref, () => {
      isControlledRef.current = true;
      return {
        startAnimation: () => controls.start('animate'),
        stopAnimation: () => controls.start('normal'),
      };
    });

    const handleMouseEnter = useCallback(
      (e: React.MouseEvent<HTMLDivElement>) => {
        if (isControlledRef.current) onMouseEnter?.(e);
        else controls.start('animate');
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
          <path d="M2 10v3" />
          {BARS.map((bar) => (
            <m.path
              animate={controls}
              d={bar.rest}
              initial="normal"
              key={bar.rest}
              variants={{
                normal: { d: bar.rest },
                animate: {
                  d: [bar.rest, bar.beat, bar.rest],
                  transition: { duration: bar.duration, repeat: Number.POSITIVE_INFINITY },
                },
              }}
            />
          ))}
          <path d="M22 10v3" />
        </svg>
      </div>
    );
  },
);

AudioLinesIcon.displayName = 'AudioLinesIcon';

export { AudioLinesIcon };
