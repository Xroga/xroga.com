'use client';

/**
 * Navigation V2: the contextual previews inside the mega menus. Real HTML (crisp at any zoom) styled by xroga-nav.css.
 * Each takes the preview key of the link the visitor is pointing at or focused on, so the art answers the menu.
 * Everything here is illustrative: no customer work, no metrics, no claims of a finished release.
 */
import Link from 'next/link';
import { useState } from 'react';
import { ArrowUpRight } from 'lucide-react';
import { CONNECT_GROUPS, CONNECT_MORE, type ConnectBrand } from './navData';

export function BrandMark({ brand, size = 22 }: { brand: ConnectBrand; size?: number }) {
  const [stage, setStage] = useState(brand.favicon && brand.domain ? 1 : 0);
  const fallback = brand.domain ? `https://www.google.com/s2/favicons?domain=${brand.domain}&sz=128` : null;
  if (stage > 1 || (stage === 1 && !fallback)) return <span className="xn-brand-fallback" aria-hidden="true">{brand.name.slice(0, 1)}</span>;
  return (
    // provider marks are small external SVGs with a fallback chain; next/image would proxy them for no gain
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={stage === 0 ? `https://cdn.simpleicons.org/${brand.slug}/${brand.color}` : fallback!}
      alt=""
      width={size}
      height={size}
      loading="lazy"
      decoding="async"
      referrerPolicy="no-referrer"
      onError={() => setStage((s) => s + 1)}
    />
  );
}

