'use client';

/**
 * Shared S02 motion primitives (pointer and typing kept from V7, restyled for V9):
 * - Pointer: the Xroga cursor aimed at a real rendered target (`data-t`), one measured transform per step, a press
 *   on arrival. Layout offsets are used, not transformed rects, so the camera can push without breaking the aim.
 * - Typed: short values typed at a plausible pace after the pointer lands; complete afterwards.
 * - Pins: findings attached to the exact element where they were found; they stay once found.
 * - usePush: a gentle camera push (≤ 1.06) toward the step's element, then back to the full frame.
 */
import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type RefObject } from 'react';
import type { Step } from './script';
import m from './Motion.module.css';

/** Offset of `el` inside `scope`, in untransformed layout pixels. */
function offsetIn(el: HTMLElement, scope: HTMLElement) {
  let x = 0;
  let y = 0;
  for (let n: HTMLElement | null = el; n && n !== scope; n = n.offsetParent as HTMLElement | null) {
    x += n.offsetLeft;
    y += n.offsetTop;
  }
  return { x, y, w: el.offsetWidth, h: el.offsetHeight };
}
const find = (scope: HTMLElement, t: string) => scope.querySelector(`[data-t="${t}"]`) as HTMLElement | null;

/** The Xroga cursor: a pearl-edged arrow in the role colour with a tiny glass X badge riding on its tail. */
export function XCursor({ accent = '#4589ff' }: { accent?: string }) {
  return (
    <svg className={m.arrow} width="34" height="38" viewBox="0 0 34 38" aria-hidden="true" style={{ '--c': accent } as CSSProperties}>
      <defs>
        <linearGradient id={`xc-${accent.slice(1)}`} x1="0.1" y1="0" x2="0.75" y2="1">
          <stop offset="0" stopColor="#ffffff" />
          <stop offset="0.28" stopColor={accent} stopOpacity="0.95" />
          <stop offset="1" stopColor={accent} />
        </linearGradient>
        <radialGradient id={`xb-${accent.slice(1)}`} cx="0.35" cy="0.3" r="0.8">
          <stop offset="0" stopColor="#d9f2ff" />
          <stop offset="0.5" stopColor="#3f7bff" />
          <stop offset="1" stopColor="#5b34c9" />
        </radialGradient>
      </defs>
      <path d="M3 2.4 L3 27.4 L9.6 21.3 L14.1 31.4 L18.6 29.4 L14.2 19.5 L23.4 19 Z" fill={`url(#xc-${accent.slice(1)})`} stroke="#f6f9ff" strokeWidth="1.4" strokeLinejoin="round" />
      <path d="M5 7 L5 16" stroke="#ffffff" strokeOpacity="0.8" strokeWidth="1.1" strokeLinecap="round" />
      {/* the glass X badge */}
      <circle cx="26.5" cy="30" r="6.2" fill={`url(#xb-${accent.slice(1)})`} stroke="rgba(255,255,255,0.75)" strokeWidth="0.9" />
      <path d="M24.2 27.7 L28.8 32.3 M28.8 27.7 L24.2 32.3" stroke="#fff" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

export function Pointer({
  target,
  stepKey,
  action,
  show,
  reduced,
  accent,
  label,
}: {
  target: string | null;
  stepKey: string;
  action: string;
  show: boolean;
  reduced: boolean;
  accent?: string;
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
      const t = target ? find(scope, target) : null;
      if (!t) return;
      const o = offsetIn(t, scope);
      const tx = o.x + Math.min(o.w * 0.58, o.w - 10, 150); // wide targets: aim near where the work starts
      const ty = o.y + Math.min(o.h * 0.55, o.h - 5);
      const from = last.current ?? { x: scope.clientWidth * 0.8, y: scope.clientHeight * 0.92 };
      const dist = Math.hypot(tx - from.x, ty - from.y);
      // travel 320 to 700 ms by distance (V8 §F)
      const ms = !animate || reduced ? 0 : Math.round(Math.min(700, Math.max(320, 280 + dist * 0.6)));
      last.current = { x: tx, y: ty };
      setPos({ x: tx, y: ty, ms });
    };
    measure(true);
    const ro = new ResizeObserver(() => measure(false));
    ro.observe(scope);
    return () => ro.disconnect();
  }, [target, stepKey, reduced]);

  useEffect(() => {
    if ((action !== 'click' && action !== 'drag') || reduced) return;
    // hover dwell ~140 ms after arrival, then the press
    const t = window.setTimeout(() => setPress((n) => n + 1), (pos?.ms ?? 0) + 140);
    return () => window.clearTimeout(t);
    // the press belongs to this step's arrival
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stepKey, action, reduced]);

  const visible = show && !!pos;
  return (
    <span
      ref={ref}
      className={m.pointer}
      data-visible={visible || undefined}
      data-drag={action === 'drag' || undefined}
      style={pos ? { transform: `translate3d(${pos.x}px, ${pos.y}px, 0)`, transitionDuration: `${pos.ms}ms, 220ms` } : undefined}
    >
      <span className={m.body} key={press} data-press={press > 0 || undefined}>
        <XCursor accent={accent} />
      </span>
      {label && (
        <span className={m.tag} style={{ '--c': accent } as CSSProperties}>
          {label}
        </span>
      )}
      {press > 0 && <i key={`r${press}`} className={m.ring} style={{ '--c': accent } as CSSProperties} />}
    </span>
  );
}

