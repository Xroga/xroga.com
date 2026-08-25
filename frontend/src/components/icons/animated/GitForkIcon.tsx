'use client';

import * as m from 'motion/react-m';
import { useAnimation } from 'motion/react';
import type { HTMLAttributes } from 'react';
import { forwardRef, useCallback, useImperativeHandle, useRef } from 'react';

import { cn } from '@/lib/utils';

export interface GitForkIconHandle {
  startAnimation: () => void;
  stopAnimation: () => void;
}

interface GitForkIconProps
  extends Omit<
    HTMLAttributes<HTMLDivElement>,
    'onDrag' | 'onDragStart' | 'onDragEnd' | 'onAnimationStart' | 'onAnimationEnd' | 'onAnimationIteration'
  > {
  size?: number;
}

const DURATION = 0.3;

/** The two parents draw last, so the fork assembles from the child upward. */
const CALCULATE_DELAY = (i: number) => (i === 0 ? 0.1 : i * DURATION + 0.1);

const NODE_VARIANTS = {
  normal: { pathLength: 1, opacity: 1, transition: { delay: 0 } },
  animate: { pathLength: [0, 1], opacity: [0, 1] },
};

const EDGE_VARIANTS = {
  normal: { pathLength: 1, pathOffset: 0, opacity: 1, transition: { delay: 0 } },
  animate: { pathLength: [0, 1], opacity: [0, 1], pathOffset: [1, 0] },
};

const timing = (i: number) => ({
  duration: DURATION,
  delay: CALCULATE_DELAY(i),
  opacity: { delay: CALCULATE_DELAY(i) },
});

const GitForkIcon = forwardRef<GitForkIconHandle, GitForkIconProps>(
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
          <m.circle animate={controls} cx="12" cy="18" r="3" initial="normal" transition={timing(0)} variants={NODE_VARIANTS} />
          <m.path
            animate={controls}
            d="M18 9v2c0 .6-.4 1-1 1H7c-.6 0-1-.4-1-1V9"
            initial="normal"
            transition={timing(1)}
            variants={EDGE_VARIANTS}
          />
          <m.circle animate={controls} cx="6" cy="6" r="3" initial="normal" transition={timing(2)} variants={NODE_VARIANTS} />
          <m.circle animate={controls} cx="18" cy="6" r="3" initial="normal" transition={timing(2)} variants={NODE_VARIANTS} />
          <m.path animate={controls} d="M12 12v3" initial="normal" transition={timing(1)} variants={EDGE_VARIANTS} />
        </svg>
      </div>
    );
  },
);

GitForkIcon.displayName = 'GitForkIcon';

export { GitForkIcon };
