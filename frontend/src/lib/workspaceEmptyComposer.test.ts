import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const read = (path: string) =>
  readFileSync(new URL(path, import.meta.url), 'utf8');

const DOCK = read('../components/terminal/TerminalDock.tsx');
const CHATBAR = read('../components/terminal/TerminalChatBar.tsx');
const WELCOME = read('../components/dashboard/DashboardWelcome.tsx');
const IDEAS = read('../components/dashboard/WorkspaceStarterIdeas.tsx');
const TEMPLATES = read('../components/dashboard/WorkspaceShowcaseStarts.tsx');
const SIDEBAR = read('../components/layout/Sidebar.tsx');
const REPO = read('../components/terminal/RepoContextBar.tsx');
const DASHBOARD = read('../components/dashboard/DashboardView.tsx');
const CONNECTIONS = read('../components/terminal/WorkspaceConnectionsStrip.tsx');
const INTEGRATIONS = read('../components/terminal/IntegrationsModal.tsx');
const PRIVACY = read('../components/settings/PrivacySettingsPanel.tsx');
const AVATAR_PICKER = read('../components/profile/AvatarPickerModal.tsx');
const START = read('../components/dashboard/WorkspaceNewTerminal.tsx');
const START_CSS = read('../components/dashboard/WorkspaceNewTerminal.module.css');
const CSS = read('../app/globals.css').replace(/\/\*[\s\S]*?\*\//g, '');

test('an empty terminal centers the one canonical composer without duplicate suggestion tabs', () => {
  assert.match(DOCK, /messages\.length === 0/);

  assert.match(
    DOCK,
    /showStarterExperience\s*=\s*emptyWorkspace\s*&&\s*!workspaceOpen/,
  );

  assert.match(DOCK, /xv-terminal-dock--idle/);

  assert.match(DOCK, /<TerminalChatBar starter=\{showStarterExperience && !incognito\} \/>/);

  assert.equal(
    (DOCK.match(/<TerminalChatBar starter=\{showStarterExperience && !incognito\} \/>/g) ?? []).length,
    1,
  );

  assert.doesNotMatch(
    DOCK,
    /<WorkspaceStarterIdeas \/>/,
  );

  assert.match(
    DOCK,
    /showStarterExperience[\s\S]*<WorkspaceStartCards \/>/,
  );

  assert.match(
    DASHBOARD,
    /--xv-pane-top/,
  );

  assert.match(
    DASHBOARD,
    /--xv-pane-bottom/,
  );

  assert.match(
    CSS,
    /@media \(min-width:\s*640px\)[\s\S]*?\.xv-terminal-dock--idle:not\(\.xv-terminal-dock--fullscreen\)\s*\{[^}]*top:\s*max\([^}]*bottom:\s*var\(--xv-pane-bottom[^}]*overflow-y:\s*auto[^}]*transform:\s*none/,
  );
});


test('New Terminal closes Project edits before revealing the centered starter', () => {
  const handler = SIDEBAR.slice(
    SIDEBAR.indexOf('function handleNewChat()'),
    SIDEBAR.indexOf('async function handleLogout'),
  );

  assert.match(
    handler,
    /startNewChat\(\)/,
  );

  assert.match(
    handler,
    /useProjectWorkspaceStore\.getState\(\)\.setWorkspaceOpen\(false\)/,
  );

  assert.match(
    handler,
    /xroga-request-new-terminal/,
  );
});


test('New Terminal preserves canonical project selection and focuses the clean composer', () => {
  const start =
    CHATBAR.indexOf('// Sidebar "New Terminal"');

  const effectOpen =
    CHATBAR.indexOf(
      'useEffect(() => {',
      start,
    );

  const effect =
    CHATBAR.slice(
      start,
      CHATBAR.indexOf(
        'useEffect(() => {',
        effectOpen + 20,
      ),
    );

  assert.doesNotMatch(
    effect,
    /clearSelectedRepoContext\(\)/,
  );

  assert.doesNotMatch(
    effect,
    /markFreshTerminalIntent\(\)/,
  );

  assert.doesNotMatch(
    effect,
    /notifyRepoContextCleared\(\)/,
  );

  assert.match(
    effect,
    /textareaRef\.current\?\.focus\(\)/,
  );

  assert.doesNotMatch(
    effect,
    /notifyOpenRepoPicker/,
  );

  assert.doesNotMatch(
    effect,
    /setRepoGate/,
  );
});


