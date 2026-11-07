import {z} from 'zod';
import {preparedActionDigest} from '../../security/authority/digest.js';
import {requireTenantContext,type TenantContext} from '../../security/tenantContext.js';
import {getStorageService,actorFromTenantContext} from '../../storage/runtime.js';
import type {SafeBusinessActionConfirmation} from './businessActionConfirmations.js';
import {publicCompletionState} from '../../ai/completionDiagnostics.js';

const resultSchema=z.object({version:z.literal(1),confirmationId:z.string().uuid(),taskId:z.string().uuid(),text:z.string().min(1).max(180_000),
 finishReason:z.string(),providerRequestId:z.string().min(1).max(200),modelId:z.literal('claude_sonnet_5_5'),apiModel:z.literal('claude-sonnet-5-5'),provider:z.literal('zurelay')}).strict();
const filename=(id:string)=>`model-result-${z.string().uuid().parse(id)}.json`;
export function requireModelResultStorage(){const storage=getStorageService();if(!storage)throw Error('Private model result storage is unavailable');return storage;}
export async function saveModelResult(context:TenantContext,id:string,text:string,digest:string,projectId:string|null){
 requireTenantContext(context);const result=resultSchema.parse(JSON.parse(text));
 if(result.confirmationId!==id||Buffer.byteLength(text)>262144||preparedActionDigest(JSON.parse(text))!==digest)throw Error('Model result receipt mismatch');
 await requireModelResultStorage().putServerObject(actorFromTenantContext(context),{projectId,objectClass:'artifact',filename:filename(id),contentType:'application/json',body:Buffer.from(text)});
}
/** Reading a completed confirmation has no inference/reservation side effect.
 * Digest comes from the owner-scoped durable effect receipt, never the object. */
export async function readModelResult(context:TenantContext,confirmation:SafeBusinessActionConfirmation){
 requireTenantContext(context);
 if(confirmation.toolkit!=='zurelay'||confirmation.toolSlug!=='model.execute'||confirmation.status!=='consumed'
  ||confirmation.receipt?.outcome!=='provider_reported_success'||!confirmation.receipt.resultDigest)return null;
 const storage=requireModelResultStorage(),actor=actorFromTenantContext(context);
 for(const object of await storage.listObjects(actor,{safeFilename:filename(confirmation.id),limit:100})){
  const {bytes}=await storage.readObjectBytes(actor,object.id,262144);
  try{
   const raw=JSON.parse(bytes.toString('utf8'));if(preparedActionDigest(raw)!==confirmation.receipt.resultDigest)continue;
   const result=resultSchema.parse(raw);if(result.confirmationId!==confirmation.id)continue;
   return {confirmationId:confirmation.id,receiptId:confirmation.receipt.id,text:result.text,
    completion:publicCompletionState(result.finishReason,result.text)};
  }catch{continue;}
 }
 return null;
}
