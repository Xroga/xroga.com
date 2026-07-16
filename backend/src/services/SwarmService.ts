import type { Response } from 'express';
import { getSupabaseAdmin } from '../config/supabase.js';
import { featureSwarm } from '../swarm/FeatureSwarm.js';
import { ActionService } from './ActionService.js';
import { classifyFeature } from './architect/featureRouter.js';
import { resolveFeatureCategory } from './featureExecutor.js';
import { sendSSE } from '../lib/sse.js';
import { InsufficientTokensError } from '../errors/InsufficientTokensError.js';
import { InsufficientActionsError } from '../errors/InsufficientActionsError.js';
import { ensureUserRecords } from './ensureUserRecords.js';
import { checkQuota, getUsage } from '../phase1/tokenTracker.js';
import { recordLlmUsage } from '../phase1/usageRecorder.js';
import { BUILD_PREFLIGHT_ESTIMATE } from '../config/modelRegistry.js';
import { Orchestrator } from '../orchestrator/Orchestrator.js';
import { persistChatTurns } from '../lib/threadMemory.js';
import { routingPrompt } from '../lib/promptRouting.js';
import { getSwarmQueue } from '../config/redis.js';
import type { SwarmStatus } from '../types/index.js';
import type { FeatureCategory, SwarmProgressEvent, FeatureOutput } from '../types/features.js';

function isMissingTableError(message: string): boolean {
  return /schema cache|could not find the table|does not exist|relation.*does not exist/i.test(
    message
  );
}

export interface SwarmRunResult {
  runId: string;
  result: Awaited<ReturnType<typeof featureSwarm.execute>>;
  /** @deprecated actions billing — use tokenUsage from build result */
  actions: { success: boolean; remaining: number; cost: number };
  tokenUsage?: Awaited<ReturnType<typeof getUsage>>;
  featureCategory: FeatureCategory;
}

