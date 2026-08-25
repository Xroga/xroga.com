'use client';

import type { Variants } from 'motion/react';
import * as m from 'motion/react-m';
import { useAnimation } from 'motion/react';
import type { HTMLAttributes } from 'react';
import { forwardRef, useCallback, useImperativeHandle, useRef } from 'react';

import { cn } from '@/lib/utils';

export interface ConnectIconHandle {
  startAnimation: () => void;
  stopAnimation: () => void;
}

interface ConnectIconProps
  extends Omit<
    HTMLAttributes<HTMLDivElement>,
    'onDrag' | 'onDragStart' | 'onDragEnd' | 'onAnimationStart' | 'onAnimationEnd' | 'onAnimationIteration'
  > {
  size?: number;
}

const SPRING = { type: 'spring', stiffness: 500, damping: 30 } as const;

const PLUG_VARIANTS: Variants = {
  normal: { x: 0, y: 0 },
  animate: { x: -3, y: 3 },
};

const SOCKET_VARIANTS: Variants = {
  normal: { x: 0, y: 0 },
  animate: { x: 3, y: -3 },
};

const PATH_VARIANTS: Variants = {
  normal: (custom: { x: number; y: number }) => ({ d: `M${custom.x} ${custom.y} l2.5 -2.5` }),
  animate: (custom: { x: number; y: number }) => ({
    d: `M${custom.x + 2.93} ${custom.y - 2.93} l0.10 -0.10`,
  }),
};

const ConnectIcon = forwardRef<ConnectIconHandle, ConnectIconProps>(
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
            <m.path
              animate={controls}
              d="M19 5l3 -3"
              initial="normal"
              transition={SPRING}
              variants={{ normal: { d: 'M19 5l3 -3' }, animate: { d: 'M17 7l5 -5' } }}
            />
            <m.path
              animate={controls}
              d="m2 22 3-3"
              initial="normal"
              transition={SPRING}
              variants={{ normal: { d: 'm2 22 3-3' }, animate: { d: 'm2 22 6-6' } }}
            />
            <m.path
              animate={controls}
              d="M6.3 20.3a2.4 2.4 0 0 0 3.4 0L12 18l-6-6-2.3 2.3a2.4 2.4 0 0 0 0 3.4Z"
              initial="normal"
              transition={SPRING}
              variants={SOCKET_VARIANTS}
            />
            <m.path
              animate={controls}
              custom={{ x: 7.5, y: 13.5 }}
              initial="normal"
              transition={SPRING}
              variants={PATH_VARIANTS}
            />
            <m.path
              animate={controls}
              custom={{ x: 10.5, y: 16.5 }}
              initial="normal"
              transition={SPRING}
              variants={PATH_VARIANTS}
            />
            <m.path
              animate={controls}
              d="m12 6 6 6 2.3-2.3a2.4 2.4 0 0 0 0-3.4l-2.6-2.6a2.4 2.4 0 0 0-3.4 0Z"
              initial="normal"
              transition={SPRING}
              variants={PLUG_VARIANTS}
            />
          </svg>
        </div>
    );
  },
);

ConnectIcon.displayName = 'ConnectIcon';

export { ConnectIcon };
