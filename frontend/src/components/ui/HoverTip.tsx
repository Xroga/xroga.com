'use client';

import { useRef, useState, type ReactNode } from 'react';
import { cn } from '@/lib/utils';

interface HoverTipProps {
  label: string;
  description?: string;
  children: ReactNode;
  className?: string;
  side?: 'top' | 'right' | 'bottom' | 'left';
}

export function HoverTip({ label, description, children, className, side = 'right' }: HoverTipProps) {
  const [visible, setVisible] = useState(false);
  const [detail, setDetail] = useState(false);
  const labelTimer = useRef<ReturnType<typeof setTimeout>>();
  const detailTimer = useRef<ReturnType<typeof setTimeout>>();

  function clearTimers() {
    clearTimeout(labelTimer.current);
    clearTimeout(detailTimer.current);
  }

  function onEnter() {
    labelTimer.current = setTimeout(() => setVisible(true), 280);
    if (description) {
      detailTimer.current = setTimeout(() => setDetail(true), 900);
    }
  }

  function onLeave() {
    clearTimers();
    setVisible(false);
    setDetail(false);
  }

  const position =
    side === 'right'
      ? 'left-full top-1/2 -translate-y-1/2 ml-2'
      : side === 'left'
        ? 'right-full top-1/2 -translate-y-1/2 mr-2'
        : side === 'top'
          ? 'bottom-full left-1/2 -translate-x-1/2 mb-2'
          : 'top-full left-1/2 -translate-x-1/2 mt-2';

  return (
    <span
      className={cn('relative inline-flex', className)}
      onMouseEnter={onEnter}
      onMouseLeave={onLeave}
      onFocus={onEnter}
      onBlur={onLeave}
    >
      {children}
      {visible && (
        <span
          role="tooltip"
          className={cn(
            'absolute z-[100] pointer-events-none xv-hover-tip',
            position,
            detail && description ? 'xv-hover-tip-detail' : ''
          )}
        >
          <span className="block font-semibold text-[11px] whitespace-nowrap">{label}</span>
          {detail && description && (
            <span className="block text-[10px] opacity-85 mt-1 max-w-[200px] whitespace-normal leading-snug">
              {description}
            </span>
          )}
        </span>
      )}
    </span>
  );
}
