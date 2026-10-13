'use client';

/**
 * The four browser missions, each a different real-world tool the Xroga pointer works in: a store's pricing and
 * checkout with developer tools, an ads campaign editor, an extension release console and a CMS with device
 * previews. Every product, site and figure is fictional sample data (`.example` domains), and every app stops at
 * an approval: nothing is published, charged or submitted.
 */
import type { ReactNode } from 'react';
import type { Ctx } from './ctx';
import type { MissionId } from './script';
import a from './Missions.module.css';

export interface MissionApp {
  App: (p: { ctx: Ctx }) => ReactNode;
  url: (ctx: Ctx) => string;
  favicon: string;
  tab: string;
}

const on = (v: boolean) => v || undefined;

/* ------------------------------------------------------------------------------------- 1 · find a website bug */
function BugApp({ ctx }: { ctx: Ctx }) {
  const picked = ctx.at('pick');
  const applied = ctx.at('apply');
  const paying = ctx.now('upgrade');
  const looped = ctx.at('loop');
  const devtools = ctx.at('network');
  const inspected = ctx.at('inspect');
  return (
    <div className={a.bug} data-devtools={on(devtools)}>
      <div className={a.page}>
        <header className={a.storeNav}>
          <b className={a.storeLogo}>
            <i aria-hidden="true" />
            Lattice
          </b>
          <span>Product</span>
          <span>Customers</span>
          <span data-on="">Pricing</span>
          <span className={a.storeAcct}>Ana P.</span>
        </header>
        <div className={a.pricing}>
          <p className={a.kicker}>Plans for growing teams</p>
          <div className={a.plans}>
            {[
              ['Starter', '$9', 'For one project'],
              ['Pro', '$24', 'Unlimited projects'],
              ['Team', '$59', 'Up to 20 seats'],
            ].map(([n, p, d]) => (
              <div key={n} className={a.plan} data-t={n === 'Pro' ? 'bug.pro' : undefined} data-sel={on(n === 'Pro' && picked)} data-pop={on(n === 'Pro')}>
                <span className={a.planName}>{n}</span>
                <b className={a.planPrice}>
                  {p}
                  <small>/mo</small>
                </b>
                <span className={a.planNote}>{d}</span>
              </div>
            ))}
          </div>
          <div className={a.checkout} data-show={on(picked)}>
            <div className={a.coRow}>
              <span>Pro · monthly</span>
              <b>{applied ? <><s>$24.00</s> $19.20</> : '$24.00'}</b>
            </div>
            <div className={a.coupon}>
              <span className={a.input} data-t="bug.coupon" data-focus={on(ctx.now('coupon'))}>
                {ctx.field('coupon', <em>Coupon code</em>)}
              </span>
              <span className={a.btnGhost} data-t="bug.apply" data-ok={on(applied)}>
                {applied ? 'Applied −20%' : 'Apply'}
              </span>
            </div>
            <span className={a.btnPay} data-t="bug.pay" data-busy={on(paying)} data-bad={on(looped)}>
              {paying ? 'Processing…' : 'Upgrade to Pro'}
            </span>
            {looped && <span className={a.toast}>Returned to checkout. Your plan is still Starter.</span>}
          </div>
        </div>
      </div>

      <aside className={a.devtools} aria-hidden={!devtools || undefined}>
        <div className={a.dtTabs}>
          <span>Elements</span>
          <span>Console</span>
          <span data-t="bug.netTab" data-on={on(devtools)}>
            Network
          </span>
        </div>
        <div className={a.dtHead}>
          <span>Name</span>
          <span>Status</span>
          <span>Time</span>
        </div>
        {[
          ['GET', '/pricing', '200', '84 ms'],
          ['POST', '/api/coupon/validate', '200', '112 ms'],
          ['POST', '/api/checkout', '422', '96 ms'],
          ['GET', '/checkout?plan=pro', '200', '71 ms'],
        ].map(([m, p, s, ms]) => (
          <div key={p} className={a.dtRow} data-t={s === '422' ? 'bug.row' : undefined} data-bad={on(s === '422')} data-sel={on(s === '422' && inspected)}>
            <span>
              <i>{m}</i> {p}
            </span>
            <span>{s}</span>
            <span>{ms}</span>
          </div>
        ))}
        <div className={a.dtBody} data-show={on(inspected)}>
          <span className={a.dtLabel}>Response</span>
          <code>
            {'{'}
            <br />
            &nbsp;&nbsp;<i>&quot;error&quot;</i>: <b>&quot;coupon_not_valid_for_plan&quot;</b>,
            <br />
            &nbsp;&nbsp;<i>&quot;plan&quot;</i>: &quot;pro&quot;, <i>&quot;coupon&quot;</i>: &quot;LAUNCH20&quot;
            <br />
            {'}'}
          </code>
        </div>
      </aside>
    </div>
  );
}

