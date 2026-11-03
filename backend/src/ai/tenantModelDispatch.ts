import {isDeepStrictEqual} from 'node:util';
import {randomUUID} from 'node:crypto';
import {requireTenantContext,requireResourceOwner,type TenantContext} from '../security/tenantContext.js';
import {requireOwnedProject} from '../security/ownership.js';
import {getTenantSupabaseAdmin} from '../security/serviceRoleGuard.js';
import {getUserProviderKey} from '../services/integrations/userProviderKeys.js';
import {assertAuthorityPermit, consumeAuthorityPermit} from '../security/authority/enforce.js';
import {assertModelSelection, type ModelEscalation} from './providerPolicy.js';
import {estimateProviderReservationMicroUsd} from './providerBudget.js';
import type {AuthorityPermit,AuthorityDispatchBinding} from '../security/authority/types.js';
import {preparedActionDigest} from '../security/authority/digest.js';
import {MODELS,assertActiveModelId,resolveModelSpec,type ModelId} from './models.js';
import {poolRoleFor} from './quota.js';
import {persistUsageAccounting} from './usageAccounting.js';
import {PostCompletionAccountingError} from './postCompletionAccounting.js';
import {registerModelSdkAdmission} from './modelSdkAdmission.js';
import {withProviderReservation,actualProviderCostMicroUsd,type ProviderUsageResult,type BudgetPurpose} from './providerBudget.js';
import {requireAdmittedRunAttempt,type AdmittedRunAttempt} from './runStore.js';

function denied():never{throw Object.assign(Error('Model dispatch binding is no longer valid.'),{code:'MODEL_DISPATCH_BINDING_DENIED',status:400});}
export interface ModelPayload {messages:unknown;tools?:unknown}
function containsImageInput(messages: unknown): boolean {
  if (!Array.isArray(messages)) return false;
  return messages.some(message => message && typeof message === 'object'
    && Array.isArray(message.content) && message.content.some((part: unknown) => part && typeof part === 'object'
      && 'type' in part && (part.type === 'image_url' || part.type === 'input_image' || part.type === 'image')));
}
export interface TenantModelScope {
  escalation?: ModelEscalation;
  context:TenantContext;
  userId:string;
  /** A real database project UUID, never a logical workspace/repository key. */
  projectId?:string;
  /** Expected canonical projects.github_repo_name, null for a local project. */
  repository?:string|null;
  runAttempt?:AdmittedRunAttempt;
  /** Omit to select the current canonical user key, otherwise platform. */
  connectedAccountId?:string;
  authority?:{permit:AuthorityPermit;binding:AuthorityDispatchBinding};
}
export interface BoundModelDispatch {
  readonly payload:ModelPayload;
  readonly credentialOverride:string|undefined;
  readonly beforeDispatch:(wireBody:string)=>Promise<void>;
}
type CredentialRow={user_id:string;provider:string;access_token:string;metadata:Record<string,unknown>;credential_revision:string};

/** Namespace only, never an identity issuer or a second context store. */
export function modelContextNamespace(projectId:string|undefined,repository:string|null|undefined):string|null{
  return projectId?`_project/${projectId}/${repository?.includes('/')?repository:'_local'}`:repository??null;
}

export async function requireModelProjectBinding(scope:TenantModelScope):Promise<void>{
  const context=requireTenantContext(scope.context);requireResourceOwner(context,scope.userId);
  if(scope.projectId===undefined)return;
  if(!/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(scope.projectId))denied();
  const db=getTenantSupabaseAdmin(context);
  if(scope.repository===undefined){try{await requireOwnedProject(context,scope.projectId,db);}catch{denied();}return;}
  const {data,error}=await db.from('projects').select('id,user_id,github_repo_name').eq('id',scope.projectId).eq('user_id',context.userId).maybeSingle();
  if(error||!data||data.id!==scope.projectId||data.user_id!==context.userId||data.github_repo_name!==scope.repository)denied();
}

