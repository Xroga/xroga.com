import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { getTenantSupabaseAdmin } from '../../security/serviceRoleGuard.js';
import { requireTenantContext,type TenantContext } from '../../security/tenantContext.js';
import { downloadFromR2,assertOwnedR2Key } from '../../lib/r2.js';
import { FileDeliveryError,storageMetadataSchema,digestBytes,fileFingerprint,privateFileUrl,signFileLink,verifyFileLink,MAX_PRIVATE_FILE_BYTES,type OwnedFileRow } from './fileDeliveryPolicy.js';

const fileSchema=z.object({id:z.string().uuid(),project_id:z.string().uuid(),file_name:z.string(),file_type:z.string().nullable().optional(),file_path:z.string().nullable(),file_url:z.string().nullable(),content:z.string().nullable(),storage_metadata:z.unknown().optional(),delivery_version:z.number().int().positive().max(Number.MAX_SAFE_INTEGER).optional(),projects:z.object({user_id:z.string().uuid()})});
export async function ownedFile(context:TenantContext,projectId:string,fileId:string,db?:SupabaseClient):Promise<OwnedFileRow> {
  const scope=requireTenantContext(context);
  if(!z.string().uuid().safeParse(projectId).success || !z.string().uuid().safeParse(fileId).success)throw new FileDeliveryError(404,'FILE_NOT_FOUND');
  const {data,error}=await (db??getTenantSupabaseAdmin(scope)).from('project_files').select('*,projects!inner(user_id)').eq('id',fileId).eq('project_id',projectId).eq('projects.user_id',scope.userId).maybeSingle();
  if(error)throw new FileDeliveryError(503,'FILE_ACCESS_UNAVAILABLE');
  if(!data)throw new FileDeliveryError(404,'FILE_NOT_FOUND');
  const parsed=fileSchema.safeParse(data);
  if(!parsed.success || parsed.data.id!==fileId || parsed.data.project_id!==projectId || parsed.data.projects.user_id!==scope.userId)throw new FileDeliveryError(404,'FILE_NOT_FOUND');
  return {...parsed.data,storage_metadata:parsed.data.storage_metadata??null,delivery_version:parsed.data.delivery_version??0};
}
export async function readPrivateFile(context:TenantContext,row:OwnedFileRow,readObject=downloadFromR2):Promise<{buffer:Buffer;contentType:string}> {
  const scope=requireTenantContext(context);
  if(row.projects.user_id!==scope.userId)throw new FileDeliveryError(404,'FILE_NOT_FOUND');
  // Legacy database text remains owner-authorized; never fetch legacy public/data URLs.
  if(row.storage_metadata===null && typeof row.content==='string') {
    if(Buffer.byteLength(row.content)>MAX_PRIVATE_FILE_BYTES)throw new FileDeliveryError(503,'FILE_TOO_LARGE');
    return {buffer:Buffer.from(row.content),contentType:'text/plain'};
  }
  const parsed=storageMetadataSchema.safeParse(row.storage_metadata);
  if(!parsed.success || parsed.data.ownerId!==scope.userId)throw new FileDeliveryError(503,'FILE_STORAGE_NOT_VERIFIED');
  const metadata=parsed.data;
  let buffer:Buffer;
  if(metadata.provider==='database' && typeof row.content==='string')buffer=Buffer.from(row.content);
  else if(metadata.provider==='private_r2' && metadata.key && metadata.bucket && row.file_path===metadata.key) {
    assertOwnedR2Key(metadata.key,scope.userId);buffer=(await readObject(metadata.key,scope.userId,metadata.bucket)).buffer;
  } else throw new FileDeliveryError(503,'FILE_STORAGE_NOT_VERIFIED');
  if(buffer.length!==metadata.size || digestBytes(buffer)!==metadata.sha256)throw new FileDeliveryError(503,'FILE_INTEGRITY_UNAVAILABLE');
  return {buffer,contentType:metadata.contentType};
}
export async function createPrivateFileLink(context:TenantContext,projectId:string,fileId:string,ttl:number,db?:SupabaseClient,now=Date.now()):Promise<{url:string;expiresAt:string}> {
  const row=await ownedFile(context,projectId,fileId,db);
  if(row.delivery_version<1 || (row.storage_metadata===null && row.content===null))throw new FileDeliveryError(503,'FILE_STORAGE_NOT_VERIFIED');
  if(row.storage_metadata!==null) {
    const metadata=storageMetadataSchema.safeParse(row.storage_metadata);
    if(!metadata.success || metadata.data.ownerId!==requireTenantContext(context).userId)throw new FileDeliveryError(503,'FILE_STORAGE_NOT_VERIFIED');
    if(metadata.data.provider==='database')await readPrivateFile(context,row);
    else if(!metadata.data.key || !metadata.data.bucket || metadata.data.key!==row.file_path)throw new FileDeliveryError(503,'FILE_STORAGE_NOT_VERIFIED');
    else assertOwnedR2Key(metadata.data.key,requireTenantContext(context).userId);
  }
  const result=await signFileLink(context,row,ttl,now);
  return {url:`${privateFileUrl(projectId,fileId)}?link=${encodeURIComponent(result.token)}`,expiresAt:result.expiresAt};
}
export async function revokePrivateFileLinks(context:TenantContext,projectId:string,fileId:string,client?:SupabaseClient):Promise<void> {
  const scope=requireTenantContext(context),db=client??getTenantSupabaseAdmin(scope);
  await ownedFile(scope,projectId,fileId,db);
  const {data,error}=await db.rpc('revoke_project_file_links',{p_project_id:projectId,p_file_id:fileId,p_owner_id:scope.userId});
  if(error)throw new FileDeliveryError(503,'FILE_LINK_REVOCATION_UNAVAILABLE');
  if(!Number.isSafeInteger(data)||data<1)throw new FileDeliveryError(404,'FILE_NOT_FOUND');
}
export async function downloadPrivateFile(context:TenantContext,projectId:string,fileId:string,link?:string,db?:SupabaseClient,now=Date.now()) {
  const started=Date.now();
  const row=await ownedFile(context,projectId,fileId,db);
  if(link!==undefined)await verifyFileLink(context,row,link,now);
  const result=await readPrivateFile(context,row);
  try {
    // Provider I/O can outlive project access or a link's revocation epoch.
    // Do not release bytes using only the ownership snapshot from before I/O.
    const current=await ownedFile(context,projectId,fileId,db);
    if(fileFingerprint(current)!==fileFingerprint(row))throw new FileDeliveryError(409,'FILE_CHANGED');
    if(link!==undefined)await verifyFileLink(context,current,link,now+Math.max(0,Date.now()-started));
    return {row:current,...result};
  } catch(error) {result.buffer.fill(0);throw error;}
}
/** Do not serialize internal bucket metadata or legacy public/data URLs in ordinary responses. */
export function publicFileView(row:Record<string,unknown>):Record<string,unknown> {
  const {storage_metadata:_metadata,delivery_version:_epoch,...publicRow}=row;
  const hasPrivateData=typeof row.content==='string' || storageMetadataSchema.safeParse(row.storage_metadata).success;
  return {...publicRow,file_url:hasPrivateData&&typeof row.project_id==='string'&&typeof row.id==='string'?privateFileUrl(row.project_id,row.id):null};
}
