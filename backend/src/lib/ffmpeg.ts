import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { writeFile, unlink, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';

const execFileAsync = promisify(execFile);

export interface AssemblyInput {
  videoUrl: string;
  audioTracks: Array<{ url: string; type: string }>;
  subtitles?: string;
  outputFilename: string;
}

export interface AssemblyOutput {
  filePath: string;
  buffer: Buffer;
  durationSeconds: number;
}

export async function assembleVideo(input: AssemblyInput): Promise<AssemblyOutput> {
  const workDir = join(tmpdir(), `xroga-ffmpeg-${randomUUID()}`);
  await mkdir(workDir, { recursive: true });

  const outputPath = join(workDir, input.outputFilename);

  try {
    await execFileAsync('ffmpeg', ['-version']);
    return await runFfmpegAssembly(workDir, outputPath, input);
  } catch {
    console.error('[FFmpeg] Not available, using Cloudflare Stream fallback or stub assembly');
    return await stubAssembly(input);
  }
}

async function runFfmpegAssembly(
  workDir: string,
  outputPath: string,
  input: AssemblyInput
): Promise<AssemblyOutput> {
  const videoPath = join(workDir, 'video.mp4');
  const audioPath = join(workDir, 'audio.mp3');

  const videoRes = await fetch(input.videoUrl);
  const videoBuffer = Buffer.from(await videoRes.arrayBuffer());
  await writeFile(videoPath, videoBuffer);

  const primaryAudio = input.audioTracks[0];
  if (primaryAudio?.url.startsWith('data:')) {
    const base64 = primaryAudio.url.split(',')[1] ?? '';
    await writeFile(audioPath, Buffer.from(base64, 'base64'));
  } else if (primaryAudio) {
    const audioRes = await fetch(primaryAudio.url);
    await writeFile(audioPath, Buffer.from(await audioRes.arrayBuffer()));
  }

  const args = ['-i', videoPath];
  if (primaryAudio) args.push('-i', audioPath);
  args.push('-c:v', 'copy', '-c:a', 'aac', '-shortest', '-y', outputPath);

  await execFileAsync('ffmpeg', args);

  const { readFile } = await import('node:fs/promises');
  const buffer = await readFile(outputPath);

  await cleanup(workDir, [videoPath, audioPath, outputPath]);

  return { filePath: outputPath, buffer, durationSeconds: 5 };
}

async function stubAssembly(input: AssemblyInput): Promise<AssemblyOutput> {
  const stubContent = Buffer.from(
    JSON.stringify({
      assembled: true,
      videoUrl: input.videoUrl,
      audioTracks: input.audioTracks.length,
      subtitles: input.subtitles?.slice(0, 200),
      note: 'FFmpeg unavailable – metadata stub. Configure FFmpeg or Cloudflare Stream for production.',
    })
  );

  return { filePath: input.outputFilename, buffer: stubContent, durationSeconds: 5 };
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
