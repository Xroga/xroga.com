'use client';

/**
 * Navigation V3: the contextual previews inside the mega menus. Real HTML (crisp at any zoom) styled by xroga-nav.css,
 * all in one miniature-window language (`Win`). Each takes the preview key of the link the visitor points at or
 * focuses, so the art answers the menu: Product and Develop highlight the relevant region, Build and Explore swap
 * their content. Everything here is illustrative: no customer work, no real metrics, no claim of a finished release.
 */
import Link from 'next/link';
import { useState, type CSSProperties, type ReactNode } from 'react';
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

/* ---------------------------------------------------------------- Product: one task inside a miniature Xroga workspace */
// Each Product link opens the matching view of the same task (Request -> Coordinated execution -> Verified outcome), so
// the preview answers the link: the window, rail and stage track stay put while the view's content resolves into place.
const PV_GH: ConnectBrand = { name: 'GitHub', slug: 'github', color: 'ffffff', category: '' };
const PV_STRIPE: ConnectBrand = { name: 'Stripe', slug: 'stripe', color: '635BFF', category: '' };
const PV_VERCEL: ConnectBrand = { name: 'Vercel', slug: 'vercel', color: 'ffffff', category: '' };
const PRODUCT_VIEWS = ['overview', 'workspace', 'intelligence', 'verification', 'integrations', 'ownership'] as const;
type ProductView = (typeof PRODUCT_VIEWS)[number];
// which stage of the task each view sits in: 0 request, 1 execution, 2 verified
const VIEW_STAGE: Record<ProductView, number> = { overview: 2, workspace: 0, intelligence: 1, integrations: 1, verification: 2, ownership: 2 };
const VIEW_TITLE: Record<ProductView, string> = {
  overview: 'Task · Add Stripe checkout',
  workspace: 'Workspace',
  intelligence: 'Plan',
  verification: 'Evidence',
  integrations: 'Tools for this task',
  ownership: 'your-org/store',
};
const RailIcon = ({ d }: { d: string }) => (
  <svg viewBox="0 0 16 16" aria-hidden="true">
    <path d={d} />
  </svg>
);
const RAIL: { view: ProductView; d: string }[] = [
  { view: 'workspace', d: 'M2.5 4.5a2 2 0 0 1 2-2h7a2 2 0 0 1 2 2v4.5a2 2 0 0 1-2 2H7l-3 2.5v-2.5h0a2 2 0 0 1-1.5-2z' },
  { view: 'intelligence', d: 'M3 8a1.5 1.5 0 1 0 3 0 1.5 1.5 0 1 0-3 0M10 3.5a1.5 1.5 0 1 0 3 0 1.5 1.5 0 1 0-3 0M10 12.5a1.5 1.5 0 1 0 3 0 1.5 1.5 0 1 0-3 0M6 7.5l4-3M6 8.5l4 3' },
  { view: 'verification', d: 'M8 2 3 4v4c0 3 2.2 5 5 6 2.8-1 5-3 5-6V4zM5.8 8.2l1.6 1.6 3-3.2' },
  { view: 'integrations', d: 'M3 3h4v4H3zM9 3h4v4H9zM3 9h4v4H3zM9 11h4M11 9v4' },
  { view: 'ownership', d: 'M5 3v10M5 9c0-2 6-1 6-4M11 3.5v1.5M5 3a1.5 1.5 0 1 0 0 .01M5 13a1.5 1.5 0 1 0 0 .01M11 3a1.5 1.5 0 1 0 0 .01' },
];

