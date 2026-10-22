'use client';
import { createClient } from '@/lib/supabase/client';
import { messagesForStorage } from '@/lib/storageSafe';
import type { TerminalHistoryEntry } from '@/lib/terminalHistory';
import { getActiveSidebarProject } from '@/lib/sidebarProjectTask';

export type SidebarKind = 'conversation' | 'project';
export type SidebarMeta = {
  user_id: string; item_type: SidebarKind; item_id: string;
  title_override: string | null; pin_order: number | null;
  archived_at: string | null; project_id: string | null; section_id: string | null;
};
export type SidebarSection = { id:string; project_id:string; title:string; sort_order:number };
export type SidebarProject = { id:string; name:string; github_repo_name:string|null; updated_at:string|null };
export type SidebarChat = { id:string; title:string; prompt:string; preview:string; message_count:number; kind:string; status:string; created_at:string; updated_at:string };

const clean = (value: string) => value.replace(/[#*_\n\r\t]/g,' ').replace(/\s+/g,' ').trim();
export function meaningfulSidebarTitle(title: string | null | undefined, fallback: string | null | undefined): string {
  const existing=clean(title||'');
  if(existing && !/^(?:#?\d+\s+terminal|terminal\s*#?\d+|terminal session)$/i.test(existing)) return existing.slice(0,120);
  const actual=clean(fallback||'');
  if(!actual) return 'Untitled conversation';
  return actual.slice(0,90);
}
export function visiblePage<T>(items:T[],visible:number):T[]{ return items.slice(0,Math.max(0,visible)); }
export function sortPinned<T extends {pin_order:number|null}>(items:T[]):T[]{
 return [...items].sort((a,b)=>(a.pin_order??Infinity)-(b.pin_order??Infinity));
}
function owned(userId:string) { if(!userId) throw new Error('Sign in to organize saved work'); return createClient(); }
export async function loadSidebarMeta(userId:string):Promise<SidebarMeta[]> {
 const {data,error}=await owned(userId).from('xroga_sidebar_items').select('user_id,item_type,item_id,title_override,pin_order,archived_at,project_id,section_id').eq('user_id',userId).limit(2000);
 if(error) throw error; return (data||[]) as SidebarMeta[];
}
export async function loadSidebarSections(userId:string):Promise<SidebarSection[]> {
 const {data,error}=await owned(userId).from('xroga_sidebar_sections').select('id,project_id,title,sort_order').eq('user_id',userId).order('sort_order').limit(500);
 if(error) throw error; return (data||[]) as SidebarSection[];
}
export async function loadSidebarProjects(userId:string,offset:number,limit=5):Promise<SidebarProject[]> {
 const {data,error}=await owned(userId).from('projects').select('id,name,github_repo_name,updated_at').eq('user_id',userId).order('updated_at',{ascending:false}).range(offset,offset+limit-1);
 if(error) throw error; return (data||[]) as SidebarProject[];
}
export async function loadSidebarChats(userId:string,offset=0,limit=100):Promise<SidebarChat[]> {
 const {data,error}=await owned(userId).from('xroga_sidebar_chats').select('id,title,prompt,preview,message_count,kind,status,created_at,updated_at').eq('user_id',userId).order('updated_at',{ascending:false}).range(offset,offset+limit-1);
 if(error) throw error; return (data||[]) as SidebarChat[];
}
export async function loadSidebarChatById(userId:string,id:string):Promise<TerminalHistoryEntry|null>{
 const {data,error}=await owned(userId).from('xroga_sidebar_chats').select('*').eq('user_id',userId).eq('id',id).maybeSingle();
 if(error) throw error; if(!data) return null;
 return {id:data.id,title:data.title,prompt:data.prompt,preview:data.preview,messages:Array.isArray(data.messages)?data.messages:[],
 kind:data.kind||'chat',status:data.status||'active',messageCount:data.message_count||0,createdAt:data.created_at,updatedAt:data.updated_at} as TerminalHistoryEntry;
}
export async function saveSidebarChat(userId:string,entry:TerminalHistoryEntry):Promise<void>{
 if(entry.githubRepoName?.includes('/')||!entry.messages?.length) return;
 const {error}=await owned(userId).from('xroga_sidebar_chats').upsert({
  user_id:userId,id:entry.id,title:meaningfulSidebarTitle(entry.title,entry.prompt),prompt:(entry.prompt||'').slice(0,20000),
  preview:(entry.preview||'').slice(0,500),messages:messagesForStorage(entry.messages).slice(-300),
  kind:entry.kind,status:entry.status||'active',message_count:entry.messageCount,
  created_at:entry.createdAt,updated_at:entry.updatedAt,
 },{onConflict:'user_id,id'});
 if(error) throw error;
}
export async function changeSidebarMeta(userId:string,itemType:SidebarKind,itemId:string,changes:Partial<Omit<SidebarMeta,'user_id'|'item_type'|'item_id'>>):Promise<void>{
 // Enforce identifier ownership for project rows before storing any metadata.
 if(itemType==='project' && !itemId.startsWith('repo:')){
   const {data,error}=await owned(userId).from('projects').select('id').eq('user_id',userId).eq('id',itemId).maybeSingle();
   if(error||!data) throw new Error('Project not available to this account');
 }
 const client=owned(userId);
 const {data:existing,error:readError}=await client.from('xroga_sidebar_items')
  .select('title_override,pin_order,archived_at,project_id,section_id')
  .eq('user_id',userId).eq('item_type',itemType).eq('item_id',itemId).maybeSingle();
 if(readError) throw readError;
 const {error}=await client.from('xroga_sidebar_items').upsert({
  user_id:userId,item_type:itemType,item_id:itemId,
  title_override:changes.title_override!==undefined?changes.title_override:existing?.title_override??null,
  pin_order:changes.pin_order!==undefined?changes.pin_order:existing?.pin_order??null,
  archived_at:changes.archived_at!==undefined?changes.archived_at:existing?.archived_at??null,
  project_id:changes.project_id!==undefined?changes.project_id:existing?.project_id??null,
  section_id:changes.section_id!==undefined?changes.section_id:existing?.section_id??null,
  updated_at:new Date().toISOString()
 },{onConflict:'user_id,item_type,item_id'});
 if(error) throw error;
}
export async function deleteSidebarMeta(userId:string,itemType:SidebarKind,itemId:string):Promise<void>{
 const {error}=await owned(userId).from('xroga_sidebar_items').delete().eq('user_id',userId).eq('item_type',itemType).eq('item_id',itemId);
 if(error) throw error;
}
export async function createSidebarSection(userId:string,projectId:string,title:string):Promise<SidebarSection>{
 const {data,error}=await owned(userId).from('xroga_sidebar_sections').insert({user_id:userId,project_id:projectId,title:title.trim()}).select('id,project_id,title,sort_order').single();
 if(error) throw error; return data as SidebarSection;
}
export async function removeSidebarSection(userId:string,id:string):Promise<void>{
 const {error}=await owned(userId).from('xroga_sidebar_sections').delete().eq('user_id',userId).eq('id',id);
 if(error) throw error;
}
export async function deleteSidebarChat(userId:string,id:string):Promise<void>{
 const {error}=await owned(userId).from('xroga_sidebar_chats').delete().eq('user_id',userId).eq('id',id);
 if(error) throw error;
}

/** Coalesce non-repository chat saves; never block message rendering on cloud I/O. */
const pendingChats=new Map<string,ReturnType<typeof setTimeout>>();
export function scheduleSidebarChatSave(entry:TerminalHistoryEntry):void{
 if(typeof window==='undefined'||entry.githubRepoName?.includes('/')||!entry.messages?.length) return;
 const prev=pendingChats.get(entry.id);
 if(prev) clearTimeout(prev);
 pendingChats.set(entry.id,setTimeout(()=>{
  pendingChats.delete(entry.id);
  void createClient().auth.getUser().then(async ({data,error})=>{
    if(error||!data.user) return;
    try{ await saveSidebarChat(data.user.id,entry); window.dispatchEvent(new Event('xroga-sidebar-chats-changed')); }
    catch(e){ console.warn('[sidebar] chat sync unavailable:',e); }
  });
 },1500));
}

export async function swapSidebarPins(userId:string,first:{item_type:SidebarKind;item_id:string},second:{item_type:SidebarKind;item_id:string}):Promise<void>{
 if(!userId)throw new Error('Sign in to organize saved work');
 const {error}=await owned(userId).rpc('xroga_swap_sidebar_pins',{
  p_first_type:first.item_type,p_first_id:first.item_id,
  p_second_type:second.item_type,p_second_id:second.item_id,
 });
 if(error)throw error;
}
export async function loadPinnedSidebarRecords(userId:string,items:SidebarMeta[]):Promise<{
 projects:SidebarProject[];sessions:Array<{id:string;title:string;preview:string;updatedAt:string;kind:string;status:string;githubRepoName?:string;githubBranch?:string;terminalNumber:number;messageCount:number;}>;
}>{
 const pinned=items.filter(x=>x.pin_order!==null&&!x.archived_at);
 const projects=pinned.filter(x=>x.item_type==='project'&&!x.item_id.startsWith('repo:')).map(x=>x.item_id);
 const sessions=pinned.filter(x=>x.item_type==='conversation').map(x=>x.item_id);
 const client=owned(userId);
 const [pr,repoChats,normalChats]=await Promise.all([
  projects.length?client.from('projects').select('id,name,github_repo_name,updated_at').eq('user_id',userId).in('id',projects.slice(0,250)):
    Promise.resolve({data:[] as SidebarProject[],error:null}),
  sessions.length?client.from('terminal_sessions').select('id,title,preview,updated_at,kind,status,github_repo_name,github_branch,terminal_number,message_count').eq('user_id',userId).in('id',sessions.slice(0,250)):
    Promise.resolve({data:[],error:null}),
  sessions.length?client.from('xroga_sidebar_chats').select('id,title,preview,updated_at,kind,status,message_count').eq('user_id',userId).in('id',sessions.slice(0,250)):
    Promise.resolve({data:[],error:null}),
 ]);
 if(pr.error)throw pr.error;if(repoChats.error)throw repoChats.error;if(normalChats.error)throw normalChats.error;
 const results=new Map<string,{id:string;title:string;preview:string;updatedAt:string;kind:string;status:string;githubRepoName?:string;githubBranch?:string;terminalNumber:number;messageCount:number}>();
 for(const c of (repoChats.data||[]) as Array<Record<string,unknown>>){
  const id=String(c.id||'');if(!id)continue;
  results.set(id,{id,title:String(c.title||''),preview:String(c.preview||''),updatedAt:String(c.updated_at||''),
    kind:String(c.kind||'chat'),status:String(c.status||'active'),githubRepoName:String(c.github_repo_name||'')||undefined,
    githubBranch:String(c.github_branch||'main'),terminalNumber:Number(c.terminal_number||0),messageCount:Number(c.message_count||0)});
 }
 for(const c of (normalChats.data||[]) as Array<Record<string,unknown>>){
  const id=String(c.id||'');if(!id||results.has(id))continue;
  results.set(id,{id,title:String(c.title||''),preview:String(c.preview||''),updatedAt:String(c.updated_at||''),
    kind:String(c.kind||'chat'),status:String(c.status||'active'),terminalNumber:0,messageCount:Number(c.message_count||0)});
 }
 return {projects:(pr.data||[]) as SidebarProject[],sessions:[...results.values()]};
}

/** Bind a real saved task to its selected project; never create a phantom conversation.
 * Serialized per task so streaming saves do not generate repeated metadata writes. */
const projectLinks=new Map<string,Promise<void>>();
const completedLinks=new Set<string>();
export function scheduleProjectConversationLink(entry:TerminalHistoryEntry):void{
 if(typeof window==='undefined'||!entry.messages?.some(m=>m.role==='user'))return;
 const active=getActiveSidebarProject();
 if(!active)return;
 const key=active.userId+':'+active.projectId+':'+entry.id;
 if(completedLinks.has(key)||projectLinks.has(key))return;
 const operation=(async()=>{
  try{
   const {data}=await createClient().auth.getUser();
   if(!data.user||data.user.id!==active.userId)return;
   await changeSidebarMeta(active.userId,'conversation',entry.id,{project_id:active.projectId});
   completedLinks.add(key);
   window.dispatchEvent(new Event('xroga-sidebar-chats-changed'));
  }catch(error){console.warn('[sidebar] project task association will retry:',error);}
  finally{projectLinks.delete(key);}
 })();
 projectLinks.set(key,operation);
}
