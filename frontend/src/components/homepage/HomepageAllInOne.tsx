import Image from 'next/image';
import Link from 'next/link';
import { ArrowUpRight, Check, LockKeyhole, ShieldCheck, UserRound } from 'lucide-react';
import { siBrevo, siCloudflare, siGithub, siSupabase, siVercel } from 'simple-icons';

const slideCopy = [
  {
    kicker: 'PRODUCT INTERFACE',
    title: 'Turn the brief into an interface people can use.',
    copy: 'Xroga carries the product intent into responsive screens, states, and interactions instead of stopping at a design suggestion.',
  },
  {
    kicker: 'DATA & LOGIC',
    title: 'Make the data model fit the actual product.',
    copy: 'Plan schema, queries, API behavior, and migrations together—then review the repository changes before they become infrastructure.',
  },
  {
    kicker: 'AUTHENTICATION',
    title: 'Build the account flow around real access rules.',
    copy: 'Implement sign-up, sessions, protected routes, and recovery against the provider and permissions you authorize.',
  },
  {
    kicker: 'CONNECTED SERVICES',
    title: 'Use the stack the product already depends on.',
    copy: 'Connect source control, data, hosting, delivery, and business services without hiding which account or action is involved.',
  },
  {
    kicker: 'EXISTING REPOSITORIES',
    title: 'Change the system that exists—not an imaginary clean-room version.',
    copy: 'Xroga can inspect the current architecture, work across files, and keep diffs, checks, and blockers visible while it implements.',
  },
  {
    kicker: 'VERIFICATION & RELEASE',
    title: 'Move toward release with evidence and permission.',
    copy: 'Preview the result, judge the checks, and authorize consequential handoffs only when the build is ready for them.',
  },
] as const;

const integrationMarks = [
  { name: 'GitHub', icon: siGithub },
  { name: 'Vercel', icon: siVercel },
  { name: 'Supabase', icon: siSupabase },
  { name: 'Cloudflare', icon: siCloudflare },
  { name: 'Brevo', icon: siBrevo },
] as const;

function ProductVisual() {
  return (
    <div className="xv-aio-product" aria-label="Example responsive product interface">
      <aside><strong>Northstar</strong>{['Overview', 'Customers', 'Revenue', 'Reports'].map((item) => <span key={item}>{item}</span>)}</aside>
      <main>
        <header><div><small>MONTHLY REVENUE</small><b>$48,290</b></div><button type="button">Export report</button></header>
        <div className="xv-aio-product__chart" aria-hidden="true"><i /><i /><i /><i /><i /><i /><i /><i /></div>
        <div className="xv-aio-product__stats"><span><b>1,842</b><small>Active customers</small></span><span><b>12.8%</b><small>Conversion</small></span><span><b>+24%</b><small>Growth</small></span></div>
      </main>
    </div>
  );
}

function DataVisual() {
  return (
    <div className="xv-aio-data" aria-label="Example repository-aware product data model">
      <aside><b>Product data</b><span>customers</span><span>subscriptions</span><span className="is-active">usage_events</span><span>invoices</span><span>plans</span></aside>
      <div>
        <header><span>usage_events</span><button type="button">Review migration</button></header>
        <table>
          <thead><tr><th>event_id</th><th>customer</th><th>type</th><th>status</th></tr></thead>
          <tbody>
            {[
              ['evt_0184', 'Atelier', 'generation', 'verified'],
              ['evt_0185', 'North Co.', 'export', 'verified'],
              ['evt_0186', 'Keystone', 'checkout', 'pending'],
              ['evt_0187', 'Signal Lab', 'generation', 'verified'],
              ['evt_0188', 'Cedar', 'invite', 'verified'],
            ].map((row) => <tr key={row[0]}>{row.map((cell, index) => <td key={cell}>{index === 3 ? <span className={`is-${cell}`}>{cell}</span> : cell}</td>)}</tr>)}
          </tbody>
        </table>
        <footer><Check /> Schema change and API use reviewed together</footer>
      </div>
    </div>
  );
}

