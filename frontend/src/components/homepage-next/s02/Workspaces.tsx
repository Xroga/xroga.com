'use client';

/**
 * What each AI Employee's own desk looks like when you come back (V10). Six different tools with six different
 * skeletons: a repository, a CRM pipeline, a brief and its evidence ledger, a content calendar, a data
 * reconciliation pipeline and an operations inbox. History is shown in each tool's own idiom (commit trail, CRM
 * activity, dated ledger, calendar, change log, triaged inbox), and the decision waiting for you sits on the
 * object it concerns. One or two things move on arrival (a new issue lands, a brief arrives, a row gets held), so
 * the desk reads as work that happened, not a static report.
 *
 * Everything is fictional sample data; decisions only mark this page's local demo state.
 */
import type { CSSProperties, ReactNode } from 'react';
import type { SurfaceProps } from './WorkforceSurface';
import type { EmployeeId } from './script';
import k from './Workspaces.module.css';

/** The decision gate, on the object it concerns. A preview decision changes nothing outside this page. */
function Gate({ e, decision, onDecide, children }: Pick<SurfaceProps, 'e' | 'decision' | 'onDecide'> & { children?: ReactNode }) {
  const d = e.ret.decision;
  return (
    <div className={k.gate} data-state={decision ?? 'waiting'}>
      <span className={k.gateQ}>
        <i aria-hidden="true" />
        {d.question}
      </span>
      {children}
      {decision ? (
        <span className={k.gateDone} role="status">
          {decision === 'approved' ? 'Approved in this preview' : 'Held in this preview'} · nothing real was changed
        </span>
      ) : (
        <span className={k.gateBtns}>
          <button type="button" className={k.approve} onClick={() => onDecide('approved')}>
            {d.approve}
          </button>
          <button type="button" className={k.hold} onClick={() => onDecide('held')}>
            {d.hold}
          </button>
        </span>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------------------- Software Builder · repo */
function Builder(p: SurfaceProps) {
  return (
    <div className={k.repo}>
      <section className={k.queue} aria-label="Bug queue">
        <span className={k.label}>Bug queue · dashboard-app</span>
        <Issue n="#487" title="Session lost on project switch" state="fixed" note="Fixed · PR #212" />
        <Issue n="#489" title="CSV export drops the last row" state="fixed" note="Fixed · PR #213" />
        <Issue n="#485" title="Flaky date-picker test" state="decision" note="Needs your call" />
        <Issue n="#491" title="Theme toggle resets on reload" state="new" note="Filed Tue 15:20 · queued Wed 07:00" />
      </section>
      <section className={k.pr} aria-label="Pull request 212">
        <div className={k.prHead}>
          <b>PR #212 · Keep session on project switch</b>
          <small>builder/fix-487 → main · +6 −2</small>
        </div>
        <pre className={k.diff}>
          <span data-mark="old">−  await auth.signOut();</span>
          <span data-mark="new">+  await session.switchProject(projectId);</span>
          <span data-mark="new">+  expect(user.signedIn).toBe(true);</span>
        </pre>
        <div className={k.ci}>
          {[
            ['Lint', 'pass'],
            ['Unit 18/18', 'pass'],
            ['Browser check', 'pass'],
            ['Preview deploy', 'pass'],
          ].map(([n, s]) => (
            <span key={n} data-s={s}>
              {n}
            </span>
          ))}
        </div>
        <Gate {...p} />
      </section>
      <section className={k.trail} aria-label="Activity">
        <span className={k.label}>Activity</span>
        {[
          ['07:00', 'Triaged 3 new issues'],
          ['07:54', 'Reproduced #487 in a test'],
          ['09:36', 'Opened PR #212, tests green'],
          ['11:48', 'Paused on #485, asked you'],
          ['15:20', 'Queued new issue #491'],
        ].map(([t, x]) => (
          <span key={t} className={k.commit}>
            <i />
            <time>Tue {t}</time>
            {x}
          </span>
        ))}
      </section>
    </div>
  );
}
function Issue({ n, title, state, note }: { n: string; title: string; state: 'fixed' | 'decision' | 'new'; note: string }) {
  return (
    <div className={k.issue} data-state={state}>
      <span className={k.issueN}>{n}</span>
      <span>
        <b>{title}</b>
        <small>{note}</small>
      </span>
    </div>
  );
}

/* ----------------------------------------------------------------------------- Growth Strategist · CRM */
function Growth(p: SurfaceProps) {
  return (
    <div className={k.crm}>
      <section className={k.input} data-arrived={p.handoff || undefined} aria-label="Input from Research">
        <span className={k.doc} aria-hidden="true" />
        <span>
          <small>Input · from Research Analyst · Tue 06:10</small>
          <b>Decision brief #7: partner-led entry, confidence high</b>
        </span>
        <em>Applied 06:20</em>
      </section>
      <section className={k.pipeline} aria-label="Pipeline">
        {[
          { h: 'Researching', n: 8, cards: [['Pine Family Care', 64], ['Northgate Ortho', 58]] },
          { h: 'Qualified', n: 5, cards: [['Elm Street Dental', 88], ['Brightway Clinic', 81]] },
          { h: 'Outreach drafted', n: 3, cards: [['Harbor Smiles', 92], ['Elm Street Dental', 88], ['Brightway Clinic', 81]] },
        ].map((col) => (
          <div key={col.h} className={k.stage}>
            <span className={k.label}>
              {col.h} <em>{col.n}</em>
            </span>
            {col.cards.map(([name, fit], i) => (
              <span key={`${name}${i}`} className={k.deal} data-draft={col.h === 'Outreach drafted' || undefined} style={{ '--d': `${i * 120}ms` } as CSSProperties}>
                <i>{String(name)[0]}</i>
                <b>{name}</b>
                <em>{fit}</em>
              </span>
            ))}
          </div>
        ))}
      </section>
      <section className={k.channels} aria-label="Channel performance">
        <span className={k.label}>Channels · last 30 days</span>
        {[
          ['Referral partners', 38],
          ['Search', 24],
          ['Email', 12],
        ].map(([c, v]) => (
          <span key={c} className={k.bar} style={{ '--v': `${v}%` } as CSSProperties}>
            <span>{c}</span>
            <i />
            <b>{v}%</b>
          </span>
        ))}
        <Gate {...p}>
          <small className={k.gateNote}>Drafts to Harbor Smiles, Elm Street Dental and Brightway Clinic</small>
        </Gate>
      </section>
    </div>
  );
}

/* --------------------------------------------------------------------- Research Analyst · brief + ledger */
function Research(p: SurfaceProps) {
  return (
    <div className={k.research}>
      <article className={k.brief} aria-label="Decision brief 7">
        <small>Decision brief #7 · v7 · updated Tue 04:00</small>
        <h4>Enter through referral partners first.</h4>
        <p>
          Mid-size clinics adopt booking software fastest when a trusted partner recommends it<sup>[2]</sup>. Partner margins
          hold up in the new survey<sup>[5]</sup>; direct sales stay slower<sup>[3]</sup>.
        </p>
        <div className={k.confidence}>
          <span>Confidence</span>
          <span className={k.meter} data-from="2" data-to="3">
            <i />
            <i />
            <i />
          </span>
          <b>medium → high</b>
        </div>
        <span className={k.cites}>
          {[1, 2, 3, 4, 5, 6, 7].map((n) => (
            <i key={n} data-new={n >= 5 || undefined}>
              [{n}]
            </i>
          ))}
        </span>
      </article>
      <section className={k.ledger} aria-label="Evidence ledger">
        <span className={k.label}>Evidence ledger</span>
        {[
          ['Tue 03:36', 'Clinic survey 2026', 'Adoption 31% → 38%', 'changed'],
          ['Tue 03:38', 'Partner pricing pages', 'Margins steady', 'changed'],
          ['Tue 03:40', 'Competitor filing', 'New referral program', 'new'],
          ['Tue 06:10', 'Brief #7 → Growth Strategist', 'Handed off', 'handoff'],
          ['Fri 02:00', 'Industry report', 'No change', 'old'],
        ].map(([t, src, note, s]) => (
          <span key={src} className={k.entry} data-s={s}>
            <time>{t}</time>
            <b>{src}</b>
            <em>{note}</em>
          </span>
        ))}
        <Gate {...p}>
          <small className={k.gateNote}>Paywalled source found while scanning; not bought</small>
        </Gate>
      </section>
    </div>
  );
}

/* ------------------------------------------------------------------- Creative Producer · content calendar */
function Creative(p: SurfaceProps) {
  const days: { d: string; items: { t: string; label: string; s: 'done' | 'review' | 'ready' | 'empty' }[] }[] = [
    { d: 'Mon', items: [{ t: '10:00', label: 'Teaser · approved Fri', s: 'done' }] },
    { d: 'Tue', items: [{ t: '—', label: 'No post', s: 'empty' }] },
    { d: 'Wed', items: [{ t: '10:00', label: 'Post 4 · launch week', s: 'review' }] },
    { d: 'Thu', items: [{ t: '—', label: 'No post', s: 'empty' }] },
    { d: 'Fri', items: [{ t: '10:00', label: 'Post 5 · customer quote', s: 'ready' }] },
  ];
  return (
    <div className={k.studio}>
      <section className={k.week} aria-label="Content calendar">
        {days.map((day) => (
          <div key={day.d} className={k.day} data-today={day.d === 'Tue' || undefined}>
            <span className={k.dayName}>{day.d}</span>
            {day.items.map((it) => (
              <span key={it.label} className={k.post} data-s={it.s}>
                <time>{it.t}</time>
                {it.label}
              </span>
            ))}
          </div>
        ))}
      </section>
      <section className={k.library} aria-label="Asset library">
        <span className={k.label}>Asset library · Post 4 · drafted Tue 08:00–11:40</span>
        <div className={k.assets}>
          <Asset kind="wide" label="Web hero 16:9" />
          <Asset kind="square" label="Square 1:1" />
          <Asset kind="story" label="Story 9:16 · v2" note="Headline re-set (v1 cropped)" />
        </div>
      </section>
      <Gate {...p} />
    </div>
  );
}
function Asset({ kind, label, note }: { kind: 'wide' | 'square' | 'story'; label: string; note?: string }) {
  return (
    <span className={k.asset} data-kind={kind}>
      <span className={k.assetFace}>
        <span className={k.assetOrb} />
        <b>Launch week</b>
        <i className={k.newTag}>New</i>
      </span>
      <small>{label}</small>
      {note && <small className={k.assetNote}>{note}</small>}
    </span>
  );
}

/* ---------------------------------------------------------------- Data Specialist · reconciliation run */
function Data(p: SurfaceProps) {
  return (
    <div className={k.data}>
      <section className={k.sources} aria-label="Sources">
        {[
          ['Billing export', '2,104 rows'],
          ['CRM contacts', '1,986 rows'],
          ['Customer sheet', '722 rows'],
        ].map(([n, r]) => (
          <span key={n} className={k.source}>
            <b>{n}</b>
            <small>{r} · Tue 01:00</small>
          </span>
        ))}
        <span className={k.arrow} aria-hidden="true">
          →
        </span>
        <span className={k.source} data-out="">
          <b>customers_clean.csv</b>
          <small>4,812 checked · 37 changes</small>
        </span>
      </section>
      <section className={k.changes} aria-label="Change log">
        <span className={k.label}>Change log · every change reversible</span>
        {[
          ['luis@@elm.example', 'luis@elm.example', 'Email fixed'],
          ['OLD TOWN', 'Old Town', 'City normalized'],
          ['+1 (555) 0100 ', '+1 555 0100', 'Phone formatted'],
          ['Maya Chen ×2', 'kept both · held', 'Possible duplicate'],
        ].map(([a, b, why]) => (
          <span key={a} className={k.change} data-held={why === 'Possible duplicate' || undefined}>
            <s>{a}</s>
            <i aria-hidden="true">→</i>
            <b>{b}</b>
            <em>{why}</em>
          </span>
        ))}
        <span className={k.more}>+ 33 more safe fixes</span>
      </section>
      <section className={k.held} aria-label="Held rows">
        <span className={k.label}>Held for you · 4 rows</span>
        {[
          ['Maya Chen', 'Same email, two billing IDs'],
          ['Maya Chen', 'Same email, two billing IDs'],
          ['J. Okafor', 'No email, unclear city'],
          ['Test Account', 'Looks like test data'],
        ].map(([n, why], i) => (
          <span key={i} className={k.heldRow} style={{ '--d': `${i * 140}ms` } as CSSProperties}>
            <b>{n}</b>
            <em>{why}</em>
          </span>
        ))}
        <Gate {...p} />
      </section>
    </div>
  );
}

/* ---------------------------------------------------------------- Operations Manager · inbox + calendar */
function Ops(p: SurfaceProps) {
  return (
    <div className={k.ops}>
      <p className={k.opsSummary}>
        <b>3 requests triaged</b> · <b>2 replies drafted</b> · <b>1 decision needed</b> · next run Wed 09:00
      </p>
      <section className={k.inbox} aria-label="Inbox">
        {[
          { who: 'Maya Chen', ask: 'Can we move Thursday to the morning?', out: 'Held Thu 10:30 · reply drafted', s: 'drafted' },
          { who: 'Priya Nair', ask: 'Booking for two in May', out: 'Held Fri 14:00 · reply drafted', s: 'drafted' },
          { who: 'Luis Ortega', ask: 'Tuesday or Wednesday works?', out: 'Two dates: needs you', s: 'decision' },
        ].map((m, i) => (
          <span key={m.who} className={k.mail} data-s={m.s} style={{ '--d': `${i * 160}ms` } as CSSProperties}>
            <b>{m.who}</b>
            <span>{m.ask}</span>
            <em>{m.out}</em>
          </span>
        ))}
      </section>
      <section className={k.cal} aria-label="Calendar">
        <span className={k.label}>This week</span>
        <div className={k.calGrid}>
          {['Thu', 'Fri'].map((d) => (
            <div key={d} className={k.calDay}>
              <span>{d}</span>
              <i className={k.slot} data-s="busy" style={{ top: '12%' }}>
                Stand-up
              </i>
              {d === 'Thu' && (
                <i className={k.slot} data-s="held" style={{ top: '38%' }}>
                  Maya · 10:30 held
                </i>
              )}
              {d === 'Fri' && (
                <i className={k.slot} data-s="held" style={{ top: '64%' }}>
                  Priya ×2 · 14:00 held
                </i>
              )}
            </div>
          ))}
        </div>
        <small className={k.crmNote}>CRM updated: 2 visits, 1 new contact</small>
      </section>
      <section className={k.draft} aria-label="Draft reply">
        <span className={k.label}>Draft reply · in your tone</span>
        <p>Hi Maya, done: Thursday at 10:30 is yours. See you then. — Sam</p>
        <Gate {...p} />
      </section>
    </div>
  );
}

export const EMPLOYEE_SURFACES: Record<EmployeeId, (p: SurfaceProps) => ReactNode> = {
  builder: Builder,
  growth: Growth,
  research: Research,
  creative: Creative,
  data: Data,
  ops: Ops,
};
