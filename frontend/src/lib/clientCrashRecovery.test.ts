import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
const read=(p:string)=>readFileSync(new URL(p,import.meta.url),'utf8');

test('sidebar navigation is isolated from root route error with a nondestructive retry',()=>{
 const shell=read('../components/layout/Sidebar.tsx');
 const boundary=read('../components/layout/SidebarHistoryErrorBoundary.tsx');
 assert.match(shell,/<SidebarHistoryErrorBoundary>[\s\S]*?<SidebarProjectHistory expanded=\{navExpanded\}/);
 assert.match(boundary,/static getDerivedStateFromError/);
 assert.match(boundary,/failed: false/);
 assert.doesNotMatch(boundary,/clearStorage|localStorage\.clear|clearWorkspaceSession|deleteTerminalHistory/);
});
test('homepage dot animation is optional and client chunk recovery is bounded',()=>{
 const home=read('../components/homepage/HomepageClient.tsx');
 const global=read('../app/global-error.tsx');
 assert.match(home,/<OptionalVisualErrorBoundary><SharedDotBackdrop \/><\/OptionalVisualErrorBoundary>/);
 assert.match(global,/chunkloaderror/);
 assert.match(global,/sessionStorage\.setItem\(key, String\(Date\.now\(\)\)\)/);
 assert.match(global,/2 \* 60 \* 1000/);
 assert.doesNotMatch(global,/localStorage\.clear|clearWorkspaceSession/);
});
