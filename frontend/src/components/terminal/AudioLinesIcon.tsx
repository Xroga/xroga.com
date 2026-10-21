'use client';
import { LazyMotion, domMin, m, useAnimation, useReducedMotion } from 'motion/react';
import type { Variants } from 'motion/react';
import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, type HTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

export interface AudioLinesIconHandle { startAnimation: () => void; stopAnimation: () => void; }
interface AudioLinesIconProps extends Omit<HTMLAttributes<HTMLDivElement>,
  'color' | 'onDrag' | 'onDragStart' | 'onDragEnd' | 'onAnimationStart' | 'onAnimationEnd' | 'onAnimationIteration'> {
  size?: number; duration?: number; isAnimated?: boolean; color?: string; active?: boolean;
}
const BARS = [
  { x: 2, d: 'M2 10v3', originY: '11.5px', scale: 2.4, delay: 0 },
  { x: 6, d: 'M6 6v11', originY: '11.5px', scale: .55, delay: .05 },
  { x: 10, d: 'M10 3v18', originY: '12px', scale: .55, delay: .1 },
  { x: 14, d: 'M14 8v7', originY: '11.5px', scale: 1.7, delay: .15 },
  { x: 18, d: 'M18 5v13', originY: '11.5px', scale: .6, delay: .2 },
  { x: 22, d: 'M22 10v3', originY: '11.5px', scale: 2.4, delay: .25 },
] as const;

export const AudioLinesIcon = forwardRef<AudioLinesIconHandle, AudioLinesIconProps>(
  ({ onMouseEnter, onMouseLeave, className, size = 24, duration = 1,
    isAnimated = true, color, active = false, ...props }, ref) => {
    const controls = useAnimation();
    const reduced = useReducedMotion();
    const controlled = useRef(false);
    const canAnimate = isAnimated && !reduced;
    useImperativeHandle(ref, () => {
      controlled.current = true;
      return {
        startAnimation: () => controls.start(canAnimate ? 'animate' : 'normal'),
        stopAnimation: () => controls.start('normal'),
      };
    }, [controls, canAnimate]);
    useEffect(() => {
      void controls.start(active && canAnimate ? 'animate' : 'normal');
    }, [active, canAnimate, controls]);
    const onEnter = useCallback((event: React.MouseEvent<HTMLDivElement>) => {
      if (!controlled.current && canAnimate) void controls.start('animate');
      onMouseEnter?.(event);
    }, [onMouseEnter, controls, canAnimate]);
    const onLeave = useCallback((event: React.MouseEvent<HTMLDivElement>) => {
      if (!controlled.current) void controls.start(active && canAnimate ? 'animate' : 'normal');
      onMouseLeave?.(event);
    }, [onMouseLeave, controls, canAnimate, active]);
    const barVariants = (scale: number, delay: number): Variants => ({
      normal: { scaleY: 1 },
      animate: { scaleY: [1, scale, 1],
        transition: { duration: .6 * duration, ease: 'easeInOut', delay: delay * duration,
          repeat: active ? Number.POSITIVE_INFINITY : 0 },
      },
    });
    return <LazyMotion features={domMin} strict>
      <m.div className={cn('inline-flex items-center justify-center', className)}
        onMouseEnter={onEnter} onMouseLeave={onLeave} {...props} style={{ color, ...props.style }}>
        <m.svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24"
          fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
          animate={controls} initial="normal" aria-hidden="true">
          {BARS.map(bar => <m.path key={bar.x} d={bar.d} variants={barVariants(bar.scale, bar.delay)}
            style={{ transformBox: 'view-box', originX: `${bar.x}px`, originY: bar.originY }} />)}
        </m.svg>
      </m.div>
    </LazyMotion>;
  },
);
AudioLinesIcon.displayName = 'AudioLinesIcon';
