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

test('More consolidates legacy groups and uses the portalled flyout', () => {
  assert.match(SIDEBAR, /entry\.id === 'more'/);
  assert.match(SIDEBAR, /<Ellipsis[\s\S]*?<span>More<\/span>/);
  assert.match(SIDEBAR, /OPERATIONS &amp; GROWTH/);
  assert.match(SIDEBAR, /DISCOVER/);
  assert.match(HOVER_MENU, /createPortal/);
  assert.match(HOVER_MENU, /onMouseEnter=\{cancelClose\}/);
  assert.match(HOVER_MENU, /onMouseLeave=\{scheduleClose\}/);
  assert.match(HOVER_MENU, /onClick: \(\) => setOpen\(true\)/);
  for (const label of ['Operations', 'Growth', 'Settings', 'Explore', 'Showcase', 'Community', 'Share Feedback']) {
    assert.match(SIDEBAR, new RegExp("label: '" + label + "'"));
  }
  assert.doesNotMatch(SIDEBAR, /label: 'Explore Xroga OS'/);
});

test('Automations and Library are coming soon and Publish is direct', () => {
  assert.match(SIDEBAR, /id: 'automations'/);
  assert.match(SIDEBAR, /id: 'library'/);
  assert.match(SIDEBAR, /newSection: true/);
  assert.match(SIDEBAR, /aria-disabled="true"/);
  assert.match(SIDEBAR, /xv-sidebar-new-badge/);
  assert.match(SIDEBAR, /href: '\/dashboard\/publish'/);
  assert.match(SIDEBAR, /aria-label=\{entry\.label\}/);
  assert.match(SIDEBAR, /<SidebarHoverMenu/);
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

test('the beta banner starts at the hero and becomes a compact hover notice after scrolling', () => {
  assert.doesNotMatch(BETA_BANNER, /setInterval|scrollIntoView|sessionStorage/);
  assert.match(BETA_BANNER, /TOP_NOTICE_DURATION_MS = 5_000/);
  assert.match(BETA_BANNER, /window\.scrollY > CORNER_NOTICE_SCROLL_Y/);
  assert.match(BETA_BANNER, /xv-beta-banner--top/);
  assert.match(BETA_BANNER, /xv-beta-banner--corner/);
  assert.match(BETA_BANNER, /Early access/);
  assert.match(BETA_BANNER, /Xroga is live while we finish a few features/);
  assert.match(BETA_BANNER, /Report an issue/);
  assert.match(BETA_BANNER, /aria-label="Dismiss Xroga notice"/);
  assert.match(PUBLIC_CHROME, /<BetaExpectationBanner \/>/);
  assert.match(APP_SHELL, /!isDashboard \? <BetaExpectationBanner compact \/>/);
  assert.match(DASHBOARD_VIEW, /<\/header>[\s\S]*?<BetaExpectationBanner compact \/>/);
  assert.match(CSS, /\.xv-public-marketing-shell > \.xv-beta-banner--top\s*\{[\s\S]*position:\s*absolute !important/);
  assert.match(CSS, /\.xv-public-marketing-shell > \.xv-beta-banner--corner\s*\{[\s\S]*position:\s*fixed !important/);
  assert.match(CSS, /\.xv-beta-banner--corner:hover[\s\S]*width:\s*min\(390px/);
  assert.match(CSS, /background:\s*#080808 !important;[\s\S]*color:\s*#fff !important/);
  assert.match(CSS, /\.xv-beta-banner__cta,[\s\S]*background:\s*#dc2626 !important/);
});

test('composer retains a small bottom breathing space', () => {
  assert.match(CSS, /padding-bottom:\s*calc\(14px \+ env\(safe-area-inset-bottom\)\)/);
});
