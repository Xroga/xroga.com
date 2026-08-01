'use client';

import { Loading02Icon } from '@/components/ui/LoadingIcons';
import { cn } from '@/lib/utils';

/**
 * The waiting state for a panel.
 *
 * Replaces the grey skeleton blocks. Those drew a full-size placeholder rectangle for
 * every panel, so a loading page rendered as a wall of pulsing slabs — a shape that
 * claimed to preview a layout it usually got wrong, and that read as broken content
 * rather than as work in progress. One small spinner on the panel's own surface says
 * the same thing with far less noise.
 *
 * `height` reserves the space the panel will occupy so the page does not jump when
 * the real content lands. It is a minimum, not a fixed size: content taller than the
 * estimate simply grows past it, which is the failure mode that matters least.
 */
export function PanelLoader({
  height = 200,
  label = 'Loading',
  className,
}: {
  height?: number;
  /** Announced to assistive technology; not drawn, so panels stay quiet. */
  label?: string;
  className?: string;
}) {
  return (
    <div
      className={cn('xv-panel-loader', className)}
      style={{ minHeight: height }}
      role="status"
      aria-label={label}
    >
      <Loading02Icon spinning size={22} role={undefined} aria-label={undefined} />
    </div>
  );
}
