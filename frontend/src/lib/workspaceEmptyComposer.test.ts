import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');
const DOCK = read('../components/terminal/TerminalDock.tsx');
const WELCOME = read('../components/dashboard/DashboardWelcome.tsx');
const IDEAS = read('../components/dashboard/WorkspaceStarterIdeas.tsx');
const TEMPLATES = read('../components/dashboard/WorkspaceShowcaseStarts.tsx');
const SIDEBAR = read('../components/layout/Sidebar.tsx');
const CHATBAR = read('../components/terminal/TerminalChatBar.tsx');
const REPO = read('../components/terminal/RepoContextBar.tsx');
const DASHBOARD = read('../components/dashboard/DashboardView.tsx');
const CSS = read('../app/globals.css').replace(/\/\*[\s\S]*?\*\//g, '');

test('an empty terminal centers the one canonical composer and exposes starters', () => {
  assert.match(DOCK, /messages\.length === 0/);
  assert.match(DOCK, /showStarterExperience = emptyWorkspace && !workspaceOpen/);
  assert.match(DOCK, /xv-terminal-dock--idle/);
  assert.match(DOCK, /<TerminalChatBar \/>/);
  assert.equal((DOCK.match(/<TerminalChatBar \/>/g) ?? []).length, 1);
  assert.match(DOCK, /showStarterExperience[\s\S]*<WorkspaceStarterIdeas \/>[\s\S]*<WorkspaceShowcaseStarts className="xv-workspace-showcase-below-fold" \/>/);
  assert.match(DASHBOARD, /--xv-pane-top/);
  assert.match(DASHBOARD, /--xv-pane-bottom/);
  assert.match(CSS, /@media \(min-width:\s*640px\)[\s\S]*?\.xv-terminal-dock--idle:not\(\.xv-terminal-dock--fullscreen\)\s*\{[^}]*top:\s*max\([^}]*bottom:\s*var\(--xv-pane-bottom[^}]*overflow-y:\s*auto[^}]*transform:\s*none/);
});

test('New Terminal closes Project edits before revealing the centered starter', () => {
  const handler = SIDEBAR.slice(SIDEBAR.indexOf('function handleNewChat()'), SIDEBAR.indexOf('async function handleLogout'));
  assert.match(handler, /startNewChat\(\)/);
  assert.match(handler, /useProjectWorkspaceStore\.getState\(\)\.setWorkspaceOpen\(false\)/);
  assert.match(handler, /xroga-request-new-terminal/);
});

test('New Terminal leaves repository selection available without opening it over the composer', () => {
  const start = CHATBAR.indexOf('// Sidebar "New Terminal"');
  const effectOpen = CHATBAR.indexOf('useEffect(() => {', start);
  const effect = CHATBAR.slice(start, CHATBAR.indexOf('useEffect(() => {', effectOpen + 20));
  assert.match(effect, /clearSelectedRepoContext\(\)/);
  assert.match(effect, /notifyRepoContextCleared\(\)/);
  assert.match(effect, /textareaRef\.current\?\.focus\(\)/);
  assert.doesNotMatch(effect, /notifyOpenRepoPicker/);
  assert.doesNotMatch(effect, /setRepoGate/);
});

test('ideas stay collapsed until a category is chosen, then fill the real composer without auto-sending', () => {
  assert.match(IDEAS, /role="tablist"/);
  assert.match(IDEAS, /label: 'Suggestions'/);
  assert.match(IDEAS, /useState<string \| null>\(null\)/);
  assert.match(IDEAS, /setGroupId\(nextId\)/);
  assert.match(IDEAS, /setPage\(\(current\) => \(current \+ 1\) % 2\)/);
  assert.match(IDEAS, /activeGroup \? \(/);
  assert.doesNotMatch(IDEAS, /Xroga ideas|Choose a direction, then make it yours|New ideas/);
  assert.match(IDEAS, /setPrompt\(idea\)/);
  assert.match(IDEAS, /textarea\[data-terminal-composer\][\s\S]*setGroupId\(null\)/);
  assert.match(IDEAS, /aria-label="Hide ideas"/);
  for (const icon of ['LightbulbIcon', 'EarthIcon', 'AirplayIcon', 'TabletIcon', 'CpuIcon']) {
    assert.match(IDEAS, new RegExp(`icon: ${icon}`), `starter tabs lost ${icon}`);
  }
  assert.match(IDEAS, /<AnimatedIcon icon=\{Icon\}/);
  assert.doesNotMatch(IDEAS, /icon: (?:Lightbulb|Globe2|AppWindow|Smartphone|Workflow),/);
  assert.match(IDEAS, /textarea\[data-terminal-composer\]/);
  assert.doesNotMatch(IDEAS, /\bsubmit\s*\(/);
  assert.match(CSS, /\.xv-workspace-starter-stack\s*\{[^}]*min-width:\s*0/);
  assert.match(CSS, /\.xv-workspace-idea-tabs\s*\{[^}]*width:\s*100%[^}]*max-width:\s*100%[^}]*justify-content:\s*safe center[^}]*margin-inline:\s*auto/);
  assert.match(CSS, /@media \(max-width:\s*639px\)[\s\S]*?\.xv-workspace-idea-tab\s*\{[^}]*font-size:\s*0\.58rem[^}]*\}[\s\S]*?\.xv-workspace-idea-tab > \.xv-animated-icon-host\s*\{[^}]*display:\s*block/);
});

