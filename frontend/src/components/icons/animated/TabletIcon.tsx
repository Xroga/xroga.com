'use client';

import { cn } from '@/lib/utils';
import type { Variants } from 'motion/react';
import { useAnimation, useReducedMotion } from 'motion/react';
import * as m from 'motion/react-m';
import { forwardRef, useCallback, useImperativeHandle, useRef, type HTMLAttributes } from 'react';

export interface TabletIconHandle { startAnimation: () => void; stopAnimation: () => void }
interface TabletIconProps extends Omit<HTMLAttributes<HTMLDivElement>, 'color' | 'onDrag' | 'onDragStart' | 'onDragEnd' | 'onAnimationStart' | 'onAnimationEnd' | 'onAnimationIteration'> { size?: number; duration?: number; isAnimated?: boolean; color?: string }
const TabletIcon = forwardRef<TabletIconHandle, TabletIconProps>(({ onMouseEnter, onMouseLeave, className, size = 24, duration = 1, isAnimated = true, color, ...props }, ref) => {
  const controls = useAnimation(); const reduced = useReducedMotion(); const isControlled = useRef(false);
  useImperativeHandle(ref, () => { isControlled.current = true; return { startAnimation: () => controls.start(reduced ? 'normal' : 'animate'), stopAnimation: () => controls.start('normal') }; });
  const enter = useCallback((event: React.MouseEvent<HTMLDivElement>) => { if (!isAnimated || reduced) return; if (!isControlled.current) void controls.start('animate'); else onMouseEnter?.(event); }, [controls, isAnimated, onMouseEnter, reduced]);
  const leave = useCallback((event: React.MouseEvent<HTMLDivElement>) => { if (!isControlled.current) void controls.start('normal'); else onMouseLeave?.(event); }, [controls, onMouseLeave]);
  const screen: Variants = { normal: { scale: 1, opacity: 1 }, animate: { scale: [0.9, 1.02, 1], opacity: [0, 1, 1], transition: { duration: 0.5 * duration, times: [0, 0.65, 1], ease: [0.34, 1.3, 0.64, 1] } } };
  const dot: Variants = { normal: { scale: 1, opacity: 1 }, animate: { scale: [0, 1.2, 1], opacity: [0, 1, 1], transition: { duration: 0.38 * duration, delay: 0.45 * duration, times: [0, 0.6, 1], ease: [0.34, 1.4, 0.64, 1] } } };
  return <m.div className={cn('inline-flex items-center justify-center', className)} onMouseEnter={enter} onMouseLeave={leave} {...props} style={{ color, ...props.style }}>
    <m.svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" animate={controls} initial="normal">
      <m.rect width="16" height="20" x="4" y="2" rx="2" variants={screen} style={{ transformBox: 'view-box', originX: '12px', originY: '12px' }} />
      <m.line x1="12" y1="18" x2="12.01" y2="18" variants={dot} style={{ transformBox: 'view-box', originX: '12px', originY: '18px' }} />
    </m.svg>
  </m.div>;
});
TabletIcon.displayName = 'TabletIcon';
export { TabletIcon };