function estimateTokensForCategory(category: FeatureCategory): { input: number; output: number } {
  switch (category) {
    case 'landing_page':
    case 'code_debug':
      return BUILD_PREFLIGHT_ESTIMATE;
    case 'deep_research':
      return { input: 80_000, output: 50_000 };
    case 'job_hunter':
      return { input: 40_000, output: 25_000 };
    case 'video_studio':
      return { input: 20_000, output: 10_000 };
    case 'image_generation':
      return { input: 3_000, output: 1_000 };
    default:
      return { input: 6_000, output: 4_000 };
  }
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
    const featureCategory = resolveFeatureCategory(prompt, route.category);
    const estimate = estimateTokensForCategory(featureCategory);

    const quota = await checkQuota(userId, estimate.input, estimate.output);
    if (!quota.allowed) {
      throw new InsufficientTokensError(
        estimate.input + estimate.output,
        quota.snapshot.totalTokensRemaining
      );
    }

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

    let tokenUsage = quota.snapshot;

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
    const usageBefore = await getUsage(userId);
    try {
      result = await featureSwarm.execute(userId, prompt, projectId, run.id, featureCategory, options?.extras);
    } catch (err) {
      throw err;
    }

    const usageAfter = await getUsage(userId);
    if (usageAfter.totalTokensUsed <= usageBefore.totalTokensUsed) {
      const est = estimateTokensForCategory(featureCategory);
      await recordLlmUsage(userId, est.input, est.output, [
        { role: 'deepseek_flash', inputTokens: est.input, outputTokens: est.output },
      ]);
    }
    tokenUsage = await getUsage(userId);

    if (persistRun) {
      await supabase
        .from('swarm_runs')
        .update({
          status: result.success ? 'completed' : 'failed',
          iteration_count: result.iterations,
          defects_found: result.defectsFound,
          output: { ...result, featureCategory },
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
            ? `✅ ${featureCategory} completed. ${outputSummary}`
            : `Task in progress — ${result.iterations} iteration(s) completed. Refine with a follow-up prompt for more detail.`,
          metadata: { swarmRunId: run.id, featureCategory, output: result.output },
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
      details: { runId: run.id, featureCategory, iterations: result.iterations },
    });
    if (activityError && !isMissingTableError(activityError.message)) {
      console.warn('[SwarmService] activity_logs insert:', activityError.message);
    }

    if (featureCategory === 'chat' && result.success) {
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

    return {
      runId: run.id,
      result,
      actions: {
        success: true,
        remaining: tokenUsage.totalTokensRemaining,
        cost: tokenUsage.totalTokensUsed,
      },
      tokenUsage,
      featureCategory,
    };
  }

  static async runWithSSE(
    userId: string,
    prompt: string,
    res: Response,
    projectId?: string,
    attachments?: Array<{ url: string; mimeType?: string; name?: string }>,
    clientMeta?: {
      assistantMessageId?: string;
      userMessageId?: string;
      userPrompt?: string;
      buildContinuation?: boolean;
      buildOriginalPrompt?: string;
      buildUpdate?: boolean;
      githubTargetRepo?: string;
      githubTargetBranch?: string;
      priorSite?: {
        html: string;
        css?: string;
        js?: string;
        projectName?: string;
      };
    },
    history?: Array<{ role: 'user' | 'assistant'; content: string }>
  ): Promise<void> {
    sendSSE(res, {
      event: 'start',
      data: { message: 'Ready', prompt: prompt.slice(0, 100) },
    });

    const abort = new AbortController();
    const onClientGone = () => {
      if (!abort.signal.aborted) abort.abort();
    };
    res.on('close', onClientGone);

    const onProgress = (event: SwarmProgressEvent) => {
      if (abort.signal.aborted) return;
      sendSSE(res, {
        event: 'progress',
        data: {
          agent: event.agent,
          status: event.status,
          message: event.message,
          iteration: event.iteration,
          imageStep: event.imageStep,
          videoStep: event.videoStep,
          omniPhase: event.omniPhase,
          omniDetail: event.omniDetail,
          imageAttempt: event.imageAttempt,
          negotiationPhase: event.negotiationPhase,
          userFacingPhase: event.userFacingPhase,
          swarmLogic: event.swarmLogic,
          swarmTodos: event.swarmTodos,
          swarmStatusLabel: event.swarmStatusLabel,
          swarmAnalysis: event.swarmAnalysis,
          swarmActivity: event.swarmActivity,
          needsGitHub: event.needsGitHub,
          needsVercel: event.needsVercel,
          councilLayer: event.councilLayer,
          deepseekPeak: (event as SwarmProgressEvent & { deepseekPeak?: boolean }).deepseekPeak,
          heavyBusy: (event as SwarmProgressEvent & { heavyBusy?: boolean }).heavyBusy,
        },
      });
    };

    const heartbeat = setInterval(() => {
      try {
        res.write(': keepalive\n\n');
      } catch {
        clearInterval(heartbeat);
        onClientGone();
      }
    }, 15_000);

    let result: Awaited<ReturnType<typeof Orchestrator.executeSafe>>;
    try {
      result = await Orchestrator.executeSafe(
        () => this.runCore(userId, prompt, projectId, onProgress, { extras: { attachments } }),
        {
          userId,
          prompt,
          onProgress,
          attachments,
          clientMeta: { ...clientMeta, abortSignal: abort.signal },
          history,
        }
      );
    } finally {
      clearInterval(heartbeat);
      res.off('close', onClientGone);
    }

    const output = result.result.output as FeatureOutput | undefined;
    const isLandingBuild = output?.type === 'landing_page';
    const replyDelta = isLandingBuild ? '' : (result.polishedReply ?? '');

    if (replyDelta) {
      sendSSE(res, {
        event: 'delta',
        data: { delta: replyDelta },
      });
    }

    sendSSE(res, {
      event: 'complete',
      data: {
        runId: result.runId,
        success: result.result.success,
        featureCategory: result.featureCategory,
        output: result.result.output,
        agents: result.result.agents,
        actionsRemaining: result.actions.remaining,
        tokenUsage: result.tokenUsage ?? (await getUsage(userId)),
        followUps: (result as { followUps?: string[] }).followUps,
        reasoning: (result as { reasoning?: string }).reasoning,
        queued: (result as { queued?: boolean }).queued,
        fast: (result as { fast?: boolean }).fast,
      },
    });

    const replyText = result.polishedReply?.trim();
    if (replyText) {
      const userLine = clientMeta?.userPrompt?.trim() || routingPrompt(prompt);
      void persistChatTurns(userId, userLine, replyText);
    }
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

  /** Merge messagesSnapshot into swarm_runs.output for cloud thread restore. */
  static async saveRunConversation(
    userId: string,
    runId: string,
    messages: unknown[]
  ): Promise<void> {
    const run = await this.getRun(userId, runId);
    const existing = (run.output as Record<string, unknown> | null) ?? {};
    const supabase = getSupabaseAdmin();
    const { error } = await supabase
      .from('swarm_runs')
      .update({
        output: { ...existing, messagesSnapshot: messages },
        completed_at: run.completed_at ?? new Date().toISOString(),
      })
      .eq('id', runId)
      .eq('user_id', userId);
    if (error) throw new Error(error.message);
  }
}

export function handleInsufficientActions(res: Response, err: InsufficientActionsError): void {
  res.status(402).json(err.toJSON());
}

export function handleInsufficientTokens(res: Response, err: import('../errors/InsufficientTokensError.js').InsufficientTokensError): void {
  res.status(402).json(err.toJSON());
}
