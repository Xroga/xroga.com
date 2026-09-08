import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { clampAnchoredPosition } from '../components/ui/AnchoredPortalPopover';

test('anchored popover clamps to every viewport edge', () => {
  assert.deepEqual(clampAnchoredPosition({ left: 290, right: 310, top: 180, bottom: 200 }, { width: 160, height: 120 }, { width: 320, height: 240 }, 'bottom-start'), { left: 148, top: 108 });
  assert.deepEqual(clampAnchoredPosition({ left: -20, right: 0, top: -10, bottom: 5 }, { width: 100, height: 50 }, { width: 320, height: 240 }, 'top-end'), { left: 12, top: 12 });
});

test('workspace identity uses the shared body portal with complete dismissal and reposition behavior', () => {
  const portal = readFileSync(new URL('../components/ui/AnchoredPortalPopover.tsx', import.meta.url), 'utf8');
  const menu = readFileSync(new URL('../components/terminal/WorkspaceIdentityMenu.tsx', import.meta.url), 'utf8');
  assert.match(portal, /createPortal\([\s\S]*document\.body/);
  assert.match(portal, /position: 'fixed'/); assert.match(portal, /zIndex: 10000/);
  assert.match(portal, /addEventListener\('scroll', reposition, true\)/); assert.match(portal, /addEventListener\('resize', reposition\)/);
  assert.match(portal, /event\.key === 'Escape'/); assert.match(portal, /pointerdown/);
  assert.match(menu, /<AnchoredPortalPopover/); assert.doesNotMatch(menu, /currentEntry\?\.githubRepoName|workspaceRepo\s*\|\|/);
});
