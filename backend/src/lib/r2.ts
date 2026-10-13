import { randomUUID } from 'node:crypto';
import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { FileDeliveryError,MAX_PRIVATE_FILE_BYTES,digestBytes } from '../services/storage/fileDeliveryPolicy.js';

export interface PrivateR2Configuration {accountId:string;bucket:string;accessKey:string;secretKey:string;metadataReadToken:string}
export function privateR2Configuration(env: Record<string,string|undefined> = process.env): PrivateR2Configuration {
  const accountId=env.CLOUDFLARE_R2_ACCOUNT_ID??'',bucket=env.CLOUDFLARE_R2_PRIVATE_BUCKET??'';
  if (!/^[a-f0-9]{32}$/.test(accountId) || !/^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/.test(bucket) || bucket==='xroga-assets' || bucket===env.CLOUDFLARE_R2_BUCKET || !env.CLOUDFLARE_R2_ACCESS_KEY || !env.CLOUDFLARE_R2_SECRET_KEY || !env.CLOUDFLARE_R2_METADATA_READ_TOKEN) throw new FileDeliveryError(503,'PRIVATE_STORAGE_UNAVAILABLE');
  return {accountId,bucket,accessKey:env.CLOUDFLARE_R2_ACCESS_KEY,secretKey:env.CLOUDFLARE_R2_SECRET_KEY,metadataReadToken:env.CLOUDFLARE_R2_METADATA_READ_TOKEN};
}
export function assertOwnedR2Key(key:string,userId:string): void {
  if (!/^[a-f0-9-]{36}$/i.test(userId) || !key.startsWith(`users/${userId}/`) || key.length>1024 || key.split('/').some(part=>!part||part==='.'||part==='..') || /[\\\x00-\x1f\x7f]/.test(key)) throw new FileDeliveryError(404,'FILE_NOT_FOUND');
}
export function buildR2Key(userId:string,filename:string): string {
  const key=`users/${userId}/${randomUUID()}-${filename.replace(/[^a-zA-Z0-9._-]/g,'_').slice(0,150)}`;
  assertOwnedR2Key(key,userId); return key;
}
export async function verifyPrivateR2Bucket(config:PrivateR2Configuration, fetcher:typeof fetch=fetch): Promise<void> {
  const base=`https://api.cloudflare.com/client/v4/accounts/${config.accountId}/r2/buckets/${config.bucket}`;
  try {
    const results=[];
    for(const suffix of ['', '/domains/managed','/domains/custom']) {
      const response=await fetcher(base+suffix,{method:'GET',redirect:'error',signal:AbortSignal.timeout(10000),headers:{Authorization:`Bearer ${config.metadataReadToken}`}});
      if(!response.ok) throw new Error('metadata unavailable');
      const text=await response.text();if(text.length>65536)throw new Error('bounded metadata required');
      const data=JSON.parse(text);if(data.success!==true || data.errors?.length)throw new Error('metadata not verified');results.push(data.result);
    }
    if(results[0]?.name!==config.bucket || results[1]?.enabled!==false || !Array.isArray(results[2]?.domains) || results[2].domains.length!==0)throw new Error('private access not established');
  } catch {throw new FileDeliveryError(503,'PRIVATE_STORAGE_UNAVAILABLE');}
}
function client(config:PrivateR2Configuration) {
  return new S3Client({region:'auto',endpoint:`https://${config.accountId}.r2.cloudflarestorage.com`,maxAttempts:2,credentials:{accessKeyId:config.accessKey,secretAccessKey:config.secretKey}});
}
export interface R2UploadResult {key:string;bucket:string;sha256:string;size:number;contentType:string}
export async function uploadToR2(key:string,body:Buffer|string,contentType:string,userId:string): Promise<R2UploadResult> {
  assertOwnedR2Key(key,userId);const bytes=Buffer.isBuffer(body)?body:Buffer.from(body);
  if(bytes.length>MAX_PRIVATE_FILE_BYTES)throw new FileDeliveryError(400,'FILE_TOO_LARGE');
  const config=privateR2Configuration();await verifyPrivateR2Bucket(config);const s3=client(config);
  try {
    await s3.send(new PutObjectCommand({Bucket:config.bucket,Key:key,Body:bytes,ContentType:contentType,IfNoneMatch:'*'}));
    return {key,bucket:config.bucket,sha256:digestBytes(bytes),size:bytes.length,contentType};
  } catch {throw new FileDeliveryError(503,'PRIVATE_STORAGE_WRITE_UNAVAILABLE');} finally {s3.destroy();}
}
export async function downloadFromR2(key:string,userId:string,bucket:string): Promise<{buffer:Buffer;contentType:string}> {
  assertOwnedR2Key(key,userId);const config=privateR2Configuration();
  if(bucket!==config.bucket)throw new FileDeliveryError(404,'FILE_NOT_FOUND');
  await verifyPrivateR2Bucket(config);const s3=client(config);
  try {
    const response=await s3.send(new GetObjectCommand({Bucket:config.bucket,Key:key}));
    if(!response.Body || (response.ContentLength??0)>MAX_PRIVATE_FILE_BYTES)throw new Error('invalid size');
    const chunks:Buffer[]=[];let size=0;
    for await(const chunk of response.Body as AsyncIterable<Uint8Array>) {size+=chunk.length;if(size>MAX_PRIVATE_FILE_BYTES)throw new Error('bounded file required');chunks.push(Buffer.from(chunk));}
    return {buffer:Buffer.concat(chunks),contentType:response.ContentType??'application/octet-stream'};
  } catch {throw new FileDeliveryError(503,'PRIVATE_STORAGE_READ_UNAVAILABLE');} finally {s3.destroy();}
}
export async function removeNewR2Object(key:string,userId:string,bucket:string): Promise<void> {
  assertOwnedR2Key(key,userId);const config=privateR2Configuration();if(bucket!==config.bucket)throw new FileDeliveryError(404,'FILE_NOT_FOUND');
  const s3=client(config);try{await s3.send(new DeleteObjectCommand({Bucket:config.bucket,Key:key}));}catch{throw new FileDeliveryError(503,'PRIVATE_STORAGE_CLEANUP_UNAVAILABLE');}finally{s3.destroy();}
}
