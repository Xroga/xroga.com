'use client';

/**
 * Fernway: a fictional Android trail-map app (Material 3), natural size 300 × 640.
 * Its real action: "Save offline" downloads the trail map (progress, then a check), the map gains its offline badge and
 * an Android snackbar confirms it. Store screenshots and the feature graphic are built from these same screens and
 * the same map art. Colours stay inside the app; the release environment around it is Xroga's.
 */
import { useId } from 'react';
import f from './Fernway.module.css';

export type FernwayScreen = 'explore' | 'detail' | 'offline';

/* ---------------------------------------------------------------- the map: deterministic topographic contours */
function contours(cx: number, cy: number, n: number, base: number, seed: number) {
  const out: string[] = [];
  for (let k = 0; k < n; k++) {
    const r = base + k * 13;
    const pts: string[] = [];
    for (let i = 0; i <= 48; i++) {
      const a = (i / 48) * Math.PI * 2;
      const wob = 1 + 0.16 * Math.sin(a * 3 + seed + k * 0.4) + 0.08 * Math.cos(a * 5 + seed * 1.7);
      pts.push(`${i ? 'L' : 'M'}${(cx + Math.cos(a) * r * wob * 1.25).toFixed(1)} ${(cy + Math.sin(a) * r * wob).toFixed(1)}`);
    }
    out.push(`${pts.join(' ')}Z`);
  }
  return out;
}
const PEAK_A = contours(205, 120, 7, 10, 1.2);
const PEAK_B = contours(70, 250, 6, 12, 3.1);
const ROUTE = 'M58 300 C78 262 70 226 104 204 C138 182 150 150 178 140 C204 130 214 104 236 92';

