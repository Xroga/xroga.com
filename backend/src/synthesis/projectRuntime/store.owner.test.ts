/** Durable snapshot identity binding, not a full runtime session schema validation. */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { restoreOwnerBoundRuntimeSession } from './store.js';

const state={userId:'owner',sessionId:'session',projectId:'logical-project',providerState:{fixture:true}};
const row={user_id:'owner',session_id:'session',project_id:'logical-project',state};
test('restored runtime snapshot retains and clones an exactly bound owner/session/project',()=>{
  const restored=restoreOwnerBoundRuntimeSession(row,'owner','session');assert.deepEqual(restored,state);assert.notEqual(restored,state);
});
test('misbound row or JSON cannot supply another tenant runtime authority',()=>{
  for(const invalid of [null,[],{...row,user_id:'other'},{...row,session_id:'other'},{...row,project_id:'other'},{...row,state:[]},{...row,state:{...state,userId:'other'}},{...row,state:{...state,sessionId:'other'}},{...row,state:{...state,projectId:'other'}},{...row,state:{}}]) assert.equal(restoreOwnerBoundRuntimeSession(invalid,'owner','session'),null);
});
