'use client';

/**
 * Six AI Employee workspaces, one per specialist, each built from the materials of that job: an editor and
 * terminal, a prospect board, an evidence canvas, a campaign board, a spreadsheet and an operations desk. The
 * one real handoff runs Research → Growth: the analyst's brief arrives on the strategist's board. All people,
 * companies and figures are fictional sample data.
 */
import type { ReactNode } from 'react';
import type { Ctx } from './ctx';
import type { EmployeeId } from './script';
import w from './Workspaces.module.css';

export interface EmployeeApp {
  App: (p: { ctx: Ctx; briefSent: boolean }) => ReactNode;
  /** Window chrome flavour. */
  chrome: 'editor' | 'board' | 'canvas' | 'sheet' | 'desk';
}

const on = (v: boolean) => v || undefined;

/* ------------------------------------------------------------------------------------ Software Builder */
function BuilderApp({ ctx }: { ctx: Ctx }) {
  const open = ctx.at('open');
  const found = ctx.at('find');
  const edited = ctx.at('edit');
  const running = ctx.now('test');
  const passed = ctx.at('pass');
  return (
    <div className={w.ide}>
      <aside className={w.tree}>
        <span className={w.treeHead}>dashboard-app</span>
        <span>components/</span>
        <span data-t="b.file" data-on={on(open)}>
          session.ts
        </span>
        <span>projects.ts</span>
        <span>session.test.ts</span>
      </aside>
      <div className={w.editor} data-open={on(open)}>
        <div className={w.edTabs}>
          <span data-on="">session.ts</span>
          {edited && <span className={w.diffStat}>+6 −2</span>}
        </div>
        <pre className={w.code}>
          <Line n={41}>
            <K>export async function</K> <F>selectProject</F>(projectId: <T>string</T>) {'{'}
          </Line>
          <Line n={42}>
            {'  '}
            <K>const</K> project = <K>await</K> projects.get(projectId);
          </Line>
          {!edited ? (
            <Line n={43} t="b.bug" mark={found ? 'bad' : undefined}>
              {'  '}
              <K>await</K> auth.signOut(); <C>{'// resets the session'}</C>
            </Line>
          ) : (
            <Line n={43} mark="old">
              {'  '}
              <K>await</K> auth.signOut();
            </Line>
          )}
          <Line n={44} t="b.edit" mark={edited ? 'new' : undefined}>
            {'  '}
            {ctx.at('edit') ? ctx.field('edit') : <C>{'// '}</C>}
          </Line>
          <Line n={45}>
            {'  '}router.push(<S>`/p/${'{'}project.slug{'}'}`</S>);
          </Line>
          <Line n={46}>{'}'}</Line>
        </pre>
        <div className={w.term}>
          <div className={w.termHead}>
            <span>Terminal</span>
            <span className={w.run} data-t="b.run" data-busy={on(running)}>
              {running ? 'Running…' : 'Run tests'}
            </span>
          </div>
          <code className={w.termBody}>
            <span>$ npm test session</span>
            {ctx.at('test') && <span className={w.dim}>✓ keeps the user signed in on project switch</span>}
            <span data-t="b.result" className={w.pass} data-show={on(passed)}>
              Tests 18 passed (18) · 1.9 s
            </span>
          </code>
        </div>
      </div>
    </div>
  );
}
const K = ({ children }: { children: ReactNode }) => <i className={w.kw}>{children}</i>;
const F = ({ children }: { children: ReactNode }) => <i className={w.fn}>{children}</i>;
const T = ({ children }: { children: ReactNode }) => <i className={w.ty}>{children}</i>;
const S = ({ children }: { children: ReactNode }) => <i className={w.st}>{children}</i>;
const C = ({ children }: { children: ReactNode }) => <i className={w.cm}>{children}</i>;
function Line({ n, t, mark, children }: { n: number; t?: string; mark?: 'bad' | 'new' | 'old'; children: ReactNode }) {
  return (
    <span className={w.line} data-t={t} data-mark={mark}>
      <b>{mark === 'new' ? '+' : mark === 'old' ? '−' : n}</b>
      <span>{children}</span>
    </span>
  );
}

