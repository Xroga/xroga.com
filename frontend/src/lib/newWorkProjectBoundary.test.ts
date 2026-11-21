import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { belongsToProject, isRecentWithoutProject } from './sidebarConversationLocation';
import { passiveRepositorySelection } from './passiveRepositorySelection';

const read=(path:string)=>readFileSync(new URL(path,import.meta.url),'utf8');
const context=read('../context/TerminalChatContext.tsx');
const chatbar=read('../components/terminal/TerminalChatBar.tsx');
const sidebar=read('../components/layout/SidebarProjectHistory.tsx');
const repoBar=read('../components/terminal/RepoContextBar.tsx');

test('New Work resets both previous project and repository bindings',()=>{
 const start=context.slice(context.indexOf('const startNewChat = useCallback('),context.indexOf('const discardCurrentChat = useCallback('));
 assert.match(start,/clearActiveSidebarProject\(\);\s*clearSelectedRepoContext\(\);\s*markFreshTerminalIntent\(\)/);
});

test('ordinary prompts never invoke a GitHub account or repository gate',()=>{
 const check=chatbar.slice(chatbar.indexOf('async function ensureRepoWorkspace('),chatbar.indexOf('async function handleSubmit('));
 assert.doesNotMatch(check,/checkRepoWorkspaceReady|setRepoGate|api\.github\.status/);
 assert.match(check,/return true;/);
 assert.doesNotMatch(chatbar,/<RepoWorkspaceGateModal/);
});

test('Recents and Projects are separated only by explicit membership',()=>{
 assert.equal(belongsToProject(null,'project-a'),false);
 assert.equal(belongsToProject('project-a','project-a'),true);
 assert.equal(belongsToProject('project-b','project-a'),false);
 assert.equal(isRecentWithoutProject(null),true);
 assert.equal(isRecentWithoutProject('project-a'),false);
 assert.equal(isRecentWithoutProject('project-not-yet-paginated'),false);
 const recents=sidebar.slice(sidebar.indexOf('const standaloneRecents='),sidebar.indexOf('function conversationTitle'));
 assert.doesNotMatch(recents,/githubRepoName|github_repo_name/);
 const projects=sidebar.slice(sidebar.indexOf('const getProjectChats ='),sidebar.indexOf('const openedMenu='));
 assert.doesNotMatch(projects,/githubRepoName|\.repo/);
});

test('an account GitHub default does not bind a fresh conversation',()=>{
 const input={repositories:['owner/default'],selected:null,defaultRepository:'owner/default',fresh:false,projectSelected:false,repositoryLocked:true};
 assert.equal(passiveRepositorySelection(input),null);
 assert.equal(passiveRepositorySelection({...input,selected:'owner/default'}),'owner/default');
});

test('choosing the first repository preserves the current conversation',()=>{
 const choose=repoBar.slice(repoBar.indexOf('async function selectRepo('),repoBar.indexOf('function startWithNewRepository()'));
 assert.match(choose,/if \(previousKey && previousKey !== targetKey && messages\.length > 0\)/);
});

test('build-related prompts no longer create Projects automatically',()=>{
 assert.doesNotMatch(context,/shouldSaveToProjects\(|saveLocalProject\(/);
});
