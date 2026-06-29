import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { writeFile, mkdir, readFile, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { resolveFfmpegPath } from './ffmpegPath.js';

const execFileAsync = promisify(execFile);

/** FFmpeg slideshow — visual fallback when all video APIs fail */
export async function generateSlideshowVideo(
  prompt: string,
  durationSeconds = 5,
  imageUrl?: string
): Promise<string> {
  const ffmpeg = await resolveFfmpegPath();
  if (!ffmpeg) {
    throw new Error('Slideshow video generation failed — FFmpeg unavailable');
  }

  const workDir = join(tmpdir(), `xroga-slideshow-${randomUUID()}`);
  await mkdir(workDir, { recursive: true });

  const imagePath = join(workDir, 'frame.png');
  const outputPath = join(workDir, 'slideshow.mp4');

  try {
    if (imageUrl) {
      const imgRes = await fetch(imageUrl, { signal: AbortSignal.timeout(30_000) });
      if (!imgRes.ok) throw new Error(`Failed to fetch keyframe: ${imgRes.status}`);
      await writeFile(imagePath, Buffer.from(await imgRes.arrayBuffer()));
    } else {
      const placeholder = `https://placehold.co/1280x720/1a1a2e/006aff/png?text=${encodeURIComponent(prompt.slice(0, 30))}`;
      const imgRes = await fetch(placeholder, { signal: AbortSignal.timeout(15_000) });
      await writeFile(imagePath, Buffer.from(await imgRes.arrayBuffer()));
    }

    await execFileAsync(ffmpeg, [
      '-loop', '1',
      '-i', imagePath,
      '-c:v', 'libx264',
      '-t', String(durationSeconds),
      '-pix_fmt', 'yuv420p',
      '-vf', 'scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2',
      '-y', outputPath,
    ], { timeout: 120_000 });

    const buffer = await readFile(outputPath);
    if (buffer.length < 1000) {
      throw new Error('FFmpeg produced empty slideshow');
    }
    const base64 = buffer.toString('base64');
    return `data:video/mp4;base64,${base64}`;
  } catch (err) {
    const msg = (err as Error).message;
    if (msg.includes('FFmpeg unavailable')) throw err;
    throw new Error(`Slideshow video generation failed — ${msg.slice(0, 120)}`);
  } finally {
    for (const f of [imagePath, outputPath]) {
      try { await unlink(f); } catch { /* ignore */ }
    }
  }
}
