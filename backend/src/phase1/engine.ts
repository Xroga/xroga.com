import { classifyIntent } from './classifier.js';
import { buildRoutingPlan, getSystemPromptForIntent } from './router.js';
import { callModel } from './providers/base.js';
import { checkQuota, getUsage } from './tokenTracker.js';
import { recordLlmUsage, type ModelUsageLine } from './usageRecorder.js';
import { checkRateLimit } from './rateLimiter.js';
import { phase1Logger } from './logger.js';
import { estimateCost } from './models.js';
import type { XrogaModelRole } from '../config/modelRegistry.js';
import type { InternalModelId, Phase1ChatRequest, Phase1ChatResponse, Phase1ErrorResponse } from './types.js';
import { runLiveResearch } from '../lib/liveResearch.js';
import { isMathQuery } from '../lib/mathQuery.js';
import { trySolveMathLocally } from '../lib/mathSolver.js';
import { normalizeMathResponse } from '../lib/formatMathResponse.js';
import { filterSourcesForUser } from '../lib/filterCitedSources.js';
import { isHackathonQuery, fetchHackathonAdvisorBrief } from '../lib/hackathonResearch.js';
import { sanitizeChatHonesty, CHAT_HONESTY_RULES } from '../lib/chatHonesty.js';
import { detectThirdPartyProductQuestion, thirdPartySupportSystemBlock } from '../lib/thirdPartyProduct.js';
import { sanitizeInternalModelLeaks } from '../lib/responseSanitize.js';
import { isTrivialPrompt } from '../lib/promptClassifier.js';
import { isProductBuildRequest } from '../lib/buildIntent.js';
import { isWebsiteUpdateRequest } from '../lib/buildContinuation.js';

function toXrogaModelRole(modelId: InternalModelId, reasoningEffort?: 'high'): XrogaModelRole {
  if (modelId === 'grok_fast') {
    return reasoningEffort === 'high' ? 'grok_reasoning' : 'grok_fast';
  }
  return modelId as XrogaModelRole;
}

function combineOutputs(parts: string[], intent: string): string {
  const [primary, secondary] = parts.filter(Boolean);
  if (!secondary) return primary ?? '';
  if (intent === 'business_advice') {
    return `${primary}\n\n## Validation notes\n${secondary}`;
  }
  return `${primary}\n\n${secondary}`;
}

export type EngineResult =
  | { ok: true; data: Phase1ChatResponse }
  | { ok: false; status: number; data: Phase1ErrorResponse };

