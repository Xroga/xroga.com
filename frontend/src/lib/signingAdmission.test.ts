import test from 'node:test';import assert from 'node:assert/strict';
import {requireSigningConfirmation,requireSigningConfirmations} from './signingAdmission';
test('signing UI requires current exact native approval and never accepts a completed write as preparation',()=>{
 const row={id:'11111111-1111-4111-8111-111111111111',summary:'Set CSC_LINK in the selected repository.',status:'pending',toolkit:'xroga-native-signing',toolSlug:'XROGA_SET_SIGNING_MATERIAL',expiresAt:new Date(Date.now()+60000).toISOString()};
 assert.deepEqual(requireSigningConfirmations([row]),[row]);
 for(const changed of [{status:'consumed'},{toolkit:'github'},{toolSlug:'DELETE_REPO'},{id:'untrusted'},{summary:''},{expiresAt:new Date(0).toISOString()}])assert.throws(()=>requireSigningConfirmation({...row,...changed}));
 for(const value of [null,[],[row,row],{ok:true,synced:['CSC_LINK']}])assert.throws(()=>requireSigningConfirmations(value));
});
