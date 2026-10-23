import test from 'node:test';
import assert from 'node:assert/strict';
import { activateSidebarProject, clearActiveSidebarProject, getActiveSidebarProject,
 SIDEBAR_PROJECT_ACTIVE_EVENT } from './sidebarProjectTask';

test('sidebar project selection persists within the tab and remains account-scoped',()=>{
 const contents=new Map<string,string>();
 let events=0;
 const previousWindow=Object.getOwnPropertyDescriptor(globalThis,'window');
 const previousStorage=Object.getOwnPropertyDescriptor(globalThis,'sessionStorage');
 Object.defineProperty(globalThis,'window',{configurable:true,value:{dispatchEvent:(event:Event)=>{if(event.type===SIDEBAR_PROJECT_ACTIVE_EVENT)events++;}}});
 Object.defineProperty(globalThis,'sessionStorage',{configurable:true,value:{
  getItem:(key:string)=>contents.get(key)??null,
  setItem:(key:string,value:string)=>contents.set(key,value),
  removeItem:(key:string)=>contents.delete(key),
 }});
 try{
  assert.equal(getActiveSidebarProject('account-a'),null);
  activateSidebarProject('account-a','project-one');
  assert.deepEqual(getActiveSidebarProject('account-a'),{userId:'account-a',projectId:'project-one'});
  assert.equal(getActiveSidebarProject('account-b'),null);
  activateSidebarProject('account-a','project-two');
  assert.equal(getActiveSidebarProject('account-a')?.projectId,'project-two');
  clearActiveSidebarProject();
  assert.equal(getActiveSidebarProject('account-a'),null);
  assert.equal(events,3);
 }finally{
  if(previousWindow)Object.defineProperty(globalThis,'window',previousWindow);else Reflect.deleteProperty(globalThis,'window');
  if(previousStorage)Object.defineProperty(globalThis,'sessionStorage',previousStorage);else Reflect.deleteProperty(globalThis,'sessionStorage');
 }
});
