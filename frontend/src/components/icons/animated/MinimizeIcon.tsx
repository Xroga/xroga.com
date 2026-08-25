'use client';

import type { Transition } from 'motion/react';
import * as m from 'motion/react-m';
import { useAnimation } from 'motion/react';
import type { HTMLAttributes } from 'react';
import { forwardRef, useCallback, useImperativeHandle, useRef } from 'react';

import { cn } from '@/lib/utils';

export interface MinimizeIconHandle {
  startAnimation: () => void;
  stopAnimation: () => void;
}

interface MinimizeIconProps
  extends Omit<
    HTMLAttributes<HTMLDivElement>,
    'onDrag' | 'onDragStart' | 'onDragEnd' | 'onAnimationStart' | 'onAnimationEnd' | 'onAnimationIteration'
  > {
  size?: number;
}

const DEFAULT_TRANSITION: Transition = { type: 'spring', stiffness: 250, damping: 25 };

/** Each corner tucks in towards the middle. */
const CORNERS = [
  { d: 'M8 3v3a2 2 0 0 1-2 2H3', x: '2px', y: '2px' },
  { d: 'M21 8h-3a2 2 0 0 1-2-2V3', x: '-2px', y: '2px' },
  { d: 'M3 16h3a2 2 0 0 1 2 2v3', x: '2px', y: '-2px' },
  { d: 'M16 21v-3a2 2 0 0 1 2-2h3', x: '-2px', y: '-2px' },
];

const MinimizeIcon = forwardRef<MinimizeIconHandle, MinimizeIconProps>(
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
            {CORNERS.map((corner) => (
              <m.path
                animate={controls}
                d={corner.d}
                initial="normal"
                key={corner.d}
                transition={DEFAULT_TRANSITION}
                variants={{
                  normal: { translateX: '0%', translateY: '0%' },
                  animate: { translateX: corner.x, translateY: corner.y },
                }}
              />
            ))}
          </svg>
        </div>
    );
  },
);

MinimizeIcon.displayName = 'MinimizeIcon';

export { MinimizeIcon };
