import type { SupabaseClient } from '@supabase/supabase-js';

const extensions: Record<string, string> = {
  'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/gif': 'gif',
};

/** Public profile images only. This is not a private-file upload path. */
export async function persistAvatarUpload(
  client: SupabaseClient,
  file: File,
  saveProfile: (url: string) => Promise<void>,
): Promise<void> {
  const extension = extensions[file.type];
  if (!extension || file.size === 0 || file.size > 5 * 1024 * 1024) {
    throw new Error('Choose a PNG, JPEG, WebP or GIF image up to 5 MB.');
  }
  const { data, error } = await client.auth.getUser();
  if (error || !data.user) throw new Error('Sign in again before uploading a photo.');
  // RLS independently enforces the first path segment against auth.uid().
  // Never carry the supplied filename into the object key.
  const path = `${data.user.id}/${crypto.randomUUID()}.${extension}`;
  const bucket = client.storage.from('avatars');
  const uploaded = await bucket.upload(path, file, { contentType: file.type, upsert: false });
  if (uploaded.error) throw new Error('Photo upload failed. Please retry.');
  const { data: result } = bucket.getPublicUrl(path);
  // A successful object upload is not a successful profile save. Propagate
  // failure without replacing account state or fabricating a data-URL success.
  await saveProfile(result.publicUrl);
}

export function avatarProfileUrl(value: string, origin: string): string {
  const url = new URL(value, origin);
  if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) {
    throw new Error('Choose an uploaded photo or a profile image.');
  }
  return url.href;
}
