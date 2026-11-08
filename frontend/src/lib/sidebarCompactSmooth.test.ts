import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';

const sidebar=readFileSync(new URL('../components/layout/SidebarProjectHistory.tsx',import.meta.url),'utf8');
const title=readFileSync(new URL('../components/layout/SidebarMovingTitle.tsx',import.meta.url),'utf8');
const css=readFileSync(new URL('../components/layout/SidebarOrganize.css',import.meta.url),'utf8');
const visible=sidebar.slice(sidebar.indexOf('  return <div className="mt-2 mb-1'),sidebar.indexOf('    <SidebarActionMenu point='));

test('Projects, conditional Pinned and Recents are compact text-first rows',()=>{
  assert.match(visible, /<h2 className=\{sectionTitle\}><button[^>]*>Projects/);
  assert.match(visible, /pinnedItems\.length>0\?<section/);
  assert.match(visible, /<h2 className=\{sectionTitle\}>Recents<\/h2>/);
  assert.doesNotMatch(visible, /<MessageSquare|<FolderOpen/);
  assert.match(sidebar, /function renderRow\(kind:SidebarKind,id:string,label:string,open:\(\)=>void,pinned:boolean\)/);
  assert.match(sidebar, /text-\[10px\] font-normal leading-\[1\.35\]/);
  assert.match(sidebar, /aria-label=\{label\}/);
  assert.match(sidebar, /<SidebarMovingTitle text=\{label\}/);
});
test('Recents starts compact and auto-reveals more on scroll',()=>{
  assert.match(sidebar,/useState\(12\)/);
  assert.match(visible,/standaloneRecents\.slice\(0,shownRecents\)\.map/);
  assert.match(sidebar,/new IntersectionObserver\(entries=>/);
  assert.match(sidebar,/recentsEndRef/);
  assert.match(sidebar,/rootMargin:'0px 0px 140px 0px'/);
  assert.match(sidebar,/loadingOlderRecentsRef\.current/);
  assert.doesNotMatch(visible,/View more recents|Load older recents|Show fewer/);
  assert.doesNotMatch(visible,/View all chats|Show fewer chats/);
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
  assert.match(sidebar, /aria-label=\{'More options for '\+label\}/);
  assert.match(sidebar, /\{id:'pin',label:metaOf\(menu\.kind,menu\.id\)/);
  assert.match(sidebar, /aria-haspopup="menu"/);
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

test('chat menu uses the workspace edge, a title and a document portal',()=>{
  const menu=readFileSync(new URL('../components/layout/SidebarActionMenu.tsx',import.meta.url),'utf8');
  assert.match(sidebar,/closest\('\.xv-sidebar-floating'\)/);
  assert.match(sidebar,/title=\{menu\?\.kind==='conversation'/);
  assert.match(menu,/createPortal\(/);
  assert.match(menu,/window\.innerWidth<640/);
  assert.match(menu,/xv-sidebar-work-menu__title/);
});
