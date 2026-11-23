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

const LAUNCHER = read('../components/terminal/WorkspaceLauncher.tsx');
const PROJECTS = read('../components/layout/SidebarProjectHistory.tsx');

test('an empty workspace cannot become a blank shell due to a saved hidden chatbar', () => {
  assert.match(DOCK, /dockSuppressed = chatbarHidden && !emptyWorkspace/);
  assert.match(DOCK, /if \(isDashboard && emptyWorkspace && chatbarHidden\)/);
  assert.match(DOCK, /setChatbarHidden\(false\)/);
  assert.match(LAUNCHER, /disabled=\{emptyWorkspace\}/);
  assert.match(LAUNCHER, /function toggleChatbar\(\)\s*\{\s*if \(emptyWorkspace\) return;/);
  assert.match(LAUNCHER, /draftForExplicitHide\(snapshots/);
  assert.match(LAUNCHER, /flushSync\(\(\) => setPrompt\(latestDraft\)\)/);
  assert.match(PROJECTS, /setWorkspaceOpen\(false\);[\s\S]*setChatbarHidden\(false\);[\s\S]*router\.push\('\/workspace'\)/);
});

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


test('the real new terminal keeps Connect Apps in the composer footer', () => {
  assert.doesNotMatch(
    WELCOME,
    /WorkspaceConnectionsStrip/,
  );

  assert.doesNotMatch(DOCK, /xv-chatbar-context-strip/);
  assert.match(CHATBAR, /aria-label="Projects"/);
  assert.match(CHATBAR, /aria-label="Connect Apps"/);

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


test('workspace navigation uses independent arrows and hides both at the bottom', () => {
  const NAV = read('../components/terminal/WorkspaceScrollNavigation.tsx');
  const POLISH = read('../components/dashboard/WorkspaceScrollPolish.module.css');
  assert.match(DOCK, /<WorkspaceScrollNavigation/);
  assert.match(DOCK, /messages\.length > 0/);
  assert.match(NAV, /position\.scrollable && !position\.atBottom/);
  assert.match(NAV, /!position\.atTop/);
  assert.match(NAV, /aria-label="Scroll to first response"/);
  assert.match(NAV, /aria-label="Scroll to last response"/);
  assert.match(NAV, /scrollToFirst\(behavior\)/);
  assert.match(NAV, /scrollToLatest\(behavior\)/);
  assert.match(NAV, /new ResizeObserver\(schedule\)/);
  assert.match(NAV, /prefers-reduced-motion: reduce/);
  assert.match(NAV, /M440-160v-487L216-423/);
  assert.match(POLISH, /\.navigation\[data-visible='true'\]/);
});

test('the top scroll fade stays inside the conversation pane, never on the toolbar', () => {
  const POLISH = read('../components/dashboard/WorkspaceScrollPolish.module.css');
  assert.doesNotMatch(POLISH, /\.header(?:Shadow|Chrome)::(?:before|after)/);
  assert.doesNotMatch(DASHBOARD, /<header[^>]*data-scrolled/);
  assert.match(DASHBOARD, /className="xv-terminal-panel"[^>]*>\s*\{terminalPane\}\s*\{hasConversation && \([\s\S]*?data-scrolled=\{transcriptScrolled/);
  assert.match(POLISH, /\.transcriptFade\s*\{[^}]*inset-inline: max\(9%,[^}]*block-size: 10px;[^}]*pointer-events: none;[^}]*opacity: 0;/);
  assert.match(POLISH, /\.transcriptFade\[data-scrolled='true'\]\s*\{ opacity: 1; \}/);
});

test('Chrome extension control sits inline in the workspace header and does not add a transcript row', () => {
  const POLISH = read('../components/dashboard/WorkspaceScrollPolish.module.css');
  const OPERATOR = read('../components/browser/WorkspaceBrowserOperator.tsx');
  assert.match(DASHBOARD, /<header[\s\S]*?className=\{scrollPolish\.browserControl\}>\{browserOperator\}[\s\S]*?<\/header>/);
  assert.doesNotMatch(DASHBOARD, /<\/header>\s*\{browserOperator\}/);
  assert.match(POLISH, /\.browserControl\s*\{[^}]*position:\s*relative/);
  assert.match(OPERATOR, /<span>Extension<\/span>/);
  assert.match(OPERATOR, /supported local browser automation tasks/);
  assert.match(OPERATOR, /!showConnection[\s\S]*?Coming soon/);
  assert.doesNotMatch(OPERATOR, /chromewebstore\.google\.com|Connect from the Xroga side panel in Chrome\./);
  assert.match(POLISH, /terminal-skin-gray[^\n]*\[data-xroga-extension-trigger\][\s\S]*?border: 0/);
  assert.match(POLISH, /terminal-skin-dark[^\n]*\[data-xroga-extension-trigger\][\s\S]*?background: #fff/);
});

test('workspace scroll navigation stays compact and horizontal with Uiverse motion', () => {
  const POLISH = read('../components/dashboard/WorkspaceScrollPolish.module.css');
  assert.match(POLISH, /\.navigation\s*\{[^}]*flex-direction:\s*row;/s);
  assert.match(POLISH, /\.navButton\s*\{[^}]*width:\s*28px;[^}]*height:\s*28px;/s);
  assert.match(POLISH, /\.arrow, \.downArrow\s*\{[^}]*width:\s*16px;[^}]*height:\s*16px;/s);
  assert.match(POLISH, /\.navButton:hover\s*\{[^}]*translateY\(-3px\)[^}]*background-color:\s*#0c0c0c;/s);
  assert.match(POLISH, /\.navButton:hover \.arrow[^}]*scale\(1\.2\)/s);
  assert.match(POLISH, /\.navButton:active\s*\{[^}]*translateY\(2px\)/s);
  assert.match(POLISH, /@media \(max-width: 639px\)[^{]*\{[^}]*\}[^}]*\.navButton\s*\{[^}]*width:\s*26px;/s);
  assert.match(POLISH, /border:\s*2\.5px solid/);
  assert.match(POLISH, /\.navButton\[data-clicked='true'\]/);
  const NAV = read('../components/terminal/WorkspaceScrollNavigation.tsx');
  assert.match(NAV, /setClicked\(direction\)/);
  assert.match(NAV, /window\.setTimeout/);
  assert.match(NAV, /data-clicked=\{clicked === 'top'/);
  assert.match(NAV, /data-clicked=\{clicked === 'bottom'/);
  assert.match(POLISH, /@media \(prefers-reduced-motion: reduce\)/);
});

test('workspace transcript keeps balanced responsive gutters', () => {
  assert.match(CSS, /\.xv-terminal-body--flush\s*\{[^}]*padding:\s*0 clamp\(1rem, 6vw, 6rem\)/);
  assert.match(CSS, /\.xv-terminal-body--flush \.xv-terminal-turn\s*\{[^}]*max-width:\s*56rem/);
});

test('the conversation scrollport ends at the composer without clipping its native scrollbar', () => {
  const scrollport = CSS.match(/\.xv-terminal-scroll\[data-conversation='true'\]\s*\{([^}]*)\}/)?.[1] ?? '';
  assert.match(scrollport, /margin-block-end: max\(0px, calc\(var\(--xv-dock-bottom, 14px\) - var\(--xv-pane-bottom, 0px\)\)\)/);
  assert.doesNotMatch(scrollport, /clip-path/);
  assert.match(CSS, /\.xv-terminal-scroll::-webkit-scrollbar \{ width: 12px; \}/);
  assert.match(CSS, /\.xv-terminal-scroll::-webkit-scrollbar-thumb\s*\{[^}]*background-clip: padding-box;[^}]*border-inline: 2px solid transparent/);
  assert.match(CSS, /\.xv-terminal-dock\[class\*='terminal-skin-'\]\[data-workspace-state='conversation'\]\s*\{[^}]*pointer-events: none/);
  assert.match(CSS, /:is\(\.xv-kimi-composer-frame, \.xv-chatbar-queue-outside\)\s*\{[^}]*pointer-events: auto/);
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


test('connection management reads real provider status and routes full management to Connect Apps', () => {
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

  assert.match(INTEGRATIONS, /href=\{'\/dashboard\/integrations\/'\+encodeURIComponent\(app\.slug\)\}/);
  assert.match(INTEGRATIONS, /href="\/dashboard\/integrations".*Browse all apps/);
  assert.match(INTEGRATIONS, /Search all supported apps/);
  assert.match(INTEGRATIONS, /styles\.items/);
  assert.match(INTEGRATIONS, /xrogaConnect\.catalog/);
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


test('the current composer keeps its compact model identity without the retired outside anchor', () => {
  assert.doesNotMatch(
    CSS,
    /\.xv-terminal-dock--idle \.xv-companion-composer-anchor/,
  );

  assert.doesNotMatch(CHATBAR, /<CompanionComposerAnchor \/>/);
  assert.match(CHATBAR, /<BlackHoleVButton compact className="xv-companion-blackhole" \/>/);
  assert.doesNotMatch(DOCK, /<CompanionComposerAnchor/);

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
    /\.xv-workspace-shell\[class\*='terminal-skin-'\],[\s\S]*?\.xv-terminal-dock\[class\*='terminal-skin-'\]\s*\{[^}]*--composer-surface:\s*var\(--terminal-ui-raised\)/,
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
    /id="recent-projects-heading">Recent work<\/strong>/,
  );

  assert.match(
    TEMPLATES,
    /setRecentSessions\(loadTerminalHistory\(\)\.slice\(0, 6\)\)/,
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
    /offer GitHub publishing only after I select and authorize a repository/,
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


test('new terminal renders theme-aware readable cards without black-hole artwork', () => {
  assert.doesNotMatch(START + START_CSS, /black-hole.webp|next\/image/);
  assert.match(START, /Super Intelligence/);
  assert.match(START, /One AI workspace for every kind of/);
  assert.doesNotMatch(START, /DESCRIBE IT\.|SHIP IT\./);
  assert.match(START, /<CapabilityVisual id=\{card.id\}/);
  assert.doesNotMatch(START, /cardImage|1536/);
  assert.doesNotMatch(DASHBOARD, /BetaExpectationBanner/);
  assert.match(START_CSS, /background-clip: text/);
  assert.match(START_CSS, /\.superIntelligence[^}]*Georgia,'Times New Roman',serif/);
  assert.match(START_CSS, /\.cardWords strong[^}]*Georgia,'Times New Roman',serif/);
  assert.match(START_CSS, /\.superIntelligence[^}]*color: var\(--foreground\)/);
  assert.deepEqual([...START.matchAll(/id: '([^']+)'/g)].map(match => match[1]),
    ['create', 'find', 'build', 'ship', 'workflows', 'scheduled-tasks', 'employees', 'work-packs', 'browser-automation', 'apps-mcp']);
  assert.match(START_CSS, /background-color: var\(--terminal-ui-surface\) !important/);
  assert.match(START_CSS, /color: var\(--foreground\)/);
  assert.match(START_CSS, /font: 12px\/1\.5/);
  assert.match(START_CSS, /@container \(max-width: 580px\)/);
  assert.match(START_CSS, /repeat\(2,minmax\(0,1fr\)\)/);
  assert.match(DOCK, /<WorkspaceStartCards \/>/);
});

test('starter cards preserve immediate local drafts and do not auto-submit', () => {
  assert.match(START, /composer\?\.value \?\? prompt/);
  assert.match(START, /setPrompt\(!currentDraft\.trim\(\) \|\| isStarter \? instruction : `\$\{currentDraft\.trimEnd\(\)\}\\n\\n\$\{instruction\}`\)/);
  assert.match(START, /Ask for approval before publishing, making payments, sending messages, or changing external systems/);
  assert.match(START, /Acceptance criteria: \$\{TASK_ACCEPTANCE\[label\]/);
  assert.match(START, /Do not claim successful execution without evidence/);
  assert.match(START, /currentDraft\.trimEnd\(\)/);
  assert.match(START, /6000/);
  assert.match(START, /aria-haspopup="menu"/);
  assert.doesNotMatch(START, /<sup>/);
  assert.doesNotMatch(START, /\bsubmit\s*\(/);
  assert.match(START, /preventScroll: true/);
});

test('new terminal styling stays scoped while approved active composer controls retain parity', () => {
  assert.match(DOCK, /!sessionRestoring &&\s*messages\.length === 0 &&\s*!loading/);
  assert.match(DOCK, /showStarterExperience && !incognito && !dockSuppressed && startStyles.dock/);
  assert.match(DASHBOARD, /showNewTerminal && startStyles.window/);
  assert.match(CHATBAR, /arrowSend=\{!incognito\}/);
  assert.match(CHATBAR, /plusIcon=\{!incognito\}/);
  assert.doesNotMatch(CHATBAR, /microphoneIcon=\{starter\}/);
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
