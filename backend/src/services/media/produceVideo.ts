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

/** Routes to full movie pipeline only for explicit long-form requests */
export async function produceVideo(
  userId: string,
  prompt: string,
  options?: ProduceVideoOptions
): Promise<VideoStudioOutput> {
  const isFullMovie =
    /\b(full movie|feature film|multi.?scene|episode\s+\d|series)\b/i.test(prompt) &&
    parseVideoDuration(prompt) > 15;

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
