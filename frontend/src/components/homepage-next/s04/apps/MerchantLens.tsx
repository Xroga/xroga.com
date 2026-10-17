'use client';

/**
 * MerchantLens: a fictional Chrome extension, shown in a browser window at natural size 900 × 552.
 * The page is a believable outdoor store. Clicking the toolbar action docks MerchantLens as a Chrome side panel: the
 * page reflows, the fields it reads (title, price, store) are marked on the page, and the panel fills with the price
 * history, nearby prices and a tracking option. Everything is fictional and illustrative.
 */
import { useId } from 'react';
import m from './MerchantLens.module.css';

export function LensIcon({ size = 40 }: { size?: number }) {
  const id = useId().replace(/:/g, '');
  return (
    <svg className={m.icon} width={size} height={size} viewBox="0 0 64 64" aria-hidden="true">
      <defs>
        <linearGradient id={`ml${id}`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#1f4d8a" />
          <stop offset="1" stopColor="#12305c" />
        </linearGradient>
      </defs>
      <rect width="64" height="64" rx="14" fill={`url(#ml${id})`} />
      <circle cx="28" cy="28" r="13" fill="none" stroke="#f4b860" strokeWidth="5" />
      <path d="M38 38 48.5 48.5" stroke="#f4b860" strokeWidth="6" strokeLinecap="round" />
      <path d="M21 31.5 26 26.5l4 3 6.5-7" fill="none" stroke="#9fe2c2" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function Pack({ tone = 'moss' }: { tone?: 'moss' | 'slate' | 'clay' }) {
  const id = useId().replace(/:/g, '');
  const c = { moss: ['#7f9a6e', '#5a7350', '#3f5338'], slate: ['#7d8a99', '#5b6776', '#3f4956'], clay: ['#c48a68', '#9d6649', '#744631'] }[tone];
  return (
    <svg className={m.pack} viewBox="0 0 160 190" aria-hidden="true">
      <defs>
        <linearGradient id={`pb${id}`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor={c[0]} />
          <stop offset="1" stopColor={c[2]} />
        </linearGradient>
      </defs>
      <ellipse cx="80" cy="183" rx="54" ry="5" fill="#000" opacity="0.14" />
      <path d="M48 40c0-16 12-28 32-28s32 12 32 28" fill="none" stroke={c[2]} strokeWidth="6" strokeLinecap="round" />
      <rect x="30" y="34" width="100" height="144" rx="30" fill={`url(#pb${id})`} />
      <rect x="44" y="96" width="72" height="62" rx="18" fill={c[1]} />
      <path d="M50 108h60" stroke={c[2]} strokeWidth="3" strokeLinecap="round" />
      <rect x="74" y="102" width="12" height="5" rx="2.5" fill="#e8dcc6" />
      <path d="M44 60c12-6 60-6 72 0" fill="none" stroke={c[2]} strokeWidth="3" />
      <rect x="70" y="20" width="20" height="10" rx="5" fill="#2e3a2a" />
      <path d="M38 50v100" stroke="#fff" strokeOpacity="0.12" strokeWidth="6" strokeLinecap="round" />
    </svg>
  );
}

function Stars() {
  return (
    <span className={m.stars} aria-hidden="true">
      {[0, 1, 2, 3, 4].map((i) => (
        <svg key={i} width="12" height="12" viewBox="0 0 16 16">
          <path d="M8 1.6 10 5.8l4.5.6-3.3 3.1.8 4.5L8 11.8 4 14l.8-4.5L1.5 6.4 6 5.8z" fill={i < 4 ? '#e2a43a' : '#e8d9b8'} />
        </svg>
      ))}
    </span>
  );
}

const HISTORY = [139, 139, 134, 134, 129, 124, 119, 109, 114, 124, 129, 129, 132, 129];

export function MerchantLens({ open, live = false, onAction }: { open: boolean; live?: boolean; onAction?: () => void }) {
  const W = 236;
  const H = 64;
  const min = 100;
  const max = 145;
  const x = (i: number) => (i * W) / (HISTORY.length - 1);
  const y = (v: number) => H - ((v - min) / (max - min)) * H;
  const line = HISTORY.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join(' ');
  const lowI = HISTORY.indexOf(Math.min(...HISTORY));
  return (
    <div className={m.browser} data-open={open || undefined}>
      {/* tab strip */}
      <div className={m.tabs} aria-hidden="true">
        <span className={m.lights}>
          <i />
          <i />
          <i />
        </span>
        <span className={m.tab}>
          <i className={m.favicon}>N</i>
          Ridge 28L Daypack · Northfield
          <em>×</em>
        </span>
        <span className={m.newTab}>+</span>
      </div>
      {/* toolbar */}
      <div className={m.toolbar}>
        <span className={m.navBtns} aria-hidden="true">
          <svg width="16" height="16" viewBox="0 0 16 16">
            <path d="M10 3 5 8l5 5" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <svg width="16" height="16" viewBox="0 0 16 16">
            <path d="M6 3l5 5-5 5" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <svg width="16" height="16" viewBox="0 0 16 16">
            <path d="M13 8a5 5 0 1 1-1.5-3.6M13 2.5V5h-2.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>
        <span className={m.omni} aria-hidden="true">
          <svg width="12" height="12" viewBox="0 0 16 16">
            <rect x="3.5" y="7" width="9" height="7" rx="1.5" fill="currentColor" />
            <path d="M5.5 7V5a2.5 2.5 0 0 1 5 0v2" fill="none" stroke="currentColor" strokeWidth="1.6" />
          </svg>
          northfield.example<span>/packs/ridge-28l-daypack</span>
        </span>
        <span className={m.actions}>
          <span className={m.extWrap} data-r="btn">
            {live ? (
              <button type="button" className={m.ext} data-on={open || undefined} aria-pressed={open} aria-label="Open MerchantLens on this page" onClick={onAction}>
                <LensIcon size={18} />
              </button>
            ) : (
              <span className={m.ext} data-on={open || undefined}>
                <LensIcon size={18} />
              </span>
            )}
          </span>
          <span className={m.puzzle} aria-hidden="true">
            <svg width="16" height="16" viewBox="0 0 24 24">
              <path d="M9 3.5a2 2 0 0 1 4 0V5h4v4h1.5a2 2 0 0 1 0 4H17v6h-5.5v-1.5a2 2 0 0 0-4 0V19H3.5v-5H5a2 2 0 0 0 0-4H3.5V5H9z" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
            </svg>
          </span>
          <span className={m.avatar} aria-hidden="true">J</span>
        </span>
      </div>
      <div className={m.view}>
        {/* the store page */}
        <div className={m.page}>
          <header className={m.storeHead} aria-hidden="true">
            <b className={m.logo}>Northfield</b>
            <span className={m.navLinks}>
              <span>New</span>
              <span>Packs</span>
              <span>Apparel</span>
              <span>Camp</span>
            </span>
            <span className={m.bag}>
              <svg width="16" height="16" viewBox="0 0 24 24">
                <path d="M5 8h14l-1 12H6zM9 8V6a3 3 0 0 1 6 0v2" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
              </svg>
              <i>2</i>
            </span>
          </header>
          <div className={m.crumbs} aria-hidden="true">Packs / Daypacks / Ridge 28L</div>
          <div className={m.product}>
            <div className={m.gallery} aria-hidden="true">
              <span className={m.hero}>
                <Pack />
                <em className={m.badge}>Best seller</em>
              </span>
              <span className={m.thumbs}>
                {(['moss', 'slate', 'clay'] as const).map((t, i) => (
                  <i key={t} data-on={i === 0 || undefined}>
                    <Pack tone={t} />
                  </i>
                ))}
              </span>
            </div>
            <div className={m.info}>
              <small className={m.brand}>Fieldline</small>
              <b className={m.title} data-read={open || undefined} style={{ ['--i' as string]: 0 }}>
                Ridge 28L Daypack
              </b>
              <span className={m.rating}>
                <Stars />
                4.6 · 1,284 reviews
              </span>
              <span className={m.price} data-read={open || undefined} style={{ ['--i' as string]: 1 }}>
                $129.00
              </span>
              <span className={m.swatches} aria-hidden="true">
                <small>Color · Moss</small>
                <span>
                  <i data-c="moss" data-on="" />
                  <i data-c="slate" />
                  <i data-c="clay" />
                </span>
              </span>
              <span className={m.add} aria-hidden="true">
                Add to bag
              </span>
              <span className={m.ship} aria-hidden="true">
                Free delivery Thu, Oct 23 · 30-day returns
              </span>
            </div>
          </div>
        </div>
        {/* the Chrome side panel */}
        <aside className={m.panel} data-r="panel" aria-label="MerchantLens side panel" aria-hidden={!open || undefined}>
          <header className={m.panelHead}>
            <LensIcon size={18} />
            <b>MerchantLens</b>
            <span className={m.panelClose} aria-hidden="true">
              ×
            </span>
          </header>
          <div className={m.panelBody}>
            <ul className={m.reads} style={{ ['--i' as string]: 0 }}>
              <li style={{ ['--j' as string]: 0 }}>Product title</li>
              <li style={{ ['--j' as string]: 1 }}>Price</li>
              <li style={{ ['--j' as string]: 2 }}>Store</li>
            </ul>
            <div className={m.sum} style={{ ['--i' as string]: 1 }}>
              <b>Ridge 28L Daypack</b>
              <span>
                Northfield · <strong>$129.00</strong>
              </span>
            </div>
            <div className={m.hist} style={{ ['--i' as string]: 2 }}>
              <span className={m.histHead}>
                <small>90-day price</small>
                <em>Low $109 · Mar 2</em>
              </span>
              <svg className={m.spark} viewBox={`-4 -6 ${W + 8} ${H + 12}`} aria-hidden="true">
                <path d={`${line} L${W} ${H} L0 ${H} Z`} fill="#2f6fd6" opacity="0.1" />
                <path className={m.sparkLine} d={line} fill="none" stroke="#2f6fd6" strokeWidth="2" strokeLinejoin="round" pathLength={1} />
                <circle cx={x(lowI)} cy={y(HISTORY[lowI])} r="3.5" fill="#fff" stroke="#1f9d6b" strokeWidth="2" />
                <circle cx={x(HISTORY.length - 1)} cy={y(HISTORY[HISTORY.length - 1])} r="3.5" fill="#2f6fd6" />
              </svg>
            </div>
            <ul className={m.compare} style={{ ['--i' as string]: 3 }}>
              {[
                ['T', 'Trailhouse', '$124.00', '−$5', true],
                ['P', 'Packworks', '$119.00', '−$10', true],
                ['S', 'Summit Supply', '$132.00', '+$3', false],
              ].map(([l, n, p, dlt, lower]) => (
                <li key={n as string} data-low={n === 'Packworks' || undefined}>
                  <i>{l}</i>
                  <span>{n}</span>
                  <b>{p}</b>
                  <em data-lower={lower || undefined}>{dlt}</em>
                </li>
              ))}
            </ul>
            <div className={m.track} style={{ ['--i' as string]: 4 }}>
              <span>
                <b>Track price</b>
                <small>Alert below $115</small>
              </span>
              <i className={m.toggle} data-on={open || undefined} />
            </div>
          </div>
          <footer className={m.panelFoot}>
            <svg width="11" height="11" viewBox="0 0 16 16" aria-hidden="true">
              <rect x="3.5" y="7" width="9" height="7" rx="1.5" fill="currentColor" />
              <path d="M5.5 7V5a2.5 2.5 0 0 1 5 0v2" fill="none" stroke="currentColor" strokeWidth="1.6" />
            </svg>
            Reads this tab only when you click
          </footer>
        </aside>
      </div>
    </div>
  );
}
