'use client';

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from 'react';
import { createPortal } from 'react-dom';

export type AnchoredPlacement = 'bottom-start' | 'bottom-end' | 'top-start' | 'top-end';
export interface ViewportPoint { left: number; top: number }
export interface AnchoredLayout extends ViewportPoint { maxHeight: number }

export function calculateAnchoredLayout(
  anchor: Pick<DOMRect, 'left' | 'right' | 'top' | 'bottom'>,
  popover: { width: number; height: number },
  viewport: { width: number; height: number },
  placement: AnchoredPlacement,
  gap = 8,
  margin = 12,
): AnchoredLayout {
  const start = placement.endsWith('start');
  const wantedWidth = Math.min(popover.width, Math.max(1, viewport.width - 2 * margin));
  const wantedLeft = start ? anchor.left : anchor.right - wantedWidth;
  const availableAbove = Math.max(0, anchor.top - margin - gap);
  const availableBelow = Math.max(0, viewport.height - anchor.bottom - margin - gap);
  const fitsBelow = availableBelow >= popover.height;
  const fitsAbove = availableAbove >= popover.height;
  const shouldBelow = placement.startsWith('bottom')
    ? fitsBelow || (!fitsAbove && availableBelow >= availableAbove)
    : !fitsAbove && (fitsBelow || availableBelow > availableAbove);
  const sideHeight = shouldBelow ? availableBelow : availableAbove;
  const maxHeight = sideHeight > 0 ? sideHeight : Math.max(1, viewport.height - 2 * margin);
  const renderedHeight = Math.min(popover.height, maxHeight);
  const wantedTop = shouldBelow ? anchor.bottom + gap : anchor.top - renderedHeight - gap;
  const maxLeft = Math.max(margin, viewport.width - wantedWidth - margin);
  return {
    left: Math.max(margin, Math.min(wantedLeft, maxLeft)),
    top: Math.max(margin, Math.min(wantedTop, viewport.height - renderedHeight - margin)),
    maxHeight,
  };
}

export function clampAnchoredPosition(
  anchor: Pick<DOMRect, 'left' | 'right' | 'top' | 'bottom'>,
  popover: { width: number; height: number },
  viewport: { width: number; height: number },
  placement: AnchoredPlacement,
  gap = 8,
  margin = 12,
): ViewportPoint {
  const { left, top } = calculateAnchoredLayout(anchor, popover, viewport, placement, gap, margin);
  return { left, top };
}

export function AnchoredPortalPopover({ open, onClose, anchorRef, children, className, placement = 'bottom-start', width = 360, ariaLabel }: {
  open: boolean; onClose: () => void; anchorRef: RefObject<HTMLElement | null>; children: ReactNode;
  className?: string; placement?: AnchoredPlacement; width?: number; ariaLabel?: string;
}) {
  const popoverRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<AnchoredLayout>({ left: 12, top: 12, maxHeight: 320 });
  const reposition = useCallback(() => {
    const anchor = anchorRef.current; const popover = popoverRef.current;
    if (!anchor || !popover) return;
    setPosition(calculateAnchoredLayout(anchor.getBoundingClientRect(),
      { width: popover.offsetWidth || width, height: Math.max(popover.scrollHeight, popover.offsetHeight) },
      { width: window.visualViewport?.width ?? window.innerWidth, height: window.visualViewport?.height ?? window.innerHeight }, placement));
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
    window.visualViewport?.addEventListener('resize', reposition);
    window.visualViewport?.addEventListener('scroll', reposition);
    document.addEventListener('pointerdown', outside); document.addEventListener('keydown', escape);
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(reposition);
    if (popoverRef.current) observer?.observe(popoverRef.current);
    return () => { window.removeEventListener('resize', reposition); window.removeEventListener('scroll', reposition, true); window.visualViewport?.removeEventListener('resize', reposition); window.visualViewport?.removeEventListener('scroll', reposition); document.removeEventListener('pointerdown', outside); document.removeEventListener('keydown', escape); observer?.disconnect(); };
  }, [anchorRef, onClose, open, reposition]);
  if (!open || typeof document === 'undefined') return null;
  return createPortal(
    <div ref={popoverRef} role="menu" aria-label={ariaLabel} className={className} style={{ position: 'fixed', left: position.left, top: position.top, width: `min(${width}px, calc(100vw - 24px))`, maxHeight: position.maxHeight, overflowY: 'auto', overscrollBehavior: 'contain', zIndex: 10000 }}>
      {children}
    </div>, document.body,
  );
}
