/**
 * The eight in-card demonstrations. Each is a miniature, believable piece of work whose state is a pure function of
 * `step` (0 setup still, 1 to 4 the card's four demo stages; 4 holds the result). Step changes come from the deck's
 * single scroll timeline or, in the carousel, from the card's own short local play. CSS owns the in-between motion,
 * so a skipped step still lands on the right picture. Names, numbers and sources are illustrative sample content.
 */
import type { CSSProperties } from 'react';
import { Mark } from '../phase1/Mark';
import type { CapabilityId } from './capabilities.data';
import v from './Vignettes.module.css';

type Props = { step: number };
type Tone = 'ok' | 'wait' | 'run' | 'plan';

/** Step flags: data-s1 means "step 1 or later", and so on, so CSS reads cumulative state. */
const flags = (step: number) => ({
  'data-s1': step >= 1 || undefined,
  'data-s2': step >= 2 || undefined,
  'data-s3': step >= 3 || undefined,
  'data-s4': step >= 4 || undefined,
});

/** A status that swaps its text in place as the step advances: the latest entry whose `at` has been reached shows. */
function Swap({ step, texts, className }: { step: number; texts: { at: number; text: string; tone?: Tone }[]; className?: string }) {
  let shown = 0;
  texts.forEach((t, i) => {
    if (step >= t.at) shown = i;
  });
  return (
    <span className={`${v.swap} ${className ?? ''}`}>
      {texts.map((t, i) => (
        <span key={i} data-tone={t.tone} data-shown={i === shown || undefined}>
          {t.text}
        </span>
      ))}
    </span>
  );
}

/* ------------------------------------------------------------------ 01 Build: structure, logic, test, ready */
function Build({ step }: Props) {
  return (
    <div className={`${v.scene} ${v.build}`} {...flags(step)}>
      <div className={`${v.panel} ${v.ui}`}>
        <div className={v.bar}>
          <i />
          <i />
          <span>portal.northwind.app</span>
        </div>
        <div className={v.uiBody}>
          <div className={v.uiNav}>
            <b>Portal</b>
            <span data-on>Orders</span>
            <span>Invoices</span>
            <span>Team</span>
          </div>
          <div className={v.uiRows}>
            <span>
              #4821<em data-tone="ok">Shipped</em>
            </span>
            <span>
              #4822<em>Transit</em>
            </span>
            <span>
              INV-208<em>Due</em>
            </span>
          </div>
        </div>
      </div>
      <div className={`${v.panel} ${v.auth}`}>
        <span className={v.tag}>Auth</span>
        <span className={v.roles}>
          <i>Admin</i>
          <i>Staff</i>
          <i>Client</i>
        </span>
      </div>
      <div className={`${v.panel} ${v.api}`}>
        <span className={v.tag}>API</span>
        <code>GET /shipments</code>
        <code>POST /invoices</code>
      </div>
      <div className={`${v.panel} ${v.db}`}>
        <span className={v.tag}>Data</span>
        <span className={v.rel}>
          orders<i />invoices
        </span>
      </div>
      <svg className={v.path} viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden>
        <path d="M57 12 C 52 12, 52 30, 57 31 M57 31 C 52 31, 52 46, 52 40 L 52 40" />
      </svg>
      <div className={`${v.panel} ${v.checks}`}>
        <span className={v.check} data-i="0">
          <i />
          Role access
        </span>
        <span className={v.check} data-i="1">
          <i />
          Invoice totals
        </span>
        <span className={v.check} data-i="2">
          <i />
          Portal flows
        </span>
        <Swap
          step={step}
          className={v.checkState}
          texts={[
            { at: 0, text: 'Checks planned', tone: 'plan' },
            { at: 3, text: 'Running checks', tone: 'run' },
            { at: 4, text: '18 checks passed', tone: 'ok' },
          ]}
        />
      </div>
      <div className={v.result}>Release-ready build</div>
    </div>
  );
}

