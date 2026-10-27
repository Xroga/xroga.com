import {executionBinding,type GceExecutionHandle,type GceMachineControl} from '../../sandbox/google/gceMachineControl.js';
import type {ProjectRuntimeSession} from '../projectRuntime/types.js';
import type {LivePreviewGrant} from './types.js';
import {authorizedPreviewSession} from './access.js';

/** Called only after the gateway verifies the persisted grant's signature.
 * This grants routing to one declared port, never command or tenant authority.
 * An address stored in JSON or supplied by a browser is never an upstream. */
export async function googlePreviewTarget(grant:LivePreviewGrant,session:ProjectRuntimeSession|null,
  control:Pick<GceMachineControl,'configuration'|'resolve'>,nativeIdentity:()=>Promise<void>,clock=Date.now):Promise<{host:string;port:number}|null> {
  if(!authorizedPreviewSession(grant,session,clock())||session.providerId!=='google-gce')return null;
  try {
    const handle=session.providerState.gce as GceExecutionHandle|undefined;
    if(!handle||handle.runtimeId!==session.sessionId)return null;
    const binding=executionBinding({runtimeId:session.sessionId,ownerReference:grant.userId,scopeReference:grant.projectId,
      ttlSeconds:60,memoryMb:128,diskMb:64,maxProcesses:16,cpus:1});
    const configuration=control.configuration;
    if(handle.ownerBinding!==binding.ownerBinding||handle.projectBinding!==binding.projectBinding
      ||session.providerState.project!==configuration.project||session.providerState.zone!==configuration.zone
      ||session.providerState.baseImageId!==configuration.imageId||!session.image||!configuration.admittedImages.includes(session.image))return null;
    await nativeIdentity();
    const target=await control.resolve(structuredClone(handle));
    if(!/^10\.90\.0\.(?:[2-9]|[1-5][0-9]|6[0-2])$/.test(target.privateIp))return null;
    if(!authorizedPreviewSession(grant,session,clock()))return null;
    return {host:target.privateIp,port:grant.port!};
  }catch{return null;}
}
