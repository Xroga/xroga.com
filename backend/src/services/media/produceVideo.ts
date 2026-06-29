import { produceSingleSceneVideo } from './videoStudioLegacy.js';
import { runMoviePipeline, type MovieProgressStep } from './moviePipeline.js';
import { planVideoProduction } from './videoRouter.js';
import { parseVideoDuration } from './videoUtils.js';
import type { VideoStudioOutput } from '../../types/features.js';

export { parseVideoDuration, computeVideoActionCost } from './videoUtils.js';

export interface ProduceVideoOptions {
  projectId?: string;
  seriesId?: string;
  runId?: string;
  onProgress?: (step: MovieProgressStep, message: string, detail?: string) => void;
}

/** Routes through AI video planner — multi-scene → movie pipeline, else guaranteed single clip */
export async function produceVideo(
  userId: string,
  prompt: string,
  options?: ProduceVideoOptions
): Promise<VideoStudioOutput> {
  options?.onProgress?.('scripting', 'Analyzing video request…');

  const plan = await planVideoProduction(prompt, {
    userId,
    runId: options?.runId,
    onProgress: (step, message) => options?.onProgress?.(step as MovieProgressStep, message),
  });

  if (plan.mode === 'multi_scene' && plan.scenes.length > 1) {
    return runMoviePipeline({
      userId,
      prompt,
      projectId: options?.projectId,
      seriesId: options?.seriesId,
      runId: options?.runId,
      onProgress: options?.onProgress,
    });
  }

  return produceSingleSceneVideo(userId, prompt, options?.projectId, options);
}
