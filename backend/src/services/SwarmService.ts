import { getSupabaseAdmin } from '../config/supabase.js';
import { swarm } from '../swarm/XrogaSwarm.js';
import { ActionService } from './ActionService.js';
import type { SwarmStatus } from '../types/index.js';

export class SwarmService {
  static async run(userId: string, prompt: string, projectId?: string) {
    const supabase = getSupabaseAdmin();

    const canAfford = await ActionService.canAfford(userId, 5);
    if (!canAfford) {
      throw new Error('Insufficient actions to run Swarm task');
    }

    const { data: run, error } = await supabase
      .from('swarm_runs')
      .insert({
        user_id: userId,
        project_id: projectId ?? null,
        prompt,
        status: 'pending',
      })
      .select()
      .single();

    if (error || !run) {
      throw new Error(`Failed to create swarm run: ${error?.message}`);
    }

    swarm.setStatusCallback(async (runId, status, agent) => {
      await supabase
        .from('swarm_runs')
        .update({ status, current_agent: agent })
        .eq('id', runId);
    });

    const result = await swarm.execute(userId, prompt, projectId, run.id);

    const deductResult = await ActionService.deduct(userId, 'chat', {
      projectId,
      customCost: result.plan?.estimatedTotalActions ?? 5,
      description: `Swarm execution: ${prompt.slice(0, 80)}`,
    });

    await supabase
      .from('swarm_runs')
      .update({
        status: result.success ? 'completed' : 'failed',
        iteration_count: result.iterations,
        defects_found: result.defectsFound,
        output: result,
        completed_at: new Date().toISOString(),
      })
      .eq('id', run.id);

    if (projectId) {
      await supabase.from('project_messages').insert([
        { project_id: projectId, role: 'user', content: prompt },
        {
          project_id: projectId,
          role: 'assistant',
          content: result.success
            ? `Task completed after ${result.iterations} iteration(s). Zero defects confirmed.`
            : `Task could not reach zero-defect state after ${result.iterations} iteration(s).`,
          metadata: { swarmRunId: run.id, agents: result.agents },
        },
      ]);
    }

    await supabase.from('activity_logs').insert({
      user_id: userId,
      project_id: projectId ?? null,
      action: result.success ? 'swarm_completed' : 'swarm_failed',
      details: { runId: run.id, iterations: result.iterations, defects: result.defectsFound },
    });

    return { runId: run.id, result, actions: deductResult };
  }

  static async getRun(userId: string, runId: string) {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from('swarm_runs')
      .select('*')
      .eq('id', runId)
      .eq('user_id', userId)
      .single();

    if (error) throw new Error(error.message);
    return data;
  }

  static async getStatus(userId: string, runId: string): Promise<{
    status: SwarmStatus;
    currentAgent: string | null;
    iteration: number;
  }> {
    const run = await this.getRun(userId, runId);
    return {
      status: run.status as SwarmStatus,
      currentAgent: run.current_agent,
      iteration: run.iteration_count,
    };
  }
}
