import test from 'node:test';
import assert from 'node:assert/strict';
import {connectReviewUrl} from './xrogaConnect';

test('connection consent navigation accepts only the existing local UUID review route',()=>{
 const reviewUrl='/dashboard/actions/confirm/11111111-1111-4111-8111-111111111111';
 assert.equal(connectReviewUrl({needsConfirmation:true,reviewUrl,message:'Review exact action'}),reviewUrl);
 for(const value of ['https://attacker.example'+reviewUrl,'//attacker.example'+reviewUrl,reviewUrl+'?redirect=https://attacker.example',reviewUrl+'#credential','javascript:alert(1)','/dashboard/actions/confirm/../settings'])assert.throws(()=>connectReviewUrl({needsConfirmation:true,reviewUrl:value,message:'Untrusted text'}));
});