export function TrailMap({ id, saved, wide = false }: { id: string; saved?: boolean; wide?: boolean }) {
  return (
    <svg className={f.map} viewBox={wide ? '-60 0 400 340' : '0 0 280 340'} preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      <defs>
        <linearGradient id={`land${id}`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#e4efd9" />
          <stop offset="1" stopColor="#cfe2c3" />
        </linearGradient>
        <radialGradient id={`shade${id}`} cx="0.75" cy="0.3" r="0.6">
          <stop offset="0" stopColor="#9fc58d" stopOpacity="0.55" />
          <stop offset="1" stopColor="#9fc58d" stopOpacity="0" />
        </radialGradient>
      </defs>
      <rect x="-80" width="440" height="340" fill={`url(#land${id})`} />
      <rect x="-80" width="440" height="340" fill={`url(#shade${id})`} />
      <path d="M-80 296 C-20 280 10 312 52 322 C90 332 120 316 150 340 L-80 340Z" fill="#a8d1e6" />
      <path d="M232 230 C262 214 300 226 312 250 C322 272 292 290 262 282 C236 276 214 250 232 230Z" fill="#a8d1e6" />
      {[...PEAK_A, ...PEAK_B].map((d, i) => (
        <path key={i} d={d} fill="none" stroke="#7fa96d" strokeOpacity={0.35 + (i % 7) * 0.05} strokeWidth={i % 7 === 3 ? 1.3 : 0.8} />
      ))}
      <path d="M-80 180 C0 172 40 200 120 190 S240 160 360 176" fill="none" stroke="#fffaf0" strokeWidth="3" strokeOpacity="0.9" />
      <path className={f.route} d={ROUTE} fill="none" stroke="#1f6e3d" strokeWidth="4" strokeLinecap="round" />
      <path d={ROUTE} fill="none" stroke="#fff" strokeWidth="1.2" strokeLinecap="round" strokeDasharray="2 6" />
      <g transform="translate(58 300)">
        <circle r="8" fill="#1f6e3d" />
        <circle r="3" fill="#fff" />
      </g>
      <g transform="translate(236 92)">
        <path d="M0 0 L-7 -14 A8 8 0 1 1 7 -14 Z" fill="#b3261e" />
        <circle cy="-15" r="3" fill="#fff" />
      </g>
      {saved && <rect x="-80" width="440" height="340" fill="#1f6e3d" opacity="0.04" />}
    </svg>
  );
}

export function FernwayIcon({ size = 40 }: { size?: number }) {
  const id = useId().replace(/:/g, '');
  return (
    <svg className={f.icon} width={size} height={size} viewBox="0 0 64 64" aria-hidden="true">
      <defs>
        <linearGradient id={`fi${id}`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#2f8a52" />
          <stop offset="1" stopColor="#14522c" />
        </linearGradient>
      </defs>
      <rect width="64" height="64" rx="16" fill={`url(#fi${id})`} />
      <path d="M12 46 C20 40 22 30 30 28 C38 26 40 18 50 16" fill="none" stroke="#c8f5cf" strokeWidth="4" strokeLinecap="round" />
      <path d="M32 50 L32 30 M32 38 L24 32 M32 42 L40 35 M32 34 L38 28" stroke="#fff" strokeWidth="3" strokeLinecap="round" />
      <circle cx="50" cy="16" r="4" fill="#fff" />
    </svg>
  );
}

function StatusBar() {
  return (
    <div className={f.status} aria-hidden="true">
      <span>9:41</span>
      <i className={f.punch} />
      <span className={f.sys}>
        <svg width="14" height="12" viewBox="0 0 16 13">
          <path d="M8 12 0.6 4.4a10.5 10.5 0 0 1 14.8 0z" fill="currentColor" />
        </svg>
        <svg width="12" height="12" viewBox="0 0 12 12">
          <path d="M11 1v10H1z" fill="currentColor" />
        </svg>
        <svg width="8" height="13" viewBox="0 0 8 13">
          <rect x="0" y="1.5" width="8" height="11.5" rx="1.5" fill="currentColor" />
          <rect x="2.5" y="0" width="3" height="2" rx="0.6" fill="currentColor" />
        </svg>
      </span>
    </div>
  );
}

const NAV: { key: string; label: string; d: string }[] = [
  { key: 'explore', label: 'Explore', d: 'M12 3 4 7v10l8 4 8-4V7z M4 7l8 4 8-4 M12 11v10' },
  { key: 'offline', label: 'Saved', d: 'M6 3h12v18l-6-4-6 4z' },
  { key: 'record', label: 'Record', d: 'M12 20a8 8 0 1 0 0-16 8 8 0 0 0 0 16z M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z' },
  { key: 'me', label: 'You', d: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8z M4.5 20c1.2-3.6 4-5.5 7.5-5.5s6.3 1.9 7.5 5.5' },
];
function NavBar({ on }: { on: string }) {
  return (
    <nav className={f.nav} aria-hidden="true">
      {NAV.map((n) => (
        <span key={n.key} data-on={n.key === on || undefined}>
          <i>
            <svg width="20" height="20" viewBox="0 0 24 24">
              <path d={n.d} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" strokeLinecap="round" />
            </svg>
          </i>
          {n.label}
        </span>
      ))}
      <b className={f.handle} />
    </nav>
  );
}

function Elevation({ id, tall }: { id: string; tall?: boolean }) {
  const pts = [8, 10, 14, 22, 30, 41, 47, 52, 49, 55, 62, 58, 50, 40, 31, 22, 15, 10];
  const W = 248;
  const H = tall ? 70 : 34;
  const line = pts.map((v, i) => `${i ? 'L' : 'M'}${((i * W) / (pts.length - 1)).toFixed(1)} ${(H - (v / 64) * H).toFixed(1)}`).join(' ');
  return (
    <svg className={f.elev} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden="true">
      <defs>
        <linearGradient id={`el${id}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#2f8a52" stopOpacity="0.35" />
          <stop offset="1" stopColor="#2f8a52" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={`${line} L${W} ${H} L0 ${H}Z`} fill={`url(#el${id})`} />
      <path d={line} fill="none" stroke="#1f6e3d" strokeWidth="2" />
    </svg>
  );
}

/* ---------------------------------------------------------------- Explore: the live screen */
export function FernwayExplore({ saved, live = false, onAction }: { saved: boolean; live?: boolean; onAction?: () => void }) {
  const id = useId().replace(/:/g, '');
  return (
    <div className={f.app} data-saved={saved || undefined}>
      <StatusBar />
      <div className={f.body}>
        <div className={f.search}>
          <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M10.5 18a7.5 7.5 0 1 0 0-15 7.5 7.5 0 0 0 0 15zM16 16l5 5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
          <span>Search trails</span>
          <i className={f.avatar}>A</i>
        </div>
        <div className={f.chips} aria-hidden="true">
          <span data-on="">
            <svg width="12" height="12" viewBox="0 0 16 16">
              <path d="m3.5 8.5 3 3 6-7" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            Loop
          </span>
          <span>Waterfalls</span>
          <span>Under 10 km</span>
        </div>
        <div className={f.mapCard} data-r="map">
          <TrailMap id={id} saved={saved} />
          <span className={f.mapTag}>{saved ? 'Offline map ready' : 'Online map'}</span>
          {saved && (
            <span className={f.offlineBadge}>
              <svg width="12" height="12" viewBox="0 0 16 16" aria-hidden="true">
                <path d="M8 2v8m0 0-3-3m3 3 3-3M3 13h10" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              Saved
            </span>
          )}
        </div>
        <div className={f.trail} data-r="card">
          <div className={f.trailHead}>
            <span>
              <b>Cascade Loop</b>
              <small>Mount Ash · Moderate</small>
            </span>
            <em className={f.rating}>4.8 ★</em>
          </div>
          <dl className={f.stats}>
            <div>
              <dt>Distance</dt>
              <dd>8.4 km</dd>
            </div>
            <div>
              <dt>Elevation</dt>
              <dd>520 m</dd>
            </div>
            <div>
              <dt>Time</dt>
              <dd>3 h 10</dd>
            </div>
          </dl>
          <Elevation id={id} />
          <div className={f.actions}>
            <span className={f.start}>Start</span>
            <span className={f.saveWrap} data-r="btn">
              {live ? (
                <button type="button" className={f.save} data-on={saved || undefined} aria-pressed={saved} aria-label="Save Cascade Loop for offline use" onClick={onAction}>
                  <SaveLabel saved={saved} />
                </button>
              ) : (
                <span className={f.save} data-on={saved || undefined}>
                  <SaveLabel saved={saved} />
                </span>
              )}
            </span>
          </div>
        </div>
      </div>
      <div className={f.snack} data-on={saved || undefined} aria-hidden="true">
        <span>Map saved for offline use</span>
        <b>View</b>
      </div>
      <NavBar on="explore" />
    </div>
  );
}
function SaveLabel({ saved }: { saved: boolean }) {
  return (
    <>
      <i className={f.saveBar} aria-hidden="true" />
      <span className={f.saveText}>
        {saved ? (
          <>
            <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true">
              <path d="m3.5 8.5 3 3 6-7" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            Saved offline
          </>
        ) : (
          'Save offline'
        )}
      </span>
    </>
  );
}

/* ---------------------------------------------------------------- Detail and Saved: store screenshots */
export function FernwayDetail() {
  const id = useId().replace(/:/g, '');
  return (
    <div className={f.app}>
      <StatusBar />
      <div className={f.detailWrap}>
      <div className={f.detailHero}>
        <TrailMap id={id} saved />
        <span className={f.back} aria-hidden="true">
          ←
        </span>
      </div>
      <div className={f.body} data-detail="">
        <b className={f.detailTitle}>Cascade Loop</b>
        <small className={f.detailSub}>Mount Ash · Loop · Moderate</small>
        <div className={f.elevCard}>
          <span>
            <small>Elevation profile</small>
            <b>520 m gain</b>
          </span>
          <Elevation id={id} tall />
        </div>
        <ul className={f.highlights}>
          {['Waterfall at 3.1 km', 'Lookout over Ash Lake', 'Shaded forest descent'].map((h) => (
            <li key={h}>{h}</li>
          ))}
        </ul>
      </div>
      </div>
      <NavBar on="explore" />
    </div>
  );
}
export function FernwayOffline() {
  const id = useId().replace(/:/g, '');
  const maps = [
    ['Cascade Loop', '8.4 km · 42 MB', true],
    ['Ridge Lakes', '12.1 km · 58 MB', false],
    ['Old Mill Path', '5.0 km · 21 MB', false],
  ] as const;
  return (
    <div className={f.app}>
      <StatusBar />
      <div className={f.body}>
        <b className={f.screenTitle}>Saved maps</b>
        <small className={f.detailSub}>Ready without signal · 121 MB</small>
        <ul className={f.saved}>
          {maps.map(([n, m, first]) => (
            <li key={n} data-first={first || undefined}>
              <span className={f.savedThumb}>
                <TrailMap id={`${id}${n.length}`} saved />
              </span>
              <span>
                <b>{n}</b>
                <small>{m}</small>
              </span>
              <i aria-hidden="true">✓</i>
            </li>
          ))}
        </ul>
        <div className={f.tip}>
          <b>Works in airplane mode</b>
          <small>Your route, distance and position stay on the map.</small>
        </div>
      </div>
      <NavBar on="offline" />
    </div>
  );
}

export function Fernway({ screen = 'explore', saved, live, onAction }: { screen?: FernwayScreen; saved: boolean; live?: boolean; onAction?: () => void }) {
  if (screen === 'detail') return <FernwayDetail />;
  if (screen === 'offline') return <FernwayOffline />;
  return <FernwayExplore saved={saved} live={live} onAction={onAction} />;
}

/**
 * The Google Play feature graphic (natural 1024 × 500), composed from the app's own map and screen.
 * `step` 0–4 reveals the composition layer by layer: map world, route, phone, title, final grade.
 */
export function FernwayFeature({ step = 4 }: { step?: number }) {
  const id = useId().replace(/:/g, '');
  return (
    <div className={f.feature} data-step={step}>
      <div className={f.fWorld}>
        <TrailMap id={id} saved wide />
      </div>
      <div className={f.fGrade} />
      <div className={f.fPhone}>
        <div className={f.fPhoneScreen}>
          <FernwayExplore saved />
        </div>
      </div>
      <div className={f.fTitle}>
        <FernwayIcon size={78} />
        <span>
          <b>Fernway</b>
          <small>Trail maps that work offline</small>
        </span>
      </div>
    </div>
  );
}
