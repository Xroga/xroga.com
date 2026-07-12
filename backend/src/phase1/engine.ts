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
import { sanitizeChatHonesty } from '../lib/chatHonesty.js';

function toXrogaModelRole(modelId: InternalModelId, reasoningEffort?: 'high'): XrogaModelRole {
  if (modelId === 'grok_fast') {
    return reasoningEffort === 'high' ? 'grok_reasoning' : 'grok_fast';
  }
  return modelId as XrogaModelRole;
}

const MODEL_NAME_PATTERN =
  /\b(deepseek|grok|claude|anthropic|xai|sonnet|opus|flash|pro|gpt|openai|gemini|llama|mistral)\b/gi;

function sanitizeResponse(text: string): string {
  return text.replace(MODEL_NAME_PATTERN, 'Xroga AI');
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

  let liveResearch = await runLiveResearch(message, { intent });

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

  const conversationMessages = [
    ...history.map((h) => ({ role: h.role as 'user' | 'assistant', content: h.content })),
    { role: 'user' as const, content: message },
  ];

  let totalInput = 0;
  let totalOutput = 0;
  const outputs: string[] = [];
  const modelLines: ModelUsageLine[] = [];

  const runModel = async (
    modelId: NonNullable<typeof plan.primary>,
    role: 'primary' | 'secondary',
    context?: string
  ) => {
    let systemPrompt = getSystemPromptForIntent(intent, role, mathQuery, message);
    if (liveResearch?.context) {
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
      maxTokens: 4096,
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

      if (plan.secondary && primaryOut.length < 1200) {
        const secondaryOut = await runModel(plan.secondary, 'secondary', primaryOut);
        if (secondaryOut.trim().length > 80) outputs.push(secondaryOut);
      }
    }

    const rawResponse = combineOutputs(outputs, intent);
    const hadResearch = Boolean(liveResearch?.sources.length || hackathonBrief?.sources.length);
    const normalized = mathQuery ? normalizeMathResponse(rawResponse) : rawResponse;
    const response = sanitizeResponse(
      ['general_chat', 'business_advice', 'deep_reasoning'].includes(intent)
        ? sanitizeChatHonesty(normalized, { hadLiveResearch: hadResearch })
        : normalized
    );

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
