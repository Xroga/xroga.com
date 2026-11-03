import test from 'node:test';
import assert from 'node:assert/strict';
import {createTenantContext} from '../security/tenantContext.js';
import {executeAuthorizedAction, consumeAuthorityPermit} from '../security/authority/enforce.js';
import {preparedActionDigest} from '../security/authority/digest.js';
import type {PreparedAuthorityScope,AuthorityDispatchBinding} from '../security/authority/types.js';
import {assertModelSelection, type ModelEscalation} from './providerPolicy.js';
import {estimateProviderReservationMicroUsd} from './providerBudget.js';

test('Sonnet uses the existing exact task spend permit, not a prompt reason, copied grant or global balance',async()=>{
  const userId='11111111-1111-4111-8111-111111111111';
  const scope:PreparedAuthorityScope={version:'1',userId,tenantId:userId,provider:'zurelay',connectedAccountId:'platform',operation:'model.execute',
    targetDigest:preparedActionDigest('synthetic exact request'),planDigest:'a'.repeat(64),actionClass:'PURCHASE_OR_SPEND',risk:'spend',projectId:null,runId:'synthetic-task',
    issuedAt:new Date(Date.now()-1000).toISOString(),expiresAt:new Date(Date.now()+60000).toISOString(),nonce:'synthetic-nonce',maxSpendMicroUsd:'10000',currency:'USD'};
  const binding:AuthorityDispatchBinding={userId,provider:scope.provider,connectedAccountId:scope.connectedAccountId,operation:scope.operation,targetDigest:scope.targetDigest,planDigest:scope.planDigest};
  const claim={id:'synthetic-claim',userId,scopeDigest:preparedActionDigest(scope),expiresAt:scope.expiresAt,claimedAt:new Date().toISOString()};
  let escaped:ModelEscalation|undefined;
  await executeAuthorizedAction({context:createTenantContext({userId,via:'remote_getuser'}),scope,claim,revalidateBeforeEffect:async()=>claim},async permit=>{
    const escalation:ModelEscalation={reason:'complex_multifile_debug',taskId:'synthetic-task',permit,binding};escaped=escalation;
    assert.doesNotThrow(()=>assertModelSelection('claude_sonnet_5_5',10000,escalation));
    assert.throws(()=>assertModelSelection('claude_sonnet_5_5',10001,escalation));
    assert.throws(()=>assertModelSelection('claude_sonnet_5_5',1000,{...escalation,taskId:'other'}));
    assert.throws(()=>assertModelSelection('claude_sonnet_5_5',1000,{...escalation,binding:{...binding,userId:'other'}}));
    assert.throws(()=>assertModelSelection('claude_sonnet_5_5',1000,{...escalation,permit:{...permit}}));
    await consumeAuthorityPermit(permit,binding);
    assert.throws(()=>assertModelSelection('claude_sonnet_5_5',1000,escalation));
  });
  assert.throws(()=>assertModelSelection('claude_sonnet_5_5',1000,escaped));
  assert.ok(estimateProviderReservationMicroUsd({modelId:'claude_sonnet_5_5',estimatedInputTokens:10000,maximumOutputTokens:1000})>=23700);
});
