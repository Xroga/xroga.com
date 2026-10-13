'use client';

/**
 * The six employees' own computers (V12). Each is a different set of tools for a different responsibility, and
 * each moves stage by stage (`ws`) as the conversation goes on: 1–3 while working, 4 with the report, 5–6 after
 * follow-ups. Stage 0 is the computer before any job is assigned.
 *
 * Every name, company, figure and result is fictional sample data. Nothing here is live or connected.
 */
import type { CSSProperties, ReactNode } from 'react';
import { Companion } from './Companion';
import { employeeOf, type EmployeeId } from './team';
import type { Thread } from './workforce';
import k from './Workspaces.module.css';

/** Which app tab is in front at each stage (index = ws). */
const TAB_OF: Record<EmployeeId, number[]> = {
  seo: [0, 0, 1, 2, 3, 3, 3],
  trading: [0, 0, 1, 2, 0, 2, 3],
  intake: [0, 0, 0, 1, 3, 3, 2],
  reliability: [0, 0, 1, 2, 3, 2, 3],
  scout: [0, 0, 1, 2, 2, 3, 2],
  data: [0, 0, 1, 2, 3, 3, 2],
};

const on = (v: boolean) => v || undefined;

export function Workspace({ id, t }: { id: EmployeeId; t: Thread }) {
  const e = employeeOf(id);
  const ws = t.ws;
  const tab = TAB_OF[id][ws];
  const working = t.state === 'working';
  const View = VIEWS[id];
  return (
    <div className={k.ws} data-id={id} style={{ '--accent': e.accent } as CSSProperties}>
      <div className={k.bar}>
        <span className={k.lights} aria-hidden="true">
          <i />
          <i />
          <i />
        </span>
        <b>{e.computer.title}</b>
        <span className={k.live} data-on={on(working)}>
          {working ? 'Working' : ws === 0 ? 'Idle' : 'Up to date'}
        </span>
      </div>
      <div className={k.tabs} role="presentation">
        {e.computer.tabs.map((name, i) => (
          <span key={name} className={k.tab} data-on={on(ws > 0 && i === tab)} data-seen={on(ws > 0 && TAB_OF[id].slice(1, ws + 1).includes(i))}>
            {name}
          </span>
        ))}
      </div>
      <div key={`${ws}`} className={k.body}>
        {ws === 0 ? (
          <div className={k.idle}>
            <Companion e={e} size={92} pedestal />
            <b>No responsibility yet</b>
            <span>Assign a job in the chat. This computer shows the work as it happens.</span>
          </div>
        ) : (
          <View ws={ws} working={working} />
        )}
      </div>
      <div className={k.status} data-on={on(working)}>
        <i aria-hidden="true" />
        {t.status ?? (ws === 0 ? 'Waiting for a job' : ws >= 4 ? 'Report and evidence saved in this workspace' : 'Paused until the next run')}
      </div>
    </div>
  );
}

type V = { ws: number; working: boolean };

/* ------------------------------------------------------------------------------------------- atoms */
const Panel = ({ title, aside, children, hot }: { title: string; aside?: ReactNode; children: ReactNode; hot?: boolean }) => (
  <section className={k.panel} data-hot={on(!!hot)}>
    <header>
      <b>{title}</b>
      {aside && <span>{aside}</span>}
    </header>
    {children}
  </section>
);
const Tag = ({ kind, children }: { kind: 'ok' | 'bad' | 'wait' | 'info' | 'muted'; children: ReactNode }) => (
  <em className={k.tag} data-k={kind}>
    {children}
  </em>
);
const Meter = ({ v, kind = 'info' }: { v: number; kind?: string }) => (
  <span className={k.meter} data-k={kind} aria-hidden="true">
    <i style={{ width: `${v}%` }} />
  </span>
);
function Rows({ head, rows, cols }: { head: string[]; rows: ReactNode[][]; cols: string }) {
  return (
    <div className={k.table} style={{ '--cols': cols } as CSSProperties}>
      <div className={k.tr} data-head="">
        {head.map((h) => (
          <span key={h}>{h}</span>
        ))}
      </div>
      {rows.map((r, i) => (
        <div key={i} className={k.tr} style={{ '--i': i } as CSSProperties}>
          {r.map((c, j) => (
            <span key={j}>{c}</span>
          ))}
        </div>
      ))}
    </div>
  );
}
const Spark = ({ d, kind = 'accent' }: { d: string; kind?: string }) => (
  <svg className={k.spark} data-k={kind} viewBox="0 0 200 60" preserveAspectRatio="none" aria-hidden="true">
    <path d={d} />
  </svg>
);

