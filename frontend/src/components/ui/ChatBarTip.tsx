'use client';

import { useState, useRef } from 'react';
import { cn } from '@/lib/utils';

/** Compact tooltip shown ABOVE the trigger */
export function ChatBarTip({
  label,
  children,
  className,
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  const [show, setShow] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  return (
    <div
      ref={ref}
      className={cn('relative inline-flex', className)}
      onMouseEnter={() => setShow(true)}
      onMouseLeave={() => setShow(false)}
      onFocus={() => setShow(true)}
      onBlur={() => setShow(false)}
    >
      {show && (
        <span
          role="tooltip"
          className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 px-2 py-0.5 rounded-md text-[9px] font-semibold whitespace-nowrap z-[90] bg-[var(--foreground)] text-[var(--background)] shadow-lg pointer-events-none"
        >
          {label}
        </span>
      )}
      {children}
    </div>
  );
}
