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
  icon: typeof Sparkles;
};

type MegaMenu = {
  eyebrow: string;
  title: string;
  description: string;
  primary: MegaItem[];
  secondary: MegaItem[];
  ctaHref: string;
  ctaLabel: string;
  art: 'product' | 'app' | 'agent' | 'showcase' | 'docs';
};

const MEGA_MENUS: Partial<Record<(typeof PUBLIC_MARKETING_NAV)[number]['label'], MegaMenu>> = {
  Product: {
    eyebrow: 'XROGA PLATFORM',
    title: 'From idea to verified software.',
    description: 'Explore the core product surfaces that make Xroga useful to beginners, founders, and developers.',
    primary: [
      { href: '/features', label: 'Product overview', note: 'See the whole Xroga system.', icon: Sparkles },
      { href: '/software', label: 'Software builder', note: 'Build beyond a single screen.', icon: AppWindow },
      { href: '/integrations', label: 'Integrations', note: 'Connect the tools your product uses.', icon: Boxes },
    ],
    secondary: [
      { href: '/build', label: 'What you can build', note: 'Apps, websites, SaaS, APIs, tools, and more.', icon: LayoutDashboard },
      { href: '/compare', label: 'Compare Xroga', note: 'Understand product differences with evidence.', icon: ShieldCheck },
      { href: '/showcase', label: 'Showcase', note: 'See working product directions.', icon: GalleryHorizontalEnd },
    ],
    ctaHref: '/features',
    ctaLabel: 'Explore Product',
    art: 'product',
  },
  'AI App Builder': {
    eyebrow: 'BUILD FROM AN IDEA',
    title: 'Describe the product. Build the real thing.',
    description: 'Start in plain language and move through interface, product logic, data, checks, and release preparation.',
    primary: [
      { href: '/ai-app-builder', label: 'AI App Builder', note: 'The complete product page.', icon: WandSparkles },
      { href: '/ai-website-builder', label: 'AI Website Builder', note: 'Build modern websites with AI.', icon: Globe2 },
      { href: '/build', label: 'Build directory', note: 'Explore supported product categories.', icon: Boxes },
    ],
    secondary: [
      { href: '/game-builder', label: 'Game Builder', note: 'Build playable web experiences.', icon: Rocket },
      { href: '/crypto-builder', label: 'Web3 & Crypto', note: 'Build supported Web3 products.', icon: AppWindow },
      { href: '/showcase', label: 'Templates & examples', note: 'See what a prompt can become.', icon: GalleryHorizontalEnd },
    ],
    ctaHref: '/ai-app-builder',
    ctaLabel: 'Open AI App Builder',
    art: 'app',
  },
  'AI Coding Agent': {
    eyebrow: 'WORK WITH REAL CODE',
    title: 'Bring the repository you already own.',
    description: 'Use Xroga for focused implementation, debugging, verification, and reviewable changes inside existing software.',
    primary: [
      { href: '/ai-coding-agent', label: 'AI Coding Agent', note: 'Repository-aware product workflow.', icon: Code2 },
      { href: '/build-with/github', label: 'GitHub workflow', note: 'Work from a connected repository.', icon: GitBranch },
      { href: '/features', label: 'Verification', note: 'See checks, evidence, and blockers.', icon: ShieldCheck },
    ],
    secondary: [
      { href: '/docs', label: 'Technical docs', note: 'Understand how the product works.', icon: BookOpen },
      { href: '/compare', label: 'Compare coding agents', note: 'Review differences by capability.', icon: Search },
      { href: '/software', label: 'Software workflows', note: 'Explore broader software-building paths.', icon: TerminalSquare },
    ],
    ctaHref: '/ai-coding-agent',
    ctaLabel: 'Explore Coding Agent',
    art: 'agent',
  },
  Showcase: {
    eyebrow: 'BUILT WITH XROGA',
    title: 'See what the output can look like.',
    description: 'Browse product directions, responsive previews, and templates instead of relying on marketing claims alone.',
    primary: [
      { href: '/showcase', label: 'All showcase projects', note: 'Browse the complete collection.', icon: GalleryHorizontalEnd },
      { href: '/build', label: 'Build categories', note: 'Choose what you want to create.', icon: Boxes },
      { href: '/ai-app-builder', label: 'Start a new app', note: 'Turn your own idea into software.', icon: WandSparkles },
    ],
    secondary: [
      { href: '/game-builder', label: 'Games', note: 'Explore playable product directions.', icon: Rocket },
      { href: '/crypto-builder', label: 'Web3', note: 'Explore supported Web3 builds.', icon: AppWindow },
      { href: '/learn', label: 'Build guides', note: 'Learn the workflow behind the output.', icon: BookOpen },
    ],
    ctaHref: '/showcase',
    ctaLabel: 'View Showcase',
    art: 'showcase',
  },
  Docs: {
    eyebrow: 'LEARN XROGA',
    title: 'Find the answer, workflow, or reference.',
    description: 'Documentation, guides, comparisons, and learning material for beginners through advanced builders.',
    primary: [
      { href: '/docs', label: 'Documentation', note: 'Product and technical reference.', icon: BookOpen },
      { href: '/learn', label: 'Learn', note: 'Practical guides for building with AI.', icon: Sparkles },
      { href: '/blog', label: 'Blog', note: 'Product, AI, and software insights.', icon: FileCode2 },
    ],
    secondary: [
      { href: '/compare', label: 'Compare', note: 'Evidence-based product comparisons.', icon: ShieldCheck },
      { href: '/build', label: 'Build guides', note: 'Find a path for a specific product.', icon: Boxes },
      { href: '/showcase', label: 'Examples', note: 'See product output and patterns.', icon: GalleryHorizontalEnd },
    ],
    ctaHref: '/docs',
    ctaLabel: 'Open Docs',
    art: 'docs',
  },
};

