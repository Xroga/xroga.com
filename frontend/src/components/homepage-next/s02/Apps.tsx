'use client';

/**
 * The ten app surfaces inside the S02 work theater: four websites Xroga operates (browser missions) and six
 * professional workspaces (AI Employees). Each one is a different kind of software with its own palette and layout,
 * so no two scenes read as the same template. Every visible change is caused by a step that has been reached; the
 * pointer acts on the `data-t` targets named in script.ts.
 */
import { Typed } from './motion';
import { stepsOf, type Step, type TrackId } from './script';
import a from './Apps.module.css';

export interface Ctx {
  track: TrackId;
  cur: Step;
  running: boolean;
  reduced: boolean;
  /** This step has happened (or is happening). */
  reached: (stepId: string) => boolean;
  isNow: (stepId: string) => boolean;
}

export function AppView({ ctx }: { ctx: Ctx }) {
  switch (ctx.track) {
    case 'browser:bug': return <BugApp ctx={ctx} />;
    case 'browser:ads': return <AdsApp ctx={ctx} />;
    case 'browser:article': return <ArticleApp ctx={ctx} />;
    case 'browser:extension': return <ExtensionApp ctx={ctx} />;
    case 'emp:engineer': return <EngineerApp ctx={ctx} />;
    case 'emp:research': return <ResearchApp ctx={ctx} />;
    case 'emp:acquisition': return <AcquisitionApp ctx={ctx} />;
    case 'emp:creative': return <CreativeApp ctx={ctx} />;
    case 'emp:data': return <DataApp ctx={ctx} />;
    case 'emp:ops': return <OpsApp ctx={ctx} />;
  }
}

/** Typed text for a step: a placeholder before it, characters during it, the full text after it. */
function useField(ctx: Ctx) {
  const steps = stepsOf(ctx.track);
  return function field(stepId: string, placeholder = '') {
    const st = steps.find((x) => x.stepId === stepId)!;
    const now = ctx.isNow(stepId);
    const done = ctx.reached(stepId) && !now;
    if (!now && !done) return <span className={a.ph}>{placeholder}</span>;
    return <Typed text={st.typed!} active={now} done={done} running={ctx.running} reduced={ctx.reduced} ms={st.ms} />;
  };
}
const hot = (ctx: Ctx, ...ids: string[]) => (ids.some((id) => ctx.isNow(id)) ? { 'data-hot': '' } : {});

/* ------------------------------------------------------------------------------------------- 1 website bug */

function BugApp({ ctx }: { ctx: Ctx }) {
  const { reached: r } = ctx;
  const f = useField(ctx);
  const sc = ctx.cur.screen;
  const onTeam = sc !== 'home';
  return (
    <div className={`${a.app} ${a.nw}`}>
      <aside className={a.nwSide}>
        <span className={a.nwLogo}><i />Northwind</span>
        {['Dashboard', 'Projects', 'Billing'].map((n, i) => (
          <span key={n} className={a.nwNav} data-on={(!onTeam && i === 0) || undefined}>{n}</span>
        ))}
        <span className={a.nwNav} data-t="nav.team" data-on={onTeam || undefined} {...hot(ctx, 'team')}>Team</span>
        <span className={a.nwNav}>Settings</span>
      </aside>
      <main className={a.nwMain}>
        {!onTeam ? (
          <>
            <h4 className={a.nwH}>Good morning, Alex</h4>
            <div className={a.nwCards}>
              {[['Active projects', '12'], ['Open tasks', '38'], ['Team members', '4']].map(([k, v]) => (
                <span key={k} className={a.nwCard}><small>{k}</small><b>{v}</b></span>
              ))}
            </div>
            <span className={a.nwChart} aria-hidden="true">
              <svg viewBox="0 0 300 80" preserveAspectRatio="none"><path d="M0 64 C40 58 60 30 100 36 S160 60 200 30 S260 14 300 18" /></svg>
            </span>
          </>
        ) : (
          <>
            <div className={a.nwRow}>
              <h4 className={a.nwH}>Team</h4>
              <span className={a.nwBtn} data-t="team.invite" {...hot(ctx, 'invite')}>+ Invite member</span>
            </div>
            <div className={a.nwTable}>
              {[['Alex Kim', 'Owner'], ['Priya Shah', 'Admin'], ['Jon Bell', 'Editor'], ['Mei Ito', 'Viewer']].map(([n, ro]) => (
                <span key={n} className={a.nwTr}><b>{n}</b><span>{ro}</span><small>Active</small></span>
              ))}
            </div>
          </>
        )}
        {(sc === 'invite' || sc === 'error') && (
          <div className={a.nwModal}>
            <b className={a.nwMh}>Invite a teammate</b>
            <label className={a.nwLabel}>Email</label>
            <span className={a.nwInput} data-t="inv.email" {...hot(ctx, 'email')}>{f('email', 'name@company.com')}</span>
            <label className={a.nwLabel}>Role</label>
            <span className={a.nwSeg} data-t="inv.role" {...hot(ctx, 'role')}>
              <i>Owner</i>
              <i data-on={r('role') || undefined}>Editor</i>
              <i>Viewer</i>
            </span>
            <span className={a.nwSend} data-t="inv.send" data-fail={sc === 'error' || undefined} {...hot(ctx, 'send', 'fail')}>
              {sc === 'error' ? 'Could not send invite' : 'Send invite'}
            </span>
          </div>
        )}
        {sc === 'error' && (
          <div className={a.dev}>
            <span className={a.devTabs}><i>Elements</i><i>Console</i><i data-on="">Network</i></span>
            <span className={a.devRow}><b>GET</b>/api/team<em data-ok="">200</em></span>
            <span className={a.devRow} data-t="dev.request" data-bad="" {...hot(ctx, 'network')}><b>POST</b>/api/invites<em>403</em></span>
            <span className={a.devRow}><b>GET</b>/api/me<em data-ok="">200</em></span>
            {r('network') && <code className={a.devBody}>{'{ "error": "role_not_permitted", "role": "editor" }'}</code>}
          </div>
        )}
      </main>
    </div>
  );
}

