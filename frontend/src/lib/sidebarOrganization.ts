import { createClient } from '@/lib/supabase/client';
import type { Project } from '@/lib/api';

export type SidebarItemType = 'conversation' | 'project';
export interface SidebarItemMeta {
  user_id: string;
  item_type: SidebarItemType;
  item_id: string;
  title_override: string | null;
  project_id: string | null;
  section_id: string | null;
  pinned_at: string | null;
  pin_order: number | null;
  archived_at: string | null;
  updated_at: string;
}
export interface SidebarSection {
  id: string;
  user_id: string;
  project_id: string;
  name: string;
  position: number;
}
const MAX_META_ROWS = 4000;
export async function loadSidebarMetadata(userId: string) {
  const { data, error } = await createClient().from('sidebar_items')
    .select('user_id,item_type,item_id,title_override,project_id,section_id,pinned_at,pin_order,archived_at,updated_at')
    .eq('user_id', userId).limit(MAX_META_ROWS);
  if (error) throw error;
  return (data || []) as SidebarItemMeta[];
}
export async function saveSidebarMetadata(userId: string, type: SidebarItemType, id: string,
    previous: SidebarItemMeta | undefined, patch: Partial<Pick<SidebarItemMeta,
      'title_override'|'project_id'|'section_id'|'pinned_at'|'pin_order'|'archived_at'>>) {
  const row = {
    user_id:userId,item_type:type,item_id:id,
    title_override:previous?.title_override ?? null,
    project_id:previous?.project_id ?? null,
    section_id:previous?.section_id ?? null,
    pinned_at:previous?.pinned_at ?? null,
    pin_order:previous?.pin_order ?? null,
    archived_at:previous?.archived_at ?? null,
    ...patch,
    updated_at:new Date().toISOString(),
  };
  const { data,error } = await createClient().from('sidebar_items')
    .upsert(row,{onConflict:'user_id,item_type,item_id'})
    .select('user_id,item_type,item_id,title_override,project_id,section_id,pinned_at,pin_order,archived_at,updated_at')
    .single();
  if (error) throw error;
  return data as SidebarItemMeta;
}
export async function removeSidebarMetadata(userId:string,type:SidebarItemType,id:string) {
  const {error}=await createClient().from('sidebar_items')
    .delete().eq('user_id',userId).eq('item_type',type).eq('item_id',id);
  if(error) throw error;
}
export async function listSidebarProjects(userId:string,offset:number,limit=5) {
  const {data,error}=await createClient().from('projects')
    .select('id,name,type,status,actions_used,github_repo_url,github_repo_name,created_at,updated_at')
    .eq('user_id',userId).order('updated_at',{ascending:false}).order('id',{ascending:true})
    .range(offset,offset+limit);
  if(error) throw error;
  const rows=(data||[]) as Project[];
  return {items: rows.slice(0,limit),hasMore:rows.length>limit};
}
export async function listSidebarSections(userId:string) {
  const {data,error}=await createClient().from('sidebar_sections')
    .select('id,user_id,project_id,name,position').eq('user_id',userId)
    .order('position',{ascending:true}).limit(500);
  if(error) throw error;
  return (data||[]) as SidebarSection[];
}
export async function createSidebarSection(userId:string,projectId:string,name:string){
  const {data,error}=await createClient().from('sidebar_sections')
    .insert({user_id:userId,project_id:projectId,name:name.trim()})
    .select('id,user_id,project_id,name,position').single();
  if(error) throw error;
  return data as SidebarSection;
}
export async function renameSidebarSection(userId:string,id:string,name:string){
  const {error}=await createClient().from('sidebar_sections')
    .update({name:name.trim()}).eq('id',id).eq('user_id',userId);
  if(error) throw error;
}
export async function removeSidebarSection(userId:string,id:string){
  const {error}=await createClient().from('sidebar_sections')
    .delete().eq('id',id).eq('user_id',userId);
  if(error) throw error;
}
export function safeConversationTitle(title?:string, firstRequest?:string, preview?:string) {
  const raw=title?.trim()||'';
  const numbered=/^(?:#\d+ terminal|Terminal #\d+|Terminal)$/i.test(raw);
  const source=(numbered||!raw ? (firstRequest?.trim() || preview?.trim() || '') : raw)
    .replace(/[\r\n\t]+/g,' ').replace(/\s+/g,' ').trim();
  return (source || 'Untitled conversation').slice(0,120);
}