/* ---------------------------------------------------------------- Product: request → coordinated work → result */
export function ProductPreview({ active }: { active: string }) {
  const stage = active === 'plan' ? 1 : active === 'verify' ? 2 : 0;
  return (
    <div className="xn-pv xn-pv--product" data-stage={stage} aria-hidden="true">
      <div className="xn-pv-label">How Xroga works</div>
      <div className="xn-flow">
        <div className="xn-flow-step" data-i="0">
          <span className="xn-flow-k">Request</span>
          <p className="xn-bubble">Add Stripe checkout to my store and test the payment flow.</p>
        </div>
        <div className="xn-flow-step" data-i="1">
          <span className="xn-flow-k">Xroga coordinates</span>
          <div className="xn-chips">
            <span><i className="xn-dot is-blue" />Plan</span>
            <span><i className="xn-dot is-violet" />Code</span>
            <span><i className="xn-dot is-ice" />Stripe</span>
            <span><i className="xn-dot is-blue" />Tests</span>
          </div>
        </div>
        <div className="xn-flow-step" data-i="2">
          <span className="xn-flow-k">Result</span>
          <div className="xn-result">
            <span className="xn-check" />
            <span>
              <b>Checkout ready for your review</b>
              <small>Preview link · test evidence · open questions</small>
            </span>
          </div>
        </div>
        <span className="xn-flow-rail" />
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- Build: one device, six kinds of product */
const BUILD_KINDS = ['webapp', 'website', 'saas', 'extension', 'game', 'web3'] as const;
const BUILD_LABEL: Record<(typeof BUILD_KINDS)[number], string> = {
  webapp: 'Web app',
  website: 'Website',
  saas: 'SaaS',
  extension: 'Extension',
  game: 'Game',
  web3: 'Web3',
};
export function BuildPreview({ active }: { active: string }) {
  const kind = (BUILD_KINDS as readonly string[]).includes(active) ? active : 'webapp';
  return (
    <div className="xn-pv xn-pv--build" aria-hidden="true">
      <div className="xn-pv-label">
        Illustrative · <b>{BUILD_LABEL[kind as keyof typeof BUILD_LABEL]}</b>
      </div>
      <div className="xn-device">
        <div className="xn-device-bar">
          <i />
          <i />
          <i />
          <span className="xn-url">{kind === 'extension' ? 'chrome://extensions' : kind === 'web3' ? 'app.vaultline.xyz' : 'your-product.app'}</span>
        </div>
        <div className="xn-device-body">
          <div className="xn-v" data-k="webapp" data-on={kind === 'webapp' || undefined}>
            <div className="xn-side"><i /><i /><i /><i /></div>
            <div className="xn-main">
              <div className="xn-kpis"><span /><span /><span /></div>
              <svg className="xn-chart" viewBox="0 0 200 60" preserveAspectRatio="none"><path d="M0 50 C30 44 40 30 70 32 S110 18 140 22 S180 8 200 10" /></svg>
              <div className="xn-rows"><i /><i /><i /></div>
            </div>
          </div>
          <div className="xn-v" data-k="website" data-on={kind === 'website' || undefined}>
            <div className="xn-hero"><b /><i /><i /><span /></div>
            <div className="xn-tiles"><i /><i /><i /></div>
          </div>
          <div className="xn-v" data-k="saas" data-on={kind === 'saas' || undefined}>
            <div className="xn-plans"><i /><i className="is-pick" /><i /></div>
            <div className="xn-rows"><i /><i /></div>
          </div>
          <div className="xn-v" data-k="extension" data-on={kind === 'extension' || undefined}>
            <div className="xn-page"><i /><i /><i /><i /></div>
            <div className="xn-popup"><b /><i /><i /><span /></div>
          </div>
          <div className="xn-v" data-k="game" data-on={kind === 'game' || undefined}>
            <div className="xn-game">
              <span className="xn-ship" />
              <i style={{ left: '22%', top: '24%' }} />
              <i style={{ left: '58%', top: '18%' }} />
              <i style={{ left: '76%', top: '42%' }} />
              <i style={{ left: '38%', top: '48%' }} />
              <b className="xn-score" />
            </div>
          </div>
          <div className="xn-v" data-k="web3" data-on={kind === 'web3' || undefined}>
            <div className="xn-wallet"><b /><span /></div>
            <div className="xn-blocks"><i /><i /><i /><i /></div>
            <div className="xn-rows"><i /><i /></div>
          </div>
        </div>
      </div>
      <div className="xn-kinds">
        {BUILD_KINDS.map((k) => (
          <i key={k} data-on={k === kind || undefined} />
        ))}
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- Develop: a compact engineering workspace */
export function DevelopPreview({ active }: { active: string }) {
  return (
    <div className="xn-pv xn-pv--develop" data-focus={active} aria-hidden="true">
      <div className="xn-ide">
        <div className="xn-ide-bar">
          <i />
          <i />
          <i />
          <span>billing/portal.ts</span>
        </div>
        <div className="xn-ide-body">
          <ul className="xn-tree">
            <li className="is-dir">src</li>
            <li className="is-sub">billing</li>
            <li className="is-file is-open">portal.ts</li>
            <li className="is-file">invoice.ts</li>
            <li className="is-sub">api</li>
            <li className="is-file">routes.ts</li>
            <li className="is-file">portal.test.ts</li>
          </ul>
          <pre className="xn-code">
            <span><em>12</em><span className="k">async function</span> <span className="f">openPortal</span>(u) {'{'}</span>
            <span><em>13</em>  <span className="k">const</span> c = <span className="f">findCustomer</span>(u);</span>
            <span className="xn-del"><em>14</em>  <span className="k">return</span> portal(c);</span>
            <span className="xn-add"><em>14</em>  <span className="k">if</span> (!c) <span className="k">return</span> <span className="f">notFound</span>();</span>
            <span className="xn-add"><em>15</em>  <span className="k">return</span> portal(c, <span className="s">back</span>);</span>
            <span><em>16</em>{'}'}</span>
          </pre>
        </div>
        <div className="xn-ide-status">
          <span className="xn-branch">
            <svg viewBox="0 0 16 16"><path d="M5 3v10M5 9c0-2 6-1 6-4M11 3.5v1.5" /><circle cx="5" cy="3" r="1.6" /><circle cx="5" cy="13" r="1.6" /><circle cx="11" cy="3" r="1.6" /></svg>
            fix/portal
          </span>
          <span className="xn-tests"><i />Tests passing</span>
          <span className="xn-ready"><i />Ready for review</span>
        </div>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- Explore: a small illustrative gallery */
const GALLERY = [
  { k: 'product', title: 'Booking app', kind: 'Product' },
  { k: 'project', title: 'Analytics SaaS', kind: 'Software project' },
  { k: 'workflow', title: 'Market research brief', kind: 'Workflow output' },
  { k: 'integration', title: 'CRM to Slack sync', kind: 'Integration' },
];
export function ExplorePreview({ active }: { active: string }) {
  return (
    <div className="xn-pv xn-pv--explore" aria-hidden="true">
      <div className="xn-pv-label">Illustrative examples</div>
      <div className="xn-gallery">
        {GALLERY.map((g) => (
          <div key={g.k} className="xn-card" data-k={g.k} data-on={g.k === active || undefined}>
            <div className="xn-card-art" />
            <b>{g.title}</b>
            <small>{g.kind}</small>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- Connect: the provider directory */
export function ConnectDirectory({ onNavigate }: { onNavigate: () => void }) {
  return (
    <section className="xn-dir" aria-label="Popular Xroga integrations">
      <div className="xn-dir-groups">
        {CONNECT_GROUPS.map((g) => (
          <div className="xn-dir-group" key={g.label}>
            <small className="xn-group-label">{g.label}</small>
            <div className="xn-dir-grid">
              {g.brands.map((b) => (
                <Link href="/integrations" className="xn-app" key={b.name} onClick={onNavigate}>
                  <i className="xn-app-mark">
                    <BrandMark brand={b} />
                  </i>
                  <span>
                    <b>{b.name}</b>
                    <em>{b.category}</em>
                  </span>
                </Link>
              ))}
            </div>
          </div>
        ))}
      </div>
      <div className="xn-dir-more">
        <small className="xn-group-label">And more</small>
        <div>
          {CONNECT_MORE.map((b) => (
            <Link href="/integrations" key={b.name} title={b.name} aria-label={b.name} onClick={onNavigate} className="xn-app-mini">
              <BrandMark brand={b} size={18} />
            </Link>
          ))}
          <Link href="/integrations" className="xn-dir-all" onClick={onNavigate}>
            Explore all <ArrowUpRight aria-hidden="true" />
          </Link>
        </div>
      </div>
    </section>
  );
}
