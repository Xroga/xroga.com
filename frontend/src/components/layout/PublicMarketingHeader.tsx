'use client';

/**
 * Navigation V2: the public marketing header (homepage and marketing pages; the workspace keeps its own chrome).
 *
 * - One floating bar with an original particle layer (nav/particles.ts): a quiet rim at rest, and a capsule of light
 *   that gathers around the hovered item and glides between items as one object.
 * - Five mega menus (Product, Build, Connect, Develop, Explore) in one shared panel under the bar: an editorial column,
 *   grouped links with one icon system, and a preview that answers the link in focus (nav/MegaPreviews.tsx). Moving
 *   between menus crossfades the content inside a fixed envelope, so the panel never jumps in size.
 * - Disclosure pattern: each trigger is a button with aria-expanded/aria-controls; hover opens (with intent delays so
 *   the bar-to-panel gap never closes it), click toggles, Escape closes and returns focus, outside press closes.
 * - Hides when the visitor scrolls down past the opening screen, returns on any intentional upward scroll, near the
 *   top, when focus enters it or when the pointer reaches the top edge; never hides while a menu is open.
 */
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { ArrowUpRight, ChevronDown, TerminalSquare } from 'lucide-react';
import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import { createClient } from '@/lib/supabase/client';
import { PUBLIC_MARKETING_NAV } from '@/lib/publicMarketing';
import { CONNECT_GROUPS, MEGA_MENUS, type MegaItem, type MegaMenu, type MenuKey } from './nav/navData';
import { BrandMark, BuildPreview, ConnectDirectory, DevelopPreview, ExplorePreview, ProductPreview } from './nav/MegaPreviews';
import { mountLens } from './nav/lens';
import './nav/xroga-nav.css';

const isMenu = (label: string): label is MenuKey => label in MEGA_MENUS;
const useIsoLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect;
const FIRST_PREVIEW: Record<MenuKey, string> = { Product: 'overview', Build: 'webapp', Connect: '', Develop: 'diff', Explore: 'showcase' };

function MegaLink({ item, onNavigate, onPreview }: { item: MegaItem; onNavigate: () => void; onPreview: (k: string) => void }) {
  const Icon = item.icon;
  const show = () => item.preview && onPreview(item.preview);
  return (
    <Link href={item.href} className="xn-link" onClick={onNavigate} onPointerEnter={show} onFocus={show}>
      <i className="xn-icon">
        <Icon aria-hidden="true" />
      </i>
      <span>
        <b>{item.label}</b>
        <em>{item.note}</em>
      </span>
      <ArrowUpRight className="xn-link-go" aria-hidden="true" />
    </Link>
  );
}

function MegaContent({ id, menu, onNavigate }: { id: MenuKey; menu: MegaMenu; onNavigate: () => void }) {
  const [preview, setPreview] = useState(FIRST_PREVIEW[id]);
  return (
    <div className="xn-menu" data-menu={id}>
      <section className="xn-intro">
        <p className="xn-eyebrow">{menu.eyebrow}</p>
        <h2 className="xn-title">{menu.title}</h2>
        <p className="xn-desc">{menu.description}</p>
        <Link href={menu.ctaHref} className="xn-intro-cta" onClick={onNavigate}>
          {menu.ctaLabel}
          <ArrowUpRight aria-hidden="true" />
        </Link>
      </section>
      {id === 'Connect' ? (
        <ConnectDirectory onNavigate={onNavigate} />
      ) : (
        <>
          <div className="xn-links">
            {menu.groups.map((g) => (
              <div className="xn-group" key={g.label} role="group" aria-label={g.label}>
                <small className="xn-group-label">{g.label}</small>
                {g.items.map((item) => (
                  <MegaLink item={item} key={item.label} onNavigate={onNavigate} onPreview={setPreview} />
                ))}
              </div>
            ))}
          </div>
          <aside className="xn-preview">
            {id === 'Product' && <ProductPreview active={preview} />}
            {id === 'Build' && <BuildPreview active={preview} />}
            {id === 'Develop' && <DevelopPreview active={preview} />}
            {id === 'Explore' && <ExplorePreview active={preview} />}
          </aside>
        </>
      )}
    </div>
  );
}

/** a 3 × 3 field of dots that folds into a cross when the mobile menu is open */
function MenuGlyph({ open }: { open: boolean }) {
  return (
    <span className="xn-glyph" data-open={open || undefined} aria-hidden="true">
      <i />
      <i />
    </span>
  );
}

