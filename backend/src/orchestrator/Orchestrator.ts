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
import {
  isBuildContinuation,
  hasThreadContext,
  looksLikeBuildClarificationAnswer,
  isWebsiteBuildUpdate,
  isWebsiteUpdateRequest,
  isActiveWebsiteProjectContext,
} from '../lib/buildContinuation.js';
import {
  enrichPromptWithThread,
  enrichPromptForWebsiteContext,
  loadRecentChatTurns,
  persistChatTurns,
  shouldContinueWebsiteBuild,
} from '../lib/threadMemory.js';
import type { ChatTurn } from '../lib/conversationContext.js';
import { routingPrompt } from '../lib/promptRouting.js';
import { shouldUseFastChat, isTrivialPrompt, requiresFeaturePipeline } from '../lib/promptClassifier.js';
import { isCapabilitiesQuery } from '../lib/xrogaCapabilities.js';
import { analyzeUserQuery } from '../lib/queryAnalyzer.js';
import { formatFeatureOutput, stripFakeImageMarkdown, isVideoIntent, VIDEO_REMOVED_MESSAGE } from '../lib/featureIntent.js';
import { executeFeature, resolveFeatureCategory } from '../services/featureExecutor.js';
import { resolveAttachmentFeatureCategory } from '../lib/featureIntent.js';
import { getImageProviderStatus } from '../services/builder/imageGen.js';
import {
  runNegotiationEngine,
  runEscapePod,
  shouldUseNegotiationEngine,
} from '../swarm/negotiation/engine.js';
import { isPaidApiAllowed } from '../config/hybridConfig.js';
import { routeDualPipeline } from '../router/dualPipelineRouter.js';
import { persistBuildRun } from '../services/memory/buildPersistence.js';

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
    const userText = routingPrompt(ctx.prompt);
    const analysis = analyzeUserQuery(userText);
    if (!isTrivialPrompt(userText)) {
      for (const step of analysis.thinkingSteps.slice(0, 2)) {
        ctx.onProgress?.(progressEvent('builder', 'thinking', step));
      }
    }

    const { quickChat } = await import('../services/chat/quickChat.js');
    const chatResult = await quickChat(userText, (layer, detail) => {
      const msg = detail ?? analysis.thinkingSteps.at(-1) ?? `Black Hole V∞ — ${layer}`;
      ctx.onProgress?.(
        progressEvent('builder', 'building', msg, {
          councilLayer: layer,
        })
      );
    });
    const reply = chatResult.content;
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
        output: {
          type: 'chat',
          content: shield.content,
          webSources: chatResult.webSources,
          hackathonBrief: chatResult.hackathonBrief,
        } as FeatureOutput,
      },
      actions: { success: true, remaining: 0, cost: isTrivialPrompt(ctx.prompt) ? 0 : 1 },
      featureCategory: category,
      polishedReply: shield.content,
      followUps: shield.followUps,
    };
  }

  /** 9-Phase AI Swarm Logic — negotiated build with Core Quartet + Reserve */
  private static async executeNegotiationBuild(
    ctx: {
      userId: string;
      prompt: string;
      onProgress?: (event: SwarmProgressEvent) => void;
      clientMeta?: {
        githubTargetRepo?: string;
        githubTargetBranch?: string;
        assistantMessageId?: string;
      };
    },
    featureCategory: FeatureCategory
  ): Promise<SwarmRunResult & { polishedReply: string; followUps: string[]; fast?: boolean }> {
    const userText = routingPrompt(ctx.prompt);
    const runNegotiation = async () =>
      runNegotiationEngine({
        userPrompt: ctx.prompt.trim(),
        userId: ctx.userId,
        featureCategory,
        onProgress: ctx.onProgress,
        githubTargetRepo: ctx.clientMeta?.githubTargetRepo,
        githubTargetBranch: ctx.clientMeta?.githubTargetBranch,
        assistantMessageId: ctx.clientMeta?.assistantMessageId,
      });

    let result;
    try {
      result = isPaidApiAllowed() ? await runNegotiation() : await runEscapePod({
        userPrompt: userText,
        userId: ctx.userId,
        featureCategory,
        onProgress: ctx.onProgress,
      });
    } catch (err) {
      console.warn('[Orchestrator] Negotiation engine failed, Escape Pod:', (err as Error).message);
      try {
        result = await runEscapePod({
          userPrompt: userText,
          userId: ctx.userId,
          featureCategory,
          onProgress: ctx.onProgress,
        });
      } catch (escapeErr) {
        console.warn('[Orchestrator] Escape Pod failed:', (escapeErr as Error).message);
        const msg = (err as Error).message?.includes('GitHub')
          ? '🔗 Connect your GitHub account to start building. XROGA will auto-push code and deploy a live preview.'
          : `⚠️ Build could not complete: ${(err as Error).message?.slice(0, 120) || 'API unavailable'}. Check GitHub connection and DEEPSEEK_CODE_API_KEY on Fly.io.`;
        return {
          runId: crypto.randomUUID(),
          result: {
            success: false,
            iterations: 0,
            defectsFound: 0,
            plan: defaultPlan(),
            agents: defaultAgents(['architect']),
            output: { type: 'chat', content: msg } as FeatureOutput,
          },
          actions: { success: true, remaining: 0, cost: 0 },
          featureCategory,
          polishedReply: msg,
          followUps: ['Connect GitHub', 'Try build again'],
        };
      }
    }

    if (result.needsGitHubConnection) {
      ctx.onProgress?.({
        runId: crypto.randomUUID(),
        agent: 'architect',
        status: 'needs_github',
        message: 'Connect GitHub to start building',
        negotiationPhase: 0,
        swarmLogic: true,
        needsGitHub: true,
        timestamp: new Date().toISOString(),
      } as SwarmProgressEvent);
      return {
        runId: crypto.randomUUID(),
        fast: true,
        result: {
          success: false,
          iterations: 0,
          defectsFound: 0,
          plan: defaultPlan(),
          agents: defaultAgents(['architect']),
          output: {
            type: 'chat',
            content:
              '🔗 Connect your GitHub account to start building. XROGA will auto-push code and deploy a live preview.',
          } as FeatureOutput,
        },
        actions: { success: true, remaining: 0, cost: 0 },
        featureCategory,
        polishedReply:
          '🔗 Connect your GitHub account to start building. XROGA will auto-push code and deploy a live preview.',
        followUps: ['Connect GitHub', 'What can you build for me?'],
      };
    }

    if (result.needsUserClarification) {
      const reply = result.clarificationText ?? result.polishedOutput;
      const buildFollowUps = ['Use defaults and build it now', 'Build with warm brown & gold theme'];
      return {
        runId: crypto.randomUUID(),
        fast: true,
        result: {
          success: true,
          iterations: 0,
          defectsFound: 0,
          plan: defaultPlan(),
          agents: defaultAgents(['architect']),
          output: { type: 'chat', content: reply } as FeatureOutput,
        },
        actions: { success: true, remaining: 0, cost: 1 },
        featureCategory,
        polishedReply: reply,
        followUps: buildFollowUps,
      };
    }

    const isLanding = result.featureOutput?.type === 'landing_page';
    let replyText = isLanding ? '' : result.polishedOutput;
    let shieldFollowUps: string[] = [];

    if (!isLanding) {
      const shield = await runThreeLayerShield({
        content: result.polishedOutput,
        prompt: ctx.prompt,
        userId: ctx.userId,
        includeProsCons: false,
      });
      replyText = shield.content;
      shieldFollowUps = shield.followUps;
    }

    const structuredOutput = result.featureOutput ?? ({ type: 'chat', content: replyText } as FeatureOutput);
    const followUps = isLanding
      ? [
          'Change brand name and hero headline',
          'Switch to dark mode with a light/dark toggle',
          'Add animations and modern hover effects',
          'Update pricing plans and sections',
          'Fix buttons and JavaScript that are not working',
        ]
      : [...shieldFollowUps, 'Deploy this build?', 'Add another feature?'].slice(0, 4);

    const runId = crypto.randomUUID();
    void persistBuildRun({
      userId: ctx.userId,
      prompt: ctx.prompt,
      featureCategory,
      success: result.success,
      polishedReply: replyText,
      featureOutput: structuredOutput.type === 'landing_page' ? structuredOutput : result.featureOutput,
      runId,
    });

    return {
      runId,
      result: {
        success: result.success,
        iterations: 1,
        defectsFound: 0,
        plan: defaultPlan(),
        agents: defaultAgents(['architect', 'builder', 'reviewer', 'qa', 'truth_council']),
        output: structuredOutput,
      },
      actions: { success: true, remaining: 0, cost: featureCategory === 'chat' ? 1 : 15 },
      featureCategory,
      polishedReply: replyText,
      followUps,
    };
  }

  /** Direct image generation — bypasses swarm loop that can mask API failures */
  private static async executeImageFast(
    ctx: {
      userId: string;
      prompt: string;
      projectId?: string;
      onProgress?: (event: SwarmProgressEvent) => void;
      attachments?: Array<{ url: string; mimeType?: string; name?: string }>;
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

    const imageAttachment = ctx.attachments?.find(
      (a) => a.mimeType?.startsWith('image/') || a.url.startsWith('data:image/') || /\.(png|jpe?g|webp|gif)(\?|$)/i.test(a.url)
    );

    const userText = routingPrompt(ctx.prompt);

    const stylePrompt = imageAttachment
      ? `[Image Edit] Style transfer: ${userText}\nsource image: ${imageAttachment.url}`
      : userText;

    const output = await generateImage(stylePrompt, {
      userId: ctx.userId,
      runId,
      sourceImageUrl: imageAttachment?.url,
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
      onImageAttempt: (attempt) => {
        ctx.onProgress?.({
          runId,
          agent: 'builder',
          status: 'building',
          message: `${attempt.provider} · ${attempt.matchScore}%`,
          imageStep: 'painting',
          imageAttempt: attempt,
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

  static async executeSafe(
    runFn: () => Promise<SwarmRunResult>,
    ctx: {
      userId: string;
      prompt: string;
      projectId?: string;
      onProgress?: (event: SwarmProgressEvent) => void;
      attachments?: Array<{ url: string; mimeType?: string; name?: string }>;
      clientMeta?: {
        assistantMessageId?: string;
        userMessageId?: string;
        userPrompt?: string;
        buildContinuation?: boolean;
        buildOriginalPrompt?: string;
        buildUpdate?: boolean;
        githubTargetRepo?: string;
        githubTargetBranch?: string;
      };
      history?: ChatTurn[];
    }
  ): Promise<SwarmRunResult & { polishedReply: string; followUps?: string[]; reasoning?: string; queued?: boolean; fast?: boolean }> {
    await loadMasterPrompt();

    let prompt = ctx.prompt.trim();

    // Explicit build session from frontend — most reliable continuation signal
    if (
      ctx.clientMeta?.buildContinuation &&
      looksLikeBuildClarificationAnswer(prompt) &&
      !hasThreadContext(prompt)
    ) {
      const original = ctx.clientMeta.buildOriginalPrompt?.trim();
      const turns: ChatTurn[] = ctx.history?.length
        ? ctx.history
        : original
          ? [
              { role: 'user', content: original },
              {
                role: 'assistant',
                content:
                  '[Phase 1] Let me understand what you need — project name, colors, and online ordering.',
              },
            ]
          : [];
      if (turns.length) {
        prompt = enrichPromptWithThread(prompt, turns);
      }
    }

    if (!/\[Previous conversation for context/i.test(prompt)) {
      const clientHistory = ctx.history?.filter((t) => t.content?.trim());
      if (clientHistory?.length) {
        const websiteEnriched = enrichPromptForWebsiteContext(prompt, clientHistory);
        if (websiteEnriched !== prompt) {
          prompt = websiteEnriched;
        } else if (shouldContinueWebsiteBuild(prompt, clientHistory)) {
          prompt = enrichPromptWithThread(prompt, clientHistory);
        }
      } else if (looksLikeBuildClarificationAnswer(prompt)) {
        const dbTurns = await loadRecentChatTurns(ctx.userId);
        const merged = enrichPromptWithThread(prompt, dbTurns);
        if (merged !== prompt) prompt = merged;
      }
    }

    ctx.prompt = prompt;
    const userText = routingPrompt(prompt);

    const dualRouteEarly = routeDualPipeline({
      userId: ctx.userId,
      prompt: ctx.prompt,
      history: ctx.history,
    });

    // BUILD FIRST — never let "build a website" fall through to chat model
    if (
      dualRouteEarly.pipeline === 'build' ||
      isBuildContinuation(prompt) ||
      shouldContinueWebsiteBuild(prompt, ctx.history) ||
      (ctx.clientMeta?.buildContinuation && looksLikeBuildClarificationAnswer(prompt)) ||
      isWebsiteBuildUpdate(prompt, ctx.history) ||
      ctx.clientMeta?.buildUpdate ||
      (isWebsiteUpdateRequest(userText) && isActiveWebsiteProjectContext(prompt, ctx.history))
    ) {
      if (
        (isWebsiteBuildUpdate(prompt, ctx.history) ||
          ctx.clientMeta?.buildUpdate ||
          (isWebsiteUpdateRequest(userText) && isActiveWebsiteProjectContext(prompt, ctx.history))) &&
        !hasThreadContext(prompt) &&
        ctx.history?.length
      ) {
        prompt = enrichPromptForWebsiteContext(prompt, ctx.history);
        ctx.prompt = prompt;
      } else if (
        (isBuildContinuation(prompt) || shouldContinueWebsiteBuild(prompt, ctx.history)) &&
        !hasThreadContext(prompt) &&
        ctx.history?.length
      ) {
        prompt = enrichPromptWithThread(prompt, ctx.history);
        ctx.prompt = prompt;
      }
      return this.executeNegotiationBuild(ctx, dualRouteEarly.featureCategory ?? 'landing_page');
    }

    // Capabilities FAQ — never DAG, never background queue
    if (isCapabilitiesQuery(userText)) {
      return this.executeFastChat(ctx, 'chat');
    }

    const hasImageAttachment = ctx.attachments?.some(
      (a) => a.mimeType?.startsWith('image/') || /\.(png|jpe?g|webp|gif)(\?|$)/i.test(a.url) || a.url.startsWith('data:image/')
    );

    const route = await classifyFeature(userText).catch(() => ({
      category: 'chat' as FeatureCategory,
      taskType: 'chat' as const,
      actionCost: 1,
      confidence: 0.5,
      reasoning: 'fallback',
    }));

    const featureCategory = hasImageAttachment
      ? resolveAttachmentFeatureCategory(userText, route.category)
      : resolveFeatureCategory(userText, route.category);

    // Fast chat: greetings & simple conversation — no swarm, no architect spam
    if (shouldUseFastChat(ctx.prompt, featureCategory)) {
      return this.executeFastChat(ctx, featureCategory);
    }

    // Image fast path — skip 5-agent swarm; call image APIs directly
    if (featureCategory === 'image_generation') {
      try {
        return await this.executeImageFast(ctx);
      } catch (imgErr) {
        const errMsg = (imgErr as Error).message;
        const isModeration =
          errMsg.includes('cannot generate') ||
          errMsg.includes('does not generate') ||
          errMsg.includes('not allowed');

        await logSystemError({
          api: 'image_gen',
          errorMessage: errMsg,
          fallbackUsed: 'image-fast-path',
          severity: isModeration ? 'warning' : 'error',
          userId: ctx.userId,
        });

        const fallbackText = isModeration
          ? errMsg
          : (() => {
              const status = getImageProviderStatus();
              return status.ready
                ? `Image generation failed. ${errMsg.slice(0, 180)}`
                : `No image API keys visible on the server. Set FAL_API_KEY, REPLICATE_API_TOKEN, or AGNES_API_KEY on Fly.io.`;
            })();

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

    // Video generation removed — offer image generation instead
    if (featureCategory === 'video_studio' || isVideoIntent(ctx.prompt)) {
      const content = VIDEO_REMOVED_MESSAGE;
      return {
        runId: crypto.randomUUID(),
        fast: true,
        result: {
          success: true,
          iterations: 0,
          defectsFound: 0,
          plan: defaultPlan(),
          agents: defaultAgents(['builder']),
          output: { type: 'chat', content } as FeatureOutput,
        },
        actions: { success: true, remaining: 0, cost: 0 },
        featureCategory: 'chat',
        polishedReply: content,
        followUps: ['Generate an image for me', 'Build a website', 'Create a logo'],
      };
    }

    // 9-Phase AI Swarm Logic — website/app builds always enter negotiation first
    if (shouldUseNegotiationEngine(ctx.prompt, featureCategory) || shouldUseNegotiationEngine(ctx.prompt, 'landing_page')) {
      const buildCategory: FeatureCategory =
        featureCategory === 'chat' || featureCategory === 'browser_automation'
          ? 'landing_page'
          : featureCategory;
      return this.executeNegotiationBuild(ctx, buildCategory);
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

    const cached =
      !requiresFeaturePipeline(ctx.prompt) && route.category !== 'chat'
        ? await getCachedResponse(ctx.prompt)
        : null;
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

      if (result.result.success && result.featureCategory !== 'chat') {
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
          if (quick.content?.trim()) fallbackText = stripFakeImageMarkdown(quick.content);
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