function MegaArt({ kind }: { kind: MegaMenu['art'] }) {
  if (kind === 'app') {
    return (
      <div className="xv-nav-art xv-nav-art--app" aria-hidden="true">
        <span className="xv-nav-art__serif">AI App</span>
        <div className="xv-nav-art__fan">
          <i /><i /><i /><i />
          <b>build</b>
        </div>
      </div>
    );
  }

  if (kind === 'agent') {
    return (
      <div className="xv-nav-art xv-nav-art--agent" aria-hidden="true">
        <span className="xv-nav-art__serif is-muted">Start</span>
        <div className="xv-nav-art__terminal">
          <small>repo / customer-cloud</small>
          <b>Implement billing portal</b>
          <i>✓ plan</i><i>✓ build</i><i>● verify</i>
        </div>
      </div>
    );
  }

  if (kind === 'showcase') {
    return (
      <div className="xv-nav-art xv-nav-art--showcase" aria-hidden="true">
        <div className="xv-nav-art__stack"><i /><i /><i /><strong>05</strong></div>
        <span>Projects</span>
      </div>
    );
  }

  if (kind === 'docs') {
    return (
      <div className="xv-nav-art xv-nav-art--docs" aria-hidden="true">
        <span className="xv-nav-art__brand">Xroga Docs</span>
        <div className="xv-nav-art__search"><Search /><span>Search docs...</span></div>
        <i /><i /><i />
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

function MegaPanel({
  menu,
  onNavigate,
}: {
  menu: MegaMenu;
  onNavigate: () => void;
}) {
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
            {menu.primary.map(({ href, label, note, icon: Icon }) => (
              <Link href={href} key={href} onClick={onNavigate}>
                <i><Icon aria-hidden="true" /></i>
                <span><b>{label}</b><em>{note}</em></span>
                <ArrowUpRight aria-hidden="true" />
              </Link>
            ))}
          </div>
          <div>
            <small>More</small>
            {menu.secondary.map(({ href, label, note, icon: Icon }) => (
              <Link href={href} key={href} onClick={onNavigate}>
                <i><Icon aria-hidden="true" /></i>
                <span><b>{label}</b><em>{note}</em></span>
                <ArrowUpRight aria-hidden="true" />
              </Link>
            ))}
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
                    setActiveMega((current) => current === item.label ? null : item.label);
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
