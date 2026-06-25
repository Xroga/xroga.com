import { claudeGenerate } from '../../lib/anthropic.js';
import { generateVideosParallel } from '../../lib/videoProviders.js';
import { generateAudioTracks } from '../../lib/audioProviders.js';
import { assembleVideo } from '../../lib/ffmpeg.js';
import { reviewVideoOutputs, parseVideoDuration, computeVideoActionCost } from './videoUtils.js';
import { storeUserFile } from '../storage/projectFiles.js';
import type { VideoStudioOutput } from '../../types/features.js';

interface Screenplay {
  title: string;
  scenes: Array<{ number: number; description: string; dialogue: string; durationSeconds: number }>;
  mood: string;
}

const SCREENPLAY_SYSTEM = `You are a Hollywood screenwriter. Write a PG-13 screenplay.
Return ONLY JSON: {"title":"","mood":"","scenes":[{"number":1,"description":"","dialogue":"","durationSeconds":5}]}`;

function parseScreenplay(raw: string, prompt: string, totalDuration: number): Screenplay {
  try {
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]) as Screenplay;
      if (parsed.scenes?.length) return parsed;
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

export async function produceVideo(
  userId: string,
  prompt: string,
  projectId?: string
): Promise<VideoStudioOutput> {
  const durationSeconds = parseVideoDuration(prompt);
  const actionCost = computeVideoActionCost(durationSeconds);

  let screenplay: Screenplay;
  try {
    const raw = await claudeGenerate(SCREENPLAY_SYSTEM, `Write a screenplay for: ${prompt}. Total duration ~${durationSeconds}s.`);
    screenplay = parseScreenplay(raw, prompt, durationSeconds);
  } catch (err) {
    console.error('[VideoStudio] Claude screenplay failed:', (err as Error).message);
    screenplay = parseScreenplay('', prompt, durationSeconds);
  }

  const primaryScene = screenplay.scenes[0];
  const scenePrompt = `${screenplay.title}: ${primaryScene.description}. ${primaryScene.dialogue}`;

  const videoResults = await generateVideosParallel(scenePrompt, primaryScene.durationSeconds);

  const winner = await reviewVideoOutputs(
    videoResults.map((v) => ({ provider: v.provider, videoUrl: v.videoUrl })),
    scenePrompt
  );

  const audioTracks = await generateAudioTracks(
    primaryScene.dialogue,
    screenplay.mood,
    primaryScene.durationSeconds
  );

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
  };
}
