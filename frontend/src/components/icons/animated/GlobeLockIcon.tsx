'use client';

import { cn } from '@/lib/utils';
import type { Variants } from 'motion/react';
import { useAnimation, useReducedMotion } from 'motion/react';
import * as m from 'motion/react-m';
import { forwardRef, useCallback, useImperativeHandle, useRef, type HTMLAttributes } from 'react';

export interface GlobeLockIconHandle { startAnimation: () => void; stopAnimation: () => void }
interface GlobeLockIconProps extends Omit<HTMLAttributes<HTMLDivElement>, 'color' | 'onDrag' | 'onDragStart' | 'onDragEnd' | 'onAnimationStart' | 'onAnimationEnd' | 'onAnimationIteration'> { size?: number; duration?: number; isAnimated?: boolean; color?: string }
const GlobeLockIcon = forwardRef<GlobeLockIconHandle, GlobeLockIconProps>(({ onMouseEnter, onMouseLeave, className, size = 24, duration = 1, isAnimated = true, color, ...props }, ref) => {
  const controls = useAnimation(); const reduced = useReducedMotion(); const isControlled = useRef(false);
  useImperativeHandle(ref, () => { isControlled.current = true; return { startAnimation: () => controls.start(reduced ? 'normal' : 'animate'), stopAnimation: () => controls.start('normal') }; });
  const enter = useCallback((event: React.MouseEvent<HTMLDivElement>) => { if (!isAnimated || reduced) return; if (!isControlled.current) void controls.start('animate'); else onMouseEnter?.(event); }, [controls, isAnimated, onMouseEnter, reduced]);
  const leave = useCallback((event: React.MouseEvent<HTMLDivElement>) => { if (!isControlled.current) void controls.start('normal'); else onMouseLeave?.(event); }, [controls, onMouseLeave]);
  const lock: Variants = { normal: { rotate: 0, x: 0, opacity: 1 }, animate: { rotate: [0, -8, 8, -5, 5, 0], x: [0, -2, 2, -1, 1, 0], transition: { duration: 0.8 * duration, ease: 'easeInOut' } } };
  return <m.div className={cn('inline-flex items-center justify-center', className)} onMouseEnter={enter} onMouseLeave={leave} {...props} style={{ color, ...props.style }}>
    <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M15.686 15A14.5 14.5 0 0 1 12 22a14.5 14.5 0 0 1 0-20 10 10 0 1 0 9.542 13" /><path d="M2 12h8.5" />
      <m.path d="M20 6V4a2 2 0 1 0-4 0v2" variants={lock} initial="normal" animate={controls} /><m.rect width="8" height="5" x="14" y="6" rx="1" variants={lock} initial="normal" animate={controls} />
    </svg>
  </m.div>;
});
GlobeLockIcon.displayName = 'GlobeLockIcon';
export { GlobeLockIcon };
