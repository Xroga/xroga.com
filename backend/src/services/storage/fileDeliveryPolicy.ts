import { createHash } from 'node:crypto';
import { SignJWT, jwtVerify } from 'jose';
import { z } from 'zod';
import type { TenantContext } from '../../security/tenantContext.js';
import { requireTenantContext } from '../../security/tenantContext.js';

export const MAX_PRIVATE_FILE_BYTES = 20 * 1024 * 1024;
export const MAX_FILE_LINK_SECONDS = 300;
export class FileDeliveryError extends Error {
  constructor(readonly status: 400 | 404 | 409 | 416 | 503, readonly code: string) {
    super(status === 404 ? 'File not found or link no longer available.' : status === 400 ? 'Check the file request and retry.' : status === 409 ? 'The file changed. Retry with its current version.' : status === 416 ? 'The requested file range is unavailable.' : 'Secure file delivery is unavailable. Nothing was saved by this request. Retry shortly.');
  }
}
export const storageMetadataSchema = z.object({
  provider: z.enum(['database', 'private_r2']), ownerId: z.string().uuid(),
  sha256: z.string().regex(/^[a-f0-9]{64}$/), size: z.number().int().nonnegative().max(MAX_PRIVATE_FILE_BYTES),
  contentType: z.string().min(1).max(128).regex(/^[a-z0-9.+-]+\/[a-z0-9.+-]+$/i),
  key: z.string().min(1).max(1024).optional(), bucket: z.string().min(3).max(63).optional(),
}).strict();
export type PrivateStorageMetadata = z.infer<typeof storageMetadataSchema>;
export interface OwnedFileRow {
  id: string; project_id: string; file_name: string; file_type?: string | null;
  file_path: string | null; file_url: string | null; content: string | null;
  storage_metadata: unknown; delivery_version: number; projects: {user_id:string};
}
export const digestBytes = (value: Buffer | string) => createHash('sha256').update(value).digest('hex');
export function fileFingerprint(row: OwnedFileRow): string {
  return digestBytes(JSON.stringify([row.id,row.project_id,row.projects.user_id,row.file_path,row.file_name,row.file_type,row.delivery_version,row.storage_metadata,row.content === null ? null : digestBytes(row.content)]));
}
export function privateFileUrl(projectId: string, fileId: string): string {
  return `/api/private-files/${encodeURIComponent(projectId)}/${encodeURIComponent(fileId)}`;
}
function signingKey(env: Record<string,string|undefined>): Uint8Array {
  const encoded = env.FILE_DELIVERY_SIGNING_KEY ?? '';
  const key = Buffer.from(encoded,'base64');
  if (key.length !== 32 || key.toString('base64') !== encoded) throw new FileDeliveryError(503,'FILE_LINK_SIGNING_UNAVAILABLE');
  return key;
}
export async function signFileLink(context: TenantContext, row: OwnedFileRow, ttl: number, now = Date.now(), env: Record<string,string|undefined> = process.env): Promise<{token:string;expiresAt:string}> {
  const scope = requireTenantContext(context);
  if (row.projects.user_id !== scope.userId) throw new FileDeliveryError(404,'FILE_NOT_FOUND');
  if (!Number.isInteger(ttl) || ttl < 1 || ttl > MAX_FILE_LINK_SECONDS) throw new FileDeliveryError(400,'INVALID_FILE_LINK_EXPIRY');
  const seconds = Math.floor(now / 1000), expiry = seconds + ttl;
  const token = await new SignJWT({ purpose:'private-file-read-v1',fileId:row.id,projectId:row.project_id,ownerId:scope.userId,epoch:row.delivery_version,fingerprint:fileFingerprint(row) })
    .setProtectedHeader({alg:'HS256',typ:'JWT'}).setIssuer('xroga:file-delivery').setAudience(`owner:${scope.userId}`).setIssuedAt(seconds).setExpirationTime(expiry).sign(signingKey(env));
  return { token, expiresAt:new Date(expiry*1000).toISOString() };
}
export async function verifyFileLink(context: TenantContext, row: OwnedFileRow, token: string, now = Date.now(), env: Record<string,string|undefined> = process.env): Promise<void> {
  const scope = requireTenantContext(context), key = signingKey(env);
  try {
    if (token.length > 2048) throw new Error('bounded token required');
    const {payload} = await jwtVerify(token,key,{algorithms:['HS256'],issuer:'xroga:file-delivery',audience:`owner:${scope.userId}`,currentDate:new Date(now)});
    if (payload.purpose !== 'private-file-read-v1' || payload.ownerId !== scope.userId || row.projects.user_id !== scope.userId || payload.fileId !== row.id || payload.projectId !== row.project_id || payload.epoch !== row.delivery_version || payload.fingerprint !== fileFingerprint(row) || !Number.isInteger(payload.iat) || !Number.isInteger(payload.exp) || payload.exp! - payload.iat! > MAX_FILE_LINK_SECONDS || payload.exp! <= payload.iat! || payload.iat!*1000 > now) throw new Error('invalid scope');
  } catch { throw new FileDeliveryError(404,'FILE_LINK_UNAVAILABLE'); }
}
export function fileResponseHeaders(fileName: string, mime: string): Record<string,string> {
  const inline = ['image/png','image/jpeg','image/gif','image/webp','image/avif','video/mp4','video/webm','audio/mpeg','audio/mp4','audio/wav'].includes(mime);
  const type = inline ? mime : 'application/octet-stream';
  const name = fileName.replace(/[\r\n\x00-\x1f\x7f]/g,'').slice(0,200) || 'download';
  const encoded=encodeURIComponent(name).replace(/['()*]/g,value=>`%${value.charCodeAt(0).toString(16).toUpperCase()}`);
  return { 'Content-Type':type,'Content-Disposition':`${inline?'inline':'attachment'}; filename*=UTF-8''${encoded}`,'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','Content-Security-Policy':"sandbox; default-src 'none'",'Accept-Ranges':'bytes' };
}
export function selectFileRange(buffer: Buffer, range?: string): {status:200|206;body:Buffer;headers:Record<string,string>} {
  if (!range) return {status:200,body:buffer,headers:{'Content-Length':String(buffer.length)}};
  const match = /^bytes=(\d*)-(\d*)$/.exec(range);
  if (!match || (!match[1] && !match[2]) || buffer.length === 0) throw new FileDeliveryError(416,'INVALID_FILE_RANGE');
  for(const value of [match[1],match[2]])if(value && !Number.isSafeInteger(Number(value)))throw new FileDeliveryError(416,'INVALID_FILE_RANGE');
  const start = match[1] ? Number(match[1]) : Math.max(0,buffer.length-Number(match[2]));
  const end = match[1] ? (match[2] ? Math.min(Number(match[2]),buffer.length-1) : buffer.length-1) : buffer.length-1;
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || start >= buffer.length || end < start || (!match[1] && Number(match[2]) < 1)) throw new FileDeliveryError(416,'INVALID_FILE_RANGE');
  const body = buffer.subarray(start,end+1);
  return {status:206,body,headers:{'Content-Length':String(body.length),'Content-Range':`bytes ${start}-${end}/${buffer.length}`}};
}
