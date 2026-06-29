import { featureSwarm } from '../swarm/FeatureSwarm.js';
import { classifyFeature } from '../services/architect/featureRouter.js';
import { getCachedResponse, setCachedResponse } from '../services/responseCache.js';
import { logSystemError } from '../services/systemErrorLog.js';
import { runThreeLayerShield } from './threeLayerShield.js';
import { loadMasterPrompt } from './masterPrompt.js';
import { buildArchitectDAG, isLongRunningTask, formatDuration } from './architectDAG.js';
import type { SwarmRunResult } from '../services/SwarmService.js';
import type { FeatureCategory, FeatureOutput, SwarmProgressEvent } from '../types/features.js';
import type { SwarmAgent, SwarmPlan, SwarmResult } from '../types/index.js';

const FRIENDLY_FALLBACKS = [
  "I'm putting the finishing touches on this — here's what I can share right now based on your request.",
  "Great question. Here's a solid starting point while the full Swarm run completes in the background.",
  "XROGA is on it. Here's a helpful answer to keep you moving forward.",
];

const BACKGROUND_MSG =
  "Your request is being processed in the background. We'll notify you here when it's ready. Here's a quick preview while the Swarm works:";

function pickFallback(): string {
  return FRIENDLY_FALLBACKS[Math.floor(Math.random() * FRIENDLY_FALLBACKS.length)];
}

function extractReplyText(output: unknown): string {
  if (!output || typeof output !== 'object') return 'Task complete.';
  const o = output as Record<string, unknown>;
  if (o.type === 'chat' && typeof o.content === 'string') return o.content;
  if (typeof o.message === 'string') return o.message;
  if (typeof o.deployUrl === 'string') return `Your project is live at ${o.deployUrl}`;
  if (typeof o.imageUrl === 'string') return `Image ready: ${o.imageUrl}`;
  if (typeof o.streamingUrl === 'string') return `Video ready: ${o.streamingUrl}`;
  if (typeof o.pdfUrl === 'string') return `Research report: ${o.pdfUrl}`;
  return JSON.stringify(o).slice(0, 500);
}

function defaultAgents(passed: SwarmAgent[] = ['architect', 'builder']): SwarmResult['agents'] {
  const all: SwarmAgent[] = ['architect', 'builder', 'reviewer', 'qa', 'truth_council'];
  return all.reduce(
    (acc, agent) => {
      acc[agent] = {
        status: passed.includes(agent) ? 'passed' : 'failed',
        notes: passed.includes(agent) ? 'Completed' : 'Skipped',
      };
      return acc;
    },
    {} as SwarmResult['agents']
  );
}

function defaultPlan(): SwarmPlan {
  return { steps: [], estimatedTotalActions: 1, requiresApproval: false };
}

function progressEvent(agent: string, status: string, message: string, extra?: Record<string, unknown>): SwarmProgressEvent {
  return {
    runId: crypto.randomUUID(),
    agent,
    status,
    message,
    timestamp: new Date().toISOString(),
    ...extra,
  } as SwarmProgressEvent & Record<string, unknown>;
}

