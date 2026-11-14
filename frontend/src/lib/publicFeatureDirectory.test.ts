import assert from 'node:assert/strict';
import { test } from 'node:test';
import { XROGA_FEATURES } from './features';
import { PUBLIC_FEATURE_GROUPS, PUBLIC_FEATURE_TOTAL } from './publicFeatureDirectory';

/** Explicit traceability from all 37 items in the existing public feature source. */
const sourceCoverage: ReadonlyArray<readonly [string, readonly string[]]> = [
  ['Black Hole V∞ coding agent', ['coding-agent']],
  ['Converter → Builder → QA → Ship loop', ['task-loop']],
  ['Sticky GitHub repo (create + iterate)', ['github-sticky']],
  ['Vercel deploy on your account', ['vercel']],
  ['Optional Supabase keys in vault → Vercel env', ['supabase-env']],
  ['Expo Android/iOS scaffold → GitHub (EAS via Publish + your token)', ['mobile']],
  ['Encrypted Expo / store credential vault (handoff — not auto store submit)', ['expo-publish']],
  ['Chrome extension (MV3) → GitHub Releases zip', ['extensions', 'chrome-release']],
  ['Electron desktop → GitHub Actions release (wait for zip)', ['desktop', 'desktop-release']],
  ['Next.js auth + API scaffold', ['auth-api']],
  ['Crypto market dashboard pack (no custody/trading)', ['crypto-dashboard']],
  ['Automation agent runner scaffold (cron/LLM)', ['automation-scaffold']],
  ['Web + X live research (when keyed)', ['web-research', 'x-research']],
  ['Code debug & fix', ['bug-fixing']],
  ['Website & SaaS generation', ['website-builder', 'saas-builder']],
  ['Chatbot landing + BYOK /api/chat scaffold', ['chatbot']],
  ['Ship GitHub → Vercel (web) / Releases (Chrome & desktop)', ['vercel', 'chrome-release', 'desktop-release']],
  ['Connectable: GitHub, Vercel, Supabase, Expo, billing keys', ['github-sticky', 'vercel', 'supabase-env', 'expo-publish', 'billing-keys']],
  ['Truthful shared-capacity billing', ['usage', 'limits']],
  ['Terminal fullscreen mode', ['terminal']],
  ['Browser preview dock', ['preview-dock']],
  ['Themes: White / Gray / Black / Beige with accessibility preferences', ['themes']],
  ['File upload & drag-drop attachments', ['attachment-upload']],
  ['Project file manager', ['file-manager']],
  ['Swarm / build run history', ['run-history']],
  ['Usage, pacing, and reset visibility', ['usage']],
  ['Custom domain deploy (your Vercel)', ['custom-domain']],
  ['Real-time SSE swarm stream', ['activity']],
  ['Free plan with included monthly AI usage', ['free-plan']],
  ['Bounded run concurrency', ['limits']],
  ['Xroga Pro upgrades through Whop', ['pro']],
  ['Magic link / Google / GitHub / email auth', ['sign-in']],
  ['Profile & settings', ['profile']],
  ['Mobile responsive Workspace', ['mobile-workspace']],
  ['SEO sitemap & OpenGraph', ['seo-output']],
  ['Google Cloud API backend', ['cloud-api']],
  ['Supabase auth & profiles', ['supabase-profiles']],
];

test('covers the entire existing XROGA_FEATURES source, not only top marketing cards', () => {
  assert.deepEqual(sourceCoverage.map(([label]) => label), XROGA_FEATURES);
  const all = PUBLIC_FEATURE_GROUPS.flatMap(group => group.items);
  const ids = new Set(all.map(feature => feature.id));
  assert.equal(ids.size, all.length, 'all cards have unique IDs');
  for (const [source, mappedIds] of sourceCoverage) {
    assert.ok(mappedIds.length, 'missing coverage for ' + source);
    for (const id of mappedIds) assert.ok(ids.has(id), source + ' points to missing ' + id);
  }
});

test('Manus-style directory displays complete groups, not a limited homepage shortlist', () => {
  assert.deepEqual(PUBLIC_FEATURE_GROUPS.map(group => group.id),
    ['research', 'build', 'develop', 'ship', 'workspace', 'connect']);
  assert.equal(PUBLIC_FEATURE_TOTAL, PUBLIC_FEATURE_GROUPS.reduce((n, g) => n + g.items.length, 0));
  assert.ok(PUBLIC_FEATURE_TOTAL >= 85, 'directory unexpectedly shrank');
  assert.ok(PUBLIC_FEATURE_GROUPS.find(g => g.id === 'connect')!.items.length >= 30);
});

test('does not promote retired studios or generic browsing as shipped capabilities', () => {
  const items = PUBLIC_FEATURE_GROUPS.flatMap(group => group.items);
  assert.ok(items.every(item => item.href.startsWith('/')));
  assert.ok(items.every(item => item.title && item.description));
  assert.ok(!items.some(item => ['/features/ai-image-generation',
    '/features/ai-video-generation', '/features/browser-automation'].includes(item.href)));
  for (const id of ['deep-research', 'x-research', 'vercel', 'expo-publish', 'web-preview']) {
    assert.equal(items.find(item => item.id === id)?.kind, 'conditional');
  }
  assert.ok(PUBLIC_FEATURE_GROUPS.find(g => g.id === 'connect')!.items.every(item => item.kind === 'catalog'));
});
