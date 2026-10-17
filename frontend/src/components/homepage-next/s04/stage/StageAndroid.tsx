'use client';

/**
 * Google Play · Ridgeline. Two bands: gameplay becoming key art (top), and the listing taking shape (bottom).
 * - use: Lift; the glider climbs through the ring, the ring bursts, score, combo and altitude rise;
 * - inspect: Lift is bracketed, the glider's pass through the ring is inspected;
 * - finding: Google Play needs a 1024 × 500 feature graphic;
 * - produce: a crop frame chooses the composition on the game itself (crop), that region is scanned into the composer
 *   (render) and then art-directed: colour grade, vignette and the title lockup (grade);
 * - compose: the Google Play listing and the bundle; ready: the owner's steps.
 */
import { useRef } from 'react';
import { Ridgeline, RidgelineIcon, RidgelineKeyArt } from '../apps/Ridgeline';
import { NATURAL, beatIndex, phaseReached, type Phase } from '../publish';
import { Device, Fill, Inspector, Render } from './kit';
import { Xcard } from './Xcard';
import s from './Stages.module.css';

const ART = { x: 0, y: 0, w: 1024, h: 500 };
// the key-art crop, in the game's own pixels (the same view RidgelineKeyArt draws)
const CROP = { x: 140, y: 60, w: 600, h: 293 };

export function StageAndroid({ beat, phase, playing, acted, act, href }: { beat: string; phase: Phase; playing: boolean; acted: boolean; act: () => void; href: string }) {
  const box = useRef<HTMLDivElement>(null);
  const at = (id: string) => beatIndex('android', beat) >= beatIndex('android', id);
  const rendering = beat === 'render' && playing;
  const art = !at('render') ? 'empty' : rendering ? 'rendering' : 'done';
  const graded = at('grade');
  const composed = phaseReached(phase, 'compose');
  const cropping = phase === 'produce' && !composed;
  return (
    <div className={s.android}>
      <div className={s.anGame}>
        <span className={s.objLabel}>Your game · live preview</span>
        <Device
          natural={NATURAL.android}
          maxH={300}
          kind="landscape"
          boxRef={box}
          overlay={<Inspector box={box} phase={phase} cause={['btn']} effect={['flight']} tick={acted} round={44} />}
        >
          <Ridgeline lifted={acted} live onAction={act} />
          {cropping && (
            <span className={s.crop} data-moving={(beat === 'crop' && playing) || undefined} style={{ left: CROP.x, top: CROP.y, width: CROP.w, height: CROP.h }}>
              <i className={s.cropCorners} />
              <em>1024 × 500</em>
              {rendering && <i className={s.cropScan} />}
            </span>
          )}
        </Device>
      </div>

      <div className={s.anComposer}>
        <span className={s.objLabel}>Feature graphic · 1024 × 500</span>
        <figure className={s.feature} data-state={art} data-graded={graded || undefined}>
          <Render state={art}>
            <Fill region={ART} guess={520}>
              <RidgelineKeyArt graded={graded} />
            </Fill>
          </Render>
          {/* Google Play's guidance: keep key art and text clear of the edges */}
          <span className={s.safe} data-on={(phase === 'produce' || (phase === 'finding' && at('finding'))) || undefined} aria-hidden="true" />
          {art === 'empty' && (
            <span className={s.featureEmpty}>
              <b>Waiting for key art</b>
              <small>Composed from gameplay, not a screenshot</small>
            </span>
          )}
        </figure>
      </div>

      <div className={s.anCard}>
        <Xcard dest="android" phase={phase} href={href} progress={phase === 'produce' ? (beat === 'crop' ? 'Choosing the frame' : beat === 'render' ? 'Rendering from gameplay' : 'Colour grade and title') : undefined} />
      </div>

      <div className={s.anListing} data-composed={composed || undefined}>
        <span className={s.objLabel}>Google Play listing · draft</span>
        <div className={s.play}>
          <header className={s.playHead}>
            <RidgelineIcon size={52} />
            <span>
              <b>Ridgeline</b>
              <small>Ridgeline Studio</small>
              <span className={s.playTags}>
                <em>Arcade</em>
                <em>Offline</em>
                <em>No ads</em>
              </span>
            </span>
          </header>
          <dl className={s.playRows}>
            <div style={{ ['--i' as string]: 0 }}>
              <dt>App bundle</dt>
              <dd>ridgeline-1.0.7.aab · built on your Expo account</dd>
            </div>
            <div style={{ ['--i' as string]: 1 }} data-owner="">
              <dt>Data safety</dt>
              <dd>Drafted from the code · you answer the form</dd>
            </div>
          </dl>
        </div>
      </div>
    </div>
  );
}
