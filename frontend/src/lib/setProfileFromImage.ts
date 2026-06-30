import type { useAvatarUpdate } from '@/hooks/useAvatarUpdate';

type AvatarApi = Pick<ReturnType<typeof useAvatarUpdate>, 'setAvatarUrl' | 'uploadAvatarFile'>;

/** Set user profile photo from a generated or media image URL (http or data:). */
export async function setProfileFromImageUrl(
  imageUrl: string,
  { setAvatarUrl, uploadAvatarFile }: AvatarApi
): Promise<void> {
  if (!imageUrl?.trim()) throw new Error('No image URL');

  if (imageUrl.startsWith('http://') || imageUrl.startsWith('https://')) {
    await setAvatarUrl(imageUrl);
    return;
  }

  if (!imageUrl.startsWith('data:image/')) {
    throw new Error('Unsupported image format');
  }

  const res = await fetch(imageUrl);
  const blob = await res.blob();
  const ext = blob.type.includes('jpeg') ? 'jpg' : blob.type.includes('webp') ? 'webp' : 'png';
  const file = new File([blob], `xroga-profile.${ext}`, { type: blob.type || 'image/png' });
  await uploadAvatarFile(file);
}