/* ---------------------------------------------------------- 02 Browser & Testing: a multi-step checkout journey */
function Browser({ step }: Props) {
  return (
    <div className={`${v.scene} ${v.browser}`} {...flags(step)}>
      <ol className={v.rail}>
        <li data-k="cart">Cart</li>
        <li data-k="details">Details</li>
        <li data-k="pay">Payment</li>
        <li data-k="done">Done</li>
      </ol>
      <span className={v.marker} />
      <div className={`${v.panel} ${v.win}`}>
        <div className={v.bar}>
          <i />
          <i />
          <span>shop.example/checkout</span>
        </div>
        <div className={`${v.screen} ${v.sDetails}`}>
          <span className={v.field}>
            <small>Email</small>ana@example.com<i>✓</i>
          </span>
          <span className={v.field}>
            <small>Address</small>12 Harbour St<i>✓</i>
          </span>
        </div>
        <div className={`${v.screen} ${v.sPay}`}>
          <span className={v.field}>
            <small>Card</small>•••• 4242
          </span>
          <span className={`${v.field} ${v.verify}`}>
            <small>Card verification</small>
            <Swap
              step={step}
              texts={[
                { at: 0, text: 'Waiting' },
                { at: 2, text: 'Never returns', tone: 'wait' },
                { at: 4, text: 'Returned', tone: 'ok' },
              ]}
            />
          </span>
          <span className={v.pay}>Pay $48.00</span>
        </div>
        <div className={`${v.screen} ${v.sDone}`}>
          <b>Order confirmed</b>
          <span>#1042 · receipt sent</span>
        </div>
        <span className={v.isolate} />
        <svg className={v.cursor} viewBox="0 0 16 16" aria-hidden>
          <path d="M2 1.5 13 8.2l-4.9.9 2.6 5-1.8.9-2.6-5L2.4 13z" />
        </svg>
      </div>
      <div className={`${v.panel} ${v.cause}`}>
        <span className={v.causeA}>
          <b>Root cause</b> card check returns no redirect
        </span>
        <span className={v.causeB}>
          <code>fix</code> pass return_url to the check
        </span>
        <span className={v.causeC}>Same path rerun: 4 of 4 steps passed</span>
      </div>
      <div className={v.result}>Flow verified</div>
    </div>
  );
}

/* ------------------------------------------------ 03 Automate Work: a dental front desk in dependency order */
function Automate({ step }: Props) {
  return (
    <div className={`${v.scene} ${v.automate}`} {...flags(step)}>
      <div className={`${v.node} ${v.n1}`}>
        <b>
          <Mark id="gmail" className={`${v.nm} ${v.mGmail}`} />
          Inquiry
        </b>
        <Swap step={step} texts={[{ at: 0, text: 'Cleaning visit' }]} />
      </div>
      <div className={`${v.node} ${v.n2}`}>
        <b>Qualify</b>
        <Swap step={step} texts={[{ at: 0, text: 'Not started' }, { at: 1, text: 'New patient', tone: 'ok' }]} />
      </div>
      <div className={`${v.node} ${v.n3}`}>
        <b>Intake form</b>
        <Swap
          step={step}
          texts={[
            { at: 0, text: 'Not started' },
            { at: 2, text: 'Needs approval', tone: 'wait' },
            { at: 3, text: 'Approved, sent', tone: 'ok' },
          ]}
        />
      </div>
      <div className={`${v.node} ${v.n4}`}>
        <b>
          <Mark id="googlecalendar" className={`${v.nm} ${v.mCal}`} />
          Book
        </b>
        <Swap
          step={step}
          texts={[
            { at: 0, text: 'Not started' },
            { at: 2, text: 'Held 10:30', tone: 'run' },
            { at: 3, text: 'Booked 10:30', tone: 'ok' },
          ]}
        />
      </div>
      <div className={`${v.node} ${v.n5}`}>
        <b>
          <Mark id="hubspot" className={`${v.nm} ${v.mCrm}`} />
          Record
        </b>
        <Swap step={step} texts={[{ at: 0, text: 'Not started' }, { at: 4, text: 'Updated', tone: 'ok' }]} />
      </div>
      <div className={`${v.node} ${v.n6}`}>
        <b>
          <Mark id="gmail" className={`${v.nm} ${v.mGmail}`} />
          Follow-up
        </b>
        <Swap step={step} texts={[{ at: 0, text: 'Not started' }, { at: 4, text: 'Drafted', tone: 'ok' }]} />
      </div>
      <svg className={v.flow} viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden>
        <path data-seg="1" d="M32.5 21 H 35.5" />
        <path data-seg="2" d="M65 21 H 68" />
        <path data-seg="3" d="M83 39 V 44 H 17 V 49" />
        <path data-seg="4" d="M32.5 66 H 35.5" />
        <path data-seg="5" d="M65 66 H 68" />
      </svg>
      <div className={v.result}>Records updated</div>
    </div>
  );
}

