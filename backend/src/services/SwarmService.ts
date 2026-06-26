import type { Response } from 'express';
import { getSupabaseAdmin } from '../config/supabase.js';
import { featureSwarm } from '../swarm/FeatureSwarm.js';
import { ActionService } from './ActionService.js';
import { classifyFeature, computeFeatureActionCost } from './architect/featureRouter.js';
import { sendSSE } from '../lib/sse.js';
import { InsufficientActionsError } from '../errors/InsufficientActionsError.js';
import type { SwarmStatus } from '../types/index.js';
import type { FeatureCategory, SwarmProgressEvent } from '../types/features.js';
import { FEATURE_TASK_TYPES } from '../types/features.js';

function isGreeting(prompt: string): boolean {
  return /^(hi|hello|hey|yo|sup|good\s+(morning|afternoon|evening))\b/i.test(prompt.trim());
}

export interface SwarmRunResult {
  runId: string;
  result: Awaited<ReturnType<typeof featureSwarm.execute>>;
  actions: Awaited<ReturnType<typeof ActionService.deduct>>;
  featureCategory: FeatureCategory;
}

export class SwarmService {
  static async run(
    userId: string,
    prompt: string,
    projectId?: string,
    onProgress?: (event: SwarmProgressEvent) => void,
    options?: { lineCount?: number; extras?: Record<string, unknown> }
  ): Promise<SwarmRunResult> {
    const supabase = getSupabaseAdmin();

    const route = await classifyFeature(prompt);
    let actionCost = computeFeatureActionCost(route.category, prompt, { lineCount: options?.lineCount });
    const taskType = FEATURE_TASK_TYPES[route.category];

    // Free greeting replies so new users can test chat immediately
    if (route.category === 'chat' && isGreeting(prompt)) {
      actionCost = 0;
    }

    let deductResult: Awaited<ReturnType<typeof ActionService.deduct>> = {
      success: true,
      remaining: (await ActionService.getBalance(userId))?.remaining ?? 0,
      cost: 0,
    };

    if (actionCost > 0) {
      const balance = await ActionService.getBalance(userId);
      if (!balance || balance.remaining < actionCost) {
        throw new InsufficientActionsError(actionCost, balance?.remaining ?? 0);
      }

      deductResult = await ActionService.deduct(userId, taskType, {
        projectId,
        customCost: actionCost,
        description: `${route.category}: ${prompt.slice(0, 80)}`,
      });

      if (!deductResult.success) {
        throw new InsufficientActionsError(actionCost, deductResult.remaining);
      }
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
      await ActionService.refund(userId, actionCost, 'Swarm run creation failed');
      throw new Error(`Failed to create swarm run: ${error?.message}`);
    }

    featureSwarm.setStatusCallback(async (runId, status, agent) => {
      await supabase.from('swarm_runs').update({ status, current_agent: agent }).eq('id', runId);
    });

    if (onProgress) {
      featureSwarm.setProgressCallback(onProgress);
    }

    let result: Awaited<ReturnType<typeof featureSwarm.execute>>;
    try {
      result = await featureSwarm.execute(userId, prompt, projectId, run.id, route.category, options?.extras);
    } catch (err) {
      await ActionService.refund(userId, actionCost, 'Swarm execution failed');
      throw err;
    }

    if (!result.success) {
      await ActionService.refund(userId, Math.floor(actionCost / 2), 'Partial refund – zero defects not reached');
    }

    await supabase
      .from('swarm_runs')
      .update({
        status: result.success ? 'completed' : 'failed',
        iteration_count: result.iterations,
        defects_found: result.defectsFound,
        output: { ...result, featureCategory: route.category },
        completed_at: new Date().toISOString(),
      })
      .eq('id', run.id);

    if (projectId) {
      const outputSummary = this.summarizeOutput(result.output);
      await supabase.from('project_messages').insert([
        { project_id: projectId, role: 'user', content: prompt },
        {
          project_id: projectId,
          role: 'assistant',
          content: result.success
            ? `✅ ${route.category} completed. ${outputSummary}`
            : `⚠️ Task incomplete after ${result.iterations} iteration(s).`,
          metadata: { swarmRunId: run.id, featureCategory: route.category, output: result.output },
        },
      ]);
    }

    await supabase.from('activity_logs').insert({
      user_id: userId,
      project_id: projectId ?? null,
      action: result.success ? 'swarm_completed' : 'swarm_failed',
      details: { runId: run.id, featureCategory: route.category, iterations: result.iterations },
    });

    return { runId: run.id, result, actions: deductResult, featureCategory: route.category };
  }

  static async runWithSSE(
    userId: string,
    prompt: string,
    res: Response,
    projectId?: string
  ): Promise<void> {
    sendSSE(res, {
      event: 'start',
      data: { message: 'Swarm initialized', prompt: prompt.slice(0, 100) },
    });

    sendSSE(res, {
      event: 'progress',
      data: { agent: 'architect', status: 'planning', message: 'Analyzing your request...' },
    });

    const result = await this.run(userId, prompt, projectId, (event) => {
      sendSSE(res, {
      event: 'progress',
      data: {
        agent: event.agent,
        status: event.status,
        message: event.message,
        iteration: event.iteration,
      },
    });
    });

    sendSSE(res, {
      event: 'complete',
      data: {
        runId: result.runId,
        success: result.result.success,
        featureCategory: result.featureCategory,
        output: result.result.output,
        agents: result.result.agents,
        actionsRemaining: result.actions.remaining,
      },
    });
  }

  static summarizeOutput(output: unknown): string {
    if (!output || typeof output !== 'object') return 'Task complete.';
    const o = output as Record<string, unknown>;

    if (o.type === 'landing_page' && typeof o.deployUrl === 'string') return `Live at ${o.deployUrl}`;
    if (o.type === 'image' && typeof o.imageUrl === 'string') return `Image ready: ${o.imageUrl.slice(0, 80)}...`;
    if (o.type === 'browser_automation') return 'Browser automation complete.';
    if (o.type === 'cross_post') return 'Posted to social platforms.';
    if (o.type === 'key_creation' && typeof o.message === 'string') return o.message;
    if (o.type === 'video_studio' && typeof o.streamingUrl === 'string') return `Video: ${o.streamingUrl}`;
    if (o.type === 'deep_research' && typeof o.pdfUrl === 'string') return `Report: ${o.pdfUrl}`;
    if (o.type === 'content_blocker' && typeof o.status === 'string') return o.status;
    if (o.type === 'job_hunter') return `Submitted ${o.applicationsSubmitted} applications`;
    if (o.type === 'code_debug' && o.zeroDefects) return 'Code debugged – zero defects';
    return 'Task complete.';
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

export function handleInsufficientActions(res: Response, err: InsufficientActionsError): void {
  res.status(402).json(err.toJSON());
}
