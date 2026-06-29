import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { writeFile, mkdir, readFile, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';

const execFileAsync = promisify(execFile);

/** FFmpeg slideshow — ultimate visual fallback when all video APIs fail */
export async function generateSlideshowVideo(
  prompt: string,
  durationSeconds = 5,
  imageUrl?: string
): Promise<string> {
  const workDir = join(tmpdir(), `xroga-slideshow-${randomUUID()}`);
  await mkdir(workDir, { recursive: true });

  const imagePath = join(workDir, 'frame.png');
  const outputPath = join(workDir, 'slideshow.mp4');

  try {
    await execFileAsync('ffmpeg', ['-version']);

    if (imageUrl) {
      const imgRes = await fetch(imageUrl);
      await writeFile(imagePath, Buffer.from(await imgRes.arrayBuffer()));
    } else {
      const placeholder = `https://placehold.co/1280x720/1a1a2e/006aff/png?text=${encodeURIComponent(prompt.slice(0, 30))}`;
      const imgRes = await fetch(placeholder);
      await writeFile(imagePath, Buffer.from(await imgRes.arrayBuffer()));
    }

    await execFileAsync('ffmpeg', [
      '-loop', '1',
      '-i', imagePath,
      '-c:v', 'libx264',
      '-t', String(durationSeconds),
      '-pix_fmt', 'yuv420p',
      '-vf', 'scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2',
      '-y', outputPath,
    ]);

    const buffer = await readFile(outputPath);
    const base64 = buffer.toString('base64');
    return `data:video/mp4;base64,${base64}`;
  } catch {
    return `data:video/mp4;base64,`;
  } finally {
    for (const f of [imagePath, outputPath]) {
      try { await unlink(f); } catch { /* ignore */ }
    }
  }
}