/* ----------------------------------------------------------------------------------- Growth Strategist */
const PROSPECTS = [
  { n: 'Harbor Smiles', d: '14 staff · Northside', fit: 92 },
  { n: 'Elm Street Dental', d: '22 staff · Riverside', fit: 88 },
  { n: 'Brightway Clinic', d: '31 staff · Old Town', fit: 81 },
  { n: 'Pine Family Care', d: '9 staff · Eastgate', fit: 64 },
];
function GrowthApp({ ctx, briefSent }: { ctx: Ctx; briefSent: boolean }) {
  const seg = ctx.at('segment');
  const picked = ctx.at('shortlist');
  const pitched = ctx.at('pitch');
  const ready = ctx.at('pipeline');
  return (
    <div className={w.board}>
      <div className={w.col}>
        <span className={w.colHead}>Inputs</span>
        <div className={w.card} data-t="g.brief" data-from={briefSent ? 'research' : undefined} data-on={on(ctx.now('brief'))}>
          <span className={w.cardKicker}>{briefSent ? 'From Research Analyst' : 'Market brief'}</span>
          <b>Partner-led entry</b>
          <span className={w.cardText}>Mid-size clinics adopt fastest through referral partners.</span>
          {briefSent && <span className={w.handoff}>Handed off</span>}
        </div>
        <div className={w.segment} data-t="g.segment" data-on={on(seg)}>
          <span>Segment</span>
          <b>Dental clinics · 10–40 staff</b>
        </div>
      </div>
      <div className={w.col} data-wide="">
        <span className={w.colHead}>Prospects {seg ? <em>· 4 match</em> : null}</span>
        {PROSPECTS.map((p, i) => (
          <div
            key={p.n}
            className={w.prospect}
            data-t={i === 0 ? 'g.pick' : undefined}
            data-show={on(seg)}
            data-pick={on(picked && i < 3)}
            data-dim={on(picked && i === 3)}
            style={{ transitionDelay: `${i * 90}ms` }}
          >
            <span className={w.avatar}>{p.n[0]}</span>
            <span>
              <b>{p.n}</b>
              <small>{p.d}</small>
            </span>
            <span className={w.fit}>{p.fit}</span>
          </div>
        ))}
      </div>
      <div className={w.col}>
        <span className={w.colHead}>Outreach</span>
        <div className={w.card} data-t="g.pitch" data-show={on(pitched)}>
          <span className={w.cardKicker}>Harbor Smiles</span>
          <span className={w.cardText}>“Your Saturday slots fill fast. A partner referral flow could fill the weekdays.”</span>
        </div>
        <div className={w.ready} data-t="g.ready" data-show={on(ready)}>
          <b>3 drafts ready</b>
          <span>Waiting for your approval</span>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------------------------ Research Analyst */
const SOURCES = ['Industry report 2026', 'Clinic survey (n=212)', 'Partner pricing pages', 'Competitor filings', 'Analyst interview', 'Trade forum threads', 'Census business data'];
const OPTIONS = [
  { n: 'Direct sales', s: [3, 2, 2] },
  { n: 'Partner-led', s: [4, 4, 3] },
  { n: 'Self-serve', s: [2, 3, 4] },
];
function ResearchApp({ ctx }: { ctx: Ctx }) {
  const src = ctx.at('sources');
  const scored = ctx.at('score');
  const risk = ctx.at('risk');
  const rec = ctx.at('recommend');
  const sent = ctx.at('handoff');
  return (
    <div className={w.canvas}>
      <div className={w.sources} data-t="r.sources">
        <span className={w.colHead}>Sources {src ? <em>· 7 read</em> : null}</span>
        {SOURCES.map((s, i) => (
          <span key={s} className={w.source} data-on={on(src)} style={{ transitionDelay: `${i * 70}ms` }}>
            <i />
            {s}
          </span>
        ))}
      </div>
      <div className={w.analysis}>
        <table className={w.matrix} data-t="r.matrix" data-on={on(scored)}>
          <thead>
            <tr>
              <th>Option</th>
              <th>Reach</th>
              <th data-t="r.risk" data-flag={on(risk)}>
                Margin
              </th>
              <th>Speed</th>
            </tr>
          </thead>
          <tbody>
            {OPTIONS.map((o) => (
              <tr key={o.n} data-best={on(rec && o.n === 'Partner-led')}>
                <td>{o.n}</td>
                {o.s.map((v, i) => (
                  <td key={i}>
                    <span className={w.dots} data-v={scored ? v : 0}>
                      {[0, 1, 2, 3].map((d) => (
                        <i key={d} />
                      ))}
                    </span>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        <div className={w.rec} data-t="r.rec" data-show={on(rec)}>
          <span className={w.cardKicker}>Recommendation · medium confidence</span>
          <b>Enter through referral partners first.</b>
          <span className={w.cardText}>Fastest reach at acceptable cost. Margin data is thin; verify with two partners.</span>
        </div>
        <span className={w.send} data-t="r.send" data-sent={on(sent)}>
          {sent ? 'Brief sent to Growth Strategist' : 'Send brief to Growth'}
        </span>
      </div>
    </div>
  );
}

/* ----------------------------------------------------------------------------------- Creative Producer */
function CreativeApp({ ctx }: { ctx: Ctx }) {
  const frames = ctx.at('frames');
  const formats = ctx.at('formats');
  const fixed = ctx.at('fix');
  return (
    <div className={w.studio}>
      <div className={w.frames}>
        <span className={w.colHead}>Storyboard</span>
        <div className={w.frameRow}>
          {['Problem', 'Product', 'Proof', 'Offer'].map((f, i) => (
            <span key={f} className={w.frame} data-t={i === 1 ? 'c.frame' : undefined} data-on={on(frames)} data-n={i} style={{ transitionDelay: `${i * 90}ms` }}>
              <i />
              {f}
            </span>
          ))}
        </div>
      </div>
      <div className={w.formats} data-t="c.formats" data-on={on(formats)}>
        <span className={w.colHead}>Formats</span>
        <div className={w.formatRow}>
          <Art kind="wide" label="Web hero · 16:9" />
          <Art kind="square" label="Post · 1:1" />
          <span className={w.storyWrap} data-t="c.note">
            <Art kind="story" label="Story · 9:16" crop={!fixed} />
          </span>
        </div>
      </div>
      <span className={w.swap} data-t="c.swap" data-ok={on(fixed)}>
        {fixed ? 'Headline re-set for story' : 'Re-set story headline'}
      </span>
    </div>
  );
}
function Art({ kind, label, crop }: { kind: 'wide' | 'square' | 'story'; label: string; crop?: boolean }) {
  return (
    <span className={w.art} data-kind={kind}>
      <span className={w.artFace} data-crop={on(!!crop)}>
        <span className={w.artOrb} />
        <b>Launch week</b>
      </span>
      <small>{label}</small>
    </span>
  );
}

/* -------------------------------------------------------------------------------------- Data Specialist */
const ROWS: { n: string; e: string; c: string; kind?: 'dupe' | 'email' | 'hold' | 'norm' }[] = [
  { n: 'Maya Chen', e: 'maya@harbor.example', c: 'Northside' },
  { n: 'Maya Chen', e: 'maya@harbor.example', c: 'northside', kind: 'dupe' },
  { n: 'Luis Ortega', e: 'luis@@elm.example', c: 'Riverside', kind: 'email' },
  { n: 'Priya Nair', e: 'priya@bright.example', c: 'OLD TOWN', kind: 'norm' },
  { n: 'J. Okafor', e: '—', c: '?', kind: 'hold' },
  { n: 'Sam Lee', e: 'sam@pine.example', c: 'Eastgate' },
  { n: 'Sam Lee', e: 'sam@pine.example', c: 'Eastgate ', kind: 'dupe' },
  { n: 'Test Account', e: 'test@test', c: '', kind: 'hold' },
];
function DataApp({ ctx }: { ctx: Ctx }) {
  const dupes = ctx.at('dupes');
  const invalid = ctx.at('invalid');
  const applied = ctx.at('normalize');
  const held = ctx.at('hold');
  let firstDupe = true;
  let firstHold = true;
  return (
    <div className={w.sheet}>
      <div className={w.sheetBar}>
        <span className={w.fx}>fx</span>
        <span className={w.formula}>{applied ? '=CLEAN(TRIM(PROPER(C2:C9)))' : '=C2'}</span>
        <span className={w.applyBtn} data-t="d.apply" data-ok={on(applied)}>
          {applied ? '5 fixes applied' : 'Apply fixes'}
        </span>
      </div>
      <div className={w.grid} role="presentation">
        <span className={w.gh} />
        <span className={w.gh}>Name</span>
        <span className={w.gh}>Email</span>
        <span className={w.gh}>City</span>
        <span className={w.gh}>Status</span>
        {ROWS.map((r, i) => {
          const dupeT = r.kind === 'dupe' && firstDupe ? ((firstDupe = false), 'd.dupe') : undefined;
          const holdT = r.kind === 'hold' && firstHold ? ((firstHold = false), 'd.hold') : undefined;
          const merged = applied && r.kind === 'dupe';
          const state =
            r.kind === 'dupe' && dupes ? (merged ? 'merged' : 'dupe') : r.kind === 'email' && invalid ? (applied ? 'fixed' : 'bad') : r.kind === 'norm' && applied ? 'fixed' : r.kind === 'hold' && held ? 'held' : undefined;
          return (
            <div key={i} className={w.row} data-state={state} data-t={dupeT ?? holdT}>
              <span className={w.rn}>{i + 2}</span>
              <span>{r.n}</span>
              <span data-t={r.kind === 'email' ? 'd.email' : undefined}>{r.kind === 'email' && applied ? 'luis@elm.example' : r.e}</span>
              <span>{r.kind === 'norm' && applied ? 'Old Town' : r.c}</span>
              <span className={w.status}>{state === 'merged' ? 'Merged' : state === 'dupe' ? 'Duplicate' : state === 'bad' ? 'Fixable' : state === 'fixed' ? 'Fixed' : state === 'held' ? 'Held for you' : ''}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------------- Operations Manager */
function OpsApp({ ctx }: { ctx: Ctx }) {
  const opened = ctx.at('open');
  const clash = ctx.at('conflict');
  const moved = ctx.at('reslot');
  const crm = ctx.at('crm');
  const draft = ctx.at('draft');
  return (
    <div className={w.ops}>
      <div className={w.inbox}>
        <span className={w.colHead}>Requests</span>
        <div className={w.mail} data-t="o.req" data-on={on(opened)} data-new={on(!opened)}>
          <b>Maya Chen</b>
          <span>Can we move Thursday’s visit to the morning?</span>
        </div>
        <div className={w.mail}>
          <b>Luis Ortega</b>
          <span>Invoice received, thanks!</span>
        </div>
        <div className={w.mail}>
          <b>Priya Nair</b>
          <span>Booking for two in May</span>
        </div>
      </div>
      <div className={w.cal}>
        <span className={w.colHead}>Thursday</span>
        {['9:00', '10:00', '11:00', '12:00'].map((h) => (
          <span key={h} className={w.hour}>
            {h}
          </span>
        ))}
        <span className={w.slot} data-kind="busy" style={{ top: 58 }}>
          Team stand-up
        </span>
        <span className={w.slot} data-kind="busy" style={{ top: 120 }} data-t="o.clash" data-flag={on(clash && !moved)}>
          Northside visit
        </span>
        <span className={w.slot} data-kind="try" data-show={on(clash)} data-gone={on(moved)} style={{ top: 132 }}>
          Maya · 10:00?
        </span>
        <span className={w.slot} data-kind="new" data-t="o.alt" data-show={on(moved)} style={{ top: 155 }}>
          Maya Chen · 10:30
        </span>
      </div>
      <div className={w.side}>
        <div className={w.crm} data-t="o.crm" data-on={on(crm)}>
          <span className={w.cardKicker}>Client record</span>
          <b>Maya Chen · Harbor Smiles</b>
          <span className={w.cardText}>Next visit: {crm ? <mark>Thu 10:30</mark> : 'Thu 15:00'}</span>
        </div>
        <div className={w.draft} data-t="o.draft" data-show={on(draft)}>
          <span className={w.cardKicker}>Draft reply</span>
          <span className={w.cardText}>Hi Maya, done: Thursday at 10:30. See you then.</span>
          <span className={w.approve}>Approve &amp; send</span>
        </div>
      </div>
    </div>
  );
}

export const EMPLOYEE_APPS: Record<EmployeeId, EmployeeApp> = {
  builder: { App: BuilderApp, chrome: 'editor' },
  growth: { App: GrowthApp, chrome: 'board' },
  research: { App: ResearchApp, chrome: 'canvas' },
  creative: { App: CreativeApp, chrome: 'board' },
  data: { App: DataApp, chrome: 'sheet' },
  ops: { App: OpsApp, chrome: 'desk' },
};
