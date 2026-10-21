'use client';

import type { HTMLAttributes } from 'react';
import { forwardRef, useCallback, useImperativeHandle, useRef } from 'react';
import { useAnimation, useReducedMotion, motion } from 'motion/react';
import type { Transition } from 'motion/react';
import { cn } from '@/lib/utils';

export interface SquareChevronUpIconHandle {
  startAnimation: () => void;
  stopAnimation: () => void;
}
interface SquareChevronUpIconProps extends Omit<HTMLAttributes<HTMLDivElement>, 'onAnimationStart' | 'onAnimationEnd'> {
  size?: number;
  direction?: 'up' | 'down';
}
const DEFAULT_TRANSITION: Transition = { times: [0, .4, 1], duration: .5 };

const SquareChevronUpIcon = forwardRef<SquareChevronUpIconHandle, SquareChevronUpIconProps>(
  ({ onMouseEnter, onMouseLeave, className, size = 28, direction = 'up', ...props }, ref) => {
    const controls = useAnimation();
    const controlled = useRef(false);
    const reduced = useReducedMotion();
    useImperativeHandle(ref, () => {
      controlled.current = true;
      return {
        startAnimation: () => controls.start(reduced ? 'normal' : 'animate'),
        stopAnimation: () => controls.start('normal'),
      };
    }, [controls, reduced]);
    const enter = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
      if (!controlled.current && !reduced) void controls.start('animate');
      onMouseEnter?.(e);
    }, [controls, reduced, onMouseEnter]);
    const leave = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
      void controls.start('normal');
      onMouseLeave?.(e);
    }, [controls, onMouseLeave]);
    return <div className={cn('inline-flex items-center justify-center', className)}
      onMouseEnter={enter} onMouseLeave={leave} {...props}>
      <svg fill="none" width={size} height={size} stroke="currentColor" strokeLinecap="round" strokeLinejoin="round"
        strokeWidth="2" viewBox="0 0 24 24" aria-hidden="true">
        <rect height="18" rx="2" width="18" x="3" y="3" />
        <motion.path animate={controls} d={direction === 'down' ? 'm8 10 4 4 4-4' : 'm8 14 4-4 4 4'}
          transition={DEFAULT_TRANSITION} variants={{
            normal: { y: 0 },
            animate: { y: direction === 'down' ? [0, 2, 0] : [0, -2, 0] },
          }} />
      </svg>
    </div>;
  },
);
SquareChevronUpIcon.displayName = 'SquareChevronUpIcon';
export { SquareChevronUpIcon };
