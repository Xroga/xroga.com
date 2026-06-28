'use client';

import { useEffect, useLayoutEffect, useState } from 'react';
import { createPortal } from 'react-dom';

/** Renders children in a portal above the chatbar dock (z 220). */
export function ChatBarPortalPopover({
  open,
  onClose,
  anchorRef,
  children,
  className,
  width = 320,
}: {
  open: boolean;
  onClose: () => void;
  anchorRef: React.RefObject<HTMLElement | null>;
  children: React.ReactNode;
  className?: string;
  width?: number;
}) {
  const [pos, setPos] = useState({ bottom: 0, left: 0 });

  useLayoutEffect(() => {
    if (!open || !anchorRef.current) return;
    const r = anchorRef.current.getBoundingClientRect();
    const left = Math.max(12, Math.min(r.left, window.innerWidth - width - 12));
    const bottom = window.innerHeight - r.top + 10;
    setPos({ bottom, left });
  }, [open, anchorRef, width]);

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      const t = e.target as Node;
      if (anchorRef.current?.contains(t)) return;
      const el = document.getElementById('xv-chatbar-portal-popover');
      if (el?.contains(t)) return;
      onClose();
    }
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open, onClose, anchorRef]);

  if (!open || typeof document === 'undefined') return null;

  return createPortal(
    <div
      id="xv-chatbar-portal-popover"
      className={className}
      style={{
        position: 'fixed',
        left: pos.left,
        bottom: pos.bottom,
        width: `min(${width}px, calc(100vw - 24px))`,
        zIndex: 230,
      }}
    >
      {children}
    </div>,
    document.body
  );
}
