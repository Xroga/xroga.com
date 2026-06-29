import { generateVideoWithFallback } from '../../lib/videoProviders.js';
import { downloadVideoBuffer } from '../../lib/ffmpeg.js';
import { isValidMp4Buffer, isHttpMediaUrl, isStubJsonBuffer } from '../../lib/mediaValidation.js';
import { parseVideoDuration, computeVideoActionCost } from './videoUtils.js';
import { storeUserFile } from '../storage/projectFiles.js';
import type { VideoStudioOutput } from '../../types/features.js';
import type { ProduceVideoOptions } from './produceVideo.js';
import { moderateImagePrompt } from '../builder/image/contentModeration.js';

export { parseVideoDuration, computeVideoActionCost };

function extractVideoPrompt(userPrompt: string): string {
  const patterns = [
    /generate\s+(?:an?\s+)?(?:\d+\s*(?:second|sec|s)\s+)?(?:video|clip)\s+(?:of\s+)?(.+)/i,
    /create\s+(?:an?\s+)?video\s+of\s+(.+)/i,
    /make\s+(?:an?\s+)?video\s+(?:of\s+)?(.+)/i,
    /film\s+(.+)/i,
    /video:\s*(.+)/i,
  ];
  for (const pattern of patterns) {
    const match = userPrompt.match(pattern);
    if (match?.[1]) return match[1].trim();
  }
  return userPrompt.replace(/\b(generate|create|make|produce)\b/gi, '').trim();
}

/** Fast single-scene video — Agnes hub first, store real MP4 only */
export async function produceSingleSceneVideo(
  userId: string,
  prompt: string,
  projectId?: string,
  options?: ProduceVideoOptions
): Promise<VideoStudioOutput> {
  const durationSeconds = Math.min(Math.max(parseVideoDuration(prompt), 3), 8);
  const actionCost = computeVideoActionCost(durationSeconds);
  const scenePrompt = extractVideoPrompt(prompt);
  const title = scenePrompt.slice(0, 80) || 'Xroga Video';

  const moderation = moderateImagePrompt(scenePrompt);
  if (!moderation.allowed) {
    throw new Error(moderation.reason ?? 'This video request is not allowed.');
  }

  const enhancedPrompt = moderation.sanitizedPrompt ?? scenePrompt;

  options?.onProgress?.('rendering', 'Rendering video…');

  const video = await generateVideoWithFallback(enhancedPrompt, durationSeconds, {
    userId,
    runId: options?.runId,
    priority: 'cheap',
  });

  if (!video.videoUrl || video.videoUrl === 'data:video/mp4;base64,') {
    throw new Error('Video generation failed — no playable video was produced.');
  }

  options?.onProgress?.('assembling', 'Preparing your video…');

  let fileUrl: string;

  if (isHttpMediaUrl(video.videoUrl)) {
    const buffer = await downloadVideoBuffer(video.videoUrl);
    if (isStubJsonBuffer(buffer) || !isValidMp4Buffer(buffer)) {
      throw new Error('Video provider returned invalid file. Please try again.');
    }
    const stored = await storeUserFile(userId, `video-${Date.now()}.mp4`, buffer, 'video/mp4');
    fileUrl = stored.fileUrl;
  } else if (video.videoUrl.startsWith('data:video/')) {
    const buffer = await downloadVideoBuffer(video.videoUrl);
    if (!isValidMp4Buffer(buffer)) {
      throw new Error('Video generation failed — invalid video data.');
    }
    const stored = await storeUserFile(userId, `video-${Date.now()}.mp4`, buffer, 'video/mp4');
    fileUrl = stored.fileUrl;
  } else {
    throw new Error('Video generation failed — unsupported video format.');
  }

  if (projectId) {
    const buffer = await downloadVideoBuffer(fileUrl);
    const { storeProjectFile } = await import('../storage/projectFiles.js');
    await storeProjectFile(userId, projectId, `video-${Date.now()}.mp4`, buffer, 'video/mp4', 'video');
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
      scenes: [{ number: 1, description: enhancedPrompt, dialogue: '', durationSeconds }],
    },
    selectedProvider: video.provider,
    reviewScores: { physics: 8, lighting: 8, consistency: 8 },
    providersUsed: [video.provider],
    audioTracks: [],
    sceneCount: 1,
  };
}