/* ----------------------------------------------------------------------------------------- 1 · SEO */
function Seo({ ws }: V) {
  if (ws === 1)
    return (
      <div className={k.grid2} data-w="wide">
        <Panel title="Clicks · last 28 days" aside="Search Console (read only)">
          <Spark d="M0 48 L20 44 L40 46 L60 38 L80 40 L100 33 L120 35 L140 28 L160 30 L180 24 L200 26" />
          <div className={k.kpis}>
            <span>
              <b>1,284</b>clicks
            </span>
            <span>
              <b>41k</b>impressions
            </span>
            <span>
              <b>14.2</b>avg. position
            </span>
          </div>
        </Panel>
        <Panel title="Top queries">
          <Rows
            cols="1.8fr 0.6fr 0.6fr"
            head={['Query', 'Clicks', 'Pos.']}
            rows={[
              ['dentist al barsha', '212', '6.1'],
              ['teeth cleaning dubai', '144', '9.8'],
              ['emergency dentist', '38', '17.4'],
              ['invisalign cost dubai', '21', '22.9'],
            ]}
          />
        </Panel>
      </div>
    );
  if (ws === 2)
    return (
      <Panel title="Competing pages for “emergency dentist”" aside="12 compared · 3 shown">
        <div className={k.cards3}>
          {[
            ['smilecare.example', 'Thin page · no prices · no hours', 32, 'bad'],
            ['bayclinic.example', 'Strong FAQ · prices · reviews', 84, 'ok'],
            ['citydental.example', 'Outdated (2023) · no booking link', 41, 'wait'],
          ].map(([site, note, score, kind]) => (
            <div key={site as string} className={k.mini}>
              <b>{site}</b>
              <span>{note}</span>
              <Meter v={score as number} kind={kind as string} />
              <small>Page strength {score}/100</small>
            </div>
          ))}
        </div>
        <p className={k.note}>Gap: no clinic near Al Barsha answers “open now” with hours and a phone link.</p>
      </Panel>
    );
  if (ws === 3)
    return (
      <Panel title="46 search terms → 7 clusters" aside="by intent and difficulty">
        <div className={k.clusters}>
          {[
            ['Emergency', 9, 'low'],
            ['Kids dentist', 6, 'low'],
            ['Invisalign cost', 8, 'mid'],
            ['Teeth cleaning', 7, 'high'],
            ['Implants', 6, 'high'],
            ['Whitening', 5, 'mid'],
            ['Near me / open now', 5, 'low'],
          ].map(([n, c, d], i) => (
            <span key={n as string} className={k.cluster} data-d={d} style={{ '--i': i } as CSSProperties}>
              <b>{n}</b>
              {c} terms · {d === 'low' ? 'easy' : d === 'mid' ? 'medium' : 'hard'}
            </span>
          ))}
        </div>
      </Panel>
    );
  if (ws === 6)
    return (
      <Panel title="Draft · Invisalign page update" aside={<Tag kind="wait">Not published</Tag>} hot>
        <div className={k.diff}>
          <span data-add="">+ Price range: AED 9,500–16,000, depending on case</span>
          <span data-add="">+ FAQ: How long does treatment take? · Is it painful? · Can I pay monthly?</span>
          <span data-add="">+ Button: Book a free Invisalign check</span>
          <span>  Existing photos, doctor bios and reviews unchanged</span>
        </div>
        <p className={k.note}>Waiting for your approval in the chat. The live site has not been touched.</p>
      </Panel>
    );
  return (
    <Panel title={ws === 5 ? 'Top three · action plan' : 'SEO brief · week 1'} aside="sources attached" hot={ws === 5}>
      <Rows
        cols="1.7fr 0.6fr 1.6fr"
        head={['Keyword', 'Effort', ws === 5 ? 'Do this' : 'Why']}
        rows={(ws === 5
          ? [
              ['emergency dentist al barsha', 'Low', 'Add hours, phone link and “open now” section'],
              ['kids dentist jlt', 'Low', 'New page: services, age groups, booking'],
              ['invisalign cost dubai', 'Medium', 'Add a price range and FAQ to the page'],
            ]
          : [
              ['emergency dentist al barsha', 'Low', 'Competitor pages are thin'],
              ['kids dentist jlt', 'Low', 'You have no page for it'],
              ['invisalign cost dubai', 'Medium', 'Price page could answer it'],
              ['dentist open now dubai', 'Low', 'Hours missing from your site'],
              ['teeth cleaning price dubai', 'Medium', 'Mentioned, not explained'],
            ]
        ).map((r, i) => [
          <>
            <i className={k.rank}>{i + 1}</i>
            {r[0]}
          </>,
          <Tag key="e" kind={r[1] === 'Low' ? 'ok' : 'wait'}>
            {r[1]}
          </Tag>,
          r[2],
        ])}
      />
      {ws === 4 && <p className={k.note}>Also found: 2 pages missing titles · mobile menu hides the booking link.</p>}
    </Panel>
  );
}

