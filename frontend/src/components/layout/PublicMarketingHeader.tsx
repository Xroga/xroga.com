'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  AppWindow,
  ArrowUpRight,
  BookOpen,
  Boxes,
  ChevronDown,
  Code2,
  FileCode2,
  GalleryHorizontalEnd,
  GitBranch,
  Globe2,
  LayoutDashboard,
  LayoutGrid,
  LogIn,
  Menu,
  Rocket,
  Search,
  ShieldCheck,
  Sparkles,
  TerminalSquare,
  WandSparkles,
  Workflow,
  X,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { HomepageThemeSwitcher } from '@/components/companion/HomepageThemeSwitcher';
import { Logo } from '@/components/layout/Logo';
import { createClient } from '@/lib/supabase/client';
import { getIntegrationLogo } from '@/lib/integrationLogos';
import { PUBLIC_MARKETING_NAV } from '@/lib/publicMarketing';

type MegaItem = {
  href: string;
  label: string;
  note: string;
  icon?: typeof Sparkles;
  logoId?: string;
  logoName?: string;
};

type MegaMenu = {
  eyebrow: string;
  title: string;
  description: string;
  primary: MegaItem[];
  secondary: MegaItem[];
  ctaHref: string;
  ctaLabel: string;
  art: 'product' | 'build' | 'connect' | 'develop' | 'explore';
};

