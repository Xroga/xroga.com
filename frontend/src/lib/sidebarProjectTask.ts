'use client';

/** Sidebar project selection is a UI context, not an execution orchestrator.
 * It is deliberately account-scoped and cleared on ordinary New Work.
 * The durable conversation→project relation lives in xroga_sidebar_items. */
const KEY='xroga-active-sidebar-project-v1';
export const SIDEBAR_PROJECT_ACTIVE_EVENT='xroga-sidebar-project-active';
export type ActiveSidebarProject={userId:string;projectId:string};
export function getActiveSidebarProject(userId?:string):ActiveSidebarProject|null {
 if(typeof window==='undefined')return null;
 try{
  const value=JSON.parse(sessionStorage.getItem(KEY)||'null') as Partial<ActiveSidebarProject>|null;
  if(!value||typeof value.userId!=='string'||typeof value.projectId!=='string')return null;
  if(userId&&value.userId!==userId)return null;
  return {userId:value.userId,projectId:value.projectId};
 }catch{return null;}
}
export function activateSidebarProject(userId:string,projectId:string):void{
 if(typeof window==='undefined'||!userId||!projectId)return;
 sessionStorage.setItem(KEY,JSON.stringify({userId,projectId} satisfies ActiveSidebarProject));
 window.dispatchEvent(new Event(SIDEBAR_PROJECT_ACTIVE_EVENT));
}
export function clearActiveSidebarProject():void{
 if(typeof window==='undefined')return;
 sessionStorage.removeItem(KEY);
 window.dispatchEvent(new Event(SIDEBAR_PROJECT_ACTIVE_EVENT));
}
