'use client';

/**
 * S04: Publish with Xroga. One editorial chapter (Direction B's head and full-width store navigation) around one
 * release theater (Direction A's working product, inspection and transformation).
 *
 * The theater is a scene state machine: idle → use → inspect → verified → extract → compose → package → ready.
 *  use       the product does its own thing: Arcset logs a set, Ridgeline jumps a gate, MerchantLens opens its panel;
 *  inspect   Xroga's reticle locks onto the control that was used (the cause);
 *  verified  it moves to what changed (the effect), scans it once and writes the evidence;
 *  extract   the reticle reframes the screen at the store's aspect ratio and that exact region is lifted out and
 *            carried into the listing (measured FLIP, Web Animations API; same component, same state, so the picture
 *            that leaves is the picture that lands);
 *  compose   the listing assembles around the arrived asset;  package  the release is prepared;
 *  ready     the owner's next step.
 * One clock (beats per destination in publish.ts) runs only while the theater is on screen. Choosing a store plays
 * that store's scene; the step map seeks; Replay plays again. Reduced motion and no script render the settled scene.
 * Everything is a product walkthrough: no store, account, payment or build is connected.
 */
import Link from 'next/link';
import { Fragment, useCallback, useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import { CROP, Listing, NATURAL, PANEL, PRODUCT_ICON, Product, Still, StoreMark } from './Pieces';
import { BEATS, CAPTURE_MS, COPY, DESTS, PHASES, RELEASE, SECOND_CAPTURE_DELAY, STEPS, STORY, isPhase, reached, stepIndex, type Dest, type Origin, type Phase } from './publish';
import s from './S04.module.css';

type Rect = { x: number; y: number; w: number; h: number };
type Geo = { cause: Rect | null; focus: Rect | null; leader: string | null };

/** the product parts Xroga looks at: the control used (cause) and what it changed (effect) */
const CAUSE: Record<Dest, string[]> = { ios: ['btn'], android: ['btn'], chrome: ['btn'] };
const EFFECT: Record<Dest, string[]> = { ios: ['ring', 'sets'], android: ['flight'], chrome: ['panel'] };
/** how large the working product may be drawn, per layout */
const MAX: Record<Dest, { k: number; h: number; hNarrow: number }> = {
  ios: { k: 1.12, h: 476, hNarrow: 400 },
  android: { k: 1.16, h: 284, hNarrow: 260 },
  chrome: { k: 1.06, h: 336, hNarrow: 300 },
};
const TAP_DELAY = 340; // the press lands, then the product responds

const STATUS: Record<Phase, (d: Dest) => string> = {
  idle: () => 'Ready to test',
  use: (d) => `Using ${STORY[d].product}`,
  inspect: (d) => `Testing “${STORY[d].action}”`,
  verified: (d) => STORY[d].evidence.title,
  extract: () => 'Capturing the tested screen',
  compose: (d) => `Composing the ${STORY[d].storeName} listing`,
  package: () => 'Preparing the release package',
  ready: () => 'Waiting for your review',
};

const union = (rs: Rect[]): Rect | null => {
  if (!rs.length) return null;
  const x0 = Math.min(...rs.map((r) => r.x));
  const y0 = Math.min(...rs.map((r) => r.y));
  const x1 = Math.max(...rs.map((r) => r.x + r.w));
  const y1 = Math.max(...rs.map((r) => r.y + r.h));
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
};

function tabKeys(ev: ReactKeyboardEvent<HTMLElement>, role: string) {
  const items = [...ev.currentTarget.querySelectorAll<HTMLElement>(`[role=${role}]`)];
  const i = items.indexOf(document.activeElement as HTMLElement);
  const next = { ArrowRight: i + 1, ArrowDown: i + 1, ArrowLeft: i - 1, ArrowUp: i - 1, Home: 0, End: items.length - 1 }[ev.key];
  if (i < 0 || next === undefined) return;
  ev.preventDefault();
  const el = items[(next + items.length) % items.length];
  el.focus();
  el.click();
}

export function S04Publish({ loggedIn = false }: { loggedIn?: boolean }) {
  // read after mount (the server cannot know it), so the first client render matches the server's HTML
  const [reduced, setReduced] = useState(false);
  const theater = useRef<HTMLDivElement>(null);
  const body = useRef<HTMLDivElement>(null);
  const sourceCol = useRef<HTMLDivElement>(null);
  const sourceBox = useRef<HTMLDivElement>(null);
  const evidenceRef = useRef<HTMLDivElement>(null);
  const outputCol = useRef<HTMLDivElement>(null);
  const flyerA = useRef<HTMLDivElement>(null);
  const flyerB = useRef<HTMLDivElement>(null);

  // Server render and reduced motion: the settled scene (tested, captured, listed, packaged, awaiting review).
  const [dest, setDest] = useState<Dest>('ios');
  const [origin, setOrigin] = useState<Origin>('existing');
  const [phase, setPhase] = useState<Phase>('ready');
  const [playing, setPlaying] = useState(false);
  const [tapped, setTapped] = useState(true);
  const [armed, setArmed] = useState(false);
  const [freezeAt, setFreezeAt] = useState<number | null>(null);
  const [k, setK] = useState(1);
  const [geo, setGeo] = useState<Geo>({ cause: null, focus: null, leader: null });
  const [tick, setTick] = useState(0);
  const destRef = useRef(dest);
  destRef.current = dest;
  const playingRef = useRef(playing);
  playingRef.current = playing;
  const armedRef = useRef(armed);
  armedRef.current = armed;

  // ------------------------------------------------------------------ the clock: one list of timers, pausable
  const timers = useRef<number[]>([]);
  const pos = useRef(0);
  const startedAt = useRef(0);
  const anims = useRef<Animation[]>([]);
  const visible = useRef(false);
  const clear = () => {
    timers.current.forEach((t) => window.clearTimeout(t));
    timers.current = [];
  };
  const schedule = useCallback((d: Dest) => {
    clear();
    startedAt.current = performance.now();
    const from = pos.current;
    const B = BEATS[d];
    const events: { at: number; run: () => void }[] = [
      ...PHASES.filter((p): p is Exclude<Phase, 'idle'> => p !== 'idle').map((p) => ({ at: B[p], run: () => setPhase(p) })),
      { at: B.use + TAP_DELAY, run: () => setTapped(true) },
      { at: B.end, run: () => setPlaying(false) },
    ];
    for (const e of events) if (e.at > from) timers.current.push(window.setTimeout(e.run, e.at - from));
  }, []);
  const play = useCallback(
    (d: Dest, from: Phase = 'idle') => {
      clear();
      anims.current.forEach((a) => a.cancel());
      setFreezeAt(null);
      pos.current = from === 'idle' ? 0 : BEATS[d][from as Exclude<Phase, 'idle'>];
      setPhase(from);
      setTapped(false);
      setArmed(false);
      setPlaying(true);
      if (visible.current) schedule(d);
    },
    [schedule],
  );
  const seek = useCallback((p: Phase) => {
    clear();
    anims.current.forEach((a) => a.cancel());
    setFreezeAt(null);
    setArmed(false);
    setPlaying(false);
    setPhase(p);
    setTapped(reached(p, 'use'));
  }, []);
  useEffect(() => () => clear(), []);

  // ------------------------------------------------------------------ first visit, review hook, visibility
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const on = () => {
      setReduced(mq.matches);
      if (mq.matches) seek('ready');
    };
    on();
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, [seek]);
  useEffect(() => {
    const reducedNow = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    // review hook: development and Vercel preview deployments only, never the production site
    const preview = process.env.NODE_ENV !== 'production' || (!!process.env.NEXT_PUBLIC_VERCEL_ENV && process.env.NEXT_PUBLIC_VERCEL_ENV !== 'production');
    if (preview) {
      const q = new URLSearchParams(window.location.search);
      const d = q.get('s04Dest');
      const dd: Dest = d === 'android' || d === 'chrome' ? d : 'ios';
      if (d) setDest(dd);
      const o = q.get('s04Origin');
      if (o === 'existing' || o === 'xroga') setOrigin(o);
      const ph = q.get('s04Phase');
      const at = q.get('s04At');
      if (at !== null) {
        // freeze the scene at a moment (ms), including a capture in flight
        const t = Number(at);
        const B = BEATS[dd];
        const p = [...PHASES].reverse().find((x) => x === 'idle' || t >= B[x as Exclude<Phase, 'idle'>]) ?? 'idle';
        setPhase(p);
        setTapped(t >= B.use + TAP_DELAY);
        setFreezeAt(t);
        return;
      }
      if (isPhase(ph)) {
        seek(ph);
        return;
      }
    }
    if (reducedNow) return;
    let seen = false;
    try {
      seen = sessionStorage.getItem('s04-scene-seen') === '1';
    } catch {}
    if (seen) return;
    setPhase('idle');
    setTapped(false);
    setArmed(true);
  }, [seek]);

  useEffect(() => {
    const el = theater.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([e]) => {
        visible.current = e.isIntersecting;
        if (e.isIntersecting) {
          if (armedRef.current) {
            try {
              sessionStorage.setItem('s04-scene-seen', '1');
            } catch {}
            play(destRef.current);
          } else if (playingRef.current && timers.current.length === 0) {
            schedule(destRef.current);
            anims.current.forEach((a) => a.playState === 'paused' && a.play());
          }
        } else if (playingRef.current) {
          pos.current += performance.now() - startedAt.current;
          clear();
          anims.current.forEach((a) => a.playState === 'running' && a.pause());
        }
      },
      { threshold: 0.35 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [play, schedule]);

  // ------------------------------------------------------------------ layout: product scale and measured geometry
  useLayoutEffect(() => {
    const col = sourceCol.current;
    const bd = body.current;
    if (!col || !bd) return;
    const fit = () => {
      const N = NATURAL[destRef.current];
      const M = MAX[destRef.current];
      const narrow = window.innerWidth < 760;
      const w = col.clientWidth;
      setK(Math.min(M.k, w / N.w, (narrow ? M.hNarrow : M.h) / N.h));
      setTick((t) => t + 1);
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(col);
    ro.observe(bd);
    return () => ro.disconnect();
  }, [dest]);

  useLayoutEffect(() => {
    const box = sourceBox.current;
    const bd = body.current;
    const ev = evidenceRef.current;
    if (!box || !bd) return;
    const b = box.getBoundingClientRect();
    const find = (keys: string[]) =>
      union(
        keys
          .map((key) => box.querySelector<HTMLElement>(`[data-live] [data-r="${key}"]`))
          .filter((el): el is HTMLElement => !!el)
          .map((el) => {
            const r = el.getBoundingClientRect();
            return { x: r.left - b.left, y: r.top - b.top, w: r.width, h: r.height };
          }),
      );
    const C = CROP[dest];
    const crop = { x: C.x * k, y: C.y * k, w: C.w * k, h: C.h * k };
    const cause = find(CAUSE[dest]);
    const effect = find(EFFECT[dest]);
    let focus: Rect | null = null;
    if (phase === 'use' || phase === 'inspect') focus = cause;
    else if (phase === 'verified') focus = effect;
    else if (reached(phase, 'extract')) focus = crop;
    // the leader: from the inspected region to the evidence card, in theater coordinates
    let leader: string | null = null;
    const anchor = phase === 'inspect' ? cause : effect;
    if (ev && anchor && reached(phase, 'inspect')) {
      const o = bd.getBoundingClientRect();
      const e = ev.getBoundingClientRect();
      const ax = b.left - o.left;
      const ay = b.top - o.top;
      const sideways = e.left >= b.right - 4; // the card sits beside the product (iPhone) or under it
      if (sideways) {
        const x0 = ax + anchor.x + anchor.w + 6;
        const y0 = ay + anchor.y + anchor.h / 2;
        const x1 = e.left - o.left - 2;
        const y1 = e.top - o.top + 26;
        const mx = x0 + Math.max(18, (x1 - x0) * 0.4);
        leader = `M${x0.toFixed(1)} ${y0.toFixed(1)} H${mx.toFixed(1)} L${(mx + Math.min(24, Math.abs(y1 - y0))).toFixed(1)} ${y1.toFixed(1)} H${x1.toFixed(1)}`;
      } else {
        const x0 = ax + anchor.x + anchor.w / 2;
        const y0 = ay + anchor.y + anchor.h + 6;
        const x1 = Math.min(Math.max(x0, e.left - o.left + 24), e.right - o.left - 24);
        const y1 = e.top - o.top - 2;
        leader = `M${x0.toFixed(1)} ${y0.toFixed(1)} V${((y0 + y1) / 2).toFixed(1)} H${x1.toFixed(1)} V${y1.toFixed(1)}`;
      }
    }
    setGeo({ cause: reached(phase, 'use') && phase !== 'use' ? cause : null, focus, leader });
  }, [phase, dest, k, tick, tapped]);

  // ------------------------------------------------------------------ the capture: tested region → store slot (FLIP)
  useLayoutEffect(() => {
    if (phase !== 'extract' || reduced || (!playing && freezeAt === null)) return;
    const bd = body.current;
    const box = sourceBox.current;
    const out = outputCol.current;
    if (!bd || !box || !out) return;
    const o = bd.getBoundingClientRect();
    const b = box.getBoundingClientRect();
    const fly = (f: HTMLDivElement | null, region: { x: number; y: number; w: number; h: number }, slotKey: string, delay: number) => {
      const slot = out.querySelector<HTMLElement>(`[data-slot="${slotKey}"]`);
      if (!f || !slot) return null;
      const t = slot.getBoundingClientRect();
      f.style.left = `${t.left - o.left}px`;
      f.style.top = `${t.top - o.top}px`;
      f.style.width = `${t.width}px`;
      f.style.height = `${t.height}px`;
      const sx = (region.w * k) / t.width;
      const dx = b.left + region.x * k - t.left;
      const dy = b.top + region.y * k - t.top;
      const lift = Math.min(60, 18 + Math.hypot(dx, dy) * 0.06);
      const P = 'perspective(1400px)';
      // transform only (compositor): the edge light and shadow are static on the layer, never repainted per frame
      return f.animate(
        [
          { offset: 0, transform: `${P} translate(${dx}px, ${dy}px) rotateY(0deg) scale(${sx})`, easing: 'cubic-bezier(0.3, 0, 0.2, 1)' },
          { offset: 0.16, transform: `${P} translate(${dx}px, ${dy - 8}px) rotateY(0deg) scale(${sx * 1.03})`, easing: 'cubic-bezier(0.45, 0, 0.25, 1)' },
          { offset: 0.58, transform: `${P} translate(${dx * 0.42}px, ${dy * 0.42 - lift}px) rotateY(-7deg) scale(${1 + (sx - 1) * 0.42})`, easing: 'cubic-bezier(0.2, 0.7, 0.15, 1)' },
          { offset: 1, transform: `${P} translate(0px, 0px) rotateY(0deg) scale(1)` },
        ],
        { duration: CAPTURE_MS, delay, fill: 'both' },
      );
    };
    const list: Animation[] = [];
    const a = fly(flyerA.current, CROP[dest], 'main', 0);
    if (a) list.push(a);
    if (dest === 'chrome') {
      const c = fly(flyerB.current, PANEL, 'tile', SECOND_CAPTURE_DELAY);
      if (c) list.push(c);
    }
    // the gameplay frame loses its HUD on the way: it becomes artwork, not a screen grab
    if (dest === 'android') {
      const hud = flyerA.current?.querySelector<HTMLElement>('[data-hud]');
      const anim = hud?.animate([{ opacity: 1 }, { opacity: 1, offset: 0.3 }, { opacity: 0, offset: 0.75 }, { opacity: 0 }], { duration: CAPTURE_MS, fill: 'both' });
      if (anim) list.push(anim);
    }
    if (freezeAt !== null) {
      const into = freezeAt - BEATS[dest].extract;
      list.forEach((an) => {
        an.pause();
        an.currentTime = Math.max(0, into);
      });
    } else if (!visible.current) list.forEach((an) => an.pause());
    anims.current = list;
    return () => list.forEach((an) => an.cancel());
  }, [phase, dest, playing, reduced, freezeAt, k]);

  // ------------------------------------------------------------------ inputs
  const chooseDest = (d: Dest) => {
    setDest(d);
    if (reduced) seek('ready');
    else play(d);
  };
  // using the product yourself plays the scene from your action
  const act = () => {
    if (reduced) {
      seek('ready');
      return;
    }
    if (playing && phase !== 'idle') return;
    play(dest, 'use');
  };

  const S = STORY[dest];
  const I = PRODUCT_ICON[dest];
  const N = NATURAL[dest];
  const acted = tapped && reached(phase, 'use');
  const capturing = phase === 'extract' && !reduced && (playing || freezeAt !== null);
  const filled = reached(phase, 'compose') || (phase === 'extract' && !capturing);
  const tileFilled = filled;
  const href = loggedIn ? '/dashboard/publish' : '/auth/signup';
  const at = stepIndex(phase);
  const ev = S.evidence;
  const evidence = (
    <div ref={evidenceRef} className={s.evidence} data-state={reached(phase, 'verified') ? 'done' : phase === 'inspect' ? 'testing' : 'wait'}>
      <span className={s.evKicker}>
        <i aria-hidden="true" />
        Xroga · {reached(phase, 'verified') ? 'Verified' : phase === 'inspect' ? 'Testing' : 'Will test'}
      </span>
      <b className={s.evTitle}>{reached(phase, 'verified') ? ev.title : `“${S.action}”`}</b>
      <span className={s.evLine}>{phase === 'idle' ? `Press “${S.action}” yourself, or watch Xroga do it.` : ev.line}</span>
      <code className={s.evMeta}>{ev.meta}</code>
      <span className={s.evBar} aria-hidden="true">
        <i key={`${dest}-${phase}`} />
      </span>
    </div>
  );

  return (
    <section id="s04" aria-labelledby="s04-title" className={s.section}>
      <div className={s.inner}>
        {/* ---------------------------------------------------------------- editorial introduction */}
        <header className={s.head}>
          <p className={s.eyebrow}>{COPY.eyebrow}</p>
          <h2 id="s04-title" className={s.title}>
            {COPY.title}
          </h2>
          <p className={s.lede}>{COPY.lede}</p>
        </header>

        {/* ---------------------------------------------------------------- the one store navigation */}
        <div className={s.nav} role="tablist" aria-label={COPY.navLabel} onKeyDown={(e) => tabKeys(e, 'tab')}>
          <span className={s.navLabel} aria-hidden="true">
            {COPY.navLabel}
          </span>
          {DESTS.map((d) => (
            <button
              key={d}
              id={`s04-tab-${d}`}
              type="button"
              role="tab"
              aria-selected={dest === d}
              aria-controls="s04-theater"
              tabIndex={dest === d ? 0 : -1}
              className={s.navItem}
              onClick={() => chooseDest(d)}
            >
              <span className={s.markBox}>
                <StoreMark id={STORY[d].store} size={22} />
              </span>
              <span className={s.navText}>
                <b>{STORY[d].storeName}</b>
                <small>
                  {STORY[d].purpose}
                  <span className={s.navProduct}> · {STORY[d].product}</span>
                </small>
              </span>
            </button>
          ))}
        </div>

        {/* ---------------------------------------------------------------- the release theater */}
        <div
          ref={theater}
          id="s04-theater"
          role="tabpanel"
          aria-labelledby={`s04-tab-${dest}`}
          className={s.theater}
          data-dest={dest}
          data-phase={phase}
          data-playing={playing || undefined}
          data-reduced={reduced || undefined}
        >
          <div className={s.bar}>
            <span className={s.ask}>
              <span className={s.askIcon}>
                <I size={26} />
              </span>
              “{S.ask}”
            </span>
            <div className={s.origin} role="radiogroup" aria-label="Where the project comes from" onKeyDown={(e) => tabKeys(e, 'radio')}>
              {(['existing', 'xroga'] as Origin[]).map((o) => (
                <button key={o} type="button" role="radio" aria-checked={origin === o} tabIndex={origin === o ? 0 : -1} onClick={() => setOrigin(o)} aria-label={COPY.origin[o]}>
                  <span className={s.long}>{COPY.origin[o]}</span>
                  <span className={s.short} aria-hidden="true">
                    {o === 'existing' ? 'Existing project' : 'Built with Xroga'}
                  </span>
                </button>
              ))}
            </div>
            <span className={s.sourceTag}>
              <em className={s.illus}>{RELEASE.illustrative}</em>
              <b>{origin === 'existing' ? 'Your project' : 'Built in Xroga'}</b>
              {origin === 'existing'
                ? ` · ${dest === 'ios' ? 'arcset-ios' : dest === 'android' ? 'ridgeline-android' : 'merchantlens-ext'} · imported`
                : ` · ${S.product} workspace · build ${dest === 'ios' ? '12' : dest === 'android' ? '7' : '1.0'}`}
            </span>
            <span className={s.status} aria-live="polite">
              <i aria-hidden="true" />
              {STATUS[phase](dest)}
            </span>
          </div>

          <div ref={body} className={s.body} data-dest={dest}>
            {/* the working product, exactly as the visitor can use it */}
            <div ref={sourceCol} className={s.sourceCol}>
              <div className={s.stand}>
                <div ref={sourceBox} className={s.sourceBox} data-dest={dest} style={{ width: N.w * k, height: N.h * k }}>
                  <div className={s.device} data-live="" style={{ width: N.w, height: N.h, transform: `scale(${k})` }}>
                    <Product dest={dest} live acted={acted} onAction={act} />
                  </div>
                  {/* Xroga's inspection layer: drawn on the product, anchored to measured elements */}
                  <div className={s.overlay} aria-hidden="true">
                    {phase === 'use' && <TapAt box={sourceBox} dest={dest} />}
                    {geo.cause && reached(phase, 'inspect') && !reached(phase, 'extract') && (
                      <span className={s.cause} style={{ left: geo.cause.x - 5, top: geo.cause.y - 5, width: geo.cause.w + 10, height: geo.cause.h + 10 }} data-dim={phase !== 'inspect' || undefined} />
                    )}
                    {geo.focus && (phase === 'inspect' || phase === 'verified' || phase === 'extract') && (
                      <span
                        className={s.reticle}
                        data-mode={phase}
                        style={{ left: geo.focus.x - 6, top: geo.focus.y - 6, width: geo.focus.w + 12, height: geo.focus.h + 12 }}
                      >
                        <i className={s.corners} />
                        {phase === 'verified' && <i key={`${dest}-scan`} className={s.scan} />}
                        {phase === 'extract' && <em className={s.cropLabel}>{S.capture.label}</em>}
                      </span>
                    )}
                    {reached(phase, 'compose') && (
                      <span className={s.captured} style={{ left: CROP[dest].x * k, top: CROP[dest].y * k, width: CROP[dest].w * k, height: CROP[dest].h * k }}>
                        <i className={s.corners} />
                      </span>
                    )}
                    {capturing && <span className={s.lifted} style={{ left: CROP[dest].x * k, top: CROP[dest].y * k, width: CROP[dest].w * k, height: CROP[dest].h * k }} />}
                  </div>
                </div>
              </div>
              {dest !== 'ios' && evidence}
            </div>

            {/* iPhone: the evidence sits in its own lane between the product and the store */}
            {dest === 'ios' && <div className={s.bridge}>{evidence}</div>}

            {/* the store output and the release */}
            <div ref={outputCol} className={s.outputCol}>
              <Listing dest={dest} filled={filled} composed={reached(phase, 'compose')} tileFilled={tileFilled} />
            </div>

            {/* the release: the package Xroga prepared, and the step that stays with the owner */}
            <div className={s.dock} data-on={reached(phase, 'package') || undefined}>
              <div className={s.pkg}>
                <span className={s.pkgIcon}>
                  <I size={34} />
                </span>
                <span className={s.pkgText}>
                  <b>{S.pkg.name}</b>
                  <small>
                    {S.pkg.type} · {S.pkg.state}
                  </small>
                  <span className={s.chips}>
                    <em data-k="ok">{RELEASE.evidenceChecked}</em>
                    <em data-k="ok">{RELEASE.prepared}</em>
                    <em data-k="owner">{S.owner.pending}</em>
                  </span>
                </span>
              </div>
              <div className={s.ownerRow} data-on={phase === 'ready' || undefined}>
                <span className={s.ownerText}>
                  <small>{RELEASE.owner}</small>
                  <b>{S.owner.title}</b>
                  <em>{S.owner.step}</em>
                </span>
                <span className={s.ownerCta}>
                  <Link href={href} className={s.apBtn} tabIndex={phase === 'ready' ? 0 : -1}>
                    {RELEASE.action}
                  </Link>
                  <small>{RELEASE.price}</small>
                </span>
              </div>
            </div>

            {/* the leader from what was inspected to what Xroga wrote about it */}
            {geo.leader && (
              <svg className={s.leader} aria-hidden="true" data-on={reached(phase, 'verified') || undefined}>
                <path key={`${dest}-${phase === 'inspect' ? 'i' : 'v'}`} d={geo.leader} pathLength={1} />
              </svg>
            )}

            {/* the captured regions in flight: exactly the pixels the slots then show */}
            {capturing && (
              <>
                <div ref={flyerA} className={s.flyer} data-dest={dest} aria-hidden="true">
                  <FlyerStill dest={dest} />
                </div>
                {dest === 'chrome' && (
                  <div ref={flyerB} className={s.flyer} aria-hidden="true">
                    <FlyerStill dest={dest} region={PANEL} />
                  </div>
                )}
              </>
            )}
          </div>

          {/* the process map: where the scene is, and a way to look at any step */}
          <div className={s.process}>
            <ol className={s.steps} aria-label="Release steps">
              {STEPS.map((st, i) => (
                <Fragment key={st.key}>
                  <li data-state={i < at ? 'done' : i === at ? 'now' : 'next'}>
                    <button type="button" onClick={() => seek(st.phase)} aria-current={i === at ? 'step' : undefined}>
                      <span className={s.stepNum}>{String(i + 1).padStart(2, '0')}</span>
                      {st.label}
                    </button>
                  </li>
                  {i < STEPS.length - 1 && <li className={s.stepRule} aria-hidden="true" data-on={i < at || undefined} />}
                </Fragment>
              ))}
            </ol>
            {!reduced && (
              <button type="button" className={s.replay} onClick={() => play(dest)} aria-label={`${COPY.replay} the ${STORY[dest].storeName} walkthrough`}>
                <svg viewBox="0 0 16 16" aria-hidden="true">
                  <path d="M3 8a5 5 0 1 0 1.6-3.7M3 2.6V5h2.4" />
                </svg>
                <span className={s.replayLabel}>{COPY.replay}</span>
              </button>
            )}
          </div>
        </div>

        {/* ---------------------------------------------------------------- call to action */}
        <footer className={s.foot}>
          <p className={s.note}>
            {COPY.note} {S.originNote[origin]} · {S.product} is an illustrative product.
          </p>
          <Link href={href} className={s.cta}>
            {COPY.cta}
            <span aria-hidden="true">→</span>
          </Link>
        </footer>
      </div>
    </section>
  );
}

/** the press: a single contact ring on the control, where the product is about to respond */
function TapAt({ box, dest }: { box: React.RefObject<HTMLDivElement | null>; dest: Dest }) {
  const [p, setP] = useState<{ x: number; y: number } | null>(null);
  useLayoutEffect(() => {
    const b = box.current;
    const el = b?.querySelector<HTMLElement>('[data-live] [data-r="btn"]');
    if (!b || !el) return;
    const r = el.getBoundingClientRect();
    const o = b.getBoundingClientRect();
    setP({ x: r.left - o.left + r.width / 2, y: r.top - o.top + r.height / 2 });
  }, [box, dest]);
  if (!p) return null;
  return <span className={s.tap} style={{ left: p.x, top: p.y }} />;
}

/** what flies: the cropped region, rendered at the slot's size (the slot then shows the same render) */
function FlyerStill({ dest, region = CROP[dest] }: { dest: Dest; region?: { x: number; y: number; w: number; h: number } }) {
  const ref = useRef<HTMLSpanElement>(null);
  const [w, setW] = useState(0);
  useLayoutEffect(() => {
    const f = ref.current?.parentElement;
    if (!f) return;
    // the parent is sized to its slot in the parent's own layout effect, which runs after this one
    const ro = new ResizeObserver(() => setW(f.offsetWidth));
    ro.observe(f);
    setW(f.offsetWidth);
    return () => ro.disconnect();
  }, []);
  const kk = w / region.w || 0.0001;
  return (
    <span ref={ref} className={s.flyerInner}>
      {dest === 'android' && region === CROP.android ? (
        <>
          <Still w={w} h={region.h * kk} k={kk} x={region.x} y={region.y}>
            <Product dest="android" art />
          </Still>
          <span className={s.hud} data-hud="">
            <Still w={w} h={region.h * kk} k={kk} x={region.x} y={region.y}>
              <Product dest="android" />
            </Still>
          </span>
        </>
      ) : (
        <Still w={w} h={region.h * kk} k={kk} x={region.x} y={region.y}>
          <Product dest={dest} />
        </Still>
      )}
    </span>
  );
}
