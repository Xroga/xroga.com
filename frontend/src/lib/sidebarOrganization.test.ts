import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { meaningfulSidebarTitle, visiblePage, sortPinned } from './sidebarOrganization';

const read=(p:string)=>readFileSync(new URL(p,import.meta.url),'utf-8');
const sidebar=read('../components/layout/SidebarProjectHistory.tsx');
const migration=read('../../../supabase/migrations/20261021233500_sidebar_organization.sql');

test('legacy numbered terminal titles migrate from actual prompt, without inventing context',()=>{
 assert.equal(meaningfulSidebarTitle('#1 terminal','Fix login using Supabase'), 'Fix login using Supabase');
 assert.equal(meaningfulSidebarTitle('Terminal #4','Improve analytics dashboard'), 'Improve analytics dashboard');
 assert.equal(meaningfulSidebarTitle('#3 terminal',''),'Untitled conversation');
 assert.equal(meaningfulSidebarTitle('Manually edited title','Another prompt'),'Manually edited title');
 assert.equal(meaningfulSidebarTitle('','  A genuine work request  '),'A genuine work request');
});

test('project and pinned limits are stable with large histories',()=>{
 const p=Array.from({length:25},(_,i)=>i+1);
 assert.deepEqual(visiblePage(p,5),[1,2,3,4,5]);
 assert.equal(visiblePage(p,10).length,10);
 const pins=Array.from({length:40},(_,i)=>({id:i,pin_order:40000-i*1000}));
 assert.equal(sortPinned(pins)[0].id,39);
 assert.equal(visiblePage(sortPinned(pins),10).length,10);
 assert.equal(visiblePage(sortPinned(pins),40).length,40);
});

test('account-scoped migration enforces RLS and atomic pin swapping',()=>{
 for(const name of ['xroga_sidebar_items','xroga_sidebar_sections','xroga_sidebar_chats']){
  assert.match(migration,new RegExp('alter table public\\.'+name+' enable row level security'));
 }
 assert.match(migration,/auth\.uid\(\)/);
 assert.match(migration,/security invoker/);
 assert.match(migration,/for update/);
 assert.match(migration,/grant execute on function public\.xroga_swap_sidebar_pins/);
});

test('real history, conditional pins, project paging, right-click, and contextual controls',()=>{
 assert.match(sidebar,/Pinned.*?/);
 assert.match(sidebar,/\{pinnedItems\.length>0\?/);
 // Pagination uses a functional update, preventing stale double-click increments.
 assert.match(sidebar,/onClick=\{\(\)=>setShownPins\(prev=>prev\+10\)\}/);
 assert.match(sidebar,/pinnedItems\.slice\(0,shownPins\)/);
 assert.match(sidebar,/shownPins>10[\s\S]*?setShownPins\(10\)/);
 assert.match(sidebar,/loadSidebarProjects\(accountId,offset,6\)/);
 assert.match(sidebar,/renderRow\('conversation'/);
 assert.match(sidebar,/onContextMenu=\{event=>openMenu/);
 assert.match(sidebar,/\?conversation=/);
 assert.match(sidebar,/swapSidebarPins/);
 assert.match(sidebar,/SidebarActionMenu/);
 assert.doesNotMatch(sidebar,/Chat below to create/);
});

test('legacy backfill SQL is unbroken, reversible, and modifies titles only',()=>{
 const matches=migration.match(/update public\.terminal_sessions/g)||[];
 assert.equal(matches.length,2);
 assert.match(migration,/on conflict \(session_id\) do nothing;/);
 assert.match(migration,/original_title/);
 assert.match(migration,/set title=left\(regexp_replace\(btrim\(prompt\)/);
 assert.doesNotMatch(migration,/terminal\s*\n-- Manually/);
 assert.match(migration,/where title ~\* '[^'\n]+'\s+on conflict \(session_id\) do nothing;/);
});

test('unscoped browser cache cannot appear as another account history or migrate without verified IDs',()=>{
 assert.match(sidebar,/verifiedIdsForHistory/);
 assert.match(sidebar,/verifiedIds\.has\(e\.id\)/);
 assert.match(sidebar,/verifiedIds\.has\(e\.id\)\)/);
 assert.doesNotMatch(sidebar,/Opened terminal — start chatting or building/);
});
