'use client';

/**
 * Navigation V3: the contextual previews inside the mega menus. Real HTML (crisp at any zoom) styled by xroga-nav.css,
 * all in one miniature-window language (`Win`). Each takes the preview key of the link the visitor points at or
 * focuses, so the art answers the menu: Product and Develop highlight the relevant region, Build and Explore swap
 * their content. Everything here is illustrative: no customer work, no real metrics, no claim of a finished release.
 */
import Link from 'next/link';
import { useState, type ReactNode } from 'react';
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

const BranchIcon = () => (
  <svg viewBox="0 0 16 16" aria-hidden="true">
    <path d="M5 3v10M5 9c0-2 6-1 6-4M11 3.5v1.5" />
    <circle cx="5" cy="3" r="1.5" />
    <circle cx="5" cy="13" r="1.5" />
    <circle cx="11" cy="3" r="1.5" />
  </svg>
);

/** the shared miniature window: one chrome for every preview */
function Win({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="xp-win">
      <div className="xp-bar">
        <i />
        <i />
        <i />
        <span>{title}</span>
      </div>
      <div className="xp-body">{children}</div>
    </div>
  );
}

/* ---------------------------------------------------------------- Product: a Xroga workspace carrying one request */
export function ProductPreview({ active }: { active: string }) {
  return (
    <div className="xn-pv xp-product" data-focus={active} aria-hidden="true">
      <Win title="Xroga · Workspace">
        <div className="xp-ws">
          <div className="xp-req" data-z="workspace">
            <span className="xp-avatar">Y</span>
            <p>Add Stripe checkout to my store and test the payment flow.</p>
          </div>
          <div className="xp-plan" data-z="intelligence">
            <div className="xp-k">Plan</div>
            <div className="xp-step is-done">
              <i />
              Read the store’s cart and orders code
            </div>
            <div className="xp-step is-done">
              <i />
              Add checkout with your Stripe account
            </div>
            <div className="xp-step is-run">
              <i />
              Run the payment flow in a test browser
            </div>
          </div>
          <div className="xp-apps" data-z="integrations">
            <span>
              <b className="xp-mark is-gh" />
              GitHub
            </span>
            <span>
              <b className="xp-mark is-stripe" />
              Stripe
            </span>
            <span>
              <b className="xp-mark is-vercel" />
              Vercel
            </span>
          </div>
          <div className="xp-checks" data-z="verification">
            <span className="is-ok">Build</span>
            <span className="is-ok">Tests</span>
            <span className="is-ok">Checkout preview</span>
          </div>
          <div className="xp-repo" data-z="ownership">
            <BranchIcon />
            <span>
              your-org/store · <b>feat/checkout</b>
            </span>
            <em>Ready for your review</em>
          </div>
        </div>
      </Win>
    </div>
  );
}

