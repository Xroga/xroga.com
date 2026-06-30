import { renderSceneWithHealing, buildAspectSuffix } from '../omniReality/swarmMaster.js';
import { deepSeekStoryboard, buildRenderPromptFromScene } from '../omniReality/brainTrinity.js';
import { generateSceneAudio } from '../../lib/audioProviders.js';
import { assembleMultiSceneVideo } from '../../lib/ffmpeg.js';
import { parseVideoFormat } from './videoUtils.js';
import { storeUserFile } from '../storage/projectFiles.js';
import { getSupabaseAdmin } from '../../config/supabase.js';
import { generateImage } from '../builder/imageGen.js';
import {
  MOVIE_PROGRESS_MESSAGES,
} from '../../orchestrator/moviePrompts.js';
import type { VideoStudioOutput } from '../../types/features.js';
import { parseVideoDuration, computeVideoActionCost } from './videoUtils.js';

export type MovieProgressStep =
  | 'scripting'
  | 'characters'
  | 'storyboard'
  | 'rendering'
  | 'audio'
  | 'assembling'
  | 'postproduction'
  | 'complete';

export interface MovieScene {
  scene_id: string;
  location: string;
  characters: string[];
  dialogue: string;
  action: string;
  durationSeconds: number;
  priority: 'critical' | 'low' | string;
}

export interface MovieCharacter {
  name: string;
  description: string;
  face_image_url?: string;
  voice_id?: string;
}

export interface MovieScreenplay {
  title: string;
  mood: string;
  characters: MovieCharacter[];
  scenes: MovieScene[];
}

export interface MoviePipelineOptions {
  userId: string;
  prompt: string;
  projectId?: string;
  seriesId?: string;
  runId?: string;
  onProgress?: (step: MovieProgressStep, message: string, detail?: string) => void;
}

function emit(
  opts: MoviePipelineOptions,
  step: MovieProgressStep,
  detail?: string
) {
  opts.onProgress?.(step, MOVIE_PROGRESS_MESSAGES[step] ?? step, detail);
}

function computeSceneCount(durationSeconds: number): number {
  if (durationSeconds <= 5) return 1;
  if (durationSeconds <= 15) return 3;
  if (durationSeconds <= 30) return 5;
  return Math.min(8, Math.ceil(durationSeconds / 5));
}

function parseScreenplay(raw: string, prompt: string, durationSeconds: number): MovieScreenplay {
  try {
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]) as MovieScreenplay;
      if (parsed.scenes?.length) {
        return {
          title: parsed.title ?? prompt.slice(0, 80),
          mood: parsed.mood ?? 'cinematic',
          characters: parsed.characters ?? [],
          scenes: parsed.scenes.map((s, i) => ({
            scene_id: s.scene_id ?? String(i + 1),
            location: s.location ?? 'INT. SCENE',
            characters: s.characters ?? [],
            dialogue: s.dialogue ?? '',
            action: s.action ?? s.location,
            durationSeconds: s.durationSeconds ?? Math.max(5, Math.floor(durationSeconds / parsed.scenes.length)),
            priority: s.priority ?? (i === 0 ? 'critical' : 'low'),
          })),
        };
      }
    }
  } catch {
    console.error('[MoviePipeline] Screenplay parse failed, using fallback');
  }

  const sceneCount = computeSceneCount(durationSeconds);
  const sceneDuration = Math.max(5, Math.floor(durationSeconds / sceneCount));
  const scenes: MovieScene[] = [];

  for (let i = 0; i < sceneCount; i++) {
    scenes.push({
      scene_id: String(i + 1),
      location: i === 0 ? 'EXT. OPENING' : i === sceneCount - 1 ? 'EXT. FINALE' : 'INT. ACTION',
      characters: ['Protagonist'],
      dialogue: i === 0 ? 'In a world where anything is possible...' : `Scene ${i + 1} unfolds.`,
      action: `${prompt} — scene ${i + 1}`,
      durationSeconds: sceneDuration,
      priority: i === 0 || i === sceneCount - 1 ? 'critical' : 'low',
    });
  }

  return {
    title: prompt.slice(0, 80),
    mood: 'cinematic epic',
    characters: [{ name: 'Protagonist', description: 'Main character' }],
    scenes,
  };
}