function ProductView({ view }: { view: ProductView }) {
  switch (view) {
    case 'workspace':
      return (
        <div className="xq-view xq-chat">
          <div className="xq-msg is-you">
            <b>You</b>
            <p>Add Stripe checkout to my store and test the payment flow.</p>
          </div>
          <div className="xq-msg is-x">
            <b>Xroga</b>
            <p>I’ll read the cart code, add checkout with your Stripe account in test mode, then run the payment flow in a test browser.</p>
            <span className="xq-chip">Plan · 3 steps</span>
          </div>
          <div className="xq-composer">Reply to Xroga…</div>
        </div>
      );
    case 'intelligence':
      return (
        <div className="xq-view xq-plan">
          <svg className="xq-paths" viewBox="0 0 300 150" preserveAspectRatio="none" aria-hidden="true">
            <path d="M58 75 C 100 75, 100 22, 140 22" />
            <path d="M58 75 C 100 75, 100 75, 140 75" />
            <path className="is-run" d="M58 75 C 100 75, 100 128, 140 128" />
          </svg>
          <div className="xq-node is-req">
            <small>Request</small>
            <b>Stripe checkout</b>
          </div>
          <div className="xq-steps">
            <div className="xq-step is-done">
              <i />
              Read cart and orders code
            </div>
            <div className="xq-step is-done">
              <i />
              Add Stripe checkout
            </div>
            <div className="xq-step is-run">
              <i />
              Run the payment flow
            </div>
          </div>
        </div>
      );
    case 'verification':
      return (
        <div className="xq-view xq-evidence">
          <div className="xq-check">
            <i />
            <span>Build</span>
            <em>passed</em>
          </div>
          <div className="xq-check">
            <i />
            <span>Unit tests</span>
            <em>24 passed</em>
          </div>
          <div className="xq-check">
            <i />
            <span>Checkout in a test browser</span>
            <em>passed</em>
          </div>
          <div className="xq-shot">
            <div className="xq-shot-bar">store.test / checkout</div>
            <div className="xq-shot-body">
              <b>Payment succeeded</b>
              <span>Test mode · card ending 4242</span>
            </div>
          </div>
        </div>
      );
    case 'integrations':
      return (
        <div className="xq-view xq-tools">
          {[
            { b: PV_GH, what: 'Read and write your-org/store' },
            { b: PV_STRIPE, what: 'Checkout in test mode' },
            { b: PV_VERCEL, what: 'Preview deployment' },
          ].map(({ b, what }) => (
            <div className="xq-tool" key={b.name}>
              <span className="xq-tool-mark">
                <BrandMark brand={b} size={16} />
              </span>
              <span>
                <b>{b.name}</b>
                <em>{what}</em>
              </span>
            </div>
          ))}
          <p className="xq-note">You choose what to connect and authorize.</p>
        </div>
      );
    case 'ownership':
      return (
        <div className="xq-view xq-repo">
          <div className="xq-branch">
            <BranchIcon />
            feat/checkout
          </div>
          {[
            ['a41c9e2', 'Read cart and order totals'],
            ['7d03b18', 'Add Stripe checkout session'],
            ['e95f2c4', 'Test the payment flow'],
          ].map(([h, m]) => (
            <div className="xq-commit" key={h}>
              <code>{h}</code>
              <span>{m}</span>
            </div>
          ))}
          <div className="xq-pr">
            <b>Pull request</b>
            <span>
              <i className="xq-add">+184</i> <i className="xq-del">−12</i> · Ready for your review
            </span>
          </div>
        </div>
      );
    default:
      return (
        <div className="xq-view xq-overview">
          {[
            ['Request', 'Add Stripe checkout and test the payment flow'],
            ['Execution', 'Three steps with GitHub, Stripe and Vercel'],
            ['Verified', 'Build, tests and a checkout run in a test browser'],
          ].map(([k, v], n) => (
            <div className={`xq-card is-s${n}`} key={k}>
              <small>{k}</small>
              <span>{v}</span>
            </div>
          ))}
        </div>
      );
  }
}

export function ProductPreview({ active }: { active: string }) {
  const view: ProductView = (PRODUCT_VIEWS as readonly string[]).includes(active) ? (active as ProductView) : 'overview';
  const stage = VIEW_STAGE[view];
  const railAt = RAIL.findIndex((r) => r.view === view);
  return (
    <div className="xn-pv xq" data-view={view} aria-hidden="true">
      <div className="xq-win">
        <div className="xq-top">
          <i />
          <i />
          <i />
          <span>Xroga · {VIEW_TITLE[view]}</span>
          <em data-stage={stage}>{stage === 2 ? 'Verified' : stage === 1 ? 'Running' : 'New'}</em>
        </div>
        <div className="xq-main">
          <div className="xq-rail" style={{ '--at': railAt } as CSSProperties} data-on={railAt >= 0 || undefined}>
            {RAIL.map((r) => (
              <span key={r.view} data-on={r.view === view || undefined}>
                <RailIcon d={r.d} />
              </span>
            ))}
          </div>
          <div className="xq-stage">
            <ProductView view={view} key={view} />
          </div>
        </div>
        <div className="xq-track">
          {['Request', 'Execution', 'Verified'].map((s, n) => (
            <span key={s} data-on={n <= stage || undefined} data-now={n === stage || undefined}>
              {s}
            </span>
          ))}
        </div>
      </div>
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
                    <span><i className="is-ok" />keeps the session after reload</span>
                    <span className="xp-term-sum">3 passed · 0 failed · 1.2 s</span>
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
            <div className="xp-book">
              <div className="xp-book-head">
                <b>Rivera Dental</b>
                <span>Book a visit</span>
              </div>
              <div className="xp-days">
                {['Mon 14', 'Tue 15', 'Wed 16', 'Thu 17', 'Fri 18'].map((d) => (
                  <span key={d} className={d === 'Wed 16' ? 'is-pick' : undefined}>
                    {d}
                  </span>
                ))}
              </div>
              <div className="xp-slots">
                {['9:00', '9:30', '10:30', '11:15', '14:00', '15:30'].map((t) => (
                  <span key={t} className={t === '10:30' ? 'is-pick' : t === '9:30' || t === '14:00' ? 'is-off' : undefined}>
                    {t}
                  </span>
                ))}
              </div>
              <div className="xp-book-foot">
                <span>Cleaning · 45 min</span>
                <span className="xp-btn">Confirm 10:30</span>
              </div>
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
