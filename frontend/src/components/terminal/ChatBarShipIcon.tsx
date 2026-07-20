'use client';

import { ShipIcon } from '@/components/icons/ShipIcon';

export type SendButtonState = 'idle' | 'sending' | 'thinking' | 'launched';

/** Boat sails from send until AI finishes (`thinking` → `launched`). */
export function isShipSailing(state: SendButtonState | undefined): boolean {
  return state === 'sending' || state === 'thinking' || state === 'launched';
}

export function ChatBarShipIcon({
  state = 'idle',
  size = 18,
  bold = false,
  className,
}: {
  state?: SendButtonState;
  size?: number;
  bold?: boolean;
  className?: string;
}) {
  return (
    <ShipIcon
      size={size}
      sailing={isShipSailing(state)}
      bold={bold}
      className={className}
    />
  );
}
