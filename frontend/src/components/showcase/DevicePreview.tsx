'use client';

/**
 * Device preview for a showcase product.
 *
 * The iframe is lazy: it is only given a `src` once the component has been
 * scrolled into view, so a page with several previews does not boot several
 * applications at once.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { Monitor, Tablet, Smartphone, RotateCw, ExternalLink } from 'lucide-react';
import { cn } from '@/lib/utils';

export type DeviceMode = 'desktop' | 'tablet' | 'mobile';

const DEVICES: ReadonlyArray<{ id: DeviceMode; label: string; icon: typeof Monitor; width: number | null }> = [
  { id: 'desktop', label: 'Desktop', icon: Monitor, width: null },
  { id: 'tablet', label: 'Tablet', icon: Tablet, width: 768 },
  { id: 'mobile', label: 'Mobile', icon: Smartphone, width: 390 },
];

export function DevicePreview({
  src,
  title,
  initialMode = 'desktop',
  onModeChange,
  className,
  height = 620,
}: {
  src: string;
  /** Used as the iframe's accessible name. */
  title: string;
  initialMode?: DeviceMode;
  onModeChange?: (mode: DeviceMode) => void;
  className?: string;
  height?: number;
}) {
  const [mode, setMode] = useState<DeviceMode>(initialMode);
  const [reloadKey, setReloadKey] = useState(0);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [visible, setVisible] = useState(false);
  const shellRef = useRef<HTMLDivElement>(null);

  // Defer loading until the preview is actually on screen.
  useEffect(() => {
    const el = shellRef.current;
    if (!el || visible) return;
    if (typeof IntersectionObserver === 'undefined') {
      setVisible(true);
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin: '200px' },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [visible]);

  const selectMode = useCallback(
    (next: DeviceMode) => {
      setMode(next);
      onModeChange?.(next);
    },
    [onModeChange],
  );

  function refresh() {
    setStatus('loading');
    setReloadKey((key) => key + 1);
  }

  const width = DEVICES.find((device) => device.id === mode)?.width ?? null;

  return (
    <div className={cn('flex flex-col gap-3', className)}>
      <div className="flex flex-wrap items-center gap-2">
        <div
          role="radiogroup"
          aria-label="Preview device"
          className="flex items-center gap-1 rounded-full border border-[var(--border-subtle)] bg-[var(--surface-inset)] p-1"
        >
          {DEVICES.map((device) => {
            const Icon = device.icon;
            const active = device.id === mode;
            return (
              <button
                key={device.id}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => selectMode(device.id)}
                className={cn(
                  'flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)]',
                  active
                    ? 'bg-[var(--text-primary)] text-[var(--surface-page)]'
                    : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]',
                )}
              >
                <Icon className="h-3.5 w-3.5" aria-hidden="true" />
                {device.label}
              </button>
            );
          })}
        </div>

        <button
          type="button"
          onClick={refresh}
          className="flex items-center gap-1.5 rounded-full border border-[var(--border-subtle)] px-3 py-1.5 text-xs font-semibold text-[var(--text-secondary)] transition-colors hover:text-[var(--text-primary)] focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)]"
        >
          <RotateCw className="h-3.5 w-3.5" aria-hidden="true" />
          Refresh
        </button>

        <a
          href={src}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1.5 rounded-full border border-[var(--border-subtle)] px-3 py-1.5 text-xs font-semibold text-[var(--text-secondary)] transition-colors hover:text-[var(--text-primary)] focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)]"
        >
          <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
          Open full preview
        </a>
      </div>

      <div
        ref={shellRef}
        className="flex justify-center overflow-hidden rounded-token-lg border border-[var(--border-subtle)] bg-[var(--surface-inset)] p-3"
      >
        <div
          className="relative w-full overflow-hidden rounded-token-md border border-[var(--border-subtle)] bg-white transition-[width] duration-300"
          style={{ width: width ? `min(${width}px, 100%)` : '100%', height }}
        >
          {status === 'loading' && (
            <div className="absolute inset-0 z-10 grid place-items-center bg-[var(--surface-raised)]">
              <p role="status" className="text-xs text-[var(--text-secondary)]">
                Loading preview…
              </p>
            </div>
          )}

          {status === 'error' && (
            <div className="absolute inset-0 z-10 grid place-items-center gap-2 bg-[var(--surface-raised)] p-4 text-center">
              <p className="text-sm font-medium text-[var(--text-primary)]">This preview could not load.</p>
              <button
                type="button"
                onClick={refresh}
                className="rounded-full bg-[var(--accent)] px-3 py-1.5 text-xs font-semibold text-white focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)]"
              >
                Try again
              </button>
            </div>
          )}

          {visible && (
            <iframe
              key={reloadKey}
              src={src}
              title={title}
              loading="lazy"
              onLoad={() => setStatus('ready')}
              onError={() => setStatus('error')}
              // Same-origin is deliberately withheld: these previews need no
              // storage access, so the frame cannot reach into the parent page.
              sandbox="allow-scripts allow-forms allow-popups"
              className="h-full w-full border-0 bg-white"
            />
          )}
        </div>
      </div>
    </div>
  );
}
