/** Exact owner-bound Expo reads. Raw store private-key transfer is denied
 * by the original Command010 policy. Store keys are configured directly in Expo. */
import{requireTenantContext,requireResourceOwner,type TenantContext}from'../../security/tenantContext.js';
import{AuthorityError}from'../../security/authority/enforce.js';
import{EgressDenied}from'../../security/egress/egressPolicy.js';
import{publicHttpsUrl}from'../../security/egress/urlPolicy.js';
import{captureExpoAccess,beforeExpoRequest,readExpoResponse,verifyExpoProject,requireExpoAccess,validExpoId,type ExpoAccess,type ExpoQuery}from'./expoAccess.js';
import{verifyExpoStoreReadiness,type ExpoStoreResult}from'./expoStoreReadiness.js';
const EXPO_API='https://api.expo.dev';

/** Match Expo scaffold package/bundle: com.xroga.<slug> */
export function packageIdFromProjectName(name?: string | null): string {
  const slug = String(name || 'app')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '')
    .slice(0, 30);
  return `com.xroga.${slug || 'app'}`;
}

async function expoFetch(token:string,path:string,init:RequestInit|undefined,access:ExpoAccess):Promise<{ok:boolean;status:number;json:unknown;text:string}>{
 const signal=await beforeExpoRequest(access,token,path,init);
 let response:Response;
 try{response=await fetch(`${EXPO_API}${path}`,{...init,redirect:'manual',signal,headers:{...(init?.headers??{}),Authorization:`Bearer ${token}`,Accept:'application/json','Content-Type':'application/json'}});}catch{await access.check();if(signal.aborted)throw new DOMException('Expo request cancelled.','AbortError');throw new Error('Expo request is unavailable. No automatic retry was made.');}
 return readExpoResponse(access,response);
}
async function expoGraphql<T>(token:string,query:string,variables:Record<string,unknown>|undefined,access:ExpoAccess):Promise<T>{
 const response=await expoFetch(token,'/graphql',{method:'POST',body:JSON.stringify({query,variables})},access);
 const body=response.json as{data?:T}|null;
 if(!response.ok||!body?.data)throw new Error('Expo read is unavailable.');return body.data;
}
const queryFor=(access:ExpoAccess):ExpoQuery=>(query,variables)=>expoGraphql(access.token,query,variables,access);
interface StoreInput{userId:string;tenantContext?:TenantContext;signal?:AbortSignal;projectId?:string;projectName?:string}
export async function syncGooglePlayCredentialsToExpo(opts:StoreInput&{applicationIdentifier?:string}):Promise<ExpoStoreResult>{
 return verifyExpoStoreReadiness({...opts,identifier:opts.applicationIdentifier?.trim()||(opts.projectName?packageIdFromProjectName(opts.projectName):undefined)},'android',queryFor);
}
export async function syncAppleAscApiKeyToExpo(opts:StoreInput&{bundleIdentifier?:string}):Promise<ExpoStoreResult>{
 return verifyExpoStoreReadiness({...opts,identifier:opts.bundleIdentifier?.trim()||(opts.projectName?packageIdFromProjectName(opts.projectName):undefined)},'ios',queryFor);
}

export type EasBuildInfo = {
  id: string;
  projectId?: string;
  status: string;
  platform?: string;
  artifactUrl?: string;
  buildDetailsPageUrl?: string;
  createdAt?: string;
};

/** Read only the selected authenticated owner's provider project. Security
 * denial and malformed/foreign receipts never cause protocol fallback. */