async function persistMovieJob(
  userId: string,
  prompt: string,
  screenplay: MovieScreenplay,
  options: MoviePipelineOptions
): Promise<string | undefined> {
  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from('video_jobs')
      .insert({
        user_id: userId,
        project_id: options.projectId ?? null,
        series_id: options.seriesId ?? null,
        prompt,
        status: 'processing',
        screenplay,
        scene_count: screenplay.scenes.length,
        duration_seconds: screenplay.scenes.reduce((sum, s) => sum + s.durationSeconds, 0),
      })
      .select('id')
      .single();

    if (error || !data) return undefined;

    const jobId = data.id as string;

    await supabase.from('scripts').insert({
      project_id: jobId,
      content: screenplay,
    });

    for (const char of screenplay.characters) {
      await supabase.from('characters').insert({
        project_id: jobId,
        name: char.name,
        description: char.description,
        face_image_url: char.face_image_url ?? null,
        voice_id: char.voice_id ?? null,
      });
    }

    return jobId;
  } catch (err) {
    console.error('[MoviePipeline] DB persist failed:', (err as Error).message);
    return undefined;
  }
}

async function designCharacters(
  screenplay: MovieScreenplay,
  options: MoviePipelineOptions
): Promise<MovieCharacter[]> {
  const designed: MovieCharacter[] = [];

  for (const char of screenplay.characters.slice(0, 4)) {
    try {
      const imageResult = await generateImage(
        `Portrait photo, consistent character face, ${char.description}, cinematic lighting, 16:9`,
        { userId: options.userId, runId: options.runId }
      );
      if (imageResult.type === 'image_blocked') {
        designed.push({
          ...char,
          voice_id: process.env.ELEVENLABS_VOICE_ID ?? '21m00Tcm4TlvDq8ikWAM',
        });
        continue;
      }
      designed.push({
        ...char,
        face_image_url: imageResult.imageUrl,
        voice_id: process.env.ELEVENLABS_VOICE_ID ?? '21m00Tcm4TlvDq8ikWAM',
      });
    } catch {
      designed.push({
        ...char,
        voice_id: process.env.ELEVENLABS_VOICE_ID ?? '21m00Tcm4TlvDq8ikWAM',
      });
    }
  }

  return designed.length ? designed : screenplay.characters;
}

function buildScenePrompt(
  screenplay: MovieScreenplay,
  scene: MovieScene,
  characters: MovieCharacter[]
): string {
  const charRefs = scene.characters
    .map((name) => {
      const c = characters.find((ch) => ch.name === name);
      return c ? `${name}: ${c.description}` : name;
    })
    .join('; ');

  return [
    screenplay.title,
    scene.location,
    scene.action,
    charRefs ? `Characters: ${charRefs}` : '',
    scene.dialogue ? `Dialogue mood: ${scene.dialogue.slice(0, 120)}` : '',
    `Mood: ${screenplay.mood}`,
    'Cinematic, realistic physics, smooth motion, 16:9',
  ]
    .filter(Boolean)
    .join('. ');
}

const MAX_CONCURRENT_RENDERS = 3;

async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < items.length) {
      const i = nextIndex++;
      results[i] = await fn(items[i], i);
    }
  }

  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, () => worker()));
  return results;
}

