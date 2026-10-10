'use client';

import type { Variants } from 'motion/react';
import { useAnimation, useReducedMotion } from 'motion/react';
import * as m from 'motion/react-m';
import { forwardRef, useCallback, useImperativeHandle, useRef, type HTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

/** Publish icon using the provided looping launch and morphing exhaust animation. */
export interface RocketIconHandle {
  startAnimation: () => void;
  stopAnimation: () => void;
}
interface RocketIconProps extends Omit<HTMLAttributes<HTMLDivElement>,
  'color' | 'onDrag' | 'onDragStart' | 'onDragEnd' |
  'onAnimationStart' | 'onAnimationEnd' | 'onAnimationIteration'> {
  size?: number;
}
const ROCKET_VARIANTS: Variants = {
  normal: { x: 0, y: 0 },
  animate: {
    x: [0, 0, -3, 2, -2, 1, -1, 0],
    y: [0, -3, 0, -2, -3, -1, -2, 0],
    transition: {
      duration: 6, ease: 'easeInOut', repeat: Infinity,
      repeatType: 'reverse', times: [0, 0.15, 0.3, 0.45, 0.6, 0.75, 0.9, 1],
    },
  },
};
const FIRE_VARIANTS: Variants = {
  normal: {
    d: 'M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09z',
  },
  animate: {
    d: [
      'M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09z',
      'M4.5 16.5c-1.5 1.26-3 5.5-3 5.5s4.74-1 6-2.5c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09z',
      'M4.5 16.5c-1.5 1.26-2.2 4.8-2.2 4.8s3.94-0.3 5.2-1.8c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09z',
      'M4.5 16.5c-1.5 1.26-2.8 5.2-2.8 5.2s4.54-0.7 5.8-2.2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09z',
      'M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09z',
    ],
    transition: { duration: 2, ease: [0.4, 0, 0.2, 1], repeat: Infinity, times: [0, 0.2, 0.5, 0.8, 1] },
  },
};

const RocketIcon = forwardRef<RocketIconHandle, RocketIconProps>(
  ({ onMouseEnter, onMouseLeave, className, size = 28, ...props }, ref) => {
    const controls = useAnimation();
    const reduced = useReducedMotion();
    const controlled = useRef(false);

    useImperativeHandle(ref, () => {
      controlled.current = true;
      return {
        startAnimation: () => controls.start(reduced ? 'normal' : 'animate'),
        stopAnimation: () => controls.start('normal'),
      };
    });
    const enter = useCallback((event: React.MouseEvent<HTMLDivElement>) => {
      if (controlled.current) onMouseEnter?.(event);
      else if (!reduced) controls.start('animate');
    }, [controls, onMouseEnter, reduced]);
    const leave = useCallback((event: React.MouseEvent<HTMLDivElement>) => {
      if (controlled.current) onMouseLeave?.(event);
      else controls.start('normal');
    }, [controls, onMouseLeave]);

    return (
      <div className={cn('inline-flex items-center justify-center', className)}
        onMouseEnter={enter} onMouseLeave={leave} {...props}>
        <m.svg animate={controls} initial="normal" variants={ROCKET_VARIANTS}
          fill="none" height={size} stroke="currentColor" strokeLinecap="round"
          strokeLinejoin="round" strokeWidth="2" viewBox="0 0 24 24"
          width={size} xmlns="http://www.w3.org/2000/svg">
          <m.path animate={controls} variants={FIRE_VARIANTS}
            d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09z" />
          <path d="m12 15-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22 22 0 0 1-4 2z" />
          <path d="M9 12H4s.55-3.03 2-4c1.62-1.08 5 0 5 0" />
          <path d="M12 15v5s3.03-.55 4-2c1.08-1.62 0-5 0-5" />
        </m.svg>
      </div>
    );
  },
);
RocketIcon.displayName = 'RocketIcon';
export { RocketIcon };