const MEGA_MENUS: Partial<Record<(typeof PUBLIC_MARKETING_NAV)[number]['label'], MegaMenu>> = {
  Product: {
    eyebrow: 'XROGA',
    title: 'Everything Xroga can do.',
    description: 'One AI workspace to create software, work on existing code, connect external apps, verify results, and help ship what you build.',
    primary: [
      { href: '/features', label: 'Overview', note: 'See the full Xroga product.', icon: Sparkles },
      { href: '/software', label: 'Workspace', note: 'Chat, build, inspect, preview, and iterate.', icon: LayoutDashboard },
      { href: '/features', label: 'Xroga Intelligence', note: 'Plan and coordinate software work.', icon: Workflow },
    ],
    secondary: [
      { href: '/features', label: 'Verification', note: 'Tests, builds, evidence, and blockers.', icon: ShieldCheck },
      { href: '/integrations', label: 'Integrations', note: 'Connect apps and services to Xroga.', icon: Boxes },
      { href: '/github-ai-coding-agent', label: 'GitHub & ownership', note: 'Keep source code in repositories you control.', icon: GitBranch },
    ],
    ctaHref: '/features',
    ctaLabel: 'Explore Xroga',
    art: 'product',
  },

  Build: {
    eyebrow: 'BUILD',
    title: 'Build almost any kind of software.',
    description: 'Start with an idea, a prompt, or a product direction and turn it into a working project.',
    primary: [
      { href: '/ai-app-builder', label: 'Web apps', note: 'Full-stack products with real application logic.', icon: AppWindow },
      { href: '/ai-website-builder', label: 'Websites', note: 'Marketing sites, product sites, and landing pages.', icon: Globe2 },
      { href: '/build-saas-with-ai', label: 'SaaS', note: 'Subscription products, dashboards, and accounts.', icon: LayoutDashboard },
    ],
    secondary: [
      { href: '/build', label: 'Extensions, APIs & tools', note: 'Browser extensions, APIs, automations, and utilities.', icon: Boxes },
      { href: '/game-builder', label: 'Games', note: 'Build supported playable web experiences.', icon: Rocket },
      { href: '/crypto-builder', label: 'Web3 & crypto', note: 'Build supported Web3 product experiences.', icon: Sparkles },
    ],
    ctaHref: '/build',
    ctaLabel: 'Explore What You Can Build',
    art: 'build',
  },

  Connect: {
    eyebrow: 'XROGA CONNECT',
    title: 'Connect Xroga to the apps you already use.',
    description: 'Let Xroga retrieve data from supported connected apps and perform actions you explicitly request.',
    primary: [
      { href: '/integrations', label: 'Gmail & Calendar', note: 'Email, schedules, and connected Google workflows.', logoId: 'gmail_google_calendar', logoName: 'Gmail' },
      { href: '/integrations', label: 'Slack', note: 'Read and act in connected team workflows.', logoId: 'slack', logoName: 'Slack' },
      { href: '/integrations', label: 'Notion', note: 'Work with connected workspace content.', logoId: 'notion', logoName: 'Notion' },
    ],
    secondary: [
      { href: '/integrations', label: 'GitHub', note: 'Repositories, project delivery, and code workflows.', logoId: 'github', logoName: 'GitHub' },
      { href: '/integrations', label: 'Stripe', note: 'Supported billing and business workflows.', logoId: 'stripe', logoName: 'Stripe' },
      { href: '/integrations', label: 'Vercel & Supabase', note: 'Deployment, data, authentication, and app infrastructure.', logoId: 'vercel', logoName: 'Vercel' },
    ],
    ctaHref: '/integrations',
    ctaLabel: 'Explore All Integrations',
    art: 'connect',
  },

  Develop: {
    eyebrow: 'DEVELOP',
    title: 'Work on real software you already own.',
    description: 'Bring an existing repository and use Xroga for implementation, debugging, verification, and release preparation.',
    primary: [
      { href: '/ai-coding-agent', label: 'Existing projects', note: 'Understand and change a real codebase.', icon: Code2 },
      { href: '/github-ai-coding-agent', label: 'GitHub repositories', note: 'Work from connected repositories and branches.', icon: GitBranch },
      { href: '/ai-coding-agent', label: 'Add features & fix bugs', note: 'Make focused changes without rebuilding everything.', icon: FileCode2 },
    ],
    secondary: [
      { href: '/ai-coding-agent', label: 'Test & verify', note: 'Run relevant checks and surface failures.', icon: ShieldCheck },
      { href: '/tools/production-readiness-checker', label: 'Production readiness', note: 'Check whether a project is ready to ship.', icon: Search },
      { href: '/docs', label: 'Developer docs', note: 'Technical reference and workflow guidance.', icon: TerminalSquare },
    ],
    ctaHref: '/ai-coding-agent',
    ctaLabel: 'Explore Development Workflows',
    art: 'develop',
  },

  Explore: {
    eyebrow: 'EXPLORE',
    title: 'See what Xroga can build and how it works.',
    description: 'Browse examples, learn the workflows, and compare product paths before you start.',
    primary: [
      { href: '/showcase', label: 'Showcase', note: 'See real product directions and output.', icon: GalleryHorizontalEnd },
      { href: '/build', label: 'Build categories', note: 'Explore apps, websites, SaaS, tools, and more.', icon: Boxes },
      { href: '/learn', label: 'Guides & tutorials', note: 'Learn how to build with Xroga.', icon: BookOpen },
    ],
    secondary: [
      { href: '/blog', label: 'Blog', note: 'Product, software, and AI-building insights.', icon: FileCode2 },
      { href: '/compare', label: 'Compare', note: 'Evidence-based comparisons and alternatives.', icon: ShieldCheck },
      { href: '/docs', label: 'Docs', note: 'Product and technical documentation.', icon: BookOpen },
    ],
    ctaHref: '/showcase',
    ctaLabel: 'Explore Xroga',
    art: 'explore',
  },
};

const CONNECT_LOGOS = [
  { id: 'github', name: 'GitHub' },
  { id: 'slack', name: 'Slack' },
  { id: 'notion', name: 'Notion' },
  { id: 'stripe', name: 'Stripe' },
  { id: 'vercel', name: 'Vercel' },
  { id: 'supabase', name: 'Supabase' },
] as const;

function BrandMark({ id, name }: { id: string; name: string }) {
  const src = getIntegrationLogo(id, name);
  if (!src) return <Boxes aria-hidden="true" />;
  return <img src={src} alt="" loading="lazy" referrerPolicy="no-referrer" />;
}

