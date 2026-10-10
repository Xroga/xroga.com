'use client';

/**
 * The left side of the stage: what Xroga is producing. Each job has its own silhouette: an app shell,
 * a browser, an operations graph, an idea-research board, a product spread across platforms, a customer
 * table being cleaned and a growth loop. Every external call and every native step changes something
 * visible here. Objects are laid out once at 318 × 197 and scaled per breakpoint.
 */
import Image from 'next/image';
import { DESTINATIONS, type DestinationId } from './destinationMarks';
import { Mark } from './Mark';
import { WORK_COPY } from './copy';
import type { ProviderId } from './providerMarks';
import type { WorkKind } from './orchestration';
import s from './WorkObject.module.css';

const W = WORK_COPY;
type Fx = Set<string>;

function Dest({ id }: { id: DestinationId }) {
  return (
    <svg className={s.destMark} viewBox="0 0 24 24" aria-hidden="true">
      <path d={DESTINATIONS[id].d} />
    </svg>
  );
}

function Status({ text, tone }: { text: string; tone: 'idle' | 'live' | 'ok' | 'warn' | 'fail' }) {
  return (
    <div className={s.status}>
      <i data-tone={tone} />
      <span key={text} className={s.statusText}>
        {text}
      </span>
    </div>
  );
}

/** The small Xroga badge that marks work Xroga does itself. */
function XrogaChip({ label, on = true }: { label: string; on?: boolean }) {
  return (
    <span className={s.worker} data-on={on || undefined}>
      <Image src="/homepage/orb/xroga-orb-icon.webp" alt="" width={14} height={14} />
      {label}
    </span>
  );
}

const latest = <K extends string>(fx: Fx, order: readonly K[]): K | undefined => [...order].reverse().find((k) => fx.has(k));

/* ---------- Brief: the input the SaaS is built from ---------- */
function Brief({ sending }: { sending: boolean }) {
  return (
    <div className={s.brief} data-sending={sending || undefined}>
      <span className={s.briefIcon} aria-hidden="true" />
      <div>
        <b>{W.brief.title}</b>
        <span>{W.brief.meta}</span>
      </div>
      <div className={s.reqs}>
        {W.brief.reqs.map((r) => (
          <span key={r}>{r}</span>
        ))}
      </div>
      <svg className={s.sketch} viewBox="0 0 120 34" aria-hidden="true">
        <rect x="1" y="9" width="30" height="16" rx="3" />
        <rect x="45" y="1" width="30" height="14" rx="3" />
        <rect x="45" y="19" width="30" height="14" rx="3" />
        <rect x="89" y="9" width="30" height="16" rx="3" />
        <path d="M31 17h14M75 8l14 9M75 26l14-9" />
      </svg>
    </div>
  );
}

/* ---------- Production SaaS ---------- */
const SAAS_ORDER = ['shell', 'auth', 'billing', 'repo', 'live'] as const;
function Saas({ fx }: { fx: Fx }) {
  const st = latest(fx, SAAS_ORDER) ?? 'shell';
  const navOn = [fx.has('shell'), fx.has('billing'), fx.has('shell'), fx.has('live')];
  return (
    <div className={s.window} data-kind="saas" data-done={fx.has('live') || undefined}>
      <div className={s.rail}>
        <span className={s.dots} aria-hidden="true">
          <i />
          <i />
          <i />
        </span>
        <span className={s.url} data-on={fx.has('live') || undefined}>
          {fx.has('live') ? W.saas.url : ''}
        </span>
        {fx.has('repo') && (
          <span className={s.tag}>
            <Mark id="github" className={s.inline} />
            {W.saas.branch}
          </span>
        )}
      </div>
      <div className={s.saasBody}>
        <nav className={s.saasNav}>
          {W.saas.nav.map((n, i) => (
            <span key={n} data-on={navOn[i] || undefined}>
              {n}
            </span>
          ))}
        </nav>
        <div className={s.saasMain}>
          <div className={s.saasTop}>
            <b>{W.saas.title}</b>
            <span className={s.btn} data-done={fx.has('live') || undefined}>
              {W.saas.test}
            </span>
          </div>
          <div className={s.saasGrid}>
            {fx.has('auth') && (
              <span className={s.tile}>
                <Mark id="supabase" className={s.inline} />
                {W.saas.auth}
              </span>
            )}
            {fx.has('billing') && (
              <span className={s.tile}>
                <Mark id="stripe" className={s.inline} />
                {W.saas.plan}
              </span>
            )}
            {fx.has('shell') && (
              <span className={s.roles}>
                {W.saas.roles.map((r) => (
                  <i key={r}>{r}</i>
                ))}
              </span>
            )}
            {fx.has('live') && (
              <svg className={s.bars} viewBox="0 0 60 22" aria-hidden="true">
                {[6, 10, 8, 14, 12, 18, 20].map((h, i) => (
                  <rect key={i} x={i * 8 + 1} y={22 - h} width="5" height={h} rx="1" style={{ animationDelay: `${i * 40}ms` }} />
                ))}
              </svg>
            )}
          </div>
        </div>
      </div>
      <Status text={W.saas.status[st]} tone={fx.has('live') ? 'ok' : 'live'} />
      {fx.has('live') && <span className={s.outPulse} aria-hidden="true" />}
    </div>
  );
}

