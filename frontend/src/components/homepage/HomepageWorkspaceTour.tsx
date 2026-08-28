'use client';

import { useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Bitcoin,
  Check,
  ChevronDown,
  Cloud,
  Code2,
  Compass,
  Eye,
  FileCode2,
  Files,
  FolderGit2,
  GitBranch,
  KeyRound,
  LayoutDashboard,
  PanelLeftClose,
  PanelLeftOpen,
  Plug,
  Plus,
  Rocket,
  Search,
  Settings,
  SlidersHorizontal,
  TerminalSquare,
} from 'lucide-react';
import { Logo } from '@/components/layout/Logo';
import { HomepageChatBar } from '@/components/terminal/HomepageChatBar';
import { IntegrationLogo } from '@/components/integrations/IntegrationLogo';

const TOUR_TABS = [
  { id: 'workspace', label: 'Workspace', eyebrow: 'Connected product loop', icon: TerminalSquare },
  { id: 'repos', label: 'Repositories', eyebrow: 'Your connected code', icon: FolderGit2 },
  { id: 'integrations', label: 'Integrations', eyebrow: 'Connect once', icon: Plug },
] as const;

const DOCK_TABS = ['Files', 'Code', 'Changes', 'Terminal', 'Preview', 'Deploy'] as const;
type TourTab = (typeof TOUR_TABS)[number]['id'];
type DockTab = (typeof DOCK_TABS)[number];

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

const FILES = ['app/page.tsx', 'components/Analytics.tsx', 'lib/dashboard.ts', 'tests/dashboard.test.ts'];

function WorkspaceTerminal() {
  return (
    <div className="xv-wt-workspace-view">
      <div className="xv-wt-greeting"><span>Good evening,</span><strong>Xroga</strong><b>BLACK HOLE <em>V∞</em></b></div>
      <p>One prompt. <i>Yours</i> to <i>ship</i>.</p>
      <div className="xv-wt-connect-banner"><Cloud aria-hidden="true" /><strong>Connect Vercel</strong><span>Deploy on your own project and domain.</span><small>3/4</small><i /><i /><i /><button type="button">Connect</button></div>
      <button className="xv-wt-template-row" type="button"><span>›</span><b>Start from a Xroga build</b><small>TEMPLATES</small></button>
      <div className="xv-wt-terminal">
        <div className="xv-wt-terminal-bar"><i /><i /><i /><code>xroga@swarm</code><span>~/workspace</span><button type="button">Workspace</button><button type="button">Graphite</button></div>
        <div className="xv-wt-terminal-body">
          <p><b>xroga@swarm:~ $</b> Build a customer analytics platform with authentication, subscriptions, analytics, and admin controls.<span className="xv-wt-caret" /></p>
          <div className="xv-wt-run-lines" aria-live="polite">
            <span className="is-done">● planner: Product brief created</span>
            <span className="is-done">● builder: Authentication and dashboard files written</span>
            <span className="is-live">● builder: Implementing subscriptions and analytics…</span>
            <code>components/Analytics.tsx · 84 lines</code>
            <div className="xv-wt-progress"><span /></div>
          </div>
        </div>
      </div>
    </div>
  );
}

function RepositoriesView() {
  return (
    <div className="xv-wt-projects-view">
      <Logo href={null} variant="homepage" height={42} />
      <header><FolderGit2 aria-hidden="true" /><div><h3>Projects</h3><p>Repository-scoped builds and conversations. Choose a repo once, then work only inside it.</p></div></header>
      <div className="xv-wt-project-tabs"><button type="button" className="is-active">Code &amp; Repos</button><button type="button">Conversations</button></div>
      <label><Search aria-hidden="true" /><input aria-label="Search projects and repositories" placeholder="Search projects & repos…" /></label>
      <article><div><IntegrationLogo id="github" name="GitHub" size={18} /><strong>Xroga / client-product</strong><small>main ↗</small></div><h4>Customer analytics platform</h4><p>Updated now · repository connected</p><button type="button">Continue</button></article>
    </div>
  );
}

function IntegrationsView() {
  return (
    <div className="xv-wt-connect-view">
      <header><small>SHIP SETUP</small><h3>Connect once · then just describe</h3><p>GitHub and Vercel handle the ship path. Supabase and your own keys are optional.</p></header>
      {CONNECTIONS.slice(0, 4).map((item, index) => {
        return <button type="button" key={item.id}><span className={index === 0 ? 'is-ready' : ''}>{index === 0 ? <Check /> : index + 1}</span>{item.id === 'byok' ? <KeyRound aria-hidden="true" /> : <IntegrationLogo id={item.id} name={item.name} size={22} />}<b>{index + 1}. {item.name}</b><small>{index === 0 ? 'Connected' : index === 3 ? 'Add keys' : 'Authorize'}</small></button>;
      })}
    </div>
  );
}

