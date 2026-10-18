'use client';

/**
 * S05 · the capability universe. A heading, one line, and two rails of compact capability tiles (everyday & business,
 * specialized & technical); each tile carries one of thirteen original compositions (art.ts) styled by S05.css.
 *
 * The rails are native horizontal scrollers with snap points, so trackpads, touch and keyboard all work as the platform
 * expects; arrow buttons page through them, a mouse can drag them, and ArrowLeft/ArrowRight move between tiles. A tile
 * plays its graphic while hovered, focused or (on touch) tapped: the state is a `data-on` attribute set directly on the
 * tile, so hovering never re-renders React. Nothing animates unless a tile is on; there is no auto drift.
 */
import { useCallback, useEffect, useId, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import { ART } from './art';
import { COPY, ROWS, type Capability } from './capabilities';
import './S05.css';

const on = (el: HTMLElement) => el.setAttribute('data-on', '');
const off = (el: HTMLElement) => el.removeAttribute('data-on');

function Tile({ c }: { c: Capability }) {
  const timer = useRef<number>();
  useEffect(() => () => window.clearTimeout(timer.current), []);
  return (
    <li
      className="s5-tile"
      data-id={c.id}
      tabIndex={0}
      aria-labelledby={`s05-${c.id}`}
      onPointerEnter={(e) => e.pointerType !== 'touch' && on(e.currentTarget)}
      onPointerLeave={(e) => e.pointerType !== 'touch' && off(e.currentTarget)}
      onFocus={(e) => on(e.currentTarget)}
      onBlur={(e) => off(e.currentTarget)}
      onClick={(e) => {
        // touch has no hover: a tap plays the tile once, and lets it settle back on its own
        if ((e.nativeEvent as globalThis.PointerEvent).pointerType !== 'touch') return;
        const el = e.currentTarget;
        off(el);
        void el.getBoundingClientRect();
        on(el);
        window.clearTimeout(timer.current);
        timer.current = window.setTimeout(() => off(el), 3000);
      }}
    >
      <h4 id={`s05-${c.id}`} className="s5-tileTitle">
        {c.title}
      </h4>
      <p className="s5-tileLine">{c.line}</p>
      {/* static, trusted markup authored in art.ts (no visitor data) */}
      <span className="s5-artHost" aria-hidden="true" dangerouslySetInnerHTML={{ __html: ART[c.id] }} />
    </li>
  );
}

function Rail({ label, items }: { label: string; items: Capability[] }) {
  const id = useId();
  const track = useRef<HTMLUListElement>(null);
  const [edge, setEdge] = useState({ atStart: true, atEnd: false });
  const drag = useRef<{ x: number; left: number; moved: boolean } | null>(null);

  const measure = useCallback(() => {
    const t = track.current;
    if (!t) return;
    const atStart = t.scrollLeft <= 2;
    const atEnd = t.scrollLeft + t.clientWidth >= t.scrollWidth - 2;
    setEdge((p) => (p.atStart === atStart && p.atEnd === atEnd ? p : { atStart, atEnd }));
  }, []);

  useEffect(() => {
    const t = track.current;
    if (!t) return;
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(t);
    return () => ro.disconnect();
  }, [measure]);

  const page = (dir: 1 | -1) => {
    const t = track.current;
    if (!t) return;
    const tile = t.querySelector('li');
    const step = tile ? tile.getBoundingClientRect().width + 14 : 300;
    // page by the tiles fully in view inside the content column, so nothing is skipped
    const view = t.parentElement ? t.parentElement.getBoundingClientRect().width : t.clientWidth;
    const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
    t.scrollBy({ left: dir * Math.max(step, Math.floor(view / step) * step), behavior: reduced ? 'auto' : 'smooth' });
  };

  // a mouse can drag the rail; touch and trackpads scroll it natively
  const down = (e: PointerEvent<HTMLUListElement>) => {
    if (e.pointerType !== 'mouse' || e.button !== 0) return;
    drag.current = { x: e.clientX, left: e.currentTarget.scrollLeft, moved: false };
  };
  const move = (e: PointerEvent<HTMLUListElement>) => {
    const d = drag.current;
    if (!d) return;
    const dx = e.clientX - d.x;
    if (!d.moved && Math.abs(dx) < 6) return;
    if (!d.moved) {
      d.moved = true;
      e.currentTarget.setPointerCapture(e.pointerId);
      e.currentTarget.setAttribute('data-drag', '');
    }
    e.currentTarget.scrollLeft = d.left - dx;
  };
  const up = (e: PointerEvent<HTMLUListElement>) => {
    const d = drag.current;
    drag.current = null;
    // the rail settles on the nearest tile once snapping is back on
    if (d?.moved) e.currentTarget.removeAttribute('data-drag');
  };

  // ArrowLeft / ArrowRight move between tiles; Home / End jump to the ends
  const keys = (e: KeyboardEvent<HTMLUListElement>) => {
    const tiles = [...e.currentTarget.querySelectorAll<HTMLElement>('li')];
    const i = tiles.indexOf(document.activeElement as HTMLElement);
    if (i < 0) return;
    const next = { ArrowRight: i + 1, ArrowLeft: i - 1, Home: 0, End: tiles.length - 1 }[e.key];
    if (next === undefined || next < 0 || next >= tiles.length) return;
    e.preventDefault();
    tiles[next].focus();
  };

  return (
    <div className="s5-rail" role="group" aria-labelledby={`${id}-label`}>
      <div className="s5-railHead">
        <h3 id={`${id}-label`} className="s5-railLabel">
          {label} <span aria-hidden="true">{String(items.length).padStart(2, '0')}</span>
        </h3>
        <div className="s5-arrows">
          <button type="button" className="s5-arrow" onClick={() => page(-1)} disabled={edge.atStart} aria-label={`Show earlier ${label.toLowerCase()} capabilities`}>
            <svg viewBox="0 0 16 16" aria-hidden="true">
              <path d="M10 3 5 8l5 5" />
            </svg>
          </button>
          <button type="button" className="s5-arrow" onClick={() => page(1)} disabled={edge.atEnd} aria-label={`Show more ${label.toLowerCase()} capabilities`}>
            <svg viewBox="0 0 16 16" aria-hidden="true">
              <path d="m6 3 5 5-5 5" />
            </svg>
          </button>
        </div>
      </div>
      <ul ref={track} className="s5-track" onScroll={measure} onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up} onKeyDown={keys}>
        {items.map((c) => (
          <Tile key={c.id} c={c} />
        ))}
      </ul>
    </div>
  );
}

export function S05Capabilities() {
  return (
    <section id="s05" aria-labelledby="s05-title" className="s5">
      <div className="s5-inner">
        <header className="s5-head">
          <p className="s5-eyebrow">{COPY.eyebrow}</p>
          <h2 id="s05-title" className="s5-title">
            <span className="s5-lead">{COPY.titleLead}</span> <span className="s5-accent">{COPY.titleAccent}</span>
          </h2>
          <p className="s5-lede">{COPY.lede}</p>
        </header>
        <div className="s5-rails">
          {ROWS.map((row, r) => (
            <Rail key={COPY.rows[r]} label={COPY.rows[r]} items={row} />
          ))}
        </div>
        <p className="s5-note">{COPY.note}</p>
      </div>
    </section>
  );
}
