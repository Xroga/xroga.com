import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { writeFile, mkdir, readFile, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { resolveFfmpegPath } from './ffmpegPath.js';

const execFileAsync = promisify(execFile);

/** FFmpeg-only MP4 — works when all video APIs fail (no external keys needed) */
export async function generateMinimalMp4(prompt: string, durationSeconds = 5): Promise<string> {
  const ffmpeg = await resolveFfmpegPath();
  if (!ffmpeg) {
    throw new Error('FFmpeg unavailable for minimal video');
  }

  const workDir = join(tmpdir(), `xroga-minimal-${randomUUID()}`);
  await mkdir(workDir, { recursive: true });
  const outputPath = join(workDir, 'minimal.mp4');
  const dur = Math.min(Math.max(durationSeconds, 3), 30);

  try {
    await execFileAsync(
      ffmpeg,
      [
        '-f',
        'lavfi',
        '-i',
        `color=c=0x2563eb:s=1280x720:d=${dur}`,
        '-vf',
        'scale=1280:720,format=yuv420p',
        '-c:v',
        'libx264',
        '-pix_fmt',
        'yuv420p',
        '-movflags',
        '+faststart',
        '-y',
        outputPath,
      ],
      { timeout: 60_000 }
    );

    const buffer = await readFile(outputPath);
    if (buffer.length < 500) throw new Error('Minimal MP4 empty');
    return `data:video/mp4;base64,${buffer.toString('base64')}`;
  } finally {
    try {
      await unlink(outputPath);
    } catch {
      /* ignore */
    }
  }
}
