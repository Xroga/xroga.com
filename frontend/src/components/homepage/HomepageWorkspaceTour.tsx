'use client';

import { useEffect, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Check,
  Cloud,
  Code2,
  Eye,
  FolderGit2,
  Infinity as InfinityIcon,
  KeyRound,
  PanelLeftClose,
  Plug,
  Plus,
  Rocket,
  Search,
  TerminalSquare,
} from 'lucide-react';
import { Logo } from '@/components/layout/Logo';
import { HomepageChatBar } from '@/components/terminal/HomepageChatBar';
import { getIntegrationLogo } from '@/lib/integrationLogos';

const TOUR_TABS = [
  { id: 'workspace', label: 'Workspace', eyebrow: 'Build with Xroga', icon: TerminalSquare },
  { id: 'repos', label: 'Repositories', eyebrow: 'Your connected code', icon: FolderGit2 },
  { id: 'integrations', label: 'Integrations', eyebrow: 'Connect once', icon: Plug },
  { id: 'preview', label: 'Preview', eyebrow: 'Review the product', icon: Eye },
] as const;

type TourTab = (typeof TOUR_TABS)[number]['id'];

const CONNECTIONS = [
  { id: 'github', name: 'GitHub', tone: 'live' },
  { id: 'vercel', name: 'Vercel', tone: 'live' },
  { id: 'supabase', name: 'Supabase', tone: 'live' },
  { id: 'brevo', name: 'Brevo', tone: 'live' },
  { id: 'cloudflare', name: 'Cloudflare', tone: 'live' },
  { id: 'lemon_squeezy', name: 'Lemon Squeezy', tone: 'live' },
  { id: 'byok', name: 'BYOK', tone: 'live' },
  { id: 'sentry', name: 'Sentry', tone: 'soon' },
] as const;

function WorkspaceView() {
  return (
    <div className="xv-wt-workspace-view">
      <div className="xv-wt-greeting"><span>Good evening,</span><strong>Xroga</strong><b>BLACK HOLE <em>V∞</em></b></div>
      <p>The <i>first</i> and <i>last</i> model you will ever need.</p>
      <div className="xv-wt-connect-banner"><Cloud aria-hidden="true" /><strong>Connect Vercel</strong><span>Deploy on your own project and domain.</span><small>1/4</small><button type="button">Connect</button></div>
      <div className="xv-wt-template-row"><span>›</span><b>Start from a Xroga build</b><small>TEMPLATES</small></div>
      <div className="xv-wt-terminal">
        <div className="xv-wt-terminal-bar"><i /><i /><i /><code>xroga@swarm</code><span>~/workspace</span></div>
        <div className="xv-wt-terminal-body"><p><b>xroga@swarm:~ $</b> Ask Xroga to build or change your product.<span className="xv-wt-caret" /></p></div>
      </div>
    </div>
  );
}

function RepositoriesView() {
  return (
    <div className="xv-wt-projects-view">
      <Logo href={null} variant="homepage" height={42} />
      <header><FolderGit2 aria-hidden="true" /><div><h3>Projects</h3><p>Choose a repository once, then keep every update inside it.</p></div></header>
      <div className="xv-wt-project-tabs"><button type="button" className="is-active">Code &amp; Repos</button><button type="button">Conversations</button></div>
      <label><Search aria-hidden="true" /><input aria-label="Search projects and repositories" placeholder="Search projects & repos…" /></label>
      <article><div><Image src={getIntegrationLogo('github') ?? ''} alt="GitHub" width={18} height={18} unoptimized /><strong>Xroga / client-product</strong><small>main ↗</small></div><h4>Customer product workspace</h4><p>Updated today · repository connected</p><button type="button">Continue</button></article>
    </div>
  );
}

function IntegrationsView() {
  return (
    <div className="xv-wt-connect-view">
      <header><small>SHIP SETUP</small><h3>Connect once · then just describe</h3><p>GitHub and Vercel handle the ship path. Supabase and your own keys are optional.</p></header>
      {CONNECTIONS.slice(0, 4).map((item, index) => {
        const logo = item.id === 'byok' ? null : getIntegrationLogo(item.id, item.name);
        return <button type="button" key={item.id}><span className={index === 0 ? 'is-ready' : ''}>{index === 0 ? <Check /> : index + 1}</span>{logo ? <Image src={logo} alt={`${item.name} logo`} width={22} height={22} unoptimized /> : <KeyRound aria-hidden="true" />}<b>{index + 1}. {item.name}</b><small>{index === 0 ? 'Connected' : index === 3 ? 'Add keys' : 'Authorize'}</small></button>;
      })}
    </div>
  );
}

