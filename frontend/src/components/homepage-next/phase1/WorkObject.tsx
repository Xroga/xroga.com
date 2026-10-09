'use client';

/**
 * The left side of the stage: what Xroga is producing (V9 §42). Each job has its own silhouette:
 * an app shell, a browser, an operations graph, a product spread across platforms, a research view
 * and a growth loop. Every tool used on the right changes something visible here. Objects are laid
 * out once at 318 × 197 and scaled per breakpoint.
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

/* ---------- Production SaaS (V9 §5–§9) ---------- */
const SAAS_ORDER = ['shell', 'auth', 'billing', 'roles', 'analytics', 'repo', 'tested', 'monitored', 'live'] as const;
function Saas({ fx, cursor }: { fx: Fx; cursor: string | null }) {
  const st = latest(fx, SAAS_ORDER) ?? 'shell';
  const navOn = [fx.has('shell'), fx.has('billing'), fx.has('roles'), fx.has('analytics')];
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
            <span className={s.btn} data-hover={cursor === 'test' || undefined} data-pressed={cursor === 'press' || undefined} data-done={fx.has('tested') || undefined}>
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
            {fx.has('roles') && (
              <span className={s.roles}>
                {W.saas.roles.map((r) => (
                  <i key={r}>{r}</i>
                ))}
              </span>
            )}
            {fx.has('analytics') && (
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
      {cursor && <span className={s.cursor} data-pos={`saas-${cursor}`} aria-hidden="true" />}
      {fx.has('tested') && !fx.has('monitored') && <span className={s.sweep} aria-hidden="true" />}
      {fx.has('live') && <span className={s.outPulse} aria-hidden="true" />}
    </div>
  );
}

/* ---------- Browser QA, diagnosis and repair (V9 §19–§21) ---------- */
const QA_ORDER = ['start', 'emailOk', 'failed', 'isolated', 'repaired', 'committed', 'paid', 'onboarding', 'verified', 'released'] as const;
function Qa({ fx, cursor }: { fx: Fx; cursor: string | null }) {
  const st = latest(fx, QA_ORDER) ?? 'start';
  const broken = fx.has('failed') && !fx.has('repaired');
  const onStep2 = fx.has('onboarding');
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
            <span className={s.field} data-focus={cursor === 'email' || undefined} data-ok={fx.has('emailOk') || undefined}>
              {fx.has('start') ? W.qa.email : ''}
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

/* ---------- Dental clinic operations, run by a Xroga worker (V9 §10–§14, V8 §17–§20) ---------- */
const CLINIC_NODES: { id: string; fx: string; mark?: ProviderId; x: number; y: number; w: number }[] = [
  { id: 'inquiry', fx: 'inquiry', mark: 'intercom', x: 6, y: 50, w: 94 },
  { id: 'qualified', fx: 'qualified', x: 106, y: 50, w: 114 },
  { id: 'booked', fx: 'booked', mark: 'googlecalendar', x: 226, y: 50, w: 90 },
  { id: 'crm', fx: 'crm', mark: 'hubspot', x: 226, y: 100, w: 90 },
  { id: 'followup', fx: 'followup', mark: 'gmail', x: 106, y: 100, w: 114 },
  { id: 'report', fx: 'report', mark: 'notion', x: 6, y: 100, w: 94 },
];
function Clinic({ fx }: { fx: Fx }) {
  const pending = fx.has('pending') && !fx.has('approved');
  return (
    <div className={s.ops}>
      <div className={s.opsHead}>
        <span className={s.worker} data-on={fx.has('assigned') || undefined}>
          <Image src="/homepage/orb/xroga-orb-icon.webp" alt="" width={14} height={14} />
          {W.clinic.worker}
        </span>
        <b>{W.clinic.title}</b>
      </div>
      <svg className={s.opsLinks} viewBox="0 0 318 150" aria-hidden="true">
        <path d="M100 63h6M220 63h6" data-on={fx.has('qualified') || undefined} />
        <path d="M271 76v24" data-on={fx.has('crm') || undefined} />
        <path d="M226 113h-6M106 113h-6" data-on={fx.has('report') || undefined} />
      </svg>
      {CLINIC_NODES.map((n) => {
        const on = fx.has(n.fx);
        const label = W.clinic.nodes[n.id as keyof typeof W.clinic.nodes];
        return (
          <span key={n.id} className={s.node} data-on={on || undefined} style={{ left: n.x, top: n.y, width: n.w }}>
            {n.mark && <Mark id={n.mark} className={s.nodeMark} />}
            {label}
          </span>
        );
      })}
      {(pending || fx.has('approved')) && (
        <span className={s.approval} data-ok={fx.has('approved') || undefined}>
          {pending ? W.clinic.pending : W.clinic.approved}
        </span>
      )}
      {fx.has('nextrun') && (
        <span className={s.nextRun}>
          <i />
          {W.clinic.nextrun}
        </span>
      )}
    </div>
  );
}

/* ---------- One product across web, Chrome, iOS and Android (V9 §15–§18) ---------- */
const PLAT_ORDER = ['inspected', 'core', 'extension', 'ios', 'android', 'sync', 'built', 'tested', 'destinations'] as const;
function Platforms({ fx }: { fx: Fx }) {
  const st = latest(fx, PLAT_ORDER) ?? 'inspected';
  const tested = fx.has('tested');
  const ready = fx.has('destinations');
  return (
    <div className={s.plat} data-sync={fx.has('sync') || undefined}>
      <div className={s.web} data-scan={(fx.has('inspected') && !fx.has('core')) || undefined}>
        <span className={s.webRail} />
        <b>{W.platforms.web}</b>
        <i />
        <i />
        {tested && <em className={s.check} />}
      </div>
      {fx.has('extension') && (
        <div className={s.popup}>
          <span>{W.platforms.extension}</span>
          <i />
          <i />
          {tested && <em className={s.check} />}
        </div>
      )}
      {fx.has('ios') && (
        <div className={s.phone} data-os="ios">
          <span>{W.platforms.ios}</span>
          <i />
          <i />
          {tested && <em className={s.check} />}
        </div>
      )}
      {fx.has('android') && (
        <div className={s.phone} data-os="android">
          <span>{W.platforms.android}</span>
          <i />
          <i />
          {tested && <em className={s.check} />}
        </div>
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

/* ---------- AI research product, native first (V9 §22–§25) ---------- */
function Research({ fx }: { fx: Fx }) {
  if (fx.has('product')) {
    return (
      <div className={s.research} data-product>
        <span className={s.ask}>{W.research.product}</span>
        <div className={s.answer}>
          <b>{W.research.answer}</b>
          <span>
            <sup>1</sup>
            <sup>2</sup>
          </span>
          <i />
          <i />
        </div>
        <span className={s.memory}>{W.research.memory}</span>
        <Status text={W.research.status} tone="ok" />
      </div>
    );
  }
  return (
    <div className={s.research}>
      <div className={s.sources}>
        {fx.has('files') && (
          <span className={s.source} data-conflict={fx.has('conflict') || undefined}>
            <Mark id="googledrive" className={s.inline} />
            {W.research.files}
          </span>
        )}
        {fx.has('web') && (
          <span className={s.source} data-conflict={fx.has('conflict') || undefined}>
            <Mark id="perplexity" className={s.inline} />
            {W.research.web}
          </span>
        )}
      </div>
      {fx.has('conflict') && <span className={s.conflict}>{W.research.conflict}</span>}
      {fx.has('synthesis') && <span className={s.synth}>{W.research.synthesis}</span>}
      {fx.has('memory') && <span className={s.memory}>{W.research.memory}</span>}
      {fx.has('brief') && (
        <div className={s.decision}>
          <b>{W.research.brief}</b>
          <span>
            {W.research.briefLine}
            <sup>1</sup>
            <sup>2</sup>
          </span>
        </div>
      )}
    </div>
  );
}

/* ---------- Growth after launch (V9 §26–§28) ---------- */
const SIGNALS: { fx: string; mark: ProviderId; key: keyof typeof WORK_COPY.growth.signals; w: number }[] = [
  { fx: 'search', mark: 'semrush', key: 'search', w: 62 },
  { fx: 'ads', mark: 'googleads', key: 'ads', w: 48 },
  { fx: 'funnel', mark: 'posthog', key: 'funnel', w: 22 },
];
function Growth({ fx }: { fx: Fx }) {
  return (
    <div className={s.growth}>
      <div className={s.signals}>
        {SIGNALS.map((g) =>
          fx.has(g.fx) ? (
            <span key={g.fx} className={s.signal} data-constraint={(g.fx === 'funnel' && fx.has('constraint')) || undefined}>
              <Mark id={g.mark} className={s.inline} />
              <em>{W.growth.signals[g.key]}</em>
              <i style={{ width: `${g.w}%` }} />
            </span>
          ) : null,
        )}
      </div>
      {fx.has('constraint') && <span className={s.constraint}>{W.growth.constraint}</span>}
      <div className={s.actionRow}>
        {fx.has('decision') && <span className={s.decisionChip}>{W.growth.decision}</span>}
        {fx.has('launched') && (
          <span className={s.launched}>
            <Mark id="mailchimp" className={s.inline} />
            {W.growth.launched}
          </span>
        )}
      </div>
      {fx.has('measuring') && (
        <div className={s.measure}>
          <svg viewBox="0 0 120 26" aria-hidden="true">
            <path d="M1 22 L20 21 L38 20 L52 21 L66 16 L82 13 L98 9 L119 4" pathLength={1} />
          </svg>
          <span>{W.growth.measuring}</span>
        </div>
      )}
      {fx.has('nextreview') && (
        <span className={s.nextRun}>
          <i />
          {W.growth.nextreview}
        </span>
      )}
    </div>
  );
}

function Render({ kind, fx, cursor, sending }: { kind: WorkKind; fx: Fx; cursor: string | null; sending: boolean }) {
  switch (kind) {
    case 'brief':
      return <Brief sending={sending} />;
    case 'saas':
      return <Saas fx={fx} cursor={cursor} />;
    case 'qa':
      return <Qa fx={fx} cursor={cursor} />;
    case 'clinic':
      return <Clinic fx={fx} />;
    case 'platforms':
      return <Platforms fx={fx} />;
    case 'research':
      return <Research fx={fx} />;
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
