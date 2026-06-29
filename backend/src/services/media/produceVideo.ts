import { produceSingleSceneVideo } from './videoStudioLegacy.js';
import { runMoviePipeline, type MovieProgressStep } from './moviePipeline.js';
import { parseVideoDuration } from './videoUtils.js';
import type { VideoStudioOutput } from '../../types/features.js';

export { parseVideoDuration, computeVideoActionCost } from './videoUtils.js';

export interface ProduceVideoOptions {
  projectId?: string;
  seriesId?: string;
  runId?: string;
  onProgress?: (step: MovieProgressStep, message: string, detail?: string) => void;
}

/** Routes to full movie pipeline or single-scene fast path */
export async function produceVideo(
  userId: string,
  prompt: string,
  options?: ProduceVideoOptions
): Promise<VideoStudioOutput> {
  const isFullMovie =
    /\b(movie|film|series|episode|trailer|short film|documentary)\b/i.test(prompt) ||
    parseVideoDuration(prompt) > 5;

  if (isFullMovie) {
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
