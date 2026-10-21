'use client';

import { forwardRef, useCallback, useImperativeHandle, useRef } from 'react';
import type { HTMLAttributes } from 'react';
import { useAnimation, useReducedMotion, motion } from 'motion/react';
import { cn } from '@/lib/utils';

export interface LocateIconHandle { startAnimation: () => void; stopAnimation: () => void; }
interface LocateIconProps extends Omit<HTMLAttributes<HTMLDivElement>, 'color' | 'onAnimationStart' | 'onAnimationEnd'> {
  size?: number;
  duration?: number;
  color?: string;
}
const LocateIcon = forwardRef<LocateIconHandle, LocateIconProps>(function LocateIcon({
  size = 24, duration = 1, color = 'currentColor', className, onMouseEnter, onMouseLeave, ...props
}, ref) {
  const controls = useAnimation();
  const controlled = useRef(false);
  const reduced = useReducedMotion();
  useImperativeHandle(ref, () => {
    controlled.current = true;
    return { startAnimation: () => controls.start(reduced ? 'normal' : 'animate'), stopAnimation: () => controls.start('normal') };
  }, [controls, reduced]);
  const enter = useCallback((event: React.MouseEvent<HTMLDivElement>) => {
    if (!reduced && !controlled.current) void controls.start('animate');
    onMouseEnter?.(event);
  }, [controls, reduced, onMouseEnter]);
  const leave = useCallback((event: React.MouseEvent<HTMLDivElement>) => {
    void controls.start('normal'); onMouseLeave?.(event);
  }, [controls, onMouseLeave]);
  return <div className={cn('inline-flex items-center justify-center', className)} onMouseEnter={enter} onMouseLeave={leave} {...props}>
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <motion.circle cx="12" cy="12" r="6.5" animate={controls}
        variants={{ normal: { scale: 1, opacity: 1 }, animate: { scale: [1, 1.18, 1], opacity: [1, .68, 1], transition: { duration: .55 * duration } } }} />
      <motion.path d="M12 2v3M12 19v3M2 12h3M19 12h3" animate={controls}
        variants={{ normal: { opacity: 1 }, animate: { opacity: [1, .45, 1], transition: { duration: .55 * duration } } }} />
      <circle cx="12" cy="12" r="1.6" fill={color} stroke="none" />
    </svg>
  </div>;
});
LocateIcon.displayName = 'LocateIcon';
export { LocateIcon };