/* ------------------------------------------------------------------------------------- 2 · trading */
function Trading({ ws, working }: V) {
  if (ws === 1 || ws === 4)
    return (
      <div className={k.notebook}>
        <div className={k.cell}>
          <code>
            <i>In [1]</i> chains = load_options(universe=<b>&quot;liquid_40&quot;</b>, years=<b>(2015, 2025)</b>, dte=<b>(30, 45)</b>)
          </code>
          <samp>{working && ws === 1 ? 'loading… 31 of 40 tickers' : '40 tickers · 1.2M contracts · 0 trades placed'}</samp>
        </div>
        {ws === 4 ? (
          <div className={k.memo}>
            <b>Research memo · paper results</b>
            <p>
              <Tag kind="ok">Steadier</Tag> ETF put credit spreads: positive after costs in 2 of 3 regimes.
            </p>
            <p>
              <Tag kind="bad">Fragile</Tag> Iron condors: most gains disappear after costs in stressed markets.
            </p>
            <p>
              <Tag kind="muted">Caveat</Tag> Out-of-sample (2023–2025) weaker than in-sample. Not a prediction or advice.
            </p>
          </div>
        ) : (
          <div className={k.cell}>
            <code>
              <i>In [2]</i> regimes = label_regimes(vix, trend) <span className={k.dim}># calm · trending · stressed</span>
            </code>
          </div>
        )}
      </div>
    );
  if (ws === 2)
    return (
      <Panel title="Backtest · growth of 1.0 risk unit" aside="2015–2025 · paper">
        <div className={k.chart}>
          <span className={k.regime} style={{ left: '30%', width: '8%' }} />
          <span className={k.regime} style={{ left: '71%', width: '10%' }} />
          <Spark kind="a" d="M0 50 L30 44 L60 40 L66 52 L90 42 L120 36 L142 30 L150 44 L170 38 L200 34" />
          <Spark kind="b" d="M0 50 L30 46 L60 41 L66 45 L90 39 L120 34 L142 30 L150 35 L170 29 L200 24" />
          <Spark kind="c" d="M0 50 L30 47 L60 45 L66 48 L90 44 L120 42 L142 41 L150 43 L170 40 L200 38" />
        </div>
        <div className={k.legend}>
          <span data-k="a">Iron condor</span>
          <span data-k="b">ETF put spread</span>
          <span data-k="c">Covered call</span>
          <span data-k="r">Stressed periods</span>
        </div>
      </Panel>
    );
  if (ws === 6)
    return (
      <Panel title="Watchlist" aside="No broker connected">
        <Rows
          cols="1.3fr 0.8fr 1.6fr"
          head={['Strategy', 'Status', 'Next']}
          rows={[
            ['ETF put credit spread', <Tag key="s" kind="ok">Monitor</Tag>, 'Weekly update after close'],
            ['Iron condor', <Tag key="s" kind="wait">Re-test</Tag>, 'Re-test next quarter with new costs'],
            ['Covered call', <Tag key="s" kind="muted">Parked</Tag>, 'Low return for the risk'],
          ]}
        />
        <p className={k.note}>Iron condor dropped from the shortlist: worst month 3× larger after fees and slippage.</p>
      </Panel>
    );
  return (
    <Panel title={ws === 5 ? 'Stress test · ETF put spreads' : 'Costs & risk'} aside="fees + slippage applied" hot={ws === 5}>
      {ws === 5 ? (
        <div className={k.bars}>
          {[
            ['Mar 2020', 9, 'bad'],
            ['Jun 2022', 7, 'bad'],
            ['Aug 2024', 3, 'wait'],
            ['Typical month', 1, 'ok'],
          ].map(([n, v, kind]) => (
            <div key={n as string} className={k.barRow}>
              <span>{n}</span>
              <Meter v={(v as number) * 10} kind={kind as string} />
              <b>−{v}%</b>
            </div>
          ))}
          <p className={k.note}>Loss as a share of allocated risk in the worst month of each episode. Recovered within 3 months both times.</p>
        </div>
      ) : (
        <Rows
          cols="1.3fr 0.8fr 0.9fr 0.9fr"
          head={['Strategy', 'Before costs', 'After costs', 'Worst month']}
          rows={[
            ['Iron condor', '+11.8%', <Tag key="a" kind="bad">+2.1%</Tag>, '−14%'],
            ['ETF put spread', '+9.4%', <Tag key="a" kind="ok">+6.3%</Tag>, '−9%'],
            ['Covered call', '+5.2%', <Tag key="a" kind="muted">+4.0%</Tag>, '−6%'],
          ]}
        />
      )}
    </Panel>
  );
}

