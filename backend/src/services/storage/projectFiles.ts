import { getSupabaseAdmin } from '../../config/supabase.js';
import { uploadToR2, buildR2Key, buildPlaybackUrl, downloadFromR2, type R2UploadResult } from '../../lib/r2.js';
import { saveLocalMedia, readLocalMedia } from './localMediaCache.js';
import { actorFromUserId, getMigrationLedger, getStorageService, storageReadOrder, storageWriteMode } from '../../storage/runtime.js';
import { readStoredFileOrdered } from '../../storage/migration/readCompat.js';
import { StorageError, type ObjectClass } from '../../storage/types.js';

export interface StoredFile {
  id: string;
  fileName: string;
  fileUrl: string;
  fileType: 'code' | 'video' | 'image' | 'audio' | 'pdf' | 'other';
  projectId?: string;
  /** Canonical Xroga Drive object, present only when the verified private write succeeded. */
  storageObjectId?: string;
  /**
   * True only when the bytes are in verified private storage. `false` means the legacy path (public R2 URL, data URL or
   * ephemeral cache) is the only copy: callers must not present it as durable.
   */
  canonicalDurable?: boolean;
}

const CLASS_BY_FILE_TYPE: Record<StoredFile['fileType'], ObjectClass> = {
  code: 'artifact', video: 'media', image: 'media', audio: 'media', pdf: 'artifact', other: 'artifact',
};

async function writeCanonical(userId: string, projectId: string | null, filename: string, content: Buffer | string, contentType: string, fileType: StoredFile['fileType']) {
  const svc = getStorageService();
  if (!svc) throw new StorageError('PROVIDER_UNAVAILABLE', 'Xroga Drive is not configured', 503);
  return svc.putServerObject(actorFromUserId(userId), {
    projectId, objectClass: CLASS_BY_FILE_TYPE[fileType], filename, contentType,
    body: typeof content === 'string' ? Buffer.from(content) : content,
  });
}

export async function storeProjectFile(
  userId: string,
  projectId: string,
  filename: string,
  content: Buffer | string,
  contentType: string,
  fileType: StoredFile['fileType']
): Promise<StoredFile> {
  const mode = storageWriteMode();
  if (mode === 'r2') return storeProjectFileCanonicalOnly(userId, projectId, filename, content, contentType, fileType);

  const key = buildR2Key(userId, filename);
  let r2Result: R2UploadResult;
  // dual: the canonical write runs alongside the legacy one. Its failure is recorded, never hidden, and never upgraded to "durable".
  const canonical = mode === 'dual'
    ? await writeCanonical(userId, projectId, filename, content, contentType, fileType).then((o) => o, (e) => { console.error('[Storage] canonical write failed in dual mode:', (e as Error).message); return null; })
    : null;

  try {
    r2Result = await uploadToR2(key, content, contentType);
  } catch (err) {
    console.error('[Storage] R2 upload failed, using data URL fallback:', (err as Error).message);
    const base64 = (typeof content === 'string' ? Buffer.from(content) : content).toString('base64');
    r2Result = {
      key,
      publicUrl: `data:${contentType};base64,${base64}`,
      bucket: 'local-fallback',
    };
  }

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from('project_files')
    .insert({
      project_id: projectId,
      file_name: filename,
      file_path: key,
      file_type: fileType,
      file_url: r2Result.publicUrl,
      content: typeof content === 'string' && content.length < 50000 ? content : null,
      ...(canonical ? { storage_object_id: canonical.id } : {}),
    })
    .select()
    .single();

  if (error || !data) {
    throw new Error(`Failed to record project file: ${error?.message}`);
  }

  return {
    id: data.id,
    fileName: filename,
    fileUrl: r2Result.publicUrl,
    fileType,
    projectId,
    storageObjectId: canonical?.id,
    canonicalDurable: canonical?.state === 'READY',
  };
}

/** `STORAGE_WRITE_MODE=r2`: verified private storage or a hard failure. No data-URL, no /tmp cache, no public URL. */
async function storeProjectFileCanonicalOnly(
  userId: string, projectId: string, filename: string, content: Buffer | string, contentType: string, fileType: StoredFile['fileType'],
): Promise<StoredFile> {
  const obj = await writeCanonical(userId, projectId, filename, content, contentType, fileType);
  if (obj.state !== 'READY') throw new StorageError('BAD_STATE', 'canonical write did not reach READY', 409);
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from('project_files')
    .insert({
      project_id: projectId, file_name: filename, file_path: null, file_type: fileType,
      // stable reference, resolved through POST /api/drive/objects/:id/download-url (never a public URL)
      file_url: `drive://${obj.id}`,
      content: typeof content === 'string' && content.length < 50000 ? content : null,
      storage_object_id: obj.id,
    })
    .select().single();
  if (error || !data) throw new Error(`Failed to record project file: ${error?.message}`);
  return { id: data.id, fileName: filename, fileUrl: `drive://${obj.id}`, fileType, projectId, storageObjectId: obj.id, canonicalDurable: true };
}

export async function storeUserFile(
  userId: string,
  filename: string,
  content: Buffer | string,
  contentType: string
): Promise<{ fileUrl: string; playbackUrl: string; key: string }> {
  const key = buildR2Key(userId, filename);
  const playbackUrl = buildPlaybackUrl(key);
  const buffer = typeof content === 'string' ? Buffer.from(content) : content;

  try {
    const result = await uploadToR2(key, buffer, contentType);
    return { fileUrl: result.publicUrl, playbackUrl, key: result.key };
  } catch (err) {
    console.error('[Storage] R2 upload failed, using local cache:', (err as Error).message);
    try {
      await saveLocalMedia(key, buffer, contentType);
      // HTTP stream URL works in browser and survives session storage (unlike data URLs)
      return { fileUrl: playbackUrl, playbackUrl, key };
    } catch (cacheErr) {
      console.error('[Storage] Local cache failed:', (cacheErr as Error).message);
      const base64 = buffer.toString('base64');
      const dataUrl = `data:${contentType};base64,${base64}`;
      return { fileUrl: dataUrl, playbackUrl: dataUrl, key };
    }
  }
}

export async function readStoredFile(key: string, actor?: { userId: string }): Promise<{ buffer: Buffer; contentType: string }> {
  const legacy = async () => {
    try {
      return await downloadFromR2(key);
    } catch (r2Err) {
      const local = await readLocalMedia(key);
      if (local) return local;
      throw r2Err;
    }
  };
  const drive = getStorageService();
  const ledger = getMigrationLedger();
  // Callers that pass an actor get ownership + ordering enforcement; callers that do not keep the exact legacy behaviour.
  if (!actor || !drive || !ledger) return legacy();
  const r = await readStoredFileOrdered(key, actorFromUserId(actor.userId), { ledger, drive, readLegacy: legacy, order: storageReadOrder() });
  return { buffer: r.buffer, contentType: r.contentType };
}
