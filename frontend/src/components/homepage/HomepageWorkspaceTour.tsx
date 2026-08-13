'use client';

import { useEffect, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Logo } from '@/components/layout/Logo';
import { HomepageChatBar } from '@/components/terminal/HomepageChatBar';
import { getIntegrationLogo } from '@/lib/integrationLogos';

const TOUR_TABS = [
  { id: 'terminal', label: 'Terminal', eyebrow: 'Live execution' },
  { id: 'repos', label: 'Repositories', eyebrow: 'Sticky workspace' },
  { id: 'integrations', label: 'Integrations', eyebrow: 'Connected stack' },
  { id: 'publish', label: 'Publish', eyebrow: 'Provider evidence' },
] as const;

type TourTab = (typeof TOUR_TABS)[number]['id'];

const INTEGRATIONS = [
  { id: 'github', name: 'GitHub', status: 'Available now', tone: 'live' },
  { id: 'vercel', name: 'Vercel', status: 'Available now', tone: 'live' },
  { id: 'supabase', name: 'Supabase', status: 'Available now', tone: 'live' },
  { id: 'gitlab', name: 'GitLab', status: 'Upcoming', tone: 'soon' },
  { id: 'slack', name: 'Slack', status: 'Upcoming', tone: 'soon' },
  { id: 'linear', name: 'Linear', status: 'Upcoming', tone: 'soon' },
  { id: 'figma', name: 'Figma', status: 'Upcoming', tone: 'soon' },
  { id: 'stripe', name: 'Stripe', status: 'Upcoming', tone: 'soon' },
] as const;

function TerminalView() {
  return (
    <div className="xv-wt-terminal">
      <div className="xv-wt-terminal-bar"><i /><i /><i /><code>xroga@swarm</code><span>~/workspace</span></div>
      <div className="xv-wt-terminal-body">
        <p><b>you</b> Build a customer portal and push it to my repository.</p>
        <p className="is-done">✓ repository understood</p>
        <p className="is-done">✓ components generated · 12 files</p>
        <p className="is-live">● validating TypeScript and tests…</p>
        <div className="xv-wt-progress"><span /></div>
      </div>
    </div>
  );
}

function RepositoriesView() {
  return (
    <div className="xv-wt-repo-view">
      <header><span>Repository</span><b>Xroga / client-product</b><em>private</em></header>
      <div className="xv-wt-repo-grid">
        <div className="xv-wt-file-list">{['app', 'components', 'lib', 'tests', '.env.example', 'README.md'].map((file) => <span key={file}>▰ {file}</span>)}</div>
        <div className="xv-wt-commit"><small>LATEST XROGA COMMIT</small><strong>Build authenticated customer portal</strong><code>a1b2c3d · checks passing</code></div>
      </div>
    </div>
  );
}

function IntegrationsView() {
  return (
    <div className="xv-wt-connect-view">
      {INTEGRATIONS.slice(0, 3).map((item) => (
        <div key={item.id}><Image src={getIntegrationLogo(item.id, item.name) ?? ''} alt="" width={34} height={34} unoptimized /><span><b>{item.name}</b><small>Connected to your account</small></span><em>Ready</em></div>
      ))}
    </div>
  );
}

function PublishView() {
  return (
    <div className="xv-wt-publish-view">
      <div className="xv-wt-release-ring"><strong>4/4</strong><span>verified</span></div>
      <div><small>RELEASE EVIDENCE</small><h3>Ready for your authorization.</h3><p>Build passed · GitHub commit confirmed · Vercel preview reachable.</p><button type="button">View evidence ↗</button></div>
    </div>
  );
}

export function HomepageWorkspaceTour({ loggedIn }: { loggedIn: boolean }) {
  const [active, setActive] = useState<TourTab>('terminal');
  const [paused, setPaused] = useState(false);
  const router = useRouter();

  useEffect(() => {
    if (paused) return;
    const timer = window.setInterval(() => {
      setActive((current) => {
        const index = TOUR_TABS.findIndex((tab) => tab.id === current);
        return TOUR_TABS[(index + 1) % TOUR_TABS.length].id;
      });
    }, 4600);
    return () => window.clearInterval(timer);
  }, [paused]);

  const activeMeta = TOUR_TABS.find((tab) => tab.id === active) ?? TOUR_TABS[0];

  return (
    <section className="xv-wt" aria-labelledby="workspace-tour-heading">
      <div className="xv-wt-heading">
        <p>YOUR WORKSPACE · BEFORE YOU SIGN IN</p>
        <h2 id="workspace-tour-heading">See where your prompt <em>becomes software.</em></h2>
        <span>This is the same connected product loop you enter after authentication—not a separate demo tool.</span>
      </div>

      <div className="xv-wt-window" onPointerEnter={() => setPaused(true)} onPointerLeave={() => setPaused(false)}>
        <aside className="xv-wt-sidebar">
          <Logo href="/" variant="sidebar" height={38} />
          <nav aria-label="Workspace preview sections">
            {TOUR_TABS.map((tab) => <button key={tab.id} type="button" className={active === tab.id ? 'is-active' : ''} onClick={() => setActive(tab.id)}><span>{tab.id === 'terminal' ? '>_' : tab.id === 'repos' ? '◇' : tab.id === 'integrations' ? '⌘' : '↗'}</span>{tab.label}</button>)}
          </nav>
          <Link href={loggedIn ? '/workspace' : '/auth/signup'}>{loggedIn ? 'Open workspace' : 'Create workspace'} →</Link>
        </aside>

        <div className="xv-wt-main">
          <header><span><i /> Xroga Workspace</span><em>{activeMeta.eyebrow}</em><button type="button" onClick={() => router.push(loggedIn ? '/workspace' : '/auth/signup')}>{loggedIn ? 'Continue' : 'Sign up'}</button></header>
          <div className="xv-wt-canvas" key={active}>
            {active === 'terminal' && <TerminalView />}
            {active === 'repos' && <RepositoriesView />}
            {active === 'integrations' && <IntegrationsView />}
            {active === 'publish' && <PublishView />}
          </div>
          <div className="xv-wt-composer"><HomepageChatBar listenForAsk={false} suggestions={['Build a website', 'Update my repo', 'Ship a preview']} fallbackPrompt="Build my product in the Xroga workspace" /></div>
        </div>
      </div>

      <div className="xv-wt-dots" aria-label="Workspace preview controls">{TOUR_TABS.map((tab) => <button key={tab.id} type="button" aria-label={`Show ${tab.label}`} className={active === tab.id ? 'is-active' : ''} onClick={() => setActive(tab.id)} />)}</div>

      <div className="xv-integration-cloud" aria-labelledby="integration-cloud-heading">
        <div className="xv-integration-cloud__copy"><p>CONNECTED ECOSYSTEM</p><h2 id="integration-cloud-heading">Bring the tools you <em>already own.</em></h2><span>Connect supported providers now. More integrations are being prepared for upcoming months.</span></div>
        <div className="xv-integration-cloud__orbit">
          <div className="xv-integration-cloud__core"><Logo href="/" variant="sidebar" height={58} /><span>Xroga AI</span></div>
          {INTEGRATIONS.map((item, index) => <div key={item.id} className={`xv-integration-node xv-integration-node--${index + 1} is-${item.tone}`}><Image src={getIntegrationLogo(item.id, item.name) ?? ''} alt={`${item.name} logo`} width={30} height={30} unoptimized /><span>{item.name}<small>{item.status}</small></span></div>)}
        </div>
      </div>
    </section>
  );
}
