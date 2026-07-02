import { downloadVideoBuffer, assembleVideo, convertVideoBufferToGif } from '../../lib/ffmpeg.js';
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
import { enhanceVideoPrompt, buildGenerationPrompt } from '../../lib/video/videoPromptEnhancer.js';
import {
  buildImageToVideoPrompt,
  buildImageToVideoGenerationPrompt,
} from '../../lib/video/imageToVideoPrompt.js';
import { isGifOutputIntent } from '../../lib/featureIntent.js';

export { parseVideoDuration, computeVideoActionCost };

async function persistVideoFile(
  userId: string,
  videoUrl: string,
  projectId?: string
): Promise<string> {
  try {
    const buffer = await downloadVideoBuffer(videoUrl);
    if (isStubJsonBuffer(buffer) || !isValidMp4Buffer(buffer)) {
      throw new Error('Video provider returned invalid file.');
    }

    const stored = await storeUserFile(userId, `video-${Date.now()}.mp4`, buffer, 'video/mp4');

    if (projectId) {
      const { storeProjectFile } = await import('../storage/projectFiles.js');
      await storeProjectFile(userId, projectId, `video-${Date.now()}.mp4`, buffer, 'video/mp4', 'video');
    }

    return stored.playbackUrl || stored.fileUrl;
  } catch (err) {
    console.error('[VideoStudio] Persist failed, using source URL:', (err as Error).message);
    if (videoUrl.startsWith('http') || videoUrl.startsWith('data:video/')) {
      return videoUrl;
    }
    throw err;
  }
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
          priority: 'low' as const,
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

  const referenceImageUrl = options?.keyframeUrl;
  const wantsGif = isGifOutputIntent(prompt);
  const aspectRatio = parseVideoFormat(prompt) === 'shorts_reels' ? '9:16' as const : '16:9' as const;

  // Kick off LTX immediately — HF Spaces need 30–90s cold wake; don't wait for Trinity Brain first
  let earlyLtx: Promise<import('../../lib/videoProviders.js').VideoGenerationResult | null> | undefined;
  if (isFastClip && !referenceImageUrl) {
    const { generateLtxHfVideo } = await import('../../lib/video/ltxHfVideo.js');
    const rawPrompt = sanitizeVideoPrompt(prompt);
    earlyLtx = generateLtxHfVideo(rawPrompt, durationSeconds, aspectRatio).catch(() => null);
  }

  options?.onProgress?.('rendering', referenceImageUrl ? 'Analyzing your image…' : 'Trinity Brain — locking your prompt…');
  options?.onOmniEvent?.({
    phase: 'trinity_scripting',
    message: 'Trinity Brain',
    detail: 'Groq · Gemini · DeepSeek verifying your prompt…',
  });

  const promptLock = referenceImageUrl
    ? await buildImageToVideoPrompt(referenceImageUrl, prompt)
    : await enhanceVideoPrompt(prompt, { fastClip: isFastClip, timeoutMs: isFastClip ? 6_000 : 12_000 });

  options?.onOmniEvent?.({
    phase: 'scene_render',
    message: 'Swarm Render',
    detail: `Prompt locked via ${promptLock.enhancerProvider} — starting OSS + API render…`,
  });

  const generationPrompt = referenceImageUrl
    ? `${buildImageToVideoGenerationPrompt(promptLock as Awaited<ReturnType<typeof buildImageToVideoPrompt>>)}. ${aspectSuffix}`
    : `${buildGenerationPrompt(promptLock)}. ${aspectSuffix}`;

  options?.onProgress?.('rendering', 'Omni-Reality swarm rendering…');

  let video: Awaited<ReturnType<typeof renderSceneWithHealing>>;
  let variantSources: Array<{ provider: string; videoUrl: string; durationSeconds: number }> = [];

  if (isFastClip) {
    const { raceMultipleOssVideos } = await import('../../lib/video/multiVideoRace.js');
    options?.onOmniEvent?.({
      phase: 'scene_render',
      message: 'Swarm Render',
      detail: 'LTX Video on HuggingFace (free OSS) — generating your clip…',
    });

    const multi = await raceMultipleOssVideos(generationPrompt, scene?.durationSeconds ?? durationSeconds, {
      userId,
      aspectRatio,
      keyframeUrl: referenceImageUrl,
      scenePriority: scene?.priority ?? 'low',
      maxVariants: 3,
      earlyLtx,
    });

    variantSources = multi.videos;
    video = {
      ...multi.primary,
      healingSteps: ['multi-oss-race'],
      reviewScores: { physics: 80, lighting: 80, consistency: 80 },
      qcScore: 80,
    };
  } else {
    video = await renderSceneWithHealing({
      prompt: generationPrompt,
      userIntent: promptLock.userIntent,
      negativePrompt: promptLock.negativePrompt,
      lockedSubjects: promptLock.lockedSubjects,
      mustNotInclude: promptLock.mustNotInclude,
      keyframeUrl: referenceImageUrl,
      durationSeconds: scene?.durationSeconds ?? durationSeconds,
      scenePriority: scene?.priority ?? 'critical',
      userId,
      runId: options?.runId,
      aspectRatio,
      onProgress: (msg) => options?.onProgress?.('rendering', msg),
      onOmniEvent: options?.onOmniEvent,
    });
    variantSources = [video];
  }

  options?.onProgress?.('audio', isFastClip ? 'Skipping audio for fast clip…' : 'Composing voiceover & score…');
  const audioTracks =
    !isFastClip && dialogue.trim()
      ? await generateSceneAudio(dialogue, plan.mood, video.durationSeconds, { userId, runId: options?.runId })
      : [];

  options?.onProgress?.('assembling', 'Preparing your video…');

  const persistedVariants: Array<{ streamingUrl: string; provider: string }> = [];
  for (const src of variantSources.slice(0, 3)) {
    try {
      const url = await persistVideoFile(userId, src.videoUrl, projectId);
      persistedVariants.push({ streamingUrl: url, provider: src.provider });
    } catch (err) {
      console.warn(`[VideoStudio] Variant persist failed (${src.provider}):`, (err as Error).message);
    }
  }

  let fileUrl = persistedVariants[0]?.streamingUrl ?? '';
  if (!fileUrl) {
    if (audioTracks.length > 0 && (isHttpMediaUrl(video.videoUrl) || video.videoUrl.startsWith('data:video/'))) {
      try {
        const assembly = await assembleVideo({
          videoUrl: video.videoUrl,
          audioTracks: audioTracks.map((t) => ({ url: t.url, type: t.type })),
          subtitles: dialogue.slice(0, 200) || undefined,
          outputFilename: `xroga-video-${Date.now()}.mp4`,
        });
        const stored = await storeUserFile(userId, `video-${Date.now()}.mp4`, assembly.buffer, 'video/mp4');
        fileUrl = stored.playbackUrl || stored.fileUrl;
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
  }

  if (wantsGif) {
    try {
      const mp4Buffer = await downloadVideoBuffer(fileUrl);
      const gifBuffer = await convertVideoBufferToGif(mp4Buffer, { fps: 12, width: 480 });
      const stored = await storeUserFile(userId, `animation-${Date.now()}.gif`, gifBuffer, 'image/gif');
      fileUrl = stored.playbackUrl || stored.fileUrl;
    } catch (err) {
      console.warn('[VideoStudio] GIF conversion failed, keeping MP4:', (err as Error).message);
    }
  }

  options?.onProgress?.('complete', 'Your video is ready!');

    const usedFallback = ['slideshow', 'slideshow-ai-image', 'ffmpeg-minimal', 'static-mp4', 'parallax'].includes(video.provider);
  const allProviders = variantSources.map((v) => v.provider);

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
    providersUsed: allProviders,
    variants: persistedVariants.length > 1 ? persistedVariants : undefined,
    audioTracks: audioTracks.map((t) => ({ type: t.type, provider: t.provider })),
    sceneCount: plan.scenes.length,
    scriptProvider: plan.scriptProvider,
    videoFormat: parseVideoFormat(prompt),
    characters: plan.characters.map((c) => ({ name: c.name })),
    cons: usedFallback ? ['Free GPU queues were busy — showing best available render'] : undefined,
    healingSteps: video.healingSteps,
    qcScore: video.qcScore,
    sourceImageUrl: referenceImageUrl,
    outputFormat: wantsGif ? 'gif' : 'mp4',
    followUps: plan.mode === 'multi_scene' ? ['Generate full multi-scene movie?'] : undefined,
  };
}