test('ideas stay collapsed until a category is chosen, then fill the real composer without auto-sending', () => {
  assert.match(
    IDEAS,
    /role="tablist"/,
  );

  assert.match(
    IDEAS,
    /label: 'Suggestions'/,
  );

  assert.match(
    IDEAS,
    /useState<string \| null>\(null\)/,
  );

  assert.match(
    IDEAS,
    /setGroupId\(nextId\)/,
  );

  assert.match(
    IDEAS,
    /setPage\(\(current\) => \(current \+ 1\) % 2\)/,
  );

  assert.match(
    IDEAS,
    /activeGroup \? \(/,
  );

  assert.doesNotMatch(
    IDEAS,
    /Xroga ideas|Choose a direction, then make it yours|New ideas/,
  );

  assert.match(
    IDEAS,
    /setPrompt\(idea\)/,
  );

  assert.match(
    IDEAS,
    /textarea\[data-terminal-composer\][\s\S]*setGroupId\(null\)/,
  );

  assert.match(
    IDEAS,
    /aria-label="Hide ideas"/,
  );

  for (
    const icon of [
      'LightbulbIcon',
      'EarthIcon',
      'AirplayIcon',
      'TabletIcon',
      'CpuIcon',
    ]
  ) {
    assert.match(
      IDEAS,
      new RegExp(`icon: ${icon}`),
      `starter tabs lost ${icon}`,
    );
  }

  assert.match(
    IDEAS,
    /<AnimatedIcon icon=\{Icon\}/,
  );

  assert.doesNotMatch(
    IDEAS,
    /icon: (?:Lightbulb|Globe2|AppWindow|Smartphone|Workflow),/,
  );

  assert.match(
    IDEAS,
    /textarea\[data-terminal-composer\]/,
  );

  assert.doesNotMatch(
    IDEAS,
    /\bsubmit\s*\(/,
  );

  assert.match(
    CSS,
    /\.xv-workspace-starter-stack\s*\{[^}]*min-width:\s*0/,
  );

  assert.match(
    CSS,
    /\.xv-workspace-idea-tabs\s*\{[^}]*width:\s*100%[^}]*max-width:\s*100%[^}]*justify-content:\s*safe center[^}]*margin-inline:\s*auto/,
  );

  assert.match(
    CSS,
    /\.xv-workspace-starter-ideas\s*\{[^}]*position:\s*sticky[^}]*top:\s*0[^}]*background:\s*transparent/,
  );

  assert.match(
    CSS,
    /\.xv-workspace-idea-tab\s*\{[^}]*border:\s*0[^}]*background:\s*transparent/,
  );

  assert.match(
    CSS,
    /@media \(max-width:\s*639px\)[\s\S]*?\.xv-workspace-idea-tab\s*\{[^}]*font-size:\s*0\.58rem[^}]*\}[\s\S]*?\.xv-workspace-idea-tab > \.xv-animated-icon-host\s*\{[^}]*display:\s*block/,
  );
});


test('the real new terminal keeps plugins in the composer footer', () => {
  assert.doesNotMatch(
    WELCOME,
    /WorkspaceConnectionsStrip/,
  );

  assert.match(
    DOCK,
    /xv-chatbar-context-strip[\s\S]*?<RepoContextBar[\s\S]*?<WorkspaceConnectionsStrip[\s\S]*?variant="chatbar"/,
  );

  assert.match(
    CONNECTIONS,
    /GitHub/,
  );

  assert.match(
    CONNECTIONS,
    /Vercel/,
  );

  assert.match(
    CONNECTIONS,
    /Supabase/,
  );

 assert.match(
  CONNECTIONS,
  /<strong>\s*Plugins\s*<\/strong>/,
);

assert.match(
  CONNECTIONS,
  /Click to manage plugins\./,
);

  assert.match(
    CONNECTIONS,
    /xv-workspace-connections__preview/,
  );

  assert.match(
    CONNECTIONS,
    /setModalOpen\(true\)/,
  );

  assert.match(
    CSS,
    /\.xv-workspace-connections--chatbar/,
  );

  assert.match(
    CSS,
    /\.xv-welcome-editorial\s*\{[^}]*font-size:\s*clamp\(1\.12rem, 2\.15vw, 1\.82rem\)/,
  );
});


