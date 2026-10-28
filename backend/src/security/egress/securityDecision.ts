import { isDeepStrictEqual } from 'node:util';
import { requireTenantContext, type TenantContext } from '../tenantContext.js';
import { getTenantSupabaseAdmin } from '../serviceRoleGuard.js';
import type { SecurityDecision } from './types.js';
import { requireIssuedSecurityDecision } from './egressPolicy.js';

/** Reuse the existing immutable, server-only audit table. No new event store.
 * No arbitrary payload/URL/provider content may enter this fixed DTO. */
export async function persistSecurityDecision(context: TenantContext, receipt: Readonly<SecurityDecision>): Promise<void> {
  const actor=requireTenantContext(context);
  requireIssuedSecurityDecision(receipt);
  if(receipt.userId!==actor.userId||receipt.tenantId!==actor.tenantId||receipt.correlationId!==actor.correlationId)throw Error('Security receipt ownership mismatch.');
  for(const key of ['bindingDigest','destinationDigest','recipientDigest','payloadDigest','purposeDigest'] as const)
    if(!/^[a-f0-9]{64}$/.test(receipt[key]))throw Error('Invalid security receipt digest.');
  const row={id:receipt.id,user_id:actor.userId,actor_id:actor.userId,project_id:null,environment_id:null,
    action:'egress_decision',target_type:'egress_destination',target_id:receipt.destinationDigest,
    outcome:receipt.decision,reason:receipt.reason,correlation_id:actor.correlationId,evidence_reference:receipt.id,
    metadata:{policyVersion:receipt.version,reason:receipt.reason,classification:receipt.classification,
      bindingDigest:receipt.bindingDigest,destinationDigest:receipt.destinationDigest,recipientDigest:receipt.recipientDigest,
      payloadDigest:receipt.payloadDigest,purposeDigest:receipt.purposeDigest}};
  const {data,error}=await getTenantSupabaseAdmin(context).from('production_audit_log').insert(row)
    .select('id,user_id,actor_id,action,outcome,metadata').single();
  if(error||!data||data.id!==row.id||data.user_id!==actor.userId||data.actor_id!==actor.userId||data.action!==row.action
    ||data.outcome!==row.outcome||!isDeepStrictEqual(data.metadata,row.metadata))throw Error('Security receipt persistence unavailable.');
}
