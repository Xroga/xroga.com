import {createHash} from 'node:crypto';
import {attachedGceIdentity,type GceApi} from '../sandbox/google/gceMachineControl.js';
import {verifyAttachedGoogleIdentity} from '../synthesis/projectRuntime/googleFactory.js';

export interface GoogleDispatchConfiguration {
  project:string;
  region:string;
  queue:string;
  job:string;
  dispatcherUrl:string;
  dispatchAccount:string;
  runtimeAccount:string;
  image:string;
  sourceSha:string;
  kmsKeyName:string;
}
export class GoogleDispatchError extends Error {
  constructor(readonly code:'DISPATCH_CONFIGURATION_INVALID'|'DISPATCH_IDENTITY_DENIED'|'DISPATCH_UNAVAILABLE'|'DISPATCH_JOB_NOT_ADMITTED'|'DISPATCH_RESULT_UNVERIFIED'){
    super(code);this.name='GoogleDispatchError';
  }
}
const refuse=(code:GoogleDispatchError['code']):never=>{throw new GoogleDispatchError(code);};
const uuid=/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/;
export function validateGoogleDispatchConfiguration(c:GoogleDispatchConfiguration):void{
  const account=(value:string)=>value.endsWith('@'+c.project+'.iam.gserviceaccount.com')&&/^[a-z][a-z0-9-]{5,29}@/.test(value);
  let url:URL;try{url=new URL(c.dispatcherUrl);}catch{return refuse('DISPATCH_CONFIGURATION_INVALID');}
  if(!/^[a-z][a-z0-9-]{4,28}[a-z0-9]$/.test(c.project)||!/^us-(?:east4|central1)$/.test(c.region)
    ||!/^xroga-canonical-[a-z0-9-]+$/.test(c.queue)||!/^xroga-canonical-[a-z0-9-]+$/.test(c.job)
    ||!account(c.dispatchAccount)||!account(c.runtimeAccount)||!/[a-f0-9]{40}/.test(c.sourceSha)||c.sourceSha.length!==40
    ||!c.image.startsWith(`us-east4-docker.pkg.dev/${c.project}/cloud-run-source-deploy/`)
    ||!new RegExp('^projects/'+c.project+'/locations/[a-z0-9-]+/keyRings/[A-Za-z0-9_-]+/cryptoKeys/[A-Za-z0-9_-]+$').test(c.kmsKeyName)
    ||!/@sha256:[a-f0-9]{64}$/.test(c.image)||url.protocol!=='https:'||!url.hostname.endsWith('.run.app')
    ||url.port||url.username||url.password||url.search||url.hash||url.pathname!=='/internal/canonical-dispatch')refuse('DISPATCH_CONFIGURATION_INVALID');
}
export function googleDispatchConfiguration(env:Readonly<NodeJS.ProcessEnv>=process.env):GoogleDispatchConfiguration{
  const c={project:env.XROGA_GCE_PROJECT??'',region:env.XROGA_GOOGLE_DISPATCH_REGION??'',queue:env.XROGA_GOOGLE_TASK_QUEUE??'',
    job:env.XROGA_GOOGLE_WORKER_JOB??'',dispatcherUrl:env.XROGA_GOOGLE_DISPATCH_URL??'',
    dispatchAccount:env.XROGA_GOOGLE_DISPATCH_ACCOUNT??'',runtimeAccount:env.XROGA_GCE_SERVICE_ACCOUNT??'',
    image:env.XROGA_GOOGLE_WORKER_IMAGE??'',sourceSha:env.XROGA_RELEASE_SHA??'',kmsKeyName:env.XROGA_GOOGLE_CLOUD_KMS_KEY_NAME??''};
  validateGoogleDispatchConfiguration(c);return Object.freeze(c);
}
function status(error:unknown):number|undefined{
  const e=error as {response?:{status?:number}};return e?.response?.status;
}

/** Google delivery transport only. It never plans work, issues actor authority,
 * accepts a prompt or decides whether a canonical run may be retried. Callers
 * must supply a previously persisted, fenced delivery ID. */
