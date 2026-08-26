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

export interface CatIconHandle {
  startAnimation: () => void;
  stopAnimation: () => void;
}

interface CatIconProps
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
 * The companion's own mark: a cat that tilts its head and blinks.
 *
 * The blink is a `scaleY` on the two eye ticks rather than an opacity fade, because
 * the eyes are 0.5px strokes — fading them reads as the icon dimming, while squashing
 * them reads as a blink. The head tilt carries the rest of the motion so the icon still
 * says something at 14px, where a blink alone would be invisible.
 */
const CatIcon = forwardRef<CatIconHandle, CatIconProps>(
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
    const headControls = useAnimation();
    const eyeControls = useAnimation();
    const reduced = useReducedMotion();
    const isControlled = useRef(false);

    useImperativeHandle(ref, () => {
      isControlled.current = true;
      return {
        startAnimation: () => {
          const target = reduced ? 'normal' : 'animate';
          headControls.start(target);
          eyeControls.start(target);
        },
        stopAnimation: () => {
          headControls.start('normal');
          eyeControls.start('normal');
        },
      };
    });

    const handleEnter = useCallback(
      (e: React.MouseEvent<HTMLDivElement>) => {
        if (!isAnimated || reduced) return;
        if (!isControlled.current) {
          headControls.start('animate');
          eyeControls.start('animate');
        } else {
          onMouseEnter?.(e);
        }
      },
      [headControls, eyeControls, reduced, onMouseEnter, isAnimated],
    );

    const handleLeave = useCallback(
      (e: React.MouseEvent<HTMLDivElement>) => {
        if (!isControlled.current) {
          headControls.start('normal');
          eyeControls.start('normal');
        } else {
          onMouseLeave?.(e);
        }
      },
      [headControls, eyeControls, onMouseLeave],
    );

    const headVariants: Variants = {
      normal: { rotate: 0, y: 0 },
      animate: {
        rotate: [0, -6, 5, 0],
        y: [0, -1, 0.5, 0],
        transition: { duration: 0.9 * duration, ease: 'easeInOut' },
      },
    };

    const eyeVariants: Variants = {
      normal: { scaleY: 1 },
      animate: {
        scaleY: [1, 0.1, 1],
        transition: { duration: 0.45 * duration, ease: 'easeInOut', delay: 0.35 },
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
          animate={headControls}
          initial="normal"
          variants={headVariants}
          style={{ originX: 0.5, originY: 0.75 }}
        >
          <path d="M12 5c.67 0 1.35.09 2 .26 1.78-2 5.03-2.84 6.42-2.26 1.4.58-.42 7-.42 7 .57 1.07 1 2.24 1 3.44C21 17.9 16.97 21 12 21s-9-3-9-7.56c0-1.25.5-2.4 1-3.44 0 0-1.89-6.42-.5-7 1.39-.58 4.72.23 6.5 2.23A9.04 9.04 0 0 1 12 5Z" />
          <m.path
            d="M8 14v.5"
            animate={eyeControls}
            initial="normal"
            variants={eyeVariants}
            style={{ originY: 0.5 }}
          />
          <m.path
            d="M16 14v.5"
            animate={eyeControls}
            initial="normal"
            variants={eyeVariants}
            style={{ originY: 0.5 }}
          />
          <path d="M11.25 16.25h1.5L12 17l-.75-.75Z" />
        </m.svg>
      </m.div>
    );
  },
);

CatIcon.displayName = 'CatIcon';
export { CatIcon };
