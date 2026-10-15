import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createCanonicalExecutionState,executableTasksFromRoutePlan,restoreOwnerBoundExecutionState } from './executionRuntime.js';
import {createIntelligentRoutePlan} from './intelligentRouter.js';
import {getRuntimeModelRegistry} from './modelCapabilityRegistry.js';

const state=createCanonicalExecutionState({runId:'run',projectId:'logical-project'});
const row={user_id:'owner',run_id:'run',project_id:'logical-project',repository_identity:state.repository,selected_branch:state.selectedBranch,starting_commit_sha:state.startingCommitSha,state};
test('restored canonical state is cloned only for its durable owner/run/project',()=>{
  const result=restoreOwnerBoundExecutionState(row,'owner','run');assert.deepEqual(result,state);assert.notEqual(result,state);
});

test('canonical recovery rejects row lineage mismatch and malformed executable snapshots',()=>{
  for(const patch of [{selected_branch:'other'},{starting_commit_sha:'foreign'},{repository_identity:{owner:'o',name:'r'}},
    {state:{...state,currentWorkingSnapshot:[{path:'a',content:123}]}},{state:{...state,tasks:null}},
    {state:{...state,tasks:[{id:'forged',status:'completed'}]}},{state:{...state,productManifest:null}},
    {state:{...state,updatedAt:'invalid'}},{state:{...state,databaseProjectId:{id:'foreign'}}}]){
    assert.equal(restoreOwnerBoundExecutionState({...row,...patch},'owner','run'),null);
  }
});
test('canonical resume rejects foreign owner and misbound embedded run/project',()=>{
  for(const invalid of [null,[],{...row,user_id:'other'},{...row,run_id:'other'},{...row,project_id:'other'},{...row,state:[]},{...row,state:{...state,runId:'other'}},{...row,state:{...state,projectId:'other'}}]) assert.equal(restoreOwnerBoundExecutionState(invalid,'owner','run'),null);
});

test('real generated task controls restore, duplicate task identity and invalid retry controls do not',()=>{
  const registry=getRuntimeModelRegistry().map(model=>({...model,configured:true,enabled:true}));
  const tasks=executableTasksFromRoutePlan(createIntelligentRoutePlan({prompt:'Build and test a small CLI',registry}));
  assert.ok(tasks.length);
  assert.ok(restoreOwnerBoundExecutionState({...row,state:{...state,tasks}},'owner','run'));
  for(const invalid of [[...tasks,tasks[0]], [{...tasks[0],status:'invented'}], [{...tasks[0],attempts:-1}],
    [{...tasks[0],retryPolicy:{...tasks[0].retryPolicy,maximumAttempts:0}}]]){
    assert.equal(restoreOwnerBoundExecutionState({...row,state:{...state,tasks:invalid}},'owner','run'),null);
  }
});
