import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');
const SIDEBAR = read('../components/layout/Sidebar.tsx');
const HOVER_MENU = read('../components/ui/SidebarHoverMenu.tsx');
const PROFILE_MENU = read('../components/ui/ProfileQuickMenu.tsx');
const SIDEBAR_TIP = read('../components/ui/SidebarTip.tsx');
const PROVIDERS = read('../components/providers/RootProviders.tsx');
const BETA_BANNER = read('../components/layout/BetaExpectationBanner.tsx');
const PUBLIC_CHROME = read('../components/layout/PublicMarketingChrome.tsx');
const APP_SHELL = read('../components/layout/AppShell.tsx');
const DASHBOARD_VIEW = read('../components/dashboard/DashboardView.tsx');
const UPGRADE_ACTION = read('../components/ui/UpgradeActionButton.tsx');
const CSS = read('../app/globals.css');

test('Explore is a portalled hover-safe menu with all requested destinations', () => {
  assert.match(SIDEBAR, /entry\.id === 'explore'/);
  assert.match(SIDEBAR, /<Ellipsis[\s\S]*?<span>Explore<\/span>/);
  assert.match(HOVER_MENU, /createPortal/);
  assert.match(HOVER_MENU, /onMouseEnter=\{cancelClose\}/);
  assert.match(HOVER_MENU, /onMouseLeave=\{scheduleClose\}/);
  assert.match(HOVER_MENU, /onClick: \(\) => setOpen\(true\)/);
  for (const label of ['Showcase', 'Community', 'Share Feedback', 'Settings']) {
    assert.match(SIDEBAR, new RegExp(`label: '${label}'`));
  }
});

test('Launch and Growth uses the same right-side hover flyout', () => {
  assert.match(SIDEBAR, /aria-label=\{entry\.label\}/);
  assert.match(SIDEBAR, /<p className="xv-sidebar-hover-menu__eyebrow">\{entry\.label\}<\/p>/);
  for (const label of ['Publish', 'Operations', 'Growth']) {
    assert.match(SIDEBAR, new RegExp(`label: '${label}'`));
  }
  assert.doesNotMatch(SIDEBAR, /toggleGroup\(entry\.id\)/);
});

test('tips and ordinary notifications dismiss after five seconds', () => {
  assert.match(SIDEBAR_TIP, /5_000/);
  assert.match(PROVIDERS, /duration:\s*5000/);
});

test('avatar editing and account navigation remain separate controls', () => {
  assert.match(SIDEBAR, /size="sidebarCompact"[\s\S]*?onClick=\{\(\) => setAvatarPickerOpen\(true\)\}/);
  assert.match(SIDEBAR, /<ProfileQuickMenu[\s\S]*?displayName=\{userName\}[\s\S]*?email=\{email\}/);
  assert.match(SIDEBAR, /<UpgradeActionButton compact \/>/);
  assert.match(UPGRADE_ACTION, /xv-upgrade-action__fold/);
  assert.match(UPGRADE_ACTION, /Array\.from\(\{ length: 10 \}/);
});

test('account popup groups destinations and displays authenticated identity', () => {
  for (const label of ['Profile', 'Personalization', 'Settings', 'Community', 'Feedback', 'Xroga AI & CEO', 'Blog', 'Help', 'Privacy']) {
    assert.match(PROFILE_MENU, new RegExp(`label: '${label}'`));
  }
  assert.match(PROFILE_MENU, /<UpgradeActionButton \/>/);
  assert.doesNotMatch(PROFILE_MENU, /<strong>Premium<\/strong>/);
  assert.match(PROFILE_MENU, /data\.user\?\.app_metadata\?\.provider/);
  assert.match(PROFILE_MENU, /\{email \? <small>\{email\}<\/small> : null\}/);
  assert.match(PROFILE_MENU, /xv-pqm-submenu/);
  assert.match(PROFILE_MENU, /trigger\.right \+ gap/);
  assert.match(PROFILE_MENU, /event\.key !== 'Escape'/);
});

test('the beta banner continuously alternates every seven seconds and is mounted after shared headers', () => {
  assert.match(BETA_BANNER, /7_000/);
  assert.match(BETA_BANNER, /setInterval/);
  assert.match(BETA_BANNER, /current === 'expectations' \? 'ideas' : 'expectations'/);
  assert.match(BETA_BANNER, /Xroga is live and open to explore/);
  assert.match(BETA_BANNER, /Have an idea for Xroga\?/);
  assert.match(BETA_BANNER, /Share Your Idea/);
  assert.match(BETA_BANNER, /aria-label="Dismiss Xroga notice"/);
  assert.match(PUBLIC_CHROME, /<BetaExpectationBanner \/>/);
  assert.match(APP_SHELL, /!isDashboard \? <BetaExpectationBanner compact \/>/);
  assert.match(DASHBOARD_VIEW, /<\/header>[\s\S]*?<BetaExpectationBanner compact \/>/);
  assert.match(CSS, /\.xv-public-marketing-shell > \.xv-beta-banner\s*\{[^}]*top:\s*5\.75rem;[^}]*z-index:\s*1390;/);
  assert.match(CSS, /body\.theme-black \.xv-beta-banner,[\s\S]*?body\.theme-gray \.xv-beta-banner\s*\{[^}]*color:\s*#ffb4b8;/);
});

test('composer retains a small bottom breathing space', () => {
  assert.match(CSS, /padding-bottom:\s*calc\(14px \+ env\(safe-area-inset-bottom\)\)/);
});
