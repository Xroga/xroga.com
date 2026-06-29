import { generateVideoWithFallback } from '../../lib/videoProviders.js';
import { generateSceneAudio } from '../../lib/audioProviders.js';
import { assembleVideo, downloadVideoBuffer } from '../../lib/ffmpeg.js';
import { parseVideoDuration, computeVideoActionCost } from './videoUtils.js';
import { storeUserFile } from '../storage/projectFiles.js';
import type { VideoStudioOutput } from '../../types/features.js';
import type { ProduceVideoOptions } from './produceVideo.js';

export { parseVideoDuration, computeVideoActionCost };

function extractVideoPrompt(userPrompt: string): string {
  const patterns = [
    /generate\s+(?:an?\s+)?video\s+of\s+(.+)/i,
    /create\s+(?:an?\s+)?video\s+of\s+(.+)/i,
    /make\s+(?:an?\s+)?video\s+(?:of\s+)?(.+)/i,
    /film\s+(.+)/i,
    /video:\s*(.+)/i,
  ];
  for (const pattern of patterns) {
    const match = userPrompt.match(pattern);
    if (match?.[1]) return match[1].trim();
  }
  return userPrompt;
}

/** Fast single-scene video — Agnes hub first, minimal LLM overhead */
export async function produceSingleSceneVideo(
  userId: string,
  prompt: string,
  projectId?: string,
  options?: ProduceVideoOptions
): Promise<VideoStudioOutput> {
  const durationSeconds = Math.min(parseVideoDuration(prompt), 8);
  const actionCost = computeVideoActionCost(durationSeconds);
  const scenePrompt = extractVideoPrompt(prompt);
  const title = scenePrompt.slice(0, 80);

  options?.onProgress?.('rendering', 'Rendering video…');

  const video = await generateVideoWithFallback(scenePrompt, durationSeconds, {
    userId,
    runId: options?.runId,
    priority: 'cheap',
  });

  options?.onProgress?.('audio', 'Adding audio…');

  let assemblyBuffer: Buffer;
  try {
    const audioTracks = await generateSceneAudio('', 'cinematic', durationSeconds, {
      userId,
      runId: options?.runId,
    });
    options?.onProgress?.('assembling', 'Assembling…');
    const assembly = await assembleVideo({
      videoUrl: video.videoUrl,
      audioTracks: audioTracks.map((t) => ({ url: t.url, type: t.type })),
      outputFilename: `xroga-video-${Date.now()}.mp4`,
    });
    assemblyBuffer = assembly.buffer;
  } catch {
    assemblyBuffer = await downloadVideoBuffer(video.videoUrl);
  }

  const { fileUrl } = await storeUserFile(
    userId,
    `video-${Date.now()}.mp4`,
    assemblyBuffer,
    'video/mp4'
  );

  if (projectId) {
    const { storeProjectFile } = await import('../storage/projectFiles.js');
    await storeProjectFile(userId, projectId, `video-${Date.now()}.mp4`, assemblyBuffer, 'video/mp4', 'video');
  }

  options?.onProgress?.('complete', 'Your video is ready!');

  return {
    type: 'video_studio',
    title,
    streamingUrl: fileUrl,
    durationSeconds,
    actionCost,
    screenplay: {
      title,
      mood: 'cinematic',
      scenes: [{ number: 1, description: scenePrompt, dialogue: '', durationSeconds }],
    },
    selectedProvider: video.provider,
    reviewScores: { physics: 8, lighting: 8, consistency: 8 },
    providersUsed: [video.provider],
    audioTracks: [],
    sceneCount: 1,
  };
}
