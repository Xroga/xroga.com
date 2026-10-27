import {attachedGceIdentity, GceControlError, GceMachineControl, validateGceConfiguration, type GceExecutionConfiguration} from '../../sandbox/google/gceMachineControl.js';
import {GceSshTransport} from '../../sandbox/google/gceSshTransport.js';
import {googleRuntimeAdmission, runtimeAuthorityIdentity, type ProjectRuntimeAuthority} from './googleAuthority.js';
import {GoogleProjectRuntimeProvider} from './googleProvider.js';
import type {ProjectRuntimeStore} from './store.js';

export function googleProjectRuntimeSelected(env:Readonly<NodeJS.ProcessEnv>=process.env):boolean {
  const selected=env.XROGA_PROJECT_RUNTIME_PROVIDER;
  if(selected && !['fly','google-gce'].includes(selected))throw new GceControlError('PROJECT_RUNTIME_PROVIDER_INVALID');
  return selected==='google-gce';
}

/** Trusted deployment configuration only. Never read settings from a project,
 * prompt, session snapshot, secret scope or customer-provided environment. */
export function googleExecutionConfiguration(env:Readonly<NodeJS.ProcessEnv>=process.env):GceExecutionConfiguration {
  const configuration:GceExecutionConfiguration={project:env.XROGA_GCE_PROJECT??'',zone:env.XROGA_GCE_ZONE??'',
    subnet:env.XROGA_GCE_SUBNET??'',imageName:env.XROGA_GCE_BASE_IMAGE??'',imageId:env.XROGA_GCE_BASE_IMAGE_ID??'',
    serviceAccount:env.XROGA_GCE_SERVICE_ACCOUNT??'',
    admittedImages:(env.XROGA_GCE_ADMITTED_IMAGES??'').split(',').map(value=>value.trim()).filter(Boolean),
    maxConcurrentInstances:Number(env.XROGA_GCE_MAX_INSTANCES??'1')};
  validateGceConfiguration(configuration);
  return configuration;
}

export function googleRuntimeImageFor(adapterId:string,env:Readonly<NodeJS.ProcessEnv>=process.env):string {
  const configuration=googleExecutionConfiguration(env);
  const key=adapterId==='node'||adapterId==='static-web'?'NODE':adapterId==='python'?'PYTHON':adapterId==='rust'?'RUST':null;
  const image=key?env['XROGA_GCE_'+key+'_IMAGE']:undefined;
  if(!image||!configuration.admittedImages.includes(image))throw new GceControlError('GCE_RUNTIME_IMAGE_NOT_CONFIGURED');
  return image;
}

export async function verifyAttachedGoogleIdentity(account:string,request:typeof fetch=fetch):Promise<void> {
  try {
    const result=await request('http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/email',
      {headers:{'Metadata-Flavor':'Google'},redirect:'error',signal:AbortSignal.timeout(5000)});
    if(!result.ok || result.headers.get('metadata-flavor')!=='Google' || (await result.text()).trim()!==account)
      throw new Error('denied');
  }catch{throw new GceControlError('ATTACHED_RUNTIME_PRINCIPAL_MISMATCH');}
}

export function googleProjectRuntimeFromEnvironment(authority:ProjectRuntimeAuthority,store:ProjectRuntimeStore,
  env:Readonly<NodeJS.ProcessEnv>=process.env):GoogleProjectRuntimeProvider {
  runtimeAuthorityIdentity(authority);
  const configuration=googleExecutionConfiguration(env);
  const identity=attachedGceIdentity(env);
  const control=new GceMachineControl(configuration,identity);
  const nativeIdentity=()=>verifyAttachedGoogleIdentity(configuration.serviceAccount);
  const gate=googleRuntimeAdmission(authority,store);
  return new GoogleProjectRuntimeProvider({control,transport:new GceSshTransport(control,identity),
    defaultImage:env.XROGA_GCE_DEFAULT_IMAGE??'',nativeIdentity,
    admit:async scope=>{await gate(scope);await nativeIdentity();},
    persistAllocation:session=>store.saveSession(session)});
}