/* -------------------------------------------------------------------------------------- 3 · intake */
function Intake({ ws, working }: V) {
  if (ws <= 2)
    return (
      <Panel title="Bookings · this week" aside={ws === 1 ? 'Watching the booking form' : '1 new booking'}>
        <div className={k.week}>
          {['Mon', 'Tue', 'Wed', 'Thu', 'Fri'].map((d, i) => (
            <div key={d} className={k.day}>
              <b>{d}</b>
              {i === 1 && <span className={k.slot}>Call · Corvid Labs</span>}
              {i === 3 && ws === 2 && (
                <span className={k.slot} data-new="">
                  10:00 · River Dental
                </span>
              )}
              {i === 4 && <span className={k.slot}>Call · Mesa Retail</span>}
            </div>
          ))}
        </div>
        {ws === 2 && (
          <div className={k.form}>
            <span>
              <b>Name</b>Dr. Amira Haddad, River Dental
            </span>
            <span>
              <b>Needs</b>“Help with no-shows and phone bookings. No-shows are hurting us.”
            </span>
            <span>
              <b>Site</b>riverdental.example
            </span>
          </div>
        )}
      </Panel>
    );
  if (ws === 3)
    return (
      <div className={k.grid2}>
        <div className={k.site}>
          <div className={k.siteBar}>riverdental.example</div>
          <b>Family dentistry in three neighbourhoods</b>
          <span>Marina · Al Barsha · Mirdif</span>
          <span className={k.siteBtn}>Call to book</span>
        </div>
        <Panel title="Notes with sources" aside={working ? 'reading…' : undefined}>
          <ul className={k.facts}>
            <li>
              <Tag kind="info">site</Tag> 3 clinic locations listed
            </li>
            <li>
              <Tag kind="info">site</Tag> Booking by phone only
            </li>
            <li>
              <Tag kind="info">form</Tag> Mentions no-shows twice
            </li>
          </ul>
        </Panel>
      </div>
    );
  if (ws === 6)
    return (
      <Panel title="CRM · River Dental" aside={<Tag kind="ok">Approved (sample)</Tag>} hot>
        <Rows
          cols="0.9fr 1.6fr 0.7fr"
          head={['Field', 'Value', 'Change']}
          rows={[
            ['Company', 'River Dental · 2 clinics', <Tag key="c" kind="ok">Saved</Tag>],
            ['Contact', 'Dr. Amira Haddad', <Tag key="c" kind="ok">Saved</Tag>],
            ['Source', 'Website booking form', <Tag key="c" kind="ok">Saved</Tag>],
            ['Meeting', 'Thu 10:00', <Tag key="c" kind="ok">Saved</Tag>],
            ['Deal value', 'Not set', <Tag key="c" kind="muted">Untouched</Tag>],
          ]}
        />
      </Panel>
    );
  const fixed = ws === 5;
  return (
    <Panel title="Meeting brief · River Dental · Thu 10:00" aside="one page" hot={fixed}>
      <div className={k.brief}>
        <p>
          <b>Who</b> Dr. Amira Haddad, owner. {fixed ? <mark>2 clinics</mark> : '3 clinics'}, family dentistry.
        </p>
        <p>
          <b>Why now</b> No-shows mentioned twice; booking is phone only.
        </p>
        <p>
          <b>Ask</b> 1. How many no-shows a week? 2. Who answers the phones? 3. One calendar for {fixed ? 'both' : 'all'} clinics?
        </p>
        {fixed && <p className={k.note}>Conflict noted: site still lists Mirdif; you said it closed.</p>}
      </div>
      <div className={k.pending}>
        <b>CRM update · waiting for you</b>
        <span>Company · Contact · Source · Meeting date</span>
      </div>
    </Panel>
  );
}

