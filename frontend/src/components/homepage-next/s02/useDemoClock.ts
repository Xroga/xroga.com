'use client';

import { useEffect, useReducer, useRef, useState } from 'react';
import { demoReducer, initialState } from './engine';
import { stepDurations } from './script';

/**
 * Drives the S02 timeline with one timeout per step (no per-frame work). The clock runs only while the
 * section is on screen, the tab is visible, the visitor has not paused and motion is allowed; a paused or
 * hidden step resumes with the time it had left. Every timeout carries its generation, so a timeout from an
 * earlier scene is ignored by the reducer.
 */
export function useDemoClock(root: React.RefObject<HTMLElement | null>, reduced: boolean) {
  const [state, dispatch] = useReducer(demoReducer, undefined, () => initialState(false));
  const [onScreen, setOnScreen] = useState(false);
  const [hidden, setHidden] = useState(false);
  // time already spent in the current step, for resuming after a pause
  const spent = useRef({ gen: -1, ms: 0 });

  useEffect(() => {
    const el = root.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => setOnScreen(e.isIntersecting), { threshold: 0.15 });
    io.observe(el);
    const vis = () => setHidden(document.hidden);
    vis();
    document.addEventListener('visibilitychange', vis);
    return () => {
      io.disconnect();
      document.removeEventListener('visibilitychange', vis);
    };
  }, [root]);

  // reduced motion: no clock at all; each scene or employee opens on its complete final frame, and the visitor
  // steps through the same states with Previous and Next
  useEffect(() => {
    if (reduced) dispatch({ type: 'seek', step: stepDurations(state.track).length - 1 });
  }, [reduced, state.track]);

  const running = !reduced && onScreen && !hidden && !state.paused && !state.ended;

  useEffect(() => {
    if (!running) return;
    const { gen, track, step } = state;
    if (spent.current.gen !== gen) spent.current = { gen, ms: 0 };
    const total = stepDurations(track)[step] ?? 0;
    const startedAt = performance.now();
    const id = window.setTimeout(() => dispatch({ type: 'advance', gen }), Math.max(0, total - spent.current.ms));
    return () => {
      window.clearTimeout(id);
      if (spent.current.gen === gen) spent.current.ms += performance.now() - startedAt;
    };
  }, [running, state]);

  return { state, dispatch, running, onScreen };
}