function PreviewView() {
  return (
    <div className="xv-wt-preview-view">
      <nav><button type="button"><FolderGit2 /> Files</button><button type="button"><Code2 /> Code</button><button type="button" className="is-active"><Eye /> Preview</button><button type="button"><Rocket /> Deploy</button></nav>
      <div className="xv-wt-preview-tabs"><button type="button">MOBILE</button><button type="button">TABLET</button><button type="button" className="is-active">DESKTOP</button></div>
      <div className="xv-wt-preview-canvas"><Logo href={null} variant="sidebar" height={52} /><strong>Your generated product appears here.</strong><p>Build, review, resize, and publish without leaving the workspace.</p></div>
    </div>
  );
}

export function HomepageWorkspaceTour({ loggedIn }: { loggedIn: boolean }) {
  const [active, setActive] = useState<TourTab>('workspace');
  const [paused, setPaused] = useState(false);
  const router = useRouter();

  useEffect(() => {
    if (paused) return;
    const timer = window.setInterval(() => setActive((current) => {
      const index = TOUR_TABS.findIndex((tab) => tab.id === current);
      return TOUR_TABS[(index + 1) % TOUR_TABS.length].id;
    }), 5200);
    return () => window.clearInterval(timer);
  }, [paused]);

  const activeMeta = TOUR_TABS.find((tab) => tab.id === active) ?? TOUR_TABS[0];

  return (
    <section className="xv-wt" aria-label="Interactive Xroga workspace tour">
      <div className="xv-wt-window" onPointerEnter={() => setPaused(true)} onPointerLeave={() => setPaused(false)}>
        <aside className="xv-wt-sidebar">
          <div className="xv-wt-sidebar-head"><Logo href="/" variant="homepage" height={32} /><div><button type="button" aria-label="Collapse sidebar"><PanelLeftClose /></button><button type="button" aria-label="Search workspace"><Search /></button><button type="button" aria-label="New terminal"><Plus /></button></div></div>
          <nav aria-label="Workspace tour sections">
            {TOUR_TABS.map((tab) => { const Icon = tab.icon; return <button key={tab.id} type="button" className={active === tab.id ? 'is-active' : ''} onClick={() => setActive(tab.id)}><Icon aria-hidden="true" />{tab.label}</button>; })}
          </nav>
          <Link href={loggedIn ? '/workspace' : '/auth/signup'}><span>X</span><b>Xroga<small>Launch Promotion</small></b><Rocket /></Link>
        </aside>

        <div className="xv-wt-main">
          <header><span><i /> Xroga Workspace</span><em>{activeMeta.eyebrow}</em><button type="button" onClick={() => router.push(loggedIn ? '/workspace' : '/auth/signup')}>{loggedIn ? 'Open workspace' : 'Start building'}</button></header>
          <div className="xv-wt-canvas" key={active}>
            {active === 'workspace' && <WorkspaceView />}
            {active === 'repos' && <RepositoriesView />}
            {active === 'integrations' && <IntegrationsView />}
            {active === 'preview' && <PreviewView />}
          </div>
          {active === 'workspace' && <div className="xv-wt-composer"><HomepageChatBar listenForAsk={false} suggestions={['Build a website', 'Update my repo', 'Ship a preview']} fallbackPrompt="Build my product in the Xroga workspace" /></div>}
        </div>
      </div>

      <div className="xv-wt-dots" aria-label="Workspace tour controls">{TOUR_TABS.map((tab) => <button key={tab.id} type="button" aria-label={`Show ${tab.label}`} className={active === tab.id ? 'is-active' : ''} onClick={() => setActive(tab.id)} />)}</div>

      <div className="xv-connection-dock" aria-label="Xroga integrations">
        <div className="xv-connection-dock__orbit">
          <Link href={loggedIn ? '/dashboard/integrations' : '/auth/signup'} className="xv-connection-dock__core" aria-label="Open Xroga integrations"><InfinityIcon aria-hidden="true" /></Link>
          {CONNECTIONS.map((item, index) => {
            const logo = item.id === 'byok' ? null : getIntegrationLogo(item.id, item.name);
            return <div key={item.id} className={`xv-connection-dock__node xv-connection-dock__node--${index + 1} is-${item.tone}`} title={`${item.name}${item.tone === 'soon' ? ' · Soon' : ''}`}>{logo ? <Image src={logo} alt={`${item.name} logo`} width={27} height={27} unoptimized /> : <KeyRound aria-label="Bring your own API key" />}{item.tone === 'soon' && <small>Soon</small>}</div>;
          })}
        </div>
        <p><strong>Connect your stack.</strong><span>GitHub · Vercel · Supabase · Brevo · Cloudflare · Lemon Squeezy · BYOK</span></p>
      </div>
    </section>
  );
}
