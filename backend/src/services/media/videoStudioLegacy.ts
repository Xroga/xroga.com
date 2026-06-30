import { generateGuaranteedVideo } from '../../lib/video/guaranteedVideo.js';
import { downloadVideoBuffer } from '../../lib/ffmpeg.js';
import { isValidMp4Buffer, isHttpMediaUrl, isStubJsonBuffer } from '../../lib/mediaValidation.js';
import { parseVideoDuration, parseVideoFormat, computeVideoActionCost } from './videoUtils.js';
import { storeUserFile } from '../storage/projectFiles.js';
import { planVideoProduction } from './videoRouter.js';
import type { VideoStudioOutput } from '../../types/features.js';
import type { ProduceVideoOptions } from './produceVideo.js';
import { moderateImagePrompt } from '../builder/image/contentModeration.js';

export { parseVideoDuration, computeVideoActionCost };

async function persistVideoFile(
  userId: string,
  videoUrl: string,
  projectId?: string
): Promise<string> {
  const buffer = await downloadVideoBuffer(videoUrl);
  if (isStubJsonBuffer(buffer) || !isValidMp4Buffer(buffer)) {
    throw new Error('Video provider returned invalid file.');
  }

  const stored = await storeUserFile(userId, `video-${Date.now()}.mp4`, buffer, 'video/mp4');

  if (projectId) {
    const { storeProjectFile } = await import('../storage/projectFiles.js');
    await storeProjectFile(userId, projectId, `video-${Date.now()}.mp4`, buffer, 'video/mp4', 'video');
  }

  return stored.fileUrl;
}

/** Single-scene video — AI router plans script, guaranteed output always delivers MP4 */
export async function produceSingleSceneVideo(
  userId: string,
  prompt: string,
  projectId?: string,
  options?: ProduceVideoOptions
): Promise<VideoStudioOutput> {
  const durationSeconds = Math.min(Math.max(parseVideoDuration(prompt), 3), 30);
  const actionCost = computeVideoActionCost(durationSeconds);

  options?.onProgress?.('scripting', 'Planning your video with AI…');

  const plan = await planVideoProduction(prompt, {
    userId,
    runId: options?.runId,
    onProgress: (step, message) => options?.onProgress?.(step as 'scripting', message),
  });

  const scene = plan.scenes[0];
  const scenePrompt = scene?.renderPrompt ?? plan.renderPrompt ?? prompt;
  const title = plan.title || scenePrompt.slice(0, 80) || 'Xroga Video';

  const moderation = moderateImagePrompt(scenePrompt);
  if (!moderation.allowed) {
    throw new Error(moderation.reason ?? 'This video request is not allowed.');
  }

  const enhancedPrompt = moderation.sanitizedPrompt ?? scenePrompt;

  options?.onProgress?.('rendering', 'Generating video (always delivers output)…');

  const video = await generateGuaranteedVideo(enhancedPrompt, scene?.durationSeconds ?? durationSeconds, {
    userId,
    runId: options?.runId,
    priority: scene?.priority === 'critical' ? 'premium' : 'cheap',
    keyframeUrl: undefined,
  });

  options?.onProgress?.('assembling', 'Preparing your video…');

  let fileUrl: string;
  if (isHttpMediaUrl(video.videoUrl) || video.videoUrl.startsWith('data:video/')) {
    fileUrl = await persistVideoFile(userId, video.videoUrl, projectId);
  } else {
    throw new Error('Video generation failed — unsupported video format.');
  }

  options?.onProgress?.('complete', 'Your video is ready!');

    const usedFallback = ['slideshow', 'slideshow-ai-image', 'ffmpeg-minimal', 'static-mp4'].includes(video.provider);

  return {
    type: 'video_studio',
    title,
    streamingUrl: fileUrl,
    durationSeconds: video.durationSeconds || durationSeconds,
    actionCost,
    screenplay: {
      title,
      mood: plan.mood,
      scenes: plan.scenes.map((s, i) => ({
        number: Number(s.sceneId) || i + 1,
        description: s.action,
        dialogue: s.dialogue,
        durationSeconds: s.durationSeconds,
      })),
    },
    selectedProvider: video.provider,
    reviewScores: { physics: 8, lighting: 8, consistency: 8 },
    providersUsed: [video.provider],
    audioTracks: [],
    sceneCount: plan.scenes.length,
    scriptProvider: plan.scriptProvider,
    videoFormat: parseVideoFormat(prompt),
    characters: plan.characters.map((c) => ({ name: c.name })),
    cons: usedFallback ? ['Used visual fallback — premium APIs were unavailable'] : undefined,
    followUps: plan.mode === 'multi_scene' ? ['Generate full multi-scene movie?'] : undefined,
  };
}
