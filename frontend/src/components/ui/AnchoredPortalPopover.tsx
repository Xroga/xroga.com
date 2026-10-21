'use client';

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from 'react';
import { createPortal } from 'react-dom';

export type AnchoredPlacement = 'bottom-start' | 'bottom-end' | 'top-start' | 'top-end';
export interface ViewportPoint { left: number; top: number }

export function clampAnchoredPosition(
  anchor: Pick<DOMRect, 'left' | 'right' | 'top' | 'bottom'>,
  popover: { width: number; height: number },
  viewport: { width: number; height: number },
  placement: AnchoredPlacement,
  gap = 8,
  margin = 12,
): ViewportPoint {
  const start = placement.endsWith('start');
  const below = placement.startsWith('bottom');
  const wantedLeft = start ? anchor.left : anchor.right - popover.width;
  const availableAbove = anchor.top - margin - gap;
  const availableBelow = viewport.height - anchor.bottom - margin - gap;
  const shouldBelow = below ? availableBelow >= Math.min(popover.height, 200) || availableBelow >= availableAbove
    : availableAbove < Math.min(popover.height, 200) && availableBelow > availableAbove;
  const wantedTop = shouldBelow ? anchor.bottom + gap : anchor.top - popover.height - gap;
  const maxLeft = Math.max(margin, viewport.width - Math.min(popover.width, viewport.width - 2 * margin) - margin);
  return {
    left: Math.max(margin, Math.min(wantedLeft, maxLeft)),
    top: Math.max(margin, Math.min(wantedTop, viewport.height - Math.min(popover.height, viewport.height - 2 * margin) - margin)),
  };
}

export function AnchoredPortalPopover({ open, onClose, anchorRef, children, className, placement = 'bottom-start', width = 360, ariaLabel }: {
  open: boolean; onClose: () => void; anchorRef: RefObject<HTMLElement | null>; children: ReactNode;
  className?: string; placement?: AnchoredPlacement; width?: number; ariaLabel?: string;
}) {
  const popoverRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<ViewportPoint>({ left: 12, top: 12 });
  const reposition = useCallback(() => {
    const anchor = anchorRef.current; const popover = popoverRef.current;
    if (!anchor || !popover) return;
    setPosition(clampAnchoredPosition(anchor.getBoundingClientRect(), { width: popover.offsetWidth || width, height: popover.offsetHeight }, { width: window.innerWidth, height: window.innerHeight }, placement));
  }, [anchorRef, placement, width]);

  useLayoutEffect(() => { if (open) reposition(); }, [open, reposition]);
  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!anchorRef.current?.contains(target) && !popoverRef.current?.contains(target)) onClose();
    };
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    window.addEventListener('resize', reposition); window.addEventListener('scroll', reposition, true);
    document.addEventListener('pointerdown', outside); document.addEventListener('keydown', escape);
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(reposition);
    if (popoverRef.current) observer?.observe(popoverRef.current);
    return () => { window.removeEventListener('resize', reposition); window.removeEventListener('scroll', reposition, true); document.removeEventListener('pointerdown', outside); document.removeEventListener('keydown', escape); observer?.disconnect(); };
  }, [anchorRef, onClose, open, reposition]);
  if (!open || typeof document === 'undefined') return null;
  return createPortal(
    <div ref={popoverRef} role="menu" aria-label={ariaLabel} className={className} style={{ position: 'fixed', left: position.left, top: position.top, width: `min(${width}px, calc(100vw - 24px))`, maxHeight: 'calc(100dvh - 24px)', overflowY: 'auto', overscrollBehavior: 'contain', zIndex: 10000 }}>
      {children}
    </div>, document.body,
  );
}
