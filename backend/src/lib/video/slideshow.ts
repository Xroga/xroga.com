import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { writeFile, mkdir, readFile, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { resolveFfmpegPath } from './ffmpegPath.js';

const execFileAsync = promisify(execFile);

async function createSolidFrame(
  ffmpeg: string,
  imagePath: string,
  vertical: boolean
): Promise<void> {
  const size = vertical ? '720x1280' : '1280x720';
  await execFileAsync(ffmpeg, [
    '-f', 'lavfi',
    '-i', `gradients=s=${size}:c0=0x2563eb:c1=0x7c3aed`,
    '-frames:v', '1',
    '-y', imagePath,
  ], { timeout: 15_000 });
}

/** FFmpeg slideshow — visual fallback when all video APIs fail */
export async function generateSlideshowVideo(
  prompt: string,
  durationSeconds = 5,
  imageUrl?: string,
  vertical = false
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
      await createSolidFrame(ffmpeg, imagePath, vertical);
    }

    const scalePad = vertical
      ? 'scale=720:1280:force_original_aspect_ratio=decrease,pad=720:1280:(ow-iw)/2:(oh-ih)/2'
      : 'scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2';
    // Ken Burns: slow zoom + pan so fallback is clearly video, not a static photo
    const kenBurns = vertical
      ? `${scalePad},zoompan=z='min(zoom+0.0012,1.18)':d=${durationSeconds * 24}:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':s=720x1280:fps=24`
      : `${scalePad},zoompan=z='min(zoom+0.0008,1.12)':d=${durationSeconds * 24}:x='iw/2-(iw/zoom/2)+20*sin(on/48)':y='ih/2-(ih/zoom/2)':s=1280x720:fps=24`;

    await execFileAsync(ffmpeg, [
      '-loop', '1',
      '-i', imagePath,
      '-c:v', 'libx264',
      '-t', String(durationSeconds),
      '-pix_fmt', 'yuv420p',
      '-movflags', '+faststart',
      '-vf', kenBurns,
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
