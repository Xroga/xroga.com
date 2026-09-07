'use client';

import type { Transition } from 'motion/react';
import * as m from 'motion/react-m';
import { useAnimation } from 'motion/react';
import type { HTMLAttributes } from 'react';
import { forwardRef, useCallback, useImperativeHandle, useRef } from 'react';
import { cn } from '@/lib/utils';

export interface ChevronsUpDownIconHandle {
  startAnimation: () => void;
  stopAnimation: () => void;
}

interface ChevronsUpDownIconProps
  extends Omit<
    HTMLAttributes<HTMLDivElement>,
    'onDrag' | 'onDragStart' | 'onDragEnd' | 'onAnimationStart' | 'onAnimationEnd' | 'onAnimationIteration'
  > {
  size?: number;
}

const DEFAULT_TRANSITION: Transition = { type: 'spring', stiffness: 250, damping: 25 };

const ChevronsUpDownIcon = forwardRef<ChevronsUpDownIconHandle, ChevronsUpDownIconProps>(
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
      (event: React.MouseEvent<HTMLDivElement>) => {
        if (isControlledRef.current) onMouseEnter?.(event);
        else controls.start('animate');
      },
      [controls, onMouseEnter],
    );

    const handleMouseLeave = useCallback(
      (event: React.MouseEvent<HTMLDivElement>) => {
        if (isControlledRef.current) onMouseLeave?.(event);
        else controls.start('normal');
      },
      [controls, onMouseLeave],
    );

    return (
      <div className={cn('inline-flex items-center justify-center', className)} onMouseEnter={handleMouseEnter} onMouseLeave={handleMouseLeave} {...props}>
        <svg fill="none" height={size} stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 24 24" width={size} aria-hidden="true">
          <m.path animate={controls} d="m7 15 5 5 5-5" initial="normal" transition={DEFAULT_TRANSITION} variants={{ normal: { translateY: '0%' }, animate: { translateY: '2px' } }} />
          <m.path animate={controls} d="m7 9 5-5 5 5" initial="normal" transition={DEFAULT_TRANSITION} variants={{ normal: { translateY: '0%' }, animate: { translateY: '-2px' } }} />
        </svg>
      </div>
    );
  },
);

ChevronsUpDownIcon.displayName = 'ChevronsUpDownIcon';

export { ChevronsUpDownIcon };
