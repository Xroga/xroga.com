'use client';

/**
 * S04 — Publish with Xroga (V8 hybrid). One editorial publishing stage under one full-width store navigation:
 * the working product on the left, Xroga's inspection lens in a bounded centre corridor, and the store listing with
 * its release folio on the right. The walkthrough is one continuous job: the product is used → Xroga checks that exact
 * control → the tested screen is captured and travels into the listing's first screenshot slot → the listing is
 * assembled → a release is prepared → the owner is asked to review, with Xroga's service kept apart from the store
 * account they control.
 *
 * Motion: the App Store story plays once when S04 is first in view; choosing a store plays that store's shorter story.
 * Any other input settles the scene at once. Offscreen pauses. Reduced motion and no script render the settled scene.
 * The capture is real DOM measured at run time (FLIP): it starts on the device's own screen region and lands on the
 * listing slot, and it renders exactly the region that the slot then shows.
 * Everything is a product walkthrough: no store, account, payment or build is connected.
 */
import Link from 'next/link';
import { useReducedMotion } from 'motion/react';
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import { Artwork, CAPTURE, CaptureStill, LensView, NATURAL, Product, PRODUCT_ICON, StoreMark, TARGET } from './Pieces';
import { APPROVAL, BRANCH, CAPTURE_MS, COPY, DESTS, EVIDENCE, INTRO, STORY, isStep, reached, type Dest, type Origin, type Step } from './publish';
import s from './S04.module.css';

type Mode = 'idle' | 'armed' | 'playing';

function roving(ev: ReactKeyboardEvent<HTMLElement>) {
  const items = [...ev.currentTarget.querySelectorAll<HTMLElement>('[role=radio]')];
  const i = items.indexOf(document.activeElement as HTMLElement);
  const next = { ArrowRight: i + 1, ArrowDown: i + 1, ArrowLeft: i - 1, ArrowUp: i - 1, Home: 0, End: items.length - 1 }[ev.key];
  if (i < 0 || next === undefined) return;
  ev.preventDefault();
  const el = items[(next + items.length) % items.length];
  el.focus();
  el.click();
}

const LENS: Record<Dest, { w: number; h: number; k: number }> = {
  ios: { w: 180, h: 104, k: 0.9 },
  android: { w: 140, h: 140, k: 1.5 },
  chrome: { w: 168, h: 108, k: 1.7 },
};

