'use client';

import { cn } from '@/lib/utils';
import type { Variants } from 'motion/react';
import * as m from 'motion/react-m';
import { useAnimation, useReducedMotion } from 'motion/react';
import {
  forwardRef,
  useCallback,
  useImperativeHandle,
  useRef,
  type HTMLAttributes,
} from 'react';

export interface FilePenIconHandle {
  startAnimation: () => void;
  stopAnimation: () => void;
}

interface FilePenIconProps
  extends Omit<
    HTMLAttributes<HTMLDivElement>,
    | 'color'
    | 'onDrag'
    | 'onDragStart'
    | 'onDragEnd'
    | 'onAnimationStart'
    | 'onAnimationEnd'
    | 'onAnimationIteration'
  > {
  size?: number;
  duration?: number;
  isAnimated?: boolean;
  color?: string;
}

/**
 * A page with a pen on it — the mark for editing project files.
 *
 * Only the pen moves. It travels a short stroke along its own diagonal, which is the
 * gesture of writing rather than of the whole icon wobbling; the page and its folded
 * corner stay put so the shape stays legible while the motion plays.
 */
const FilePenIcon = forwardRef<FilePenIconHandle, FilePenIconProps>(
  (
    {
      onMouseEnter,
      onMouseLeave,
      className,
      size = 24,
      duration = 1,
      isAnimated = true,
      color,
      ...props
    },
    ref,
  ) => {
    const penControls = useAnimation();
    const reduced = useReducedMotion();
    const isControlled = useRef(false);

    useImperativeHandle(ref, () => {
      isControlled.current = true;
      return {
        startAnimation: () => penControls.start(reduced ? 'normal' : 'animate'),
        stopAnimation: () => penControls.start('normal'),
      };
    });

    const handleEnter = useCallback(
      (e: React.MouseEvent<HTMLDivElement>) => {
        if (!isAnimated || reduced) return;
        if (!isControlled.current) penControls.start('animate');
        else onMouseEnter?.(e);
      },
      [penControls, reduced, onMouseEnter, isAnimated],
    );

    const handleLeave = useCallback(
      (e: React.MouseEvent<HTMLDivElement>) => {
        if (!isControlled.current) penControls.start('normal');
        else onMouseLeave?.(e);
      },
      [penControls, onMouseLeave],
    );

    const penVariants: Variants = {
      normal: { x: 0, y: 0, rotate: 0 },
      animate: {
        x: [0, 1.6, -1.2, 0],
        y: [0, -1.6, 1.2, 0],
        rotate: [0, 4, -3, 0],
        transition: { duration: 0.9 * duration, ease: 'easeInOut' },
      },
    };

    return (
      <m.div
        className={cn('inline-flex items-center justify-center', className)}
        onMouseEnter={handleEnter}
        onMouseLeave={handleLeave}
        {...props}
        style={{ color, ...props.style }}
      >
        <m.svg
          xmlns="http://www.w3.org/2000/svg"
          width={size}
          height={size}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M12.659 22H18a2 2 0 0 0 2-2V8a2.4 2.4 0 0 0-.706-1.706l-3.588-3.588A2.4 2.4 0 0 0 14 2H6a2 2 0 0 0-2 2v9.34" />
          <path d="M14 2v5a1 1 0 0 0 1 1h5" />
          <m.path
            d="M10.378 12.622a1 1 0 0 1 3 3.003L8.36 20.637a2 2 0 0 1-.854.506l-2.867.837a.5.5 0 0 1-.62-.62l.836-2.869a2 2 0 0 1 .506-.853z"
            animate={penControls}
            initial="normal"
            variants={penVariants}
          />
        </m.svg>
      </m.div>
    );
  },
);

FilePenIcon.displayName = 'FilePenIcon';
export { FilePenIcon };