export function PublicMarketingHeader() {
  const pathname = usePathname();
  const router = useRouter();
  const rootRef = useRef<HTMLElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const navRef = useRef<HTMLElement>(null);
  const lastMega = useRef<MenuKey | null>(null);
  const triggers = useRef<Partial<Record<MenuKey, HTMLButtonElement | null>>>({});
  const openTimer = useRef<number>();
  const closeTimer = useRef<number>();
  const [menuOpen, setMenuOpen] = useState(false);
  const [activeMega, setActiveMega] = useState<MenuKey | null>(null);
  const [mobileSection, setMobileSection] = useState<MenuKey | null>(null);
  const [loggedIn, setLoggedIn] = useState(false);
  const [hidden, setHidden] = useState(false);
  const [focusInside, setFocusInside] = useState(false);

  useEffect(() => {
    let active = true;
    try {
      void createClient()
        .auth.getSession()
        .then(({ data }) => {
          if (active) setLoggedIn(Boolean(data.session));
        })
        .catch(() => {
          if (active) setLoggedIn(false);
        });
    } catch {
      setLoggedIn(false);
    }
    return () => {
      active = false;
    };
  }, []);

  // route change: close everything
  useEffect(() => {
    setMenuOpen(false);
    setActiveMega(null);
  }, [pathname]);

  /* ------------------------------------------------------------ the Context Lens (nav/lens.ts) */
  // The lens, the reactive perimeter, the menu morph, the link focus card, the orb glass and the CTA light are driven
  // imperatively from one loop that reads the header's own state (aria-expanded, focus, pointer); no React renders.
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const lens = mountLens(root);
    return () => lens.destroy();
  }, []);

  // switching menus slides the new content in from the side it was chosen on (set before paint)
  useIsoLayoutEffect(() => {
    const keys = Object.keys(MEGA_MENUS) as MenuKey[];
    const prev = lastMega.current;
    if (activeMega && prev && prev !== activeMega) {
      panelRef.current?.style.setProperty('--dx', keys.indexOf(activeMega) > keys.indexOf(prev) ? '10px' : '-10px');
    } else panelRef.current?.style.setProperty('--dx', '0px');
    lastMega.current = activeMega;
  }, [activeMega]);

  /* ------------------------------------------------------------ menus: hover intent, click, Escape, outside */
  const open = (key: MenuKey, delay: number) => {
    window.clearTimeout(closeTimer.current);
    window.clearTimeout(openTimer.current);
    if (delay <= 0) setActiveMega(key);
    else openTimer.current = window.setTimeout(() => setActiveMega(key), delay);
  };
  const scheduleClose = () => {
    window.clearTimeout(openTimer.current);
    window.clearTimeout(closeTimer.current);
    closeTimer.current = window.setTimeout(() => setActiveMega(null), 260);
  };
  const closeMenus = () => {
    window.clearTimeout(openTimer.current);
    setActiveMega(null);
  };

  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setMenuOpen(false);
        setActiveMega((current) => {
          if (current) triggers.current[current]?.focus();
          return null;
        });
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
      window.clearTimeout(openTimer.current);
      window.clearTimeout(closeTimer.current);
    };
  }, []);

  // the mobile menu keeps the page beneath it still
  useEffect(() => {
    if (!menuOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [menuOpen]);

  /* ------------------------------------------------------------ scroll: hide going down, return going up */
  const pinned = Boolean(activeMega) || menuOpen || focusInside;
  const pinnedRef = useRef(pinned);
  pinnedRef.current = pinned;
  useEffect(() => {
    if (pinned) setHidden(false);
  }, [pinned]);
  useEffect(() => {
    let last = window.scrollY;
    let travel = 0;
    let frame = 0;
    const threshold = () => (pathname === '/' ? Math.max(420, window.innerHeight * 0.75) : 160);
    const update = () => {
      frame = 0;
      const y = window.scrollY;
      const dy = y - last;
      last = y;
      if (pinnedRef.current || y < 80) {
        travel = 0;
        setHidden(false);
        return;
      }
      // accumulate movement in one direction; a direction change starts a new count (hysteresis)
      travel = Math.sign(dy) === Math.sign(travel) ? travel + dy : dy;
      if (travel > 24 && y > threshold()) setHidden(true);
      else if (travel < -12) setHidden(false);
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    // the pointer reaching the very top of the window brings the bar back on desktop
    let edge = 0;
    const onMove = (e: PointerEvent) => {
      if (e.pointerType !== 'mouse') return;
      if (e.clientY <= 6) {
        if (!edge) edge = window.setTimeout(() => setHidden(false), 120);
      } else if (edge) {
        window.clearTimeout(edge);
        edge = 0;
      }
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('pointermove', onMove, { passive: true });
    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('pointermove', onMove);
      if (frame) cancelAnimationFrame(frame);
      window.clearTimeout(edge);
    };
  }, [pathname]);

  // a closed panel is out of the tab order and the accessibility tree
  useEffect(() => {
    if (panelRef.current) panelRef.current.inert = !activeMega;
  }, [activeMega]);

  // focus order follows the disclosure pattern: Tab from an open trigger enters its panel, Tab past the panel's last
  // link continues to the next trigger, Shift+Tab from the panel's first link returns to its trigger
  const panelLinks = () => [...(panelRef.current?.querySelectorAll<HTMLElement>('a[href], button') ?? [])];
  const onTriggerKey = (key: MenuKey) => (e: ReactKeyboardEvent<HTMLButtonElement>) => {
    if (e.key !== 'Tab' || e.shiftKey || activeMega !== key) return;
    const first = panelLinks()[0];
    if (first) {
      e.preventDefault();
      first.focus();
    }
  };
  const onPanelKey = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'Tab' || !activeMega) return;
    const links = panelLinks();
    const at = links.indexOf(document.activeElement as HTMLElement);
    const keys = Object.keys(MEGA_MENUS) as MenuKey[];
    if (e.shiftKey && at === 0) {
      e.preventDefault();
      triggers.current[activeMega]?.focus();
    } else if (!e.shiftKey && at === links.length - 1) {
      e.preventDefault();
      const next = keys[keys.indexOf(activeMega) + 1];
      const nextEl = next ? triggers.current[next] : rootRef.current?.querySelector<HTMLElement>('.xn-nav > a');
      setActiveMega(null);
      nextEl?.focus();
    }
  };

  const accountHref = loggedIn ? '/workspace' : '/auth/login';
  const menu = activeMega ? MEGA_MENUS[activeMega] : null;

  return (
    <header
      ref={rootRef}
      className="xn"
      data-public-marketing-header
      data-concept="lens"
      data-hidden={hidden || undefined}
      data-open={activeMega ? 'mega' : menuOpen ? 'mobile' : undefined}
      onPointerEnter={() => window.clearTimeout(closeTimer.current)}
      onPointerLeave={(e) => e.pointerType === 'mouse' && scheduleClose()}
      // keyboard focus pins the bar; focus left behind by a mouse click does not
      onFocusCapture={(e) => setFocusInside((e.target as HTMLElement).matches(':focus-visible'))}
      onBlurCapture={(e) => {
        if (!rootRef.current?.contains(e.relatedTarget as Node)) {
          setFocusInside(false);
          setActiveMega(null);
        }
      }}
    >
      <div className="xn-bar">
        {/* the approved orb wordmark, split at the gap in its artwork so the orb and the word get proper spacing */}
        <Link href="/" className="xn-lockup" aria-label="Xroga home">
          <span className="xn-lockup-orb" aria-hidden="true" />
          <span className="xn-lockup-word" aria-hidden="true" />
        </Link>

        <nav
          ref={navRef}
          className="xn-nav"
          aria-label="Primary navigation"
        >
          {PUBLIC_MARKETING_NAV.map((item) => {
            const isCurrent = pathname === item.href;
            if (!isMenu(item.label)) {
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className="xn-item"
                  aria-current={isCurrent ? 'page' : undefined}
                  onPointerEnter={() => scheduleClose()}
                >
                  {item.label}
                </Link>
              );
            }
            const key = item.label;
            const isOpen = activeMega === key;
            return (
              <button
                key={item.href}
                ref={(el) => {
                  triggers.current[key] = el;
                }}
                type="button"
                className="xn-item xn-trigger"
                aria-expanded={isOpen}
                aria-controls="xn-panel"
                data-open={isOpen || undefined}
                aria-current={isCurrent ? 'page' : undefined}
                onPointerEnter={(e) => {
                  if (e.pointerType !== 'mouse') return;
                  // the first menu opens after a short intent delay; once a menu is open, moving across switches at once
                  open(key, activeMega ? 0 : 90);
                }}
                onKeyDown={onTriggerKey(key)}
                onClick={() => {
                  // a click or Enter wins over any pending hover timer (a close armed by an earlier pointer exit)
                  window.clearTimeout(openTimer.current);
                  window.clearTimeout(closeTimer.current);
                  setActiveMega((value) => (value === key ? null : key));
                }}
              >
                <span>{item.label}</span>
                <ChevronDown aria-hidden="true" />
              </button>
            );
          })}
        </nav>

        <div className="xn-actions">
          {loggedIn ? (
            <button
              type="button"
              className="xn-cta xv-header-dashboard-button"
              onClick={() => router.push(accountHref)}
            >
              <TerminalSquare className="xn-cta-icon" aria-hidden="true" />
              Workspace
            </button>
          ) : (
            <Link
              className="xn-cta"
              href="/workspace"
            >
              <svg className="xn-cta-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.4" aria-hidden="true">
                <polyline points="13.18 1.37 13.18 9.64 21.45 9.64 10.82 22.63 10.82 14.36 2.55 14.36 13.18 1.37" />
              </svg>
              Start Building Free
            </Link>
          )}
          <button
            type="button"
            className="xn-menu-button"
            aria-label={menuOpen ? 'Close navigation' : 'Open navigation'}
            aria-expanded={menuOpen}
            aria-controls="xv-public-mobile-menu"
            onClick={() => setMenuOpen((open) => !open)}
          >
            <MenuGlyph open={menuOpen} />
          </button>
        </div>
      </div>

      {/* the shared mega-menu panel: one envelope, content crossfades between menus */}
      <div ref={panelRef} id="xn-panel" className="xn-panel" data-open={menu ? true : undefined} aria-hidden={!menu} onKeyDown={onPanelKey}>
        <div className="xn-panel-surface">
          {menu && activeMega && <MegaContent key={activeMega} id={activeMega} menu={menu} onNavigate={closeMenus} />}
        </div>
      </div>

      {/* mobile: a drawer of disclosure sections */}
      <div id="xv-public-mobile-menu" className="xn-drawer" data-open={menuOpen || undefined} aria-hidden={!menuOpen}>
        <nav aria-label="Mobile navigation">
          {PUBLIC_MARKETING_NAV.map((item) => {
            if (!isMenu(item.label)) {
              return (
                <Link key={item.href} href={item.href} className="xn-drawer-row" aria-current={pathname === item.href ? 'page' : undefined}>
                  {item.label}
                  <ArrowUpRight aria-hidden="true" />
                </Link>
              );
            }
            const key = item.label;
            const m = MEGA_MENUS[key];
            const expanded = mobileSection === key;
            return (
              <div className="xn-drawer-section" key={item.href} data-open={expanded || undefined}>
                <button type="button" className="xn-drawer-row" aria-expanded={expanded} aria-controls={`xn-m-${key}`} onClick={() => setMobileSection(expanded ? null : key)}>
                  {item.label}
                  <ChevronDown aria-hidden="true" />
                </button>
                <div id={`xn-m-${key}`} className="xn-drawer-body" hidden={!expanded}>
                  {key === 'Connect' ? (
                    <div className="xn-drawer-apps">
                      {CONNECT_GROUPS.flatMap((g) => g.brands).slice(0, 12).map((b) => (
                        <Link href="/integrations" key={b.name} className="xn-drawer-app" onClick={() => setMenuOpen(false)}>
                          <i className="xn-app-mark">
                            <BrandMark brand={b} size={18} />
                          </i>
                          {b.name}
                        </Link>
                      ))}
                    </div>
                  ) : (
                    m.groups.flatMap((g) => g.items).map((it) => {
                      const Icon = it.icon;
                      return (
                        <Link key={it.label} href={it.href} className="xn-drawer-link" onClick={() => setMenuOpen(false)}>
                          <i className="xn-icon">
                            <Icon aria-hidden="true" />
                          </i>
                          {it.label}
                        </Link>
                      );
                    })
                  )}
                  <Link href={m.ctaHref} className="xn-drawer-more" onClick={() => setMenuOpen(false)}>
                    {m.ctaLabel}
                    <ArrowUpRight aria-hidden="true" />
                  </Link>
                </div>
              </div>
            );
          })}
        </nav>
        <div className="xn-drawer-actions">
          <Link href={accountHref}>{loggedIn ? 'Workspace' : 'Sign in'}</Link>
          {!loggedIn && (
            <Link className="xn-cta" href="/workspace">
              Start Building Free
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}