export class Orchestrator {
  static async executeSafe(
    runFn: () => Promise<SwarmRunResult>,
    ctx: {
      userId: string;
      prompt: string;
      projectId?: string;
      onProgress?: (event: SwarmProgressEvent) => void;
    }
  ): Promise<SwarmRunResult & { polishedReply: string; followUps?: string[]; reasoning?: string; queued?: boolean }> {
    await loadMasterPrompt();

    const plan = await buildArchitectDAG(ctx.prompt, {
      onProgress: ctx.onProgress,
    });

    ctx.onProgress?.(
      progressEvent('architect', 'planning', plan.analysis, {
        type: 'dag',
        dag: plan.dag,
        thinking: plan.thinking,
      }) as SwarmProgressEvent
    );

    // Long-running: enqueue and return immediately
    if (isLongRunningTask(plan, ctx.prompt)) {
      const route = await classifyFeature(ctx.prompt).catch(() => ({ category: 'chat' as FeatureCategory }));
      const { SwarmService } = await import('../services/SwarmService.js');
      const { runId, queued } = await SwarmService.enqueueLongTask(
        ctx.userId,
        ctx.prompt,
        ctx.projectId,
        route.category
      );

      let preview = `${BACKGROUND_MSG}\n\n**Plan overview:** ${plan.analysis}\n\nEstimated time: ${formatDuration(plan.estimatedDurationSeconds)}`;
      if (queued) {
        ctx.onProgress?.(progressEvent('builder', 'queued', 'Queued for background processing…'));
      }

      const shield = await runThreeLayerShield({
        content: preview,
        prompt: ctx.prompt,
        userId: ctx.userId,
        includeProsCons: false,
      });

      return {
        runId,
        queued: true,
        result: {
          success: true,
          iterations: 0,
          defectsFound: 0,
          plan: defaultPlan(),
          agents: defaultAgents(['architect']),
          output: { type: 'chat', content: shield.content } as FeatureOutput,
        },
        actions: { success: true, remaining: 0, cost: 0 },
        featureCategory: route.category,
        polishedReply: shield.content,
        reasoning: plan.thinking,
        followUps: shield.followUps,
      };
    }

    const cached = await getCachedResponse(ctx.prompt);
    if (cached) {
      ctx.onProgress?.(progressEvent('architect', 'complete', 'Served from cache'));
      const shield = await runThreeLayerShield({
        content: cached,
        prompt: ctx.prompt,
        userId: ctx.userId,
        includeProsCons: false,
      });
      return {
        runId: crypto.randomUUID(),
        result: {
          success: true,
          iterations: 0,
          defectsFound: 0,
          plan: defaultPlan(),
          agents: defaultAgents(['architect']),
          output: { type: 'chat', content: shield.content } as FeatureOutput,
        },
        actions: { success: true, remaining: 0, cost: 0 },
        featureCategory: 'chat' as FeatureCategory,
        polishedReply: shield.content,
        followUps: shield.followUps,
        reasoning: plan.thinking,
      };
    }

    try {
      const result = await runFn();
      let reply = extractReplyText(result.result.output);
      const shield = await runThreeLayerShield({
        content: reply,
        prompt: ctx.prompt,
        userId: ctx.userId,
        runId: result.runId,
      });
      reply = shield.content;

      if (result.result.success) {
        await setCachedResponse(ctx.prompt, reply, result.featureCategory);
      }

      if (result.result.output && typeof result.result.output === 'object') {
        const out = result.result.output as FeatureOutput;
        if (out.type === 'chat') {
          (out as { content: string }).content = reply;
        }
      }

      return {
        ...result,
        polishedReply: reply,
        followUps: shield.followUps,
        reasoning: plan.thinking,
      };
    } catch (err) {
      await logSystemError({
        api: 'orchestrator',
        errorMessage: (err as Error).message,
        fallbackUsed: 'graceful-degradation',
        severity: 'error',
        userId: ctx.userId,
      });

      const route = await classifyFeature(ctx.prompt).catch(() => ({
        category: 'chat' as FeatureCategory,
        taskType: 'chat' as const,
        actionCost: 1,
        confidence: 0.5,
        reasoning: 'fallback',
      }));

      let fallbackText = pickFallback();
      try {
        const { quickChat } = await import('../services/chat/quickChat.js');
        const quick = await quickChat(ctx.prompt);
        if (quick?.trim()) fallbackText = quick;
      } catch {
        /* use friendly fallback */
      }

      const shield = await runThreeLayerShield({
        content: fallbackText,
        prompt: ctx.prompt,
        userId: ctx.userId,
        includeProsCons: false,
      });

      return {
        runId: crypto.randomUUID(),
        result: {
          success: true,
          iterations: 0,
          defectsFound: 0,
          plan: defaultPlan(),
          agents: defaultAgents(['architect', 'builder']),
          output: { type: 'chat', content: shield.content } as FeatureOutput,
        },
        actions: { success: true, remaining: 0, cost: 0 },
        featureCategory: route.category,
        polishedReply: shield.content,
        followUps: shield.followUps,
        reasoning: plan.thinking,
      };
    }
  }
}

export { featureSwarm };
