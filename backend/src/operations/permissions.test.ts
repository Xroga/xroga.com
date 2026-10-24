import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ownerBoundMembershipProjectIds } from './permissions.js';
const id='11111111-2222-4333-8444-555555555555';
test('legitimate persisted membership admits only its actual project owner',()=>{
  assert.deepEqual(ownerBoundMembershipProjectIds([{project_id:id,user_id:'owner',projects:{user_id:'owner'}}]),[id]);
  assert.deepEqual(ownerBoundMembershipProjectIds([{project_id:id,user_id:'owner',projects:[{user_id:'owner'}]}]),[id]);
});
test('foreign owner, missing or ambiguous parent and invalid query target deny membership',()=>{
  for(const row of [{project_id:id,user_id:'attacker',projects:{user_id:'owner'}},{project_id:id,user_id:'owner',projects:null},{project_id:id,user_id:'owner',projects:[]},{project_id:id,user_id:'owner',projects:[{user_id:'owner'},{user_id:'owner'}]},{project_id:id,user_id:undefined,projects:{}},{project_id:'uuid),user_id.neq.any',user_id:'owner',projects:{user_id:'owner'}}]) assert.deepEqual(ownerBoundMembershipProjectIds([row]),[]);
});
