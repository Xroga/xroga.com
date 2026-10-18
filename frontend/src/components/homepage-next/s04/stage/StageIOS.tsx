'use client';

/**
 * App Store · Arcset. Three vertical objects read left to right: the live iPhone app, Xroga's screenshot studio, and the
 * App Store product page composing on a second iPhone.
 * - use: set 3 is logged in the app (the ring of progress advances, the rest timer starts, a new best appears);
 * - inspect: the check is bracketed, the set list and rest timer are inspected;
 * - finding: App Store screenshots for the 6.9″ display are required;
 * - produce: the live app navigates to Today, Progress and Plan in turn; each is scanned and rendered into an
 *   art-directed screenshot in the studio (the same pass, top to bottom);
 * - compose: the App Store page assembles with those screenshots; ready: the owner's steps.
 */
import { useRef } from 'react';
import { Arcset, ArcsetIcon, type ArcsetScreen } from '../apps/Arcset';
import { NATURAL, beatIndex, phaseReached, type Phase } from '../publish';
import { Device, Fill, Inspector, Render, Scanline, clamp, useViewportHeight } from './kit';
import { Xcard } from './Xcard';
import s from './Stages.module.css';

const SHOTS: { beat: string; screen: ArcsetScreen; caption: string; tone: string }[] = [
  { beat: 'shot1', screen: 'today', caption: 'Log every set in one tap', tone: 'teal' },
  { beat: 'shot2', screen: 'progress', caption: 'Watch your strength climb', tone: 'indigo' },
  { beat: 'shot3', screen: 'plan', caption: 'A plan that keeps you on track', tone: 'plum' },
];
const FULL = { x: 0, y: 0, w: 280, h: 600 };

export function StageIOS({ beat, phase, playing, acted, act, href }: { beat: string; phase: Phase; playing: boolean; acted: boolean; act: () => void; href: string }) {
  const box = useRef<HTMLDivElement>(null);
  const vh = useViewportHeight();
  const phoneH = clamp(330, vh - 440, 452);
  const at = (id: string) => beatIndex('ios', beat) >= beatIndex('ios', id);
  const now = beatIndex('ios', beat);
  // the live app visits each screen while it is captured, then returns to the workout
  const screen: ArcsetScreen = phase === 'produce' ? SHOTS.filter((x) => at(x.beat)).pop()!.screen : 'today';
  const shotState = (i: number) => {
    const b = beatIndex('ios', SHOTS[i].beat);
    if (now < b) return 'empty' as const;
    if (now === b && playing) return 'rendering' as const;
    return 'done' as const;
  };
  const composed = phaseReached(phase, 'compose');
  return (
    <div className={s.ios} data-ready={phase === 'ready' || undefined}>
      <div className={s.iosLive}>
        <span className={s.objLabel}>Your iPhone app · Arcset</span>
        <Device
          natural={NATURAL.ios}
          maxH={phoneH}
          kind="phone"
          boxRef={box}
          overlay={
            <>
              <Inspector box={box} phase={phase} cause={['btn']} effect={['sets', 'after']} tick={`${acted}-${screen}`} round={10} />
              <Scanline on={phase === 'produce' && playing} key={screen} />
            </>
          }
        >
          <Arcset screen={screen} logged={acted} live onAction={act} />
        </Device>
      </div>

      <div className={s.iosStudio}>
        <Xcard dest="ios" phase={phase} beat={beat} href={href} />
        <div className={s.shotHead}>
          <b>Screenshots</b>
          <span>6.9″ display · 1320 × 2868</span>
        </div>
        <div className={s.shots}>
          {SHOTS.map((x, i) => (
            <figure key={x.beat} className={s.shot} data-tone={x.tone} data-state={shotState(i)}>
              <figcaption>{x.caption}</figcaption>
              <span className={s.shotDevice}>
                <Render state={shotState(i)}>
                  <Fill region={FULL} guess={104}>
                    <Arcset screen={x.screen} logged />
                  </Fill>
                </Render>
              </span>
              <small className={s.shotSrc}>{i === 0 ? 'From the tested screen' : `From ${x.screen === 'progress' ? 'Progress' : 'Plan'}`}</small>
            </figure>
          ))}
        </div>
      </div>

      <div className={s.iosStore}>
        <span className={s.objLabel}>App Store page · preview</span>
        <Device natural={NATURAL.ios} maxH={phoneH - 14} kind="phone">
          <AppStorePage composed={composed} shots={SHOTS.map((_, i) => shotState(i) !== 'empty')} ready={phase === 'ready'} />
        </Device>
      </div>
    </div>
  );
}

/** the App Store product page as it will read on iPhone, assembled around the art-directed screenshots */
function AppStorePage({ composed, shots, ready }: { composed: boolean; shots: boolean[]; ready: boolean }) {
  return (
    <div className={s.asp} data-composed={composed || undefined}>
      <div className={s.aspStatus} aria-hidden="true">
        <span>9:41</span>
        <i />
      </div>
      <span className={s.aspBack} aria-hidden="true">
        ‹ Search
      </span>
      <header className={s.aspHead}>
        <span className={s.aspIcon}>
          <ArcsetIcon size={76} />
        </span>
        <span className={s.aspTitle}>
          <b>Arcset</b>
          <span className={s.aspSkel} data-on={composed || undefined}>
            <small>Strength training, set by set</small>
          </span>
          <em className={s.aspGet}>Preview</em>
        </span>
      </header>
      <dl className={s.aspFacts}>
        {[
          ['Age', '4+'],
          ['Category', 'Fitness'],
          ['Developer', 'Arcset'],
          ['Size', '38 MB'],
        ].map(([k, v], i) => (
          <div key={k} style={{ ['--i' as string]: i }}>
            <dt>{k}</dt>
            <dd>{v}</dd>
          </div>
        ))}
      </dl>
      <div className={s.aspShots}>
        {SHOTS.map((x, i) => (
          <span key={x.beat} className={s.aspShot} data-tone={x.tone} data-on={(composed && shots[i]) || undefined} style={{ ['--i' as string]: i }}>
            <b>{x.caption}</b>
            <span className={s.aspShotScreen}>
              <Fill region={FULL} guess={60}>
                <Arcset screen={x.screen} logged />
              </Fill>
            </span>
          </span>
        ))}
      </div>
      <div className={s.aspNew}>
        <b>What’s New</b>
        <em>Version 1.0</em>
        <span className={s.aspSkel} data-on={composed || undefined}>
          <small>A rest timer starts the moment you log a set.</small>
        </span>
      </div>
      <div className={s.aspPrivacy} data-ready={ready || undefined}>
        <b>App Privacy</b>
        <small>{ready ? 'Shown once you confirm it' : 'Not provided yet'}</small>
      </div>
    </div>
  );
}