/* --------------------------------------------- 04 Launch Anywhere: one product core, four distinct surfaces */
const SURFACES: { k: string; label: string; final: { text: string; tone: Tone } }[] = [
  { k: 'web', label: 'Web', final: { text: 'Preview ready', tone: 'ok' } },
  { k: 'ext', label: 'Extension', final: { text: 'Package ready', tone: 'ok' } },
  { k: 'ios', label: 'iOS', final: { text: 'Needs Apple account', tone: 'wait' } },
  { k: 'and', label: 'Android', final: { text: 'Ready to submit', tone: 'ok' } },
];

function Launch({ step }: Props) {
  return (
    <div className={`${v.scene} ${v.launch}`} {...flags(step)}>
      {SURFACES.map((s) => (
        <div key={s.k} className={v.surface} data-k={s.k}>
          <span className={v.device}>
            <i className={v.avatar}>A</i>
            <i className={v.line} />
            <i className={v.line} data-short />
          </span>
          <b>{s.label}</b>
          <Swap
            step={step}
            className={v.sState}
            texts={[{ at: 0, text: 'Planned', tone: 'plan' }, { at: 2, text: 'Built', tone: 'run' }, { at: 3, text: 'Tested', tone: 'ok' }, { at: 4, ...s.final }]}
          />
        </div>
      ))}
      <div className={v.backbone}>
        <span>Shared sign-in</span>
        <i />
        <span>Shared data</span>
        <i />
        <span>One codebase</span>
      </div>
      <div className={v.result}>Ready for release review</div>
    </div>
  );
}

/* --------------------------------------------- 05 Research & Decide: question to angles, evidence, a ranked brief */
function Research({ step }: Props) {
  return (
    <div className={`${v.scene} ${v.research}`} {...flags(step)}>
      <div className={`${v.panel} ${v.q}`}>
        <i>Q</i>Which fleet tools are underserved?
      </div>
      <div className={v.angles}>
        <span>Demand</span>
        <span>Competitors</span>
        <span>Complaints</span>
      </div>
      <div className={v.families}>
        <span>
          Forums <b>12</b>
        </span>
        <span>
          Reviews <b>9</b>
        </span>
        <span>
          Sites <b>6</b>
        </span>
        <span>
          Posts <b>4</b>
        </span>
      </div>
      <div className={`${v.panel} ${v.compare}`}>
        <span className={v.sigA}>
          <small>Forums</small>Setup is quick
        </span>
        <span className={v.conflict}>conflict</span>
        <span className={v.sigB}>
          <small>Reviews</small>Setup takes days
        </span>
        <span className={v.weigh}>Weighted to verified buyers · 3 repeats merged</span>
      </div>
      <div className={`${v.panel} ${v.brief}`}>
        <b>Ranked directions</b>
        <span>
          <i>1</i>Faster onboarding<sup>S2 S5</sup>
        </span>
        <span>
          <i>2</i>Offline driver app<sup>S1</sup>
        </span>
        <span>
          <i>3</i>Fleet invoicing<sup>S3 S4</sup>
        </span>
      </div>
      <div className={v.result}>Evidence-backed brief</div>
    </div>
  );
}