/* ---------- Browser QA, diagnosis and repair ---------- */
const QA_ORDER = ['start', 'failed', 'isolated', 'repaired', 'committed', 'paid', 'verified', 'released'] as const;
function Qa({ fx, cursor }: { fx: Fx; cursor: string | null }) {
  const st = latest(fx, QA_ORDER) ?? 'start';
  const broken = fx.has('failed') && !fx.has('repaired');
  const onStep2 = fx.has('verified');
  const tone = broken ? 'fail' : fx.has('verified') ? 'ok' : 'live';
  return (
    <div className={s.window} data-kind="qa" data-done={fx.has('released') || undefined}>
      <div className={s.rail}>
        <span className={s.dots} aria-hidden="true">
          <i />
          <i />
          <i />
        </span>
        <span className={s.url} data-on>
          {W.qa.url}
        </span>
        {fx.has('committed') && (
          <span className={s.tag}>
            <Mark id="github" className={s.inline} />
            {W.qa.fixTag}
          </span>
        )}
      </div>
      <div className={s.page}>
        <div className={s.stepper}>
          <span data-on>{W.qa.steps[0]}</span>
          <i data-on={onStep2 || undefined} />
          <span data-on={onStep2 || undefined}>{W.qa.steps[1]}</span>
        </div>
        {!onStep2 ? (
          <div className={s.form}>
            <span className={s.field} data-focus={cursor === 'email' || undefined} data-ok={fx.has('failed') || cursor === 'pay' || undefined}>
              {W.qa.email}
            </span>
            <span className={s.field}>{W.qa.card}</span>
            <span
              className={s.pay}
              data-hover={cursor === 'hover' || cursor === 'pay' || undefined}
              data-pressed={cursor === 'press' || undefined}
              data-broken={broken || undefined}
              data-fixed={(fx.has('repaired') && !fx.has('paid')) || undefined}
              data-paid={fx.has('paid') || undefined}
            >
              {fx.has('paid') ? '✓' : W.qa.pay}
            </span>
            {broken && (
              <span className={s.defect}>
                {fx.has('isolated') && <Mark id="sentry" className={s.inline} />}
                {fx.has('isolated') ? W.qa.isolated : W.qa.defect}
              </span>
            )}
          </div>
        ) : (
          <div className={s.welcome}>
            <b>{W.qa.welcome}</b>
            <i />
            <i />
          </div>
        )}
      </div>
      <Status text={W.qa.status[st]} tone={tone} />
      {cursor && cursor !== 'rest' && <span className={s.cursor} data-pos={`qa-${cursor}`} aria-hidden="true" />}
      {fx.has('verified') && !fx.has('released') && <span className={s.sweep} aria-hidden="true" />}
      {fx.has('released') && (
        <span className={s.release}>
          <Mark id="vercel" className={s.inline} />
        </span>
      )}
      {fx.has('released') && <span className={s.outPulse} aria-hidden="true" />}
    </div>
  );
}