export function S04Publish({ loggedIn = false }: { loggedIn?: boolean }) {
  const reduced = !!useReducedMotion();
  const root = useRef<HTMLElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const device = useRef<HTMLDivElement>(null);
  const slot = useRef<HTMLElement | null>(null);
  const flyer = useRef<HTMLDivElement>(null);

  // Without script (and under reduced motion) the settled scene renders: tested, captured, prepared, awaiting review.
  const [dest, setDest] = useState<Dest>('ios');
  const [origin, setOrigin] = useState<Origin>('existing');
  const [step, setStep] = useState<Step>('approval');
  const [mode, setMode] = useState<Mode>('idle');
  const [freeze, setFreeze] = useState<number | null>(null);
  const modeRef = useRef(mode);
  modeRef.current = mode;

  // ------------------------------------------------------------------ the clock: one list of timers, cancellable
  const timers = useRef<number[]>([]);
  const plan = useRef<{ step: Step; at: number }[]>(INTRO);
  const pos = useRef(0); // elapsed ms within the current plan
  const startedAt = useRef(0);
  const clear = () => {
    timers.current.forEach((t) => window.clearTimeout(t));
    timers.current = [];
  };
  const schedule = useCallback(() => {
    clear();
    startedAt.current = performance.now();
    const from = pos.current;
    for (const b of plan.current) {
      if (b.at <= from) continue;
      timers.current.push(window.setTimeout(() => setStep(b.step), b.at - from));
    }
    const last = plan.current[plan.current.length - 1].at;
    timers.current.push(window.setTimeout(() => setMode('idle'), last - from + 10));
  }, []);
  const pause = () => {
    if (modeRef.current !== 'playing') return;
    pos.current += performance.now() - startedAt.current;
    clear();
  };
  const play = useCallback(
    (list: { step: Step; at: number }[]) => {
      clear();
      plan.current = list;
      pos.current = 0;
      setStep('ready');
      setMode('playing');
      schedule();
    },
    [schedule],
  );
  const settle = useCallback(() => {
    clear();
    setMode('idle');
    setStep('approval');
  }, []);
  useEffect(() => () => clear(), []);

  // ------------------------------------------------------------------ setup
  useEffect(() => {
    // review hook: development and Vercel preview deployments only, never the production site
    const preview = process.env.NODE_ENV !== 'production' || (!!process.env.NEXT_PUBLIC_VERCEL_ENV && process.env.NEXT_PUBLIC_VERCEL_ENV !== 'production');
    if (preview) {
      const q = new URLSearchParams(window.location.search);
      const d = q.get('s04Dest');
      if (d === 'ios' || d === 'android' || d === 'chrome') setDest(d);
      const o = q.get('s04Origin');
      if (o === 'existing' || o === 'xroga') setOrigin(o);
      const st = q.get('s04Step');
      if (isStep(st)) {
        setStep(st);
        const f = q.get('s04Freeze');
        if (f) setFreeze(Number(f));
        return;
      }
    }
    if (reduced) return;
    let seen = false;
    try {
      seen = sessionStorage.getItem('s04-intro-seen') === '1';
    } catch {}
    if (seen) return;
    setStep('ready');
    setMode('armed');
  }, [reduced]);

  // the intro starts when the stage is 40% visible; offscreen pauses and resumes where it was
  useEffect(() => {
    const el = stage.current;
    if (!el || mode === 'idle') return;
    const io = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting) {
          if (modeRef.current === 'armed') {
            try {
              sessionStorage.setItem('s04-intro-seen', '1');
            } catch {}
            play(INTRO);
          } else if (modeRef.current === 'playing' && timers.current.length === 0) schedule();
        } else pause();
      },
      { threshold: 0.4 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [mode === 'idle', play, schedule]); // eslint-disable-line react-hooks/exhaustive-deps

  // ------------------------------------------------------------------ the capture: the tested screen flies into the listing
  useLayoutEffect(() => {
    const f = flyer.current;
    const st = stage.current;
    const dv = device.current;
    const sl = slot.current;
    if (step !== 'capture' || !f || !st || !dv || !sl || reduced) return;
    const C = CAPTURE[dest];
    const o = st.getBoundingClientRect();
    const d = dv.getBoundingClientRect();
    const z = d.width / NATURAL[dest].w; // the device may be zoomed on small screens
    const t = sl.getBoundingClientRect();
    // the flyer is laid out at the slot; it starts over the device's own screen region
    f.style.left = `${t.left - o.left}px`;
    f.style.top = `${t.top - o.top}px`;
    const sx = (C.w * z) / t.width;
    const dx = d.left + C.x * z - t.left;
    const dy = d.top + C.y * z - t.top;
    const anim = f.animate(
      [
        { transform: `translate(${dx}px, ${dy}px) scale(${sx})`, opacity: 1, boxShadow: '0 0 0 1.5px rgba(86,143,252,0.9)' },
        { transform: `translate(${dx * 0.4}px, ${dy * 0.4 - 18}px) scale(${1 + (sx - 1) * 0.4})`, opacity: 1, offset: 0.55, boxShadow: '0 30px 60px -20px rgba(0,0,0,0.9)' },
        { transform: 'none', opacity: 1, boxShadow: '0 0 0 2px rgba(86,143,252,0.9)' },
      ],
      { duration: CAPTURE_MS, easing: 'cubic-bezier(0.45, 0, 0.2, 1)', fill: 'both' },
    );
    if (freeze !== null) {
      anim.pause();
      anim.currentTime = CAPTURE_MS * freeze;
    }
    return () => anim.cancel();
  }, [step, dest, reduced, freeze]);

  // ------------------------------------------------------------------ inputs
  const chooseDest = (d: Dest) => {
    setDest(d);
    if (reduced) {
      settle();
      return;
    }
    play(BRANCH);
  };
  // using the product while it waits plays the rest of the story from that action
  const act = () => {
    if (step !== 'ready') return;
    plan.current = BRANCH;
    pos.current = BRANCH[1].at;
    setStep('action');
    setMode('playing');
    schedule();
  };
  // any input other than a store choice or the product's own control settles the walkthrough at once
  useEffect(() => {
    const el = stage.current;
    if (!el) return;
    const onDown = (e: Event) => {
      const t = e.target as HTMLElement;
      if (t.closest('[data-s04-keep]')) return;
      if (modeRef.current !== 'idle') settle();
    };
    el.addEventListener('pointerdown', onDown, true);
    return () => el.removeEventListener('pointerdown', onDown, true);
  }, [settle]);

  const S = STORY[dest];
  const I = PRODUCT_ICON[dest];
  const acted = reached(step, 'action');
  const inspected = reached(step, 'inspect');
  const filled = reached(step, 'listing');
  const href = loggedIn ? '/dashboard/publish' : '/auth/signup';
  const t = TARGET[dest];
  const L = LENS[dest];

  return (
    <section ref={root} id="s04" aria-labelledby="s04-title" className={s.section}>
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
        <div className={s.nav} role="radiogroup" aria-label={COPY.navLabel} onKeyDown={roving}>
          <span className={s.navLabel} aria-hidden="true">
            {COPY.navLabel}
          </span>
          {DESTS.map((d) => (
            <button key={d} type="button" role="radio" aria-checked={dest === d} tabIndex={dest === d ? 0 : -1} className={s.navItem} data-s04-keep="" onClick={() => chooseDest(d)}>
              <span className={s.markBox}>
                <StoreMark id={STORY[d].store} size={24} />
              </span>
              <span className={s.navText}>
                <b>{STORY[d].storeName}</b>
                <small>{STORY[d].purpose}</small>
              </span>
            </button>
          ))}
        </div>

        {/* ---------------------------------------------------------------- the publishing stage */}
        <div ref={stage} className={s.stage} data-dest={dest} data-step={step} data-mode={mode}>
          <div className={s.source}>
            <div className={s.request}>
              <span className={s.ask}>
                <I size={22} />“{S.ask}”
              </span>
              <div className={s.origin} role="radiogroup" aria-label="Where the project comes from" onKeyDown={roving}>
                {(['existing', 'xroga'] as Origin[]).map((o) => (
                  <button key={o} type="button" role="radio" aria-checked={origin === o} tabIndex={origin === o ? 0 : -1} onClick={() => setOrigin(o)}>
                    {COPY.origin[o]}
                  </button>
                ))}
              </div>
            </div>
            <div className={s.deviceWrap}>
              <div ref={device} className={s.device} data-dest={dest} data-captured={step === 'capture' || undefined} style={{ width: NATURAL[dest].w, height: NATURAL[dest].h }}>
                <span data-s04-keep="" className={s.live}>
                  <Product dest={dest} live acted={acted} onAction={act} />
                </span>
                <span
                  className={s.target}
                  data-on={(inspected && !filled) || step === 'inspect' || undefined}
                  style={{ left: t.x - 5, top: t.y - 5, width: t.w + 10, height: t.h + 10 }}
                  aria-hidden="true"
                />
                <span className={s.frame} aria-hidden="true" style={{ left: CAPTURE[dest].x, top: CAPTURE[dest].y, width: CAPTURE[dest].w, height: CAPTURE[dest].h }} />
              </div>
              {step === 'ready' && (
                <span className={s.hint} aria-hidden="true">
                  {dest === 'ios' ? 'Complete set' : dest === 'android' ? 'Jump' : 'Open MerchantLens'}
                </span>
              )}
            </div>
          </div>

          {/* the inspection corridor: Xroga's lens on the exact control it tested */}
          <div className={s.corridor} aria-live="polite">
            <div className={s.lens} data-on={inspected || undefined} data-dim={step === 'capture' || undefined}>
              {inspected ? (
                <LensView dest={dest} w={L.w} h={L.h} k={L.k} />
              ) : (
                <span className={s.lensEmpty} style={{ width: L.w, height: L.h }} aria-hidden="true" />
              )}
              <p className={s.lensLabel}>
                <b>{inspected ? S.check : 'Xroga checks the tested action'}</b>
                {inspected && <span>{S.checkDetail}</span>}
              </p>
            </div>
          </div>

          {/* the output: the store listing, then the release folio and the owner's review */}
          <div className={s.output}>
            <Artwork dest={dest} filled={filled} assets={reached(step, 'listing')} slotRef={(el) => (slot.current = el)} />
            <div className={s.folio} data-on={reached(step, 'package') || undefined}>
              <div className={s.folioHead}>
                <span className={s.folioIcon}>
                  <I size={26} />
                </span>
                <span className={s.folioText}>
                  <b>{S.pkg.name}</b>
                  <small>
                    {S.pkg.type} · {S.pkg.state}
                  </small>
                </span>
                <em className={s.illustrative}>{APPROVAL.illustrative}</em>
              </div>
              {step === 'approval' && (
                <div className={s.approve} role="group" aria-label={APPROVAL.title}>
                  <div className={s.apRow} data-k="xroga">
                    <span>
                      <small>Xroga</small>
                      <b>{S.approval.service}</b>
                      <em>{APPROVAL.price}</em>
                    </span>
                    <Link href={href} className={s.apBtn}>
                      {APPROVAL.action}
                    </Link>
                  </div>
                  <div className={s.apRow} data-k="owner">
                    <span>
                      <small>{STORY[dest].storeName} · owner step</small>
                      <b>{S.approval.account}</b>
                      <em>{S.approval.accountStep}</em>
                    </span>
                  </div>
                  <p className={s.apPending}>{S.approval.pending}</p>
                </div>
              )}
            </div>
          </div>

          {/* the capture in flight: exactly the region the slot will show */}
          {step === 'capture' && !reduced && (
            <div ref={flyer} className={s.flyer} aria-hidden="true">
              <CaptureStill dest={dest} />
            </div>
          )}
        </div>

        {/* ---------------------------------------------------------------- evidence and call to action */}
        <footer className={s.foot}>
          <ol className={s.evidence} aria-label="What Xroga has done">
            <li className={s.xmark}>Xroga</li>
            {EVIDENCE.map((e) => (
              <li key={e.label} data-on={reached(step, e.step) || undefined} data-owner={e.owner || undefined}>
                {e.label}
              </li>
            ))}
          </ol>
          <Link href={href} className={s.cta}>
            {COPY.cta}
            <span aria-hidden="true">→</span>
          </Link>
        </footer>
        <p className={s.note}>
          {COPY.note} {S.originNote[origin]} · {S.product} is an illustrative product.
        </p>
      </div>
    </section>
  );
}
