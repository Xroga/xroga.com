'use client';

import { useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  ChevronDown,
  Compass,
  FolderGit2,
  GitBranch,
  KeyRound,
  LayoutDashboard,
  Maximize2,
  PanelLeftClose,
  PanelLeftOpen,
  Palette,
  Plug,
  Plus,
  Rocket,
  Search,
  Settings,
  SlidersHorizontal,
  TerminalSquare,
} from 'lucide-react';
import { Logo } from '@/components/layout/Logo';
import { ThemeToggle } from '@/components/layout/ThemeToggle';
import { HomepageChatBar } from '@/components/terminal/HomepageChatBar';
import { IntegrationLogo } from '@/components/integrations/IntegrationLogo';
import { AnimatedIcon } from '@/components/icons/animated/AnimatedIcon';
import { LightbulbIcon } from '@/components/icons/animated/LightbulbIcon';
import { EarthIcon } from '@/components/icons/animated/EarthIcon';
import { AirplayIcon } from '@/components/icons/animated/AirplayIcon';
import { TabletIcon } from '@/components/icons/animated/TabletIcon';
import { CpuIcon } from '@/components/icons/animated/CpuIcon';
import { SHOWCASE_TEMPLATES, thumbnailFor } from '@/lib/showcase/registry';
import { skinForTheme } from '@/lib/theme';
import { useThemeStore } from '@/store/useThemeStore';

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

const IDEA_TABS = [
  { label: 'Suggestions', icon: LightbulbIcon },
  { label: 'Websites', icon: EarthIcon },
  { label: 'SaaS apps', icon: AirplayIcon },
  { label: 'Mobile', icon: TabletIcon },
  { label: 'Automation', icon: CpuIcon },
] as const;

function WorkspaceTemplateRail() {
  const templates = SHOWCASE_TEMPLATES.slice(0, 4);

  return (
    <section className="xv-wt-real-templates" aria-label="Xroga templates">
      <header>
        <nav aria-label="Template sources"><span>Recent builds</span><span>Community templates</span><b>Xroga templates</b></nav>
        <Link href="/showcase">Browse all ↗</Link>
      </header>
      <div className="xv-wt-real-template-row">
        {templates.map((template, index) => (
          <Link key={template.id} href={`/showcase/${template.slug}/preview`}>
            <span className="xv-wt-real-template-image">
              <Image src={thumbnailFor(template, 'desktop')} alt={`${template.name} preview`} fill sizes="(max-width: 760px) 72vw, 22vw" />
            </span>
            <strong>{template.name}</strong>
            <small>By Xroga templates</small>
            <footer><code>{String(index + 1).padStart(2, '0')} · {template.category}</code><i>→</i></footer>
          </Link>
        ))}
      </div>
    </section>
  );
}

function WorkspaceHome() {
  return (
    <div className="xv-wt-real-home">
      <header className="xv-wt-real-greeting">
        <span>Good afternoon,</span>
        <strong>Orbit Clean E2E</strong>
        <p>Describe it. Build it. <em>Ship it.</em></p>
      </header>

      <div className="xv-wt-real-composer">
        <div className="xv-wt-real-companion" aria-hidden="true">
          <Image src="/brand/costumes/techwear.webp" alt="" width={76} height={76} />
          <span>Black Hole V∞</span>
        </div>
        <HomepageChatBar
          listenForAsk={false}
          placeholders={['Describe what you want to build or change…']}
          fallbackPrompt="Build my product in the Xroga workspace"
        />
        <div className="xv-wt-real-repo" aria-label="Selected repository">
          <b>Update current</b><span>New product</span><strong>Xroga/xroga-e2e-orbit-coffee-20260820-164425</strong><code>main⌄</code>
        </div>
      </div>

      <nav className="xv-wt-real-ideas" aria-label="Build idea categories">
        {IDEA_TABS.map(({ label, icon }) => <button type="button" key={label}><AnimatedIcon icon={icon} size={14} intro={false} />{label}</button>)}
      </nav>

      <WorkspaceTemplateRail />
    </div>
  );
}

