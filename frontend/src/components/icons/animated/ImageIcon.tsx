'use client';

import { cn } from '@/lib/utils';
import type { Variants } from 'motion/react';
import { useAnimation, useReducedMotion } from 'motion/react';
import * as m from 'motion/react-m';
import {
  forwardRef,
  useCallback,
  useImperativeHandle,
  useRef,
  type HTMLAttributes,
} from 'react';

export interface ImageIconHandle {
  startAnimation: () => void;
  stopAnimation: () => void;
}

interface ImageIconProps
  extends Omit<HTMLAttributes<HTMLDivElement>, 'color' | 'onDrag' | 'onDragStart' | 'onDragEnd' | 'onAnimationStart' | 'onAnimationEnd' | 'onAnimationIteration'> {
  size?: number;
  duration?: number;
  isAnimated?: boolean;
  color?: string;
}

const ImageIcon = forwardRef<ImageIconHandle, ImageIconProps>(
  ({ onMouseEnter, onMouseLeave, className, size = 24, duration = 1, isAnimated = true, color, ...props }, ref) => {
    const peakControls = useAnimation();
    const sunControls = useAnimation();
    const reduced = useReducedMotion();
    const isControlled = useRef(false);

    const start = useCallback(() => {
      if (reduced) return;
      void peakControls.start('draw');
      void sunControls.start('draw');
    }, [peakControls, reduced, sunControls]);

    const stop = useCallback(() => {
      void peakControls.start('rest');
      void sunControls.start('rest');
    }, [peakControls, sunControls]);

    useImperativeHandle(ref, () => {
      isControlled.current = true;
      return { startAnimation: start, stopAnimation: stop };
    });

    const handleEnter = useCallback((event: React.MouseEvent<HTMLDivElement>) => {
      if (!isAnimated || reduced) return;
      if (!isControlled.current) start();
      else onMouseEnter?.(event);
    }, [isAnimated, onMouseEnter, reduced, start]);

    const handleLeave = useCallback((event: React.MouseEvent<HTMLDivElement>) => {
      if (!isControlled.current) stop();
      else onMouseLeave?.(event);
    }, [onMouseLeave, stop]);

    const peakVariants: Variants = {
      rest: { pathLength: 1, opacity: 1 },
      draw: {
        pathLength: [0, 1],
        opacity: [0, 1],
        transition: { duration: 0.9 * duration, ease: [0.16, 1, 0.3, 1] },
      },
    };
    const sunVariants: Variants = {
      rest: { scale: 1, opacity: 1 },
      draw: {
        scale: [0, 1.25, 1],
        opacity: [0, 1, 1],
        transition: { duration: 0.8 * duration, ease: [0.34, 1.4, 0.64, 1], delay: 0.3 * duration },
      },
    };

    return (
      <m.div className={cn('inline-flex items-center justify-center', className)} onMouseEnter={handleEnter} onMouseLeave={handleLeave} {...props} style={{ color, ...props.style }}>
        <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect width="18" height="18" x="3" y="3" rx="2" ry="2" />
          <m.circle cx="9" cy="9" r="2" animate={sunControls} initial="rest" variants={sunVariants} style={{ transformBox: 'fill-box', transformOrigin: 'center' }} />
          <m.path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21" animate={peakControls} initial="rest" variants={peakVariants} style={{ transformBox: 'fill-box', transformOrigin: 'center' }} />
        </svg>
      </m.div>
    );
  },
);

ImageIcon.displayName = 'ImageIcon';
export { ImageIcon };