/* --------------------------------------------------------------------------------- 4 · reliability */
function Reliability({ ws, working }: V) {
  if (ws === 1)
    return (
      <Panel title="Critical queue · customer dashboard" aside="3 new">
        <Rows
          cols="0.5fr 2fr 0.9fr"
          head={['#', 'Issue', 'Triage']}
          rows={[
            ['487', 'Signed out when switching projects', <Tag key="t" kind="bad">Fix now</Tag>],
            ['489', 'Export totals differ from dashboard', <Tag key="t" kind="wait">Needs decision</Tag>],
            ['490', 'Chart labels overlap on small screens', <Tag key="t" kind="muted">Not critical</Tag>],
          ]}
        />
      </Panel>
    );
  if (ws === 2)
    return (
      <div className={k.grid2}>
        <div className={k.site} data-k="app">
          <div className={k.siteBar}>staging.dashboard.example/projects</div>
          <b>Sign in to continue</b>
          <span>You were signed out.</span>
        </div>
        <Panel title="Reproduce #487 · staging" aside="browser test">
          <ul className={k.steps}>
            <li data-k="ok">Sign in as test user</li>
            <li data-k="ok">Open Project A</li>
            <li data-k="ok">Switch to Project B</li>
            <li data-k={working ? 'run' : 'bad'}>Still signed in? {working ? '…' : 'No: sent to /login'}</li>
          </ul>
        </Panel>
      </div>
    );
  if (ws === 3 || ws === 5)
    return (
      <div className={k.grid2} data-w="wide">
        <Panel title="src/projects/switch.ts" aside="branch fix/487-session" hot={ws === 5}>
          <div className={k.diff}>
            <span>  async function switchTo(id) {'{'}</span>
            <span data-del="">-   await signOut()</span>
            <span data-add="">+   await setProjectContext(id)</span>
            <span>    router.push(`/projects/${'{id}'}`)</span>
          </div>
          {ws === 5 && <p className={k.note}>signOut() cleared the session on every switch. The fix only changes the project context.</p>}
        </Panel>
        <Panel title="CI">
          <ul className={k.steps}>
            <li data-k="ok">New test: keeps session on switch</li>
            <li data-k={ws === 3 && working ? 'run' : 'ok'}>Unit · 14</li>
            <li data-k={ws === 3 && working ? 'run' : 'ok'}>Integration · 3</li>
            <li data-k={ws === 3 && working ? 'wait' : 'ok'}>Staging browser · 1</li>
          </ul>
        </Panel>
      </div>
    );
  return (
    <Panel title="PR #212 · Keep session on project switch" aside={ws === 6 ? <Tag kind="ok">Merge approved (preview)</Tag> : <Tag kind="wait">Awaiting review</Tag>} hot={ws === 6}>
      <div className={k.kpis}>
        <span>
          <b>+6 −2</b>2 files
        </span>
        <span>
          <b>18/18</b>tests pass
        </span>
        <span>
          <b>4/4</b>staging checks
        </span>
      </div>
      <ul className={k.steps}>
        <li data-k="ok">Reproduced, then fixed with a failing test first</li>
        <li data-k="ok">No production access used</li>
        <li data-k={ws === 6 ? 'ok' : 'wait'}>Merge {ws === 6 ? 'approved by you (preview)' : 'waits for you'}</li>
        <li data-k="wait">Deploy waits for you</li>
      </ul>
    </Panel>
  );
}