function WorkspaceSidebar({ collapsed, onToggle, loggedIn }: { collapsed: boolean; onToggle: () => void; loggedIn: boolean }) {
  const [repoExpanded, setRepoExpanded] = useState(true);

  return (
    <aside className="xv-wt-sidebar">
      <div className="xv-wt-sidebar-head">
        <Logo href="/" variant={collapsed ? 'sidebar' : 'homepage'} height={collapsed ? 34 : 30} />
        <div>
          <button type="button" aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'} onClick={onToggle}>{collapsed ? <PanelLeftOpen /> : <PanelLeftClose />}</button>
          <button type="button" aria-label="Search workspace"><Search /></button>
          <button type="button" aria-label="New terminal"><Plus /></button>
          <ThemeToggle placement="right-start" />
        </div>
      </div>

      <nav className="xv-wt-sidebar-menu" aria-label="Workspace sections">
        <button type="button" className="is-active"><TerminalSquare /><span>Workspace</span></button>
        <Link href={loggedIn ? '/dashboard' : '/auth/signup'}><LayoutDashboard /><span>Dashboard</span></Link>
        <Link href={loggedIn ? '/dashboard/projects' : '/auth/signup'}><FolderGit2 /><span>Repositories</span></Link>
        <Link href={loggedIn ? '/dashboard/integrations' : '/auth/signup'}><Plug /><span>Integrations</span></Link>
        <Link href={loggedIn ? '/dashboard/publish' : '/auth/signup'}><Rocket /><span>Launch &amp; Growth</span><ChevronDown className="xv-wt-nav-chevron" /></Link>
        <Link href="/showcase"><Compass /><span>Explore</span><ChevronDown className="xv-wt-nav-chevron" /></Link>
        <Link href={loggedIn ? '/settings' : '/auth/signup'}><Settings /><span>Settings</span></Link>
      </nav>

      <section className="xv-wt-repo-history" aria-label="Saved repositories">
        <header><b>REPOSITORIES</b><button type="button" aria-label="Filter repositories"><SlidersHorizontal /></button></header>
        <button type="button" onClick={() => setRepoExpanded((value) => !value)}><ChevronDown className={repoExpanded ? '' : 'is-folded'} /><FolderGit2 /><strong>xroga-e2e-orbit-coffee</strong><small>9</small></button>
        {repoExpanded ? <div>{Array.from({ length: 6 }, (_, index) => <button type="button" key={index}><span>#{index + 1} terminal</span><GitBranch /><small>{index === 0 ? 'now' : '8d'}</small></button>)}</div> : null}
      </section>

      <Link className="xv-wt-sidebar-account" href={loggedIn ? '/workspace' : '/auth/signup'}><span>O</span><b>Orbit Clean E2E<small>Launch Promotion</small></b><Rocket /></Link>
    </aside>
  );
}

export function HomepageIntegrationOrbit({ loggedIn }: { loggedIn: boolean }) {
  return (
    <div className="xv-connection-dock" aria-label="Xroga integrations">
      <div className="xv-connection-dock__orbit">
        <Link href={loggedIn ? '/dashboard/integrations' : '/auth/signup'} className="xv-connection-dock__core" aria-label="Open Xroga integrations"><Image src="/brand/xroga-mark-192.png" alt="Xroga" width={74} height={74} /></Link>
        {CONNECTIONS.map((item, index) => <div key={item.id} className={`xv-connection-dock__node xv-connection-dock__node--${index + 1} is-${item.tone}`} title={`${item.name}${item.tone === 'soon' ? ' · Soon' : ''}`}>{item.id === 'byok' ? <KeyRound aria-label="Bring your own API key" /> : <IntegrationLogo id={item.id} name={item.name} size={27} />}{item.tone === 'soon' ? <small>Soon</small> : null}</div>)}
      </div>
    </div>
  );
}

export function HomepageWorkspaceTour({ loggedIn }: { loggedIn: boolean }) {
  const [collapsed, setCollapsed] = useState(false);
  const theme = useThemeStore((state) => state.theme);
  const router = useRouter();
  const demoSkin = skinForTheme(theme);

  return (
    <section className="xv-wt" aria-label="Interactive Xroga workspace tour">
      <div className="xv-wt-scroll" tabIndex={0} aria-label="Xroga workspace preview">
        <div className={`xv-wt-window terminal-skin-${demoSkin}${collapsed ? ' is-collapsed' : ''}`} data-home-theme={theme}>
          <WorkspaceSidebar collapsed={collapsed} onToggle={() => setCollapsed((value) => !value)} loggedIn={loggedIn} />
          <div className="xv-wt-desktop-bar">
            <i /><i /><i /><TerminalSquare aria-hidden="true" /><strong>xroga@swarm</strong><code>~/workspace</code>
            <span aria-label="Automatic workspace theme"><Palette aria-hidden="true" /> Auto</span>
            <button type="button" aria-label="Open real workspace" onClick={() => router.push(loggedIn ? '/workspace' : '/auth/signup')}><Maximize2 /></button>
          </div>
          <main className="xv-wt-main"><WorkspaceHome /></main>
        </div>
      </div>
    </section>
  );
}
