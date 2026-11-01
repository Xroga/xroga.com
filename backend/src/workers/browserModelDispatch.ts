import type { ModelId } from '../ai/models.js';
import { requireModelSdkAdmission } from '../ai/modelSdkAdmission.js';
import { withTenantModelReservation, requireModelProjectBinding } from '../ai/tenantModelDispatch.js';
import { resolveEndpoint, createModelProviderClient, snapshotModelEgressPayload } from '../ai/openaiCompat.js';
import { PostCompletionAccountingError } from '../ai/postCompletionAccounting.js';
import { requireTenantContext, requireResourceOwner, type TenantContext } from '../security/tenantContext.js';
import type { BrowserJob } from './browserJob.js';
import { containsCredentialSecretText } from '../security/egress/dataClassification.js';

/** Kept only in the API process. Never serialized into a worker job or rebuilt
 * from IDs supplied by a browser host. The canonical handler supplies the lease
 * guard, while the canonical model boundary independently checks current owner.
 */
export interface BrowserModelAuthority {
  context: TenantContext;
  revalidate: () => Promise<void>;
}
export interface BrowserModelClient {
  model: string;
  create: (body: Record<string, unknown>, opts: {signal:AbortSignal}) => Promise<any>;
}
export function requireBrowserModelAuthority(job:BrowserJob,authority:BrowserModelAuthority|undefined):BrowserModelAuthority {
  const context=requireTenantContext(authority?.context);
  requireResourceOwner(context,job.userId);requireResourceOwner(context,job.tenantId);
  if(typeof authority?.revalidate!=='function')throw Object.assign(Error('Browser model authority is unavailable.'),{code:'MODEL_DISPATCH_BINDING_DENIED'});
  if(job.projectId.startsWith('user:')&&job.projectId!==`user:${context.userId}`)
    throw Object.assign(Error('Browser model ownership is invalid.'),{code:'MODEL_DISPATCH_BINDING_DENIED'});
  return {context,revalidate:authority.revalidate};
}

export async function dispatchBrowserModel(input:{job:BrowserJob;authority:BrowserModelAuthority|undefined;signal:AbortSignal;
  modelId:ModelId;body:Record<string,unknown>&{messages:unknown;tools?:unknown};estimatedInputTokens:number;maximumOutputTokens:number;
  idempotencyKey:string;client?:()=>BrowserModelClient}):Promise<any>{
  const job=structuredClone(input.job);
  const authority=requireBrowserModelAuthority(job,input.authority);
  const scope={context:authority.context,userId:authority.context.userId,
    ...(!job.projectId.startsWith('user:')?{projectId:job.projectId}:{})};
  const signal=input.signal,checkCancellation=()=>signal.throwIfAborted();
  const current=async()=>{checkCancellation();await authority.revalidate();checkCancellation();};
  // Snapshot the entire provider body, including schemas and tool descriptions.
  // No page content can replace the body while ownership/budget checks await.
  const body=snapshotModelEgressPayload(input.body,'');
  await current();
  const result=await withTenantModelReservation({scope,modelId:input.modelId,
    payload:{messages:body.messages,tools:body.tools},estimatedInputTokens:input.estimatedInputTokens,
    maximumOutputTokens:input.maximumOutputTokens,idempotencyKey:input.idempotencyKey,
    execute:async dispatch=>{
      const endpoint=resolveEndpoint(input.modelId,dispatch.credentialOverride);
      const request=snapshotModelEgressPayload({...body,model:endpoint.apiModel,messages:dispatch.payload.messages,
        ...(dispatch.payload.tools?{tools:dispatch.payload.tools}:{})},endpoint.apiKey);
      const wire=JSON.stringify(request);
      const beforeDispatch=async(serialized:string)=>{await current();await dispatch.beforeDispatch(serialized);await current();};
      const admission=requireModelSdkAdmission(dispatch.beforeDispatch,input.modelId,dispatch.credentialOverride);
      // Keep the existing no-retry browser policy. Ordinary provider outages can
      // recover through a later authorized call, security/accounting denials cannot.
      const client=input.client?.();
      if(client&&client.model!==endpoint.apiModel)throw Object.assign(Error('Browser model destination changed.'),{code:'MODEL_DISPATCH_BINDING_DENIED'});
      await beforeDispatch(wire);
      const completion=client?await client.create(request,{signal}):await createModelProviderClient(endpoint,beforeDispatch).chat.completions.create(request as never,{signal,maxRetries:0});
      const inputTokens=completion?.usage?.prompt_tokens,outputTokens=completion?.usage?.completion_tokens;
      const reasoningTokens=completion?.usage?.completion_tokens_details?.reasoning_tokens??0;
      const providerRequestId=completion?.id;
      if(![inputTokens,outputTokens,reasoningTokens].every(n=>Number.isSafeInteger(n)&&n>=0)||reasoningTokens>outputTokens
        ||typeof providerRequestId!=='string'||! /^[A-Za-z0-9_.:/-]{1,200}$/.test(providerRequestId)
        ||containsCredentialSecretText(providerRequestId)||(endpoint.apiKey.length>=8&&providerRequestId.includes(endpoint.apiKey)))throw new PostCompletionAccountingError();
      const usage={modelId:input.modelId,inputTokens,outputTokens:outputTokens-reasoningTokens,reasoningTokens,providerRequestId};
      admission.complete(usage,()=>{},checkCancellation);
      return {...usage,completion};
    }});
  // Settlement can await I/O too. Denied ownership/cancellation never publishes
  // an already completed answer or authorizes a second provider request.
  await requireModelProjectBinding(scope);await current();
  return result.completion;
}
