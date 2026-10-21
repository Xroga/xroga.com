'use client';

import { motion, useAnimation } from 'motion/react';
import type { HTMLAttributes } from 'react';
import {
  forwardRef,
  useCallback,
  useImperativeHandle,
  useRef,
} from 'react';

import { cn } from '@/lib/utils';

export interface AudioLinesIconHandle {
  startAnimation: () => void;
  stopAnimation: () => void;
}

interface AudioLinesIconProps extends HTMLAttributes<HTMLDivElement> {
  size?: number;
  active?: boolean;
}

const AudioLinesIcon = forwardRef<AudioLinesIconHandle, AudioLinesIconProps>(
  ({ onMouseEnter, onMouseLeave, className, size = 28, active = false, ...props }, ref) => {
    const controls = useAnimation();
    const isControlledRef = useRef(false);

    useImperativeHandle(ref, () => {
      isControlledRef.current = true;
      return {
        startAnimation: () => void controls.start('animate'),
        stopAnimation: () => void controls.start('normal'),
      };
    });

    const handleMouseEnter = useCallback(
      (event: React.MouseEvent<HTMLDivElement>) => {
        if (isControlledRef.current) {
          onMouseEnter?.(event);
          return;
        }
        void controls.start('animate');
      },
      [controls, onMouseEnter],
    );

    const handleMouseLeave = useCallback(
      (event: React.MouseEvent<HTMLDivElement>) => {
        if (isControlledRef.current) {
          onMouseLeave?.(event);
          return;
        }
        void controls.start(active ? 'animate' : 'normal');
      },
      [active, controls, onMouseLeave],
    );

    const barVariants = (scale: number, delay: number) => ({
      normal: { scaleY: 1 },
      animate: {
        scaleY: [1, scale, 1],
        transition: { duration: .6, ease: 'easeInOut' as const, delay },
      },
    });

    return (
      <div className={cn('inline-flex items-center justify-center', className)}
        onMouseEnter={handleMouseEnter} onMouseLeave={handleMouseLeave} {...props}>
        <svg fill="none" height={size} stroke="currentColor" strokeLinecap="round"
          strokeLinejoin="round" strokeWidth="2" viewBox="0 0 24 24" width={size} aria-hidden="true">
          {[
            { x: 2, d: 'M2 10v3', scale: 2.4, delay: 0 },
            { x: 6, d: 'M6 6v11', scale: .55, delay: .05 },
            { x: 10, d: 'M10 3v18', scale: .55, delay: .1 },
            { x: 14, d: 'M14 8v7', scale: 1.7, delay: .15 },
            { x: 18, d: 'M18 5v13', scale: .6, delay: .2 },
            { x: 22, d: 'M22 10v3', scale: 2.4, delay: .25 },
          ].map(bar => <motion.path key={bar.x} d={bar.d} animate={active ? 'animate' : controls}
            variants={barVariants(bar.scale, bar.delay)}
            style={{ transformBox: 'view-box', originX: `${bar.x}px`, originY: '12px' }} />)}
        </svg>
      </div>
    );
  },
);

AudioLinesIcon.displayName = 'AudioLinesIcon';

export { AudioLinesIcon };