/* --------------------------------------------------------------------------------------- 5 · scout */
const OPPS: [string, number, number, number, boolean][] = [
  ['Online booking setup for clinics', 92, 88, 70, true],
  ['No-show reminder system', 74, 80, 82, true],
  ['Review response service', 61, 70, 90, true],
  ['AI receptionist', 78, 35, 40, false],
  ['Clinic SEO packages', 66, 40, 60, false],
];
function Scout({ ws, working }: V) {
  if (ws === 1)
    return (
      <Panel title="Competitor changes · this week" aside="18 sites checked">
        <Rows
          cols="1fr 1.9fr 0.6fr"
          head={['Agency', 'Change', 'Seen']}
          rows={[
            ['CareGrow', 'Launched an “AI receptionist” package', 'Tue'],
            ['MedReach', 'New pricing page, prices up ~15%', 'Wed'],
            ['ClinicLift', 'Hiring 3 booking-system specialists', 'Thu'],
            ['Pulse Digital', 'No change', '—'],
          ]}
        />
      </Panel>
    );
  if (ws === 2)
    return (
      <Panel title="What clinic patients complain about" aside="240 public reviews">
        <div className={k.bars}>
          {[
            ['Can’t book online', 52],
            ['Missed appointments', 31],
            ['Slow replies', 24],
            ['Prices unclear', 17],
          ].map(([n, v], i) => (
            <div key={n as string} className={k.barRow} style={{ '--i': i } as CSSProperties}>
              <span>{n}</span>
              <Meter v={((v as number) / 52) * 100} kind={i === 0 ? 'accent' : 'info'} />
              <b>{v}</b>
            </div>
          ))}
        </div>
        <p className={k.quote}>“Had to call three times just to get an appointment.” · public review, Sep</p>
      </Panel>
    );
  if (ws === 5)
    return (
      <Panel title="Experiment brief · #1 Online booking setup" aside={<Tag kind="wait">Outreach needs approval</Tag>} hot>
        <div className={k.brief}>
          <p>
            <b>Test</b> A landing page: “Online booking set up in 7 days”.
          </p>
          <p>
            <b>Audience</b> 40 UAE clinics with phone-only booking.
          </p>
          <p>
            <b>Length</b> 2 weeks · <b>Success</b> 5 qualified calls.
          </p>
          <p>
            <b>Stop if</b> fewer than 2 calls in week one.
          </p>
        </div>
      </Panel>
    );
  return (
    <Panel title={ws === 6 ? 'Rejected ideas' : 'Opportunities · scored'} aside="demand · fit · effort">
      <div className={k.opps}>
        {OPPS.filter((o) => ws !== 6 || !o[4]).map(([n, d, f, e, keep], i) => (
          <div key={n} className={k.opp} data-out={on(ws >= 4 && !keep)} style={{ '--i': i } as CSSProperties}>
            <b>
              {ws >= 4 && keep && <i className={k.rank}>{i + 1}</i>}
              {n}
            </b>
            <span>
              Demand <Meter v={d} />
            </span>
            <span>
              Fit <Meter v={f} kind={f < 50 ? 'bad' : 'ok'} />
            </span>
            <span className={k.hideS}>
              Effort <Meter v={e} kind="muted" />
            </span>
            {ws >= 4 && !keep && <small>{n === 'AI receptionist' ? '6 competitors launched it this month' : 'Overlaps your SEO Researcher’s job'}</small>}
          </div>
        ))}
      </div>
      {ws === 3 && working && <p className={k.note}>Scoring… weights: demand 40%, fit 40%, effort 20%.</p>}
    </Panel>
  );
}

