'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Activity, AppWindow, ArrowLeft, ArrowUpRight, Blocks, BookOpen, Bot, Braces, CalendarClock, ChevronDown, ChevronRight, CircleHelp, Code2, Compass, Folder, Globe2, HardDrive, Layers3, Menu, PanelLeftClose, Play, Settings2, ShieldCheck, FlaskConical, GitBranch, LifeBuoy } from 'lucide-react';
import { PREVIEW_DESTINATIONS, PREVIEW_GROUPS } from '@/lib/osPreviewNavigation';
import { useOsCommand2Store } from '@/store/useOsCommand2Store';

const ICONS: Record<string, typeof AppWindow> = {
  workspace: AppWindow, projects: Folder, coding: Code2, browser: Globe2, automations: CalendarClock,
  employees: Bot, 'work-packs': Blocks, genome: Braces, artifacts: BookOpen, drive: HardDrive, insights: Activity, settings: Settings2,
  'rich-results': Layers3, overview: Compass, activity: Activity, research: BookOpen,
  experience: ShieldCheck, skills: Blocks, bench: FlaskConical, models: GitBranch, help: LifeBuoy,
};

export function OsPreviewShell({ children, context = 'Product preview' }: { children: React.ReactNode; context?: string }) {
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);
  const [closedGroups, setClosedGroups] = useState<string[]>([]);

  useEffect(() => { void useOsCommand2Store.persist.rehydrate(); }, []);

  useEffect(() => { setMenuOpen(false); }, [pathname]);
  useEffect(() => {
    if (!menuOpen) return;
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === 'Escape') setMenuOpen(false); };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [menuOpen]);

  return (
    <div className="os-preview">
      <a className="os-skip" href="#os-main">Skip to content</a>
      {menuOpen ? <button className="os-backdrop" aria-label="Close preview navigation" onClick={() => setMenuOpen(false)} /> : null}
      <aside className={`os-sidebar ${menuOpen ? 'is-open' : ''}`} aria-label="Xroga OS preview navigation">
        <div className="os-sidebar-top">
          <Link href="/os-preview" className="os-wordmark" aria-label="Xroga OS preview home"><span className="os-brand-mark">X</span><span>Xroga <b>OS</b></span></Link>
          <button className="os-icon-button os-drawer-close" type="button" onClick={() => setMenuOpen(false)} aria-label="Close preview navigation"><PanelLeftClose size={18} /></button>
        </div>
        <div className="os-sidebar-scroll">
          <p className="os-nav-label">Start here</p>
          <Link className={`os-nav-link ${pathname === '/os-preview' ? 'is-current' : ''}`} href="/os-preview" aria-current={pathname === '/os-preview' ? 'page' : undefined}><Compass size={17} /> Preview home <ChevronRight size={14} className="os-nav-chevron" /></Link>
          <Link className={`os-nav-link ${pathname === '/os-preview/journey' ? 'is-current' : ''}`} href="/os-preview/journey" aria-current={pathname === '/os-preview/journey' ? 'page' : undefined}><Play size={17} /> Try the journey <ChevronRight size={14} className="os-nav-chevron" /></Link>
          {PREVIEW_GROUPS.map((group) => (
            <div className="os-nav-group" key={group}>
              <button className="os-nav-label os-nav-group-toggle" type="button" aria-expanded={!closedGroups.includes(group)} onClick={() => setClosedGroups((current) => current.includes(group) ? current.filter((value) => value !== group) : [...current, group])}>{group}<ChevronDown size={13} aria-hidden="true" /></button>
              {!closedGroups.includes(group) && PREVIEW_DESTINATIONS.filter((item) => item.group === group).map((item) => {
                const Icon = ICONS[item.slug] ?? CircleHelp;
                const href = `/os-preview/${item.slug}`;
                return <Link className={`os-nav-link ${pathname === href ? 'is-current' : ''}`} href={href} key={item.slug} aria-current={pathname === href ? 'page' : undefined}><Icon size={17} /><span>{item.label}</span>{item.availability === 'coming-soon' ? <span className="os-nav-dot" aria-label="Coming soon" /> : null}</Link>;
              })}
            </div>
          ))}
        </div>
        <div className="os-sidebar-bottom"><span>COMMAND 2 · INTERACTIVE PREVIEW</span><Link href="/workspace" prefetch={false}>Open current workspace <ArrowUpRight size={14} /></Link></div>
      </aside>
      <div className="os-stage">
        <header className="os-topbar">
          <button className="os-icon-button os-menu-toggle" type="button" aria-label="Open preview navigation" aria-expanded={menuOpen} onClick={() => setMenuOpen(true)}><Menu size={20} /></button>
          <div className="os-breadcrumb"><Link href="/os-preview">Xroga OS</Link><ChevronRight size={14} aria-hidden="true" /><span>{context}</span></div>
          <Link className="os-back-link" href="/workspace" prefetch={false}><ArrowLeft size={15} /> Current workspace</Link>
        </header>
        <main id="os-main" className="os-main">{children}</main>
        <footer className="os-footer">Xroga OS Preview · Planned features are labelled. No demo action performs real work.</footer>
      </div>
    </div>
  );
}
