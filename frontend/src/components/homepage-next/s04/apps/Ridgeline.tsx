'use client';

/**
 * Ridgeline: a fictional Android game (landscape, natural size 880 × 406).
 * One world drawn in layers: dusk sky, stars, sun, cloud bands, three ridge depths with sun rim light, a pine line and
 * a foreground ledge. While the scene plays the world scrolls by depth (parallax). Lift makes the hang glider climb
 * through the ring ahead; the ring bursts, the score and combo rise. The feature graphic is composed from the same
 * world (RidgelineKeyArt), not copied from the screen.
 */
import { useId } from 'react';
import r from './Ridgeline.module.css';

const W = 880;
const H = 406;

/** deterministic ridge silhouettes (same shape on server and client) */
function ridge(seed: number, base: number, amp: number, step: number, width: number) {
  let s = seed;
  const rnd = () => {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280;
  };
  const pts: [number, number][] = [];
  for (let x = -40; x <= width + 40; x += step * (0.6 + rnd() * 0.8)) pts.push([x, base - amp * (0.25 + rnd() * 0.75)]);
  const top = pts.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`).join(' ');
  return { d: `${top} L${width + 40} ${H + 10} L-40 ${H + 10} Z`, top, pts };
}
const FAR = ridge(7, 268, 120, 70, 1100);
const MID = ridge(31, 306, 110, 58, 1300);
const NEAR = ridge(53, 338, 74, 46, 1600);
const PINES = NEAR.pts.filter((_, i) => i % 2 === 0).flatMap(([x, y], i) => [
  [x + 6, y + 4, 12 + (i % 3) * 5],
  [x + 20, y + 8, 9 + (i % 2) * 4],
]);
const STARS = Array.from({ length: 34 }, (_, i) => [((i * 157) % 900) - 10, 12 + ((i * 89) % 130), 0.5 + ((i * 7) % 10) / 10]);

export function RidgelineIcon({ size = 40 }: { size?: number }) {
  const id = useId().replace(/:/g, '');
  return (
    <svg className={r.icon} width={size} height={size} viewBox="0 0 64 64" aria-hidden="true">
      <defs>
        <linearGradient id={`rs${id}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#2b2357" />
          <stop offset="0.55" stopColor="#b85a7a" />
          <stop offset="1" stopColor="#f5b06c" />
        </linearGradient>
      </defs>
      <rect width="64" height="64" rx="14" fill={`url(#rs${id})`} />
      <circle cx="42" cy="34" r="9" fill="#ffe3b8" />
      <path d="M0 46 14 34l9 6 13-12 28 20v16H0z" fill="#3b2c5c" />
      <path d="M0 54 18 46l16 5 30-9v22H0z" fill="#1a1430" />
      <path d="M14 22 34 18 26 27z" fill="#fff6ea" />
      <path d="M24 22.6v6" stroke="#fff6ea" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

/* ------------------------------------------------------------------ the world's art, layer by layer */
function Defs({ id }: { id: string }) {
  return (
    <defs>
        <linearGradient id={`sky${id}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#171a44" />
          <stop offset="0.38" stopColor="#3f2d69" />
          <stop offset="0.62" stopColor="#a4507a" />
          <stop offset="0.8" stopColor="#ef8f6c" />
          <stop offset="1" stopColor="#ffcf94" />
        </linearGradient>
        <radialGradient id={`glow${id}`} cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor="#ffe8c0" stopOpacity="0.9" />
          <stop offset="0.35" stopColor="#ffb98a" stopOpacity="0.45" />
          <stop offset="1" stopColor="#ff9a7a" stopOpacity="0" />
        </radialGradient>
        <linearGradient id={`far${id}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#d6909d" />
          <stop offset="1" stopColor="#9b6488" />
        </linearGradient>
        <linearGradient id={`mid${id}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#5d3f73" />
          <stop offset="1" stopColor="#33264f" />
        </linearGradient>
        <linearGradient id={`near${id}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#261c3e" />
          <stop offset="1" stopColor="#120d22" />
        </linearGradient>
        <linearGradient id={`haze${id}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ffc59a" stopOpacity="0" />
          <stop offset="1" stopColor="#ffc59a" stopOpacity="0.28" />
        </linearGradient>
        {/* sun-facing light on every ridge: brighter toward the sun, gone at the edges */}
        <radialGradient id={`lit${id}`} gradientUnits="userSpaceOnUse" cx="620" cy="210" r="440">
          <stop offset="0" stopColor="#ffd8b4" stopOpacity="0.42" />
          <stop offset="0.45" stopColor="#ffb79a" stopOpacity="0.14" />
          <stop offset="1" stopColor="#ffb79a" stopOpacity="0" />
        </radialGradient>
        <linearGradient id={`mist${id}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#d99aa6" stopOpacity="0" />
          <stop offset="0.6" stopColor="#c98aa0" stopOpacity="0.32" />
          <stop offset="1" stopColor="#c98aa0" stopOpacity="0" />
        </linearGradient>
        <linearGradient id={`cloud${id}`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#ffd7c0" stopOpacity="0" />
          <stop offset="0.5" stopColor="#ffd2bb" stopOpacity="0.55" />
          <stop offset="1" stopColor="#ffd7c0" stopOpacity="0" />
        </linearGradient>
        <linearGradient id={`ring${id}`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#fff1c9" />
          <stop offset="0.5" stopColor="#ffc35a" />
          <stop offset="1" stopColor="#ff9a3d" />
        </linearGradient>
        <linearGradient id={`wing${id}`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#ffffff" />
          <stop offset="1" stopColor="#ffd9bf" />
        </linearGradient>
    </defs>
  );
}
function SkyArt({ id }: { id: string }) {
  return (
    <>
      <rect width="1200" height={H} fill={`url(#sky${id})`} />
      <g>
        {STARS.map(([x, y, o], i) => (
          <circle key={i} cx={x} cy={y} r={o > 1.1 ? 1.4 : 0.9} fill="#fff" opacity={0.25 + (o % 1) * 0.5} />
        ))}
      </g>
      <circle cx="610" cy="206" r="200" fill={`url(#glow${id})`} />
      <circle cx="610" cy="206" r="40" fill="#fff4dc" />
    </>
  );
}
function CloudArt({ id }: { id: string }) {
  return (
    <>
      <ellipse cx="260" cy="196" rx="260" ry="9" fill={`url(#cloud${id})`} />
      <ellipse cx="760" cy="168" rx="220" ry="7" fill={`url(#cloud${id})`} />
      <ellipse cx="1060" cy="214" rx="240" ry="8" fill={`url(#cloud${id})`} />
    </>
  );
}
function FarArt({ id }: { id: string }) {
  return (
    <>
      <path d={FAR.d} fill={`url(#far${id})`} />
      <path d={FAR.d} fill={`url(#lit${id})`} />
      <path d={FAR.top} fill="none" stroke="#ffd6b0" strokeOpacity="0.35" strokeWidth="1.2" />
    </>
  );
}
function MidArt({ id }: { id: string }) {
  return (
    <>
      <rect y="200" width="1400" height="140" fill={`url(#haze${id})`} />
      <path d={MID.d} fill={`url(#mid${id})`} />
      <path d={MID.d} fill={`url(#lit${id})`} opacity="0.5" />
      <path d={MID.top} fill="none" stroke="#ffb98f" strokeOpacity="0.45" strokeWidth="1.4" />
    </>
  );
}
function NearArt({ id }: { id: string }) {
  return (
    <>
      <rect y="262" width="1700" height="70" fill={`url(#mist${id})`} />
      <path d={NEAR.d} fill={`url(#near${id})`} />
      <path d={NEAR.d} fill={`url(#lit${id})`} opacity="0.25" />
      <path d={NEAR.top} fill="none" stroke="#ff9f7f" strokeOpacity="0.3" strokeWidth="1.2" />
      {PINES.map(([x, y, h], i) => (
        <path key={i} d={`M${x} ${y - h} L${x + h * 0.38} ${y + 2} L${x - h * 0.38} ${y + 2} Z`} fill="#140f27" />
      ))}
    </>
  );
}
const LEDGE = 'M-20 406 L-20 372 C60 360 120 376 190 366 C260 356 300 374 380 370 C470 366 520 352 600 360 C700 370 760 352 860 362 C960 372 1020 356 1120 364 L1120 406 Z';
function RingArt({ id }: { id: string }) {
  return (
    <>
      <ellipse rx="20" ry="34" fill="none" stroke="#ffcf7a" strokeOpacity="0.25" strokeWidth="12" />
      <ellipse rx="20" ry="34" fill="none" stroke={`url(#ring${id})`} strokeWidth="4.5" />
    </>
  );
}
function GliderArt({ id }: { id: string }) {
  return (
    <>
      <path d="M-118 6 C-80 4 -40 2 -26 0" stroke="#fff3e2" strokeOpacity="0.5" strokeWidth="1.6" fill="none" strokeLinecap="round" />
      <path d="M-112 20 C-74 18 -36 14 -22 12" stroke="#fff3e2" strokeOpacity="0.35" strokeWidth="1.4" fill="none" strokeLinecap="round" />
      <path d="M-28 2 L30 -6 L-22 14 Z" fill={`url(#wing${id})`} />
      <path d="M-28 2 L30 -6 L-6 6 Z" fill="#fff" opacity="0.9" />
      <path d="M-4 5 L-2 17" stroke="#2a1e3e" strokeWidth="1.6" strokeLinecap="round" />
      <path d="M-12 18 L6 16" stroke="#2a1e3e" strokeWidth="1.6" strokeLinecap="round" />
      <ellipse cx="-3" cy="21" rx="7" ry="2.6" fill="#2a1e3e" />
      <circle cx="4" cy="19.5" r="2.4" fill="#2a1e3e" />
    </>
  );
}
/** a layer of the live game: its own composited element, so scrolling it never repaints the rest of the world */
function Layer({ depth, w, children }: { depth: string; w: number; children: React.ReactNode }) {
  return (
    <svg className={r.layer} data-depth={depth} width={w} height={H} viewBox={`0 0 ${w} ${H}`} aria-hidden="true">
      {children}
    </svg>
  );
}
/** a small element placed at (cx, cy) in world pixels, box w × h centred on it */
function Spot({ cx, cy, w, h, className, k, children }: { cx: number; cy: number; w: number; h: number; className: string; k?: string; children: React.ReactNode }) {
  return (
    <svg className={className} data-k={k} style={{ left: cx - w / 2, top: cy - h / 2 }} width={w} height={h} viewBox={`${-w / 2} ${-h / 2} ${w} ${h}`} aria-hidden="true">
      {children}
    </svg>
  );
}

export function Ridgeline({ lifted, live = false, onAction }: { lifted: boolean; live?: boolean; onAction?: () => void }) {
  const id = useId().replace(/:/g, '');
  return (
    <div className={r.game} data-lifted={lifted || undefined}>
      <svg className={r.sky} width={W} height={H} viewBox={`0 0 ${W} ${H}`} aria-hidden="true">
        <Defs id={id} />
        <SkyArt id={id} />
      </svg>
      <Layer depth="cloud" w={1200}>
        <CloudArt id={id} />
      </Layer>
      <Layer depth="far" w={1200}>
        <FarArt id={id} />
      </Layer>
      <Layer depth="mid" w={1400}>
        <MidArt id={id} />
      </Layer>
      <Layer depth="near" w={1700}>
        <NearArt id={id} />
      </Layer>
      <Layer depth="ledge" w={1200}>
        <path d={LEDGE} fill="#0e0a1c" />
      </Layer>
      {/* the play layer moves with the near ridge; its rings and burst are separate small elements */}
      <div className={r.layer} data-depth="play" aria-hidden="true">
        <Spot cx={548} cy={168} w={60} h={92} className={r.ring} k="target">
          <RingArt id={id} />
        </Spot>
        <Spot cx={548} cy={168} w={90} h={110} className={r.burst}>
          {Array.from({ length: 10 }, (_, i) => {
            const a = (i / 10) * Math.PI * 2;
            return <circle key={i} cx={Math.cos(a) * 30} cy={Math.sin(a) * 42} r="2.4" fill="#ffd98f" />;
          })}
        </Spot>
        <Spot cx={780} cy={120} w={60} h={92} className={r.ring}>
          <RingArt id={id} />
        </Spot>
        <Spot cx={1010} cy={196} w={60} h={92} className={r.ring}>
          <RingArt id={id} />
        </Spot>
      </div>
      {/* the pilot: one small element, moved by transform */}
      <svg className={r.glider} width="160" height="50" viewBox="-130 -22 160 50" aria-hidden="true">
        <GliderArt id={id} />
      </svg>
      <div className={r.hud} aria-hidden="true">
        <span className={r.brand}>
          <b>Ridgeline</b>
          <small>Ridge 4 · Dusk</small>
        </span>
        <span className={r.score}>
          <span className={r.scoreVal}>
            <b data-k="before">12,480</b>
            <b data-k="after">12,730</b>
          </span>
          <em className={r.combo}>× 2</em>
        </span>
        <span className={r.pause}>
          <i />
          <i />
        </span>
        <span className={r.summit}>
          <i />
          <small>Summit</small>
        </span>
        <span className={r.plus}>+250</span>
      </div>
      <span className={r.alt} aria-hidden="true">
        <small>Alt</small>
        <span className={r.altTrack}>
          <i />
        </span>
        <b>
          <span data-k="before">412</span>
          <span data-k="after">486</span> m
        </b>
      </span>
      <span className={r.liftWrap} data-r="btn">
        {live ? (
          <button type="button" className={r.lift} aria-pressed={lifted} aria-label="Lift: climb through the ring" onClick={onAction}>
            <LiftGlyph />
            Lift
          </button>
        ) : (
          <span className={r.lift}>
            <LiftGlyph />
            Lift
          </span>
        )}
      </span>
      <span className={r.passZone} data-r="flight" aria-hidden="true" />
      <i className={r.gesture} aria-hidden="true" />
    </div>
  );
}
function LiftGlyph() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M6 14.5 12 8.5l6 6" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/**
 * The feature graphic's key art: the same world, recomposed (the glider through the ring, centred on the sun, no HUD)
 * with the title lockup. `graded` adds the final colour grade and title; before that it is the raw render.
 */
export function RidgelineKeyArt({ graded = true }: { graded?: boolean }) {
  const id = useId().replace(/:/g, '');
  return (
    <div className={r.keyart} data-graded={graded || undefined}>
      <svg className={r.world} viewBox="140 60 600 293" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
        <Defs id={id} />
        <SkyArt id={id} />
        <CloudArt id={id} />
        <FarArt id={id} />
        <MidArt id={id} />
        <NearArt id={id} />
        <g transform="translate(548 168)">
          <RingArt id={id} />
        </g>
        <g transform="translate(536 172) rotate(-12) scale(1.15)">
          <GliderArt id={id} />
        </g>
      </svg>
      <span className={r.lockup}>
        <RidgelineIcon size={34} />
        <span>
          <b>Ridgeline</b>
          <small>Glide the ridges at dusk</small>
        </span>
      </span>
    </div>
  );
}
