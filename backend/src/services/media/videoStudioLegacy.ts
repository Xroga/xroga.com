import { callWithLlmFallback } from '../../lib/llmFallback.js';
import { generateVideosParallel } from '../../lib/videoProviders.js';
import { generateSceneAudio } from '../../lib/audioProviders.js';
import { assembleVideo } from '../../lib/ffmpeg.js';
import { reviewVideoOutputs, parseVideoDuration, computeVideoActionCost } from './videoUtils.js';
import { storeUserFile } from '../storage/projectFiles.js';
import { MOVIE_SCRIPTWRITER_PROMPT } from '../../orchestrator/moviePrompts.js';
import type { VideoStudioOutput } from '../../types/features.js';
import type { ProduceVideoOptions } from './produceVideo.js';

interface Screenplay {
  title: string;
  mood: string;
  scenes: Array<{ number: number; description: string; dialogue: string; durationSeconds: number }>;
}

function parseScreenplay(raw: string, prompt: string, totalDuration: number): Screenplay {
  try {
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]) as Screenplay & { scenes?: Array<{ action?: string }> };
      if (parsed.scenes?.length) {
        return {
          title: parsed.title ?? prompt.slice(0, 80),
          mood: parsed.mood ?? 'cinematic',
          scenes: parsed.scenes.map((s, i) => ({
            number: i + 1,
            description: (s as { action?: string }).action ?? s.description ?? prompt,
            dialogue: s.dialogue ?? '',
            durationSeconds: s.durationSeconds ?? 5,
          })),
        };
      }
    }
  } catch {
    console.error('[VideoStudio] Screenplay parse failed, using fallback');
  }

  const sceneDuration = Math.max(5, Math.floor(totalDuration / 3));
  return {
    title: prompt.slice(0, 80),
    mood: 'cinematic epic',
    scenes: [
      { number: 1, description: `Opening: ${prompt}`, dialogue: 'In a world where anything is possible...', durationSeconds: sceneDuration },
      { number: 2, description: `Rising action: ${prompt}`, dialogue: 'The journey begins.', durationSeconds: sceneDuration },
      { number: 3, description: `Climax: ${prompt}`, dialogue: 'And so it ends, but the legend lives on.', durationSeconds: sceneDuration },
    ],
  };
}

export { parseVideoDuration, computeVideoActionCost };

/** Single-scene fast path for short clips */
export async function produceSingleSceneVideo(
  userId: string,
  prompt: string,
  projectId?: string,
  options?: ProduceVideoOptions
): Promise<VideoStudioOutput> {
  const durationSeconds = parseVideoDuration(prompt);
  const actionCost = computeVideoActionCost(durationSeconds);

  let screenplay: Screenplay;
  try {
    const { text: raw } = await callWithLlmFallback(
      MOVIE_SCRIPTWRITER_PROMPT,
      `Write a screenplay for: ${prompt}. Total duration ~${durationSeconds}s. One scene only.`,
      { maxTokens: 2048, userId, runId: options?.runId, apiType: 'video_script' }
    );
    screenplay = parseScreenplay(raw, prompt, durationSeconds);
  } catch {
    screenplay = parseScreenplay('', prompt, durationSeconds);
  }

  const primaryScene = screenplay.scenes[0];
  const scenePrompt = `${screenplay.title}: ${primaryScene.description}. ${primaryScene.dialogue}`;

  options?.onProgress?.('rendering', 'Rendering scene…');

  const videoResults = await generateVideosParallel(scenePrompt, primaryScene.durationSeconds, {
    userId,
    runId: options?.runId,
  });

  const winner = await reviewVideoOutputs(
    videoResults.map((v) => ({ provider: v.provider, videoUrl: v.videoUrl })),
    scenePrompt
  );

  options?.onProgress?.('audio', 'Composing audio…');

  const audioTracks = await generateSceneAudio(
    primaryScene.dialogue,
    screenplay.mood,
    primaryScene.durationSeconds
  );

  options?.onProgress?.('assembling', 'Assembling final cut…');

  const assembly = await assembleVideo({
    videoUrl: winner.videoUrl,
    audioTracks: audioTracks.map((t) => ({ url: t.url, type: t.type })),
    subtitles: primaryScene.dialogue,
    outputFilename: `xroga-video-${Date.now()}.mp4`,
  });

  const { fileUrl } = await storeUserFile(
    userId,
    `video-${Date.now()}.mp4`,
    assembly.buffer,
    'video/mp4'
  );

  if (projectId) {
    const { storeProjectFile } = await import('../storage/projectFiles.js');
    await storeProjectFile(userId, projectId, `video-${Date.now()}.mp4`, assembly.buffer, 'video/mp4', 'video');
  }

  options?.onProgress?.('complete', 'Your video is ready!');

  return {
    type: 'video_studio',
    title: screenplay.title,
    streamingUrl: fileUrl,
    durationSeconds,
    actionCost,
    screenplay,
    selectedProvider: winner.provider,
    reviewScores: {
      physics: winner.physics,
      lighting: winner.lighting,
      consistency: winner.consistency,
    },
    providersUsed: videoResults.map((v) => v.provider),
    audioTracks: audioTracks.map((t) => ({ type: t.type, provider: t.provider })),
    sceneCount: 1,
  };
}