/* ---------------------------------------------------------------- Build: one browser, six kinds of product */
const BUILD_KINDS = ['webapp', 'website', 'saas', 'extension', 'game', 'web3'] as const;
type BuildKind = (typeof BUILD_KINDS)[number];
const BUILD_META: Record<BuildKind, { label: string; url: string }> = {
  webapp: { label: 'Web app', url: 'app.fleetdesk.io/overview' },
  website: { label: 'Website', url: 'northwind.studio' },
  saas: { label: 'SaaS', url: 'app.ledgerly.com/billing' },
  extension: { label: 'Extension', url: 'shop.example.com/item/42' },
  game: { label: 'Game', url: 'play.orbitdash.gg' },
  web3: { label: 'Web3', url: 'app.vaultline.xyz' },
};
export function BuildPreview({ active }: { active: string }) {
  const kind = ((BUILD_KINDS as readonly string[]).includes(active) ? active : 'webapp') as BuildKind;
  return (
    <div className="xn-pv xp-build" aria-hidden="true">
      <div className="xn-pv-label">
        Illustrative · <b>{BUILD_META[kind].label}</b>
      </div>
      <Win title={BUILD_META[kind].url}>
        <div className="xp-stage">
          <div className="xp-v xp-v-webapp" data-on={kind === 'webapp' || undefined}>
            <div className="xp-side">
              <b>Fleetdesk</b>
              <span className="is-on">Overview</span>
              <span>Vehicles</span>
              <span>Drivers</span>
              <span>Reports</span>
            </div>
            <div className="xp-dash">
              <div className="xp-kpis">
                <div>
                  <small>Active</small>
                  <b>128</b>
                </div>
                <div>
                  <small>On route</small>
                  <b>96</b>
                </div>
                <div>
                  <small>Alerts</small>
                  <b className="is-warn">3</b>
                </div>
              </div>
              <div className="xp-chart">
                <svg viewBox="0 0 200 64" preserveAspectRatio="none">
                  <path className="xp-area" d="M0 52 C24 46 36 34 60 36 S98 22 122 26 S168 10 200 12 V64 H0Z" />
                  <path d="M0 52 C24 46 36 34 60 36 S98 22 122 26 S168 10 200 12" />
                </svg>
              </div>
              <div className="xp-table">
                <span><i className="is-ok" />Van 14 · Route B</span>
                <span><i className="is-ok" />Truck 3 · Depot</span>
                <span><i className="is-warn" />Van 9 · Service due</span>
              </div>
            </div>
          </div>
          <div className="xp-v xp-v-website" data-on={kind === 'website' || undefined}>
            <div className="xp-sitenav">
              <b>Northwind</b>
              <span>Work</span>
              <span>Studio</span>
              <span>Contact</span>
            </div>
            <div className="xp-sitehero">
              <h4>Interiors with quiet character.</h4>
              <p>Residential and hospitality design.</p>
              <span className="xp-btn">Book a consultation</span>
            </div>
            <div className="xp-sitegrid">
              <i />
              <i />
              <i />
            </div>
          </div>
          <div className="xp-v xp-v-saas" data-on={kind === 'saas' || undefined}>
            <div className="xp-k">Choose a plan</div>
            <div className="xp-plans">
              <div>
                <b>Starter</b>
                <em>$9</em>
                <small>1 workspace</small>
              </div>
              <div className="is-pick">
                <b>Pro</b>
                <em>$29</em>
                <small>Unlimited invoices</small>
                <span className="xp-btn">Upgrade</span>
              </div>
              <div>
                <b>Team</b>
                <em>$79</em>
                <small>Roles and SSO</small>
              </div>
            </div>
          </div>
          <div className="xp-v xp-v-extension" data-on={kind === 'extension' || undefined}>
            <div className="xp-product-page">
              <div className="xp-img" />
              <b>Trail runner 2</b>
              <small>$128.00</small>
            </div>
            <div className="xp-popup">
              <div className="xp-popup-h">
                <b className="xp-mark is-ext" />
                Price Tracker
              </div>
              <small>Tracking this item</small>
              <div className="xp-spark">
                <svg viewBox="0 0 100 26" preserveAspectRatio="none">
                  <path d="M0 8 L20 10 L40 9 L60 16 L80 14 L100 20" />
                </svg>
              </div>
              <span className="xp-btn">Alert me under $110</span>
            </div>
          </div>
          <div className="xp-v xp-v-game" data-on={kind === 'game' || undefined}>
            <div className="xp-game">
              <div className="xp-hud">
                <span>
                  Score <b>2 450</b>
                </span>
                <span>Wave 4</span>
              </div>
              <i className="xp-en" style={{ left: '22%', top: '32%' }} />
              <i className="xp-en" style={{ left: '50%', top: '24%' }} />
              <i className="xp-en" style={{ left: '74%', top: '38%' }} />
              <i className="xp-shot" style={{ left: '50%', top: '58%' }} />
              <span className="xp-ship" />
            </div>
          </div>
          <div className="xp-v xp-v-web3" data-on={kind === 'web3' || undefined}>
            <div className="xp-wallet">
              <span>
                <small>Vault balance</small>
                <b>4.82 ETH</b>
              </span>
              <span className="xp-chip">0x7a…3f1c</span>
            </div>
            <div className="xp-blocks">
              <i>#19 204 811</i>
              <i>#19 204 812</i>
              <i>#19 204 813</i>
            </div>
            <div className="xp-table">
              <span><i className="is-ok" />Deposit · confirmed</span>
              <span><i className="is-ok" />Swap · confirmed</span>
              <span><i className="is-run" />Withdraw · pending</span>
            </div>
          </div>
        </div>
      </Win>
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
  const docs = active === 'docs';
  return (
    <div className="xn-pv xp-develop" data-focus={active} aria-hidden="true">
      <div className="xp-ide">
        <div className="xp-ide-bar">
          <i />
          <i />
          <i />
          <span className="xp-tab is-on">{docs ? 'billing.md' : 'portal.ts'}</span>
          <span className="xp-tab">{docs ? 'portal.ts' : 'portal.test.ts'}</span>
        </div>
        <div className="xp-ide-body">
          <ul className="xp-tree" data-z="tree">
            <li className="is-dir">store</li>
            <li className="is-dir is-sub">billing</li>
            <li className={docs ? 'is-file' : 'is-file is-open'}>portal.ts</li>
            <li className="is-file">invoice.ts</li>
            <li className="is-dir is-sub">tests</li>
            <li className="is-file">portal.test.ts</li>
            <li className={docs ? 'is-dir is-sub is-open' : 'is-dir is-sub'}>docs</li>
          </ul>
          {docs ? (
            <div className="xp-doc">
              <b># Billing portal</b>
              <p>Open the customer portal for the signed-in user.</p>
              <code>openPortal(user)</code>
              <p>Returns 404 when the user has no customer record.</p>
            </div>
          ) : (
            <div className="xp-codecol">
              <pre className="xp-code" data-z="diff">
                <span>
                  <em>12</em>
                  <span className="k">async function</span> <span className="f">openPortal</span>(u) {'{'}
                </span>
                <span>
                  <em>13</em> <span className="k">const</span> c = <span className="k">await</span> <span className="f">find</span>(u.id);
                </span>
                <span className="xp-del">
                  <em>14</em> <span className="k">return</span> portal(c);
                </span>
                <span className="xp-add">
                  <em>14</em> <span className="k">if</span> (!c) <span className="k">return</span> <span className="f">notFound</span>();
                </span>
                <span className="xp-add">
                  <em>15</em> <span className="k">return</span> portal(c, <span className="s">back</span>);
                </span>
                <span>
                  <em>16</em>
                  {'}'}
                </span>
              </pre>
              <div className="xp-term" data-z="tests">
                {active === 'ready' ? (
                  <>
                    <span className="xp-term-k">release checks</span>
                    <span><i className="is-ok" />build</span>
                    <span><i className="is-ok" />tests</span>
                    <span><i className="is-ok" />environment</span>
                    <span><i className="is-run" />waiting for your approval</span>
                  </>
                ) : (
                  <>
                    <span className="xp-term-k">$ npm test portal</span>
                    <span><i className="is-ok" />opens the portal</span>
                    <span><i className="is-ok" />404 for an unknown user</span>
                  </>
                )}
              </div>
            </div>
          )}
        </div>
        <div className="xp-ide-status">
          <span data-z="branch">
            <BranchIcon />
            fix/portal-404
          </span>
          <span data-z="tests">
            <i className="is-ok" />
            Tests pass
          </span>
          <span data-z="ready">
            <i className="is-blue" />
            Ready for review
          </span>
        </div>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- Explore: a featured preview that follows the link */
const FEATURE: Record<string, { k: string; title: string }> = {
  showcase: { k: 'Showcase', title: 'Booking app for a dental clinic' },
  categories: { k: 'Build categories', title: 'Apps, websites, SaaS and tools' },
  guides: { k: 'Guide', title: 'Ship a Stripe checkout in one session' },
  blog: { k: 'Blog', title: 'What “verified” should mean for AI-built software' },
  compare: { k: 'Compare', title: 'How Xroga compares with other AI builders' },
  docs: { k: 'Docs', title: 'Connect a GitHub repository' },
};
export function ExplorePreview({ active }: { active: string }) {
  const key = FEATURE[active] ? active : 'showcase';
  const f = FEATURE[key];
  return (
    <div className="xn-pv xp-explore" aria-hidden="true">
      <div className="xn-pv-label">Illustrative examples</div>
      <div className="xp-feature" key={key}>
        <div className="xp-art" data-k={key}>
          {key === 'showcase' && (
            <div className="xp-cal">
              <b>October · Dr. Rivera</b>
              <div>
                {Array.from({ length: 21 }, (_, i) => (
                  <i key={i} className={i === 9 ? 'is-pick' : i % 7 > 4 ? 'is-off' : undefined} />
                ))}
              </div>
              <span className="xp-btn">Book 10:30</span>
            </div>
          )}
          {key === 'categories' && (
            <div className="xp-cats">
              {['Web apps', 'Websites', 'SaaS', 'Extensions', 'APIs', 'Games'].map((c) => (
                <span key={c}>{c}</span>
              ))}
            </div>
          )}
          {key === 'guides' && (
            <ol className="xp-steps">
              <li className="is-done">Connect your Stripe account</li>
              <li className="is-done">Describe the checkout</li>
              <li className="is-run">Review the test run</li>
            </ol>
          )}
          {key === 'blog' && (
            <div className="xp-article">
              <small>Engineering · 6 min read</small>
              <b>What “verified” should mean</b>
              <i />
              <i />
              <i />
            </div>
          )}
          {key === 'compare' && (
            <div className="xp-compare">
              <span />
              <b>Xroga</b>
              <b>Typical</b>
              <span>Existing repos</span>
              <i className="is-ok" />
              <i className="is-part" />
              <span>Test evidence</span>
              <i className="is-ok" />
              <i className="is-part" />
              <span>Your accounts</span>
              <i className="is-ok" />
              <i className="is-ok" />
            </div>
          )}
          {key === 'docs' && (
            <div className="xp-docs">
              <b>Connect a repository</b>
              <code>Settings → GitHub → Authorize</code>
              <p>Xroga works on the branches you choose.</p>
            </div>
          )}
        </div>
        <div className="xp-feature-meta">
          <small>{f.k}</small>
          <b>{f.title}</b>
        </div>
      </div>
      <div className="xn-kinds">
        {Object.keys(FEATURE).map((k) => (
          <i key={k} data-on={k === key || undefined} />
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