/* ---------- Dental clinic front desk, run by a Xroga worker ---------- */
const CLINIC_ORDER = ['inquiry', 'qualified', 'booked', 'crm', 'followup'] as const;
const CLINIC_NODES: { id: (typeof CLINIC_ORDER)[number]; mark?: ProviderId; col: 0 | 1; row: number }[] = [
  { id: 'inquiry', col: 0, row: 0 },
  { id: 'qualified', col: 0, row: 1 },
  { id: 'booked', mark: 'googlecalendar', col: 1, row: 0 },
  { id: 'crm', mark: 'hubspot', col: 1, row: 1 },
  { id: 'followup', mark: 'gmail', col: 1, row: 2 },
];
function Clinic({ fx }: { fx: Fx }) {
  const st = latest(fx, CLINIC_ORDER) ?? 'inquiry';
  return (
    <div className={s.ops}>
      <div className={s.opsHead}>
        <XrogaChip label={W.clinic.worker} on={fx.has('inquiry')} />
        <b>{W.clinic.title}</b>
      </div>
      <svg className={s.opsLinks} viewBox="0 0 318 150" aria-hidden="true">
        <path d="M76 70v8" data-on={fx.has('qualified') || undefined} />
        <path d="M140 91h14q4 0 4-4v-26q0-4 4-4h12" data-on={fx.has('booked') || undefined} />
        <path d="M241 70v8" data-on={fx.has('crm') || undefined} />
        <path d="M241 104v8" data-on={fx.has('followup') || undefined} />
      </svg>
      {CLINIC_NODES.map((n) => {
        const on = fx.has(n.id);
        return (
          <span key={n.id} className={s.node} data-on={on || undefined} data-col={n.col} style={{ top: 44 + n.row * 34 }}>
            {n.mark && <Mark id={n.mark} className={s.nodeMark} />}
            {W.clinic.nodes[n.id]}
          </span>
        );
      })}
      <Status text={W.clinic.status[st]} tone={fx.has('followup') ? 'ok' : 'live'} />
    </div>
  );
}

/* ---------- Native research: Xroga plans, reads the sources, compares and ranks ---------- */
const RESEARCH_ORDER = ['plan', 'x', 'reddit', 'google', 'compare', 'rank'] as const;
function Research({ fx }: { fx: Fx }) {
  const st = latest(fx, RESEARCH_ORDER) ?? 'plan';
  const reading = fx.has('x');
  // each research step is pending, active or done; the third one resolves into the ranked result
  const state = (i: number): 'todo' | 'on' | 'done' => {
    const done = [reading, fx.has('compare'), fx.has('rank')][i];
    const on = [fx.has('plan'), reading, fx.has('compare')][i];
    return done ? 'done' : on ? 'on' : 'todo';
  };
  return (
    <div className={s.research}>
      <div className={s.opsHead}>
        <XrogaChip label="Xroga" />
        <b>{W.research.title}</b>
      </div>
      {fx.has('rank') ? (
        <ol className={s.ideas}>
          {W.research.ideas.map((idea, i) => (
            <li key={idea.title} style={{ animationDelay: `${i * 90}ms` }}>
              <em>{i + 1}</em>
              <span>
                <b>{idea.title}</b>
                <small>{idea.why}</small>
              </span>
            </li>
          ))}
        </ol>
      ) : (
        <ul className={s.plan}>
          {W.research.steps.map((step, i) => (
            <li key={step} data-state={state(i)}>
              <i aria-hidden="true" />
              {step}
            </li>
          ))}
        </ul>
      )}
      <Status text={W.research.status[st]} tone={fx.has('rank') ? 'ok' : 'live'} />
    </div>
  );
}

/* ---------- One product across web, Chrome, iOS and Android ---------- */
const PLAT_ORDER = ['inspected', 'core', 'variants', 'built', 'destinations'] as const;
function Platforms({ fx }: { fx: Fx }) {
  const st = latest(fx, PLAT_ORDER) ?? 'inspected';
  const tested = fx.has('built');
  const ready = fx.has('destinations');
  return (
    <div className={s.plat} data-sync={fx.has('built') || undefined}>
      <div className={s.web} data-scan={(fx.has('inspected') && !fx.has('core')) || undefined}>
        <span className={s.webRail} />
        <b>{W.platforms.web}</b>
        <i />
        <i />
        {tested && <em className={s.check} />}
      </div>
      {fx.has('variants') && (
        <>
          <div className={s.popup}>
            <span>{W.platforms.extension}</span>
            <i />
            <i />
            {tested && <em className={s.check} />}
          </div>
          <div className={s.phone} data-os="ios">
            <span>{W.platforms.ios}</span>
            <i />
            <i />
            {tested && <em className={s.check} />}
          </div>
          <div className={s.phone} data-os="android">
            <span>{W.platforms.android}</span>
            <i />
            <i />
            {tested && <em className={s.check} />}
          </div>
        </>
      )}
      {fx.has('core') && (
        <div className={s.core}>
          <Mark id="supabase" className={s.inline} />
          {W.platforms.core}
        </div>
      )}
      {ready && (
        <div className={s.stores}>
          {(['chromewebstore', 'appstore', 'googleplay'] as const).map((d) => (
            <span key={d}>
              <Dest id={d} />
              {DESTINATIONS[d].name}
            </span>
          ))}
        </div>
      )}
      <Status text={ready ? W.platforms.ready : W.platforms.status[st]} tone={ready ? 'ok' : 'live'} />
    </div>
  );
}

