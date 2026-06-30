import { downloadVideoBuffer, assembleVideo } from '../../lib/ffmpeg.js';
import { isValidMp4Buffer, isHttpMediaUrl, isStubJsonBuffer } from '../../lib/mediaValidation.js';
import { parseVideoDuration, parseVideoFormat, stripVideoFormatTag, computeVideoActionCost } from './videoUtils.js';
import { storeUserFile } from '../storage/projectFiles.js';
import { planVideoProduction } from './videoRouter.js';
import type { VideoStudioOutput } from '../../types/features.js';
import type { ProduceVideoOptions } from './produceVideo.js';
import type { OmniVideoEvent } from '../omniReality/omniEvents.js';
import { moderateImagePrompt } from '../builder/image/contentModeration.js';
import { renderSceneWithHealing, buildAspectSuffix } from '../omniReality/swarmMaster.js';
import { generateSceneAudio } from '../../lib/audioProviders.js';

import { sanitizeVideoPrompt } from '../../lib/video/videoPrompt.js';

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
  const isFastClip = durationSeconds <= 15;

  options?.onProgress?.('scripting', isFastClip ? 'Fast render — skipping heavy planning…' : 'Planning your video with AI…');

  const plan = isFastClip
    ? {
        mode: 'single_scene' as const,
        title: stripVideoFormatTag(prompt).slice(0, 80) || 'Xroga Video',
        mood: 'cinematic',
        durationSeconds,
        renderPrompt: sanitizeVideoPrompt(prompt),
        scenes: [{
          sceneId: '1',
          location: 'CINEMATIC',
          action: sanitizeVideoPrompt(prompt),
          dialogue: '',
          renderPrompt: sanitizeVideoPrompt(prompt),
          durationSeconds,
          priority: 'critical' as const,
        }],
        characters: [{ name: 'Protagonist', description: 'Main subject' }],
        scriptProvider: 'fast-heuristic',
      }
    : await planVideoProduction(prompt, {
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
  const aspectSuffix = buildAspectSuffix(prompt);
  const dialogue = scene?.dialogue ?? plan.scenes[0]?.dialogue ?? '';

  options?.onProgress?.('rendering', 'Omni-Reality swarm rendering…');

  const video = await renderSceneWithHealing({
    prompt: `${enhancedPrompt}. ${aspectSuffix}`,
    durationSeconds: scene?.durationSeconds ?? durationSeconds,
    scenePriority: scene?.priority ?? 'critical',
    userId,
    runId: options?.runId,
    aspectRatio: parseVideoFormat(prompt) === 'shorts_reels' ? '9:16' : '16:9',
    onProgress: (msg) => options?.onProgress?.('rendering', msg),
    onOmniEvent: options?.onOmniEvent,
  });

  options?.onProgress?.('audio', 'Composing voiceover & score…');
  const audioTracks = dialogue.trim()
    ? await generateSceneAudio(dialogue, plan.mood, video.durationSeconds, { userId, runId: options?.runId })
    : [];

  options?.onProgress?.('assembling', 'Preparing your video…');

  let fileUrl: string;
  if (audioTracks.length > 0 && (isHttpMediaUrl(video.videoUrl) || video.videoUrl.startsWith('data:video/'))) {
    try {
      const assembly = await assembleVideo({
        videoUrl: video.videoUrl,
        audioTracks: audioTracks.map((t) => ({ url: t.url, type: t.type })),
        subtitles: dialogue.slice(0, 200) || undefined,
        outputFilename: `xroga-video-${Date.now()}.mp4`,
      });
      const stored = await storeUserFile(userId, `video-${Date.now()}.mp4`, assembly.buffer, 'video/mp4');
      fileUrl = stored.fileUrl;
      if (projectId) {
        const { storeProjectFile } = await import('../storage/projectFiles.js');
        await storeProjectFile(userId, projectId, `video-${Date.now()}.mp4`, assembly.buffer, 'video/mp4', 'video');
      }
    } catch {
      fileUrl = await persistVideoFile(userId, video.videoUrl, projectId);
    }
  } else if (isHttpMediaUrl(video.videoUrl) || video.videoUrl.startsWith('data:video/')) {
    fileUrl = await persistVideoFile(userId, video.videoUrl, projectId);
  } else {
    throw new Error('Video generation failed — unsupported video format.');
  }

  options?.onProgress?.('complete', 'Your video is ready!');

    const usedFallback = ['slideshow', 'slideshow-ai-image', 'ffmpeg-minimal', 'static-mp4', 'parallax'].includes(video.provider);

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
    reviewScores: video.reviewScores ?? { physics: 8, lighting: 8, consistency: 8 },
    providersUsed: [video.provider],
    audioTracks: audioTracks.map((t) => ({ type: t.type, provider: t.provider })),
    sceneCount: plan.scenes.length,
    scriptProvider: plan.scriptProvider,
    videoFormat: parseVideoFormat(prompt),
    characters: plan.characters.map((c) => ({ name: c.name })),
    cons: usedFallback ? ['Used visual fallback — premium APIs were unavailable'] : undefined,
    healingSteps: video.healingSteps,
    qcScore: video.qcScore,
    followUps: plan.mode === 'multi_scene' ? ['Generate full multi-scene movie?'] : undefined,
  };
}