test('repository updates cannot resize or bounce the whole workspace dock', () => {
  assert.doesNotMatch(DOCK, /new ResizeObserver/);
  assert.match(DOCK, /chatbarHidden[\s\S]*--xv-chatbar-height', '0px'/);
  assert.match(DOCK, /xv-terminal-dock--restoring/);
  assert.match(CSS, /\.xv-terminal-dock--restoring\s*\{[^}]*visibility:\s*hidden[^}]*transition:\s*none !important/);
  assert.match(CHATBAR, /new ResizeObserver\(sync\)/);
  assert.doesNotMatch(CSS, /\.xv-workspace-starter-stack\s*\{[^}]*animation:/);
  assert.doesNotMatch(CSS, /\.xv-terminal-dock:not\(\.xv-terminal-dock--fullscreen\)\s*\{[^}]*bottom 300ms/);
});

test('the desktop companion stays attached outside the canonical composer', () => {
  assert.doesNotMatch(CSS, /\.xv-terminal-dock--idle \.xv-companion-composer-anchor/);
  assert.match(DOCK, /<CompanionComposerAnchor \/>[\s\S]*?<TerminalChatBar \/>/);
  assert.match(CSS, /@media \(min-width:\s*640px\)[\s\S]*?\.xv-terminal-dock--idle:not\(\.xv-terminal-dock--fullscreen\)\s*\{[^}]*top:\s*max\(calc\(var\(--xv-pane-top, 60px\) \+ 24px\), calc\(30vh - 72px\)\)[^}]*padding-top:\s*72px[^}]*overflow-y:\s*auto/);
});

test('the empty dock inherits the selected terminal skin and keeps mobile starter space', () => {
  assert.match(DOCK, /const terminalSkinRaw = useThemeStore\(\(s\) => s\.terminalSkin\)/);
  assert.match(DOCK, /`terminal-skin-\$\{incognito \? 'dark' : terminalSkin\}`/);
  assert.match(CSS, /\.xv-terminal-dock\[class\*='terminal-skin-'\]\s*\{[^}]*--composer-surface:\s*var\(--terminal-ui-raised\)[^}]*background:\s*transparent[^}]*border:\s*0/);
  assert.match(CSS, /\.xv-terminal-dock\[class\*='terminal-skin-'\]\s*\{[^}]*background:\s*transparent !important[^}]*border:\s*0 !important[^}]*box-shadow:\s*none !important/);
  assert.match(CSS, /@media \(max-width:\s*639px\)[\s\S]*?\.xv-terminal-dock--idle:not\(\.xv-terminal-dock--fullscreen\)\s*\{[^}]*top:\s*max\(calc\(var\(--xv-pane-top, 54px\) \+ 74px\), 22dvh\)/);
  assert.match(CSS, /\.xv-terminal-scroll\[data-conversation='false'\] \.xv-dashboard-welcome\s*\{[^}]*z-index:\s*2[^}]*width:\s*min\(100%, 760px\)/);
});

test('fullscreen command inspiration is in flow before the composer', () => {
  const inspiration = DOCK.indexOf('className="xv-fullscreen-inspiration"');
  const composer = DOCK.indexOf('className="xv-chatbar-stack relative"');
  assert.ok(inspiration !== -1 && inspiration < composer);
  assert.match(CSS, /\.xv-fullscreen-inspiration\s*\{[^}]*position:\s*static[^}]*margin:\s*0 auto/);
  assert.match(CSS, /\.xv-terminal-dock--fullscreen\.xv-terminal-dock--idle\s*\{[^}]*overflow-y:\s*auto/);
  assert.match(DOCK, /'\/ launch-ready product from one clear brief'/);
  assert.doesNotMatch(DOCK, /Try a command/);
});

test('repository status is brief and is not replayed during passive restore', () => {
  assert.match(REPO, /}, 1800\)/);
  assert.match(REPO, /announce = true/);
  assert.match(REPO, /analyzeRepo\(defaultRepo, branch, false, false\)/);
});

