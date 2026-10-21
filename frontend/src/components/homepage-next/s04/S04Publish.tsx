'use client';

/**
 * S04 · Publish & distribute (V10, Release Studio).
 * An editorial head (eyebrow, a one-line headline, a short outcome line; no section action: each store's handoff carries
 * its own review action), then one Release Studio:
 * a window whose title bar holds the three destinations, a stage composed for the selected store, and a readiness rail
 * that names what that store's release needs and who owns each part.
 * Stages: App Store (three vertical objects), Google Play (gameplay → key art, then the listing), Chrome Web Store
 * (the browser dominant, the submission package beside it). The scene clock lives in useScene.
 * A header shield (the same device S03 uses) keeps content from showing under the fixed site header.
 */
import Image from 'next/image';
import { useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import { COPY, DESTS, READINESS, STORY, itemState } from './publish';
import { StoreMark } from './StoreMark';
import { useScene } from './useScene';
import { StageIOS } from './stage/StageIOS';
import { StageAndroid } from './stage/StageAndroid';
import { StageChrome } from './stage/StageChrome';
import s from './S04.module.css';

function tabKeys(ev: ReactKeyboardEvent<HTMLElement>) {
  const items = [...ev.currentTarget.querySelectorAll<HTMLElement>('[role=tab]')];
  const i = items.indexOf(document.activeElement as HTMLElement);
  const next = { ArrowRight: i + 1, ArrowLeft: i - 1, Home: 0, End: items.length - 1 }[ev.key];
  if (i < 0 || next === undefined) return;
  ev.preventDefault();
  const el = items[(next + items.length) % items.length];
  el.focus();
  el.click();
}

export function S04Publish({ loggedIn = false }: { loggedIn?: boolean }) {
  const root = useRef<HTMLElement>(null);
  const theater = useRef<HTMLDivElement>(null);
  const sc = useScene(theater);
  const { dest, beat, phase, playing, acted, hold, reduced } = sc;
  const S = STORY[dest];
  const href = loggedIn ? '/dashboard/publish' : '/auth/signup';

  // the header shield: shown only while S04 is scrolling under the fixed site header
  const [under, setUnder] = useState(false);
  useEffect(() => {
    const el = root.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => setUnder(e.isIntersecting && e.boundingClientRect.top < 0), { rootMargin: '0px 0px -100% 0px', threshold: 0 });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  // the head's entrance, once: armed only when the section is still below the fold at load (so nothing visible ever
  // disappears), played when it arrives. Without script, under reduced motion, or arriving mid-page: the finished head.
  const [intro, setIntro] = useState<'armed' | 'play' | undefined>();
  useEffect(() => {
    const el = root.current;
    if (!el || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    if (el.getBoundingClientRect().top < window.innerHeight * 0.85) return;
    setIntro('armed');
    const io = new IntersectionObserver(
      ([e]) => {
        if (!e.isIntersecting) return;
        setIntro('play');
        io.disconnect();
      },
      { rootMargin: '0px 0px -15% 0px' },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  const stage = { beat, phase, playing, acted, act: sc.act, href };
  return (
    <section ref={root} id="s04" aria-labelledby="s04-title" className={s.section} data-under={under || undefined} data-intro={intro}>
      <div className={s.shield} aria-hidden="true" />
      <div className={s.inner}>
        {/* ---------------------------------------------------------------- the editorial head */}
        <header className={s.head}>
          <p className={s.eyebrow}>{COPY.eyebrow}</p>
          <h2 id="s04-title" className={s.title}>
            <span className={s.titleA}>{COPY.titleA}</span> <span className={s.titleB}>{COPY.titleB}</span>
          </h2>
          <p className={s.lede}>
            {COPY.lede} <span className={s.ledeNote}>{COPY.ledeNote}</span>
          </p>
        </header>

        {/* ---------------------------------------------------------------- the Release Studio */}
        <div
          ref={theater}
          className={s.studio}
          data-dest={dest}
          data-phase={phase}
          data-beat={beat}
          data-playing={playing || undefined}
          data-hold={hold || undefined}
          data-reduced={reduced || undefined}
          data-scene={playing ? 'play' : 'rest'}
        >
          <div className={s.titlebar}>
            <span className={s.app}>
              <Image className={s.orb} src="/brand/xroga-orb-mark-v2.png" alt="" width={26} height={26} unoptimized />
              <span>
                <b>{COPY.studio}</b>
                <small>{COPY.preview}</small>
              </span>
            </span>
            <div className={s.tabs} role="tablist" aria-label="Publishing destination" onKeyDown={tabKeys}>
              {DESTS.map((d) => (
                <button
                  key={d}
                  id={`s04-tab-${d}`}
                  type="button"
                  role="tab"
                  aria-selected={dest === d}
                  aria-controls="s04-stage"
                  tabIndex={dest === d ? 0 : -1}
                  className={s.tab}
                  onClick={() => sc.choose(d)}
                >
                  <StoreMark id={STORY[d].store} />
                  <span className={s.tabText}>
                    <b>{STORY[d].storeName}</b>
                    <small>{STORY[d].kind}</small>
                  </span>
                </button>
              ))}
            </div>
            <span className={s.state}>
              <i aria-hidden="true" />
              <span className={s.say}>{S.say[phase]}</span>
            </span>
          </div>

          <div id="s04-stage" role="tabpanel" aria-labelledby={`s04-tab-${dest}`} className={s.stage}>
            {/* the outcome first: what this destination is for, in plain language */}
            <div className={s.intro} key={`intro-${dest}`}>
              <p>
                <b>{S.intro.title}</b> {S.intro.line}
              </p>
            </div>
            {dest === 'ios' && <StageIOS key="ios" {...stage} />}
            {dest === 'android' && <StageAndroid key="android" {...stage} />}
            {dest === 'chrome' && <StageChrome key="chrome" {...stage} />}
          </div>

          {/* ---------------------------------------------------------------- readiness: what this release needs */}
          <div className={s.rail} data-controls={!reduced && sc.playing ? 2 : 1}>
            <ol className={s.items} aria-label={`What a ${S.storeName} release needs`}>
              {READINESS[dest].map((it) => {
                const st = itemState(dest, it, beat);
                return (
                  <li key={it.key} data-state={st}>
                    <button type="button" onClick={() => sc.seek(it.settles)} aria-label={`${it.label}: ${st === 'done' ? it.doneNote : st === 'owner' ? `your decision, ${it.doneNote}` : st}`}>
                      <i aria-hidden="true" />
                      <span>
                        <b>{it.label}</b>
                        <small>{st === 'done' || st === 'owner' ? it.doneNote : st === 'working' ? 'Preparing' : it.owner ? 'Owner step' : 'Not started'}</small>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ol>
            {!reduced && sc.playing && (
              <button type="button" className={s.replay} onClick={sc.togglePause} aria-pressed={sc.paused} aria-label={sc.paused ? 'Play the walkthrough' : 'Pause the walkthrough'}>
                <svg viewBox="0 0 16 16" aria-hidden="true">
                  {sc.paused ? <path d="M5 3.5v9l7-4.5z" /> : <path d="M5.5 3.5v9M10.5 3.5v9" />}
                </svg>
                <span>{sc.paused ? 'Play' : 'Pause'}</span>
              </button>
            )}
            {!reduced && (
              <button type="button" className={s.replay} onClick={sc.replay} aria-label={`${COPY.replay} the ${S.storeName} walkthrough`}>
                <svg viewBox="0 0 16 16" aria-hidden="true">
                  <path d="M3 8a5 5 0 1 0 1.6-3.7M3 2.6V5h2.4" />
                </svg>
                <span>{COPY.replay}</span>
              </button>
            )}
          </div>
        </div>

        <p className={s.note}>{COPY.note}</p>
      </div>
    </section>
  );
}