test('a conversation exposes one context-aware navigator that follows scroll position', () => {
  assert.match(
    DOCK,
    /messages\.length\s*>\s*0\s*&&\s*!incognito/,
  );

  assert.match(
    DOCK,
    /'xv-conversation-navigator'/,
  );

  assert.match(
    DOCK,
    /showJumpToLatest \? 'Scroll to latest' : 'Scroll to top'/,
  );

  assert.match(
    DOCK,
    /showJumpToLatest\s*\? scrollToLatest\('smooth'\)\s*:\s*scrollToFirst\('smooth'\)/,
  );

  assert.match(
    DOCK,
    /<ArrowUp className="xv-conversation-navigator__arrow"/,
  );

  assert.match(
    CSS,
    /\.xv-conversation-navigator\.is-direction-down\s*\{[^}]*--xv-navigator-rotation:\s*180deg/,
  );

  assert.match(CSS, /\.xv-conversation-navigator\s*\{[\s\S]*?width:\s*2\.25rem[\s\S]*?border-radius:\s*0\.62rem/);
  assert.match(DOCK, /data-tooltip=\{showJumpToLatest \? 'Latest' : 'Top'\}/);
  assert.doesNotMatch(DOCK, /xv-conversation-navigator__label/);
});

test('workspace transcript keeps balanced responsive gutters', () => {
  assert.match(CSS, /\.xv-terminal-body--flush\s*\{[^}]*padding:\s*0 clamp\(1rem, 6vw, 6rem\)/);
  assert.match(CSS, /\.xv-terminal-body--flush \.xv-terminal-turn\s*\{[^}]*max-width:\s*56rem/);
});

test('the live transcript does not mount the starter headline as a scrolling wall', () => {
  assert.doesNotMatch(DASHBOARD, /<DashboardWelcome/);
  assert.match(DOCK, /showStarterExperience &&\s*!incognito \? \(\s*<WorkspaceStartHeader \/>/);
});


test('full prompt expands the existing prompt bubble instead of rendering a duplicate box', () => {
  assert.match(
    PRIVACY,
    /expanded && 'is-expanded'/,
  );

  assert.equal(
    (
      PRIVACY.match(
        /className="xv-settings-prompt-expanded"/g,
      ) ?? []
    ).length,
    0,
  );

  assert.match(
    PRIVACY,
    /aria-label=\{expanded \? 'Collapse full prompt' : 'Expand full prompt'\}/,
  );
});


test('connection management reads real provider status and routes full management to Plugins', () => {
  for (
    const provider of [
      'github',
      'vercel',
      'supabase',
    ]
  ) {
    assert.match(
      CONNECTIONS,
      new RegExp(
        `api\\.${provider}\\.status\\(\\)`,
      ),
    );

    assert.match(
      INTEGRATIONS,
      new RegExp(
        `api\\.${provider}\\.status\\(\\)`,
      ),
    );
  }

  assert.equal(
    INTEGRATIONS.includes('/dashboard/integrations/\${plugin.id}'),
    true,
  );

  assert.match(
    INTEGRATIONS,
    /Manage Plugins/,
  );

  assert.match(INTEGRATIONS, /placeholder="Search plugins…"/);
  assert.match(INTEGRATIONS, /xv-plugins-popover__body/);
  assert.match(INTEGRATIONS, /Browse all/);

  assert.match(
    INTEGRATIONS,
    /xrogaConnect\.search/,
  );
});


test('repository updates cannot resize or bounce the whole workspace dock', () => {
  assert.doesNotMatch(
    DOCK,
    /new ResizeObserver/,
  );

  assert.match(
    DOCK,
    /chatbarHidden[\s\S]*'--xv-chatbar-height',\s*'0px'/,
  );

  assert.match(
    DOCK,
    /xv-terminal-dock--restoring/,
  );

  assert.match(
    CSS,
    /\.xv-terminal-dock--restoring\s*\{[^}]*visibility:\s*hidden[^}]*transition:\s*none !important/,
  );

  assert.match(
    CHATBAR,
    /new ResizeObserver\(sync\)/,
  );

  assert.doesNotMatch(
    CSS,
    /\.xv-workspace-starter-stack\s*\{[^}]*animation:/,
  );

  assert.doesNotMatch(
    CSS,
    /\.xv-terminal-dock:not\(\.xv-terminal-dock--fullscreen\)\s*\{[^}]*bottom 300ms/,
  );
});


test('the companion sits outside the composer while model identity stays beside the primary action', () => {
  assert.doesNotMatch(
    CSS,
    /\.xv-terminal-dock--idle \.xv-companion-composer-anchor/,
  );

  assert.doesNotMatch(CHATBAR, /<CompanionComposerAnchor \/>/);
  assert.match(CHATBAR, /<BlackHoleVButton compact className="xv-companion-blackhole" \/>/);
  assert.match(DOCK, /!incognito && !showStarterExperience \? <CompanionComposerAnchor \/> : null/);

  assert.match(
    CSS,
    /@media \(min-width:\s*640px\)[\s\S]*?\.xv-terminal-dock--idle:not\(\.xv-terminal-dock--fullscreen\)\s*\{[^}]*top:\s*max\(calc\(var\(--xv-pane-top, 60px\) \+ 24px\), calc\(30vh - 72px\)\)[^}]*padding-top:\s*72px[^}]*overflow-y:\s*auto/,
  );
});