export async function runMoviePipeline(options: MoviePipelineOptions): Promise<VideoStudioOutput> {
  const { userId, prompt } = options;
  const durationSeconds = parseVideoDuration(prompt);
  const actionCost = computeVideoActionCost(durationSeconds);

  emit(options, 'scripting');
  const omniBoard = await deepSeekStoryboard(prompt, durationSeconds, { userId, runId: options.runId });
  const aspectSuffix = buildAspectSuffix(prompt);
  const isVertical = parseVideoFormat(prompt) === 'shorts_reels';

  let screenplay: MovieScreenplay = {
    title: omniBoard.title,
    mood: omniBoard.mood,
    characters: omniBoard.characters,
    scenes: omniBoard.scenes.map((s) => ({
      scene_id: s.scene_id,
      location: s.location,
      characters: omniBoard.characters.map((c) => c.name).slice(0, 2),
      dialogue: s.dialogue,
      action: s.action,
      durationSeconds: s.durationSeconds,
      priority: s.priority,
    })),
  };
  const scriptProvider = omniBoard.scriptProvider ?? 'deepseek';
  const jobId = await persistMovieJob(userId, prompt, screenplay, options);

  emit(options, 'characters');
  const characters = await designCharacters(screenplay, options);
  screenplay = { ...screenplay, characters };

  emit(options, 'storyboard');

  const renderedScenes = await mapWithConcurrency(
    screenplay.scenes,
    MAX_CONCURRENT_RENDERS,
    async (scene, index) => {
      emit(options, 'rendering', `Rendering scene ${index + 1}/${screenplay.scenes.length}…`);

      const omniScene = omniBoard.scenes[index];
      const scenePrompt = omniScene
        ? buildRenderPromptFromScene(omniBoard, omniScene, aspectSuffix)
        : buildScenePrompt(screenplay, scene, characters);
      const keyframe = characters[0]?.face_image_url;

      const healed = await renderSceneWithHealing({
        prompt: scene.dialogue ? `${scenePrompt}. Dialogue: ${scene.dialogue.slice(0, 120)}` : scenePrompt,
        durationSeconds: scene.durationSeconds,
        scenePriority: scene.priority,
        keyframeUrl: keyframe,
        referenceFaceUrl: keyframe,
        userId,
        runId: options.runId,
        aspectRatio: isVertical ? '9:16' : '16:9',
        onProgress: (msg) => emit(options, 'rendering', `Scene ${index + 1}: ${msg}`),
      });

      const result = {
        provider: healed.provider,
        videoUrl: healed.videoUrl,
        durationSeconds: healed.durationSeconds,
        reviewScores: healed.reviewScores,
      };

      return { scene, result };
    }
  );

  emit(options, 'audio');
  const sceneAudioPairs = await Promise.all(
    renderedScenes.map(async ({ scene, result }) => {
      const audio = await generateSceneAudio(scene.dialogue || scene.action, screenplay.mood, scene.durationSeconds);
      return { videoUrl: result.videoUrl, audioTracks: audio, scene };
    })
  );

  emit(options, 'assembling');
  const assembly = await assembleMultiSceneVideo({
    scenes: sceneAudioPairs.map((s) => ({
      videoUrl: s.videoUrl,
      audioTracks: s.audioTracks.map((t) => ({ url: t.url, type: t.type })),
      subtitles: s.scene.dialogue,
    })),
    outputFilename: `xroga-movie-${Date.now()}.mp4`,
  });

  emit(options, 'postproduction');

  const { fileUrl } = await storeUserFile(
    userId,
    `movie-${Date.now()}.mp4`,
    assembly.buffer,
    'video/mp4'
  );

  if (options.projectId) {
    const { storeProjectFile } = await import('../storage/projectFiles.js');
    await storeProjectFile(userId, options.projectId, `movie-${Date.now()}.mp4`, assembly.buffer, 'video/mp4', 'video');
  }

  if (jobId) {
    try {
      const supabase = getSupabaseAdmin();
      await supabase
        .from('video_jobs')
        .update({
          status: 'completed',
          final_video_url: fileUrl,
          providers_used: renderedScenes.map((s) => s.result.provider),
          updated_at: new Date().toISOString(),
        })
        .eq('id', jobId);
    } catch {
      /* non-fatal */
    }
  }

  emit(options, 'complete');

  const primaryScene = renderedScenes[0];
  const allProviders = renderedScenes.map((s) => s.result.provider);

  return {
    type: 'video_studio',
    title: screenplay.title,
    streamingUrl: fileUrl,
    durationSeconds: assembly.durationSeconds || durationSeconds,
    actionCost,
    screenplay: {
      title: screenplay.title,
      mood: screenplay.mood,
      scenes: screenplay.scenes.map((s) => ({
        number: Number(s.scene_id) || 1,
        description: s.action,
        dialogue: s.dialogue,
        durationSeconds: s.durationSeconds,
      })),
    },
    selectedProvider: primaryScene?.result.provider ?? 'slideshow',
    reviewScores: renderedScenes[0]?.result.reviewScores ?? {
      physics: 8,
      lighting: 8,
      consistency: 8,
    },
    providersUsed: [...new Set(allProviders)],
    audioTracks: sceneAudioPairs[0]?.audioTracks.map((t) => ({ type: t.type, provider: t.provider })) ?? [],
    scriptProvider,
    sceneCount: screenplay.scenes.length,
    characters: characters.map((c) => ({ name: c.name, faceImageUrl: c.face_image_url })),
    pros: screenplay.scenes.length > 1 ? ['Multi-scene narrative assembled'] : undefined,
    cons: allProviders.includes('slideshow') ? ['Some scenes used visual fallback'] : undefined,
    followUps: ['Add subtitles?', 'Generate episode 2?', 'Dub into another language?'],
  };
}
