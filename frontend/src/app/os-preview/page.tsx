import Link from 'next/link';
import { ArrowRight, ArrowUpRight, Check, CircleDashed, ClipboardCheck, Code2, Compass, FileSearch, Layers3, LockKeyhole, Play, Sparkles, Workflow } from 'lucide-react';
import { OsPreviewShell } from '@/components/os-preview/OsPreviewShell';
import { PREVIEW_DESTINATIONS } from '@/lib/osPreviewNavigation';

const OUTCOMES = [
  { title: 'Build', description: 'Turn an idea into a reviewed product path.', icon: Code2 },
  { title: 'Research', description: 'Organize questions, sources and conclusions.', icon: FileSearch },
  { title: 'Automate', description: 'Define repeat work with approvals built in.', icon: Workflow },
  { title: 'Create', description: 'Shape reusable work and deliverables.', icon: Sparkles },
  { title: 'Manage', description: 'See what is underway and what needs you.', icon: Layers3 },
] as const;

export default function OsPreviewHome() {
  return <OsPreviewShell context="Preview home">
    <section className="os-hero">
      <div>
        <span className="os-eyebrow">A first look at Xroga OS</span>
        <h1>From an outcome to <em>a clear result.</em></h1>
        <p className="os-lead">Describe what you want to accomplish. Xroga OS is being designed to make the plan, permissions, progress, proof and next action understandable in one workspace.</p>
        <div className="os-actions"><Link className="os-button os-button-primary" href="/os-preview/journey"><Play size={15} /> Try an example journey</Link><Link className="os-button" href="/workspace">Open current Xroga <ArrowUpRight size={15} /></Link></div>
        <p className="os-small" style={{ marginTop: 16 }}>This is an interactive product preview. It does not execute builds, contact services or generate real evidence.</p>
      </div>
      <div className="os-hero-board" aria-label="Illustration of the planned workflow">
        <div className="os-board-top"><i /><i /><i /><span>EXAMPLE OUTCOME</span></div>
        <div className="os-board-body"><div className="os-board-goal">“Build a clinic appointment booking website and set up confirmations.”</div><div className="os-board-flow"><div><span>01</span><strong>Understand</strong> goal, constraints and acceptance</div><div><span>02</span><strong>Plan</strong> steps, roles and permissions</div><div><span>03</span><strong>Inspect</strong> progress and evidence needs</div><div><span>04</span><strong>Review</strong> the result before real action</div></div></div>
      </div>
    </section>

    <section className="os-section"><div className="os-section-head"><div><span className="os-eyebrow">What you can ask for</span><h2>Start with the work, not the tools.</h2></div><p>These are product directions. Availability is shown below, and the demo uses example data only.</p></div><div className="os-card-grid">{OUTCOMES.map(({ title, description, icon: Icon }) => <Link className="os-card" key={title} href="/os-preview/journey"><Icon size={22} aria-hidden="true" /><div><h3>{title}</h3><p>{description}</p></div><div className="os-card-foot">Explore the example <ArrowRight size={15} /></div></Link>)}</div></section>

    <section className="os-section"><div className="os-section-head"><div><span className="os-eyebrow">Honest availability</span><h2>See what is real—and what is next.</h2></div><p>Current product areas stay in the existing workspace. Planned systems are clearly marked and do not pretend to be connected.</p></div><div className="os-card-grid"><div className="os-card"><Check size={22} /><div><span className="os-status os-status--available-now">Available now</span><h3 style={{ marginTop: 14 }}>Your current workspace</h3><p>Open the existing Xroga chat, projects and supported settings.</p></div><Link className="os-card-foot" href="/workspace">Open workspace <ArrowUpRight size={15} /></Link></div><div className="os-card"><CircleDashed size={22} /><div><span className="os-status os-status--interactive-preview">Interactive preview</span><h3 style={{ marginTop: 14 }}>One outcome journey</h3><p>Shape requirements, inspect the plan and step through a deterministic demo.</p></div><Link className="os-card-foot" href="/os-preview/journey">Try the demo <ArrowRight size={15} /></Link></div><div className="os-card"><LockKeyhole size={22} /><div><span className="os-status">Coming soon</span><h3 style={{ marginTop: 14 }}>Future OS capabilities</h3><p>Browser, employees, packs, Genome, Drive and deeper insights are design intent here.</p></div><Link className="os-card-foot" href="/os-preview/browser">See the roadmap <ArrowRight size={15} /></Link></div></div></section>

    <section className="os-section" style={{ borderBottom: 0 }}><div className="os-section-head"><div><span className="os-eyebrow">Explore the product map</span><h2>A place for every part of the work.</h2></div></div><div className="os-card-grid">{PREVIEW_DESTINATIONS.filter((item) => ['coding','automations','employees','artifacts','insights','projects'].includes(item.slug)).map((item) => <Link className="os-card" href={`/os-preview/${item.slug}`} key={item.slug}><Compass size={20} /><div><h3>{item.label}</h3><p>{item.benefit}</p></div><div className="os-card-foot"><span className={`os-status os-status--${item.availability}`}>{item.availability.replaceAll('-', ' ')}</span><ArrowRight size={15} /></div></Link>)}</div></section>
    <div className="os-demo-banner"><ClipboardCheck size={18} /> Demo experience — no real work or external changes are performed.</div>
  </OsPreviewShell>;
}