/* ------------------------------------------------------------------------------------ 2 · prepare a Google Ad */
function AdsApp({ ctx }: { ctx: Ctx }) {
  const site = ctx.at('site');
  const goal = ctx.at('goal');
  const radius = ctx.at('radius');
  const pub = ctx.at('publish');
  const stage = ['site', 'goal', 'radius', 'headline', 'budget', 'publish'].filter((x) => ctx.at(x)).length;
  return (
    <div className={a.ads}>
      <nav className={a.adsRail} aria-hidden="true">
        {['Website', 'Goal', 'Location', 'Ad', 'Budget', 'Review'].map((n, i) => (
          <span key={n} data-done={on(i < stage)} data-now={on(i === stage)}>
            <i>{i < stage ? '✓' : i + 1}</i>
            {n}
          </span>
        ))}
      </nav>
      <div className={a.adsForm}>
        <div className={a.field}>
          <span>Website</span>
          <span className={a.input} data-t="ads.site" data-focus={on(ctx.now('site'))}>
            northsidedental.example
            {site && <em className={a.scan}>3 services found</em>}
          </span>
        </div>
        <div className={a.field}>
          <span>Campaign goal</span>
          <div className={a.chips}>
            <span data-t="ads.goal" data-on={on(goal)}>
              Appointment bookings
            </span>
            <span>Calls</span>
            <span>Store visits</span>
          </div>
        </div>
        <div className={a.field}>
          <span>Headline</span>
          <span className={a.input} data-t="ads.headline" data-focus={on(ctx.now('headline'))}>
            {ctx.field('headline', <em>Write a headline</em>)}
          </span>
        </div>
        <div className={a.field} data-narrow="">
          <span>Daily budget</span>
          <span className={a.input} data-t="ads.budget" data-focus={on(ctx.now('budget'))}>
            <b>$</b>
            {ctx.field('budget', <em>0</em>)}
            <small>/ day</small>
          </span>
        </div>
      </div>
      <div className={a.adsSide}>
        <div className={a.map} data-r={on(radius)}>
          <svg className={a.streets} viewBox="0 0 300 180" preserveAspectRatio="none" aria-hidden="true">
            <path d="M0 40 Q80 30 150 60 T300 50 M0 120 Q120 140 300 110 M70 0 Q80 90 60 180 M210 0 Q200 80 230 180 M0 80 L300 90" />
          </svg>
          <span className={a.radius} />
          <span className={a.mapPin} />
          <span className={a.radiusHandle} data-t="ads.radius" />
          <span className={a.mapLabel}>{radius ? '8 km around Northside' : '3 km'}</span>
        </div>
        <div className={a.serp}>
          <span className={a.sponsored}>Sponsored · northsidedental.example</span>
          <b className={a.serpTitle}>{ctx.at('headline') ? ctx.field('headline') : 'Your headline appears here'}</b>
          <span className={a.serpText}>Gentle, on-time care. Book online in two minutes.</span>
        </div>
        <span className={a.btnPay} data-t="ads.publish" data-wait={on(pub)}>
          {pub ? 'Waiting for your approval' : 'Send for approval'}
        </span>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------------------- 3 · publish a Chrome extension */
function ExtensionApp({ ctx }: { ctx: Ctx }) {
  const manifest = ctx.at('manifest');
  const perm = ctx.at('perm');
  const smoke = ctx.at('smoke');
  const listing = ctx.at('listing');
  const checked = ctx.at('check');
  const submitted = ctx.at('submit');
  return (
    <div className={a.ext} data-listing={on(listing)}>
      <aside className={a.extTree}>
        <span className={a.treeHead}>tabtidy · 1.4.0</span>
        <span data-t="ext.manifest" data-on={on(manifest)}>
          manifest.json
        </span>
        <span>background.js</span>
        <span>popup.html</span>
        <span>icons/</span>
        <span className={a.treeHead}>Release</span>
        <span data-t="ext.listingTab" data-on={on(listing)}>
          Store listing
        </span>
      </aside>

      <div className={a.extPane} data-pane="package" aria-hidden={listing || undefined}>
        <div className={a.code}>
          <span className={a.codeHead}>manifest.json</span>
          <pre>
            <span>{'{'}</span>
            <span>
              {'  '}
              <i>&quot;name&quot;</i>: &quot;TabTidy&quot;,
            </span>
            <span>
              {'  '}
              <i>&quot;version&quot;</i>: &quot;1.4.0&quot;,
            </span>
            <span>
              {'  '}
              <i>&quot;manifest_version&quot;</i>: 3,
            </span>
            <span>
              {'  '}
              <i>&quot;host_permissions&quot;</i>: [
            </span>
            <span className={a.diff} data-t="ext.perm" data-state={perm ? 'fixed' : manifest ? 'flag' : undefined}>
              {perm ? (
                <>
                  {'    '}&quot;https://*.tabtidy.example/*&quot;, &quot;https://docs.example/*&quot;
                </>
              ) : (
                <>{'    '}&quot;&lt;all_urls&gt;&quot;</>
              )}
            </span>
            <span>{'  ]'}</span>
            <span>{'}'}</span>
          </pre>
        </div>
        <div className={a.smoke}>
          <div className={a.smokeHead}>
            <span>Smoke test</span>
            <span className={a.btnGhost} data-t="ext.run" data-ok={on(smoke)}>
              {smoke ? 'Passed' : 'Run'}
            </span>
          </div>
          <div className={a.mini} data-run={on(smoke)}>
            <span className={a.miniBar} />
            <span className={a.miniPopup}>
              <b>TabTidy</b>
              <i />
              <i />
              <i />
            </span>
          </div>
          <ul className={a.checks}>
            {['Installs cleanly', 'Popup opens', 'Groups 12 tabs'].map((c, i) => (
              <li key={c} data-ok={on(smoke)} style={{ transitionDelay: `${i * 140}ms` }}>
                {c}
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div className={a.extPane} data-pane="listing" aria-hidden={!listing || undefined}>
        <div className={a.listing}>
          <div className={a.listingHead}>
            <span className={a.listingIcon} />
            <span>
              <b>TabTidy</b>
              <small>Group and tidy tabs in one click</small>
            </span>
          </div>
          <div className={a.shots}>
            <i />
            <i />
            <i />
          </div>
        </div>
        <ul className={a.checklist} data-t="ext.checklist">
          {['Package 1.4.0', 'Permissions justified', 'Screenshots 1280 × 800', 'Privacy answers'].map((c, i) => (
            <li key={c} data-ok={on(checked)} style={{ transitionDelay: `${i * 120}ms` }}>
              {c}
            </li>
          ))}
        </ul>
        <span className={a.btnPay} data-t="ext.submit" data-wait={on(submitted)}>
          {submitted ? 'Waiting for your approval' : 'Submit for review'}
        </span>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------------------- 4 · prepare an article */
function ArticleApp({ ctx }: { ctx: Ctx }) {
  const image = ctx.at('image');
  const slug = ctx.at('slug');
  const phone = ctx.at('phone');
  const fixed = ctx.at('fix');
  const pub = ctx.at('publish');
  return (
    <div className={a.article}>
      <div className={a.editor}>
        <div className={a.edBar}>
          <span>Draft</span>
          <span className={a.btnPay} data-t="art.publish" data-wait={on(pub)}>
            {pub ? 'Waiting for your approval' : 'Request publish'}
          </span>
        </div>
        <h4 className={a.edTitle}>A calmer first week: our onboarding checklist</h4>
        <div className={a.edImage} data-t="art.image" data-on={on(image)}>
          <span className={a.photo} />
        </div>
        <div className={a.field}>
          <span>Alt text</span>
          <span className={a.input} data-t="art.alt" data-focus={on(ctx.now('alt'))} data-empty={on(!ctx.at('alt'))}>
            {ctx.field('alt', <em>Missing</em>)}
          </span>
        </div>
        <div className={a.field}>
          <span>URL</span>
          <span className={a.input} data-t="art.slug" data-focus={on(ctx.now('slug'))}>
            <small>/blog/</small>
            {slug ? 'onboarding-checklist' : <em>untitled-draft-3</em>}
          </span>
        </div>
        <div className={a.blockBar} data-show={on(phone)}>
          <span>Table block</span>
          <span className={a.btnGhost} data-t="art.stack" data-ok={on(fixed)}>
            {fixed ? 'Stacks on phones' : 'Stack on small screens'}
          </span>
        </div>
      </div>
      <div className={a.preview} data-device={phone ? 'phone' : 'desktop'}>
        <div className={a.devices}>
          <span data-on={on(!phone)}>Desktop</span>
          <span data-t="art.phone" data-on={on(phone)}>
            Phone
          </span>
        </div>
        <div className={a.frame}>
          <span className={a.pvPhoto} />
          <b className={a.pvTitle}>A calmer first week: our onboarding checklist</b>
          <span className={a.pvLine} />
          <span className={a.pvLine} data-short="" />
          <div className={a.pvTable} data-t="art.table" data-over={on(phone && !fixed)} data-stack={on(fixed)}>
            {['Starter', 'Growth', 'Scale'].map((p, i) => (
              <span key={p}>
                <b>{p}</b>
                {['$0', '$29', '$79'][i]}
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export const MISSION_APPS: Record<MissionId, MissionApp> = {
  bug: {
    App: BugApp,
    url: (ctx) => (ctx.at('pick') ? 'shop.lattice.example/checkout?plan=pro' : 'shop.lattice.example/pricing'),
    favicon: 'linear-gradient(135deg,#7c9cff,#4b5fd6)',
    tab: 'Lattice · Pricing',
  },
  ads: {
    App: AdsApp,
    url: () => 'ads.example/campaigns/new',
    favicon: 'linear-gradient(135deg,#7ad889,#3a9c56)',
    tab: 'New campaign',
  },
  extension: {
    App: ExtensionApp,
    url: (ctx) => (ctx.at('listing') ? 'release.example/tabtidy/listing' : 'release.example/tabtidy/package'),
    favicon: 'linear-gradient(135deg,#8fb6ff,#3a6fd8)',
    tab: 'TabTidy release',
  },
  article: {
    App: ArticleApp,
    url: (ctx) => (ctx.at('slug') ? 'folio.example/edit/onboarding-checklist' : 'folio.example/edit/untitled-draft-3'),
    favicon: 'linear-gradient(135deg,#f2d38c,#c4893a)',
    tab: 'Folio · Editor',
  },
};
