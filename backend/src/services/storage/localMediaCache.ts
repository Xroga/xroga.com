import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

const CACHE_ROOT = process.env.MEDIA_CACHE_DIR ?? '/tmp/xroga-media';

function cachePath(key: string): string {
  return join(CACHE_ROOT, key);
}

/** Persist video bytes locally when R2 is unavailable — still served via /api/media/stream */
export async function saveLocalMedia(key: string, buffer: Buffer, contentType: string): Promise<void> {
  const path = cachePath(key);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, buffer);
  await writeFile(`${path}.meta`, contentType, 'utf8');
}

export async function readLocalMedia(
  key: string
): Promise<{ buffer: Buffer; contentType: string } | null> {
  try {
    const path = cachePath(key);
    const [buffer, meta] = await Promise.all([
      readFile(path),
      readFile(`${path}.meta`, 'utf8').catch(() => 'video/mp4'),
    ]);
    return { buffer, contentType: meta };
  } catch {
    return null;
  }
}
