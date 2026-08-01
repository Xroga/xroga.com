'use client';

import { useEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';

export interface WorkspacePerformanceMetrics {
  shellHydratedMs: number;
  firstContentfulPaintMs?: number;
  largestContentfulPaintMs?: number;
  cumulativeLayoutShift: number;
  lastNavigationMs?: number;
  shellMounts: number;
  duplicateRequestCount: number;
}

declare global {
  interface Window {
    __xrogaWorkspaceMetrics?: WorkspacePerformanceMetrics;
  }
}

let shellMounts = 0;

/** Passive, local performance evidence. It records no URLs, prompts, or user data. */
export function WorkspacePerformanceProbe() {
  const pathname = usePathname();
  const navigationStartedAt = useRef<number | null>(null);
  const firstPath = useRef(pathname);

  useEffect(() => {
    shellMounts += 1;
    const fcp = performance.getEntriesByName('first-contentful-paint')[0];
    const metrics: WorkspacePerformanceMetrics = {
      shellHydratedMs: performance.now(),
      firstContentfulPaintMs: fcp?.startTime,
      cumulativeLayoutShift: 0,
      shellMounts,
      duplicateRequestCount: 0,
    };
    window.__xrogaWorkspaceMetrics = metrics;

    const counts = new Map<string, number>();
    const observer = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        if (entry.entryType === 'largest-contentful-paint') {
          metrics.largestContentfulPaintMs = entry.startTime;
        } else if (entry.entryType === 'layout-shift') {
          const shift = entry as PerformanceEntry & { hadRecentInput?: boolean; value?: number };
          if (!shift.hadRecentInput) metrics.cumulativeLayoutShift += shift.value ?? 0;
        } else if (entry.entryType === 'resource') {
          try {
            const url = new URL(entry.name);
            if (!url.pathname.startsWith('/api/') && !url.pathname.includes('/api/')) continue;
            const safeKey = `${url.origin}${url.pathname}`;
            const count = (counts.get(safeKey) ?? 0) + 1;
            counts.set(safeKey, count);
            if (count > 1) metrics.duplicateRequestCount += 1;
          } catch {
            // Ignore non-URL performance entries.
          }
        }
      }
    });
    for (const type of ['largest-contentful-paint', 'layout-shift', 'resource']) {
      try {
        observer.observe({ type, buffered: true });
      } catch {
        // Older browsers can omit individual performance entry types.
      }
    }

    const onClick = (event: MouseEvent) => {
      const anchor = (event.target as Element | null)?.closest('a[href]') as HTMLAnchorElement | null;
      if (!anchor || anchor.target || anchor.download) return;
      const url = new URL(anchor.href, window.location.href);
      if (url.origin === window.location.origin) navigationStartedAt.current = performance.now();
    };
    document.addEventListener('click', onClick, true);
    return () => {
      observer.disconnect();
      document.removeEventListener('click', onClick, true);
    };
  }, []);

  useEffect(() => {
    if (pathname === firstPath.current) return;
    firstPath.current = pathname;
    if (navigationStartedAt.current != null && window.__xrogaWorkspaceMetrics) {
      window.__xrogaWorkspaceMetrics.lastNavigationMs =
        performance.now() - navigationStartedAt.current;
    }
    navigationStartedAt.current = null;
  }, [pathname]);

  return null;
}