test('the empty dock inherits the selected terminal skin and keeps mobile starter space', () => {
  assert.match(
    DOCK,
    /const terminalSkinRaw\s*=\s*useThemeStore\(\(s\)\s*=>\s*s\.terminalSkin\)/,
  );

  assert.match(
    DOCK,
    /`terminal-skin-\$\{\s*incognito\s*\?\s*'dark'\s*:\s*terminalSkin\s*\}`/,
  );

  assert.match(
    CSS,
    /\.xv-terminal-dock\[class\*='terminal-skin-'\]\s*\{[^}]*--composer-surface:\s*var\(--terminal-ui-raised\)[^}]*background:\s*transparent[^}]*border:\s*0/,
  );

  assert.match(
    CSS,
    /\.xv-terminal-dock\[class\*='terminal-skin-'\]\s*\{[^}]*background:\s*transparent !important[^}]*border:\s*0 !important[^}]*box-shadow:\s*none !important/,
  );

  assert.match(
    CSS,
    /@media \(max-width:\s*639px\)[\s\S]*?\.xv-terminal-dock--idle:not\(\.xv-terminal-dock--fullscreen\)\s*\{[^}]*top:\s*max\(calc\(var\(--xv-pane-top, 54px\) \+ 74px\), 22dvh\)/,
  );

  assert.match(
    CSS,
    /\.xv-terminal-scroll\[data-conversation='false'\] \.xv-dashboard-welcome\s*\{[^}]*z-index:\s*2[^}]*width:\s*min\(100%, 760px\)/,
  );
});


test('the same starter header stays in flow before the composer, including fullscreen', () => {
  assert.ok(DOCK.indexOf('<WorkspaceStartHeader />') < DOCK.indexOf('className="xv-chatbar-stack relative"'));
  assert.doesNotMatch(DOCK, /xv-fullscreen-inspiration/);
  assert.match(START_CSS, /overflow-y: auto !important/);
  assert.match(START_CSS, /max-width: 1040px !important/);
});

test('repository status is brief and is not replayed during passive restore', () => {
  assert.match(
    REPO,
    /}, 1800\)/,
  );

  assert.match(
    REPO,
    /announce = true/,
  );

  assert.match(
    REPO,
    /analyzeRepo\(defaultRepo, branch, false, false\)/,
  );
});


