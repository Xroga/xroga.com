'use client';

import { useEffect, useRef, useState } from 'react';
import { STATIC_AT, frameAt, frameKey, type Frame } from './orchestration';

/**
 * Review-only URL parameters (?at, ?from, ?bg). Honoured in development builds and on the private /lab
 * routes, ignored on the production homepage so no debug control ships to visitors (V12 §40).
 */
export function reviewParam(name: 'at' | 'from' | 'bg'): string | null {
  if (typeof window === 'undefined') return null;
  if (process.env.NODE_ENV === 'production' && !window.location.pathname.startsWith('/lab/')) return null;
  return new URLSearchParams(window.location.search).get(name);
}

/**
 * Drives the S00 performance from one rAF clock. React re-renders only when the discrete frame key
 * changes (a few dozen times per cycle), the clock pauses while the hero is off-screen or the tab is
 * hidden, and reduced motion gets the settled frame and no clock at all.
 */
export function useOrchestration(target: React.RefObject<HTMLElement | null>, reduced: boolean) {
  const [frame, setFrame] = useState<Frame>(() => frameAt(reduced ? STATIC_AT : 0));
  const [playing, setPlaying] = useState(false);
  const key = useRef(frameKey(frame));

  useEffect(() => {
    if (reduced) {
      const f = frameAt(STATIC_AT);
      key.current = frameKey(f);
      setFrame(f);
      setPlaying(false);
      return;
    }
    // Review aid (development builds and the private lab only): ?at=<ms> holds the performance at one
    // moment for deterministic screenshots.
    const at = Number(reviewParam('at'));
    if (at > 0) {
      setPlaying(true);
      const id = window.setTimeout(() => {
        const f = frameAt(at);
        key.current = frameKey(f);
        setFrame(f);
      }, 1800); // after the background has faded in
      return () => window.clearTimeout(id);
    }
    let raf = 0;
    // Review aid: ?from=<ms> starts the live clock at a given moment (captures of signals in flight).
    let clock = Math.max(0, Number(reviewParam('from')) || 0);
    let last = 0;
    let onScreen = true;
    const tick = (now: number) => {
      if (last) clock += Math.min(250, now - last) // wall time; only long stalls are clipped;
      last = now;
      const f = frameAt(clock);
      const k = frameKey(f);
      if (k !== key.current) {
        key.current = k;
        setFrame(f);
      }
      raf = requestAnimationFrame(tick);
    };
    const start = () => {
      if (raf || !onScreen || document.hidden) return;
      last = 0;
      raf = requestAnimationFrame(tick);
      setPlaying(true);
    };
    const stop = () => {
      cancelAnimationFrame(raf);
      raf = 0;
      setPlaying(false);
    };
    const io = new IntersectionObserver(([e]) => {
      onScreen = e.isIntersecting;
      if (onScreen) start();
      else stop();
    });
    if (target.current) io.observe(target.current);
    const vis = () => (document.hidden ? stop() : start());
    document.addEventListener('visibilitychange', vis);
    start();
    return () => {
      stop();
      io.disconnect();
      document.removeEventListener('visibilitychange', vis);
    };
  }, [reduced, target]);

  return { frame, playing };
}
