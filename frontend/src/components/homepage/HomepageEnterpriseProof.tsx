import {
  Activity,
  ChartNoAxesColumnIncreasing,
  Code2,
  FileText,
  Infinity,
  LockKeyhole,
  Network,
  Rocket,
  TriangleAlert,
  Users,
} from 'lucide-react';
import { XROGA_MODEL_FULL } from '@/lib/brand';

const PROOFS = [
  {
    Icon: ChartNoAxesColumnIncreasing,
    tone: 'blue',
    title: 'Reviewable execution',
    body: 'One customer-facing Xroga AI experience with changed files, validation, and publishing evidence.',
  },
  {
    Icon: Users,
    tone: 'violet',
    title: 'Builders & non-devs',
    body: 'Plain language starts the work; required decisions, credentials, and review remain visible to the operator.',
  },
  {
    Icon: Rocket,
    tone: 'lime',
    title: 'Hackathon-ready MVPs',
    body: 'Build and iterate on demo projects in the same connected repository, with blockers shown truthfully.',
  },
  {
    Icon: Network,
    tone: 'cyan',
    title: 'Outcome-first workflow',
    body: 'Understand → implement → validate → repair → push or publish when authorised.',
  },
] as const;

const SIGNALS = [
  { Icon: Activity, tone: 'blue', label: 'State', copy: 'Understand status and context.' },
  { Icon: FileText, tone: 'violet', label: 'Evidence', copy: 'See what happened and why.' },
  { Icon: LockKeyhole, tone: 'lime', label: 'Permission', copy: 'Know who can act and when.' },
  { Icon: TriangleAlert, tone: 'cyan', label: 'Blockers', copy: 'Surface risks that stop progress.' },
] as const;

const STACK = [
  ['⚛', 'React'],
  ['N', 'Next.js'],
  ['TS', 'TypeScript'],
  ['JS', 'Node.js'],
  ['⌁', 'React Native'],
  ['≈', 'Tailwind CSS'],
  ['PG', 'PostgreSQL'],
] as const;

export function HomepageEnterpriseProof() {
  return (
    <section className="xv-hc-ent" aria-labelledby="ent-heading">
      <div className="xv-hc-ent-field" aria-hidden="true" />
      <div className="xv-hc-ent-inner">
        <div className="xv-hc-ent-console xv-hc-ent-banner--alive">
          <div className="xv-hc-ent-console-grid" aria-hidden="true" />
          <div className="xv-hc-ent-top-light" aria-hidden="true" />

          <header className="xv-hc-ent-heading">
            <span className="xv-hc-ent-orbit" aria-hidden="true">
              <span className="xv-hc-ent-orbit-ring" />
              <Infinity className="xv-hc-ent-inf" strokeWidth={2.25} />
            </span>
            <p className="xv-hc-ent-kicker">BUILT FOR REAL REVIEW</p>
            <h2 id="ent-heading" className="xv-hc-ent-title">Built for teams<br />that need evidence.</h2>
            <p className="xv-hc-ent-lead">
              {XROGA_MODEL_FULL} keeps model selection internal while the product exposes the parts
              operators need to judge: state, evidence, permission, and blockers.
            </p>
          </header>

          <div className="xv-hc-ent-signals">
            {SIGNALS.map((signal, index) => (
              <div key={signal.label} className={`xv-hc-ent-judgement xv-hc-ent-judgement--${index + 1} is-${signal.tone}`}>
                <span><signal.Icon aria-hidden="true" /></span>
                <div><b>{signal.label}</b><small>{signal.copy}</small></div>
              </div>
            ))}
          </div>

          <div className="xv-hc-ent-core" aria-label="Black Hole V Infinity review core">
            <span className="xv-hc-ent-core-orbit xv-hc-ent-core-orbit--one" aria-hidden="true" />
            <span className="xv-hc-ent-core-orbit xv-hc-ent-core-orbit--two" aria-hidden="true" />
            <span className="xv-hc-ent-core-orbit xv-hc-ent-core-orbit--three" aria-hidden="true" />
            <span className="xv-hc-ent-core-beam" aria-hidden="true" />
            <Infinity aria-hidden="true" strokeWidth={1.35} />
          </div>
        </div>

        <ul className="xv-hc-ent-grid">
          {PROOFS.map((proof) => (
            <li key={proof.title} className={`xv-hc-ent-card xv-hc-ent-card--alive is-${proof.tone}`}>
              <span className="xv-hc-ent-icon" aria-hidden="true"><proof.Icon className="xv-hc-ent-lucide" strokeWidth={1.75} /></span>
              <div><h3>{proof.title}</h3><p>{proof.body}</p></div>
              <span className="xv-hc-ent-card-glow" aria-hidden="true" />
              <span className="xv-hc-ent-card-shine" aria-hidden="true" />
            </li>
          ))}
        </ul>

        <div className="xv-hc-ent-stack" aria-label="Built with modern technology">
          <span className="xv-hc-ent-stack-title"><i><Code2 aria-hidden="true" /></i><b>BUILT WITH<br />MODERN TECHNOLOGY</b></span>
          <div className="xv-hc-ent-stack-list">
            {STACK.map(([mark, label]) => <span key={label}><i>{mark}</i>{label}</span>)}
            <span><i>+</i>&amp; more</span>
          </div>
        </div>
      </div>
    </section>
  );
}
