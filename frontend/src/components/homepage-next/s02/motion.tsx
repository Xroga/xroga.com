'use client';

/**
 * Shared S02 motion primitives: the Xroga pointer (aimed at real rendered targets) and typed text.
 * The pointer moves by one measured CSS transform per step (no per-frame JavaScript) and presses once on arrival.
 */
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import m from './Motion.module.css';

export type Tint = 'xroga' | 'engineer' | 'research' | 'acquisition' | 'creative' | 'data' | 'ops';

const TINTS: Record<Tint, [string, string, string]> = {
  xroga: ['#9fd0ff', '#3f7bff', '#2a3fd6'],
  engineer: ['#e6fbff', '#8fd6e3', '#4a8fa0'],
  research: ['#b9d3ff', '#3f7bff', '#2140c8'],
  acquisition: ['#c4f3ff', '#38c4f0', '#1580b8'],
  creative: ['#ffd1e6', '#ee5aa3', '#b02a6e'],
  data: ['#e3d6ff', '#9a6bff', '#5a32d8'],
  ops: ['#ffe2b0', '#ffaa3d', '#d36a12'],
};

/** The Xroga cursor: a precise arrow cut in glowing Xroga blue (or the employee's colour) with a pearl edge. */
export function XCursor({ tint = 'xroga' }: { tint?: Tint }) {
  const [a, b, c] = TINTS[tint];
  const id = `xc-${tint}`;
  return (
    <svg className={m.arrow} width="28" height="34" viewBox="0 0 28 34" aria-hidden="true">
      <defs>
        <linearGradient id={`${id}-f`} x1="0.1" y1="0" x2="0.8" y2="1">
          <stop offset="0" stopColor={a} />
          <stop offset="0.45" stopColor={b} />
          <stop offset="1" stopColor={c} />
        </linearGradient>
      </defs>
      <path d="M2 1.8 L2 27.2 L8.9 20.8 L13.5 31 L18.2 28.9 L13.7 18.9 L23.4 18.3 Z" fill={`url(#${id}-f)`} stroke="#f4f8ff" strokeWidth="1.3" strokeLinejoin="round" />
      <path d="M4 6 L4 15.5" stroke="#ffffff" strokeOpacity="0.75" strokeWidth="1" strokeLinecap="round" />
    </svg>
  );
}

/**
 * Aims at `[data-t="target"]` inside `scope` (layout offsets, not transformed rects, so the stage camera can move
 * freely). Travel time scales with distance (380 to 720 ms); a click presses once after arrival.
 */
export function Pointer({
  target,
  stepKey,
  action,
  show,
  reduced,
  tint = 'xroga',
  label,
}: {
  target: string | null;
  stepKey: string;
  action: string;
  show: boolean;
  reduced: boolean;
  tint?: Tint;
  label?: string;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const last = useRef<{ x: number; y: number } | null>(null);
  const [pos, setPos] = useState<{ x: number; y: number; ms: number } | null>(null);
  const [press, setPress] = useState(0);

  useLayoutEffect(() => {
    const el = ref.current;
    const scope = el?.parentElement;
    if (!el || !scope) return;
    const measure = (animate: boolean) => {
      const t = target ? (scope.querySelector(`[data-t="${target}"]`) as HTMLElement | null) : null;
      if (!t) return;
      let x = 0;
      let y = 0;
      for (let n: HTMLElement | null = t; n && n !== scope; n = n.offsetParent as HTMLElement | null) {
        x += n.offsetLeft;
        y += n.offsetTop;
      }
      const tx = x + Math.min(t.offsetWidth * 0.6, t.offsetWidth - 12);
      const ty = y + Math.min(t.offsetHeight * 0.52, t.offsetHeight - 6);
      const from = last.current ?? { x: scope.clientWidth * 0.78, y: scope.clientHeight * 0.9 };
      const dist = Math.hypot(tx - from.x, ty - from.y);
      const ms = !animate || reduced ? 0 : Math.round(Math.min(720, Math.max(380, 320 + dist * 0.65)));
      last.current = { x: tx, y: ty };
      setPos({ x: tx, y: ty, ms });
    };
    measure(true);
    const ro = new ResizeObserver(() => measure(false));
    ro.observe(scope);
    return () => ro.disconnect();
  }, [target, stepKey, reduced]);

  useEffect(() => {
    if (action !== 'click' || reduced) return;
    const t = window.setTimeout(() => setPress((n) => n + 1), (pos?.ms ?? 0) + 120);
    return () => window.clearTimeout(t);
    // the press belongs to this step's arrival
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stepKey, action, reduced]);

  const visible = show && !!pos;
  return (
    <span
      ref={ref}
      className={m.pointer}
      data-tint={tint}
      data-visible={visible || undefined}
      style={pos ? { transform: `translate3d(${pos.x}px, ${pos.y}px, 0)`, transitionDuration: `${pos.ms}ms, 220ms` } : undefined}
    >
      <span className={m.body} key={press} data-press={press > 0 || undefined}>
        <XCursor tint={tint} />
      </span>
      {label && <span className={m.tag}>{label}</span>}
      {press > 0 && <i key={`r${press}`} className={m.ring} />}
    </span>
  );
}

/** Text typed during its step: characters arrive at a plausible pace after the pointer lands; complete afterwards. */
export function Typed({ text, active, done, running, reduced, ms }: { text: string; active: boolean; done: boolean; running: boolean; reduced: boolean; ms: number }) {
  const [n, setN] = useState(0);
  useEffect(() => {
    if (active) setN(0);
  }, [active, text]);
  useEffect(() => {
    if (!active || !running || reduced) return;
    const per = Math.max(24, Math.min(85, (ms - 800) / Math.max(1, text.length)));
    let interval = 0;
    const delay = window.setTimeout(() => {
      interval = window.setInterval(() => setN((v) => Math.min(text.length, v + 1)), per);
    }, 600);
    return () => {
      window.clearTimeout(delay);
      window.clearInterval(interval);
    };
  }, [active, running, reduced, ms, text]);
  const shown = done || reduced ? text : active ? text.slice(0, n) : '';
  const complete = shown.length > 0 && shown.length === text.length;
  return (
    <span className={m.typed}>
      {shown}
      {active && !complete && <i className={m.caret} />}
    </span>
  );
}
