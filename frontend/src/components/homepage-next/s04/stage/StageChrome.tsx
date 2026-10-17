'use client';

/**
 * Chrome Web Store · MerchantLens. The composition evolves with the release:
 *  A (idle → inspect)   the browser leads; beside it, the Chrome Web Store listing in outline (the destination first);
 *  B (finding → produce) a plain-language access check under the browser (technical detail on request), while the
 *                         store images render from the extension itself;
 *  C (compose → ready)   the browser steps back and the Chrome Web Store listing preview leads, with the handoff.
 * The extension's own action: the toolbar button docks its side panel, the page reflows and the panel fills.
 */
import { useRef } from 'react';
import { LensIcon, MerchantLens } from '../apps/MerchantLens';
import { NATURAL, beatIndex, type Phase } from '../publish';
import { Device, Fill, Inspector, Render, clamp, useViewportHeight } from './kit';
import { Xcard } from './Xcard';
import s from './Stages.module.css';

const SHOT = { x: 0, y: 0, w: 900, h: 552 };
const PANEL = { x: 600, y: 80, w: 300, h: 472 };

export function StageChrome({ beat, phase, playing, acted, act, href }: { beat: string; phase: Phase; playing: boolean; acted: boolean; act: () => void; href: string }) {
  const box = useRef<HTMLDivElement>(null);
  const vh = useViewportHeight();
  const now = beatIndex('chrome', beat);
  const at = (id: string) => now >= beatIndex('chrome', id);
  const asset = (id: string) => (!at(id) ? ('empty' as const) : beat === id && playing ? ('rendering' as const) : ('done' as const));
  const layout = at('compose') ? 'c' : at('finding') ? 'b' : 'a';
  const narrowed = at('narrow');
  return (
    <div className={s.chrome} data-layout={layout}>
      <div className={s.chLeft}>
        <span className={s.objLabel}>Your Chrome extension · MerchantLens</span>
        <Device natural={NATURAL.chrome} maxH={layout === 'c' ? clamp(240, vh - 570, 400) : layout === 'b' ? clamp(280, vh - 520, 480) : clamp(300, vh - 420, 480)} kind="browser" boxRef={box} overlay={<Inspector box={box} phase={phase} cause={['btn']} effect={['panel']} tick={acted} round={9} />}>
          <MerchantLens open={acted} live onAction={act} />
        </Device>

        {/* the access check, in plain language; the manifest lives behind "Technical detail" */}
        <div className={s.access} data-on={layout !== 'a' || undefined} data-narrowed={narrowed || undefined} aria-hidden={layout === 'a' || undefined}>
          <span className={s.accessHead}>
            <b>What MerchantLens can access</b>
            <em>{narrowed ? 'Narrowed' : 'Too broad'}</em>
          </span>
          <ul className={s.accessRows}>
            <li data-k="before">
              <i aria-hidden="true" />
              Read and change data on every website you visit
            </li>
            <li data-k="after">
              <i aria-hidden="true" />
              Only the tab you click it on, when you click
            </li>
          </ul>
          <details className={s.tech}>
            <summary>Technical detail</summary>
            <code>
              host_permissions: <s>&quot;&lt;all_urls&gt;&quot;</s> → permissions: &quot;activeTab&quot;
            </code>
            <small>Illustrative preview: shown as a recommendation. Nothing in your package changes without you.</small>
          </details>
        </div>
      </div>

      <div className={s.chRight}>
        <div className={s.chMain}>
          <div className={s.chPanel} data-on={layout === 'a' || undefined} aria-hidden={layout !== 'a' || undefined}>
            <span className={s.objLabel}>Chrome Web Store listing · prepared by Xroga</span>
            <CwsListing ghost />
          </div>
          <div className={s.chPanel} data-on={layout === 'b' || undefined} aria-hidden={layout !== 'b' || undefined}>
            <span className={s.objLabel}>Store images · from your extension</span>
            <div className={s.chAssets}>
              <figure className={s.chShot}>
                <span className={s.assetFrame} data-state={asset('screenshot')}>
                  <Render state={asset('screenshot')}>
                    <Fill region={SHOT} guess={360}>
                      <MerchantLens open />
                    </Fill>
                  </Render>
                </span>
                <figcaption>Screenshot · 1280 × 800</figcaption>
              </figure>
              <figure className={s.chTile}>
                <span className={s.assetFrame} data-state={asset('tile')}>
                  <Render state={asset('tile')}>
                    <PromoTile />
                  </Render>
                </span>
                <figcaption>Promo tile · 440 × 280</figcaption>
              </figure>
            </div>
          </div>
          <div className={s.chPanel} data-on={layout === 'c' || undefined} aria-hidden={layout !== 'c' || undefined}>
            <span className={s.objLabel}>Chrome Web Store listing · preview, not submitted</span>
            <CwsListing />
          </div>
        </div>
        {phase !== 'ready' && (
          <div className={s.chCard}>
            <Xcard dest="chrome" journey phase={phase} beat={beat} href={href} />
          </div>
        )}
      </div>
      {phase === 'ready' && (
        <div className={s.chHandoff}>
          <Xcard dest="chrome" phase={phase} beat={beat} href={href} />
        </div>
      )}
    </div>
  );
}

function PromoTile() {
  return (
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
  );
}

/** a Chrome Web Store listing as it would read (or in outline before its parts exist) */
function CwsListing({ ghost = false }: { ghost?: boolean }) {
  return (
    <div className={s.cws} data-ghost={ghost || undefined}>
      <div className={s.cwsBar} aria-hidden="true">
        <b>Chrome Web Store</b>
        <span>Search extensions</span>
      </div>
      <header className={s.cwsHead}>
        <LensIcon size={44} />
        <span className={s.cwsName}>
          <b>MerchantLens</b>
          <small>
            merchantlens.example · Shopping · <em>No ratings yet</em>
          </small>
        </span>
        <span className={s.cwsAdd}>Preview · not submitted</span>
      </header>
      <div className={s.cwsMedia}>
        <div className={s.cwsMain}>
          <span className={s.cwsShot}>
            {ghost ? (
              <em>Screenshot</em>
            ) : (
              <Fill region={SHOT} guess={300}>
                <MerchantLens open />
              </Fill>
            )}
          </span>
          <div className={s.cwsInfo}>
            <div>
              <b>Privacy</b>
              <span data-owner={!ghost || undefined}>{ghost ? ' ' : 'Practices drafted · you certify them'}</span>
            </div>
          </div>
        </div>
        <div className={s.cwsSide}>
          <span className={s.cwsTileWrap}>{ghost ? <em>Promo tile</em> : <PromoTile />}</span>
          <div className={s.cwsInfo}>
            <div>
              <b>Overview</b>
              <span>{ghost ? ' ' : 'See price history and nearby prices for the product you are looking at, in a side panel.'}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
