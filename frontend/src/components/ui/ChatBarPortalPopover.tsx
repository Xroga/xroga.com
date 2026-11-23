'use client';

import { AnchoredPortalPopover } from '@/components/ui/AnchoredPortalPopover';

/** Keep chatbar controls below the composer in a bounded body portal. */
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
    <AnchoredPortalPopover open={open} onClose={onClose} anchorRef={anchorRef} className={className} width={width} placement="bottom-start" belowChatbar>
      {children}
    </AnchoredPortalPopover>
  );
}
