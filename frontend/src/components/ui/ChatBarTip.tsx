'use client';

import { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { cn } from '@/lib/utils';

/** Tooltip rendered above the chatbar (outside overflow clipping). */
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
  const [pos, setPos] = useState({ top: 0, left: 0 });

  useEffect(() => {
    if (!show || !ref.current) return;
    const r = ref.current.getBoundingClientRect();
    setPos({
      top: r.top - 8,
      left: r.left + r.width / 2,
    });
  }, [show]);

  const tip =
    show && typeof document !== 'undefined'
      ? createPortal(
          <span
            role="tooltip"
            className="fixed z-[300] -translate-x-1/2 -translate-y-full px-2.5 py-1 rounded-lg text-[9px] font-semibold whitespace-nowrap bg-[var(--foreground)] text-[var(--background)] shadow-lg pointer-events-none"
            style={{ top: pos.top, left: pos.left }}
          >
            {label}
          </span>,
          document.body
        )
      : null;

  return (
    <div
      ref={ref}
      className={cn('relative inline-flex', className)}
      onMouseEnter={() => setShow(true)}
      onMouseLeave={() => setShow(false)}
      onFocus={() => setShow(true)}
      onBlur={() => setShow(false)}
    >
      {tip}
      {children}
    </div>
  );
}
