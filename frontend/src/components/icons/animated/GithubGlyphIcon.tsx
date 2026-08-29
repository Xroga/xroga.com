'use client';

import { cn } from '@/lib/utils';
import type { Variants } from 'motion/react';
import * as m from 'motion/react-m';
import { useAnimation, useReducedMotion } from 'motion/react';
import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  type HTMLAttributes,
} from 'react';
import { IconMotion } from './MotionProvider';

export interface GithubGlyphIconHandle {
  startAnimation: () => void;
  stopAnimation: () => void;
}

interface GithubGlyphIconProps
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

const GithubGlyphIcon = forwardRef<GithubGlyphIconHandle, GithubGlyphIconProps>(
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
      [controls, reduced, onMouseEnter, isAnimated],
    );

    const handleLeave = useCallback(
      (e: React.MouseEvent<HTMLDivElement>) => {
        if (!isControlled.current) controls.start('normal');
        else onMouseLeave?.(e);
      },
      [controls, onMouseLeave],
    );

    const svgVariants: Variants = {
      normal: { scale: 1, transition: { duration: 0.3 * duration } },
      animate: { scale: [1, 1.05, 1], transition: { duration: 1 * duration } },
    };

    const bodyVariants: Variants = {
      normal: { pathLength: 1, pathOffset: 0, opacity: 1, transition: { duration: 0.3 * duration } },
      animate: {
        pathLength: [1, 0.6, 1],
        pathOffset: [0, 0.4, 0],
        opacity: [1, 0.7, 1],
        transition: { duration: 1 * duration },
      },
    };

    /*
     * The tail waves once and stops.
     *
     * It arrived with `repeat: Infinity`, which would have left every GitHub mark on
     * the site — the footers, both auth forms, four landing pages — waving forever
     * after the first hover. The host tells an icon to rest, and an endless loop is
     * the one thing that will not.
     */
    const handVariants: Variants = {
      normal: { rotate: 0, originX: 0.9, originY: 0.5 },
      animate: {
        rotate: [0, 20, -15, 0],
        originX: 0.9,
        originY: 0.5,
        transition: {
          duration: 2.4 * duration,
          repeat: Number.POSITIVE_INFINITY,
          ease: 'easeInOut',
        },
      },
    };

    /*
     * This one runs on its own, like the terminal's cursor.
     *
     * The mark stands for the connection the whole product rests on, and it appears
     * on surfaces nobody points at — a footer, a signup form, a showcase row read
     * rather than clicked. Waiting for a hover would mean it never moves in most of
     * the places it is used.
     *
     * The loop is slow on purpose: at hover speed, forever, it competes with the text
     * beside it. Reduced motion holds it still, and the mark is perfectly legible
     * still — the waving arm is the only thing that costs.
     */
    useEffect(() => {
      controls.start(reduced ? 'normal' : 'animate');
    }, [controls, reduced]);

    /*
     * A span, not a div.
     *
     * This mark sits in running text — "<GitHubIcon /> Your repository" in the ship
     * stack, a footer line, a showcase row — and a `div` inside a `p` is invalid HTML
     * that React reports as a hydration mismatch (#418). Every other icon here lives
     * in a button or a nav row, where it never comes up.
     *
     * The handler types stay div-shaped on purpose: they are what makes this satisfy
     * `AnimatedIconComponent` alongside the seventeen div-rooted icons. Widening the
     * shared type instead breaks every one of them, because a handler taking the
     * narrower element cannot accept the wider one.
     */
    return (
      <IconMotion>
        <m.span
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
            variants={svgVariants}
            initial="normal"
            animate={controls}
          >
            <m.path
              d="M15 22v-4a4.8 4.8 0 0 0-1-3.5c3 0 6-2 6-5.5.08-1.25-.27-2.48-1-3.5.28-1.15.28-2.35 0-3.5 0 0-1 0-3 1.5-2.64-.5-5.36-.5-8 0C6 2 5 2 5 2c-.3 1.15-.3 2.35 0 3.5A5.403 5.403 0 0 0 4 9c0 3.5 3 5.5 6 5.5-.39.49-.68 1.05-.85 1.65-.17.6-.22 1.23-.15 1.85v4"
              variants={bodyVariants}
              initial="normal"
            />
            <m.path d="M9 18c-4.51 2-5-2-7-2" variants={handVariants} initial="normal" animate={controls} />
          </m.svg>
        </m.span>
      </IconMotion>
    );
  },
);

GithubGlyphIcon.displayName = 'GithubGlyphIcon';
export { GithubGlyphIcon };
