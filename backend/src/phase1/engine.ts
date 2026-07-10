import { classifyIntent } from './classifier.js';
import { buildRoutingPlan, getSystemPromptForIntent } from './router.js';
import { callModel } from './providers/base.js';
import { checkQuota, recordUsage, getUsage } from './tokenTracker.js';
import { checkRateLimit } from './rateLimiter.js';
import { phase1Logger } from './logger.js';
import { estimateCost } from './models.js';
import type { Phase1ChatRequest, Phase1ChatResponse, Phase1ErrorResponse } from './types.js';

const MODEL_NAME_PATTERN =
  /\b(deepseek|grok|claude|anthropic|xai|sonnet|opus|flash|pro|gpt|openai|gemini|llama|mistral)\b/gi;

function sanitizeResponse(text: string): string {
  return text.replace(MODEL_NAME_PATTERN, 'Xroga AI');
}

function combineOutputs(parts: string[]): string {
  return parts.filter(Boolean).join('\n\n---\n\n');
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

  const intent = await classifyIntent(message);
  const plan = buildRoutingPlan(intent, message);

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

  const runModel = async (
    modelId: NonNullable<typeof plan.primary>,
    role: 'primary' | 'secondary',
    context?: string
  ) => {
    const systemPrompt = getSystemPromptForIntent(intent, role);
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

      if (plan.secondary) {
        const secondaryOut = await runModel(plan.secondary, 'secondary', primaryOut);
        outputs.push(secondaryOut);
      }
    }

    const rawResponse = combineOutputs(outputs);
    const response = sanitizeResponse(rawResponse);

    const usage = await recordUsage(userId, totalInput, totalOutput);

    phase1Logger.info('Message processed', {
      userId,
      intent,
      totalInput,
      totalOutput,
      percentUsed: usage.percentUsed,
    });

    return {
      ok: true,
      data: { response, intent, usage },
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