test('the bottom inspiration bar opens the real catalog automatically on workspace scroll', () => {
  assert.doesNotMatch(
    WELCOME,
    /<details|xv-ws-fold/,
  );

  assert.match(
    TEMPLATES,
    /xv-workspace-template-catalog/,
  );

  assert.match(
    TEMPLATES,
    /TEMPLATE_COLLECTIONS\.map/,
  );

  assert.match(
    TEMPLATES,
    /Explore inspiration/,
  );

  assert.match(
    TEMPLATES,
    /const \[expanded, setExpanded\] = useState\(false\)/,
  );

  assert.match(
    TEMPLATES,
    /aria-expanded=\{expanded\}/,
  );

  assert.match(
    TEMPLATES,
    /\{expanded \? \(/,
  );

  assert.match(
    TEMPLATES,
    /Scroll to explore/,
  );

  assert.match(
    TEMPLATES,
    /Close inspiration/,
  );

  assert.match(
    TEMPLATES,
    /closest<HTMLElement>\('\.xv-terminal-dock--idle'\)/,
  );

  assert.match(
    TEMPLATES,
    /scrollRoot\.addEventListener\('scroll', openFromScroll, \{ passive: true \}\)/,
  );

  assert.match(
    TEMPLATES,
    /scrollRoot\.scrollTop > 28[\s\S]*setExpanded\(true\)/,
  );

  assert.match(
    TEMPLATES,
    /Recent projects/,
  );

  assert.match(
    TEMPLATES,
    /loadTerminalHistory\(\)\.filter/,
  );

  assert.match(
    TEMPLATES,
    /api\.github\.listRepos\(\)/,
  );

  assert.doesNotMatch(
    TEMPLATES,
    /id: 'recent-builds'/,
  );

  assert.match(
    TEMPLATES,
    /Community templates/,
  );

  assert.match(
    TEMPLATES,
    /Xroga templates/,
  );

  assert.match(
    TEMPLATES,
    /Browse all/,
  );

  assert.doesNotMatch(
    TEMPLATES,
    /duplicate|template-marquee|railPaused/,
  );

  assert.match(
    TEMPLATES,
    /role="dialog"/,
  );

  assert.match(
    TEMPLATES,
    /Full preview/,
  );

  assert.match(
    TEMPLATES,
    /Use prompt &amp; ship/,
  );

  assert.match(
    TEMPLATES,
    /setPrompt\(prompt\)/,
  );

  assert.match(
    TEMPLATES,
    /selected GitHub repository/,
  );

  assert.match(
    CSS,
    /\.xv-workspace-template-catalog\s*\{[^}]*display:\s*flex/,
  );

  assert.match(
    CSS,
    /\.xv-workspace-template-card\s*\{[^}]*flex-direction:\s*column[^}]*width:\s*clamp\(190px,\s*24vw,\s*226px\)/,
  );

  assert.match(
    CSS,
    /\.xv-workspace-templates\s*\{[^}]*width:\s*100%[^}]*max-width:\s*100%[^}]*border:\s*1px solid[^}]*border-radius:\s*14px/,
  );

  assert.match(
    CSS,
    /\.xv-workspace-template-viewport\s*\{[^}]*width:\s*100%[^}]*max-width:\s*100%[^}]*overflow-x:\s*auto/,
  );

  assert.match(
    TEMPLATES,
    /--xv-explore-left/,
  );

  assert.match(
    TEMPLATES,
    /new ResizeObserver\(syncPinnedBar\)/,
  );

  assert.match(
    CSS,
    /\.xv-workspace-showcase-below-fold\[data-expanded='false'\] \.xv-workspace-explore-bar\s*\{[^}]*position:\s*fixed[^}]*bottom:\s*var\(--xv-explore-bottom[^}]*left:\s*var\(--xv-explore-left/,
  );

  assert.match(
    CSS,
    /\.xv-workspace-showcase-below-fold\[data-expanded='true'\]\s*\{[^}]*margin-top:\s*0\.55rem/,
  );
});