export class GoogleCanonicalDispatch {
  private readonly c:GoogleDispatchConfiguration;
  constructor(configuration:GoogleDispatchConfiguration,
    private readonly api:GceApi=attachedGceIdentity(),
    private readonly identity:(account:string)=>Promise<void>=verifyAttachedGoogleIdentity){
    validateGoogleDispatchConfiguration(configuration);this.c=Object.freeze({...configuration});
  }
  private async native(){try{await this.identity(this.c.runtimeAccount);}catch{return refuse('DISPATCH_IDENTITY_DENIED');}}
  private delivery(value:string){if(!uuid.test(value))refuse('DISPATCH_CONFIGURATION_INVALID');return value;}
  async enqueue(deliveryId:string):Promise<{taskName:string;duplicate:boolean}>{
    this.delivery(deliveryId);await this.native();
    const parent=`projects/${this.c.project}/locations/${this.c.region}/queues/${this.c.queue}`;
    const taskName=parent+'/tasks/'+createHash('sha256').update('xroga-canonical:'+deliveryId).digest('hex');
    const task={name:taskName,dispatchDeadline:'60s',httpRequest:{httpMethod:'POST',url:this.c.dispatcherUrl,
      headers:{'Content-Type':'application/json'},body:Buffer.from(JSON.stringify({deliveryId})).toString('base64'),
      oidcToken:{serviceAccountEmail:this.c.dispatchAccount,audience:new URL(this.c.dispatcherUrl).origin}}};
    try{
      const {data}=await this.api.request<{name?:string}>({url:`https://cloudtasks.googleapis.com/v2/${parent}/tasks`,
        method:'POST',data:{task,responseView:'BASIC'},retry:false,timeout:15000});
      if(data.name!==taskName)return refuse('DISPATCH_RESULT_UNVERIFIED');
      return{taskName,duplicate:false};
    }catch(error){
      // Google retains explicit task IDs after delivery. Duplicate does not
      // certify execution or completion. The durable delivery row decides that.
      if(status(error)===409)return{taskName,duplicate:true};
      if(error instanceof GoogleDispatchError)throw error;return refuse('DISPATCH_UNAVAILABLE');
    }
  }
  async launch(deliveryId:string):Promise<{operationName:string}>{
    this.delivery(deliveryId);await this.native();
    const jobName=`projects/${this.c.project}/locations/${this.c.region}/jobs/${this.c.job}`;
    try{
      const {data:job}=await this.api.request<{name?:string;etag?:string;reconciling?:boolean;labels?:Record<string,string>;template?:{taskCount?:number;parallelism?:number;
        template?:{serviceAccount?:string;timeout?:string;maxRetries?:number;containers?:{name?:string;image?:string;command?:string[];args?:string[];env?:{name:string;value?:string}[]}[]}}}>
        ({url:'https://run.googleapis.com/v2/'+jobName,method:'GET',retry:false,timeout:10000});
      const spec=job.template?.template,container=spec?.containers?.[0];
      if(job.name!==jobName||!job.etag||job.reconciling||job.labels?.['xroga-source-sha']!==this.c.sourceSha||job.template?.taskCount!==1||job.template?.parallelism!==1
        ||spec?.serviceAccount!==this.c.runtimeAccount||spec.maxRetries!==0||spec.timeout!=='3600s'
        ||spec.containers?.length!==1||container?.image!==this.c.image||container.name!=='worker'
        ||JSON.stringify(container.command)!==JSON.stringify(['node','dist/scripts/runCanonicalWorker.js'])
        ||container.env?.some(e=>e.name==='XROGA_RELEASE_SHA')
        ||Object.entries({NODE_ENV:'production',XROGA_RUNTIME_ROLE:'canonical-worker',
          XROGA_PROJECT_RUNTIME_PROVIDER:'google-gce',XROGA_BACKGROUND_EXECUTION_PROVIDER:'google-jobs',
          XROGA_CREDENTIAL_KMS_PROVIDER:'google_cloud',XROGA_GOOGLE_CLOUD_AUTH_MODE:'metadata_adc',XROGA_GOOGLE_CLOUD_KMS_KEY_NAME:this.c.kmsKeyName})
          .some(([name,value])=>{const values=container.env?.filter(e=>e.name===name);return values?.length!==1||values[0]?.value!==value;}))return refuse('DISPATCH_JOB_NOT_ADMITTED');
      await this.native();
      const {data}=await this.api.request<{name?:string;error?:unknown}>({url:'https://run.googleapis.com/v2/'+jobName+':run',
        method:'POST',data:{etag:job.etag,overrides:{taskCount:1,timeout:'3600s',containerOverrides:[{name:'worker',args:[deliveryId]}]}},
        retry:false,timeout:15000});
      if(data.error||!data.name?.startsWith(`projects/${this.c.project}/locations/${this.c.region}/operations/`)
        ||!/^projects\/[a-z0-9-]+\/locations\/[a-z0-9-]+\/operations\/[a-zA-Z0-9_-]+$/.test(data.name))return refuse('DISPATCH_RESULT_UNVERIFIED');
      return{operationName:data.name};
    }catch(error){if(error instanceof GoogleDispatchError)throw error;return refuse('DISPATCH_UNAVAILABLE');}
  }
}