test('templates stay collapsed until requested, then open a scrollable categorized catalog', () => {
  assert.doesNotMatch(WELCOME, /<details|xv-ws-fold/);
  assert.match(TEMPLATES, /xv-workspace-template-catalog/);
  assert.match(TEMPLATES, /TEMPLATE_COLLECTIONS\.map/);
  assert.match(TEMPLATES, /Explore inspiration/);
  assert.match(TEMPLATES, /const \[expanded, setExpanded\] = useState\(false\)/);
  assert.match(TEMPLATES, /aria-expanded=\{expanded\}/);
  assert.match(TEMPLATES, /\{expanded \? \(/);
  assert.match(TEMPLATES, /Explore when ready/);
  assert.match(TEMPLATES, /Close inspiration/);
  assert.match(TEMPLATES, /Recent builds/);
  assert.match(TEMPLATES, /Community templates/);
  assert.match(TEMPLATES, /Xroga templates/);
  assert.match(TEMPLATES, /Browse all/);
  assert.doesNotMatch(TEMPLATES, /duplicate|template-marquee|railPaused/);
  assert.match(TEMPLATES, /role="dialog"/);
  assert.match(TEMPLATES, /Full preview/);
  assert.match(TEMPLATES, /Use prompt &amp; ship/);
  assert.match(TEMPLATES, /setPrompt\(prompt\)/);
  assert.match(TEMPLATES, /selected GitHub repository/);
  assert.match(CSS, /\.xv-workspace-template-catalog\s*\{[^}]*display:\s*flex/);
  assert.match(CSS, /\.xv-workspace-template-card\s*\{[^}]*flex-direction:\s*column[^}]*width:\s*clamp\(190px,\s*24vw,\s*226px\)/);
  assert.match(CSS, /\.xv-workspace-templates\s*\{[^}]*width:\s*100%[^}]*max-width:\s*100%[^}]*border:\s*1px solid[^}]*border-radius:\s*14px/);
  assert.match(CSS, /\.xv-workspace-template-viewport\s*\{[^}]*width:\s*100%[^}]*max-width:\s*100%[^}]*overflow-x:\s*auto/);
});

test('the empty workspace uses an editorial action lockup above the canonical composer', () => {
  assert.match(WELCOME, /xv-welcome-editorial/);
  assert.match(WELCOME, /xv-welcome-editorial__build/);
  assert.match(WELCOME, /xv-welcome-composer-kicker/);
  assert.match(WELCOME, /Describe it\./);
  assert.match(WELCOME, /Build it\./);
  assert.match(WELCOME, /Ship it\./);
  assert.match(WELCOME, /Turn an idea into something live\./);
  assert.match(CSS, /\.xv-welcome-editorial\s*\{[^}]*display:\s*grid[^}]*text-transform:\s*uppercase/);
  assert.match(CSS, /\.xv-welcome-editorial__build\s*\{[^}]*background:\s*color-mix/);
  assert.match(CSS, /\.xv-welcome-composer-kicker\s*\{[^}]*text-align:\s*left[^}]*text-transform:\s*uppercase/);
  assert.match(CSS, /\.xv-dashboard-welcome--composer\s*\{[^}]*margin:\s*0 auto 0\.12rem/);
  assert.match(DOCK, /<DashboardWelcome displayName=\{displayName\} composer \/>[\s\S]*?<div className="xv-chatbar-stack relative">/);
  assert.match(WELCOME, /\{!composer \? \(/, 'the first-run checklist should not crowd the composer welcome');
  assert.match(DOCK, /WorkspaceShowcaseStarts className="xv-workspace-showcase-below-fold"/);
  assert.match(CSS, /\.xv-workspace-showcase-below-fold\s*\{[^}]*margin-top:\s*clamp\(12rem,\s*30vh,\s*22rem\)/);
  assert.doesNotMatch(WELCOME, /One prompt|>Yours</);
  assert.doesNotMatch(WELCOME, /Good morning|Good afternoon|Good evening|Good night/);
  assert.doesNotMatch(WELCOME, /xv-blackhole-identity/);
  assert.doesNotMatch(WELCOME, /first[\s\S]*last[\s\S]*model you will ever need/i);
});

test('the composer uses a short inner signal for entry, typing, and uploads, never hover', () => {
  assert.match(CSS, /\.xv-terminal-dock \.xv-chatbar-solid::before\s*\{[^}]*inset:\s*0[^}]*padding:\s*2px[^}]*mask-composite:\s*exclude/);
  assert.match(CSS, /\.xv-terminal-dock \.xv-chatbar-solid\.xv-chatbar--inner-active::before/);
  assert.match(CSS, /animation:\s*xv-chatbar-inner-signal 1\.5s/);
  assert.doesNotMatch(CSS, /\.xv-chatbar-solid:hover::before/);
  assert.doesNotMatch(CSS, /xv-chatbar-ambient-halo/);
  assert.match(CHATBAR, /triggerComposerSignal\(2400\)/);
  assert.match(CHATBAR, /triggerComposerSignal\(900\)/);
  assert.match(CHATBAR, /triggerComposerSignal\(1800\)/);
  assert.match(CHATBAR, /composerSignal[^\n]*xv-chatbar--inner-active/);
});

test('the composer identity uses a deterministic shortened real display name', () => {
  assert.match(WELCOME, /displayName\.trim\(\)\.split\(\/\\s\+\/\)\[0\]\?\.slice\(0, 12\)/);
  assert.match(WELCOME, /Signed in as \$\{shortName\}/);
  assert.doesNotMatch(WELCOME, /getTimeGreetingKey|useHydrated|useLocale/);
});

test('an untouched terminal hides transcript and checklist noise behind the starter', () => {
  assert.match(CSS, /\.xv-terminal-scroll\[data-conversation='false'\] \.xv-term-empty/);
  assert.match(CSS, /\.xv-terminal-scroll\[data-conversation='false'\] \.xv-first-run-checklist/);
});
