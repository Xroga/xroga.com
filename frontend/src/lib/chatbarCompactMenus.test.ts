import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');
const CHAT = read('../components/terminal/TerminalChatBar.tsx');
const ACTIONS = read('../components/terminal/ChatBarActionsMenu.tsx');
const PROJECTS = read('../components/terminal/ProjectsQuickPopover.tsx');
const CONNECT = read('../components/terminal/IntegrationsModal.tsx');
const MODEL = read('../components/terminal/BlackHoleVButton.tsx');

test('Projects in chatbar opens saved-project switcher, not the repository connection dialog', () => {
  const button = CHAT.slice(CHAT.indexOf('ref={projectsButtonRef}'), CHAT.indexOf('ref={pluginsButtonRef}'));
  assert.match(button, /setProjectsQuickOpen\(open => !open\)/);
  assert.doesNotMatch(button, /setGithubOpen\(true\)/);
  assert.match(PROJECTS, /api\.projects\.list\(\)/);
  assert.match(PROJECTS, /loadLocalProjects\(\)/);
  assert.match(PROJECTS, /continueGithubProject\(item\.project, router\)/);
  assert.match(PROJECTS, /resumeToDashboard\(/);
  assert.match(PROJECTS, /View all projects/);
});

test('Connect Apps uses actual connected app picker and no full-page dialog', () => {
  assert.match(CHAT, /aria-label="Connect Apps"/);
  assert.match(CHAT, /setIntegrationsOpen\(open => !open\)/);
  assert.match(CONNECT, /AnchoredPortalPopover/);
  assert.match(CONNECT, /api\.github\.status\(\)/);
  assert.match(CONNECT, /xrogaConnect\.search/);
  assert.match(CONNECT, /Browse all apps/);
});

test('Actions are compact and keyboard reachable, with actual project access', () => {
  assert.match(ACTIONS, /Math\.min\(344, window\.innerWidth - 16\)/);
  assert.match(ACTIONS, /Math\.min\(314,/);
  assert.match(ACTIONS, /ArrowDown/);
  assert.match(ACTIONS, /ArrowUp/);
  assert.match(ACTIONS, /scrollIntoView\(\{ block: 'nearest' \}\)/);
  assert.match(ACTIONS, /item\.id === 'projects' && onOpenProjects/);
  assert.match(ACTIONS, /<b>Connect Apps<\/b>/);
});

test('Black Hole retains backend usage and app policy with only one meter', () => {
  assert.match(MODEL, /api\.billing\.entitlement\(\)/);
  assert.match(MODEL, /ModelAppPermissions/);
  assert.equal((MODEL.match(/className=\{styles\.usageMeter\}/g) ?? []).length, 1);
  assert.doesNotMatch(MODEL, /Available now<\/span>/);
  assert.match(read('../components/terminal/BlackHoleMark.tsx'), /black-hole-cutout-v2\.png/);
});
