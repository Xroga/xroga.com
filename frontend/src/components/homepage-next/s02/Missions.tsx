'use client';

/**
 * The four Browser Automation missions (V12). Each runs in one browser with real-feeling tabs that Xroga's cursor
 * opens and switches between: a store with developer tools and the repository behind it; an ads workspace from
 * brief to keywords to campaign; an extension project, its tests and the store dashboard; and public business
 * sites, a CRM and a drafts folder for client prospecting.
 *
 * Every product, site, person and figure is fictional sample data (`.example` domains). Every app stops at an
 * approval: nothing is merged, published, charged, submitted or sent.
 */
import type { ReactNode } from 'react';
import type { Ctx } from './ctx';
import type { MissionId } from './script';
import a from './Missions.module.css';

export interface BrowserTab {
  label: string;
  favicon: string;
  active: boolean;
  /** `data-t` so the cursor can click the tab itself. */
  t?: string;
  /** Just opened: slides in. */
  fresh?: boolean;
}

export interface MissionApp {
  App: (p: { ctx: Ctx }) => ReactNode;
  tabs: (ctx: Ctx) => BrowserTab[];
  url: (ctx: Ctx) => string;
}

const on = (v: boolean) => v || undefined;
/** The view whose first step was reached most recently. */
function viewOf<V extends string>(ctx: Ctx, views: [V, string][]): V {
  let v = views[0][0];
  for (const [name, from] of views) if (ctx.at(from)) v = name;
  return v;
}
const Check = ({ ok, bad, wait }: { ok?: boolean; bad?: boolean; wait?: boolean }) => (
  <i className={a.check} data-ok={on(!!ok)} data-bad={on(!!bad)} data-wait={on(!!wait)} aria-hidden="true" />
);

/* =========================================================================================== 1 · website bug */
const bugView = (ctx: Ctx) =>
  viewOf(ctx, [
    ['store', 'open'],
    ['repo', 'repo'],
    ['store', 'back'],
  ]);

function BugApp({ ctx }: { ctx: Ctx }) {
  return bugView(ctx) === 'repo' ? <BugRepo ctx={ctx} /> : <BugStore ctx={ctx} />;
}