export async function listEasBuilds(opts:{userId:string;tenantContext?:TenantContext;signal?:AbortSignal;projectId?:string;limit?:number;_access?:ExpoAccess}):Promise<EasBuildInfo[]>{
 opts={...opts};const context=requireTenantContext(opts.tenantContext);requireResourceOwner(context,opts.userId);
 const access=opts._access?requireExpoAccess(opts._access,context):await captureExpoAccess(opts.userId,context,opts.signal);
 try{
  const projectId=opts.projectId?.trim()||await access.pin('expo_project_id');if(!projectId)return[];
  if(!validExpoId(projectId))throw new AuthorityError('EXPO_PROJECT_ADMISSION_DENIED');
  const query=queryFor(access);await verifyExpoProject(access,query,projectId);
  const limit=Math.max(1,Math.min(100,Math.trunc(opts.limit??10)));
  const response=await expoFetch(access.token,`/v2/projects/${projectId}/builds?limit=${limit}&offset=0`,undefined,access);
  if(response.ok){
   const rows=(response.json as{data?:unknown}|null)?.data,result=verifiedBuilds(rows,projectId);
   if(!Array.isArray(rows)||result.length!==rows.length)throw new EgressDenied('INVALID_EGRESS_INPUT');
   return result;
  }
  if(![404,405,503].includes(response.status))throw new Error('Expo builds are unavailable.');
  const result=await query<{app?:{byId?:{id?:string;builds?:unknown}}}>('query XrogaExpoBuilds($appId: String!, $limit: Int!) { app { byId(appId: $appId) { id builds(offset: 0, limit: $limit, filter: {}) { id app { id } status platform createdAt artifacts { buildUrl } } } } }',{appId:projectId,limit});
  const rows=result.app?.byId?.builds,builds=verifiedBuilds(rows,projectId);
  if(result.app?.byId?.id!==projectId||!Array.isArray(rows)||builds.length!==rows.length)throw new EgressDenied('INVALID_EGRESS_INPUT');
  return builds;
 }finally{if(!opts._access)access.close();}
}

function verifiedBuilds(value:unknown,projectId:string):EasBuildInfo[]{
  if(!Array.isArray(value))return [];
  const result:EasBuildInfo[]=[];
  for(const row of value){
    if(!row||!validExpoId(row.id)||row.app?.id!==projectId||typeof row.status!=='string'||!['NEW','IN_QUEUE','IN_PROGRESS','PENDING','PENDING_CANCEL','PENDING_UPLOAD','REQUESTED','ERRORED','ERRORED_WAITING','ERROR','FINISHED','CANCELED','CANCELLED'].includes(row.status.toUpperCase())
      ||!['ANDROID','IOS'].includes(String(row.platform).toUpperCase())||typeof row.createdAt!=='string'||!Number.isFinite(Date.parse(row.createdAt)))return [];
    const artifact=row.artifacts?.buildUrl||row.artifacts?.applicationArchiveUrl;
    if(artifact!=null){try{publicHttpsUrl(artifact);}catch{return [];}}
    result.push({id:row.id,projectId,status:row.status,platform:row.platform,createdAt:row.createdAt,artifactUrl:artifact,
      buildDetailsPageUrl:`https://expo.dev/projects/${encodeURIComponent(projectId)}/builds/${encodeURIComponent(row.id)}`});
  }
  return new Set(result.map(row=>row.id)).size===result.length?result:[];
}

