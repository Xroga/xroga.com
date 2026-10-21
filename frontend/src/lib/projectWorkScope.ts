'use client';

/**
 * Presentation-level project association for a single, stable workspace session.
 * The durable source of truth is xroga_sidebar_items (user, conversation ID, project ID).
 * This marker only tells an already-running workspace which project label to show.
 * It must never grant repository access or create a second execution scheduler.
 */
export interface ActiveProjectWork {
  projectId: string;
  projectName: string;
  sessionId: string;
  githubRepoName?: string;
  branch?: string;
}
export const ACTIVE_PROJECT_WORK_EVENT = 'xroga-active-project-work-changed';
const KEY='xroga-active-project-work:v1';
export function readActiveProjectWork(sessionId:string):ActiveProjectWork|null {
  if(typeof window==='undefined'||!sessionId)return null;
  try{
    const raw=sessionStorage.getItem(KEY);
    if(!raw)return null;
    const value=JSON.parse(raw) as Partial<ActiveProjectWork>;
    return value.sessionId===sessionId&&typeof value.projectId==='string'&&
      typeof value.projectName==='string'?value as ActiveProjectWork:null;
  }catch{return null;}
}
export function saveActiveProjectWork(value:ActiveProjectWork|null):void {
  if(typeof window==='undefined')return;
  try{
    if(value)sessionStorage.setItem(KEY,JSON.stringify(value));
    else sessionStorage.removeItem(KEY);
    window.dispatchEvent(new Event(ACTIVE_PROJECT_WORK_EVENT));
  }catch{/* session storage may be blocked; durable project assignment remains in the database */}
}
