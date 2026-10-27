import {assertCurrentRunAttempt, requireAdmittedRunAttempt, type AdmittedRunAttempt} from '../../ai/runStore.js';
import {requireTenantContext, type TenantContext} from '../../security/tenantContext.js';
import {requireOwnedResource} from '../../security/ownership.js';
import {resourceNotFound, TenantAccessError} from '../../security/tenantErrors.js';
import {projectWorkspaceFingerprint, type ProjectRuntimeStore} from './store.js';
import type {ProjectRuntimeSession} from './types.js';
import type {ProjectFile} from '../../ai/patches.js';

export type ProjectRuntimeAuthority = TenantContext | AdmittedRunAttempt;
export type GoogleRuntimeAction = 'create'|'restore'|'read'|'write'|'exec'|'start'|'stop'|'logs'|'destroy';
export interface GoogleRuntimeAdmission {
  readonly userId: string;
  readonly projectId: string;
  readonly action: GoogleRuntimeAction;
  readonly session?: ProjectRuntimeSession;
  readonly sourceFiles?: readonly ProjectFile[];
  readonly deletePaths?: readonly string[];
}
export type AdmitGoogleRuntime = (scope: GoogleRuntimeAdmission) => Promise<void>;

export function runtimeAuthorityIdentity(authority: ProjectRuntimeAuthority): {userId:string; attempt?:AdmittedRunAttempt; tenant?:TenantContext} {
  // A structural discriminator chooses the existing opaque issuer to validate.
  // There is no catch-and-create context or raw-user-ID authorization fallback.
  if (authority && typeof authority==='object' && 'generation' in authority) {
    const attempt=requireAdmittedRunAttempt(authority);
    return {userId:attempt.userId,attempt};
  }
  const tenant=requireTenantContext(authority);
  return {userId:tenant.userId,tenant};
}

/** Resource admission at every provider operation, including again after OS
 * Login waits. Uses the existing owner-bound store and canonical run attempt. */
export function googleRuntimeAdmission(authority: ProjectRuntimeAuthority,
  store: Pick<ProjectRuntimeStore,'loadLatestRevision'|'loadSession'>,
  dependencies: {ownedRun?: (context:TenantContext,runId:string)=>Promise<void>;
    currentAttempt?: (attempt:AdmittedRunAttempt)=>Promise<void>} = {}): AdmitGoogleRuntime {
  const identity=runtimeAuthorityIdentity(authority);
  return async input => {
    try {
    const scope={...input,session:input.session?structuredClone(input.session):undefined,
      sourceFiles:input.sourceFiles?.map(file=>({path:file.path,content:file.content})),deletePaths:input.deletePaths?[...input.deletePaths]:undefined};
    runtimeAuthorityIdentity(authority);
    if(scope.userId!==identity.userId)resourceNotFound();
    const cleanup=scope.action==='destroy';
    if(identity.attempt && !cleanup)await (dependencies.currentAttempt ?? assertCurrentRunAttempt)(identity.attempt);
    const revision=await store.loadLatestRevision(identity.userId,scope.projectId);
    if(!revision || revision.userId!==identity.userId || revision.projectId!==scope.projectId
      || revision.project.projectId!==scope.projectId || revision.project.runId!==revision.runId
      || revision.project.contract.projectId!==scope.projectId || revision.project.contract.runId!==revision.runId
      || revision.workspaceFingerprint!==projectWorkspaceFingerprint(revision.project)
      || (identity.attempt && identity.attempt.runId!==revision.runId))resourceNotFound();
    if(scope.sourceFiles) {
      const canonical=new Map(revision.project.workspace.files.map(file=>[file.path,file.content]));
      if(scope.sourceFiles.some(file=>canonical.get(file.path)!==file.content)
        || (scope.action==='create' && projectWorkspaceFingerprint({workspace:{...revision.project.workspace,files:[...scope.sourceFiles]}})!==revision.workspaceFingerprint))resourceNotFound();
    }
    if(scope.deletePaths?.some(path=>revision.project.workspace.files.some(file=>file.path===path)))resourceNotFound();
    if(identity.tenant)await (dependencies.ownedRun ?? ((context,id)=>requireOwnedResource(context,'run',id)))(identity.tenant,revision.runId);
    if(scope.session) {
      const expected=scope.session;
      const current=await store.loadSession(identity.userId,expected.sessionId);
      const fields=['name','instanceId','runtimeId','ownerBinding','projectBinding','expiresAtEpoch'] as const;
      const saved=current?.providerState?.gce as Record<string,unknown>|undefined;
      const supplied=expected.providerState?.gce as Record<string,unknown>|undefined;
      if(!current || current.userId!==identity.userId || current.projectId!==scope.projectId
        || current.sessionId!==expected.sessionId || current.providerId!=='google-gce'
        || (!cleanup && ['destroyed','failed'].includes(current.status)) || !saved || !supplied
        || fields.some(key=>saved[key]!==supplied[key]))resourceNotFound();
    }
    if(identity.attempt && !cleanup)await (dependencies.currentAttempt ?? assertCurrentRunAttempt)(identity.attempt);
    } catch(error) {
      if(error instanceof TenantAccessError)throw error;
      throw new TenantAccessError(503,'RESOURCE_ACCESS_UNAVAILABLE');
    }
  };
}