function BugStore({ ctx }: { ctx: Ctx }) {
  const picked = ctx.at('pick');
  const applied = ctx.at('apply');
  const retest = ctx.at('retest');
  const paying = ctx.now('upgrade') || ctx.now('retest');
  const failed = ctx.at('bounced') && !retest;
  const devtools = ctx.at('network');
  const inspected = ctx.at('inspect');
  const rows: [string, string, string, string, boolean?][] = [
    ['GET', '/pricing', '200', '84 ms'],
    ['POST', '/api/coupon/validate', '200', '112 ms'],
    ['POST', '/api/checkout', '422', '96 ms', true],
    ['GET', '/account', '200', '63 ms'],
  ];
  if (retest) rows.push(['POST', '/api/checkout', '200', '141 ms']);
  return (
    <div className={a.app} data-app="store" data-devtools={on(devtools)}>
      <div className={a.page}>
        <header className={a.storeNav}>
          <b className={a.storeLogo}>
            <i aria-hidden="true" />
            Lattice
          </b>
          <span className={a.hideS}>Product</span>
          <span data-on="">Pricing</span>
          <span className={a.plan} data-t="bug.plan" data-bad={on(failed)} data-good={on(retest)}>
            {retest ? 'Plan: Pro' : 'Plan: Starter'}
          </span>
        </header>
        <div className={a.pricing}>
          <p className={a.kicker}>Upgrade your workspace</p>
          <div className={a.plans}>
            {[
              ['Starter', '$9', 'Current plan'],
              ['Pro', '$24', 'Unlimited projects'],
              ['Team', '$59', 'Up to 20 seats'],
            ].map(([n, p, d]) => (
              <div key={n} className={a.tier} data-t={n === 'Pro' ? 'bug.pro' : undefined} data-sel={on(n === 'Pro' && picked)} data-cur={on(n === 'Starter' && !retest)}>
                <span>{n}</span>
                <b>
                  {p}
                  <small>/mo</small>
                </b>
                <em>{n === 'Pro' && retest ? 'Your plan' : n === 'Starter' && retest ? 'Previous plan' : d}</em>
              </div>
            ))}
          </div>
          <div className={a.checkout} data-show={on(picked)}>
            <div className={a.coRow}>
              <span>Pro · monthly</span>
              <b>
                {applied ? (
                  <>
                    <s>$24.00</s> $19.20
                  </>
                ) : (
                  '$24.00'
                )}
              </b>
            </div>
            <div className={a.row}>
              <span className={a.input} data-t="bug.coupon" data-focus={on(ctx.now('coupon'))}>
                {ctx.field('coupon', <em>Promotion code</em>)}
              </span>
              <span className={a.btn} data-t="bug.apply" data-ok={on(applied)}>
                {applied ? '−20% applied' : 'Apply'}
              </span>
            </div>
            <span className={a.btnPrimary} data-t="bug.pay" data-busy={on(paying)} data-bad={on(failed)} data-ok={on(retest && !paying)}>
              {paying ? 'Processing…' : retest ? 'Upgraded ✓' : 'Upgrade to Pro'}
            </span>
            {failed && <span className={a.toast}>Something went wrong. You are still on Starter.</span>}
            {retest && !paying && <span className={a.toast} data-good="">Welcome to Pro. Your receipt is on its way.</span>}
          </div>
        </div>
      </div>

      {devtools && (
        <aside className={a.devtools}>
          <div className={a.dtTabs}>
            <span className={a.hideS}>Elements</span>
            <span>Console</span>
            <span data-t="bug.netTab" data-on="">
              Network
            </span>
          </div>
          <div className={a.dtHead}>
            <span>Request</span>
            <span>Status</span>
            <span className={a.hideS}>Time</span>
          </div>
          {rows.map(([m, p, st, ms, key], i) => (
            <div key={i} className={a.dtRow} data-t={key ? 'bug.row' : undefined} data-bad={on(st === '422')} data-good={on(i === 4)} data-sel={on(!!key && inspected && !retest)}>
              <span>
                <i>{m}</i> {p}
              </span>
              <span>{st}</span>
              <span className={a.hideS}>{ms}</span>
            </div>
          ))}
          {inspected && !retest && (
            <div className={a.dtBody}>
              <span className={a.dtLabel}>Response · 422</span>
              <code>
                {'{ '}
                <i>&quot;error&quot;</i>: <b>&quot;coupon_not_valid_for_plan&quot;</b>,
                <br />
                &nbsp;&nbsp;<i>&quot;plan&quot;</i>: &quot;pro&quot;, <i>&quot;coupon&quot;</i>: &quot;LAUNCH20&quot;
                {' }'}
              </code>
            </div>
          )}
          {retest && (
            <div className={a.dtBody} data-good="">
              <span className={a.dtLabel}>Response · 200</span>
              <code>
                {'{ '}
                <i>&quot;plan&quot;</i>: <b>&quot;pro&quot;</b>, <i>&quot;discount&quot;</i>: 0.2 {' }'}
              </code>
            </div>
          )}
        </aside>
      )}
    </div>
  );
}

const CODE = [
  'export const COUPONS: Record<string, Coupon> = {',
  '  LAUNCH20: {',
  '    percentOff: 20,',
  "    expires: '2026-11-30',",
  "    eligiblePlans: ['starter'],",
  '  },',
  '  TEAM10: {',
  '    percentOff: 10,',
  "    eligiblePlans: ['team'],",
  '  },',
  '};',
];

