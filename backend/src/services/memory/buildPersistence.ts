/**
 * Persist negotiation/build pipeline results to swarm_runs for memory + history.
 */

import { getSupabaseAdmin } from '../../config/supabase.js';
import {isDeepStrictEqual} from 'node:util';
import { requireTenantContext,requireResourceOwner,type TenantContext } from '../../security/tenantContext.js';
import { TenantAccessError } from '../../security/tenantErrors.js';
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
  messagesSnapshot?: unknown[];
}

/** Dormant legacy writer. A future consumer must supply original server authority.
 * Existing swarm_runs trigger locks current database-project ownership at insert.
 * Never upsert or claim a persisted run from a missing acknowledgement.
 */
export async function persistBuildRun(context: TenantContext,input: BuildPersistInput): Promise<string> {
  const scope=requireTenantContext(context);
  input=structuredClone(input);
  requireResourceOwner(scope,input.userId);
  const runId = input.runId ?? crypto.randomUUID();
  try {
    const supabase = getSupabaseAdmin();
    const row = {
      id: runId,
      user_id: scope.userId,
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
        ...(input.messagesSnapshot?.length ? { messagesSnapshot: input.messagesSnapshot } : {}),
      },
    };
    const { data,error } = await supabase.from('swarm_runs').insert(row).select('id,user_id,project_id,prompt,status,output').single();
    if(error||!data||typeof data!=='object'||Array.isArray(data)
      ||data.id!==runId||data.user_id!==scope.userId||data.project_id!==row.project_id
      ||data.prompt!==row.prompt||data.status!==row.status
      ||!isDeepStrictEqual(data.output,JSON.parse(JSON.stringify(row.output)))){
      throw new TenantAccessError(503,'RESOURCE_ACCESS_UNAVAILABLE');
    }
  } catch {
    throw new TenantAccessError(503,'RESOURCE_ACCESS_UNAVAILABLE');
  }
  return runId;
}