/* ------------------------- 06 Files & Data: a dirty export, diagnosed, mapped, deduplicated, normalized, held */
type Cell = [string, string];
type Row = { name: Cell; email: Cell; status: Cell; acct: Cell; kind?: 'dup' | 'miss' | 'ref' | 'amb' };
const ROWS: Row[] = [
  { name: ['Ana Ruiz', 'Ana Ruiz'], email: ['ana@nw.co', 'ana@nw.co'], status: ['active', 'Active'], acct: ['ACC-12', 'ACC-12'] },
  { name: ['ANA RUIZ', 'Ana Ruiz'], email: ['ana@nw.co', 'ana@nw.co'], status: ['Active', 'Active'], acct: ['ACC-12', 'ACC-12'], kind: 'dup' },
  { name: ['ben ode', 'Ben Ode'], email: ['', ''], status: ['ACTIVE', 'Active'], acct: ['ACC-7', 'ACC-7'], kind: 'miss' },
  { name: ['Chloe Park', 'Chloe Park'], email: ['chloe@pk.io', 'chloe@pk.io'], status: ['lapsed', 'Lapsed'], acct: ['ACC-99', 'ACC-99'], kind: 'ref' },
  { name: ['D. Lee', 'D. Lee'], email: ['dlee@acme.io', 'dlee@acme.io'], status: ['Trial', 'Trial'], acct: ['ACC-3', 'ACC-3'], kind: 'amb' },
];

/** which column carries each row's issue: the duplicate's name, the missing email, the broken account link, the
 * ambiguous name */
const FLAG_COL: Record<string, number> = { dup: 0, miss: 1, ref: 3, amb: 0 };

function Data({ step }: Props) {
  return (
    <div className={`${v.scene} ${v.data}`} {...flags(step)}>
      <div className={v.fileBar}>
        <span className={v.file}>customers_export.csv</span>
        <span className={v.safe}>Original kept</span>
      </div>
      <div className={v.mapping}>
        <span>
          State<i>→</i>status <b>91%</b>
        </span>
        <span>
          Acct<i>→</i>account_id <b>97%</b>
        </span>
      </div>
      <div className={v.table}>
        <div className={v.tr} data-head>
          <span>name</span>
          <span>email</span>
          <span>status</span>
          <span>account</span>
        </div>
        {ROWS.map((r, i) => (
          <div key={i} className={v.tr} data-kind={r.kind}>
            {[r.name, r.email, r.status, r.acct].map((cell, j) => (
              <span
                key={j}
                className={v.cell}
                data-changes={cell[0] !== cell[1] || undefined}
                data-empty={cell[0] === '' || undefined}
                data-flag={FLAG_COL[r.kind ?? ''] === j || undefined}
              >
                <span className={v.was}>{cell[0] || 'missing'}</span>
                <span className={v.now}>{cell[1] || 'missing'}</span>
              </span>
            ))}
          </div>
        ))}
      </div>
      <div className={v.audit}>
        <Swap
          step={step}
          texts={[
            { at: 0, text: '5 rows loaded' },
            { at: 1, text: '4 issues flagged in place', tone: 'wait' },
            { at: 2, text: 'Merge rule: same email and account', tone: 'run' },
            { at: 3, text: '3 normalized · 1 merged', tone: 'ok' },
            { at: 4, text: '5 changes logged · 2 held', tone: 'wait' },
          ]}
        />
      </div>
      <div className={v.result}>Changes ready for review</div>
    </div>
  );
}

