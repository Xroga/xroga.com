'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { ChevronUp, ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Scroll affordances for the sidebar nav.
 *
 * The column's native scrollbar rendered as a full-height track with stepper arrows
 * sitting inside the chrome — visually heavy, and on the platforms that draw it that
 * way it never hides. The track is suppressed in CSS (`.xv-sidebar-nav-scroll`) and
 * replaced by these two buttons.
 *
 * They are shown only when there is actually somewhere to go, and each is hidden at
 * its own end of the range, so the control never lies about what a click will do.
 * Scrolling by wheel, trackpad, or keyboard is untouched — this adds a way to move,
 * it does not take one away.
 */
export function SidebarNavScroller({
  targetRef,
  children,
  className,
}: {
  targetRef: React.RefObject<HTMLElement>;
  children: React.ReactNode;
  className?: string;
}) {
  const [canUp, setCanUp] = useState(false);
  const [canDown, setCanDown] = useState(false);
  const frameRef = useRef<number | null>(null);

  const measure = useCallback(() => {
    const el = targetRef.current;
    if (!el) return;
    // A 2px tolerance: sub-pixel layout leaves a fractional remainder at the end of
    // the range, which would otherwise keep the arrow lit with nothing left to scroll.
    setCanUp(el.scrollTop > 2);
    setCanDown(el.scrollTop + el.clientHeight < el.scrollHeight - 2);
  }, [targetRef]);

  useEffect(() => {
    const el = targetRef.current;
    if (!el) return;
    measure();

    const onScroll = () => {
      if (frameRef.current != null) return;
      frameRef.current = requestAnimationFrame(() => {
        frameRef.current = null;
        measure();
      });
    };

    el.addEventListener('scroll', onScroll, { passive: true });
    // The list also changes height when a group opens or the project history loads,
    // so scroll position alone is not enough to keep these in sync.
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    for (const child of Array.from(el.children)) observer.observe(child);

    return () => {
      el.removeEventListener('scroll', onScroll);
      observer.disconnect();
      if (frameRef.current != null) cancelAnimationFrame(frameRef.current);
    };
  }, [measure, targetRef]);

  const step = (direction: 1 | -1) => {
    const el = targetRef.current;
    if (!el) return;
    el.scrollBy({ top: direction * Math.max(120, el.clientHeight * 0.7), behavior: 'smooth' });
  };

  return (
    <div className={cn('xv-nav-scroller', className)}>
      <button
        type="button"
        onClick={() => step(-1)}
        className={cn('xv-nav-arrow xv-nav-arrow--up', !canUp && 'is-hidden')}
        tabIndex={canUp ? 0 : -1}
        aria-hidden={!canUp}
        aria-label="Scroll navigation up"
      >
        <ChevronUp className="h-3.5 w-3.5" aria-hidden="true" />
      </button>

      {children}

      <button
        type="button"
        onClick={() => step(1)}
        className={cn('xv-nav-arrow xv-nav-arrow--down', !canDown && 'is-hidden')}
        tabIndex={canDown ? 0 : -1}
        aria-hidden={!canDown}
        aria-label="Scroll navigation down"
      >
        <ChevronDown className="h-3.5 w-3.5" aria-hidden="true" />
      </button>
    </div>
  );
}