/* ---------------------------------------------------------------------------------------- 6 · data */
function Data({ ws, working }: V) {
  if (ws === 1)
    return (
      <Panel title="Sources" aside={working ? 'importing…' : 'first run tonight · 01:00'}>
        <div className={k.cards3}>
          {[
            ['CRM', '1,604 rows', 'read only'],
            ['Billing export', '1,611 rows', 'read only'],
            ['Customer sheet', '1,597 rows', 'read only'],
          ].map(([n, r, p]) => (
            <div key={n} className={k.mini}>
              <b>{n}</b>
              <span>{working ? r : 'not imported yet'}</span>
              <Meter v={working ? 100 : 0} kind="ok" />
              <small>{p}</small>
            </div>
          ))}
        </div>
      </Panel>
    );
  if (ws === 2)
    return (
      <Panel title="Matching records" aside="4,812 rows">
        <Rows
          cols="1.2fr 1fr 1fr 0.8fr"
          head={['Customer', 'CRM', 'Billing', 'Result']}
          rows={[
            ['Omar Saleh', 'omar@saleh.example', 'OMAR@SALEH.EXAMPLE', <Tag key="r" kind="ok">Fix case</Tag>],
            ['Lina Park', '+971 50 123 4567', '0501234567', <Tag key="r" kind="ok">Fix format</Tag>],
            ['Maya Chen', 'B-2231', 'B-4410', <Tag key="r" kind="wait">Hold</Tag>],
            ['Test User', 'test@test.example', '—', <Tag key="r" kind="wait">Hold</Tag>],
          ]}
        />
      </Panel>
    );
  if (ws === 3 || ws === 6)
    return (
      <Panel title="Change log" aside="every change reversible" hot={ws === 6}>
        <ul className={k.log}>
          {ws === 6 && (
            <li data-new="">
              <Tag kind="ok">Merge</Tag> Maya Chen · 2 records → 1 · both billing IDs kept <u>Undo</u>
            </li>
          )}
          <li>
            <Tag kind="info">Format</Tag> 21 phone numbers → +971 format <u>Undo</u>
          </li>
          <li>
            <Tag kind="info">Case</Tag> 11 emails lower-cased <u>Undo</u>
          </li>
          <li>
            <Tag kind="info">Trim</Tag> 5 names with extra spaces <u>Undo</u>
          </li>
          <li>
            <Tag kind="muted">Export</Tag> Clean export → Reports/customers-clean.csv
          </li>
        </ul>
      </Panel>
    );
  return (
    <Panel title="Held for you · 4 exceptions" aside="nothing deleted or merged" hot={ws === 5}>
      <Rows
        cols="1.1fr 1.8fr 0.8fr"
        head={['Record', ws === 5 ? 'Evidence' : 'Why held', 'Needs']}
        rows={[
          ['Maya Chen ×2', ws === 5 ? 'Same email and phone; billing IDs B-2231 and B-4410' : 'Possible duplicate', <Tag key="n" kind="wait">Merge?</Tag>],
          ['K. Ibrahim', ws === 5 ? 'No email; city “Al Ain?” in sheet, “Dubai” in CRM' : 'Missing email, unclear city', <Tag key="n" kind="wait">Check</Tag>],
          ['Test User', ws === 5 ? 'test@test.example, no invoices, created by import' : 'Looks like test data', <Tag key="n" kind="wait">Delete?</Tag>],
        ]}
      />
    </Panel>
  );
}

const VIEWS: Record<EmployeeId, (p: V) => ReactNode> = { seo: Seo, trading: Trading, intake: Intake, reliability: Reliability, scout: Scout, data: Data };