function BugRepo({ ctx }: { ctx: Ctx }) {
  const fixed = ctx.at('fix');
  const tested = ctx.at('tests');
  const tests: [string, string][] = [
    ['Unit', '24 passed'],
    ['Integration', '6 passed'],
    ['Browser journey · upgrade with LAUNCH20', '1 passed'],
  ];
  return (
    <div className={a.app} data-app="repo">
      <div className={a.repoBar}>
        <b>lattice/web</b>
        <span className={a.branch} data-new={on(fixed)}>
          <svg viewBox="0 0 12 12" aria-hidden="true">
            <path d="M3 2v8M3 7c0-2 6-1 6-4M9 2v1" />
          </svg>
          {fixed ? 'fix/launch20-pro' : 'main'}
        </span>
        {tested && <span className={a.prChip}>PR #318 · Draft · awaiting your review</span>}
        <span className={a.access}>Access: this repository only</span>
      </div>
      <div className={a.repoBody}>
        <nav className={a.tree} aria-hidden="true">
          <span>src/</span>
          <span data-in="">billing/</span>
          <span data-in="2" data-on="">
            coupons.ts
          </span>
          <span data-in="2">checkout.ts</span>
          <span data-in="">routes/</span>
          <span>tests/</span>
          <span data-in="" data-new={on(fixed)}>
            coupons.test.ts
          </span>
        </nav>
        <div className={a.editor}>
          <div className={a.file}>src/billing/coupons.ts</div>
          <ol className={a.code}>
            {CODE.map((line, i) =>
              i === 4 ? (
                <li key={i} className={a.codePair}>
                  <span className={a.ln} data-t="bug.cause" data-del={on(fixed)} data-hot={on(ctx.at('cause') && !fixed)}>
                    <em>{i + 1}</em>
                    <code>{line}</code>
                  </span>
                  {fixed && (
                    <span className={a.ln} data-t="bug.fix" data-add="">
                      <em>{i + 1}</em>
                      <code>
                        {'    '}
                        {ctx.field('fix')}
                      </code>
                    </span>
                  )}
                </li>
              ) : (
                <li key={i} className={a.ln}>
                  <em>{i + 1}</em>
                  <code>{line}</code>
                </li>
              ),
            )}
          </ol>
          {fixed && <div className={a.testAdd}>+ coupons.test.ts · “LAUNCH20 upgrades Starter to Pro”</div>}
        </div>
        <section className={a.tests}>
          <div className={a.testsHead}>
            <b>Checks</b>
            <span className={a.btn} data-t="bug.runTests" data-ok={on(tested)}>
              {tested ? 'All passed' : 'Run tests'}
            </span>
          </div>
          {tests.map(([n, r], i) => (
            <div key={n} className={a.testRow} data-run={on(ctx.now('tests'))} style={{ ['--i' as string]: i }}>
              <Check ok={tested} />
              <span>{n}</span>
              <b>{tested ? r : ''}</b>
            </div>
          ))}
        </section>
      </div>
    </div>
  );
}

/* ============================================================================================ 2 · google ad */
const adsView = (ctx: Ctx) =>
  viewOf(ctx, [
    ['brief', 'open'],
    ['research', 'research'],
    ['campaign', 'campaign'],
  ]);

function AdsApp({ ctx }: { ctx: Ctx }) {
  const v = adsView(ctx);
  return v === 'brief' ? <AdsBrief ctx={ctx} /> : v === 'research' ? <AdsResearch ctx={ctx} /> : <AdsCampaign ctx={ctx} />;
}

function AdsBrief({ ctx }: { ctx: Ctx }) {
  const checked = ctx.at('landing');
  return (
    <div className={a.app} data-app="adsBrief">
      <section className={a.card} data-t="ads.brief" data-hot={on(ctx.now('brief'))}>
        <h4>Campaign brief</h4>
        {[
          ['Business', 'Northside Dental · 2 dentists'],
          ['Area', 'Northside, within a short drive'],
          ['Goal', 'More booked appointments'],
          ['Budget', 'Up to $800 a month'],
          ['Avoid', 'Cosmetic-only and “free” searches'],
        ].map(([k, val]) => (
          <div key={k} className={a.kv}>
            <span>{k}</span>
            <b>{val}</b>
          </div>
        ))}
      </section>
      <section className={a.landing} data-t="ads.landing" data-checked={on(checked)}>
        <div className={a.lpBar}>northsidedental.example/book</div>
        <div className={a.lpHero}>
          <b>Same-week appointments in Northside</b>
          <span>Check-ups, fillings and emergency visits.</span>
        </div>
        <div className={a.lpForm}>
          <span className={a.input}>
            <em>Name</em>
          </span>
          <span className={a.input}>
            <em>Preferred day</em>
          </span>
          <span className={a.btnPrimary}>Book a visit</span>
        </div>
        {checked && (
          <div className={a.lpChecks}>
            <span>
              <Check ok /> Form submits
            </span>
            <span>
              <Check ok /> Phone tap-to-call
            </span>
            <span>
              <Check ok /> 1.4 s on phones
            </span>
          </div>
        )}
      </section>
    </div>
  );
}

const KEYWORDS: { t?: string; kw: string; intent: string; vol: string; cpc: string; keep: boolean }[] = [
  { t: 'ads.kw1', kw: 'emergency dentist near me', intent: 'Book now', vol: '1.9k', cpc: '$4.10', keep: true },
  { kw: 'same week dentist appointment', intent: 'Book now', vol: '880', cpc: '$3.40', keep: true },
  { t: 'ads.kw3', kw: 'how to fix a chipped tooth at home', intent: 'Research', vol: '2.4k', cpc: '$0.90', keep: false },
  { kw: 'dentist northside', intent: 'Compare', vol: '720', cpc: '$3.80', keep: true },
  { kw: 'dental hygienist jobs', intent: 'Jobs', vol: '590', cpc: '$1.20', keep: false },
];

function AdsResearch({ ctx }: { ctx: Ctx }) {
  return (
    <div className={a.app} data-app="adsResearch">
      <div className={a.tableHead}>
        <b>Search terms · Northside, last 12 months</b>
        <span className={a.hideS}>Sample planner data</span>
      </div>
      <div className={a.table} role="presentation">
        <div className={a.tr} data-head="">
          <span>Search term</span>
          <span>Intent</span>
          <span className={a.hideS}>Monthly</span>
          <span className={a.hideS}>Cost/click</span>
          <span>Decision</span>
        </div>
        {KEYWORDS.map((k, i) => {
          const decided = i === 0 ? ctx.at('keep') : i === 2 ? ctx.at('exclude') : ctx.at('negatives');
          return (
            <div key={k.kw} className={a.tr} data-t={k.t} data-keep={on(decided && k.keep)} data-drop={on(decided && !k.keep)}>
              <span>{k.kw}</span>
              <span>
                <em className={a.intent} data-k={k.intent}>
                  {k.intent}
                </em>
              </span>
              <span className={a.hideS}>{k.vol}</span>
              <span className={a.hideS}>{k.cpc}</span>
              <span>{decided ? (k.keep ? 'Kept' : 'Excluded') : '—'}</span>
            </div>
          );
        })}
      </div>
      <div className={a.negRow}>
        <span>Negative keywords</span>
        <span className={a.chip}>jobs</span>
        <span className={a.chip}>at home</span>
        <span className={a.chip}>school</span>
        <span className={a.input} data-t="ads.negatives" data-focus={on(ctx.now('negatives'))}>
          {ctx.field('negatives', <em>Add a term</em>)}
        </span>
      </div>
    </div>
  );
}

function AdsCampaign({ ctx }: { ctx: Ctx }) {
  const r = ctx.at('radius');
  const h1 = ctx.at('headline');
  const h2 = ctx.at('headlines');
  const checks = ctx.at('checks');
  const sent = ctx.at('submit');
  const H1 = 'Same-Week Dental Visits';
  return (
    <div className={a.app} data-app="adsCampaign">
      <section className={a.mapCard}>
        <h4>Location</h4>
        <div className={a.map} aria-hidden="true">
          <i className={a.road} />
          <i className={a.road} data-v="" />
          <span className={a.radius} data-t="ads.radius" data-r={on(r)} data-drag={on(ctx.now('radius'))} />
          <span className={a.pinDot} />
        </div>
        <span className={a.mapNote}>{r ? '8 km around Northside Dental' : '20 km (default)'}</span>
        <div className={a.field}>
          <span>Daily budget</span>
          <span className={a.input} data-t="ads.budget" data-focus={on(ctx.now('budget'))}>
            $ {ctx.field('budget', <em>0</em>)} <small>/ day · ≈ $760 / month cap</small>
          </span>
        </div>
      </section>
      <section className={a.adCard}>
        <h4>Responsive search ad</h4>
        <div className={a.field}>
          <span>Headline 1</span>
          <span className={a.input} data-t="ads.h1" data-focus={on(ctx.now('headline'))}>
            {ctx.field('headline', <em>Headline</em>)}
            <small className={a.count}>{h1 ? `${H1.length}/30` : '0/30'}</small>
          </span>
        </div>
        <div className={a.field}>
          <span>Headlines 2–3 · description</span>
          <span className={a.input} data-t="ads.h2" data-filled={on(h2)}>
            {h2 ? 'Emergency Slots Today' : <em>Headline</em>}
            <small className={a.count}>{h2 ? '21/30' : '0/30'}</small>
          </span>
          <span className={a.input} data-filled={on(h2)}>
            {h2 ? 'Book Online in 2 Minutes' : <em>Headline</em>}
            <small className={a.count}>{h2 ? '24/30' : '0/30'}</small>
          </span>
        </div>
        <div className={a.serp} data-show={on(h1)}>
          <small>Sponsored · northsidedental.example</small>
          <b>
            {h1 ? H1 : 'Headline'}
            {h2 ? ' | Emergency Slots Today' : ''}
          </b>
          <span>Check-ups, fillings and emergency care. Same-week visits, 8 km from you.</span>
        </div>
      </section>
      <section className={a.checksCard} data-t="ads.checks" data-hot={on(ctx.now('checks'))}>
        <h4>Before anything runs</h4>
        {['Ad policy: healthcare wording', 'Landing page loads and books', 'Booking tracked as a conversion', 'Budget capped at $25/day'].map((c, i) => (
          <span key={c} className={a.checkRow} data-on={on(checks)} style={{ ['--i' as string]: i }}>
            <Check ok={checks} />
            {c}
          </span>
        ))}
        <span className={a.btnPrimary} data-t="ads.submit" data-wait={on(sent)}>
          {sent ? 'Waiting for your approval' : 'Send for approval'}
        </span>
        <small className={a.fine}>Not published. No money spent.</small>
      </section>
    </div>
  );
}

/* ====================================================================================== 3 · chrome extension */
const extView = (ctx: Ctx) =>
  viewOf(ctx, [
    ['project', 'open'],
    ['listing', 'listing'],
  ]);

function ExtApp({ ctx }: { ctx: Ctx }) {
  return extView(ctx) === 'listing' ? <ExtListing ctx={ctx} /> : <ExtProject ctx={ctx} />;
}

function ExtProject({ ctx }: { ctx: Ctx }) {
  const opened = ctx.at('manifest');
  const narrowed = ctx.at('narrow');
  const repaired = ctx.at('repair');
  const built = ctx.at('build');
  const building = ctx.now('build');
  const smoke = ctx.at('smoke');
  const retested = ctx.at('retest');
  const t3bad = smoke && !ctx.at('retest');
  return (
    <div className={a.app} data-app="ext">
      <nav className={a.tree} aria-hidden="true">
        <b>tabtidy/</b>
        <span data-t="ext.manifest" data-on={on(opened)}>
          manifest.json
        </span>
        <span>background.js</span>
        <span>popup.html</span>
        <span>icons/</span>
      </nav>
      <div className={a.editor}>
        <div className={a.file}>manifest.json</div>
        {opened ? (
          <div className={a.manifest}>
            {ctx.at('perms') && (
              <div className={a.advice}>
                <span>{narrowed ? 'Narrowed: history removed, site access limited' : 'TabTidy only needs tabs on the sites it tidies.'}</span>
                <span className={a.btn} data-t="ext.narrow" data-ok={on(narrowed)}>
                  {narrowed ? 'Applied' : 'Narrow permissions'}
                </span>
              </div>
            )}
            <div className={a.ln}>
              <code>
                &quot;name&quot;: &quot;TabTidy&quot;, &quot;version&quot;: <b>&quot;1.4.0&quot;</b>,
              </code>
            </div>
            <div className={a.permBlock} data-t="ext.perm" data-hot={on(ctx.at('perms') && !narrowed)}>
              <div className={a.ln}>
                <code>&quot;permissions&quot;: [&quot;tabs&quot;, &quot;storage&quot;,</code>
              </div>
              <div className={a.ln} data-del={on(narrowed)}>
                <code>&nbsp;&nbsp;&quot;history&quot;],</code>
              </div>
              <div className={a.ln}>
                <code>&quot;host_permissions&quot;: [</code>
              </div>
              <div className={a.ln} data-del={on(narrowed)}>
                <code>&nbsp;&nbsp;&quot;&lt;all_urls&gt;&quot;</code>
              </div>
              {narrowed && (
                <div className={a.ln} data-add="">
                  <code>&nbsp;&nbsp;&quot;https://mail.example/*&quot;</code>
                </div>
              )}
              {repaired && (
                <div className={a.ln} data-add="">
                  <code>&nbsp;&nbsp;&quot;https://docs.example/*&quot;</code>
                </div>
              )}
              <div className={a.ln}>
                <code>]</code>
              </div>
            </div>
          </div>
        ) : (
          <div className={a.empty}>Select a file</div>
        )}
      </div>
      <section className={a.tests}>
        <div className={a.testsHead}>
          <b>Build</b>
          <span className={a.btn} data-t="ext.build" data-busy={on(building)} data-ok={on(built && !building)}>
            {building ? 'Building…' : built ? 'Built 1.4.0' : 'Build 1.4.0'}
          </span>
        </div>
        {built && !building && (
          <div className={a.log}>
            <span>✓ Manifest V3 valid</span>
            <span>✓ 9 files · 412 KB</span>
          </div>
        )}
        <div className={a.testsHead}>
          <b>Smoke tests</b>
          <span className={a.btn} data-t="ext.run" data-ok={on(retested)} data-bad={on(t3bad)}>
            {retested ? '3 of 3 pass' : t3bad ? '2 of 3 pass' : 'Run tests'}
          </span>
        </div>
        {[
          ['ext.t1', 'Groups tabs by site'],
          ['ext.t2', 'Saves and restores a session'],
          ['ext.t3', 'Tidies docs.example tabs'],
        ].map(([id, n], i) => (
          <div key={`${id}-${retested}`} className={a.testRow} data-t={id} data-run={on(ctx.now('smoke') || ctx.now('retest'))} style={{ ['--i' as string]: i }}>
            <Check ok={smoke && (i < 2 || retested)} bad={i === 2 && t3bad} />
            <span>{n}</span>
          </div>
        ))}
        {t3bad && (
          <span className={a.btn} data-t="ext.repair" data-ok={on(repaired)}>
            {repaired ? 'docs.example allowed' : 'Allow docs.example only'}
          </span>
        )}
      </section>
    </div>
  );
}

function ExtListing({ ctx }: { ctx: Ctx }) {
  const checked = ctx.at('assets');
  const sent = ctx.at('submit');
  return (
    <div className={a.app} data-app="listing">
      <section className={a.listing}>
        <div className={a.lsHead}>
          <span className={a.extIcon} aria-hidden="true" />
          <div>
            <b>TabTidy</b>
            <span>Groups and saves your tabs · 1.4.0 · 412 KB</span>
          </div>
        </div>
        <div className={a.shots} aria-hidden="true">
          <i />
          <i />
          <i />
        </div>
        <p className={a.desc}>Tidy dozens of tabs into groups by site, save a session, and bring it back later.</p>
        <div className={a.kv}>
          <span>Site access</span>
          <b>mail.example, docs.example</b>
        </div>
        <div className={a.kv}>
          <span>Data use</span>
          <b>Tab titles stay on this device</b>
        </div>
      </section>
      <section className={a.checksCard} data-t="ext.checklist" data-hot={on(ctx.now('assets'))}>
        <h4>Submission checklist</h4>
        {['Icon 128 × 128', '3 screenshots, 1280 × 800', 'Description and single purpose', 'Privacy practices answered', 'Permissions justified'].map((c, i) => (
          <span key={c} className={a.checkRow} data-on={on(checked)} style={{ ['--i' as string]: i }}>
            <Check ok={checked} />
            {c}
          </span>
        ))}
        <span className={a.btnPrimary} data-t="ext.submit" data-wait={on(sent)}>
          {sent ? 'Waiting for your approval' : 'Submit for review'}
        </span>
        <small className={a.fine}>Store review is decided by Google after you submit.</small>
      </section>
    </div>
  );
}

/* =================================================================================== 4 · clients & outreach */
const outView = (ctx: Ctx) =>
  viewOf(ctx, [
    ['brief', 'open'],
    ['site1', 'visit1'],
    ['site2', 'visit2'],
    ['crm', 'crm'],
    ['mail', 'drafts'],
  ]);

const PROSPECTS: { name: string; site: string; why: string; fit: 'fit' | 'no' | 'held' }[] = [
  { name: 'Harbor Smiles', site: 'harborsmiles.example', why: 'Phone-only booking · 14 staff', fit: 'fit' },
  { name: 'Brightway Clinic', site: 'brightway.example', why: 'Already books online', fit: 'no' },
  { name: 'Northside Family Dental', site: 'nfdental.example', why: 'Booking form emails staff · 9 staff', fit: 'fit' },
  { name: 'Cedar Kids Dentistry', site: 'cedarkids.example', why: 'Phone-only · new second location', fit: 'fit' },
  { name: 'Lakeview Ortho', site: 'lakeviewortho.example', why: 'Unclear: booking page offline', fit: 'held' },
];

function OutApp({ ctx }: { ctx: Ctx }) {
  const v = outView(ctx);
  if (v === 'site1') return <OutSite ctx={ctx} which={1} />;
  if (v === 'site2') return <OutSite ctx={ctx} which={2} />;
  if (v === 'crm') return <OutCrm />;
  if (v === 'mail') return <OutMail ctx={ctx} />;
  return <OutBrief ctx={ctx} />;
}

function OutBrief({ ctx }: { ctx: Ctx }) {
  const found = ctx.at('search') && !ctx.now('search');
  return (
    <div className={a.app} data-app="outBrief">
      <section className={a.card} data-t="out.brief" data-hot={on(ctx.now('brief'))}>
        <h4>Who to look for</h4>
        {[
          ['You sell', 'Online booking & intake software'],
          ['Ideal client', 'Clinics with 5–50 staff that book by phone'],
          ['Sources', 'Public business sites and listings only'],
          ['Rules', 'No personal data scraped · opt-out in every email'],
        ].map(([k, val]) => (
          <div key={k} className={a.kv}>
            <span>{k}</span>
            <b>{val}</b>
          </div>
        ))}
      </section>
      <section className={a.results}>
        <span className={a.input} data-t="out.search" data-focus={on(ctx.now('search'))}>
          <svg viewBox="0 0 12 12" aria-hidden="true">
            <circle cx="5" cy="5" r="3.4" />
            <path d="M7.6 7.6 10.5 10.5" />
          </svg>
          {ctx.field('search', <em>Search business listings</em>)}
        </span>
        {found &&
          PROSPECTS.map((p, i) => (
            <div key={p.name} className={a.result} data-t={i === 0 ? 'out.r1' : undefined} style={{ ['--i' as string]: i }}>
              <b>{p.name}</b>
              <span>{p.site}</span>
            </div>
          ))}
      </section>
    </div>
  );
}

function OutSite({ ctx, which }: { ctx: Ctx; which: 1 | 2 }) {
  const one = which === 1;
  const shown = one ? ctx.at('qualify') : ctx.at('reject');
  return (
    <div className={a.app} data-app="site" data-which={which}>
      <div className={a.site}>
        <header className={a.siteNav}>
          <b>{one ? 'Harbor Smiles' : 'Brightway Clinic'}</b>
          <span className={a.hideS}>Services</span>
          <span className={a.hideS}>Team</span>
          <span className={a.siteCta} data-online={on(!one)}>
            {one ? 'Call (555) 014-2290' : 'Book online'}
          </span>
        </header>
        <div className={a.siteHero}>
          <b>{one ? 'Gentle family dentistry by the harbour' : 'Book your visit in under a minute'}</b>
          <span>{one ? 'New patients welcome. To book, call us Mon–Fri, 8 am to 5 pm.' : 'Live calendar, reminders and online forms for every patient.'}</span>
        </div>
        <div className={a.siteTeam}>
          {Array.from({ length: one ? 7 : 5 }, (_, i) => (
            <i key={i} aria-hidden="true" />
          ))}
          <span>{one ? 'Our team of 14' : 'Our team'}</span>
        </div>
      </div>
      <aside className={a.signals} data-t={one ? 'out.sig1' : 'out.sig2'} data-show={on(shown)} data-fit={one ? 'fit' : 'no'}>
        <h4>Xroga’s notes</h4>
        {one ? (
          <>
            <span>
              <Check ok={shown} /> Books by phone only
            </span>
            <span>
              <Check ok={shown} /> 14 staff, one location
            </span>
            <span>
              <Check ok={shown} /> Public contact: front desk
            </span>
            <small>Source: harborsmiles.example/contact</small>
          </>
        ) : (
          <>
            <span>
              <Check bad={shown} /> Already books online
            </span>
            <span>
              <Check ok={shown} /> 22 staff
            </span>
            <small>Source: brightway.example · skipped</small>
          </>
        )}
      </aside>
    </div>
  );
}

function OutCrm() {
  return (
    <div className={a.app} data-app="crm">
      <div className={a.tableHead}>
        <b>Prospects · Clinic booking software</b>
        <span className={a.hideS}>5 reviewed · 3 qualified</span>
      </div>
      <div className={a.table}>
        <div className={a.tr} data-head="" data-crm="">
          <span>Business</span>
          <span>Status</span>
          <span className={a.hideS}>Why</span>
          <span className={a.hideS}>Source</span>
        </div>
        {PROSPECTS.map((p, i) => (
          <div key={p.name} className={a.tr} data-crm="" data-new="" style={{ ['--i' as string]: i }}>
            <span>{p.name}</span>
            <span>
              <em className={a.status} data-k={p.fit}>
                {p.fit === 'fit' ? 'Qualified' : p.fit === 'no' ? 'Not a fit' : 'Held'}
              </em>
            </span>
            <span className={a.hideS}>{p.why}</span>
            <span className={a.hideS}>{p.site}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function OutMail({ ctx }: { ctx: Ctx }) {
  const open = ctx.at('draft1');
  const queued = ctx.at('queue');
  return (
    <div className={a.app} data-app="mail">
      <div className={a.mailBanner}>No mailbox is connected in this example. Drafts stay here until you review them.</div>
      <div className={a.mail}>
        <nav className={a.drafts}>
          <b>Drafts · 3</b>
          {PROSPECTS.filter((p) => p.fit === 'fit').map((p, i) => (
            <span key={p.name} data-t={i === 0 ? 'out.d1' : undefined} data-on={on(open && i === 0)} data-q={on(queued)}>
              <b>{p.name}</b>
              <small>{i === 0 ? 'Phone bookings after 5 pm' : i === 1 ? 'Your booking form' : 'Booking for the new location'}</small>
            </span>
          ))}
        </nav>
        <article className={a.draft} data-show={on(open)}>
          {open ? (
            <>
              <div className={a.kv}>
                <span>To</span>
                <b>Front desk · harborsmiles.example</b>
              </div>
              <div className={a.kv}>
                <span>Subject</span>
                <b>Phone bookings after 5 pm</b>
              </div>
              <p>
                Hi Harbor Smiles team, your site asks new patients to call Mon–Fri, 8 am to 5 pm. Clinics your size often miss
                evening requests. We help practices take bookings online without changing how the front desk works.
              </p>
              <p>Would a 15-minute look be useful? If not, just reply “no thanks” and I won’t follow up.</p>
            </>
          ) : (
            <span className={a.empty}>Choose a draft</span>
          )}
          <span className={a.btnPrimary} data-t="out.queue" data-wait={on(queued)}>
            {queued ? '3 drafts waiting for your review' : 'Queue all 3 for review'}
          </span>
        </article>
      </div>
    </div>
  );
}

/* ================================================================================================ registry */
const tab = (label: string, favicon: string, active: boolean, t?: string, fresh?: boolean): BrowserTab => ({ label, favicon, active, t, fresh });

export const MISSION_APPS: Record<MissionId, MissionApp> = {
  bug: {
    App: BugApp,
    tabs: (ctx) => {
      const v = bugView(ctx);
      return [tab('Lattice · Pricing', '#6d83ff', v === 'store', 'bug.storeTab'), tab('lattice/web · coupons.ts', '#c9d1de', v === 'repo', 'bug.repoTab')];
    },
    url: (ctx) =>
      bugView(ctx) === 'repo'
        ? `code.example/lattice/web/blob/${ctx.at('fix') ? 'fix/launch20-pro' : 'main'}/src/billing/coupons.ts`
        : ctx.at('upgrade')
          ? 'lattice.example/checkout?plan=pro'
          : 'lattice.example/pricing',
  },
  ads: {
    App: AdsApp,
    tabs: (ctx) => {
      const v = adsView(ctx);
      return [tab('Campaign brief', '#f2b84b', v === 'brief'), tab('Keyword research', '#4fb37a', v === 'research', 'ads.researchTab'), tab('New campaign', '#4589ff', v === 'campaign', 'ads.campaignTab')];
    },
    url: (ctx) => ({ brief: 'ads.example/northside-dental/brief', research: 'ads.example/keywords?area=northside', campaign: 'ads.example/campaigns/new' })[adsView(ctx)],
  },
  extension: {
    App: ExtApp,
    tabs: (ctx) => {
      const v = extView(ctx);
      return [tab('tabtidy · project', '#9b7bff', v === 'project'), tab('Web Store dashboard', '#3fd6c6', v === 'listing', 'ext.listingTab')];
    },
    url: (ctx) => (extView(ctx) === 'listing' ? 'webstore.example/devconsole/tabtidy' : 'code.example/you/tabtidy'),
  },
  outreach: {
    App: OutApp,
    tabs: (ctx) => {
      const v = outView(ctx);
      return [
        tab('Listings search', '#8f98a9', v === 'brief'),
        ...(ctx.at('visit1') ? [tab('Harbor Smiles', '#4fb37a', v === 'site1', undefined, ctx.now('visit1'))] : []),
        ...(ctx.at('qualify') ? [tab('Brightway Clinic', '#ff7d5c', v === 'site2', 'out.r2tab', ctx.now('qualify'))] : []),
        tab('CRM', '#f06aa8', v === 'crm', 'out.crmTab'),
        tab('Drafts', '#4589ff', v === 'mail', 'out.mailTab'),
      ];
    },
    url: (ctx) =>
      ({
        brief: 'listings.example/search',
        site1: 'harborsmiles.example',
        site2: 'brightway.example',
        crm: 'crm.example/prospects',
        mail: 'mail.example/drafts',
      })[outView(ctx)],
  },
};
