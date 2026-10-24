import { createHash, randomUUID } from 'node:crypto';
import { assertAuthorityPermit } from '../authority/enforce.js';
import { ACTION_CLASSES } from '../authority/types.js';
import { canonicalAuthorityJson, preparedActionDigest } from '../authority/digest.js';
import { requireTenantContext } from '../tenantContext.js';
import { publicHttpsUrl } from './urlPolicy.js';
import { classifyOutboundData } from './dataClassification.js';
import { POLICY_VERSION, type EgressInput, type SecurityDecision } from './types.js';

const hash = (value: string) => createHash('sha256').update(value).digest('hex');
const issued = new WeakSet<object>();
export function requireIssuedSecurityDecision(value: SecurityDecision): void {
  if(!issued.has(value))throw Error('Original security decision required.');
}
/** Synchronous decision over a snapshot. URL admission here is syntactic only.
 * Arbitrary-network effects MUST use the DNS-pinned URL transport separately. */
export function decideEgress(input: EgressInput): Readonly<SecurityDecision> {
  const actor = requireTenantContext(input.context);
  const binding = JSON.parse(canonicalAuthorityJson(input.binding));
  const payload = JSON.parse(canonicalAuthorityJson(input.payload));
  const data = classifyOutboundData(payload, input.declaredClass);
  const base:Omit<SecurityDecision,'decision'|'reason'> = {id:randomUUID(),version:POLICY_VERSION,userId:actor.userId,tenantId:actor.tenantId,
    correlationId:actor.correlationId,classification:data.classification,payloadDigest:data.digest,
    bindingDigest:hash(canonicalAuthorityJson(binding)),destinationDigest:hash(String(input.destination)),
    recipientDigest:hash(String(input.recipient)),purposeDigest:hash(String(input.purpose))};
  const result = (decision: SecurityDecision['decision'],reason: SecurityDecision['reason']) => {
    const receipt=Object.freeze({...base,decision,reason});issued.add(receipt);return receipt;
  };
  if (!ACTION_CLASSES.includes(input.actionClass) || binding.userId !== actor.userId
    || [input.destination,input.recipient,input.purpose].some(v=>typeof v!=='string'||!v||v.length>8192)
    || !binding.connectedAccountId || !binding.provider || !binding.operation
    || binding.targetDigest!==preparedActionDigest(payload)) return result('DENY','INVALID_EGRESS_INPUT');
  if (data.classification === 'CREDENTIAL_SECRET') return result('DENY','SECRET_EGRESS_DENIED');
  if (input.fileOwners?.some(owner=>owner!==actor.userId)) return result('DENY','FOREIGN_FILE_OWNER');
  try { publicHttpsUrl(input.destination); } catch { return result('DENY','UNSAFE_DESTINATION'); }
  // Nested URL values can be executed by an external tool. Syntax/private
  // literals are denied here; DNS-sensitive tool destinations remain pending
  // adapter-specific review and are NOT certified by this scan.
  const urls = (v: unknown): void => {
    if (typeof v==='string' && /^\w+:\/\//.test(v)) publicHttpsUrl(v);
    else if (Array.isArray(v)) v.forEach(urls);
    else if (v && typeof v==='object') Object.values(v).forEach(urls);
  };
  try { urls(payload); } catch { return result('DENY','UNSAFE_DESTINATION'); }
  if (input.toolTrust === 'UNTRUSTED_CAPABILITY_METADATA') return result('REQUIRE_RESTRICTED_SANDBOX','UNTRUSTED_TOOL_REQUIRES_SANDBOX');
  if (input.actionClass !== 'READ' || data.classification !== 'PUBLIC') {
    try { assertAuthorityPermit(input.authorityPermit,binding); }
    catch { return result('REQUIRE_APPROVAL','EXACT_AUTHORITY_REQUIRED'); }
  }
  return result('ALLOW','EXACT_BOUNDARY_ALLOWED');
}

export class EgressDenied extends Error {
  constructor(readonly reason: SecurityDecision['reason']) {super('External action denied by security policy.');}
}

/** Receipt must complete before effect admission. A slow/failed store never
 * becomes ALLOW. Authority is revalidated/consumed by the original adapter after
 * this wait, not replaced by an egress decision or a receipt ID. */
export async function enforceEgress(input: EgressInput, persist: (receipt: Readonly<SecurityDecision>)=>Promise<void>): Promise<Readonly<SecurityDecision>> {
  const receipt = decideEgress(input);
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([persist(receipt),new Promise<never>((_,reject)=>{
      timer=setTimeout(()=>reject(new Error('Security evidence unavailable.')),2000);
    })]);
  } catch {throw new Error('Security evidence unavailable.');}
  finally {if(timer)clearTimeout(timer);}
  if(receipt.decision!=='ALLOW')throw new EgressDenied(receipt.reason);
  return receipt;
}
