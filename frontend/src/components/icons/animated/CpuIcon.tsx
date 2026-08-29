'use client';

import { cn } from '@/lib/utils';
import type { Variants } from 'motion/react';
import { useAnimation, useReducedMotion } from 'motion/react';
import * as m from 'motion/react-m';
import { forwardRef, useCallback, useImperativeHandle, useRef, type HTMLAttributes } from 'react';

export interface CpuIconHandle { startAnimation: () => void; stopAnimation: () => void }
interface CpuIconProps extends Omit<HTMLAttributes<HTMLDivElement>, 'color' | 'onDrag' | 'onDragStart' | 'onDragEnd' | 'onAnimationStart' | 'onAnimationEnd' | 'onAnimationIteration'> { size?: number; duration?: number; isAnimated?: boolean; color?: string }
const PINS = [
  ['M12 2v2', 0], ['M17 2v2', 1], ['M7 2v2', 2], ['M20 7h2', 3],
  ['M20 12h2', 4], ['M20 17h2', 5], ['M17 20v2', 6], ['M12 20v2', 7],
  ['M7 20v2', 8], ['M2 17h2', 9], ['M2 12h2', 10], ['M2 7h2', 11],
] as const;

const CpuIcon = forwardRef<CpuIconHandle, CpuIconProps>(({ onMouseEnter, onMouseLeave, className, size = 24, duration = 1, isAnimated = true, color, ...props }, ref) => {
  const controls = useAnimation(); const reduced = useReducedMotion(); const isControlled = useRef(false);
  useImperativeHandle(ref, () => { isControlled.current = true; return { startAnimation: () => controls.start(reduced ? 'normal' : 'animate'), stopAnimation: () => controls.start('normal') }; });
  const enter = useCallback((event: React.MouseEvent<HTMLDivElement>) => { if (!isAnimated || reduced) return; if (!isControlled.current) void controls.start('animate'); else onMouseEnter?.(event); }, [controls, isAnimated, onMouseEnter, reduced]);
  const leave = useCallback((event: React.MouseEvent<HTMLDivElement>) => { if (!isControlled.current) void controls.start('normal'); else onMouseLeave?.(event); }, [controls, onMouseLeave]);
  const body: Variants = { normal: { pathLength: 1, opacity: 1 }, animate: { pathLength: [0, 1], opacity: [0, 1], transition: { duration: 0.5 * duration, ease: [0.16, 1, 0.3, 1] } } };
  const core: Variants = { normal: { scale: 1, opacity: 1 }, animate: { scale: [0, 1.2, 1], opacity: [0, 1, 1], transition: { duration: 0.38 * duration, delay: 0.45 * duration, times: [0, 0.6, 1], ease: [0.34, 1.4, 0.64, 1] } } };
  const pin: Variants = { normal: { scale: 1, opacity: 1 }, animate: (index: number) => ({ scale: [0, 1.15, 1], opacity: [0, 1, 1], transition: { duration: 0.3 * duration, delay: (0.4 + index * 0.03) * duration, times: [0, 0.6, 1], ease: [0.34, 1.4, 0.64, 1] } }) };
  return <m.div className={cn('inline-flex items-center justify-center', className)} onMouseEnter={enter} onMouseLeave={leave} {...props} style={{ color, ...props.style }}>
    <m.svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" animate={controls} initial="normal">
      <m.rect x="4" y="4" width="16" height="16" rx="2" variants={body} />
      <m.rect x="8" y="8" width="8" height="8" rx="1" variants={core} style={{ transformBox: 'view-box', originX: '12px', originY: '12px' }} />
      {PINS.map(([path, index]) => <m.path key={path} d={path} custom={index} variants={pin} style={{ transformBox: 'view-box', originX: '12px', originY: '12px' }} />)}
    </m.svg>
  </m.div>;
});
CpuIcon.displayName = 'CpuIcon';
export { CpuIcon };
