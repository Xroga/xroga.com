import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';

const sidebar=readFileSync(new URL('../components/layout/SidebarProjectHistory.tsx',import.meta.url),'utf8');
const actionMenu=readFileSync(new URL('../components/layout/SidebarActionMenu.tsx',import.meta.url),'utf8');
const title=readFileSync(new URL('../components/layout/SidebarMovingTitle.tsx',import.meta.url),'utf8');
const css=readFileSync(new URL('../components/layout/SidebarOrganize.css',import.meta.url),'utf8');
const visible=sidebar.slice(sidebar.indexOf('  return <div className="mt-2 mb-1'),sidebar.indexOf('    <SidebarActionMenu point='));

test('Projects, conditional Pinned and Recents are compact text-first rows',()=>{
  assert.match(visible, /<h2 className=\{sectionTitle\}><button type="button"[^>]+onClick=\{\(\)=>router\.push\('\/dashboard\/projects'\)\} aria-label="View all projects">Projects <ChevronRight[^>]*\/><\/button><\/h2>/);
  assert.match(visible, /pinnedItems\.length>0\?<section/);
  assert.match(visible, /<h2 className=\{sectionTitle\}>Recents<\/h2>/);
  assert.doesNotMatch(visible, /<MessageSquare|<FolderOpen/);
  assert.match(sidebar, /function renderRow\(kind:SidebarKind,id:string,label:string,open:\(\)=>void,pinned:boolean\)/);
  assert.match(sidebar, /text-\[10px\] font-normal leading-\[1\.35\]/);
  assert.match(sidebar, /aria-label=\{label\}/);
  assert.match(sidebar, /<SidebarMovingTitle text=\{label\}/);
});
test('Recents starts with twelve rows and loads more near the end of the sidebar',()=>{
  assert.match(sidebar, /\[shownRecents,setShownRecents\] = useState\(12\)/);
  assert.match(visible, /standaloneRecents\.slice\(0,shownRecents\)\.map/);
  assert.match(visible, /\(standaloneRecents\.length>shownRecents\|\|moreCloudSessions\|\|moreSidebarChats\)\s*\?<div ref=\{recentsEndRef\}/);
  assert.match(sidebar, /sentinel\.closest<HTMLElement>\('\.xv-sidebar-nav-scroll'\)/);
  assert.match(sidebar, /if\(!entries\[0\]\?\.isIntersecting\|\|loadingOlderRecentsRef\.current\)return/);
  assert.match(sidebar, /setShownRecents\(count=>Math\.min\(standaloneRecents\.length,count\+24\)\)/);
  assert.match(sidebar, /else\{void loadMoreRecents\(\);\}/);
  assert.match(sidebar, /observer\.observe\(sentinel\)/);
  assert.match(sidebar, /return\(\)=>observer\.disconnect\(\)/);
});
test('metadata refresh is debounced and avoids repeated focus-triggered network calls',()=>{
  assert.match(sidebar,/lastSidebarFetchRef\.current>30000/);
  assert.match(sidebar,/window\.addEventListener\('xroga-sidebar-chats-changed',queue\)/);
  assert.match(sidebar,/},1200\)/);
  assert.doesNotMatch(sidebar,/window\.addEventListener\('focus',listener\)/);
  assert.match(sidebar,/const metaIndex=useMemo\(\(\)=>new Map/);
});
test('local history is parsed once per UI refresh rather than once for each saved ID',()=>{
  const localRefresh=sidebar.slice(sidebar.indexOf('  const refreshLocal = useCallback'),sidebar.indexOf('  const cloudRefreshTimer = useRef'));
  assert.match(localRefresh,/const localHistory=loadTerminalHistory\(\)/);
  assert.match(localRefresh,/const historyById=new Map/);
  assert.equal((localRefresh.match(/loadTerminalHistory\(\)/g)||[]).length,1);
});
test('row actions remain keyboard-reachable and titles respect reduced motion',()=>{
  assert.match(sidebar, /aria-label=\{'More options for '\+label\} aria-haspopup="menu"/);
  assert.match(actionMenu, /querySelector<HTMLButtonElement>\('button:not\(\[disabled\]\)'\)\?\.focus/);
  assert.match(actionMenu, /event\.key==='ArrowDown'\|\|event\.key==='ArrowUp'/);
  assert.match(actionMenu, /<button type="button" role="menuitem"/);
  assert.match(css, /prefers-reduced-motion:reduce/);
});

test('title hover rendering is isolated from unrelated sidebar parent renders',()=>{
  assert.match(title,/memo\(function SidebarMovingTitle/);
});

test('conversation rows use tightly spaced labels with safe mobile touch height',()=>{
 assert.match(sidebar,/text-left py-1 px-1\.5 rounded-md/);
 assert.match(css,/pointer:coarse/);
 assert.match(css,/min-height:32px/);
});
