import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';

const sidebar=readFileSync(new URL('../components/layout/SidebarProjectHistory.tsx',import.meta.url),'utf8');
const css=readFileSync(new URL('../components/layout/SidebarOrganize.css',import.meta.url),'utf8');
const visible=sidebar.slice(sidebar.indexOf('  return <div className="mt-2 mb-1'),sidebar.indexOf('    <SidebarActionMenu point='));

test('Projects, conditional Pinned and Recents are compact text-first rows',()=>{
  assert.match(visible, /<h2 className=\{sectionTitle\}>Projects<\/h2>/);
  assert.match(visible, /pinnedItems\.length>0\?<section/);
  assert.match(visible, /<h2 className=\{sectionTitle\}>Recents<\/h2>/);
  assert.doesNotMatch(visible, /<MessageSquare|<FolderOpen/);
  assert.match(sidebar, /function renderRow\(kind:SidebarKind,id:string,label:string,open:\(\)=>void,pinned:boolean\)/);
  assert.match(sidebar, /text-\[10px\] font-normal leading-\[1\.35\]/);
  assert.match(sidebar, /aria-label=\{label\}/);
  assert.match(sidebar, /<SidebarMovingTitle text=\{label\}/);
});
test('Recents renders at most twelve initially and grows only on user request',()=>{
  assert.match(sidebar, /useState\(12\)/);
  assert.match(visible, /recentConversations\.slice\(0,shownRecents\)\.map/);
  assert.match(visible, /setShownRecents\(prev=>prev\+12\)/);
  assert.match(visible, /onClick=\{\(\)=>setShownRecents\(12\)\}>Show fewer/);
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
  assert.match(sidebar, /aria-label=\{saved\?'Unpin '\+label:'Pin '\+label\}/);
  assert.match(sidebar, /aria-haspopup="menu"/);
  assert.match(css, /prefers-reduced-motion:reduce/);
});
