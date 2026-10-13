import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createCanonicalExecutionState,restoreOwnerBoundExecutionState } from './executionRuntime.js';

const state=createCanonicalExecutionState({runId:'run',projectId:'logical-project'});
const row={user_id:'owner',run_id:'run',project_id:'logical-project',state};
test('restored canonical state is cloned only for its durable owner/run/project',()=>{
  const result=restoreOwnerBoundExecutionState(row,'owner','run');assert.deepEqual(result,state);assert.notEqual(result,state);
});
test('canonical resume rejects foreign owner and misbound embedded run/project',()=>{
  for(const invalid of [null,[],{...row,user_id:'other'},{...row,run_id:'other'},{...row,project_id:'other'},{...row,state:[]},{...row,state:{...state,runId:'other'}},{...row,state:{...state,projectId:'other'}}]) assert.equal(restoreOwnerBoundExecutionState(invalid,'owner','run'),null);
});
