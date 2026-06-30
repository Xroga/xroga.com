import { buildR2Key, uploadToR2 } from './r2.js';

const DATA_URL_RE = /^data:(image\/[^;]+);base64,(.+)$/;

function r2Configured(): boolean {
  const accountId = process.env.CLOUDFLARE_R2_ACCOUNT_ID ?? process.env.CLOUDFLARE_ACCOUNT_ID;
  return Boolean(accountId && process.env.CLOUDFLARE_R2_ACCESS_KEY && process.env.CLOUDFLARE_R2_SECRET_KEY);
}

/** Upload inline data URLs to R2 when configured — keeps API responses small and browser-safe. */
export async function persistImageUrl(
  imageUrl: string,
  ctx: { userId?: string; label?: string }
): Promise<string> {
  if (!imageUrl.startsWith('data:image/')) return imageUrl;

  const match = imageUrl.match(DATA_URL_RE);
  if (!match) return imageUrl;

  const [, mime, b64] = match;
  if (!r2Configured()) return imageUrl;

  try {
    const buffer = Buffer.from(b64, 'base64');
    if (buffer.length > 8 * 1024 * 1024) return imageUrl;

    const ext = mime.includes('jpeg') || mime.includes('jpg') ? 'jpg' : mime.includes('webp') ? 'webp' : 'png';
    const key = buildR2Key(ctx.userId ?? 'anon', `gen-${ctx.label ?? 'image'}.${ext}`);
    const uploaded = await uploadToR2(key, buffer, mime);
    return uploaded.publicUrl;
  } catch (err) {
    console.warn('[persistImageUrl] R2 upload failed:', (err as Error).message);
    return imageUrl;
  }
}
