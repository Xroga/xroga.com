import { randomUUID } from 'node:crypto';
import { Router, type Request } from 'express';
import { z } from 'zod';

import {
  chatCompletion,
  estimateMessageTokens,
  type ChatMessage,
} from '../ai/openaiCompat.js';
import {
  callableModelIds,
  type ModelId,
} from '../ai/models.js';
import { normalizeProviderError } from '../ai/providerRuntime.js';

export const GUEST_CHAT_PROMPT_LIMIT = 5;
export const GUEST_CHAT_WINDOW_MS = 24 * 60 * 60_000;
export const GUEST_CHAT_IP_WINDOW_MS = 15 * 60_000;
export const GUEST_CHAT_IP_LIMIT = 10;

interface RateBucket {
  count: number;
  resetsAt: number;
}

const sessionBuckets = new Map<string, RateBucket>();
const ipBuckets = new Map<string, RateBucket>();

const guestChatSchema = z.object({
  guestSessionId: z.string().uuid().optional(),
  message: z.string().trim().min(1).max(4_000),
  history: z.array(z.object({
    role: z.enum(['user', 'assistant']),
    content: z.string().max(4_000),
  })).max(8).optional(),
}).strict();

const GUEST_SYSTEM = [
  'You are Xroga AI in guest preview mode.',
  'Give useful text-only conversation, product planning, requirements, architecture guidance, debugging explanations, and implementation advice.',
  'Guest preview has no repository access, no file uploads, no live-web research, no connected apps, no external tools, no code execution, no builds, and no deployment or publishing authority.',
  'If the user asks you to build, deploy, connect an app, inspect a repository, upload or analyze a file, or take an external action, help them plan the task but clearly say real execution starts after they create or sign in to a free Xroga account.',
  'Never claim that a file, repository, deployment, integration, or external action was created or changed in guest mode.',
  'Never ask for passwords, API keys, tokens, or other secrets.',
  'If current or live information is required, say guest preview does not have live-web access rather than inventing freshness.',
  'Keep the response focused and useful. Do not mention internal model or provider names.',
].join('\n');

function consumeBucket(
  buckets: Map<string, RateBucket>,
  key: string,
  limit: number,
  windowMs: number,
  now: number,
): { allowed: boolean; remaining: number; resetsAt: number } {
  const current = buckets.get(key);
  const bucket =
    !current || current.resetsAt <= now
      ? { count: 0, resetsAt: now + windowMs }
      : current;

  if (bucket.count >= limit) {
    buckets.set(key, bucket);
    return { allowed: false, remaining: 0, resetsAt: bucket.resetsAt };
  }

  bucket.count += 1;
  buckets.set(key, bucket);
  return {
    allowed: true,
    remaining: Math.max(0, limit - bucket.count),
    resetsAt: bucket.resetsAt,
  };
}

function cleanExpired(now: number) {
  for (const [key, bucket] of sessionBuckets) {
    if (bucket.resetsAt <= now) sessionBuckets.delete(key);
  }
  for (const [key, bucket] of ipBuckets) {
    if (bucket.resetsAt <= now) ipBuckets.delete(key);
  }
}

function guestClientAddress(req: Request): string {
  const flyClientIp = req.header('fly-client-ip')?.trim();
  if (flyClientIp) return flyClientIp.slice(0, 96);
  return (req.ip || req.socket.remoteAddress || 'unknown').slice(0, 96);
}