function AuthVisual() {
  return (
    <div className="xv-aio-auth" aria-label="Example authentication and access-control flow">
      <form>
        <span><LockKeyhole /> Xroga account</span>
        <h4>Welcome to your workspace</h4>
        <label>Email address<input readOnly value="builder@example.com" /></label>
        <label>Password<input readOnly type="password" value="xroga-secure" /></label>
        <button type="button">Continue securely</button>
        <small>Recovery and session states included</small>
      </form>
      <div className="xv-aio-auth__rules">
        <header><ShieldCheck /><span><b>Access rules</b><small>Visible before implementation</small></span></header>
        <ul>
          <li><UserRound /><span><b>Member</b><small>Own projects and builds</small></span><Check /></li>
          <li><UserRound /><span><b>Admin</b><small>Team, billing, and releases</small></span><Check /></li>
          <li><LockKeyhole /><span><b>Protected routes</b><small>Session required</small></span><Check /></li>
        </ul>
      </div>
    </div>
  );
}

function IntegrationsVisual() {
  return (
    <div className="xv-aio-integrations" aria-label="Services Xroga can connect through authorized accounts">
      <div className="xv-aio-integrations__core"><Image src="/brand/xroga-mark.png" width={62} height={62} alt="Xroga" /><b>One build context</b><span>Code · data · release</span></div>
      {integrationMarks.map(({ name, icon }, index) => (
        <div className={`xv-aio-integration xv-aio-integration--${index + 1}`} key={name}>
          <i style={{ color: `#${icon.hex}` }}><svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d={icon.path} /></svg></i>
          <span><b>{name}</b><small>Connected when authorized</small></span>
        </div>
      ))}
      <div className="xv-aio-integration xv-aio-integration--6"><i className="is-whop">W</i><span><b>Whop</b><small>Connected when authorized</small></span></div>
    </div>
  );
}

function Dots({ active }: { active: number }) {
  return <ol className="xv-aio-dots" aria-label={`Capability ${active + 1} of ${slideCopy.length}`}>{slideCopy.map((slide, index) => <li className={index === active ? 'is-active' : ''} key={slide.kicker}><span className="sr-only">{slide.kicker}</span></li>)}</ol>;
}

export function HomepageAllInOne() {
  return (
    <section className="xv-aio" aria-labelledby="xroga-all-in-one-heading">
      <header className="xv-aio__heading">
        <p>ONE XROGA WORKSPACE</p>
        <h2 id="xroga-all-in-one-heading">The whole build—not another <em>answer.</em></h2>
        <span>Describe the outcome once. Keep the interface, data, accounts, code, checks, and release intent connected while the product takes shape.</span>
      </header>

      <div className="xv-aio__deck">
        {slideCopy.map((slide, index) => (
          <article className={`xv-aio-card is-card-${index + 1}`} key={slide.kicker}>
            <div className="xv-aio-card__visual">
              {index === 0 && <ProductVisual />}
              {index === 1 && <DataVisual />}
              {index === 2 && <AuthVisual />}
              {index === 3 && <IntegrationsVisual />}
              {index === 4 && <Image src="/homepage/all-in-one/xroga-existing-repo-review-20260902.png" alt="An existing repository with a visible code diff, passing checks, and review evidence" width={1536} height={1024} sizes="(max-width: 760px) 94vw, 900px" />}
              {index === 5 && <Image src="/homepage/all-in-one/xroga-authorized-release-20260902.png" alt="A verified product preview waiting for approval before release" width={1536} height={1024} sizes="(max-width: 760px) 94vw, 900px" />}
            </div>
            <footer>
              <div><p>{slide.kicker}</p><h3>{slide.title}</h3><span>{slide.copy}</span></div>
              <Dots active={index} />
            </footer>
          </article>
        ))}
      </div>

      <Link href="/features" className="xv-aio__link">Explore the Xroga build system <ArrowUpRight aria-hidden="true" /></Link>
    </section>
  );
}
