/**
 * Persist negotiation/build pipeline results to swarm_runs for memory + history.
 */

import { getSupabaseAdmin } from '../../config/supabase.js';
import type { FeatureCategory, FeatureOutput } from '../../types/features.js';

export interface BuildPersistInput {
  userId: string;
  prompt: string;
  projectId?: string;
  featureCategory: FeatureCategory;
  success: boolean;
  polishedReply: string;
  featureOutput?: FeatureOutput;
  runId?: string;
}

/** Save build result to swarm_runs (negotiation path bypasses runCore). */
export async function persistBuildRun(input: BuildPersistInput): Promise<string> {
  const runId = input.runId ?? crypto.randomUUID();
  try {
    const supabase = getSupabaseAdmin();
    const { error } = await supabase.from('swarm_runs').insert({
      id: runId,
      user_id: input.userId,
      project_id: input.projectId ?? null,
      prompt: input.prompt.slice(0, 4000),
      status: input.success ? 'completed' : 'failed',
      current_agent: 'builder',
      iteration_count: 1,
      defects_found: 0,
      output: {
        polishedReply: input.polishedReply,
        featureOutput: input.featureOutput,
        featureCategory: input.featureCategory,
        pipeline: 'build',
      },
    });
    if (error && !/does not exist|relation/i.test(error.message)) {
      console.warn('[buildPersistence] swarm_runs insert:', error.message);
    }
  } catch (err) {
    console.warn('[buildPersistence]', (err as Error).message);
  }
  return runId;
}
