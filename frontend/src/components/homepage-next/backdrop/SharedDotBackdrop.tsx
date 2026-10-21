'use client';

/**
 * The one background behind S01–S05 (the hero and the closing section keep their own).
 *
 * A fixed, quiet dot grid (25 px pitch, ~1 px dots) on near-black, painted once by CSS for the whole S01–S05 wrapper, so
 * the grid is continuous across every section boundary. On a fine pointer, a small tile of brighter dots follows the
 * pointer with a soft trailing ease; the tile's dots are phase-locked to the base grid, so dots only ever brighten in
 * place, never move. No canvas, no images, no React state per pointer event: one rAF loop that runs only while the
 * highlight is catching up, then stops. Touch, narrow screens and reduced motion get the still grid only.
 *
 * Mount as the first child of the wrapper that holds S01–S05; that wrapper is the coordinate space of the grid.
 */
import { useEffect, useRef } from 'react';
import s from './SharedDotBackdrop.module.css';

const PITCH = 25;
const HALF = 220; // half the highlight tile
const EASE = 0.16; // per-frame catch-up of the trailing highlight

export function SharedDotBackdrop() {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const layer = ref.current;
    const host = layer?.parentElement;
    if (!layer || !host) return;
    const fine = window.matchMedia('(hover: hover) and (pointer: fine) and (min-width: 769px)');
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
    const enabled = () => fine.matches && !reduced.matches;

    let raf = 0;
    let px = 0; // pointer, viewport coordinates
    let py = 0;
    let cx = 0; // highlight centre, viewport coordinates (eases toward the pointer)
    let cy = 0;
    let active = false;
    let placed = false;

    const paint = () => {
      const r = host.getBoundingClientRect();
      const x = Math.round(cx - r.left - HALF);
      const y = Math.round(cy - r.top - HALF);
      layer.style.setProperty('--spot-x', `${x}px`);
      layer.style.setProperty('--spot-y', `${y}px`);
      // lock the tile's dots onto the base grid
      layer.style.setProperty('--phase-x', `${(((-x % PITCH) + PITCH) % PITCH)}px`);
      layer.style.setProperty('--phase-y', `${(((-y % PITCH) + PITCH) % PITCH)}px`);
    };
    const frame = () => {
      raf = 0;
      if (!active) return;
      cx += (px - cx) * EASE;
      cy += (py - cy) * EASE;
      paint();
      if (Math.abs(px - cx) > 0.4 || Math.abs(py - cy) > 0.4) raf = requestAnimationFrame(frame);
    };
    const kick = () => {
      if (!raf) raf = requestAnimationFrame(frame);
    };

    const move = (e: PointerEvent) => {
      if (e.pointerType !== 'mouse' && e.pointerType !== 'pen') return;
      if (!enabled()) return;
      px = e.clientX;
      py = e.clientY;
      if (!placed) {
        cx = px;
        cy = py;
        placed = true;
      }
      if (!active) {
        active = true;
        layer.dataset.active = 'true';
      }
      kick();
    };
    const leave = () => {
      active = false;
      placed = false;
      layer.dataset.active = 'false';
    };
    // the pointer stays put while the page scrolls under it: keep the highlight under the pointer
    const scroll = () => {
      if (active) {
        paint();
        kick();
      }
    };
    const prefs = () => {
      if (!enabled()) leave();
    };

    host.addEventListener('pointermove', move, { passive: true });
    host.addEventListener('pointerleave', leave, { passive: true });
    window.addEventListener('scroll', scroll, { passive: true });
    window.addEventListener('blur', leave);
    fine.addEventListener('change', prefs);
    reduced.addEventListener('change', prefs);
    return () => {
      host.removeEventListener('pointermove', move);
      host.removeEventListener('pointerleave', leave);
      window.removeEventListener('scroll', scroll);
      window.removeEventListener('blur', leave);
      fine.removeEventListener('change', prefs);
      reduced.removeEventListener('change', prefs);
      cancelAnimationFrame(raf);
    };
  }, []);

  return (
    <div ref={ref} className={s.root} data-active="false" aria-hidden="true">
      <div className={s.spot} />
    </div>
  );
}
