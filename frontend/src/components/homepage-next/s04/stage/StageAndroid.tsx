'use client';

/**
 * Google Play · Fernway (an Android trail-map app). The phone holds the left; the right evolves with the release:
 *  A (idle → inspect)   the destination first: the Google Play listing in outline, waiting to be filled;
 *  B (finding → produce) the release workbench: what Xroga prepares, and the feature graphic composed layer by layer
 *                         from the app's own map and Explore screen, then phone screenshots rendered from the app;
 *  C (compose → ready)   the Google Play listing preview built from those assets, and the release handoff.
 * The app's own action: Save offline downloads the trail map (progress, badge, snackbar).
 */
import { useRef } from 'react';
import { Fernway, FernwayFeature, FernwayIcon, type FernwayScreen } from '../apps/Fernway';
import { NATURAL, beatIndex, type Phase } from '../publish';
import { Device, Fill, Inspector, Render, clamp, useViewportHeight } from './kit';
import { Xcard } from './Xcard';
import s from './Stages.module.css';

const FEATURE = { x: 0, y: 0, w: 1024, h: 500 };
const SCREEN = { x: 0, y: 0, w: 300, h: 640 };
const SHOTS: { screen: FernwayScreen; caption: string }[] = [
  { screen: 'explore', caption: 'Find trails near you' },
  { screen: 'detail', caption: 'Know the climb before you go' },
  { screen: 'offline', caption: 'Maps that work offline' },
];

export function StageAndroid({ beat, phase, playing, acted, act, href }: { beat: string; phase: Phase; playing: boolean; acted: boolean; act: () => void; href: string }) {
  const box = useRef<HTMLDivElement>(null);
  const vh = useViewportHeight();
  const now = beatIndex('android', beat);
  const at = (id: string) => now >= beatIndex('android', id);
  const layout = at('listing') ? 'c' : at('finding') ? 'b' : 'a';
  const shots = !at('shots') ? 'empty' : beat === 'shots' && playing ? 'rendering' : 'done';
  return (
    <div className={s.android} data-layout={layout}>
      <div className={s.anPhone}>
        <span className={s.objLabel}>Your Android app · Fernway</span>
        <Device natural={NATURAL.android} maxH={clamp(340, vh - 420, 486)} kind="android" boxRef={box} overlay={<Inspector box={box} phase={phase} cause={['btn']} effect={['map']} tick={acted} round={20} />}>
          <Fernway saved={acted} live onAction={act} />
        </Device>
      </div>

      <div className={s.anRight}>
        <div className={s.anMain}>
          {/* A: the destination, in outline */}
          <div className={s.anPanel} data-on={layout === 'a' || undefined} aria-hidden={layout !== 'a' || undefined}>
            <span className={s.objLabel}>Google Play listing · prepared by Xroga</span>
            <PlayListing ghost />
          </div>

          {/* B: the release workbench */}
          <div className={s.anPanel} data-on={layout === 'b' || undefined} aria-hidden={layout !== 'b' || undefined}>
            <span className={s.objLabel}>Preparing your Google Play release</span>
            <div className={s.bench}>
              <div className={s.artboard}>
                <figure className={s.fg}>
                  <Fill region={FEATURE} guess={420}>
                    <FernwayFeature step={at('visuals') ? 4 : 0} />
                  </Fill>
                  <figcaption>
                    <b>Feature graphic</b> · 1024 × 500 · composed from your app’s map and Explore screen
                  </figcaption>
                </figure>
                <div className={s.fgShots}>
                  {SHOTS.map((x) => (
                    <span key={x.screen} className={s.fgShot}>
                      <Render state={shots}>
                        <Fill region={SCREEN} guess={60}>
                          <Fernway screen={x.screen} saved />
                        </Fill>
                      </Render>
                    </span>
                  ))}
                  <small>Phone screenshots from the tested app</small>
                </div>
              </div>
            </div>
          </div>

          {/* C: the Google Play listing preview */}
          <div className={s.anPanel} data-on={layout === 'c' || undefined} aria-hidden={layout !== 'c' || undefined}>
            <span className={s.objLabel}>Google Play listing · preview, not published</span>
            <PlayListing />
          </div>
        </div>
        <div className={s.anCard}>
          <Xcard dest="android" journey phase={phase} beat={beat} href={href} />
        </div>
      </div>
    </div>
  );
}

/** a Google Play listing as it would read, built from the prepared assets (or in outline before they exist) */
function PlayListing({ ghost = false }: { ghost?: boolean }) {
  return (
    <div className={s.play} data-ghost={ghost || undefined}>
      <div className={s.playLeft}>
        <span className={s.playHero}>
          {ghost ? (
            <em>Feature graphic</em>
          ) : (
            <Fill region={FEATURE} guess={360}>
              <FernwayFeature />
            </Fill>
          )}
        </span>
        <header className={s.playHead}>
          <FernwayIcon size={56} />
          <span>
            <b>Fernway</b>
            <small>Fernway Labs</small>
          </span>
          <em className={s.playInstall}>Not on Google Play yet</em>
        </header>
        <dl className={s.playMeta}>
          <div>
            <dt>New</dt>
            <dd>No reviews yet</dd>
          </div>
          <div>
            <dt>Everyone</dt>
            <dd>Content rating</dd>
          </div>
          <div>
            <dt>Free</dt>
            <dd>Maps & navigation</dd>
          </div>
        </dl>
      </div>
      <div className={s.playRight}>
        <div className={s.playShots}>
          {SHOTS.map((x) => (
            <span key={x.screen} className={s.playShot}>
              {ghost ? (
                <em />
              ) : (
                <>
                  <Fill region={SCREEN} guess={96}>
                    <Fernway screen={x.screen} saved />
                  </Fill>
                  <small>{x.caption}</small>
                </>
              )}
            </span>
          ))}
        </div>
        <div className={s.playAbout}>
          <b>About this app</b>
          <span>{ghost ? ' ' : 'Trail maps that work without signal. Save a route, see the climb and keep your place offline.'}</span>
        </div>
        <div className={s.playSafety}>
          <b>Data safety</b>
          <span>{ghost ? ' ' : 'Drafted from the app · you confirm in Play Console'}</span>
        </div>
      </div>
    </div>
  );
}