/* ---------- Native cleanup of a customer table ---------- */
const CLEAN_ORDER = ['scanned', 'found', 'merged', 'fixed', 'normalized', 'held', 'validated'] as const;
type Cell = { v: string; fixed?: string; fx?: string };
const ROWS: { id: string; dup?: 'keep' | 'drop'; review?: boolean; cells: [Cell, Cell, Cell, Cell] }[] = [
  { id: 'ana', dup: 'keep', cells: [{ v: 'Ana Ruiz' }, { v: 'ana@northwind.app' }, { v: 'Northwind' }, { v: 'Active' }] },
  { id: 'ana2', dup: 'drop', cells: [{ v: 'Ana Ruiz' }, { v: 'ana@northwind.app' }, { v: 'northwind' }, { v: 'Active' }] },
  { id: 'ben', cells: [{ v: 'Ben Okafor' }, { v: 'Ben@Acme,com', fixed: 'ben@acme.com', fx: 'fixed' }, { v: 'Acme' }, { v: 'Trial' }] },
  { id: 'chen', cells: [{ v: 'Chen Li' }, { v: 'chen@lumen.io' }, { v: 'LUMEN', fixed: 'Lumen', fx: 'normalized' }, { v: 'active', fixed: 'Active', fx: 'normalized' }] },
  { id: 'dana', review: true, cells: [{ v: 'Dana Moss' }, { v: '' }, { v: 'Brightside' }, { v: 'Lead' }] },
];
function Cleanup({ fx }: { fx: Fx }) {
  const st = latest(fx, CLEAN_ORDER) ?? 'scanned';
  const found = fx.has('found');
  const valid = fx.has('validated');
  // the pass Xroga is running is named on the table while it runs; once it is done the table speaks for itself
  const pass = !found ? W.cleanup.passes.scanned : !fx.has('merged') ? W.cleanup.passes.found : null;
  return (
    <div className={s.table} data-scan={(fx.has('scanned') && !found) || undefined} data-valid={valid || undefined}>
      <div className={s.opsHead}>
        <XrogaChip label="Xroga" />
        {pass ? (
          <span key={pass} className={s.pass}>
            {pass}
          </span>
        ) : (
          <b key={valid ? 'clean' : 'file'} className={s.file} data-clean={valid || undefined}>
            {valid ? W.cleanup.cleanFile : W.cleanup.file}
          </b>
        )}
      </div>
      <div className={s.grid} role="presentation">
        {W.cleanup.columns.map((c) => (
          <span key={c} className={s.th}>
            {c}
          </span>
        ))}
        {ROWS.map((r) => {
          const merged = r.dup && fx.has('merged');
          return (
            <div
              key={r.id}
              className={s.tr}
              data-dup={(r.dup && found && !merged) || undefined}
              data-merged={(r.dup === 'drop' && merged) || undefined}
              data-canonical={(r.dup === 'keep' && merged && !valid) || undefined}
              data-review={(r.review && fx.has('held')) || undefined}
            >
              {r.cells.map((c, i) => {
                const done = c.fx !== undefined && fx.has(c.fx);
                const bad = found && !done && (c.fx !== undefined || (r.dup === 'drop' && i === 2) || (r.review && i === 1 && !fx.has('held')));
                const review = r.review && i === 1 && fx.has('held');
                return (
                  <span key={i} className={s.td} data-bad={bad || undefined} data-done={done || undefined} data-review={review || undefined}>
                    {/* a corrected cell morphs: the old value leaves upward as the new one arrives */}
                    {done && <s className={s.was} aria-hidden="true">{c.v}</s>}
                    <span key={done ? 'new' : review ? 'review' : 'old'} className={s.val}>
                      {review ? W.cleanup.review : done ? c.fixed : c.v}
                    </span>
                  </span>
                );
              })}
            </div>
          );
        })}
      </div>
      <Status text={W.cleanup.status[st]} tone={valid ? 'ok' : found ? 'warn' : 'live'} />
    </div>
  );
}

