import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { writeFile, unlink, mkdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';

import { isValidMp4Buffer, isStubJsonBuffer } from './mediaValidation.js';
import { resolveFfmpegPath } from './video/ffmpegPath.js';

const execFileAsync = promisify(execFile);

async function ffmpegBin(): Promise<string> {
  const bin = await resolveFfmpegPath();
  if (!bin) throw new Error('FFmpeg not available');
  return bin;
}

export interface AssemblyInput {
  videoUrl: string;
  audioTracks: Array<{ url: string; type: string }>;
  subtitles?: string;
  outputFilename: string;
}

export interface MultiSceneInput {
  scenes: Array<{
    videoUrl: string;
    audioTracks: Array<{ url: string; type: string }>;
    subtitles?: string;
  }>;
  outputFilename: string;
}

export interface AssemblyOutput {
  filePath: string;
  buffer: Buffer;
  durationSeconds: number;
}

async function downloadToFile(url: string, destPath: string): Promise<void> {
  if (url.startsWith('data:')) {
    const base64 = url.split(',')[1] ?? '';
    await writeFile(destPath, Buffer.from(base64, 'base64'));
    return;
  }
  const res = await fetch(url);
  await writeFile(destPath, Buffer.from(await res.arrayBuffer()));
}

export interface ExtractFrameOptions {
  /** Seek position in seconds (default 1) */
  atSeconds?: number;
}

/**
 * Extract a single JPEG frame from a video URL for vision QC / alignment checks.
 */
export async function extractVideoFrame(
  videoUrl: string,
  options?: ExtractFrameOptions
): Promise<string> {
  const atSeconds = options?.atSeconds ?? 1;
  const workDir = join(tmpdir(), `xroga-frame-${randomUUID()}`);
  await mkdir(workDir, { recursive: true });
  const videoPath = join(workDir, 'input.mp4');
  const framePath = join(workDir, 'frame.jpg');

  try {
    await downloadToFile(videoUrl, videoPath);
    const bin = await ffmpegBin();
    await execFileAsync(bin, [
      '-ss',
      String(atSeconds),
      '-i',
      videoPath,
      '-vframes',
      '1',
      '-q:v',
      '2',
      '-y',
      framePath,
    ]);
    const buffer = await readFile(framePath);
    return `data:image/jpeg;base64,${buffer.toString('base64')}`;
  } catch (err) {
    if (videoUrl.startsWith('http')) {
      try {
        const res = await fetch(videoUrl, { signal: AbortSignal.timeout(20_000) });
        if (res.ok) {
          const ct = res.headers.get('content-type') ?? '';
          if (ct.startsWith('image/')) {
            const buffer = Buffer.from(await res.arrayBuffer());
            const mime = ct.split(';')[0];
            return `data:${mime};base64,${buffer.toString('base64')}`;
          }
        }
      } catch {
        /* continue */
      }
    }
    throw err;
  } finally {
    try {
      await unlink(videoPath);
    } catch {
      /* ignore */
    }
    try {
      await unlink(framePath);
    } catch {
      /* ignore */
    }
    try {
      const { rmdir } = await import('node:fs/promises');
      await rmdir(workDir);
    } catch {
      /* ignore */
    }
  }
}

/** Download video bytes directly — used when FFmpeg mux fails */
export async function downloadVideoBuffer(videoUrl: string): Promise<Buffer> {
  if (videoUrl.startsWith('data:video/')) {
    const base64 = videoUrl.split(',')[1] ?? '';
    return Buffer.from(base64, 'base64');
  }
  const res = await fetch(videoUrl);
  if (!res.ok) throw new Error(`Failed to download video: ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

async function cleanup(workDir: string, files: string[]): Promise<void> {
  for (const f of files) {
    try { await unlink(f); } catch { /* ignore */ }
  }
  try {
    const { rmdir } = await import('node:fs/promises');
    await rmdir(workDir);
  } catch { /* ignore */ }
}

export async function assembleVideo(input: AssemblyInput): Promise<AssemblyOutput> {
  const workDir = join(tmpdir(), `xroga-ffmpeg-${randomUUID()}`);
  await mkdir(workDir, { recursive: true });
  const outputPath = join(workDir, input.outputFilename);

  try {
    await execFileAsync(await ffmpegBin(), ['-version']);
    try {
      return await runFfmpegAssembly(workDir, outputPath, input);
    } catch (asmErr) {
      console.error('[FFmpeg] Assembly failed, using raw video:', (asmErr as Error).message);
      const buffer = await downloadVideoBuffer(input.videoUrl);
      if (isStubJsonBuffer(buffer) || !isValidMp4Buffer(buffer)) {
        throw new Error('Invalid video data from provider');
      }
      return { filePath: input.outputFilename, buffer, durationSeconds: 5 };
    }
  } catch {
    console.error('[FFmpeg] Not available, returning raw video download');
    const buffer = await downloadVideoBuffer(input.videoUrl);
    if (isStubJsonBuffer(buffer) || !isValidMp4Buffer(buffer)) {
      throw new Error('Video file is invalid — provider returned no playable MP4');
    }
    return { filePath: input.outputFilename, buffer, durationSeconds: 5 };
  }
}

export async function assembleMultiSceneVideo(input: MultiSceneInput): Promise<AssemblyOutput> {
  if (input.scenes.length === 1) {
    const scene = input.scenes[0];
    return assembleVideo({
      videoUrl: scene.videoUrl,
      audioTracks: scene.audioTracks,
      subtitles: scene.subtitles,
      outputFilename: input.outputFilename,
    });
  }

  const workDir = join(tmpdir(), `xroga-ffmpeg-multi-${randomUUID()}`);
  await mkdir(workDir, { recursive: true });
  const outputPath = join(workDir, input.outputFilename);
  const sceneFiles: string[] = [];
  const tempFiles: string[] = [];

  try {
    await execFileAsync(await ffmpegBin(), ['-version']);

    for (let i = 0; i < input.scenes.length; i++) {
      const scene = input.scenes[i];
      const scenePath = join(workDir, `scene-${i}.mp4`);
      tempFiles.push(scenePath);

      const assembled = await runFfmpegAssembly(workDir, scenePath, {
        videoUrl: scene.videoUrl,
        audioTracks: scene.audioTracks,
        subtitles: scene.subtitles,
        outputFilename: `scene-${i}.mp4`,
      });
      sceneFiles.push(assembled.filePath);
    }

    const concatListPath = join(workDir, 'concat.txt');
    await writeFile(concatListPath, sceneFiles.map((f) => `file '${f}'`).join('\n'));
    tempFiles.push(concatListPath);

    await execFileAsync(await ffmpegBin(), [
      '-f', 'concat',
      '-safe', '0',
      '-i', concatListPath,
      '-c', 'copy',
      '-y', outputPath,
    ]);

    const buffer = await readFile(outputPath);
    const durationSeconds = input.scenes.length * 5;
    tempFiles.push(outputPath);
    await cleanup(workDir, tempFiles);

    return { filePath: outputPath, buffer, durationSeconds };
  } catch (err) {
    console.error('[FFmpeg] Multi-scene assembly failed:', (err as Error).message);
    const first = input.scenes[0];
    return assembleVideo({
      videoUrl: first.videoUrl,
      audioTracks: first.audioTracks,
      subtitles: first.subtitles,
      outputFilename: input.outputFilename,
    });
  }
}

async function runFfmpegAssembly(
  workDir: string,
  outputPath: string,
  input: AssemblyInput
): Promise<AssemblyOutput> {
  const videoPath = join(workDir, `video-${randomUUID()}.mp4`);
  const audioPath = join(workDir, `audio-${randomUUID()}.mp3`);
  const tempFiles = [videoPath, audioPath, outputPath];

  await downloadToFile(input.videoUrl, videoPath);

  const primaryAudio = input.audioTracks.find((t) => t.type === 'voiceover') ?? input.audioTracks[0];
  if (primaryAudio?.url) {
    await downloadToFile(primaryAudio.url, audioPath);
  }

  const args = ['-i', videoPath];
  if (primaryAudio?.url) args.push('-i', audioPath);
  args.push('-c:v', 'copy', '-c:a', 'aac', '-shortest', '-y', outputPath);

  await execFileAsync(await ffmpegBin(), args);

  const buffer = await readFile(outputPath);
  await cleanup(workDir, tempFiles);

  return { filePath: outputPath, buffer, durationSeconds: 5 };
}

async function stubAssembly(input: AssemblyInput): Promise<AssemblyOutput> {
  const stubContent = Buffer.from(
    JSON.stringify({
      assembled: true,
      videoUrl: input.videoUrl,
      audioTracks: input.audioTracks.length,
      subtitles: input.subtitles?.slice(0, 200),
      note: 'FFmpeg unavailable – metadata stub.',
    })
  );

  return { filePath: input.outputFilename, buffer: stubContent, durationSeconds: 5 };
}

export interface GifConvertOptions {
  fps?: number;
  width?: number;
}

/** Convert MP4 buffer to animated GIF (for image-to-gif requests). */
export async function convertVideoBufferToGif(
  mp4Buffer: Buffer,
  options?: GifConvertOptions
): Promise<Buffer> {
  const fps = options?.fps ?? 12;
  const width = options?.width ?? 480;
  const workDir = join(tmpdir(), `xroga-gif-${randomUUID()}`);
  await mkdir(workDir, { recursive: true });
  const videoPath = join(workDir, 'input.mp4');
  const palettePath = join(workDir, 'palette.png');
  const gifPath = join(workDir, 'out.gif');

  try {
    await writeFile(videoPath, mp4Buffer);
    const bin = await ffmpegBin();
    await execFileAsync(bin, [
      '-i',
      videoPath,
      '-vf',
      `fps=${fps},scale=${width}:-1:flags=lanczos,palettegen`,
      '-y',
      palettePath,
    ]);
    await execFileAsync(bin, [
      '-i',
      videoPath,
      '-i',
      palettePath,
      '-lavfi',
      `fps=${fps},scale=${width}:-1:flags=lanczos[x];[x][1:v]paletteuse`,
      '-y',
      gifPath,
    ]);
    return await readFile(gifPath);
  } finally {
    for (const f of [videoPath, palettePath, gifPath]) {
      try {
        await unlink(f);
      } catch {
        /* ignore */
      }
    }
    try {
      const { rmdir } = await import('node:fs/promises');
      await rmdir(workDir);
    } catch {
      /* ignore */
    }
  }
}

export async function assembleViaCloudflareStream(
  videoUrl: string,
  accountId: string,
  apiToken: string
): Promise<string> {
  const response = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${accountId}/stream/copy`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ url: videoUrl, meta: { source: 'xroga-video-studio' } }),
    }
  );

  if (!response.ok) throw new Error(`Cloudflare Stream error: ${response.status}`);

  const data = (await response.json()) as { result: { playback: { hls: string } } };
  return data.result.playback.hls;
}