/** Text typed during its step: characters arrive after the pointer lands; complete afterwards. */
export function Typed({ text, active, done, running, reduced, ms }: { text: string; active: boolean; done: boolean; running: boolean; reduced: boolean; ms: number }) {
  const [n, setN] = useState(0);
  useEffect(() => {
    if (active) setN(0);
  }, [active, text]);
  useEffect(() => {
    if (!active || !running || reduced) return;
    // short values only; long text accelerates so typing never dominates a step
    const per = Math.max(18, Math.min(70, (ms - 700) / Math.max(1, text.length)));
    let interval = 0;
    const delay = window.setTimeout(() => {
      interval = window.setInterval(() => setN((v) => Math.min(text.length, v + 1)), per);
    }, 520);
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

/** Findings pinned to the element where they were found. A pin appears with its step and stays. */
export function Pins({ steps, step, scope, accent }: { steps: Step[]; step: number; scope: RefObject<HTMLElement | null>; accent?: string }) {
  const [boxes, setBoxes] = useState<{ id: string; x: number; y: number; w: number; text: string; kind: string; fresh: boolean }[]>([]);
  useLayoutEffect(() => {
    const el = scope.current;
    if (!el) return;
    const measure = () => {
      const out: typeof boxes = [];
      steps.forEach((st, i) => {
        if (!st.pin || i > step) return;
        const until = st.pin.until ? steps.findIndex((x) => x.id === st.pin!.until) : -1;
        if (until >= 0 && step >= until) return;
        const t = find(el, st.pin.at);
        if (!t || t.closest('[aria-hidden="true"]')) return;
        const o = offsetIn(t, el);
        // keep the finding inside the window: a long pin near the right edge slides left, still under its element
        out.push({ id: st.id, x: Math.max(8, Math.min(o.x, el.clientWidth - 340)), y: o.y + o.h, w: o.w, text: st.pin.text, kind: st.pin.kind, fresh: i === step });
      });
      setBoxes(out);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [steps, step, scope]);
  return (
    <>
      {boxes.map((b) => (
        <span key={b.id} className={m.pin} data-kind={b.kind} data-fresh={b.fresh || undefined} style={{ left: b.x, top: b.y + 8, '--c': accent } as CSSProperties}>
          <i aria-hidden="true" />
          {b.text}
        </span>
      ))}
    </>
  );
}

/** Pushes the camera gently toward the step's element (scale ≤ 1.06) while that step is current. */
export function usePush(cam: RefObject<HTMLElement | null>, target: string | undefined, on: boolean, reduced: boolean): CSSProperties {
  const [origin, setOrigin] = useState<string | null>(null);
  useLayoutEffect(() => {
    const el = cam.current;
    if (!el || !on || !target || reduced) {
      setOrigin(null);
      return;
    }
    const t = find(el, target);
    if (!t) return;
    const o = offsetIn(t, el);
    setOrigin(`${Math.round(o.x + o.w / 2)}px ${Math.round(o.y + o.h / 2)}px`);
  }, [cam, target, on, reduced]);
  return origin ? { transformOrigin: origin, transform: 'scale(1.055)' } : { transform: 'scale(1)' };
}