test('new terminal renders transparent artwork and selectable HTML text with five HD cards', () => {
  assert.match(START, /black-hole.webp/);
  assert.match(START, /Super Intelligence/);
  assert.match(START, /One AI layer for every kind of work/);
  assert.match(START, /DESCRIBE IT\./);
  assert.match(START, /width=\{1536\} height=\{1024\}/);
  assert.equal((START.match(/id: '/g) ?? []).length, 5);
  assert.match(START_CSS, /repeat\(5,minmax\(0,1fr\)\)/);
  assert.match(START_CSS, /@container \(max-width: 580px\)/);
  assert.match(START_CSS, /repeat\(2,minmax\(0,1fr\)\)/);
  assert.match(DOCK, /<WorkspaceStartCards \/>/);
});

test('starter cards preserve immediate local drafts and do not auto-submit', () => {
  assert.match(START, /composer\?\.value \?\? prompt/);
  assert.match(START, /if \(!currentDraft\.trim\(\) \|\| isStarter\) setPrompt\(prefix\)/);
  assert.doesNotMatch(START, /\bsubmit\s*\(/);
  assert.match(START, /preventScroll: true/);
});

test('new terminal styling and icons cannot leak into an existing conversation', () => {
  assert.match(DOCK, /!sessionRestoring &&\s*messages\.length === 0 &&\s*!loading/);
  assert.match(DOCK, /showStarterExperience && !incognito && !chatbarHidden && startStyles.dock/);
  assert.match(DASHBOARD, /showNewTerminal && startStyles.window/);
  assert.match(CHATBAR, /arrowSend=\{starter\}/);
  assert.match(CHATBAR, /microphoneIcon=\{starter\}/);
  assert.match(CHATBAR, /setGithubOpen\(true\)/);
  assert.match(CHATBAR, /setIntegrationsOpen\(true\)/);
});

test('default monochrome accents keep primary buttons legible in dark themes', () => {
  assert.match(AVATAR_PICKER, /className="xv-accent-action[^"]*bg-\[var\(--accent\)\]/);
  assert.match(CSS, /html\[data-accent='default'\] body\.theme-black \.xv-accent-action,[\s\S]*?body\.theme-gray \.xv-accent-action\s*\{[^}]*color:\s*#080808/);
});


test('the composer uses a short inner signal for entry, typing, and uploads, never hover', () => {
  assert.match(
    CSS,
    /\.xv-terminal-dock \.xv-chatbar-solid::before\s*\{[^}]*inset:\s*0[^}]*padding:\s*2px[^}]*mask-composite:\s*exclude/,
  );

  assert.match(
    CSS,
    /\.xv-terminal-dock \.xv-chatbar-solid\.xv-chatbar--inner-active::before/,
  );

  assert.match(
    CSS,
    /animation:\s*xv-chatbar-inner-signal 1\.5s/,
  );

  assert.doesNotMatch(
    CSS,
    /\.xv-chatbar-solid:hover::before/,
  );

  assert.doesNotMatch(
    CSS,
    /xv-chatbar-ambient-halo/,
  );

  assert.match(
    CHATBAR,
    /triggerComposerSignal\(2400\)/,
  );

  assert.match(
    CHATBAR,
    /triggerComposerSignal\(900\)/,
  );

  assert.match(
    CHATBAR,
    /triggerComposerSignal\(1800\)/,
  );

  assert.match(
    CHATBAR,
    /composerSignal[^\n]*xv-chatbar--inner-active/,
  );
});


test('the composer identity uses a deterministic shortened real display name', () => {
  assert.match(
    WELCOME,
    /displayName\.trim\(\)\.split\(\/\\s\+\/\)\[0\]\?\.slice\(0, 12\)/,
  );

  assert.match(
    WELCOME,
    /Signed in as \$\{shortName\}/,
  );

  assert.doesNotMatch(
    WELCOME,
    /getTimeGreetingKey|useHydrated|useLocale/,
  );
});


test('returning to the empty workspace restores the full unclipped headline', () => {
  assert.match(
    DOCK,
    /dockRef\.current\?\.scrollTo\(\{\s*top:\s*0,?\s*\}\)/,
  );

  assert.match(
    CSS,
    /\.xv-terminal-dock--idle \.xv-terminal-dock-inner\s*\{[^}]*background:\s*transparent !important[^}]*border:\s*0 !important[^}]*box-shadow:\s*none !important/,
  );
});


test('an untouched terminal hides transcript and checklist noise behind the starter', () => {
  assert.match(
    CSS,
    /\.xv-terminal-scroll\[data-conversation='false'\] \.xv-term-empty/,
  );

  assert.match(
    CSS,
    /\.xv-terminal-scroll\[data-conversation='false'\] \.xv-first-run-checklist/,
  );
});
