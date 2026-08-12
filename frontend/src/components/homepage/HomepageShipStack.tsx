import Image from 'next/image';
import {
  Check,
  Code2,
  FileCode2,
  Folder,
  Globe2,
  Infinity,
  LockKeyhole,
  MessageSquareCode,
  RefreshCw,
  Rocket,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';

const LOWER_STEPS = [
  {
    number: '04',
    Icon: RefreshCw,
    title: 'Iterate forever',
    body: 'Follow-ups surgically patch code and redeploy. Hackathon polish and enterprise iteration without restarting the build.',
    status: 'Always improving',
  },
  {
    number: '05',
    Icon: Globe2,
    title: 'Research that ships',
    body: 'Live web + X intel when you need current rules or markets — then the same swarm turns findings into product files.',
    status: 'Intelligence → product',
  },
  {
    number: '06',
    Icon: ShieldCheck,
    title: 'Your keys, your stack',
    body: 'Authorize GitHub + Vercel, with optional Supabase. Secrets stay in your vault. Xroga builds on your ownership.',
    status: 'You stay in control',
  },
] as const;

const FLOW = [
  { label: 'Plan', sub: 'Your prompt', Icon: MessageSquareCode },
  { label: 'Build', sub: 'Xroga builds', Icon: Code2 },
  { label: 'Deploy', sub: 'We ship', Icon: Rocket },
  { label: 'Operate', sub: 'You own', Icon: ShieldCheck },
  { label: 'Evolve', sub: 'We iterate', Icon: RefreshCw },
] as const;

function BrandLogo({ name, className }: { name: 'github' | 'vercel' | 'supabase'; className?: string }) {
  return <Image src={`/brand/logos/${name}.svg`} width={22} height={22} alt={`${name} logo`} className={`xv-hc-provider-logo xv-hc-provider-logo--${name} ${className ?? ''}`} />;
}

export function HomepageShipStack() {
  return (
    <section className="xv-hc-ship" aria-labelledby="ship-heading">
      <div className="xv-hc-ship-grid-bg" aria-hidden="true" />
      <div className="xv-hc-ship-orbit" aria-hidden="true" />

      <div className="xv-hc-ship-inner">
        <div className="xv-hc-ship-topline">
          <p className="xv-hc-ship-kicker"><i /> SHIP STACK</p>
          <span className="xv-hc-ship-loop-pill"><i /> 6 steps. One loop. You own it.</span>
        </div>

        <header className="xv-hc-ship-heading">
          <h2 id="ship-heading">From prompt to <span className="xv-hc-ship-heading-line"><em>production</em> ownership<i>.</i></span></h2>
          <p>
            Xroga helps you own the code and where it runs. We wire your GitHub, deploy on Vercel,
            and keep everything continuously updated—in your control.
          </p>
        </header>

        <div className="xv-hc-ship-brand-note" aria-label="Xroga autonomous ship engine">
          <Image src="/brand/xroga-mark.png" width={24} height={24} alt="Xroga compact logo" />
          <span><b>XROGA</b><small>AUTONOMOUS<br />SHIP ENGINE</small></span>
        </div>

        <div className="xv-hc-ship-primary-flow">
          <article className="xv-hc-ship-node xv-hc-ship-node--prompt">
            <span className="xv-hc-ship-number">01</span>
            <span className="xv-hc-ship-node-icon"><MessageSquareCode aria-hidden="true" /></span>
            <h3>Prompt once</h3>
            <p>Describe the product—website, SaaS, crypto dashboard, or agent. Xroga turns the outcome into an executable brief and controlled build.</p>
            <span className="xv-hc-ship-status"><i /> Idea captured</span>
          </article>

          <div className="xv-hc-ship-connector xv-hc-ship-connector--one" aria-hidden="true"><i /></div>

          <article className="xv-hc-ship-node xv-hc-ship-node--repo">
            <span className="xv-hc-ship-number">02</span>
            <div className="xv-hc-ship-repo-ui" aria-label="GitHub repository connected">
              <div className="xv-hc-ship-repo-head">
                <span><BrandLogo name="github" /> xroga / client-product</span>
                <small>Private <LockKeyhole aria-hidden="true" /></small>
              </div>
              <div className="xv-hc-ship-connected"><BrandLogo name="github" /> GITHUB CONNECTED <Check aria-hidden="true" /></div>
              <ul>
                <li><Folder aria-hidden="true" /> app <span>›</span></li>
                <li><Folder aria-hidden="true" /> components <span>›</span></li>
                <li><Folder aria-hidden="true" /> lib <span>›</span></li>
                <li><FileCode2 aria-hidden="true" /> README.md <span>›</span></li>
              </ul>
              <footer><Image src="/brand/xroga-mark.png" width={17} height={17} alt="" /> Xroga AI <span>chore: initial ship</span><code>a1b2c3d</code></footer>
            </div>
            <div className="xv-hc-ship-node-copy">
              <h3>Own the sticky repo</h3>
              <p>First ship creates your GitHub repository and remembers it. Later prompts update that same live product—no orphan repos.</p>
            </div>
          </article>

          <div className="xv-hc-ship-connector xv-hc-ship-connector--two" aria-hidden="true"><i><BrandLogo name="github" /></i></div>

          <article className="xv-hc-ship-node xv-hc-ship-node--deploy">
            <span className="xv-hc-ship-number">03</span>
            <div className="xv-hc-ship-node-copy">
              <span className="xv-hc-ship-node-icon"><BrandLogo name="vercel" /></span>
              <h3>Go live on Vercel</h3>
              <p>Deploy to your Vercel project and domain. Preview in Workspace, then ship for real on accounts you authorize.</p>
              <span className="xv-hc-ship-status"><i /> Deployed</span>
            </div>
            <div className="xv-hc-ship-deploy-ui" aria-label="Vercel production deployment live">
              <header><BrandLogo name="vercel" /> VERCEL <Check aria-hidden="true" /></header>
              <p>Production</p>
              <b><i /> Live</b>
              <span className="xv-hc-ship-deploy-preview"><Image src="/brand/xroga-mark.png" width={36} height={36} alt="Xroga" /></span>
              <small>xroga-product.vercel.app</small>
              <button type="button" tabIndex={-1}>View</button>
            </div>
          </article>
        </div>

        <div className="xv-hc-ship-continuous" aria-hidden="true">
          <span /><b><RefreshCw /> CONTINUOUS LOOP</b><span />
        </div>

        <div className="xv-hc-ship-lower-wrap">
          <div className="xv-hc-ship-lower">
            {LOWER_STEPS.map((step) => (
              <article key={step.number} className="xv-hc-ship-lower-card">
                <span className="xv-hc-ship-number">{step.number}</span>
                <span className="xv-hc-ship-lower-icon"><step.Icon aria-hidden="true" /></span>
                <div><h3>{step.title}</h3><p>{step.body}</p><span className="xv-hc-ship-status"><i /> {step.status}</span></div>
              </article>
            ))}
          </div>

          <aside className="xv-hc-ship-control" aria-label="Ownership and control">
            <h3>OWNERSHIP &amp; CONTROL</h3>
            <ul>
              <li><BrandLogo name="github" /><span>Your GitHub org<small>Connected</small></span></li>
              <li><BrandLogo name="vercel" /><span>Vercel account<small>Connected</small></span></li>
              <li><Image src="/brand/xroga-mark.png" width={21} height={21} alt="Xroga" /><span>Secrets &amp; envs<small>Encrypted</small></span></li>
              <li><BrandLogo name="supabase" /><span>Supabase<small>Optional</small></span></li>
            </ul>
            <div><Sparkles aria-hidden="true" /><span><b>You own everything.</b><small>Xroga just ships it.</small></span></div>
          </aside>
        </div>

        <div className="xv-hc-ship-rail" aria-label="Xroga production workflow">
          {FLOW.map((item, index) => (
            <span key={item.label} className={index === 2 ? 'is-active' : undefined}>
              <i><item.Icon aria-hidden="true" /></i><b>{item.label}<small>{item.sub}</small></b>
            </span>
          ))}
          <Infinity className="xv-hc-ship-rail-inf" aria-hidden="true" />
        </div>
      </div>
    </section>
  );
}
