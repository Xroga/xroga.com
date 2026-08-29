'use client';

import { cn } from '@/lib/utils';
import type { Transition, Variants } from 'motion/react';
import { useAnimation, useReducedMotion } from 'motion/react';
import * as m from 'motion/react-m';
import { forwardRef, useCallback, useImperativeHandle, useRef, type HTMLAttributes } from 'react';

export interface EarthIconHandle { startAnimation: () => void; stopAnimation: () => void }
interface EarthIconProps extends Omit<HTMLAttributes<HTMLDivElement>, 'onDrag' | 'onDragStart' | 'onDragEnd' | 'onAnimationStart' | 'onAnimationEnd' | 'onAnimationIteration'> { size?: number }
const CIRCLE_TRANSITION: Transition = { duration: 0.3, delay: 0.1, opacity: { delay: 0.15 } };
const CIRCLE_VARIANTS: Variants = { normal: { pathLength: 1, opacity: 1 }, animate: { pathLength: [0, 1], opacity: [0, 1] } };
const LAND_VARIANTS: Variants = {
  normal: { pathLength: 1, opacity: 1, pathOffset: 0 },
  animate: { pathLength: [0, 1], opacity: [0, 1], pathOffset: [1, 0] },
};

const EarthIcon = forwardRef<EarthIconHandle, EarthIconProps>(({ onMouseEnter, onMouseLeave, className, size = 28, ...props }, ref) => {
  const controls = useAnimation();
  const reduced = useReducedMotion();
  const isControlledRef = useRef(false);
  useImperativeHandle(ref, () => { isControlledRef.current = true; return { startAnimation: () => controls.start(reduced ? 'normal' : 'animate'), stopAnimation: () => controls.start('normal') }; });
  const enter = useCallback((event: React.MouseEvent<HTMLDivElement>) => { if (isControlledRef.current) onMouseEnter?.(event); else if (!reduced) void controls.start('animate'); }, [controls, onMouseEnter, reduced]);
  const leave = useCallback((event: React.MouseEvent<HTMLDivElement>) => { if (isControlledRef.current) onMouseLeave?.(event); else void controls.start('normal'); }, [controls, onMouseLeave]);
  const landTransition = { duration: 0.7, delay: 0.5, opacity: { delay: 0.5 } };
  return <m.div className={cn('inline-flex items-center justify-center', className)} onMouseEnter={enter} onMouseLeave={leave} {...props}>
    <svg fill="none" height={size} stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 24 24" width={size} xmlns="http://www.w3.org/2000/svg">
      <m.path animate={controls} initial="normal" d="M21.54 15H17a2 2 0 0 0-2 2v4.54" transition={landTransition} variants={LAND_VARIANTS} />
      <m.path animate={controls} initial="normal" d="M7 3.34V5a3 3 0 0 0 3 3 2 2 0 0 1 2 2c0 1.1.9 2 2 2s2-.9 2-2 .9-2 2-2h3.17" transition={landTransition} variants={LAND_VARIANTS} />
      <m.path animate={controls} initial="normal" d="M11 21.95V18a2 2 0 0 0-2-2 2 2 0 0 1-2-2v-1a2 2 0 0 0-2-2H2.05" transition={landTransition} variants={LAND_VARIANTS} />
      <m.circle animate={controls} initial="normal" cx="12" cy="12" r="10" transition={CIRCLE_TRANSITION} variants={CIRCLE_VARIANTS} />
    </svg>
  </m.div>;
});
EarthIcon.displayName = 'EarthIcon';
export { EarthIcon };