/* ---------- Growth after launch ---------- */
const GROWTH_ORDER = ['audit', 'search', 'funnel', 'constraint', 'launched'] as const;
const SIGNALS: { fx: string; mark: ProviderId; key: keyof typeof WORK_COPY.growth.signals; w: number }[] = [
  { fx: 'search', mark: 'semrush', key: 'search', w: 62 },
  { fx: 'funnel', mark: 'posthog', key: 'funnel', w: 22 },
];
function Growth({ fx }: { fx: Fx }) {
  const st = latest(fx, GROWTH_ORDER) ?? 'audit';
  return (
    <div className={s.growth}>
      <div className={s.signals}>
        {SIGNALS.map((g) => {
          const on = fx.has(g.fx);
          return (
            <span key={g.fx} className={s.signal} data-on={on || undefined} data-constraint={(g.fx === 'funnel' && fx.has('constraint')) || undefined}>
              <Mark id={g.mark} className={s.inline} />
              <em>{W.growth.signals[g.key]}</em>
              <i style={{ width: on ? `${g.w}%` : '0%' }} />
            </span>
          );
        })}
      </div>
      {fx.has('constraint') && <span className={s.constraint}>{W.growth.constraint}</span>}
      {fx.has('launched') && (
        <>
          <div className={s.actionRow}>
            <span className={s.decisionChip}>{W.growth.decision}</span>
            <span className={s.launched}>
              <Mark id="mailchimp" className={s.inline} />
              {W.growth.launched}
            </span>
          </div>
          <div className={s.measure}>
            <svg viewBox="0 0 120 26" aria-hidden="true">
              <path d="M1 22 L20 21 L38 20 L52 21 L66 16 L82 13 L98 9 L119 4" pathLength={1} />
            </svg>
            <span>{W.growth.measuring}</span>
          </div>
        </>
      )}
      <Status text={W.growth.status[st]} tone={fx.has('launched') ? 'ok' : fx.has('constraint') ? 'warn' : 'live'} />
    </div>
  );
}

function Render({ kind, fx, cursor, sending }: { kind: WorkKind; fx: Fx; cursor: string | null; sending: boolean }) {
  switch (kind) {
    case 'brief':
      return <Brief sending={sending} />;
    case 'saas':
      return <Saas fx={fx} />;
    case 'qa':
      return <Qa fx={fx} cursor={cursor} />;
    case 'clinic':
      return <Clinic fx={fx} />;
    case 'research':
      return <Research fx={fx} />;
    case 'platforms':
      return <Platforms fx={fx} />;
    case 'cleanup':
      return <Cleanup fx={fx} />;
    case 'growth':
      return <Growth fx={fx} />;
  }
}

export function WorkObject({
  work,
  leaving,
  leavingFx,
  effects,
  cursor,
  sending,
  toOrb,
}: {
  work: WorkKind | null;
  leaving: WorkKind | null;
  leavingFx: string[];
  effects: string[];
  cursor: string | null;
  sending: boolean;
  /** Vector from this object's centre to Xroga's centre (px): objects unfold out of, and fold back into, the orb. */
  toOrb: [number, number];
}) {
  const style = { '--ox': `${toOrb[0]}px`, '--oy': `${toOrb[1]}px` } as React.CSSProperties;
  return (
    <div className={s.zone} style={style} aria-hidden="true">
      <div className={s.scaler}>
        {leaving && (
          <div key={`out-${leaving}`} className={s.layer} data-phase="out">
            <Render kind={leaving} fx={new Set(leavingFx)} cursor={null} sending={false} />
          </div>
        )}
        {work && (
          <div key={work} className={s.layer} data-phase={work === 'brief' ? 'arrive' : 'in'}>
            <Render kind={work} fx={new Set(effects)} cursor={cursor} sending={sending} />
          </div>
        )}
      </div>
    </div>
  );
}