/* ---------------------------------- 07 Grow Your Business: opportunity, bottleneck, experiment, before and after */
function Grow({ step }: Props) {
  return (
    <div className={`${v.scene} ${v.grow}`} {...flags(step)}>
      <div className={v.opps}>
        <span data-pick>Onboarding</span>
        <span>Pricing page</span>
        <span>Referrals</span>
      </div>
      <div className={v.funnel}>
        <div className={v.fstage} style={{ '--w': '100%' } as CSSProperties}>
          <span>Visits</span>
          <i />
          <b>12,400</b>
        </div>
        <div className={v.fstage} style={{ '--w': '58%' } as CSSProperties}>
          <span>Signups</span>
          <i />
          <b>1,180</b>
        </div>
        <div className={`${v.fstage} ${v.narrow}`} style={{ '--w': '20%' } as CSSProperties}>
          <span>Activated</span>
          <i />
          <b>448</b>
        </div>
      </div>
      <span className={v.why}>
        <Mark id="posthog" className={`${v.nm} ${v.mPh}`} />
        62% stop at setup
      </span>
      <div className={`${v.panel} ${v.exp}`}>
        <b>Guided setup</b>
        <span className={v.expMail}>
          <Mark id="mailchimp" className={`${v.nm} ${v.mMc}`} />
          Email drafted
        </span>
        <Swap step={step} texts={[{ at: 0, text: 'Choosing' }, { at: 3, text: 'Experiment chosen', tone: 'run' }, { at: 4, text: 'Experiment ready', tone: 'ok' }]} />
      </div>
      <div className={`${v.panel} ${v.chart}`}>
        <svg viewBox="0 0 100 50" preserveAspectRatio="none" aria-hidden>
          <path data-k="base" d="M3 38 L 18 36 L 34 37 L 50 35" />
          <path data-k="next" d="M50 35 L 66 29 L 82 24 L 97 20" />
          <path data-k="now" d="M50 6 V 47" />
        </svg>
        <span className={v.chartLabel}>Before and after, illustrative</span>
      </div>
    </div>
  );
}

/* ------------------------------ 08 Keep Work Running: a work queue with honest states and saved project context */
function Continue({ step }: Props) {
  return (
    <div className={`${v.scene} ${v.continue}`} {...flags(step)}>
      <div className={v.project}>
        <b>Launch project</b>
        <span>history · files · decisions</span>
      </div>
      <div className={v.queue}>
        <div className={v.job}>
          <i>R</i>
          <span>Weekly report</span>
          <Swap step={step} texts={[{ at: 0, text: 'Recurring', tone: 'plan' }, { at: 1, text: 'Scheduled Mon', tone: 'plan' }, { at: 4, text: 'Next: Mon 09:00', tone: 'plan' }]} />
        </div>
        <div className={v.job}>
          <i>F</i>
          <span>Invoice follow-ups</span>
          <Swap step={step} texts={[{ at: 0, text: 'Queued', tone: 'plan' }, { at: 1, text: 'Running', tone: 'run' }, { at: 2, text: 'Done, verified', tone: 'ok' }]} />
        </div>
        <div className={v.job}>
          <i>P</i>
          <span>Pricing page fix</span>
          <Swap
            step={step}
            texts={[
              { at: 0, text: 'Queued', tone: 'plan' },
              { at: 1, text: 'Waiting: approval', tone: 'wait' },
              { at: 3, text: 'Approved', tone: 'ok' },
              { at: 4, text: 'Resumed, done', tone: 'ok' },
            ]}
          />
        </div>
        <div className={v.job}>
          <i>L</i>
          <span>Launch plan</span>
          <Swap step={step} texts={[{ at: 0, text: 'Paused', tone: 'plan' }, { at: 2, text: 'State saved', tone: 'plan' }, { at: 4, text: 'Ready to resume', tone: 'ok' }]} />
        </div>
      </div>
      <div className={v.gate}>Approve the pricing change?</div>
      <div className={v.result}>Project context preserved</div>
    </div>
  );
}

export const VIGNETTES: Record<CapabilityId, (p: Props) => JSX.Element> = {
  build: Build,
  browser: Browser,
  automate: Automate,
  launch: Launch,
  research: Research,
  data: Data,
  grow: Grow,
  continue: Continue,
};