export async function waitForEasBuildArtifact(opts: {
  userId: string;
  tenantContext?:TenantContext;
  signal?:AbortSignal;
  projectId?: string;
  platform?: 'android' | 'ios';
  timeoutMs?: number;
  intervalMs?: number;
  /** Build IDs that already existed at dispatch — ignore finished ones among these */
  ignoreBuildIds?: string[];
  /** Only accept builds created at/after this ms epoch (when known) */
  startedAfterMs?: number;
  onProgress?: (msg: string) => void;
}): Promise<{
  ok: boolean;
  build?: EasBuildInfo;
  message: string;
}> {
  opts={...opts,ignoreBuildIds:opts.ignoreBuildIds?[...opts.ignoreBuildIds]:undefined};
  const context=requireTenantContext(opts.tenantContext);requireResourceOwner(context,opts.userId);
  const access=await captureExpoAccess(opts.userId,context,opts.signal);
  try{
  const projectId=opts.projectId?.trim()||await access.pin('expo_project_id');
  if(projectId&&!validExpoId(projectId))throw new AuthorityError('EXPO_PROJECT_ADMISSION_DENIED');
  if(!projectId)return {ok:false,message:'No EAS project selected for build polling.'};
  const timeoutMs = Math.max(1,Math.min(12*60*1000,opts.timeoutMs??12*60*1000));
  const intervalMs = Math.max(1,Math.min(60000,opts.intervalMs??20000));
  if(!Number.isFinite(timeoutMs)||!Number.isFinite(intervalMs))throw new EgressDenied('INVALID_EGRESS_INPUT');
  const started = Date.now();
  const startedAfterMs = opts.startedAfterMs ?? started - 30_000;
  let attempt = 0;

  // Snapshot baseline if caller didn't pass one
  let ignore = new Set(opts.ignoreBuildIds || []);
  if (opts.ignoreBuildIds === undefined) {
    const prior = await listEasBuilds({ userId: opts.userId,tenantContext:context,signal:opts.signal,_access:access, projectId, limit: 8 });
    ignore = new Set(prior.map((b) => b.id));
  }

  while (Date.now() - started < timeoutMs) {
    attempt += 1;
    opts.onProgress?.(
      `Waiting for EAS ${opts.platform || ''} build artifact (check ${attempt})…`,
    );
    const builds = await listEasBuilds({ userId: opts.userId,tenantContext:context,signal:opts.signal,_access:access, projectId, limit: 12 });

    const platformMatch = (b: EasBuildInfo) =>
      !opts.platform || (b.platform || '').toLowerCase()===opts.platform;

    const isNewEnough = (b: EasBuildInfo) => {
      const created=Date.parse(b.createdAt??'');
      return b.projectId===projectId && !ignore.has(b.id) && Number.isFinite(created) && created>=startedAfterMs;
    };

    const inFlight = builds.find((b) => {
      const status = (b.status || '').toUpperCase();
      return (
        platformMatch(b) &&
        isNewEnough(b) &&
        /NEW|IN_QUEUE|IN_PROGRESS|PENDING|ERRORED_WAITING|REQUESTED/i.test(status)
      );
    });

    const finishedNew = builds.find((b) => {
      const status = (b.status || '').toUpperCase();
      const finished = status === 'FINISHED' || status === 'finished';
      return finished && platformMatch(b) && isNewEnough(b);
    });

    if (finishedNew) {
      return {
        ok: true,
        build: finishedNew,
        message: finishedNew.artifactUrl
          ? `EAS build finished — install/download: ${finishedNew.artifactUrl}`
          : `EAS build finished — open ${finishedNew.buildDetailsPageUrl}`,
      };
    }

    // Only fail on a *new* errored build (not an old one from baseline)
    const failedNew = builds.find((b) => {
      if (!platformMatch(b) || !isNewEnough(b)) return false;
      return /ERROR|ERRORED|CANCELED|CANCELLED/i.test(b.status || '');
    });
    if (failedNew && attempt > 2 && !inFlight) {
      return {
        ok: false,
        build: failedNew,
        message: `EAS build ${failedNew.status}. Open ${failedNew.buildDetailsPageUrl}`,
      };
    }

    await expoPollingPause(intervalMs,opts.signal);
  }

  return {
    ok: false,
    message:
      'EAS build still running — open expo.dev builds for the install link when green. Xroga will not fake a finished binary.',
  };
  }finally{access.close();}
}

function expoPollingPause(ms:number,signal?:AbortSignal):Promise<void>{
 signal?.throwIfAborted();return new Promise((resolve,reject)=>{
  const finish=()=>{signal?.removeEventListener('abort',abort);resolve();};
  const timer=setTimeout(finish,ms),abort=()=>{clearTimeout(timer);signal?.removeEventListener('abort',abort);reject(new AuthorityError('EXPO_POLL_CANCELLED'));};
  signal?.addEventListener('abort',abort,{once:true});if(signal?.aborted)abort();
 });
}
