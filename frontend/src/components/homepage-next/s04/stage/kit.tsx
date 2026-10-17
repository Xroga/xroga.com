'use client';

/**
 * Shared stage pieces.
 * - Device: draws a product at its natural size and scales it to the space it is given (measured, exact at every width).
 * - Inspector: Xroga's inspection, drawn on the product: a bracket on the control that was used (cause), a reticle on
 *   what it changed (effect) with everything else dimmed, and one scan. Geometry is measured from `data-r` anchors.
 * - Still: an inert copy of real product UI, used for every rendered asset (same component, same state).
 * - Render: how an asset is produced. A scan line crosses the source while the same pass reveals the asset, so the
 *   asset visibly comes from the product without anything flying across the page.
 */
import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode, type RefObject } from 'react';
import type { Phase } from '../publish';
import k from './kit.module.css';

/** the window's height (900 before mount): devices size themselves so a whole scene fits one desktop screen */
export function useViewportHeight() {
  const [h, setH] = useState(900);
  useEffect(() => {
    const on = () => setH(window.innerHeight);
    on();
    window.addEventListener('resize', on);
    return () => window.removeEventListener('resize', on);
  }, []);
  return h;
}
const clamp = (min: number, v: number, max: number) => Math.max(min, Math.min(max, v));
export { clamp };

export function useWidth(ref: RefObject<HTMLElement | null>, guess: number) {
  const [w, setW] = useState(guess);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setW(e.contentRect.width));
    ro.observe(el);
    setW(el.getBoundingClientRect().width);
    return () => ro.disconnect();
  }, [ref]);
  return w;
}

/** scales natural-size content to fit `maxW` (measured from the parent) and `maxH` */
export function Device({
  natural,
  maxH,
  kind,
  children,
  boxRef,
  overlay,
  className,
}: {
  natural: { w: number; h: number };
  maxH: number;
  kind: 'phone' | 'android' | 'landscape' | 'browser';
  children: ReactNode;
  boxRef?: RefObject<HTMLDivElement>;
  overlay?: ReactNode;
  className?: string;
}) {
  const host = useRef<HTMLDivElement>(null);
  const w = useWidth(host, natural.w);
  const frame = kind === 'phone' ? 18 : kind === 'android' ? 16 : kind === 'landscape' ? 20 : 2;
  const scale = Math.max(0.2, Math.min((w - frame) / natural.w, (maxH - frame) / natural.h, 1.25));
  return (
    <div ref={host} className={`${k.host} ${className ?? ''}`}>
      <div className={k.device} data-kind={kind} style={{ width: natural.w * scale, height: natural.h * scale }}>
        <div ref={boxRef} className={k.screen} data-kind={kind}>
          <div className={k.scaled} data-live="" style={{ width: natural.w, height: natural.h, transform: `scale(${scale})` }}>
            {children}
          </div>
          {overlay}
        </div>
      </div>
    </div>
  );
}

/** an inert copy of product UI at scale `s`, showing the region (x, y, w, h) in natural pixels */
export function Still({ region, s, children, className, style }: { region: { x: number; y: number; w: number; h: number }; s: number; children: ReactNode; className?: string; style?: CSSProperties }) {
  return (
    <span className={`${k.still} ${className ?? ''}`} style={{ width: region.w * s, height: region.h * s, ...style }} aria-hidden="true" data-still="" {...({ inert: true } as object)}>
      <span className={k.stillInner} style={{ transform: `translate(${-region.x * s}px, ${-region.y * s}px) scale(${s})` }}>
        {children}
      </span>
    </span>
  );
}

