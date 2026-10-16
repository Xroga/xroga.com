import type {ProjectRuntimeStore} from '../synthesis/projectRuntime/store.js';
import {resourceNotFound} from './tenantErrors.js';

/** Preserve the caller's requested project before any runtime provider action. */
export async function loadProjectRuntimeSession(store:Pick<ProjectRuntimeStore,'loadSession'>,userId:string,projectId:string,sessionId:string){
  const session=await store.loadSession(userId,sessionId);
  if(session&&(session.userId!==userId||session.projectId!==projectId||session.sessionId!==sessionId))resourceNotFound();
  return session;
}
