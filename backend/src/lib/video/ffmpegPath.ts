import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

let cachedPath: string | null | undefined;

/** Resolve FFmpeg binary — Fly.io Docker installs to /usr/bin/ffmpeg */
export async function resolveFfmpegPath(): Promise<string | null> {
  if (cachedPath !== undefined) return cachedPath;

  const candidates = [
    process.env.FFMPEG_PATH,
    '/usr/bin/ffmpeg',
    '/bin/ffmpeg',
    'ffmpeg',
  ].filter(Boolean) as string[];

  for (const bin of candidates) {
    try {
      await execFileAsync(bin, ['-version'], { timeout: 5000 });
      cachedPath = bin;
      return bin;
    } catch {
      /* try next */
    }
  }

  cachedPath = null;
  return null;
}

export async function isFfmpegAvailable(): Promise<boolean> {
  return (await resolveFfmpegPath()) !== null;
}