export function consumeGuestAllowance(
  guestSessionId: string,
  clientAddress: string,
  now = Date.now(),
) {
  cleanExpired(now);

  const ip = consumeBucket(
    ipBuckets,
    clientAddress || 'unknown',
    GUEST_CHAT_IP_LIMIT,
    GUEST_CHAT_IP_WINDOW_MS,
    now,
  );
  if (!ip.allowed) {
    return {
      allowed: false as const,
      reason: 'ip' as const,
      remaining: 0,
      resetsAt: ip.resetsAt,
    };
  }

  const session = consumeBucket(
    sessionBuckets,
    guestSessionId,
    GUEST_CHAT_PROMPT_LIMIT,
    GUEST_CHAT_WINDOW_MS,
    now,
  );
  if (!session.allowed) {
    return {
      allowed: false as const,
      reason: 'session' as const,
      remaining: 0,
      resetsAt: session.resetsAt,
    };
  }

  return {
    allowed: true as const,
    remaining: session.remaining,
    resetsAt: Math.max(session.resetsAt, ip.resetsAt),
  };
}

export function resetGuestChatRateLimitsForTest() {
  sessionBuckets.clear();
  ipBuckets.clear();
}

async function guestCompletion(messages: ChatMessage[]) {
  const callable = new Set(callableModelIds());
  const candidates: ModelId[] = ['deepseek_v4_flash', 'glm_5_3_flash'];

  let lastError: unknown = null;
  for (const modelId of candidates) {
    if (!callable.has(modelId)) continue;
    try {
      return await chatCompletion(modelId, messages, {
        maxTokens: 900,
        temperature: 0.45,
        reasoningMode: 'none',
      });
    } catch (error) {
      lastError = error;
    }
  }

  if (lastError) throw lastError;
  throw new Error('No guest chat model is configured');
}

const router = Router();

router.post('/chat', async (req, res) => {
  const parsed = guestChatSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      error: 'Send a short text message to continue.',
      code: 'INVALID_GUEST_REQUEST',
    });
    return;
  }

  const guestSessionId = parsed.data.guestSessionId ?? randomUUID();
  const allowance = consumeGuestAllowance(
    guestSessionId,
    guestClientAddress(req),
  );

  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('RateLimit-Limit', String(GUEST_CHAT_PROMPT_LIMIT));
  res.setHeader('RateLimit-Remaining', String(allowance.remaining));
  res.setHeader('RateLimit-Reset', String(Math.ceil(allowance.resetsAt / 1000)));

  if (!allowance.allowed) {
    res.status(429).json({
      error:
        'Your guest preview is complete. Create a free Xroga account to keep this conversation and continue.',
      code: 'GUEST_LIMIT_REACHED',
      guestSessionId,
      guest: {
        limit: GUEST_CHAT_PROMPT_LIMIT,
        remaining: 0,
        resetAt: new Date(allowance.resetsAt).toISOString(),
      },
    });
    return;
  }

  const history: ChatMessage[] = (parsed.data.history ?? [])
    .slice(-8)
    .map((turn) => ({
      role: turn.role,
      content: turn.content.slice(0, 2_000),
    }));

  const messages: ChatMessage[] = [
    { role: 'system', content: GUEST_SYSTEM },
    ...history,
    { role: 'user', content: parsed.data.message },
  ];

  if (estimateMessageTokens(messages) > 7_000) {
    res.status(413).json({
      error:
        'This guest conversation is too large. Send a shorter message or create a free account to continue.',
      code: 'GUEST_CONTEXT_TOO_LARGE',
      guestSessionId,
    });
    return;
  }

  try {
    const result = await guestCompletion(messages);

    res.json({
      response: result.text,
      guestSessionId,
      guest: {
        limit: GUEST_CHAT_PROMPT_LIMIT,
        remaining: allowance.remaining,
        resetAt: new Date(allowance.resetsAt).toISOString(),
      },
    });
  } catch (error) {
    const failure = normalizeProviderError(error);
    console.error('[guest/chat]', { category: failure.kind });

    res.status(503).json({
      error: 'Guest chat is temporarily unavailable. Please try again shortly.',
      code: 'GUEST_CHAT_UNAVAILABLE',
      guestSessionId,
      guest: {
        limit: GUEST_CHAT_PROMPT_LIMIT,
        remaining: allowance.remaining,
        resetAt: new Date(allowance.resetsAt).toISOString(),
      },
    });
  }
});

export default router;