function MegaArt({ kind }: { kind: MegaMenu['art'] }) {
  if (kind === 'build') {
    return (
      <div className="xv-nav-art xv-nav-art--app" aria-hidden="true">
        <span className="xv-nav-art__serif">Build</span>
        <div className="xv-nav-art__fan">
          <i /><i /><i /><i />
          <b>anything</b>
        </div>
      </div>
    );
  }

  if (kind === 'connect') {
    return (
      <div className="xv-nav-art xv-nav-art--connect" aria-hidden="true">
        <span className="xv-nav-art__serif">Connect</span>
        <div className="xv-nav-connect-orbit">
          <div className="xv-nav-connect-core">X</div>
          {CONNECT_LOGOS.map((item, index) => (
            <span className="xv-nav-connect-logo" style={{ '--logo-index': index } as React.CSSProperties} key={item.id}>
              <BrandMark id={item.id} name={item.name} />
            </span>
          ))}
        </div>
      </div>
    );
  }

  if (kind === 'develop') {
    return (
      <div className="xv-nav-art xv-nav-art--agent" aria-hidden="true">
        <span className="xv-nav-art__serif is-muted">Develop</span>
        <div className="xv-nav-art__terminal">
          <small>repo / customer-cloud</small>
          <b>Implement billing portal</b>
          <i>✓ inspect</i><i>✓ build</i><i>● verify</i>
        </div>
      </div>
    );
  }

  if (kind === 'explore') {
    return (
      <div className="xv-nav-art xv-nav-art--showcase" aria-hidden="true">
        <div className="xv-nav-art__stack"><i /><i /><i /><strong>05</strong></div>
        <span>Projects</span>
      </div>
    );
  }

  return (
    <div className="xv-nav-art xv-nav-art--product" aria-hidden="true">
      <span className="xv-nav-art__badge">XROGA</span>
      <strong>Build<br /><em>software</em><br />with AI.</strong>
      <div className="xv-nav-art__cursor">↖</div>
    </div>
  );
}

function MegaLink({ item, onNavigate }: { item: MegaItem; onNavigate: () => void }) {
  const Icon = item.icon;
  return (
    <Link href={item.href} onClick={onNavigate}>
      <i className={item.logoId ? 'is-brand' : undefined}>
        {item.logoId && item.logoName ? <BrandMark id={item.logoId} name={item.logoName} /> : Icon ? <Icon aria-hidden="true" /> : null}
      </i>
      <span><b>{item.label}</b><em>{item.note}</em></span>
      <ArrowUpRight aria-hidden="true" />
    </Link>
  );
}

function MegaPanel({ menu, onNavigate }: { menu: MegaMenu; onNavigate: () => void }) {
  return (
    <div className="xv-nav-mega" role="group">
      <div className="xv-nav-mega__grid" aria-hidden="true" />
      <div className="xv-nav-mega__inner">
        <section className="xv-nav-mega__intro">
          <p>{menu.eyebrow}</p>
          <h2>{menu.title}</h2>
          <span>{menu.description}</span>
          <Link href={menu.ctaHref} className="xv-nav-mega__cta" onClick={onNavigate}>
            <span>{menu.ctaLabel}</span><ArrowUpRight aria-hidden="true" />
          </Link>
        </section>

        <section className="xv-nav-mega__links" aria-label={menu.eyebrow + ' links'}>
          <div>
            <small>Explore</small>
            {menu.primary.map((item) => <MegaLink item={item} onNavigate={onNavigate} key={item.label} />)}
          </div>
          <div>
            <small>More</small>
            {menu.secondary.map((item) => <MegaLink item={item} onNavigate={onNavigate} key={item.label} />)}
          </div>
        </section>

        <aside className="xv-nav-mega__art">
          <MegaArt kind={menu.art} />
        </aside>
      </div>
    </div>
  );
}

