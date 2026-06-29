import { featureSwarm } from '../swarm/FeatureSwarm.js';
import { classifyFeature } from '../services/architect/featureRouter.js';
import { getCachedResponse, setCachedResponse } from '../services/responseCache.js';
import { logSystemError } from '../services/systemErrorLog.js';
import { runThreeLayerShield } from './threeLayerShield.js';
import { loadMasterPrompt } from './masterPrompt.js';
import { buildArchitectDAG, isLongRunningTask, formatDuration } from './architectDAG.js';
import type { SwarmRunResult } from '../services/SwarmService.js';
import type { FeatureCategory, FeatureOutput, SwarmProgressEvent } from '../types/features.js';
import type { SwarmCoreAgent, SwarmPlan, SwarmResult } from '../types/index.js';
import { shouldUseFastChat, isTrivialPrompt, requiresFeaturePipeline } from '../lib/promptClassifier.js';
import { formatFeatureOutput, stripFakeImageMarkdown } from '../lib/featureIntent.js';
import { executeFeature, resolveFeatureCategory } from '../services/featureExecutor.js';
import { getImageProviderStatus } from '../services/builder/imageGen.js';
import { getVideoProviderStatus } from '../lib/videoProviders.js';

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
  return formatFeatureOutput(output);
}

function defaultAgents(passed: SwarmCoreAgent[] = ['architect', 'builder']): SwarmResult['agents'] {
  const all: SwarmCoreAgent[] = ['architect', 'builder', 'reviewer', 'qa', 'truth_council'];
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
  /** Fast path: natural chat without full 5-agent swarm or DAG noise */
  private static async executeFastChat(
    ctx: {
      userId: string;
      prompt: string;
      onProgress?: (event: SwarmProgressEvent) => void;
    },
    category: FeatureCategory = 'chat'
  ): Promise<SwarmRunResult & { polishedReply: string; fast: true; followUps: string[] }> {
    ctx.onProgress?.(progressEvent('builder', 'thinking', 'Thinking…'));

    const { quickChat } = await import('../services/chat/quickChat.js');
    const reply = await quickChat(ctx.prompt);
    const shield = await runThreeLayerShield({
      content: reply,
      prompt: ctx.prompt,
      userId: ctx.userId,
      includeProsCons: false,
    });

    return {
      runId: crypto.randomUUID(),
      fast: true,
      result: {
        success: true,
        iterations: 0,
        defectsFound: 0,
        plan: defaultPlan(),
        agents: defaultAgents(['builder']),
        output: { type: 'chat', content: shield.content } as FeatureOutput,
      },
      actions: { success: true, remaining: 0, cost: isTrivialPrompt(ctx.prompt) ? 0 : 1 },
      featureCategory: category,
      polishedReply: shield.content,
      followUps: shield.followUps,
    };
  }

  /** Direct image generation — bypasses swarm loop that can mask API failures */
  private static async executeImageFast(
    ctx: {
      userId: string;
      prompt: string;
      projectId?: string;
      onProgress?: (event: SwarmProgressEvent) => void;
    }
  ): Promise<SwarmRunResult & { polishedReply: string; fast: true; followUps: string[] }> {
    const runId = crypto.randomUUID();
    const { generateImage } = await import('../services/builder/imageGen.js');

    const status = getImageProviderStatus();
    if (!status.ready) {
      throw new Error(
        'No image API keys visible to the server. Set FAL_KEY, REPLICATE_API_TOKEN, or AGNES_API_KEY on Fly.io with: fly secrets set -a xroga-api FAL_API_KEY=...'
      );
    }

    const output = await generateImage(ctx.prompt, {
      userId: ctx.userId,
      runId,
      onProgress: (step, message) => {
        ctx.onProgress?.({
          runId,
          agent: 'builder',
          status: 'building',
          message,
          imageStep: step,
          timestamp: new Date().toISOString(),
        });
      },
    });

    const reply = formatFeatureOutput(output);

    return {
      runId,
      fast: true,
      result: {
        success: true,
        iterations: 0,
        defectsFound: 0,
        plan: defaultPlan(),
        agents: defaultAgents(['builder']),
        output,
      },
      actions: { success: true, remaining: 0, cost: 4 },
      featureCategory: 'image_generation',
      polishedReply: reply,
      followUps: output.followUps ?? [],
    };
  }

  /** Direct video/movie production — bypasses 5-agent swarm */
  private static async executeVideoFast(
    ctx: {
      userId: string;
      prompt: string;
      projectId?: string;
      onProgress?: (event: SwarmProgressEvent) => void;
    }
  ): Promise<SwarmRunResult & { polishedReply: string; fast: true; followUps: string[] }> {
    const runId = crypto.randomUUID();
    const { produceVideo } = await import('../services/media/videoStudio.js');

    const output = await produceVideo(ctx.userId, ctx.prompt, {
      projectId: ctx.projectId,
      runId,
      onProgress: (step, message, detail) => {
        ctx.onProgress?.({
          runId,
          agent: 'builder',
          status: 'building',
          message: detail ?? message,
          videoStep: step,
          timestamp: new Date().toISOString(),
        });
      },
    });

    const reply = formatFeatureOutput(output);

    return {
      runId,
      fast: true,
      result: {
        success: true,
        iterations: 0,
        defectsFound: 0,
        plan: defaultPlan(),
        agents: defaultAgents(['builder']),
        output,
      },
      actions: { success: true, remaining: 0, cost: output.actionCost },
      featureCategory: 'video_studio',
      polishedReply: reply,
      followUps: output.followUps ?? ['Add subtitles?', 'Generate episode 2?'],
    };
  }

  static async executeSafe(
    runFn: () => Promise<SwarmRunResult>,
    ctx: {
      userId: string;
      prompt: string;
      projectId?: string;
      onProgress?: (event: SwarmProgressEvent) => void;
    }
  ): Promise<SwarmRunResult & { polishedReply: string; followUps?: string[]; reasoning?: string; queued?: boolean; fast?: boolean }> {
    await loadMasterPrompt();

    const route = await classifyFeature(ctx.prompt).catch(() => ({
      category: 'chat' as FeatureCategory,
      taskType: 'chat' as const,
      actionCost: 1,
      confidence: 0.5,
      reasoning: 'fallback',
    }));

    const featureCategory = resolveFeatureCategory(ctx.prompt, route.category);

    // Fast chat: greetings & simple conversation — no swarm, no architect spam
    if (shouldUseFastChat(ctx.prompt, featureCategory)) {
      return this.executeFastChat(ctx, featureCategory);
    }

    // Image fast path — skip 5-agent swarm; call image APIs directly
    if (featureCategory === 'image_generation') {
      try {
        return await this.executeImageFast(ctx);
      } catch (imgErr) {
        await logSystemError({
          api: 'image_gen',
          errorMessage: (imgErr as Error).message,
          fallbackUsed: 'image-fast-path',
          severity: 'error',
          userId: ctx.userId,
        });
        const status = getImageProviderStatus();
        const errMsg = (imgErr as Error).message;
        const fallbackText = status.ready
          ? `Image generation failed. Server sees keys for: ${status.configured.join(', ')} — but all providers returned errors. Check \`fly logs -a xroga-api\`. Error: ${errMsg.slice(0, 180)}`
          : `No image API keys are visible on the server. GitHub FLY_API_TOKEN only deploys code — set secrets on Fly: fly secrets set -a xroga-api FAL_API_KEY=... REPLICATE_API_TOKEN=... AGNES_API_KEY=...`;

        const shield = await runThreeLayerShield({
          content: fallbackText,
          prompt: ctx.prompt,
          userId: ctx.userId,
          includeProsCons: false,
        });

        return {
          runId: crypto.randomUUID(),
          fast: true,
          result: {
            success: false,
            iterations: 0,
            defectsFound: 0,
            plan: defaultPlan(),
            agents: defaultAgents(['builder']),
            output: { type: 'chat', content: shield.content } as FeatureOutput,
          },
          actions: { success: true, remaining: 0, cost: 0 },
          featureCategory: 'image_generation',
          polishedReply: shield.content,
          followUps: shield.followUps,
        };
      }
    }

    // Video fast path — full movie pipeline with fallback chains
    if (featureCategory === 'video_studio') {
      try {
        return await this.executeVideoFast(ctx);
      } catch (vidErr) {
        await logSystemError({
          api: 'video_gen',
          errorMessage: (vidErr as Error).message,
          fallbackUsed: 'video-fast-path',
          severity: 'error',
          userId: ctx.userId,
        });
        const status = getVideoProviderStatus();
        const errMsg = (vidErr as Error).message;
        const fallbackText = status.ready
          ? `Video production encountered an issue. Server sees keys for: ${status.configured.join(', ')}. The pipeline will retry with fallback providers.`
          : `Video production is starting with available fallbacks. Configure RUNWAY_API_KEY, LUMA_API_KEY, AGNES_API_KEY, or KLING_API_KEY on Fly.io for best quality.`;

        const shield = await runThreeLayerShield({
          content: `${fallbackText}\n\n${errMsg.slice(0, 120)}`,
          prompt: ctx.prompt,
          userId: ctx.userId,
          includeProsCons: false,
        });

        return {
          runId: crypto.randomUUID(),
          fast: true,
          result: {
            success: false,
            iterations: 0,
            defectsFound: 0,
            plan: defaultPlan(),
            agents: defaultAgents(['builder']),
            output: { type: 'chat', content: shield.content } as FeatureOutput,
          },
          actions: { success: true, remaining: 0, cost: 0 },
          featureCategory: 'video_studio',
          polishedReply: shield.content,
          followUps: shield.followUps,
        };
      }
    }

    const plan = await buildArchitectDAG(ctx.prompt, {
      featureId: 'featureId' in route ? route.featureId : undefined,
    });

    // Internal DAG only — never leak analysis to user-facing progress
    if (plan.dag.length > 0) {
      ctx.onProgress?.(
        progressEvent('architect', 'planning', 'Planning…', {
          type: 'dag',
          dag: plan.dag,
          thinking: plan.thinking,
          internal: true,
        }) as SwarmProgressEvent
      );
    }

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

    const cached = !requiresFeaturePipeline(ctx.prompt) ? await getCachedResponse(ctx.prompt) : null;
    if (cached) {
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
      const isStructuredOutput =
        result.result.output &&
        typeof result.result.output === 'object' &&
        (result.result.output as { type?: string }).type !== 'chat';

      const shield = await runThreeLayerShield({
        content: reply,
        prompt: ctx.prompt,
        userId: ctx.userId,
        runId: result.runId,
        includeProsCons: !isStructuredOutput,
      });
      reply = isStructuredOutput ? reply : stripFakeImageMarkdown(shield.content);

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
        followUps:
          result.result.output &&
          typeof result.result.output === 'object' &&
          (result.result.output as { type?: string; followUps?: string[] }).type === 'image' &&
          Array.isArray((result.result.output as { followUps?: string[] }).followUps)
            ? [
                ...((result.result.output as { followUps: string[] }).followUps ?? []),
                ...shield.followUps,
              ].slice(0, 6)
            : shield.followUps,
        reasoning: plan.thinking || undefined,
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

      if (requiresFeaturePipeline(ctx.prompt)) {
        try {
          const category = resolveFeatureCategory(ctx.prompt, route.category);
          const output = await executeFeature(category, ctx.prompt, { userId: ctx.userId, projectId: ctx.projectId });
          fallbackText = formatFeatureOutput(output);
        } catch (featureErr) {
          const errMsg = (featureErr as Error).message;
          console.error('[Orchestrator] Feature fallback failed:', errMsg);
          const status = getImageProviderStatus();
          const configured = status.configured.length
            ? status.configured.join(', ')
            : 'none detected';
          fallbackText =
            `I couldn't complete that ${route.category.replace(/_/g, ' ')} request. ` +
            (status.ready
              ? `Your image API keys are loaded (${configured}) but all providers returned errors. Check Fly logs: fly logs -a xroga-api. Last error: ${errMsg.slice(0, 200)}`
              : `No image API keys are visible to the server (detected: ${configured}). GitHub FLY_API_TOKEN only deploys code — set keys on Fly with: fly secrets set -a xroga-api FAL_API_KEY=... REPLICATE_API_TOKEN=...`);
        }
      } else {
        try {
          const { quickChat } = await import('../services/chat/quickChat.js');
          const quick = await quickChat(ctx.prompt);
          if (quick?.trim()) fallbackText = stripFakeImageMarkdown(quick);
        } catch {
          /* use friendly fallback */
        }
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
      };
    }
  }
}

export { featureSwarm };
