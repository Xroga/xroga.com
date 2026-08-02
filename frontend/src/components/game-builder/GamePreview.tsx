'use client';

import { useId } from 'react';
import type { ScenePreset } from '@/lib/gameCockpitContent';

/**
 * The cockpit's playable-looking preview.
 *
 * Original artwork, built from layered SVG shapes and CSS transforms rather than a
 * bitmap: nothing here is traced from, or derived from, any existing game. The
 * parallax layers, the neon skyline, the player and the mech are all primitive
 * geometry driven by the scene palette, so a preset swap recolours and reshapes the
 * whole scene without loading a single new asset.
 *
 * Why not Canvas 2D or WebGL: this sits above the fold on a marketing route. A
 * canvas needs a render loop that runs whether or not anyone is looking at it, and
 * a WebGL runtime would be a large dependency for decoration. CSS keyframes are
 * GPU-composited, pause precisely via `animation-play-state`, cost no JavaScript
 * per frame, and stop dead under `prefers-reduced-motion`. `playing` therefore maps
 * to a class, not to a timer.
 *
 * The scene is decorative: it carries `aria-hidden`, and the HUD numbers next to it
 * are exposed as text so a screen reader gets the state without the art.
 */
export function GamePreview({
  scene,
  playing,
  className,
}: {
  scene: ScenePreset;
  playing: boolean;
  className?: string;
}) {
  // Gradient ids must be unique per instance — this component renders more than
  // once on the page (cockpit, examples, iteration), and duplicate ids would make
  // every later instance reference the first one's palette.
  const uid = useId().replace(/[:]/g, '');
  const p = scene.palette;

  return (
    <div
      className={`xv-gc-scene ${playing ? 'is-playing' : ''} ${className ?? ''}`}
      data-scene={scene.id}
      aria-hidden="true"
      style={
        {
          '--sc-sky1': p.sky1,
          '--sc-sky2': p.sky2,
          '--sc-far': p.far,
          '--sc-mid': p.mid,
          '--sc-near': p.near,
          '--sc-ground': p.ground,
          '--sc-neon1': p.neon1,
          '--sc-neon2': p.neon2,
          '--sc-glow': p.glow,
        } as React.CSSProperties
      }
    >
      <svg className="xv-gc-scene__svg" viewBox="0 0 640 300" preserveAspectRatio="xMidYMid slice">
        <defs>
          <linearGradient id={`sky-${uid}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={p.sky1} />
            <stop offset="70%" stopColor={p.sky2} />
            <stop offset="100%" stopColor={p.sky1} />
          </linearGradient>
          <radialGradient id={`glow-${uid}`} cx="50%" cy="70%" r="60%">
            <stop offset="0%" stopColor={p.glow} stopOpacity="0.5" />
            <stop offset="100%" stopColor={p.glow} stopOpacity="0" />
          </radialGradient>
          <linearGradient id={`ground-${uid}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={p.near} />
            <stop offset="100%" stopColor={p.ground} />
          </linearGradient>
        </defs>

        <rect width="640" height="300" fill={`url(#sky-${uid})`} />
        <ellipse cx="320" cy="230" rx="300" ry="120" fill={`url(#glow-${uid})`} />

        {/* Three parallax bands. Their geometry comes from the preset's `shape`,
            so a dune field, a canyon crypt and a race corridor are genuinely
            different silhouettes rather than the same city in another colour. */}
        <g className="xv-gc-scene__far" opacity="0.55" fill={p.far}>
          <Horizon shape={scene.shape} seed={3} y={118} scale={1} />
        </g>

        <g className="xv-gc-scene__mid" fill={p.mid}>
          <Horizon shape={scene.shape} seed={7} y={140} scale={1.25} />
        </g>
        {scene.shape === 'city' || scene.shape === 'road' ? (
          <g className="xv-gc-scene__mid" opacity="0.9">
            {NEON_STRIPS.map((strip, i) => (
              <rect
                key={i}
                x={strip.x}
                y={strip.y}
                width={strip.w}
                height={strip.h}
                fill={i % 2 ? p.neon2 : p.neon1}
                opacity={0.8}
              />
            ))}
            {WINDOWS.map(([wx, wy], i) => (
              <rect key={`w${i}`} x={wx} y={wy} width="2.5" height="2.5" fill={i % 3 ? p.glow : p.neon2} opacity="0.7" />
            ))}
          </g>
        ) : null}

        <g className="xv-gc-scene__near" fill={p.near}>
          <Horizon shape={scene.shape} seed={11} y={176} scale={1.6} />
        </g>

        {/* a racing corridor rather than a platform floor */}
        {scene.shape === 'road' && (
          <g opacity="0.9">
            <path d="M250 238 L390 238 L640 300 L0 300 Z" fill={p.near} opacity="0.7" />
            <path d="M312 238 L328 238 L360 300 L280 300 Z" fill={p.neon2} opacity="0.5" />
          </g>
        )}

        {/* ground */}
        <rect x="0" y="238" width="640" height="62" fill={`url(#ground-${uid})`} />
        <rect x="0" y="238" width="640" height="2" fill={p.neon2} opacity="0.6" />

        {/* scrolling ground detail */}
        <g className="xv-gc-scene__tiles" opacity="0.5">
          {Array.from({ length: 22 }, (_, i) => (
            <rect key={i} x={i * 32} y={250} width={18} height="3" fill={p.neon1} opacity="0.35" />
          ))}
        </g>

        {/* the boss — an original blocky mech, not a likeness of any character */}
        <g className="xv-gc-scene__boss" transform="translate(430 108) scale(1.28)">
          <path d="M18 74 L6 108 L26 108 L34 82 Z" fill="#1c2330" />
          <path d="M74 74 L88 108 L68 108 L60 82 Z" fill="#1c2330" />
          <rect x="16" y="26" width="62" height="52" rx="6" fill="#2a3444" />
          <rect x="16" y="26" width="62" height="14" rx="4" fill="#39465a" />
          <rect x="26" y="46" width="42" height="10" rx="3" fill={p.neon1} opacity="0.85" />
          <rect x="30" y="4" width="34" height="24" rx="5" fill="#33404f" />
          <circle cx="40" cy="16" r="4" fill={p.glow} />
          <circle cx="54" cy="16" r="4" fill={p.glow} />
          <rect x="-4" y="34" width="22" height="9" rx="3" fill="#39465a" />
          <rect x="76" y="34" width="26" height="9" rx="3" fill="#39465a" />
          <rect x="96" y="34" width="12" height="9" rx="2" fill={p.neon2} />
        </g>

        {/* muzzle flashes travelling between player and boss */}
        <g className="xv-gc-scene__shots" fill={p.glow}>
          <circle className="xv-gc-scene__shot xv-gc-scene__shot--1" cx="0" cy="196" r="4" />
          <circle className="xv-gc-scene__shot xv-gc-scene__shot--2" cx="0" cy="188" r="3" />
        </g>

        {/* the player — an original blocky runner */}
        <g className="xv-gc-scene__player" transform="translate(150 176) scale(1.22)">
          <rect x="6" y="0" width="18" height="18" rx="5" fill="#e8f1ff" />
          <rect x="8" y="5" width="14" height="5" rx="2" fill={p.neon2} />
          <rect x="4" y="18" width="22" height="24" rx="5" fill="#2f8fd8" />
          <rect x="7" y="24" width="16" height="6" rx="2" fill={p.neon2} opacity="0.8" />
          <rect className="xv-gc-scene__leg xv-gc-scene__leg--a" x="6" y="42" width="7" height="16" rx="3" fill="#1f3a52" />
          <rect className="xv-gc-scene__leg xv-gc-scene__leg--b" x="17" y="42" width="7" height="16" rx="3" fill="#1f3a52" />
          <rect x="24" y="22" width="18" height="6" rx="2" fill="#3b4a5c" />
        </g>
      </svg>

      {/* atmosphere over the art, so fog reads in front of the skyline */}
      <span className="xv-gc-scene__fog" />
      <span className="xv-gc-scene__vignette" />
      <span className="xv-gc-scene__embers">
        {Array.from({ length: 8 }, (_, i) => (
          <i key={i} style={{ ['--i' as string]: i }} />
        ))}
      </span>
    </div>
  );
}

/** Neon window strips on the mid skyline. Fixed values keep hydration stable. */
const NEON_STRIPS = [
  { x: 58, y: 158, w: 4, h: 26 },
  { x: 96, y: 150, w: 4, h: 34 },
  { x: 132, y: 170, w: 3, h: 16 },
  { x: 168, y: 164, w: 4, h: 20 },
  { x: 205, y: 156, w: 3, h: 28 },
  { x: 236, y: 146, w: 4, h: 38 },
  { x: 270, y: 168, w: 3, h: 18 },
  { x: 302, y: 158, w: 4, h: 26 },
  { x: 342, y: 150, w: 3, h: 32 },
  { x: 388, y: 152, w: 4, h: 32 },
  { x: 428, y: 166, w: 3, h: 18 },
  { x: 470, y: 162, w: 4, h: 22 },
  { x: 512, y: 154, w: 3, h: 30 },
  { x: 556, y: 148, w: 4, h: 36 },
  { x: 598, y: 164, w: 3, h: 20 },
] as const;

/** Small lit windows dusted over the mid band. Fixed, for hydration stability. */
const WINDOWS = [
  [70, 176], [78, 182], [110, 170], [148, 178], [156, 186], [190, 172], [222, 180],
  [252, 168], [288, 184], [320, 174], [356, 182], [396, 170], [440, 180], [484, 172],
  [524, 184], [566, 174], [610, 182],
] as const;

/**
 * A deterministic horizon band.
 *
 * A small LCG rather than `Math.random()` so the server and the client draw the
 * identical path — a random skyline would mismatch on every hydration. The `shape`
 * switches the generator, not just its numbers: towers, dunes, a race corridor, and
 * crypt pillars each build a different path.
 */
function Horizon({
  shape,
  seed,
  y,
  scale,
}: {
  shape: 'city' | 'dunes' | 'road' | 'crypt';
  seed: number;
  y: number;
  scale: number;
}) {
  let s = seed * 9301 + 49297;
  const rand = () => {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280;
  };

  const parts: string[] = [];

  if (shape === 'dunes') {
    // One continuous rolling ridge, so it reads as landscape rather than buildings.
    let d = `M-20 300 L-20 ${y + 10}`;
    let x = -20;
    while (x < 660) {
      const step = 70 + Math.round(rand() * 70);
      const peak = y - 12 - Math.round(rand() * 46 * scale);
      d += ` Q${x + step / 2} ${peak} ${x + step} ${y + 6 - Math.round(rand() * 16)}`;
      x += step;
    }
    return <path d={`${d} L660 300 Z`} />;
  }

  if (shape === 'crypt') {
    // Arches and pillars: flat lintel on top, gaps between.
    let x = -10;
    while (x < 660) {
      const w = 34 + Math.round(rand() * 26 * scale);
      const h = 46 + Math.round(rand() * 40 * scale);
      parts.push(`M${x} 300 L${x} ${y - h} L${x + w} ${y - h} L${x + w} 300 Z`);
      parts.push(`M${x - 4} ${y - h} L${x + w + 4} ${y - h} L${x + w + 4} ${y - h + 8} L${x - 4} ${y - h + 8} Z`);
      x += w + 26 + Math.round(rand() * 18);
    }
    return <path d={parts.join(' ')} />;
  }

  if (shape === 'road') {
    // Sparse pylons framing a corridor, taller and thinner than city blocks.
    let x = -10;
    while (x < 660) {
      const w = 10 + Math.round(rand() * 12 * scale);
      const h = 60 + Math.round(rand() * 90 * scale);
      parts.push(`M${x} 300 L${x} ${y - h} L${x + w} ${y - h} L${x + w} 300 Z`);
      parts.push(`M${x - 6} ${y - h} L${x + w + 6} ${y - h} L${x + w + 6} ${y - h + 5} L${x - 6} ${y - h + 5} Z`);
      x += w + 44 + Math.round(rand() * 30);
    }
    return <path d={parts.join(' ')} />;
  }

  // city
  let x = -20;
  while (x < 660) {
    const w = 18 + Math.round(rand() * 46 * scale);
    const h = 20 + Math.round(rand() * 70 * scale);
    parts.push(`M${x} 300 L${x} ${y - h} L${x + w} ${y - h} L${x + w} 300 Z`);
    // a roof aerial on some blocks, which is what stops the row reading as a bar chart
    if (rand() > 0.62) {
      const cx = x + w / 2;
      parts.push(`M${cx - 1} ${y - h} L${cx - 1} ${y - h - 14} L${cx + 1} ${y - h - 14} L${cx + 1} ${y - h} Z`);
    }
    x += w + 6 + Math.round(rand() * 14);
  }
  return <path d={parts.join(' ')} />;
}