/** Carries existing tenant, credential-revision and budget authority through one
 * model request. No new grants, ledger, vault or model-selected authority.
 * This boundary cannot certify arbitrary upstream payload provenance or URLs
 * fetched internally by a provider. Other callers must migrate explicitly.
 */
export async function withTenantModelReservation<T extends ProviderUsageResult>(input:{
  scope:TenantModelScope;modelId:ModelId;payload:ModelPayload;
  estimatedInputTokens:number;maximumOutputTokens:number;
  purpose?:BudgetPurpose;
  idempotencyKey?:string;
  validateResponse?:(result:T)=>void;
  execute:(dispatch:BoundModelDispatch)=>Promise<T>;
}):Promise<T>{
  assertActiveModelId(input.modelId);
  const context=requireTenantContext(input.scope?.context);
  requireResourceOwner(context,input.scope.userId);
  const scope={...input.scope,context,authority:input.scope.authority?{...input.scope.authority,binding:{...input.scope.authority.binding}}:undefined};
  const modelId=input.modelId,model=resolveModelSpec(modelId),provider=MODELS[modelId].provider;
  // An advertised modality remains unavailable until verified for this exact
  // endpoint. Reject before reservation instead of dropping the attachment.
  if (containsImageInput(input.payload.messages) && !model?.supportsImages) {
    throw Object.assign(new Error('Image input is not yet verified for the configured model.'), {code:'MODEL_DESTINATION_DENIED',status:400});
  }
  const attempt=scope.runAttempt?requireAdmittedRunAttempt(scope.runAttempt):undefined;
  if(attempt)requireResourceOwner(context,attempt.userId);
  if(!model)denied();
  const apiModel=model.apiModel,maximumOutputTokens=input.maximumOutputTokens;
  const estimatedInputTokens=input.estimatedInputTokens,purpose=input.purpose;
  const reservationCeiling = estimateProviderReservationMicroUsd(input);
  assertModelSelection(modelId, reservationCeiling, scope.escalation);
  const payload=structuredClone(input.payload),execute=input.execute,validateResponse=input.validateResponse;
  // Bind the exact JSON wire representation. Optional tool-schema properties
  // with undefined values are omitted by the SDK, not changed user content.
  let expectedPayload:unknown;
  try{expectedPayload=JSON.parse(JSON.stringify({messages:payload.messages,tools:payload.tools??[]}));}
  catch{denied();}
  const expectedAccount=`apikey_${provider}`;
  if(scope.connectedAccountId!==undefined&&!['platform',expectedAccount].includes(scope.connectedAccountId))denied();
  const db=getTenantSupabaseAdmin(context);
  const execution=async()=>{
    if(!attempt)return;
    const {data,error}=await db.from('swarm_runs').select('id,user_id,project_id,status,worker_id,lease_generation')
      .eq('id',attempt.runId).eq('user_id',context.userId).maybeSingle();
    if(error||!data||data.id!==attempt.runId||data.user_id!==context.userId||data.status!=='running'
      ||data.worker_id!==attempt.workerId||data.lease_generation!==attempt.generation
      ||data.project_id!==(scope.projectId??null))denied();
  };
  const project=()=>requireModelProjectBinding(scope);
  const read=async():Promise<CredentialRow|null>=>{
    const {data,error}=await db.from('user_integrations').select('user_id,provider,access_token,metadata,credential_revision')
      .eq('user_id',context.userId).eq('provider',expectedAccount).maybeSingle();
    if(error)denied();
    if(!data)return null;
    if(data.user_id!==context.userId||data.provider!==expectedAccount)denied();
    return structuredClone(data) as CredentialRow;
  };
  await project();
  await execution();
  // Platforms remain explicit and don't inherit a user key discovered later.
  const selected=scope.connectedAccountId==='platform'?null:await read();
  const connected=scope.connectedAccountId===expectedAccount||Boolean(selected?.access_token&&selected.metadata?.revoked!==true);
  if(connected&&(typeof selected?.access_token!=='string'||!selected.access_token||selected.metadata?.revoked===true||!selected.access_token.startsWith('vault:v3:')
    ||typeof selected.credential_revision!=='string'||! /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(selected.credential_revision)))denied();
  const account=connected?expectedAccount:'platform';
  const checkAuthority=()=>{
    if (modelId === 'claude_sonnet_5_5' && (!scope.authority || scope.escalation?.permit !== scope.authority.permit
      || !isDeepStrictEqual(scope.escalation.binding, scope.authority.binding)
      || scope.escalation.binding.userId !== context.userId)) denied();
    if(!scope.authority)return;
    const binding=scope.authority.binding;
    const target = modelId === 'claude_sonnet_5_5'
      ? {modelId,apiModel,provider,baseUrl:model.baseUrl,maximumOutputTokens,reason:scope.escalation!.reason,taskId:scope.escalation!.taskId,payload}
      : payload;
    if(binding.userId!==context.userId||binding.provider!==provider||binding.connectedAccountId!==account
      ||binding.targetDigest!==preparedActionDigest(target))denied();
    assertAuthorityPermit(scope.authority.permit,binding);
  };
  checkAuthority();
  let sdk:ReturnType<typeof registerModelSdkAdmission>|undefined;
  const result=await withProviderReservation({userId:context.userId,modelId,
    escalation: scope.escalation,
    estimatedInputTokens,maximumOutputTokens,purpose,idempotencyKey:input.idempotencyKey,
    execute:async()=>{
      let active=true;
      try{
        // Read/decrypt through the canonical vault consumer only AFTER budget
        // admission. A revocation/rotation during reservation cannot reuse cache.
        const credential=connected?await getUserProviderKey(context.userId,provider):undefined;
        if(connected&&(!credential||!isDeepStrictEqual(await read(),selected)))denied();
        const beforeDispatch=async(wireBody:string)=>{
          if(!active)denied();
          const current = resolveModelSpec(modelId);
          assertActiveModelId(modelId);
          if (!current || !isDeepStrictEqual(current, model)) denied();
          const wire=JSON.parse(wireBody);
          if(wire.model!==apiModel||wire.max_tokens!==maximumOutputTokens
            ||!isDeepStrictEqual({messages:wire.messages,tools:wire.tools??[]},expectedPayload))denied();
          await project();
          await execution();
          if(connected&&!isDeepStrictEqual(await read(),selected))denied();
          await project();
          await execution();
          checkAuthority();
          assertModelSelection(modelId, reservationCeiling, scope.escalation);
          if (modelId === 'claude_sonnet_5_5') await consumeAuthorityPermit(scope.escalation!.permit, scope.escalation!.binding);
          if(!active)denied();
        };
        sdk=registerModelSdkAdmission(beforeDispatch,modelId,credential??undefined);
        const result=await execute({payload:structuredClone(payload),credentialOverride:credential??undefined,beforeDispatch});
        const completed=sdk.completion()?.result;
        if(completed&&['inputTokens','outputTokens','cachedInputTokens','reasoningTokens','providerRequestId','providerCostMicroUsd'].some(key=>
          result[key as keyof ProviderUsageResult]!==completed[key as keyof ProviderUsageResult]))throw new PostCompletionAccountingError();
        return result;
      }finally{active=false;sdk?.revoke();}
    }});
  const completion=sdk?.completion();
  if(completion){
    try {
      if(result.inputTokens!==completion.result.inputTokens||result.outputTokens!==completion.result.outputTokens
        ||result.providerCostMicroUsd!==completion.result.providerCostMicroUsd
        ||('modelId' in result&&result.modelId!==modelId))throw Error('Changed completion usage');
      await persistUsageAccounting(context,{receiptId:randomUUID(),modelId,poolRole:poolRoleFor(modelId),
        inputTokens:completion.result.inputTokens,outputTokens:completion.result.outputTokens,
        costUsd:actualProviderCostMicroUsd(completion.result)/1_000_000});
    }catch{throw new PostCompletionAccountingError();}
    completion.checkCancellation();validateResponse?.(result);completion.publish();
  }
  return result;
}