function DockContent({ active }: { active: DockTab }) {
  if (active === 'Files') {
    return <div className="xv-wt-dock-files">{FILES.map((file) => <button type="button" key={file}><FileCode2 /><span>{file}</span></button>)}</div>;
  }
  if (active === 'Code' || active === 'Changes') {
    return <div className="xv-wt-dock-code"><p><span>export default</span> <b>function</b> Analytics() {'{'}</p><p>&nbsp;&nbsp;<em>return</em> &lt;Dashboard data={'{'}metrics{'}'} /&gt;;</p><p>{'}'}</p><footer><strong>+84</strong><span>-3</span> · components/Analytics.tsx</footer></div>;
  }
  if (active === 'Terminal') {
    return <div className="xv-wt-dock-terminal"><header><span>OUTPUT</span><small>6 lines</small></header><code>$ npm run test</code><code className="is-ok">✓ TypeScript passed</code><code className="is-ok">✓ 18 tests passed</code><code>$ npm run build</code><code className="is-ok">✓ Production build complete</code></div>;
  }
  if (active === 'Deploy') {
    return <div className="xv-wt-dock-deploy"><IntegrationLogo id="vercel" name="Vercel" size={32} /><small>PRODUCTION</small><h4>Ready to deploy</h4><p>Commit a1b2c3d · all checks passed</p><button type="button">View deployment</button></div>;
  }
  return (
    <div className="xv-wt-dock-preview">
      <div className="xv-wt-browser-bar"><button type="button" aria-label="Go back">‹</button><button type="button" aria-label="Go forward">›</button><button type="button" aria-label="Refresh preview">↻</button><span>preview.xroga.app</span></div>
      <div className="xv-wt-product-preview">
        <aside><b>Pulse</b><span className="is-active">Overview</span><span>Customers</span><span>Revenue</span><span>Reports</span></aside>
        <main><small>Monthly revenue</small><strong>$48,290</strong><div className="xv-wt-mini-chart">{[38, 56, 46, 73, 64, 86, 78].map((height, index) => <i key={index} style={{ height: `${height}%` }} />)}</div><footer><span><b>1,842</b>Active customers</span><span><b>12.8%</b>Conversion</span><span><b>+24%</b>Growth</span></footer></main>
      </div>
    </div>
  );
}

function WorkspaceDock({ active, onChange }: { active: DockTab; onChange: (tab: DockTab) => void }) {
  return (
    <aside className="xv-wt-dev-dock" aria-label="Workspace development panel">
      <nav role="tablist" aria-label="Development panel tabs">
        {DOCK_TABS.map((tab) => <button type="button" role="tab" aria-selected={active === tab} className={active === tab ? 'is-active' : ''} key={tab} onClick={() => onChange(tab)}>{tab === 'Files' ? <Files /> : tab === 'Code' ? <Code2 /> : tab === 'Preview' ? <Eye /> : tab === 'Deploy' ? <Rocket /> : tab === 'Terminal' ? <TerminalSquare /> : <GitBranch />}{tab}</button>)}
      </nav>
      <div className="xv-wt-dev-dock__body" role="tabpanel"><DockContent active={active} /></div>
    </aside>
  );
}

export function HomepageIntegrationOrbit({ loggedIn }: { loggedIn: boolean }) {
  return (
    <div className="xv-connection-dock" aria-label="Xroga integrations">
      <div className="xv-connection-dock__orbit">
        <Link href={loggedIn ? '/dashboard/integrations' : '/auth/signup'} className="xv-connection-dock__core" aria-label="Open Xroga integrations"><Image src="/brand/xroga-mark-192.png" alt="Xroga" width={74} height={74} /></Link>
        {CONNECTIONS.map((item, index) => {
          return <div key={item.id} className={`xv-connection-dock__node xv-connection-dock__node--${index + 1} is-${item.tone}`} title={`${item.name}${item.tone === 'soon' ? ' · Soon' : ''}`}>{item.id === 'byok' ? <KeyRound aria-label="Bring your own API key" /> : <IntegrationLogo id={item.id} name={item.name} size={27} />}{item.tone === 'soon' ? <small>Soon</small> : null}</div>;
        })}
      </div>
    </div>
  );
}