/* ------------------------------------------------------------------------------------------- 2 Google Ad */

function AdsApp({ ctx }: { ctx: Ctx }) {
  const { reached: r } = ctx;
  const f = useField(ctx);
  if (ctx.cur.screen === 'landing')
    return (
      <div className={`${a.app} ${a.lp}`}>
        <header className={a.lpNav}><b>Riverside Physio</b><span>Services</span><span>Team</span><span>Prices</span><i>Book a visit</i></header>
        <div className={a.lpHero}>
          <span className={a.lpKicker}>Riverside · since 2011</span>
          <h4>Get back to the sport you love.</h4>
          <p>Physiotherapy for runners, rowers and weekend players. Same week appointments.</p>
        </div>
        <div className={a.lpServices} data-t="lp.services" {...hot(ctx, 'landing')}>
          {[['Sports injury physio', 'Most booked'], ['Post surgery rehab', ''], ['Running assessment', '']].map(([n, tag]) => (
            <span key={n} className={a.lpSvc}><b>{n}</b>{tag && <small>{tag}</small>}</span>
          ))}
        </div>
      </div>
    );
  return (
    <div className={`${a.app} ${a.ads}`}>
      <div className={a.adsForm}>
        <span className={a.adsH}>New search campaign</span>
        <span className={a.adsLabel}>Goal</span>
        <span className={a.adsGoals} data-t="ad.goal" {...hot(ctx, 'goal')}>
          <i data-on={r('goal') || undefined}>Bookings</i><i>Calls</i><i>Visits</i>
        </span>
        <span className={a.adsLabel}>Location</span>
        <span className={a.adsInput} data-t="ad.location" {...hot(ctx, 'location')}>{f('location', 'Add a location')}</span>
        <span className={a.adsLabel}>Headline</span>
        <span className={a.adsInput} data-t="ad.headline" {...hot(ctx, 'headline')}>{f('headline', 'Up to 30 characters')}</span>
        <span className={a.adsLabel}>Final URL</span>
        <span className={a.adsInput} data-t="ad.url" data-fixed={r('url') || undefined} {...hot(ctx, 'url')}>
          {r('url') ? <><s>/book</s> riverside-physio.example/appointments</> : 'riverside-physio.example/book'}
        </span>
        <span className={a.adsLabel}>Daily budget</span>
        <span className={a.adsInput} data-t="ad.budget" data-short="" {...hot(ctx, 'budget')}>$ {f('budget', '0')}</span>
      </div>
      <div className={a.adsSide}>
        <span className={a.adsLabel}>Preview</span>
        <div className={a.serp}>
          <small>Sponsored</small>
          <span className={a.serpUrl}>riverside-physio.example{r('url') ? '/appointments' : '/book'}</span>
          <b className={a.serpTitle}>{r('headline') ? 'Sports injury physio, same week' : 'Your headline'} | Riverside Physio</b>
          <span className={a.serpDesc}>Physiotherapy for runners, rowers and weekend players. Book online in two minutes.</span>
        </div>
        <span className={a.adsEst}>
          <small>Estimated</small>
          <b>{r('budget') ? '18 to 31 clicks a day' : 'Add a budget to estimate'}</b>
        </span>
        <span className={a.locked}><i />Publish · needs your approval</span>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------------------------------- 3 article */

function ArticleApp({ ctx }: { ctx: Ctx }) {
  const { reached: r } = ctx;
  const f = useField(ctx);
  return (
    <div className={`${a.app} ${a.cms}`}>
      <aside className={a.cmsTools}>
        {['¶', 'H2', '❝', '▦', '⎘'].map((k) => <i key={k}>{k}</i>)}
      </aside>
      <article className={a.cmsDoc}>
        <small className={a.cmsMeta}>Draft · Blog · edited just now</small>
        <h4 className={a.cmsTitle}>5 stretches after a hamstring strain</h4>
        <span className={a.cmsP}>Most hamstring strains heal well when you load them early and gently.</span>
        <span className={a.cmsBlock} data-t="cms.h2" data-h2={r('heading') || undefined} {...hot(ctx, 'heading')}>Why gentle loading matters</span>
        <span className={a.cmsImg}>
          <span className={a.cmsPic} aria-hidden="true"><i /><i /></span>
          <span className={a.cmsAlt} data-t="cms.alt" {...hot(ctx, 'alt')}><small>Alt text</small>{f('alt', 'Describe this image')}</span>
        </span>
        <span className={a.cmsP}>
          Ready to start? <u className={a.cmsLink} data-t="cms.link" data-fixed={r('link') || undefined} {...hot(ctx, 'link')}>Book an assessment</u> with our team.
        </span>
      </article>
      <aside className={a.cmsSide}>
        <span className={a.cmsToggle} data-t="cms.phone" {...hot(ctx, 'phone')}><i data-on={!r('phone') || undefined}>Desktop</i><i data-on={r('phone') || undefined}>Phone</i></span>
        <span className={a.phone} data-on={r('phone') || undefined}>
          <b>5 stretches after a hamstring strain</b>
          <i className={a.phoneImg} />
          <em>Why gentle loading matters</em>
          <span className={a.phoneLines}><i /><i /><i /></span>
        </span>
        <span className={a.locked}><i />Publish · needs your approval</span>
      </aside>
    </div>
  );
}

/* ------------------------------------------------------------------------------------------- 4 extension */

function ExtensionApp({ ctx }: { ctx: Ctx }) {
  const { reached: r } = ctx;
  const f = useField(ctx);
  if (ctx.cur.screen === 'store')
    return (
      <div className={`${a.app} ${a.store}`}>
        <aside className={a.storeNav}>
          <b>Tab Tidy</b>
          {['Package', 'Store listing', 'Privacy', 'Distribution'].map((n) => <span key={n} data-on={n === 'Privacy' || undefined}>{n}</span>)}
        </aside>
        <main className={a.storeMain}>
          <span className={a.storeRow}><small>Version</small><b>1.4.0 · validated</b></span>
          <span className={a.storeRow}><small>Summary</small><b>Group, sort and close tabs in one click.</b></span>
          <span className={a.storeShots}><i /><i /><i /></span>
          <span className={a.storeRow}><small>Single purpose</small><b>Organise the tabs in the current window</b></span>
          <span className={a.storeRow}><small>Permission used</small><b>activeTab: reads the current tab when you click the icon</b></span>
          <span className={a.storePriv} data-t="st.privacy" {...hot(ctx, 'privacy')}><small>Data usage</small>{f('privacy', 'Answer the data usage questions')}</span>
          <span className={a.locked}><i />Submit for review · waits for you</span>
        </main>
      </div>
    );
  return (
    <div className={`${a.app} ${a.ext}`}>
      <aside className={a.tree}>
        <small>TAB-TIDY</small>
        <span data-t="ext.manifest" data-on="" {...hot(ctx, 'open')}>manifest.json</span>
        <span>popup.html</span>
        <span>popup.js</span>
        <span>background.js</span>
        <span>icons/</span>
      </aside>
      <pre className={a.code}>
        <span><em>1</em>{'{'}</span>
        <span><em>2</em>  &quot;manifest_version&quot;: 3,</span>
        <span><em>3</em>  &quot;name&quot;: &quot;Tab Tidy&quot;,</span>
        <span><em>4</em>  &quot;version&quot;: &quot;1.4.0&quot;,</span>
        <span className={a.permLine} data-t="ext.perm" data-old={r('fix') || undefined} {...hot(ctx, 'perm', 'fix')}><em>5</em>  &quot;permissions&quot;: [&quot;tabs&quot;, &quot;&lt;all_urls&gt;&quot;],</span>
        {r('fix') && <span className={a.addLine}><em>5</em>  &quot;permissions&quot;: [&quot;tabs&quot;, {f('fix')}],</span>}
        <span><em>6</em>  &quot;action&quot;: {'{'} &quot;default_popup&quot;: &quot;popup.html&quot; {'}'}</span>
        <span><em>7</em>{'}'}</span>
      </pre>
      <aside className={a.extSide}>
        <span className={a.buildBtn} data-t="ext.build" data-ok={r('build') || undefined} {...hot(ctx, 'build')}>{r('build') ? '✓ Build passed' : 'Build and validate'}</span>
        <span className={a.term}>
          <i>$ npm run build</i>
          {r('build') && <><i>✓ manifest v3 schema</i><i>✓ icons 16 32 48 128</i><i>✓ tab-tidy-1.4.0.zip</i></>}
        </span>
        <span className={a.popup} data-t="ext.popup" data-on={r('popup') || undefined} {...hot(ctx, 'popup')}>
          <b>Tab Tidy</b>
          <small>23 tabs in this window</small>
          <i>Group by site</i>
          <i>Close duplicates (4)</i>
        </span>
      </aside>
    </div>
  );
}

/* ------------------------------------------------------------------------------------------- employees */

function EngineerApp({ ctx }: { ctx: Ctx }) {
  const { reached: r } = ctx;
  const f = useField(ctx);
  return (
    <div className={`${a.app} ${a.ide}`}>
      <aside className={a.tree} data-dark="">
        <small>NORTHWIND</small>
        <span>src/</span>
        <span>  api/</span>
        <span data-t="eng.file" data-on={r('open') || undefined} {...hot(ctx, 'open')}>    invites.ts</span>
        <span>    team.ts</span>
        <span>  lib/roles.ts</span>
        <span>tests/invites.test.ts</span>
      </aside>
      <div className={a.ideMain}>
        <span className={a.ideTab}>{r('open') ? 'invites.ts' : 'Welcome'}<i>{r('edit') ? '● modified' : ''}</i></span>
        {r('open') ? (
          <pre className={a.code} data-ide="">
            <span><em>14</em>export async function invite(user, email, role) {'{'}</span>
            <span className={a.permLine} data-old={r('edit') || undefined}><em>15</em>  if (user.role !== &quot;owner&quot;) return forbidden()</span>
            {r('edit') && <span className={a.addLine} data-t="eng.line" {...hot(ctx, 'edit')}><em>15</em>  {f('edit')}</span>}
            {!r('edit') && <span data-t="eng.line" />}
            <span><em>16</em>  const seat = await seats.reserve(user.org)</span>
            <span><em>17</em>  return sendInvite(email, role, seat)</span>
            <span><em>18</em>{'}'}</span>
          </pre>
        ) : (
          <span className={a.ideEmpty}>Open a file to start</span>
        )}
        <div className={a.ideBottom}>
          <span className={a.runBtn} data-t="eng.run" {...hot(ctx, 'test')}>▶ Run tests</span>
          <span className={a.term} data-row="">
            {r('test') ? <><i>✓ owner can invite</i><i>✓ admin can invite editor</i><i>✓ viewer cannot invite</i></> : <i>No test run yet</i>}
          </span>
        </div>
      </div>
      <aside className={a.preview} data-t="eng.preview" data-on={r('preview') || undefined} {...hot(ctx, 'preview')}>
        <small>Preview · localhost</small>
        <b>Invite a teammate</b>
        <span>sam.lee@example.com · Editor</span>
        <em>{r('preview') ? '✓ Invite created' : 'Waiting for a build'}</em>
      </aside>
    </div>
  );
}

function ResearchApp({ ctx }: { ctx: Ctx }) {
  const { reached: r } = ctx;
  const rows = [['Harbor district', 'High', '2', '$$'], ['Old Town', 'Medium', '4', '$$$'], ['Westfield', 'Medium', '3', '$']];
  return (
    <div className={`${a.app} ${a.rs}`}>
      <aside className={a.rsSrc} data-t="rs.src" {...hot(ctx, 'sources')}>
        <small>Sources</small>
        {[['City census 2025', 'gov'], ['Clinic listings map', 'maps'], ['Sports club registry', 'org']].map(([n, k]) => (
          <span key={n} className={a.rsDoc} data-on={r('sources') || undefined}><i>{k}</i>{n}</span>
        ))}
        <span className={a.rsDoc} data-t="rs.weak" data-weak={r('conflict') || undefined} {...hot(ctx, 'conflict')}><i>dir</i>Local business directory 2019</span>
      </aside>
      <div className={a.rsGrid} data-t="rs.grid" data-on={r('compare') || undefined} {...hot(ctx, 'compare')}>
        <span className={a.rsHead}><b>Market</b><b>Demand</b><b>Competitors</b><b>Rent</b><b>Rank</b></span>
        {rows.map((row, i) => (
          <span key={row[0]} className={a.rsRow} data-top={(r('rank') && i === 0) || undefined} {...(i === 0 ? { 'data-t': 'rs.top' } : {})} {...(i === 0 ? hot(ctx, 'rank') : {})}>
            <b>{row[0]}</b>
            {row.slice(1).map((c, k) => <span key={k}>{r('compare') ? c : '·'}</span>)}
            <em>{r('rank') ? i + 1 : ''}</em>
          </span>
        ))}
        <span className={a.rsBars} aria-hidden="true">
          {[82, 54, 47].map((w, i) => <i key={i} style={{ width: r('compare') ? `${w}%` : '6%' }} />)}
        </span>
      </div>
    </div>
  );
}

function AcquisitionApp({ ctx }: { ctx: Ctx }) {
  const { reached: r } = ctx;
  const f = useField(ctx);
  const inReview = r('review');
  return (
    <div className={`${a.app} ${a.board}`}>
      <div className={a.cols}>
        <span className={a.col}>
          <small>Found · 4</small>
          <span className={a.lead} data-t="acq.lead" data-on={r('open') || undefined} data-gone={inReview || undefined} {...hot(ctx, 'open')}>
            <b>Harbor Rowing Club</b><em>Harbor district · 140 members</em>{r('open') && <i>Fit: trains 6 days a week</i>}
          </span>
          <span className={a.lead} data-t="acq.reject" data-rejected={r('reject') || undefined} {...hot(ctx, 'reject')}>
            <b>Metro Hospital Group</b><em>Citywide · in-house physio</em>
          </span>
          <span className={a.lead}><b>Westfield CrossFit</b><em>Westfield · 90 members</em></span>
        </span>
        <span className={a.col}>
          <small>Qualified · 2</small>
          <span className={a.lead}><b>Old Town Tennis</b><em>Old Town · 210 members</em></span>
          <span className={a.lead}><b>Harbor Runners</b><em>Harbor district · weekly races</em></span>
        </span>
        <span className={a.col} data-t="acq.col" data-on={inReview || undefined} {...hot(ctx, 'review')}>
          <small>Review · {inReview ? 1 : 0}</small>
          {inReview && <span className={a.lead} data-on=""><b>Harbor Rowing Club</b><em>Outreach draft attached</em></span>}
        </span>
      </div>
      <div className={a.draft} data-t="acq.draft" {...hot(ctx, 'draft')}>
        <small>Draft to Dana Reyes, Harbor Rowing</small>
        <span>{f('draft', 'A personal note appears here')}</span>
        <span className={a.locked}><i />Nothing sent · waits for you</span>
      </div>
    </div>
  );
}

function CreativeApp({ ctx }: { ctx: Ctx }) {
  const { reached: r } = ctx;
  const f = useField(ctx);
  const b = r('direction');
  return (
    <div className={`${a.app} ${a.cr}`}>
      <div className={a.crTop}>
        <span className={a.crDir}><i data-on={!b || undefined}>A · Clinical</i><i data-t="cr.dirB" data-on={b || undefined} {...hot(ctx, 'direction')}>B · Energetic</i></span>
      </div>
      <div className={a.crFrames} data-t="cr.frames" data-on={r('frames') || undefined} data-b={b || undefined} {...hot(ctx, 'frames')}>
        {['Injury', 'Rehab', 'Back on court'].map((n, i) => (
          <span key={n} className={a.frame} style={{ '--i': i } as React.CSSProperties}>
            <i className={a.frameArt} />
            <small>{i + 1} · {n}</small>
          </span>
        ))}
      </div>
      <aside className={a.crSide}>
        <span className={a.crPhone} data-t="cr.phone" data-b={b || undefined} {...hot(ctx, 'crop')}>
          <i className={a.safe} data-on={r('crop') || undefined} />
          <b>Back on the court, sooner.</b>
        </span>
        <span className={a.crCap} data-t="cr.caption" {...hot(ctx, 'caption')}><small>Caption</small>{f('caption', 'Write a caption')}</span>
      </aside>
    </div>
  );
}

function DataApp({ ctx }: { ctx: Ctx }) {
  const { reached: r } = ctx;
  const rows = [['INV-2209', '$860', '$860'], ['INV-2211', '$2,100', '$2,100'], ['INV-2214', '$1,420', '$1,240'], ['INV-2216', '$540', '$540'], ['INV-2218', '$975', '$975']];
  return (
    <div className={`${a.app} ${a.sheet}`}>
      <div className={a.map} data-t="dt.map" data-on={r('map') || undefined} {...hot(ctx, 'map')}>
        <span><small>Invoices.csv</small><b>Invoice #</b></span>
        <i>{r('map') ? '⟷' : '?'}</i>
        <span><small>Bank export</small><b>Reference</b></span>
      </div>
      <div className={a.grid} data-t="dt.rows" {...hot(ctx, 'match')}>
        <span className={a.gHead}><b>Invoice</b><b>Billed</b><b>Paid</b><b>Status</b></span>
        {rows.map(([id, billed, paid]) => {
          const bad = id === 'INV-2214';
          return (
            <span key={id} className={a.gRow} data-bad={(bad && r('flag')) || undefined} {...(bad ? { 'data-t': 'dt.flag' } : {})} {...(bad ? hot(ctx, 'flag') : {})}>
              <b>{id}</b><span>{billed}</span><span>{r('match') ? paid : ''}</span>
              <em data-s={!r('match') ? 'wait' : bad ? (r('flag') ? 'bad' : 'wait') : 'ok'}>{!r('match') ? 'Pending' : bad ? (r('flag') ? 'Mismatch' : 'Checking') : 'Matched'}</em>
            </span>
          );
        })}
      </div>
      <aside className={a.sum} data-t="dt.sum" data-on={r('summary') || undefined} {...hot(ctx, 'summary')}>
        <small>March summary</small>
        <b>{r('summary') ? '46 of 48' : '...'}</b>
        <span>invoices matched</span>
        <em>{r('summary') ? '2 flagged · $180 short' : ''}</em>
      </aside>
    </div>
  );
}

function OpsApp({ ctx }: { ctx: Ctx }) {
  const { reached: r } = ctx;
  const f = useField(ctx);
  const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'];
  return (
    <div className={`${a.app} ${a.ops}`}>
      <aside className={a.inbox}>
        <small>Requests · 3 new</small>
        <span className={a.msg} data-t="op.msg" data-on={r('classify') || undefined} {...hot(ctx, 'classify')}>
          <b>Maria Ortiz</b><em>Can I book a session this week?</em>{r('classify') && <i>Booking request</i>}
        </span>
        <span className={a.msg}><b>Tom Hale</b><em>Invoice for February?</em></span>
        <span className={a.msg}><b>Lena Fox</b><em>Moving my Friday visit</em></span>
      </aside>
      <div className={a.cal}>
        <span className={a.calHead}>{days.map((d) => <b key={d}>{d}</b>)}</span>
        <span className={a.calGrid}>
          {days.map((d, di) => (
            <span key={d} className={a.calDay}>
              {[0, 1, 2, 3].map((k) => {
                const busy = (di * 3 + k) % 3 !== 0;
                const slot = d === 'Thu' && k === 1;
                return slot ? (
                  <i key={k} data-t="op.slot" data-held={r('slot') || undefined} {...hot(ctx, 'slot')}>{r('slot') ? '10:30 Maria' : '10:30 free'}</i>
                ) : (
                  <i key={k} data-busy={busy || undefined} />
                );
              })}
            </span>
          ))}
        </span>
      </div>
      <aside className={a.opsSide}>
        <span className={a.crm} data-t="op.crm" {...hot(ctx, 'crm')}>
          <small>Client record</small>
          <b>Maria Ortiz</b>
          <em data-on={r('crm') || undefined}>{r('crm') ? 'Slot proposed' : 'New request'}</em>
        </span>
        <span className={a.reply} data-t="op.reply" {...hot(ctx, 'reply')}>{f('reply', 'Reply draft')}</span>
        <span className={a.locked}><i />Send · needs your OK</span>
      </aside>
    </div>
  );
}
