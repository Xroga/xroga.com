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
import { PUBLIC_MARKETING_NAV } from '@/lib/publicMarketing';

type MegaItem = {
  href: string;
  label: string;
  note: string;
  icon?: typeof Sparkles;
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
      { href: '/integrations', label: 'Gmail & Calendar', note: 'Email, schedules, and connected Google workflows.', icon: Globe2 },
      { href: '/integrations', label: 'Slack', note: 'Read and act in connected team workflows.', icon: Boxes },
      { href: '/integrations', label: 'Notion', note: 'Work with connected workspace content.', icon: BookOpen },
    ],
    secondary: [
      { href: '/integrations', label: 'GitHub', note: 'Repositories, project delivery, and code workflows.', icon: GitBranch },
      { href: '/integrations', label: 'Stripe', note: 'Supported billing and business workflows.', icon: AppWindow },
      { href: '/integrations', label: 'Vercel & Supabase', note: 'Deployment, data, authentication, and app infrastructure.', icon: Rocket },
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

type ConnectBrand = {
  name: string;
  slug: string;
  color: string;
  category: string;
};

const CONNECT_PRIMARY_BRANDS: ConnectBrand[] = [
  { name: 'GitHub', slug: 'github', color: '181717', category: 'Developer' },
  { name: 'Gmail', slug: 'gmail', color: 'EA4335', category: 'Communication' },
  { name: 'Google Calendar', slug: 'googlecalendar', color: '4285F4', category: 'Productivity' },
  { name: 'Google Drive', slug: 'googledrive', color: '4285F4', category: 'Storage' },
  { name: 'Slack', slug: 'slack', color: '4A154B', category: 'Communication' },
  { name: 'Discord', slug: 'discord', color: '5865F2', category: 'Communication' },
  { name: 'Notion', slug: 'notion', color: '000000', category: 'Workspace' },
  { name: 'Linear', slug: 'linear', color: '5E6AD2', category: 'Project management' },
  { name: 'Jira', slug: 'jira', color: '0052CC', category: 'Project management' },
  { name: 'Asana', slug: 'asana', color: 'F06A6A', category: 'Project management' },
  { name: 'Airtable', slug: 'airtable', color: '18BFFF', category: 'Data' },
  { name: 'Stripe', slug: 'stripe', color: '635BFF', category: 'Payments' },
  { name: 'Shopify', slug: 'shopify', color: '7AB55C', category: 'Commerce' },
  { name: 'HubSpot', slug: 'hubspot', color: 'FF7A59', category: 'CRM' },
  { name: 'Salesforce', slug: 'salesforce', color: '00A1E0', category: 'CRM' },
  { name: 'Vercel', slug: 'vercel', color: '000000', category: 'Deployment' },
  { name: 'Supabase', slug: 'supabase', color: '3FCF8E', category: 'Database' },
  { name: 'Cloudflare', slug: 'cloudflare', color: 'F38020', category: 'Infrastructure' },
  { name: 'Sentry', slug: 'sentry', color: '362D59', category: 'Monitoring' },
  { name: 'Dropbox', slug: 'dropbox', color: '0061FF', category: 'Storage' },
];

const CONNECT_MORE_BRANDS: ConnectBrand[] = [
  { name: 'OneDrive', slug: 'microsoftonedrive', color: '0078D4', category: 'Storage' },
  { name: 'Box', slug: 'box', color: '0061D5', category: 'Storage' },
  { name: 'Calendly', slug: 'calendly', color: '006BFF', category: 'Scheduling' },
  { name: 'Mailchimp', slug: 'mailchimp', color: 'FFE01B', category: 'Marketing' },
  { name: 'Twilio', slug: 'twilio', color: 'F22F46', category: 'Communication' },
  { name: 'Postman', slug: 'postman', color: 'FF6C37', category: 'Developer' },
  { name: 'MongoDB', slug: 'mongodb', color: '47A248', category: 'Database' },
  { name: 'OpenAI', slug: 'openai', color: '412991', category: 'AI' },
  { name: 'Figma', slug: 'figma', color: 'F24E1E', category: 'Design' },
  { name: 'PayPal', slug: 'paypal', color: '003087', category: 'Payments' },
];

function BrandMark({ brand, compact = false }: { brand: ConnectBrand; compact?: boolean }) {
  const [failed, setFailed] = useState(false);
  if (failed) {
    return <span className="xv-nav-brand-fallback" aria-hidden="true">{brand.name.slice(0, 1)}</span>;
  }

  return (
    <img
      src={\`https://cdn.simpleicons.org/\${brand.slug}/\${brand.color}\`}
      alt=""
      width={compact ? 18 : 22}
      height={compact ? 18 : 22}
      loading="lazy"
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
    />
  );
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
          {CONNECT_PRIMARY_BRANDS.slice(0, 6).map((brand, index) => (
            <span className="xv-nav-connect-logo" style={{ '--logo-index': index } as React.CSSProperties} key={brand.name}>
              <BrandMark brand={brand} compact />
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
      <i>{Icon ? <Icon aria-hidden="true" /> : null}</i>
      <span><b>{item.label}</b><em>{item.note}</em></span>
      <ArrowUpRight aria-hidden="true" />
    </Link>
  );
}

function MegaPanel({ menu, onNavigate }: { menu: MegaMenu; onNavigate: () => void }) {
  const isConnect = menu.art === 'connect';

  return (
    <div className="xv-nav-mega" role="group">
      <div className="xv-nav-mega__grid" aria-hidden="true" />
      <div className={isConnect ? 'xv-nav-mega__inner xv-nav-mega__inner--connect' : 'xv-nav-mega__inner'}>
        <section className="xv-nav-mega__intro">
          <p>{menu.eyebrow}</p>
          <h2>{menu.title}</h2>
          <span>{menu.description}</span>
          <Link href={menu.ctaHref} className="xv-nav-mega__cta" onClick={onNavigate}>
            <span>{menu.ctaLabel}</span><ArrowUpRight aria-hidden="true" />
          </Link>
        </section>

        {isConnect ? (
          <section className="xv-nav-connect-catalog" aria-label="Popular Xroga integrations">
            <div className="xv-nav-connect-catalog__head">
              <div>
                <small>POPULAR APPS & SERVICES</small>
                <b>Connect your everyday stack</b>
              </div>
              <Link href="/integrations" onClick={onNavigate}>Explore all <ArrowUpRight aria-hidden="true" /></Link>
            </div>

            <div className="xv-nav-connect-grid">
              {CONNECT_PRIMARY_BRANDS.map((brand) => (
                <Link href="/integrations" className="xv-nav-connect-card" key={brand.name} onClick={onNavigate}>
                  <i className="is-brand"><BrandMark brand={brand} /></i>
                  <span><b>{brand.name}</b><em>{brand.category}</em></span>
                  <ArrowUpRight aria-hidden="true" />
                </Link>
              ))}
            </div>

            <div className="xv-nav-connect-more">
              <small>AND MORE</small>
              <div>
                {CONNECT_MORE_BRANDS.map((brand) => (
                  <Link href="/integrations" key={brand.name} title={brand.name} aria-label={brand.name} onClick={onNavigate}>
                    <BrandMark brand={brand} compact />
                  </Link>
                ))}
                <Link href="/integrations" className="xv-nav-connect-more__all" onClick={onNavigate}>
                  + Explore all
                </Link>
              </div>
            </div>
          </section>
        ) : (
          <>
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
              <Link href={menu.ctaHref} className="xv-nav-mega__art-link" aria-label={menu.ctaLabel} onClick={onNavigate}>
                <MegaArt kind={menu.art} />
              </Link>
            </aside>
          </>
        )}
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
