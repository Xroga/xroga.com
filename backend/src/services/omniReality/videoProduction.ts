/**
 * Omni-Reality Video Production — full cinematic pipeline orchestrator.
 * Wraps single-scene + multi-scene with Trinity Brain, Titanium Ladder, and SSE events.
 */

import { produceSingleSceneVideo } from '../media/videoStudioLegacy.js';
import { runMoviePipeline } from '../media/moviePipeline.js';
import { planVideoProduction } from '../media/videoRouter.js';
import { parseVideoDuration } from '../media/videoUtils.js';
import { deepSeekStoryboard } from './brainTrinity.js';
import type { OmniVideoEvent } from './omniEvents.js';
import { OMNI_PHASE_LABELS } from './omniEvents.js';
import type { VideoStudioOutput } from '../../types/features.js';
import type { MovieProgressStep } from '../media/moviePipeline.js';

export interface OmniProductionOptions {
  userId: string;
  prompt: string;
  projectId?: string;
  seriesId?: string;
  runId?: string;
  keyframeUrl?: string;
  onOmniEvent?: (event: OmniVideoEvent) => void;
  onProgress?: (step: MovieProgressStep, message: string, detail?: string) => void;
}

function emit(opts: OmniProductionOptions, phase: OmniVideoEvent['phase'], detail?: string, extra?: Partial<OmniVideoEvent>) {
  const event: OmniVideoEvent = {
    phase,
    message: OMNI_PHASE_LABELS[phase],
    detail,
    ...extra,
  };
  opts.onOmniEvent?.(event);
}

export async function produceOmniVideo(options: OmniProductionOptions): Promise<VideoStudioOutput> {
  const { userId, prompt, projectId, seriesId, runId } = options;
  const durationSeconds = parseVideoDuration(prompt);
  const isFast = durationSeconds <= 15;

  if (!isFast) {
    emit(options, 'trinity_scripting', 'DeepSeek Showrunner analyzing your vision…');
    const storyboard = await deepSeekStoryboard(prompt, durationSeconds, { userId, runId });
    emit(options, 'storyboard_ready', `${storyboard.scenes.length} scene(s) · ${storyboard.mood_tone}`);
  } else {
    emit(options, 'trinity_scripting', 'Fast clip mode — rendering immediately…');
    emit(options, 'storyboard_ready', `${durationSeconds}s clip · direct render`);
  }

  const plan = isFast
    ? null
    : await planVideoProduction(prompt, {
        userId,
        runId,
        onProgress: (step, message) => {
          options.onProgress?.(step as MovieProgressStep, message);
          if (step === 'scripting') emit(options, 'trinity_scripting', message);
          if (step === 'storyboard') emit(options, 'storyboard_ready', message);
        },
      });

  const isMulti = !isFast && plan?.mode === 'multi_scene' && (plan?.scenes.length ?? 0) > 1;

  const bridgeProgress = (step: MovieProgressStep, message: string, detail?: string) => {
    options.onProgress?.(step, message, detail);
    const phaseMap: Partial<Record<MovieProgressStep, OmniVideoEvent['phase']>> = {
      scripting: 'trinity_scripting',
      characters: 'characters',
      storyboard: 'storyboard_ready',
      rendering: 'scene_render',
      audio: 'audio_compose',
      assembling: 'stitch_assemble',
      postproduction: 'postproduction',
      complete: 'complete',
    };
    const phase = phaseMap[step];
    if (phase) emit(options, phase, detail ?? message);
  };

  let output: VideoStudioOutput;

  if (isMulti) {
    output = await runMoviePipeline({
      userId,
      prompt,
      projectId,
      seriesId,
      runId,
      onProgress: bridgeProgress,
    });
  } else {
    output = await produceSingleSceneVideo(userId, prompt, projectId, {
      projectId,
      seriesId,
      runId,
      keyframeUrl: options.keyframeUrl,
      onProgress: bridgeProgress,
      onOmniEvent: options.onOmniEvent,
    });
  }

  emit(options, 'complete', output.title);

  return {
    ...output,
    omniReality: {
      storyboardProvider: plan?.scriptProvider ?? 'fast-heuristic',
      moodTone: plan?.mood ?? output.screenplay?.mood,
      continuityLocks: [],
      sceneCount: plan?.scenes.length ?? 1,
      trinity: {
        deepseek: Boolean(process.env.DEEPSEEK_API_KEY),
        gemini: Boolean(process.env.GEMINI_API_KEY),
        groq: Boolean(process.env.GROQ_API_KEY),
      },
    },
  };
}
