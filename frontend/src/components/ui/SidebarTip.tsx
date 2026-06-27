'use client';

import { useRef, useState, type ReactNode } from 'react';
import { cn } from '@/lib/utils';

interface SidebarTipProps {
  label: string;
  description?: string;
  children: ReactNode;
  className?: string;
}

/** Tooltip that stays inside the sidebar — appears below the item */
export function SidebarTip({ label, description, children, className }: SidebarTipProps) {
  const [visible, setVisible] = useState(false);
  const [detail, setDetail] = useState(false);
  const labelTimer = useRef<ReturnType<typeof setTimeout>>();
  const detailTimer = useRef<ReturnType<typeof setTimeout>>();

  function clearTimers() {
    clearTimeout(labelTimer.current);
    clearTimeout(detailTimer.current);
  }

  return (
    <span
      className={cn('relative block w-full xv-sidebar-tip-wrap', className)}
      onMouseEnter={() => {
        labelTimer.current = setTimeout(() => setVisible(true), 200);
        if (description) detailTimer.current = setTimeout(() => setDetail(true), 700);
      }}
      onMouseLeave={() => {
        clearTimers();
        setVisible(false);
        setDetail(false);
      }}
    >
      {children}
      {visible && (
        <span className="absolute left-2 right-2 top-full mt-1 z-50 xv-sidebar-tip pointer-events-none">
          <span className="block text-[10px] font-semibold">{label}</span>
          {detail && description && (
            <span className="block text-[9px] opacity-80 mt-0.5 leading-snug">{description}</span>
          )}
        </span>
      )}
    </span>
  );
}