/** fills its box's width with a Still of `region` (the box keeps the region's aspect ratio) */
export function Fill({ region, children, guess, className }: { region: { x: number; y: number; w: number; h: number }; children: ReactNode; guess: number; className?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const w = useWidth(ref, guess);
  return (
    <span ref={ref} className={`${k.fill} ${className ?? ''}`} style={{ aspectRatio: `${region.w} / ${region.h}` }}>
      <Still region={region} s={w / region.w}>
        {children}
      </Still>
    </span>
  );
}

type Rect = { x: number; y: number; w: number; h: number };
const union = (rs: Rect[]): Rect | null =>
  rs.length
    ? (() => {
        const x0 = Math.min(...rs.map((r) => r.x));
        const y0 = Math.min(...rs.map((r) => r.y));
        return { x: x0, y: y0, w: Math.max(...rs.map((r) => r.x + r.w)) - x0, h: Math.max(...rs.map((r) => r.y + r.h)) - y0 };
      })()
    : null;

export function measure(box: HTMLElement | null, keys: string[]): Rect | null {
  if (!box) return null;
  const b = box.getBoundingClientRect();
  return union(
    keys
      .map((key) => box.querySelector<HTMLElement>(`[data-live] [data-r="${key}"]`))
      .filter((el): el is HTMLElement => !!el)
      .map((el) => {
        const r = el.getBoundingClientRect();
        return { x: r.left - b.left, y: r.top - b.top, w: r.width, h: r.height };
      }),
  );
}

/**
 * Xroga's inspection layer. `phase` decides what is shown: the press (use), the cause bracket and the effect reticle
 * with one scan (inspect), a quieter reticle while the finding is written (finding). `tick` re-measures after layout
 * changes (resize, the product's own state change).
 */
export function Inspector({ box, phase, cause, effect, tick, round = 12 }: { box: RefObject<HTMLDivElement | null>; phase: Phase; cause: string[]; effect: string[]; tick: unknown; round?: number }) {
  const [geo, setGeo] = useState<{ c: Rect | null; e: Rect | null }>({ c: null, e: null });
  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    const run = () => setGeo({ c: measure(el, cause), e: measure(el, effect) });
    run();
    // the product settles after its own transitions; measure again once they have run
    const t = window.setTimeout(run, 700);
    return () => window.clearTimeout(t);
  }, [box, phase, tick, cause.join(), effect.join()]); // eslint-disable-line react-hooks/exhaustive-deps
  const { c, e } = geo;
  return (
    <div className={k.inspector} aria-hidden="true" data-phase={phase}>
      {phase === 'use' && c && <span className={k.tap} style={{ left: c.x + c.w / 2, top: c.y + c.h / 2 }} />}
      {(phase === 'inspect' || phase === 'finding') && c && (
        <span className={k.cause} style={{ left: c.x - 4, top: c.y - 4, width: c.w + 8, height: c.h + 8, borderRadius: round }} />
      )}
      {(phase === 'inspect' || phase === 'finding') && e && (
        <span className={k.reticle} data-quiet={phase === 'finding' || undefined} style={{ left: e.x - 6, top: e.y - 6, width: e.w + 12, height: e.h + 12 }}>
          <i className={k.corners} />
          {phase === 'inspect' && <i className={k.scan} />}
        </span>
      )}
    </div>
  );
}

/** a scan line crossing a source region while an asset renders from it */
export function Scanline({ on, rect, delay = 0 }: { on: boolean; rect?: Rect | null; delay?: number }) {
  if (!on) return null;
  const style: CSSProperties = rect ? { left: rect.x, top: rect.y, width: rect.w, height: rect.h, animationDelay: `${delay}ms` } : { inset: 0, animationDelay: `${delay}ms` };
  return (
    <span className={k.scanBox} style={style} aria-hidden="true">
      <i style={{ animationDelay: `${delay}ms` }} />
    </span>
  );
}

/** an asset that renders top to bottom (in step with a Scanline), or is simply present at rest */
export function Render({ state, delay = 0, children, className }: { state: 'empty' | 'rendering' | 'done'; delay?: number; children: ReactNode; className?: string }) {
  // an asset that is not needed yet mounts shortly after the stage (off the click's frame) and well before its render
  // pass, so neither choosing a store nor revealing an asset has to build a heavy copy of the product
  const [mounted, setMounted] = useState(state !== 'empty');
  useEffect(() => {
    if (mounted) return;
    if (state !== 'empty') {
      setMounted(true);
      return;
    }
    const t = window.setTimeout(() => setMounted(true), 450);
    return () => window.clearTimeout(t);
  }, [mounted, state]);
  return (
    <span className={`${k.render} ${className ?? ''}`} data-state={state} style={{ ['--delay' as string]: `${delay}ms` }}>
      {mounted ? children : <span />}
      {state === 'rendering' && <i className={k.renderEdge} />}
    </span>
  );
}
