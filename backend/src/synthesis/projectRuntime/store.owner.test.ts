/** Durable snapshot identity binding, not a full runtime session schema validation. */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { restoreOwnerBoundRuntimeSession, restoreOwnerBoundProjectRevision } from './store.js';

const state={userId:'owner',sessionId:'session',projectId:'logical-project',providerState:{fixture:true}};
const row={user_id:'owner',session_id:'session',project_id:'logical-project',state};
test('restored runtime snapshot retains and clones an exactly bound owner/session/project',()=>{
  const restored=restoreOwnerBoundRuntimeSession(row,'owner','session');assert.deepEqual(restored,state);assert.notEqual(restored,state);
});
test('misbound row or JSON cannot supply another tenant runtime authority',()=>{
  for(const invalid of [null,[],{...row,user_id:'other'},{...row,session_id:'other'},{...row,project_id:'other'},{...row,state:[]},{...row,state:{...state,userId:'other'}},{...row,state:{...state,sessionId:'other'}},{...row,state:{...state,projectId:'other'}},{...row,state:{}}]) assert.equal(restoreOwnerBoundRuntimeSession(invalid,'owner','session'),null);
});

const project={projectId:'project',runId:'run',contract:{projectId:'project',runId:'run'},workspace:{files:[]}};
const revision={user_id:'owner',project_id:'project',run_id:'run',revision_id:'revision',revision_number:1,workspace_fingerprint:'fixture',created_at:'2026-10-15T00:00:00Z',software_project:project};
test('revision restore binds row, snapshot and outcome contract identities and clones the snapshot',()=>{
  const restored=restoreOwnerBoundProjectRevision(revision,'owner','project');
  assert.ok(restored);assert.deepEqual(restored.project,project);assert.notEqual(restored.project,project);
  assert.equal(restored.userId,'owner');assert.equal(restored.runId,'run');
});
test('revision restore rejects foreign owner, project, run and malformed snapshot/contract without replacing identifiers',()=>{
  const snapshots=[null,[],{}, {...project,projectId:'foreign'}, {...project,runId:'foreign'}, {...project,contract:null}, {...project,contract:[]}, {...project,contract:{}}, {...project,contract:{...project.contract,projectId:'foreign'}}, {...project,contract:{...project.contract,runId:'foreign'}}];
  for(const invalid of [null,[],{...revision,user_id:'foreign'},{...revision,project_id:'foreign'},{...revision,run_id:''},{...revision,run_id:'foreign'},...snapshots.map(software_project=>({...revision,software_project}))]) assert.equal(restoreOwnerBoundProjectRevision(invalid,'owner','project'),null);
});
