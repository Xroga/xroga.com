/** Operator-only, single approved provider request. Not a web route or model authority issuer. */
export const SOURCE = '3bed89e65411fea9376bce0da8aacd1bd8c72f92';
export const PROJECT = '85730a9a-fca9-4eb8-aa89-4e9c6172e2c5';
export const OWNER_SHA256 = 'b176f6da5215efd572021fd19140e483df58bfe5e18bf1b755609e98dee201a3';
export const REQUEST = 'd29e5edc-6cb2-4e55-b0bf-1bd589de0372';
export const MODEL = 'deepseek_v4_1_flash_1017';
export const MAXIMUM_OUTPUT = 128;
export const ESTIMATED_INPUT = 1024;
export const messages = Object.freeze([
 {role:'system',content:'Return a JSON object only. Do not call tools or retrieve information.'},
 {role:'user',content:'Calculate 25 multiplied by 40. Return {"total": the numeric result}.'},
]);
const uuid=/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i;
const deny=()=>{throw Error('PROBE_PREREQUISITE_DENIED');};

export async function runSmoke(runtime,env) {
 const deadline=Date.parse(env.XROGA_ZURELAY_PROBE_EXPIRES_AT??'');
 const fresh=()=>{if(!Number.isFinite(deadline)||deadline<=Date.now()||deadline>Date.now()+30*60_000)deny();};
 fresh();
 if(env.XROGA_RELEASE_SHA!==SOURCE||env.XROGA_ZURELAY_PROBE_APPROVAL!==SOURCE
   ||env.CLOUD_RUN_JOB!=='xroga-zurelay-probe-1103'||env.NODE_ENV!=='production'
   ||!env.CLOUD_RUN_EXECUTION)deny();
 if(runtime.priceVersion!=='zurelay-2026-11-03-v2')deny();
 // The operator approves only the already-existing synthetic project, never a
 // request-supplied customer identity, prompt, attachment or repository.
 const owned=await runtime.readSyntheticProject(PROJECT);
 if(owned?.id!==PROJECT||!uuid.test(owned.user_id??'')||runtime.ownerHash(owned.user_id)!==OWNER_SHA256||owned.github_repo_name!==null)deny();
 const scope={context:runtime.persistedOwnerContext(owned.user_id),userId:owned.user_id,
   projectId:PROJECT,repository:null,connectedAccountId:'platform'};
 const maximum=runtime.estimate({modelId:MODEL,estimatedInputTokens:ESTIMATED_INPUT,maximumOutputTokens:MAXIMUM_OUTPUT});
 if(!Number.isSafeInteger(maximum)||maximum<1||maximum>1000)deny();
 const payload={messages:structuredClone(messages)};
 fresh();
 const result=await runtime.reserve({scope,modelId:MODEL,payload,estimatedInputTokens:ESTIMATED_INPUT,
   maximumOutputTokens:MAXIMUM_OUTPUT,idempotencyKey:REQUEST,purpose:'complexity',
   execute:dispatch=>{fresh();return runtime.complete(MODEL,dispatch.payload.messages,{
    maxTokens:MAXIMUM_OUTPUT,json:true,reasoningMode:'none',beforeDispatch:dispatch.beforeDispatch,
    credentialOverride:dispatch.credentialOverride,signal:AbortSignal.timeout(Math.min(45_000,Math.max(1,deadline-Date.now()))),
   });},
   validateResponse:result=>{
    if(result.modelId!==MODEL||result.apiModel!=='deepseek-v4.1-flash-1017'||result.provider!=='zurelay'
      ||result.finishReason!=='stop'||JSON.parse(result.text).total!==1000)throw Error('PROBE_OUTPUT_NOT_ACCEPTED');
   }});
 const cost=runtime.actualCost(result);
 if(!Number.isSafeInteger(cost)||cost<0||cost>maximum||!result.providerRequestId)throw Error('PROBE_RECEIPT_NOT_ACCEPTED');
 return {status:'PASS_SINGLE_JSON_PROVIDER_PROBE_NOT_WORKSPACE_ACCEPTANCE',source:SOURCE,modelId:result.modelId,
  apiModel:result.apiModel,provider:result.provider,providerRequestId:result.providerRequestId,
  inputTokens:result.inputTokens,outputTokens:result.outputTokens,cachedInputTokens:result.cachedInputTokens??0,
  reasoningTokens:result.reasoningTokens??0,catalogCostMicroUsd:cost,reservationCeilingMicroUsd:maximum,
  priceVersion:runtime.priceVersion,requestCount:1,strictJsonSchemaTested:false,streamingTested:false,
  operatorSyntheticProjectOnly:true,founderUiOrMfaAcceptance:false};
}

export async function main() {
 // Load the unchanged protected runtime before importing any provider/DB client.
 await import('file:///app/dist/runtime/installSafeLogging.js');
 await import('file:///app/dist/loadPlatformEnvironment.js');
 // The protected loader refuses duplicate configuration sources. Apply only
 // these approved probe-local routing restrictions after loading the unchanged
 // bundle and before constructing clients. Never write the bundle or API/Job.
 process.env.XROGA_ALLOWED_MODELS='deepseek_v4_1_flash_1017';
 process.env.XROGA_DISABLED_PROVIDERS='openrouter,moonshot,zhipu,xai,parallel';
 delete process.env.ZURELAY_JSON_SCHEMA_VERIFIED;
 const [db,tenant,dispatch,budget,sdk,crypto] = await Promise.all([
  import('file:///app/dist/config/supabase.js'),import('file:///app/dist/security/tenantContext.js'),
  import('file:///app/dist/ai/tenantModelDispatch.js'),import('file:///app/dist/ai/providerBudget.js'),
  import('file:///app/dist/ai/openaiCompat.js'),
  import('node:crypto'),
 ]);
 const receipt=await runSmoke({priceVersion:budget.PROVIDER_PRICE_VERSION,
  readSyntheticProject:async(id)=>{
   const {data,error}=await db.getSupabaseAdmin().from('projects').select('id,user_id,github_repo_name').eq('id',id).maybeSingle();
   if(error)deny();return data;
  },ownerHash:userId=>crypto.createHash('sha256').update(userId).digest('hex'),persistedOwnerContext:userId=>tenant.createTenantContext({userId,via:'persisted_owner'}),
  estimate:budget.estimateProviderReservationMicroUsd,reserve:dispatch.withTenantModelReservation,
  complete:sdk.chatCompletion,actualCost:result=>budget.actualProviderCostMicroUsd(result),
 },process.env);
 await new Promise((resolve,reject)=>process.stdout.write(JSON.stringify({zurelayProbe:receipt})+'\n',error=>error?reject(error):resolve()));
}
