import type { Response } from 'express';
import { getSupabaseAdmin } from '../config/supabase.js';
import { featureSwarm } from '../swarm/FeatureSwarm.js';
import { ActionService } from './ActionService.js';
import { classifyFeature, computeFeatureActionCost } from './architect/featureRouter.js';
import { sendSSE } from '../lib/sse.js';
import { InsufficientActionsError } from '../errors/InsufficientActionsError.js';
import { ensureUserRecords } from './ensureUserRecords.js';
import { Orchestrator } from '../orchestrator/Orchestrator.js';
import { getSwarmQueue } from '../config/redis.js';
import type { SwarmStatus } from '../types/index.js';
import type { FeatureCategory, SwarmProgressEvent, FeatureOutput } from '../types/features.js';
import { FEATURE_TASK_TYPES } from '../types/features.js';

function isMissingTableError(message: string): boolean {
  return /schema cache|could not find the table|does not exist|relation.*does not exist/i.test(
    message
  );
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
    const wrapped = await Orchestrator.executeSafe(
      () => this.runCore(userId, prompt, projectId, onProgress, options),
      { userId, prompt, onProgress }
    );
    const { polishedReply: _pr, ...rest } = wrapped;
    void _pr;
    return rest;
  }

  static async enqueueLongTask(
    userId: string,
    prompt: string,
    projectId?: string,
    featureCategory?: FeatureCategory
  ): Promise<{ runId: string; queued: boolean }> {
    const runId = crypto.randomUUID();
    const queue = getSwarmQueue();
    const supabase = getSupabaseAdmin();

    if (!queue) {
      return { runId, queued: false };
    }

    await supabase.from('swarm_job_queue').insert({
      run_id: runId,
      user_id: userId,
      prompt,
      project_id: projectId ?? null,
      feature_category: featureCategory ?? null,
      status: 'queued',
    });

    await queue.add('swarm-execute', { userId, prompt, projectId, runId }, { jobId: runId });

    return { runId, queued: true };
  }

  private static async runCore(
    userId: string,
    prompt: string,
    projectId?: string,
    onProgress?: (event: SwarmProgressEvent) => void,
    options?: { lineCount?: number; extras?: Record<string, unknown> }
  ): Promise<SwarmRunResult> {
    const supabase = getSupabaseAdmin();

    try {
      await ensureUserRecords(userId);
    } catch (provisionErr) {
      console.warn('[SwarmService] ensureUserRecords:', (provisionErr as Error).message);
    }

    const route = await classifyFeature(prompt);
    const actionCost = computeFeatureActionCost(route.category, prompt, { lineCount: options?.lineCount });
    const taskType = FEATURE_TASK_TYPES[route.category];

    const balance = await ActionService.getBalance(userId);
    if (balance) {
      const { count } = await supabase
        .from('swarm_runs')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', userId)
        .in('status', ['pending', 'planning', 'building', 'reviewing', 'testing', 'verifying']);

      if (count !== null && count >= balance.concurrencyLimit) {
        throw new Error(
          `Concurrency limit reached (${balance.concurrencyLimit} parallel tasks). Upgrade your plan or wait for a task to finish.`
        );
      }
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

    const { data: insertedRun, error: insertError } = await supabase
      .from('swarm_runs')
      .insert({
        user_id: userId,
        project_id: projectId ?? null,
        prompt,
        status: 'pending',
      })
      .select()
      .single();

    let persistRun = true;
    let run: { id: string };

    if (insertError || !insertedRun) {
      if (insertError && isMissingTableError(insertError.message)) {
        console.warn(
          '[SwarmService] swarm_runs table missing — running in ephemeral mode. Apply migration 006_production_swarm_schema.sql'
        );
        persistRun = false;
        run = { id: crypto.randomUUID() };
      } else {
        await ActionService.refund(userId, actionCost, 'Swarm run creation failed');
        throw new Error(`Failed to create swarm run: ${insertError?.message ?? 'unknown error'}`);
      }
    } else {
      run = insertedRun;
    }

    featureSwarm.setStatusCallback(async (runId, status, agent) => {
      if (!persistRun) return;
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

    if (persistRun) {
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
    }

    if (projectId) {
      const outputSummary = this.summarizeOutput(result.output);
      const { error: pmError } = await supabase.from('project_messages').insert([
        { project_id: projectId, role: 'user', content: prompt },
        {
          project_id: projectId,
          role: 'assistant',
          content: result.success
            ? `✅ ${route.category} completed. ${outputSummary}`
            : `Task in progress — ${result.iterations} iteration(s) completed. Refine with a follow-up prompt for more detail.`,
          metadata: { swarmRunId: run.id, featureCategory: route.category, output: result.output },
        },
      ]);
      if (pmError && !isMissingTableError(pmError.message)) {
        console.warn('[SwarmService] project_messages insert:', pmError.message);
      }
    }

    const { error: activityError } = await supabase.from('activity_logs').insert({
      user_id: userId,
      project_id: projectId ?? null,
      action: result.success ? 'swarm_completed' : 'swarm_failed',
      details: { runId: run.id, featureCategory: route.category, iterations: result.iterations },
    });
    if (activityError && !isMissingTableError(activityError.message)) {
      console.warn('[SwarmService] activity_logs insert:', activityError.message);
    }

    if (route.category === 'chat' && result.success) {
      const chatOutput = result.output as FeatureOutput | undefined;
      const reply =
        chatOutput?.type === 'chat' && typeof chatOutput.content === 'string'
          ? chatOutput.content
          : this.summarizeOutput(result.output);

      const { error: msgError } = await supabase.from('messages').insert([
        { user_id: userId, content: prompt, role: 'user' },
        { user_id: userId, content: reply, role: 'assistant' },
      ]);
      if (msgError && !isMissingTableError(msgError.message)) {
        console.warn('[SwarmService] messages insert:', msgError.message);
      }
    }

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

    const onProgress = (event: SwarmProgressEvent) => {
      sendSSE(res, {
        event: 'progress',
        data: {
          agent: event.agent,
          status: event.status,
          message: event.message,
          iteration: event.iteration,
        },
      });
    };

    const result = await Orchestrator.executeSafe(
      () => this.runCore(userId, prompt, projectId, onProgress),
      { userId, prompt, onProgress }
    );

    sendSSE(res, {
      event: 'delta',
      data: { delta: result.polishedReply },
    });

    sendSSE(res, {
      event: 'complete',
      data: {
        runId: result.runId,
        success: true,
        featureCategory: result.featureCategory,
        output: result.result.output,
        agents: result.result.agents,
        actionsRemaining: result.actions.remaining,
        followUps: (result as { followUps?: string[] }).followUps,
        reasoning: (result as { reasoning?: string }).reasoning,
        queued: (result as { queued?: boolean }).queued,
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

  static async listRuns(userId: string, limit = 20) {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from('swarm_runs')
      .select('id, prompt, status, output, created_at, completed_at, iteration_count')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) {
      if (isMissingTableError(error.message)) return [];
      throw new Error(error.message);
    }
    return data ?? [];
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
