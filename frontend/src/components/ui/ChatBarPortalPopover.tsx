'use client';

import { AnchoredPortalPopover } from '@/components/ui/AnchoredPortalPopover';

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
  return (
    <AnchoredPortalPopover open={open} onClose={onClose} anchorRef={anchorRef} className={className} width={width} placement="top-start">
      {children}
    </AnchoredPortalPopover>
  );
}
