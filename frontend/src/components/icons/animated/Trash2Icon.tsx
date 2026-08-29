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

export interface Trash2IconHandle {
  startAnimation: () => void;
  stopAnimation: () => void;
}

interface Trash2IconProps
  extends Omit<HTMLAttributes<HTMLDivElement>, 'color' | 'onDrag' | 'onDragStart' | 'onDragEnd' | 'onAnimationStart' | 'onAnimationEnd' | 'onAnimationIteration'> {
  size?: number;
  duration?: number;
  isAnimated?: boolean;
  color?: string;
}

const Trash2Icon = forwardRef<Trash2IconHandle, Trash2IconProps>(
  ({ onMouseEnter, onMouseLeave, className, size = 24, duration = 1, isAnimated = true, color, ...props }, ref) => {
    const binControls = useAnimation();
    const lidControls = useAnimation();
    const barControls = useAnimation();
    const reduced = useReducedMotion();
    const isControlled = useRef(false);

    useImperativeHandle(ref, () => {
      isControlled.current = true;
      return {
        startAnimation: () => {
          const state = reduced ? 'normal' : 'animate';
          void binControls.start(state);
          void lidControls.start(state);
          void barControls.start(state);
        },
        stopAnimation: () => {
          void binControls.start('normal');
          void lidControls.start('normal');
          void barControls.start('normal');
        },
      };
    });

    const handleEnter = useCallback((event: React.MouseEvent<HTMLDivElement>) => {
      if (!isAnimated || reduced) return;
      if (!isControlled.current) {
        void binControls.start('animate');
        void lidControls.start('animate');
        void barControls.start('animate');
      } else onMouseEnter?.(event);
    }, [barControls, binControls, isAnimated, lidControls, onMouseEnter, reduced]);

    const handleLeave = useCallback((event: React.MouseEvent<HTMLDivElement>) => {
      if (!isControlled.current) {
        void binControls.start('normal');
        void lidControls.start('normal');
        void barControls.start('normal');
      } else onMouseLeave?.(event);
    }, [barControls, binControls, lidControls, onMouseLeave]);

    const binVariants: Variants = {
      normal: { scaleY: 1, y: 0 },
      animate: { y: [0, 0, 1, 0], scaleY: [1, 1, 0.94, 1], transition: { duration: 0.9 * duration, times: [0, 0.55, 0.75, 1], ease: 'easeOut' } },
    };
    const lidVariants: Variants = {
      normal: { rotate: 0 },
      animate: { rotate: [0, -24, -24, 0], transition: { duration: 0.9 * duration, times: [0, 0.2, 0.55, 1], ease: 'easeInOut' } },
    };
    const barVariants: Variants = {
      normal: { y: 0, opacity: 1 },
      animate: { y: [0, 5, 5, 0], opacity: [1, 0, 0, 1], transition: { duration: 0.9 * duration, times: [0, 0.35, 0.6, 1], ease: 'easeInOut' } },
    };

    return (
      <m.div className={cn('inline-flex items-center justify-center', className)} onMouseEnter={handleEnter} onMouseLeave={handleLeave} {...props} style={{ color, ...props.style }}>
        <m.svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <m.path d="M10 11v6" animate={barControls} initial="normal" variants={barVariants} />
          <m.path d="M14 11v6" animate={barControls} initial="normal" variants={barVariants} />
          <m.path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" animate={binControls} initial="normal" variants={binVariants} style={{ transformBox: 'view-box', originX: '12px', originY: '22px' }} />
          <m.g animate={lidControls} initial="normal" variants={lidVariants} style={{ transformBox: 'view-box', originX: '3px', originY: '6px' }}>
            <m.path d="M3 6h18" />
            <m.path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
          </m.g>
        </m.svg>
      </m.div>
    );
  },
);

Trash2Icon.displayName = 'Trash2Icon';
export { Trash2Icon };
