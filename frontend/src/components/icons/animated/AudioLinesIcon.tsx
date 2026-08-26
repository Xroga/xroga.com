'use client';

import { cn } from '@/lib/utils';
import { IconMotion } from './MotionProvider';
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

export interface AudioLinesIconHandle {
  startAnimation: () => void;
  stopAnimation: () => void;
}

interface AudioLinesIconProps
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
  /**
   * Run until told to stop, rather than playing once.
   *
   * This is what the mic uses: a level meter that settles after one pass says the
   * recording finished, and it has not. Everywhere else a single pass is right.
   */
  loop?: boolean;
}

const PATHS = ['M2 10v3', 'M6 6v11', 'M10 3v18', 'M14 8v7', 'M18 5v13', 'M22 10v3'];

const AudioLinesIcon = forwardRef<AudioLinesIconHandle, AudioLinesIconProps>(
  (
    {
      onMouseEnter,
      onMouseLeave,
      className,
      size = 24,
      duration = 1,
      isAnimated = true,
      color,
      loop = false,
      ...props
    },
    ref,
  ) => {
    const controls = useAnimation();
    const reduced = useReducedMotion();
    const isControlled = useRef(false);

    useImperativeHandle(ref, () => {
      isControlled.current = true;
      return {
        startAnimation: () => (reduced ? controls.start('normal') : controls.start('animate')),
        stopAnimation: () => controls.start('normal'),
      };
    });

    const handleEnter = useCallback(
      (e: React.MouseEvent<HTMLDivElement>) => {
        if (!isAnimated || reduced) return;
        if (!isControlled.current) controls.start('animate');
        else onMouseEnter?.(e);
      },
      [controls, reduced, isAnimated, onMouseEnter],
    );

    const handleLeave = useCallback(
      (e: React.MouseEvent<HTMLDivElement>) => {
        if (!isControlled.current) controls.start('normal');
        else onMouseLeave?.(e);
      },
      [controls, onMouseLeave],
    );

    // Each bar starts a fifth of a second after the one before, so the six read as a
    // level meter responding to a voice rather than six bars moving together.
    const barVariants: Variants = {
      normal: { scaleY: 1, opacity: 1 },
      animate: (i: number) => ({
        scaleY: [1, 1.4, 0.6, 1],
        opacity: [1, 0.8, 1],
        transition: {
          duration: 0.9 * duration,
          repeat: loop ? Number.POSITIVE_INFINITY : 0,
          delay: i * 0.2,
          ease: 'easeInOut',
        },
      }),
    };

    /*
     * Wraps its own provider.
     *
     * Every other icon here is rendered through `AnimatedIcon`, which supplies the
     * `LazyMotion` these `m` components need. The mic renders this one directly, so
     * it can drive the meter from the recording state — and without a provider of its
     * own that made `m.path` a plain path with no animation features loaded. It read
     * as a static glyph: measured, opacity held at 1 and the transform at `none` for
     * the whole run. Nested providers are harmless; an absent one is not.
     */
    return (
      <IconMotion>
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
          animate={controls}
          initial="normal"
        >
          {PATHS.map((d, i) => (
            <m.path key={d} d={d} variants={barVariants} custom={i} style={{ originY: 0.5 }} />
          ))}
        </m.svg>
      </m.div>
      </IconMotion>
    );
  },
);

AudioLinesIcon.displayName = 'AudioLinesIcon';
export { AudioLinesIcon };
