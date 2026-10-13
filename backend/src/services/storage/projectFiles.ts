import { randomUUID } from 'node:crypto';
import { getSupabaseAdmin } from '../../config/supabase.js';
import { uploadToR2,buildR2Key,removeNewR2Object } from '../../lib/r2.js';
import { createTenantContext } from '../../security/tenantContext.js';
import { requireOwnedProject } from '../../security/ownership.js';
import { FileDeliveryError,digestBytes,privateFileUrl,storageMetadataSchema,MAX_PRIVATE_FILE_BYTES,type PrivateStorageMetadata } from './fileDeliveryPolicy.js';

export interface StoredFile {id:string;fileName:string;fileUrl:string;fileType:'code'|'video'|'image'|'audio'|'pdf'|'other';projectId?:string}
export async function storeProjectFile(userId:string,projectId:string,filename:string,content:Buffer|string,contentType:string,fileType:StoredFile['fileType']): Promise<StoredFile> {
  const context=createTenantContext({userId,via:'persisted_owner'});
  await requireOwnedProject(context,projectId);
  const id=randomUUID(),bytes=Buffer.isBuffer(content)?content:Buffer.from(content);
  if(!filename.trim() || filename.length>200 || bytes.length>MAX_PRIVATE_FILE_BYTES || !['code','video','image','audio','pdf','other'].includes(fileType) || !storageMetadataSchema.safeParse({provider:'database',ownerId:userId,size:bytes.length,sha256:digestBytes(bytes),contentType}).success)throw new FileDeliveryError(400,'INVALID_FILE');
  let metadata:PrivateStorageMetadata;
  let inline:string|null=null;
  if(typeof content==='string' && content.length<50000) {
    // Explicit primary durable database storage, NOT an upload failure/local fallback.
    inline=content;metadata={provider:'database',ownerId:userId,size:bytes.length,sha256:digestBytes(bytes),contentType};
  } else {
    const object=await uploadToR2(buildR2Key(userId,filename),bytes,contentType,userId);
    metadata={...object,provider:'private_r2',ownerId:userId};
  }
  metadata=storageMetadataSchema.parse(metadata);
  const fileUrl=privateFileUrl(projectId,id);
  const {data,error}=await getSupabaseAdmin().from('project_files').insert({id,project_id:projectId,file_name:filename,file_path:metadata.key??filename,file_type:fileType,file_url:fileUrl,content:inline,storage_metadata:metadata}).select('id').single();
  if(error || !data) {
    if(metadata.provider==='private_r2') {
      try{await removeNewR2Object(metadata.key!,userId,metadata.bucket!);}catch{console.warn('[private-files] newly uploaded object needs authorized cleanup; no file receipt issued');}
    }
    throw new FileDeliveryError(503,'FILE_RECORD_WRITE_UNAVAILABLE');
  }
  return {id:data.id,fileName:filename,fileUrl,fileType,projectId};
}
/** Retired unscoped media paths have no active callers; never fabricate durable delivery. */
export async function storeUserFile(_userId:string,_filename:string,_content:Buffer|string,_contentType:string): Promise<{fileUrl:string;playbackUrl:string;key:string}> {throw new FileDeliveryError(503,'PROJECT_FILE_SCOPE_REQUIRED');}
export async function readStoredFile(_key:string): Promise<{buffer:Buffer;contentType:string}> {throw new FileDeliveryError(404,'PROJECT_FILE_SCOPE_REQUIRED');}
