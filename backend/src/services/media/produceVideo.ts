import type { MovieProgressStep } from './moviePipeline.js';
import type { VideoStudioOutput } from '../../types/features.js';
import type { OmniVideoEvent } from '../omniReality/omniEvents.js';

export { parseVideoDuration, computeVideoActionCost } from './videoUtils.js';

export interface ProduceVideoOptions {
  projectId?: string;
  seriesId?: string;
  runId?: string;
  onProgress?: (step: MovieProgressStep, message: string, detail?: string) => void;
  onOmniEvent?: (event: OmniVideoEvent) => void;
}

/** Routes through Omni-Reality planner — multi-scene → movie pipeline, else guaranteed single clip */
export async function produceVideo(
  userId: string,
  prompt: string,
  options?: ProduceVideoOptions
): Promise<VideoStudioOutput> {
  const { produceOmniVideo } = await import('../omniReality/videoProduction.js');
  return produceOmniVideo({
    userId,
    prompt,
    projectId: options?.projectId,
    seriesId: options?.seriesId,
    runId: options?.runId,
    onProgress: options?.onProgress,
    onOmniEvent: options?.onOmniEvent,
  });
}