export function HomepageWorkspaceTour({ loggedIn }: { loggedIn: boolean }) {
  const [active, setActive] = useState<TourTab>('workspace');
  const [dockTab, setDockTab] = useState<DockTab>('Preview');
  const [collapsed, setCollapsed] = useState(false);
  const [repoExpanded, setRepoExpanded] = useState(true);
  const router = useRouter();
  const activeMeta = TOUR_TABS.find((tab) => tab.id === active) ?? TOUR_TABS[0];

  return (
    <section className="xv-wt" aria-label="Interactive Xroga workspace tour">
      <div className="xv-wt-scroll" tabIndex={0} aria-label="Scrollable Xroga desktop workspace">
        <div className={`xv-wt-window${collapsed ? ' is-collapsed' : ''}`}>
          <div className="xv-wt-desktop-bar"><i /><i /><i /><strong>Xroga Workspace</strong><span>customer-analytics · connected</span></div>
          <aside className="xv-wt-sidebar">
            <div className="xv-wt-sidebar-head"><Logo href="/" variant={collapsed ? 'sidebar' : 'homepage'} height={collapsed ? 36 : 32} /><div><button type="button" aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'} onClick={() => setCollapsed((value) => !value)}>{collapsed ? <PanelLeftOpen /> : <PanelLeftClose />}</button><button type="button" aria-label="Search workspace" onClick={() => setActive('repos')}><Search /></button><button type="button" aria-label="New terminal" onClick={() => setActive('workspace')}><Plus /></button></div></div>
            <nav aria-label="Workspace tour sections">
              <button type="button" className={active === 'workspace' ? 'is-active' : ''} onClick={() => setActive('workspace')}><TerminalSquare /><span>Workspace</span></button>
              <Link href={loggedIn ? '/dashboard' : '/auth/signup'}><LayoutDashboard /><span>Dashboard</span></Link>
              {/* `/crypto-builder` has never been a route — the page is `/crypto`. The old
                  href 404'd here and on every other surface that copied it. */}
              <Link href="/crypto"><Bitcoin /><span>Crypto Builder</span></Link>
              <button type="button" className={active === 'repos' ? 'is-active' : ''} onClick={() => setActive('repos')}><FolderGit2 /><span>Repositories</span></button>
              <button type="button" className={active === 'integrations' ? 'is-active' : ''} onClick={() => setActive('integrations')}><Plug /><span>Integrations</span></button>
              <Link href={loggedIn ? '/dashboard/publish' : '/auth/signup'}><Rocket /><span>Launch &amp; Growth</span><ChevronDown className="xv-wt-nav-chevron" /></Link>
              <Link href="/showcase"><Compass /><span>Explore</span><ChevronDown className="xv-wt-nav-chevron" /></Link>
              <Link href={loggedIn ? '/settings' : '/auth/signup'}><Settings /><span>Settings</span></Link>
            </nav>
            <section className="xv-wt-repo-history" aria-label="Saved repositories">
              <header><b>REPOSITORIES</b><button type="button" aria-label="Filter repositories" onClick={() => setActive('repos')}><SlidersHorizontal /></button></header>
              <button type="button" onClick={() => setRepoExpanded((value) => !value)}><ChevronDown className={repoExpanded ? '' : 'is-folded'} /><FolderGit2 /><strong>client-product</strong><small>6</small></button>
              {repoExpanded ? <div>{['#1 terminal', '#2 terminal', '#3 terminal'].map((terminal, index) => <button type="button" key={terminal} onClick={() => setActive('workspace')}><span>{terminal}</span><GitBranch /><small>{index === 0 ? 'now' : `${index + 1}d`}</small></button>)}</div> : null}
            </section>
            <Link href={loggedIn ? '/workspace' : '/auth/signup'}><span>X</span><b>Xroga<small>Launch Promotion</small></b><Rocket /></Link>
          </aside>

          <div className="xv-wt-main">
            <header><span><i /> Xroga Workspace</span><em>{activeMeta.eyebrow}</em><button type="button" onClick={() => router.push(loggedIn ? '/workspace' : '/auth/signup')}>{loggedIn ? 'Open workspace' : 'Start building'}</button></header>
            <div className="xv-wt-studio">
              <div className="xv-wt-primary">
                <div className="xv-wt-canvas" key={active}>
                  {active === 'workspace' ? <WorkspaceTerminal /> : null}
                  {active === 'repos' ? <RepositoriesView /> : null}
                  {active === 'integrations' ? <IntegrationsView /> : null}
                </div>
                {active === 'workspace' ? <div className="xv-wt-composer"><HomepageChatBar listenForAsk={false} suggestions={['Build a website', 'Update my repo', 'Ship a preview']} fallbackPrompt="Build my product in the Xroga workspace" /></div> : null}
              </div>
              <WorkspaceDock active={dockTab} onChange={setDockTab} />
            </div>
          </div>
        </div>
      </div>

      <div className="xv-wt-dots" aria-label="Workspace panel shortcuts">{DOCK_TABS.map((tab) => <button key={tab} type="button" aria-label={`Show ${tab}`} className={dockTab === tab ? 'is-active' : ''} onClick={() => setDockTab(tab)} />)}</div>
    </section>
  );
}