export async function processMessage(req: Phase1ChatRequest): Promise<EngineResult> {
  const { message, userId, history = [] } = req;

  const rate = checkRateLimit(userId);
  if (!rate.allowed) {
    return {
      ok: false,
      status: 429,
      data: {
        error: 'Rate limit exceeded. Maximum 100 requests per minute.',
        code: 'RATE_LIMIT_EXCEEDED',
      },
    };
  }

  const quotaCheck = await checkQuota(userId, Math.ceil(message.length / 4), 512);
  if (!quotaCheck.allowed) {
    return {
      ok: false,
      status: 402,
      data: {
        error: 'Monthly token quota exceeded.',
        code: 'QUOTA_EXCEEDED',
      },
    };
  }

  phase1Logger.info('Processing message', { userId, messageLength: message.length });

  // Hard block: product builds must use negotiation swarm — Phase 1 writes costly how-to essays.
  if (isProductBuildRequest(message)) {
    phase1Logger.warn('Rejected product build routed to Phase 1', { userId, preview: message.slice(0, 80) });
    return {
      ok: false,
      status: 409,
      data: {
        error: 'This is a product build request. Use the Xroga build swarm, not chat Q&A.',
        code: 'USE_BUILD_PIPELINE',
      },
    };
  }

  // Site patches (theme toggle, night/day, dashboard updates) must patch GitHub — never how-to advice.
  if (isWebsiteUpdateRequest(message)) {
    phase1Logger.warn('Rejected website update routed to Phase 1', { userId, preview: message.slice(0, 80) });
    return {
      ok: false,
      status: 409,
      data: {
        error: 'This is a website update request. Use the Xroga build swarm to patch files.',
        code: 'USE_BUILD_PIPELINE',
      },
    };
  }

  // Cheap path: never burn a full model call + prior build history on "hi".
  if (isTrivialPrompt(message)) {
    const lower = message.trim().toLowerCase();
    let reply = "Hey! What can I help you with today?";
    if (/^(thanks|thank\s*you|thx)\b/.test(lower)) {
      reply = "You're welcome! Let me know if you need anything else.";
    } else if (/^(bye|goodbye|see\s*ya)\b/.test(lower)) {
      reply = 'See you later — happy building!';
    } else if (/^(yes|no|ok|okay|yep|nope|cool|nice|got\s*it)\b/.test(lower)) {
      reply = 'Got it. What should we work on next?';
    } else if (/good\s+(morning|afternoon|evening)/.test(lower)) {
      const period = lower.match(/good\s+(\w+)/)?.[1] ?? 'day';
      reply = `Good ${period}! What can I help you with?`;
    }
    const usage = await recordLlmUsage(
      userId,
      Math.ceil(message.length / 4),
      Math.ceil(reply.length / 4)
    );
    phase1Logger.info('Trivial greeting short-circuit', { userId });
    return {
      ok: true,
      data: {
        response: reply,
        intent: 'general_chat',
        usage,
      },
    };
  }

  const mathQuery = isMathQuery(message);

  if (mathQuery) {
    const local = trySolveMathLocally(message);
    if (local) {
      const usage = await recordLlmUsage(userId, Math.ceil(message.length / 4), 64);
      phase1Logger.info('Math solved locally', { userId });
      return {
        ok: true,
        data: {
          response: local,
          intent: 'deep_reasoning',
          usage,
        },
      };
    }
  }

  const intent = await classifyIntent(message);
  const plan = buildRoutingPlan(intent, message, mathQuery);
  const thirdPartyProduct = detectThirdPartyProductQuestion(message);

  let liveResearch = await runLiveResearch(message, { intent });
  if (thirdPartyProduct && !liveResearch) {
    try {
      const { webSearch } = await import('../lib/webSearch.js');
      const results = await webSearch(`${thirdPartyProduct.name} payment billing top up support`, {
        maxResults: 4,
      });
      if (results.length) {
        liveResearch = {
          context: `\n## Live web research (${thirdPartyProduct.name} only)\n${results.map((r) => `- ${r.title}: ${r.content.slice(0, 160)} (${r.url})`).join('\n')}\nCite only these URLs — do not invent others.`,
          sources: results.map((r) => ({
            title: r.title,
            url: r.url,
            snippet: r.content.slice(0, 220),
            source: r.source,
            siteDomain: '',
          })),
          searchedAt: new Date().toISOString(),
          reasons: ['third_party_support'],
          youtubeCount: 0,
        };
      }
    } catch {
      /* optional */
    }
  } else if (thirdPartyProduct) {
    liveResearch = {
      ...liveResearch!,
      context: `${liveResearch!.context}\n\nIMPORTANT: User question is about ${thirdPartyProduct.name}, NOT Xroga.`,
    };
  }

  let hackathonBrief: Awaited<ReturnType<typeof fetchHackathonAdvisorBrief>> | null = null;
  if (isHackathonQuery(message)) {
    try {
      hackathonBrief = await fetchHackathonAdvisorBrief(message);
    } catch (err) {
      console.warn('[Phase1] Hackathon research:', (err as Error).message);
    }
  }

  if (plan.phase2Message) {
    const usage = await getUsage(userId);
    return {
      ok: true,
      data: {
        response: plan.phase2Message,
        intent,
        usage,
      },
    };
  }

  // Short general chat: drop prior build essays (cost + topic bleed).
  const shortGeneralChat = intent === 'general_chat' && message.trim().length < 120;
  const useHistory = shortGeneralChat
    ? []
    : history.map((h) => ({
        role: h.role as 'user' | 'assistant',
        content: h.content.length > 1200 ? `${h.content.slice(0, 1200)}…` : h.content,
      }));

  const conversationMessages = [
    ...useHistory,
    { role: 'user' as const, content: message },
  ];

  let totalInput = 0;
  let totalOutput = 0;
  const outputs: string[] = [];
  const modelLines: ModelUsageLine[] = [];
  const maxTokens = shortGeneralChat ? 512 : 4096;

  const runModel = async (
    modelId: NonNullable<typeof plan.primary>,
    role: 'primary' | 'secondary',
    context?: string
  ) => {
    let systemPrompt = getSystemPromptForIntent(intent, role, mathQuery, message);
    if (thirdPartyProduct) {
      systemPrompt = `${systemPrompt}\n${thirdPartySupportSystemBlock(thirdPartyProduct)}`;
    }
    if (liveResearch?.context && !shortGeneralChat) {
      systemPrompt = `${systemPrompt}\n\n${liveResearch.context}`;
    }
    if (hackathonBrief) {
      systemPrompt = `${systemPrompt}\n\n## Hackathon intelligence (use this — do not invent rules)\n${hackathonBrief.markdown}`;
    }
    const messages =
      context && role === 'secondary'
        ? [
            ...conversationMessages.slice(0, -1),
            {
              role: 'user' as const,
              content: `${message}\n\n---\nPrior output to refine:\n${context}`,
            },
          ]
        : conversationMessages;

    const result = await callModel(modelId, {
      systemPrompt,
      messages,
      maxTokens,
      reasoningEffort: plan.grokReasoningEffort,
    });

    totalInput += result.inputTokens;
    totalOutput += result.outputTokens;
    modelLines.push({
      role: toXrogaModelRole(modelId, plan.grokReasoningEffort),
      inputTokens: result.inputTokens,
      outputTokens: result.outputTokens,
    });

    const cost = estimateCost(modelId, result.inputTokens, result.outputTokens);
    phase1Logger.info('Model call completed', {
      modelId,
      role,
      inputTokens: result.inputTokens,
      outputTokens: result.outputTokens,
      estimatedCostUsd: cost.toFixed(6),
    });

    return result.content;
  };

  try {
    if (plan.primary) {
      const primaryOut = await runModel(plan.primary, 'primary');
      outputs.push(primaryOut);

      if (plan.secondary && primaryOut.length < 1200 && !shortGeneralChat) {
        const secondaryOut = await runModel(plan.secondary, 'secondary', primaryOut);
        if (secondaryOut.trim().length > 80) outputs.push(secondaryOut);
      }
    }

    const rawResponse = combineOutputs(outputs, intent);
    const hadResearch = Boolean(liveResearch?.sources.length || hackathonBrief?.sources.length);
    const normalized = mathQuery ? normalizeMathResponse(rawResponse) : rawResponse;
    const honestyOpts = {
      hadLiveResearch: hadResearch,
      thirdPartyProduct: thirdPartyProduct?.name,
    };
    const withHonesty = ['general_chat', 'business_advice', 'deep_reasoning'].includes(intent)
      ? sanitizeChatHonesty(normalized, honestyOpts)
      : normalized;
    const response = sanitizeInternalModelLeaks(withHonesty, message);

    const usage = await recordLlmUsage(userId, totalInput, totalOutput, modelLines);

    phase1Logger.info('Message processed', {
      userId,
      intent,
      totalInput,
      totalOutput,
      percentUsed: usage.percentUsed,
    });

    const mergedSources = [
      ...(liveResearch?.sources ?? []),
      ...(hackathonBrief?.sources.map((s) => ({
        title: s.title,
        url: s.url,
        snippet: s.snippet,
        source: 'searxng' as const,
        siteDomain: (() => {
          try {
            return new URL(s.url).hostname.replace(/^www\./i, '');
          } catch {
            return '';
          }
        })(),
      })) ?? []),
    ];

    return {
      ok: true,
      data: {
        response,
        intent,
        usage,
        webSources: mergedSources.length
          ? filterSourcesForUser(response, mergedSources, 6)
          : undefined,
        hackathonBrief: hackathonBrief?.card,
      },
    };
  } catch (err) {
    const error = err as Error;
    const isTimeout = error.name === 'AbortError' || /abort/i.test(error.message);

    phase1Logger.error('Engine error', {
      userId,
      intent,
      error: error.message,
      stack: error.stack,
    });

    if (isTimeout) {
      return {
        ok: false,
        status: 504,
        data: { error: 'Request timed out after 30 seconds.', code: 'TIMEOUT' },
      };
    }

    return {
      ok: false,
      status: 500,
      data: { error: 'An error occurred processing your request.', code: 'ENGINE_ERROR' },
    };
  }
}
