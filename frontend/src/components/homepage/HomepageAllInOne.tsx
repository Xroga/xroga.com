import Image from 'next/image';
import Link from 'next/link';
import { ArrowDown, ArrowUpRight, Check, CircleDollarSign, Code2, Eye, FileCode2, Heart, Home, LockKeyhole, MailCheck, Play, Search, ShieldCheck, UserRound } from 'lucide-react';
import { siBrevo, siCloudflare, siGithub, siSupabase, siVercel } from 'simple-icons';

const slideCopy = [
  {
    kicker: 'REAL ESTATE PRODUCT',
    title: 'Turn the brief into a product people can actually explore.',
    copy: 'This working Xroga template includes property search, filters, favourites, detail views, enquiries, and real mortgage calculations.',
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
    kicker: 'CONNECTED COMMERCE',
    title: 'Let product events trigger the next useful action.',
    copy: 'Connect a Whop payment to customer access, a receipt email, and the product state around it—with the event trail still visible.',
  },
  {
    kicker: 'UI QUALITY',
    title: 'Yes to AI. No to generic output.',
    copy: 'Xroga keeps layout, hierarchy, responsive states, and interaction quality in the build so one good idea does not need fifty corrective prompts.',
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
    <div className="xv-aio-estate" aria-label="Xroga Real Estate Platform template preview">
      <Image src="/showcase/real-estate-2026/harbourline-villa.jpg" alt="Waterfront villa in the Xroga Real Estate Platform template" fill sizes="(max-width: 760px) 94vw, 900px" />
      <div className="xv-aio-estate__shade" />
      <nav>
        <b><i><Home aria-hidden="true" /></i>Harbourline</b>
        <span>Properties</span><span>Collections</span><span>Areas</span><span>Mortgage</span>
        <button className="is-saved" type="button"><Heart aria-hidden="true" /> Saved <small>0</small></button>
        <button type="button">Book a viewing</button>
      </nav>
      <div className="xv-aio-estate__copy">
        <small>CURATED HOMES ACROSS DUBAI&apos;S MOST COVETED ADDRESSES</small>
        <h4>Find a home<br />worth arriving for.</h4>
        <p>A quieter, smarter way to discover exceptional apartments, villas and investment opportunities—with verified details and private viewing requests in minutes.</p>
      </div>
      <div className="xv-aio-estate__search">
        <span><small>WHERE</small>City, community or tower</span>
        <span><small>PROPERTY TYPE</small>Any property</span>
        <span><small>BUDGET</small>Any budget</span>
        <button type="button"><Search aria-hidden="true" /> Search homes</button>
      </div>
      <div className="xv-aio-estate__proof" aria-label="Template demonstration statistics"><span><b>184</b><small>CURATED HOMES</small></span><span><b>27</b><small>PRIME COMMUNITIES</small></span><span><b>4.9/5</b><small>SAMPLE EXPERIENCE</small></span></div>
      <div className="xv-aio-estate__explore"><i><ArrowDown aria-hidden="true" /></i> EXPLORE</div>
    </div>
  );
}

function CommerceVisual() {
  return (
    <div className="xv-aio-commerce" aria-label="Connected Whop payment and receipt email demonstration">
      <div className="xv-aio-commerce__label">CONNECTED EVENT DEMO</div>
      <div className="xv-aio-commerce__flow">
        <article className="is-payment"><i>W</i><div><small>Whop · just now</small><b>Payment received</b><span>$49.00 · Pro workspace</span></div><Check /></article>
        <span className="xv-aio-commerce__line" aria-hidden="true" />
        <article className="is-access"><CircleDollarSign /><div><small>XROGA PRODUCT</small><b>Access updated</b><span>Plan and account state synchronized</span></div><Check /></article>
        <span className="xv-aio-commerce__line" aria-hidden="true" />
        <article className="is-email"><MailCheck /><div><small>BREVO EMAIL</small><b>Receipt delivered</b><span>Transactional message accepted</span></div><Check /></article>
      </div>
    </div>
  );
}

function QualityVisual() {
  return (
    <div className="xv-aio-quality" aria-label="Xroga interface quality system">
      <div className="xv-aio-quality__copy"><small>DESIGN AND CODE, TOGETHER</small><h4>Built to feel<br /><em>intentional.</em></h4><p>Responsive composition, useful states, clear hierarchy, and interaction details remain part of the implementation.</p><div><span>12-column grid</span><span>Mobile states</span><span>Accessible UI</span></div></div>
      <div className="xv-aio-quality__preview"><Image src="/showcase/real-estate-2026/harbourline-interior.webp" alt="Interior property card from the Xroga Real Estate Platform" fill sizes="(max-width: 760px) 48vw, 420px" /><span><small>Marina Gate Skyhome</small><b>AED 4,850,000</b></span></div>
    </div>
  );
}

function WorkspaceVisual() {
  return (
    <div className="xv-aio-workspace" aria-label="Xroga workspace working inside an existing repository">
      <aside><Image src="/brand/xroga-mark.png" width={28} height={28} alt="" />{['Workspace', 'Dashboard', 'Repositories', 'Integrations'].map((item) => <span className={item === 'Workspace' ? 'is-active' : ''} key={item}>{item}</span>)}<small>REPOSITORY</small><b>harbourline-platform</b></aside>
      <main><header><span>xroga@swarm</span><code>~/workspace</code><b>Auto</b></header><div className="xv-aio-workspace__prompt"><small>EXISTING REPO · MAIN</small><h4>Describe it. Build it. <em>Ship it.</em></h4><div>Improve property search and preserve the current design system.<Play /></div></div><div className="xv-aio-workspace__changes"><span><FileCode2 /> 8 files changed</span><span><Code2 /> TypeScript</span><span><Check /> Checks ready</span></div></main>
    </div>
  );
}

function VerificationVisual() {
  return (
    <div className="xv-aio-verify" aria-label="Xroga visible verification and approval flow">
      <aside><small>CHANGED FILES</small><b>search/filters.ts</b><span>PropertyCard.tsx</span><span>mortgage.ts</span><span>search.test.ts</span><footer>8 files <ins>+256</ins> <del>−64</del></footer></aside>
      <div className="xv-aio-verify__diff"><header><FileCode2 /> filters.ts <span>Side-by-side</span></header><code><i>− return allProperties;</i><b>+ return applyPropertyFilters(</b><b>+ &nbsp;properties, activeFilters</b><b>+ );</b><span> const results = sortListings(filtered);</span></code></div>
      <aside className="xv-aio-verify__checks"><header><ShieldCheck /><b>Proof stays visible</b></header>{['Type check passed', '128 tests passed', 'Preview validated'].map((item) => <span key={item}><Check />{item}</span>)}<div><Eye /> Approval required</div><button type="button">Review before release</button></aside>
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
        <h2 id="xroga-all-in-one-heading">The whole build. <em>Connected.</em></h2>
        <span>Brief to release, in one flow.</span>
      </header>

      <div className="xv-aio__deck">
        {slideCopy.map((slide, index) => (
          <article className={`xv-aio-card is-card-${index + 1}`} key={slide.kicker}>
            <div className="xv-aio-card__visual">
              {index === 0 && <ProductVisual />}
              {index === 1 && <DataVisual />}
              {index === 2 && <AuthVisual />}
              {index === 3 && <IntegrationsVisual />}
              {index === 4 && <CommerceVisual />}
              {index === 5 && <QualityVisual />}
              {index === 6 && <WorkspaceVisual />}
              {index === 7 && <VerificationVisual />}
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