export function PublicMarketingHeader() {
  const pathname = usePathname();
  const router = useRouter();
  const rootRef = useRef<HTMLElement>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [activeMega, setActiveMega] = useState<string | null>(null);
  const [loggedIn, setLoggedIn] = useState(false);

  useEffect(() => {
    let active = true;
    try {
      void createClient().auth.getSession().then(({ data }) => {
        if (active) setLoggedIn(Boolean(data.session));
      }).catch(() => { if (active) setLoggedIn(false); });
    } catch {
      setLoggedIn(false);
    }
    return () => { active = false; };
  }, []);

  useEffect(() => {
    setMenuOpen(false);
    setActiveMega(null);
  }, [pathname]);

  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setMenuOpen(false);
        setActiveMega(null);
      }
    };
    const closeOutside = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setActiveMega(null);
    };
    window.addEventListener('keydown', closeOnEscape);
    window.addEventListener('pointerdown', closeOutside);
    return () => {
      window.removeEventListener('keydown', closeOnEscape);
      window.removeEventListener('pointerdown', closeOutside);
    };
  }, []);

  const accountHref = loggedIn ? '/workspace' : '/auth/login';

  return (
    <header ref={rootRef} className="xv-marketing-header" data-public-marketing-header>
      <svg className="xv-nav-filter" aria-hidden="true">
        <defs>
          <filter id="xv-nav-turbulent-displace">
            <feTurbulence type="turbulence" baseFrequency="0.018" numOctaves="4" seed="2" result="noise" />
            <feDisplacementMap in="SourceGraphic" in2="noise" scale="12" xChannelSelector="R" yChannelSelector="B" />
          </filter>
        </defs>
      </svg>

      <div className="xv-marketing-header__inner">
        <Logo href="/" variant="homepage" height={58} className="xv-marketing-header__logo" />

        <nav className="xv-marketing-header__nav" aria-label="Primary navigation" onMouseLeave={() => setActiveMega(null)}>
          {PUBLIC_MARKETING_NAV.map((item) => {
            const mega = MEGA_MENUS[item.label];
            if (!mega) {
              return (
                <Link
                  className="xv-marketing-header__direct-link"
                  key={item.href}
                  href={item.href}
                  aria-current={pathname === item.href ? 'page' : undefined}
                >
                  {item.label}
                </Link>
              );
            }

            const isOpen = activeMega === item.label;
            return (
              <div
                className="xv-nav-root"
                data-open={isOpen}
                key={item.href}
                onMouseEnter={() => setActiveMega(item.label)}
              >
                <button
                  type="button"
                  className="xv-nav-trigger"
                  aria-expanded={isOpen}
                  aria-haspopup="true"
                  aria-current={pathname === item.href ? 'page' : undefined}
                  onClick={(event) => {
                    event.stopPropagation();
                    setActiveMega((value) => value === item.label ? null : item.label);
                  }}
                  onFocus={() => setActiveMega(item.label)}
                >
                  <span>{item.label}</span>
                  <ChevronDown aria-hidden="true" />
                </button>
                {isOpen && <MegaPanel menu={mega} onNavigate={() => setActiveMega(null)} />}
              </div>
            );
          })}
        </nav>

        <div className="xv-marketing-header__actions">
          <HomepageThemeSwitcher />
          <button type="button" className="xv-marketing-header__account" onClick={() => router.push(accountHref)}>
            {loggedIn ? <LayoutGrid aria-hidden="true" /> : <LogIn aria-hidden="true" />}
            <span>{loggedIn ? 'Dashboard' : 'Sign in'}</span>
          </button>
          {!loggedIn && <Link className="xv-marketing-button xv-marketing-button--primary xv-marketing-header__cta" href="/auth/signup">Start free</Link>}
          <button
            type="button"
            className="xv-marketing-header__menu-button"
            aria-label={menuOpen ? 'Close navigation' : 'Open navigation'}
            aria-expanded={menuOpen}
            aria-controls="xv-public-mobile-menu"
            onClick={() => setMenuOpen((open) => !open)}
          >
            {menuOpen ? <X aria-hidden="true" /> : <Menu aria-hidden="true" />}
          </button>
        </div>
      </div>

      <div id="xv-public-mobile-menu" className="xv-marketing-mobile-menu" data-open={menuOpen}>
        <nav aria-label="Mobile navigation">
          {PUBLIC_MARKETING_NAV.map((item) => (
            <Link key={item.href} href={item.href} aria-current={pathname === item.href ? 'page' : undefined}>
              {item.label}<ArrowUpRight aria-hidden="true" />
            </Link>
          ))}
        </nav>
        <div className="xv-marketing-mobile-menu__actions">
          <Link href={accountHref}>{loggedIn ? 'Dashboard' : 'Sign in'}</Link>
          {!loggedIn && <Link className="xv-marketing-button xv-marketing-button--primary" href="/auth/signup">Start free</Link>}
        </div>
      </div>
    </header>
  );
}
