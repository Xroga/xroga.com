'use client';

import { cn } from '@/lib/utils';
import type { Variants } from 'motion/react';
import { useAnimation, useReducedMotion } from 'motion/react';
import * as m from 'motion/react-m';
import { forwardRef, useCallback, useImperativeHandle, useRef, type HTMLAttributes } from 'react';

export interface ShareIconHandle {
  startAnimation: () => void;
  stopAnimation: () => void;
}

interface ShareIconProps
  extends Omit<HTMLAttributes<HTMLDivElement>, 'color' | 'onDrag' | 'onDragStart' | 'onDragEnd' | 'onAnimationStart' | 'onAnimationEnd' | 'onAnimationIteration'> {
  size?: number;
  duration?: number;
  isAnimated?: boolean;
  color?: string;
}

const ShareIcon = forwardRef<ShareIconHandle, ShareIconProps>(
  ({ onMouseEnter, onMouseLeave, className, size = 24, duration = 1, isAnimated = true, color, ...props }, ref) => {
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

    const handleEnter = useCallback((event: React.MouseEvent<HTMLDivElement>) => {
      if (!isAnimated || reduced) return;
      if (!isControlled.current) void controls.start('animate');
      else onMouseEnter?.(event);
    }, [controls, isAnimated, onMouseEnter, reduced]);

    const handleLeave = useCallback((event: React.MouseEvent<HTMLDivElement>) => {
      if (!isControlled.current) void controls.start('normal');
      else onMouseLeave?.(event);
    }, [controls, onMouseLeave]);

    const nodeVariants = (delay: number): Variants => ({
      normal: { scale: 1, opacity: 1 },
      animate: { scale: [0.6, 1.25, 1], opacity: [0, 1, 1], transition: { duration: 0.4 * duration, times: [0, 0.6, 1], ease: [0.22, 1, 0.36, 1], delay } },
    });
    const lineVariants = (delay: number): Variants => ({
      normal: { strokeDashoffset: 0, opacity: 1 },
      animate: { strokeDashoffset: [9, 0], opacity: [0, 1], transition: { duration: 0.35 * duration, ease: 'easeOut', delay } },
    });

    return (
      <m.div className={cn('inline-flex items-center justify-center', className)} onMouseEnter={handleEnter} onMouseLeave={handleLeave} {...props} style={{ color, ...props.style }}>
        <m.svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" animate={controls} initial="normal">
          <m.circle cx="18" cy="5" r="3" variants={nodeVariants(0.42)} style={{ transformBox: 'view-box', originX: '18px', originY: '5px' }} />
          <m.circle cx="6" cy="12" r="3" variants={nodeVariants(0)} style={{ transformBox: 'view-box', originX: '6px', originY: '12px' }} />
          <m.circle cx="18" cy="19" r="3" variants={nodeVariants(0.48)} style={{ transformBox: 'view-box', originX: '18px', originY: '19px' }} />
          <m.line x1="8.59" y1="13.51" x2="15.42" y2="17.49" strokeDasharray="9" variants={lineVariants(0.18)} />
          <m.line x1="8.59" y1="10.49" x2="15.41" y2="6.51" strokeDasharray="9" variants={lineVariants(0.18)} />
        </m.svg>
      </m.div>
    );
  },
);

ShareIcon.displayName = 'ShareIcon';
export { ShareIcon };
