import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');
const SIDEBAR = read('../components/layout/Sidebar.tsx');
const HOVER_MENU = read('../components/ui/SidebarHoverMenu.tsx');
const PROFILE_MENU = read('../components/ui/ProfileQuickMenu.tsx');
const SIDEBAR_TIP = read('../components/ui/SidebarTip.tsx');
const PROVIDERS = read('../components/providers/RootProviders.tsx');
const CSS = read('../app/globals.css');

test('Explore is a portalled hover-safe menu with all requested destinations', () => {
  assert.match(SIDEBAR, /entry\.id === 'explore'/);
  assert.match(SIDEBAR, /<Ellipsis[\s\S]*?<span>Explore<\/span>/);
  assert.match(HOVER_MENU, /createPortal/);
  assert.match(HOVER_MENU, /onMouseEnter=\{cancelClose\}/);
  assert.match(HOVER_MENU, /onMouseLeave=\{scheduleClose\}/);
  assert.match(HOVER_MENU, /onClick: \(\) => setOpen\(true\)/);
  assert.doesNotMatch(HOVER_MENU, /onClick: \(\) => setOpen\(\(value\) => !value\)/);
  for (const label of ['Showcase', 'Community', 'Share Feedback', 'Settings']) {
    assert.match(SIDEBAR, new RegExp(`label: '${label}'`));
  }
});

test('tips and ordinary notifications dismiss after five seconds', () => {
  assert.match(SIDEBAR_TIP, /5_000/);
  assert.match(SIDEBAR_TIP, /useEffect\(\(\) => \(\) => clearTimers\(\)/);
  assert.match(PROVIDERS, /duration:\s*5000/);
});

test('avatar editing and account navigation remain separate controls', () => {
  assert.match(SIDEBAR, /size="sidebarCompact"[\s\S]*?onClick=\{\(\) => setAvatarPickerOpen\(true\)\}/);
  assert.match(SIDEBAR, /<ProfileQuickMenu[\s\S]*?xv-profile-upgrade-chip[\s\S]*?Upgrade to Pro/);
  assert.doesNotMatch(SIDEBAR, /<Zap/);
});

test('account popup includes product, help, privacy, and community destinations', () => {
  for (const label of ['Upgrade plan', 'Profile', 'Personalization', 'Settings', 'Community', 'Feedback', 'Xroga AI & CEO', 'Blog', 'Help', 'Privacy']) {
    assert.match(PROFILE_MENU, new RegExp(`label: '${label}'`));
  }
  assert.match(PROFILE_MENU, /trigger\.right \+ gap/);
  assert.match(PROFILE_MENU, /e\.key === 'Escape'/);
});

test('composer retains a small bottom breathing space', () => {
  assert.match(CSS, /padding-bottom:\s*calc\(14px \+ env\(safe-area-inset-bottom\)\)/);
});
