'use client';

/**
 * Chrome Web Store · MerchantLens. The browser is the dominant surface; beside it, Xroga's submission package.
 * - use: the toolbar action docks MerchantLens as a side panel; the page reflows; the fields it reads are marked;
 * - inspect: the action is bracketed, the panel is inspected;
 * - finding: host access to <all_urls> is broader than the extension needs (it reads only the open tab after a click);
 *   narrow: the manifest diff replaces it with activeTab;
 * - produce: the browser view renders into the 1280 × 800 screenshot, then the panel itself into the 440 × 280 tile;
 * - compose: the package (.zip, Manifest V3) and listing are assembled; ready: the owner certifies and approves.
 */
import { useRef } from 'react';
import { LensIcon, MerchantLens } from '../apps/MerchantLens';
import { NATURAL, beatIndex, phaseReached, type Phase } from '../publish';
import { Device, Fill, Inspector, Render } from './kit';
import { Xcard } from './Xcard';
import s from './Stages.module.css';

const SHOT = { x: 0, y: 0, w: 880, h: 550 };
const PANEL = { x: 600, y: 80, w: 300, h: 472 };

export function StageChrome({ beat, phase, playing, acted, act, href }: { beat: string; phase: Phase; playing: boolean; acted: boolean; act: () => void; href: string }) {
  const box = useRef<HTMLDivElement>(null);
  const now = beatIndex('chrome', beat);
  const at = (id: string) => now >= beatIndex('chrome', id);
  const asset = (id: string) => (!at(id) ? ('empty' as const) : beat === id && playing ? ('rendering' as const) : ('done' as const));
  const shot = asset('screenshot');
  const tile = asset('tile');
  const flagged = at('finding');
  const narrowed = at('narrow');
  const composed = phaseReached(phase, 'compose');
  return (
    <div className={s.chrome}>
      <div className={s.chBrowser}>
        <span className={s.objLabel}>Your extension · running on a product page</span>
        <Device
          natural={NATURAL.chrome}
          maxH={372}
          kind="browser"
          boxRef={box}
          overlay={<Inspector box={box} phase={phase} cause={['btn']} effect={['panel']} tick={acted} round={9} />}
        >
          <MerchantLens open={acted} live onAction={act} />
          {shot === 'rendering' && <span className={s.passNat} style={{ left: SHOT.x, top: SHOT.y, width: SHOT.w, height: SHOT.h }} />}
          {tile === 'rendering' && <span className={s.passNat} style={{ left: PANEL.x, top: PANEL.y, width: PANEL.w, height: PANEL.h }} />}
        </Device>
        <div className={s.assets}>
          <span className={s.assetsHead}>Store images</span>
          <figure className={s.cwsShot}>
            <span className={s.assetFrame} data-state={shot}>
              <Render state={shot}>
                <Fill region={SHOT} guess={190}>
                  <MerchantLens open />
                </Fill>
              </Render>
            </span>
            <figcaption>Screenshot · 1280 × 800</figcaption>
          </figure>
          <figure className={s.cwsTile}>
            <span className={s.assetFrame} data-state={tile}>
              <Render state={tile}>
                <span className={s.tileArt}>
                  <span className={s.tileText}>
                    <LensIcon size={22} />
                    <b>MerchantLens</b>
                    <small>Know the price before you buy</small>
                  </span>
                  <span className={s.tilePanel}>
                    <Fill region={PANEL} guess={56}>
                      <MerchantLens open />
                    </Fill>
                  </span>
                </span>
              </Render>
            </span>
            <figcaption>Promo tile · 440 × 280</figcaption>
          </figure>
        </div>

      </div>

      <div className={s.chPackage}>
        <Xcard dest="chrome" phase={phase} href={href} progress={phase === 'produce' ? (beat === 'screenshot' ? 'Screenshot · 1280 × 800' : 'Promo tile · 440 × 280') : undefined} />

        <div className={s.manifest} data-flagged={flagged || undefined} data-narrowed={narrowed || undefined}>
          <span className={s.fileHead}>
            <b>manifest.json</b>
            <em>{narrowed ? 'Narrowed' : flagged ? 'Review risk' : 'Manifest V3'}</em>
          </span>
          <pre className={s.code}>
            <span>
              <i>3</i>&quot;manifest_version&quot;: 3,
            </span>
            <span data-k="perm">
              <i>4</i>&quot;permissions&quot;: [&quot;sidePanel&quot;, &quot;storage&quot;
              {narrowed && <span className={s.added}>, &quot;activeTab&quot;</span>}],
            </span>
            <span data-k="host">
              <i>5</i>&quot;host_permissions&quot;: [&quot;&lt;all_urls&gt;&quot;]
            </span>
          </pre>
        </div>

        <ul className={s.pkg} data-composed={composed || undefined}>
          <li data-state={composed ? 'done' : 'pending'}>
            <b>merchantlens-1.0.0.zip</b>
            <span>{composed ? '212 KB · Manifest V3 checked' : 'Waiting for assets'}</span>
          </li>
          <li data-state={composed ? 'done' : 'pending'}>
            <b>Store listing</b>
            <span>{composed ? 'Summary, description and category drafted' : 'Not started'}</span>
          </li>
          <li data-state={phase === 'ready' ? 'owner' : 'pending'}>
            <b>Privacy practices</b>
            <span>{phase === 'ready' ? 'Drafted · you certify' : 'Not started'}</span>
          </li>
        </ul>
      </div>
    </div>
  );
}
