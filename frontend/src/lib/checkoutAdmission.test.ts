import assert from 'node:assert/strict';import test from 'node:test';
import {requireCheckoutConfirmation,requireCheckoutDestination} from './checkoutAdmission';
test('checkout UI accepts only fresh exact checkout approvals and secure Whop destinations',()=>{
 const expected={id:'11111111-1111-4111-8111-111111111111',toolkit:'xroga-native-billing',toolSlug:'XROGA_CREATE_CHECKOUT',summary:'Create checkout link',expiresAt:new Date(Date.now()+60000).toISOString()};
 assert.deepEqual(requireCheckoutConfirmation(expected),expected);
 for(const changed of [{id:'../../../other'},{toolkit:'github'},{toolSlug:'DELETE_PROJECT'},{expiresAt:new Date(0).toISOString()},{summary:''}])assert.throws(()=>requireCheckoutConfirmation({...expected,...changed}));
 assert.equal(requireCheckoutDestination('https://whop.com/checkout/owned?session=one'),'https://whop.com/checkout/owned?session=one');
 for(const url of ['http://whop.com/','https://whop.com.evil.invalid/','javascript:alert(1)','https://a:b@whop.com/','https://whop.com:8443/','https://whop.com/#token','https://127.0.0.1/'])assert.throws(()=>requireCheckoutDestination(url));
});
