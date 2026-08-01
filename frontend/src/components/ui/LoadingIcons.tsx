'use client';

import { cn } from '@/lib/utils';
import type { Variants } from 'motion/react';
import { LazyMotion, domMin, m, useAnimation, useReducedMotion } from 'motion/react';
import {
  forwardRef,
  useCallback,
  useImperativeHandle,
  useRef,
  type HTMLAttributes,
  type MouseEvent,
} from 'react';

/**
 * The two spinners.
 *
 * Supplied as two standalone components that were byte-identical apart from their
 * SVG paths — same props, same handle, same variants, same ~100 lines of controller
 * logic. They are kept as two exports because callers ask for them by name, but the
 * shared half lives in `SpinnerBase` so a fix to the animation or the reduced-motion
 * handling cannot land in one and be forgotten in the other.
 *
 * `LazyMotion` with `domMin` is what keeps these cheap: it loads the minimal motion
 * feature set rather than the full bundle, which matters because these render on
 * routes that are already waiting on something.
 */

export interface LoadingIconHandle {
  startAnimation: () => void;
  stopAnimation: () => void;
}

type LoadingIconProps = Omit<
  HTMLAttributes<HTMLDivElement>,
  | 'color'
  | 'onDrag'
  | 'onDragStart'
  | 'onDragEnd'
  | 'onAnimationStart'
  | 'onAnimationEnd'
  | 'onAnimationIteration'
> & {
  size?: number;
  duration?: number;
  isAnimated?: boolean;
  color?: string;
  /**
   * Spin without waiting for hover or an imperative call. Route and button spinners
   * are already-loading states, so they must animate on mount — hover-to-start would
   * leave a frozen icon during the wait it exists to explain.
   */
  spinning?: boolean;
};

const loaderVariants = (duration: number): Variants => ({
  normal: { rotate: 0, scale: 1, transition: { duration: 0.3 * duration } },
  animate: {
    rotate: 360,
    scale: [1, 1.1, 1],
    transition: {
      rotate: { duration: 1 * duration, ease: 'linear', repeat: Infinity },
      scale: { duration: 0.6 * duration, repeat: Infinity, repeatType: 'mirror' },
    },
  },
});

const SpinnerBase = forwardRef<
  LoadingIconHandle,
  LoadingIconProps & { paths: readonly string[]; label: string }
>(
  (
    {
      onMouseEnter,
      onMouseLeave,
      className,
      size = 24,
      duration = 1,
      isAnimated = true,
      spinning = false,
      color,
      paths,
      label,
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
      (event: MouseEvent<HTMLDivElement>) => {
        if (!isAnimated || reduced || spinning) return;
        if (!isControlled.current) void controls.start('animate');
        else onMouseEnter?.(event);
      },
      [controls, reduced, isAnimated, spinning, onMouseEnter],
    );

    const handleLeave = useCallback(
      (event: MouseEvent<HTMLDivElement>) => {
        if (spinning) return;
        if (!isControlled.current) void controls.start('normal');
        else onMouseLeave?.(event);
      },
      [controls, spinning, onMouseLeave],
    );

    // A spinner that keeps turning under `prefers-reduced-motion` is exactly the kind
    // of persistent motion that setting exists to stop, so it rests instead.
    const animate = spinning && !reduced ? 'animate' : controls;

    return (
      <LazyMotion features={domMin} strict>
        <m.div
          className={cn('inline-flex items-center justify-center', className)}
          onMouseEnter={handleEnter}
          onMouseLeave={handleLeave}
          role="status"
          aria-label={label}
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
            initial="normal"
            animate={animate}
            variants={loaderVariants(duration)}
            style={{ transformOrigin: 'center' }}
            aria-hidden="true"
          >
            {paths.map((d) => (
              <path key={d} d={d} />
            ))}
          </m.svg>
        </m.div>
      </LazyMotion>
    );
  },
);
SpinnerBase.displayName = 'SpinnerBase';

/** Eight spokes. */
const LOADING_01_PATHS = [
  'M12 3V6',
  'M12 18V21',
  'M21 12L18 12',
  'M6 12L3 12',
  'M18.3635 5.63672L16.2422 7.75804',
  'M7.75804 16.2422L5.63672 18.3635',
  'M18.3635 18.3635L16.2422 16.2422',
  'M7.75804 7.75804L5.63672 5.63672',
] as const;

/** A broken ring. */
const LOADING_02_PATHS = [
  'M18.001 20C16.3295 21.2558 14.2516 22 12 22C6.47715 22 2 17.5228 2 12C2 6.47715 6.47715 2 12 2C17.5228 2 22 6.47715 22 12C22 12.8634 21.8906 13.7011 21.6849 14.5003C21.4617 15.3673 20.5145 15.77 19.6699 15.4728C18.9519 15.2201 18.6221 14.3997 18.802 13.66C18.9314 13.1279 19 12.572 19 12C19 8.13401 15.866 5 12 5C8.13401 5 5 8.13401 5 12C5 15.866 8.13401 19 12 19C13.3197 19 14.554 18.6348 15.6076 18',
] as const;

export const Loading01Icon = forwardRef<LoadingIconHandle, LoadingIconProps>((props, ref) => (
  <SpinnerBase ref={ref} paths={LOADING_01_PATHS} label="Loading" {...props} />
));
Loading01Icon.displayName = 'Loading01Icon';

export const Loading02Icon = forwardRef<LoadingIconHandle, LoadingIconProps>((props, ref) => (
  <SpinnerBase ref={ref} paths={LOADING_02_PATHS} label="Loading" {...props} />
));
Loading02Icon.displayName = 'Loading02Icon';
