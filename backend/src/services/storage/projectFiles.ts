import { getSupabaseAdmin } from '../../config/supabase.js';
import { uploadToR2, buildR2Key, buildPlaybackUrl, downloadFromR2, type R2UploadResult } from '../../lib/r2.js';
import { saveLocalMedia, readLocalMedia } from './localMediaCache.js';

export interface StoredFile {
  id: string;
  fileName: string;
  fileUrl: string;
  fileType: 'code' | 'video' | 'image' | 'audio' | 'pdf' | 'other';
  projectId?: string;
}

export async function storeProjectFile(
  userId: string,
  projectId: string,
  filename: string,
  content: Buffer | string,
  contentType: string,
  fileType: StoredFile['fileType']
): Promise<StoredFile> {
  const key = buildR2Key(userId, filename);
  let r2Result: R2UploadResult;

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
  };
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

export async function readStoredFile(key: string): Promise<{ buffer: Buffer; contentType: string }> {
  try {
    return await downloadFromR2(key);
  } catch (r2Err) {
    const local = await readLocalMedia(key);
    if (local) return local;
    throw r2Err;
  }
}
