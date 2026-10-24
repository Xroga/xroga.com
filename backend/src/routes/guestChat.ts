import { createHash, randomUUID } from 'node:crypto';
import {isDeepStrictEqual} from 'node:util';
import {registerModelSdkAdmission,modelAdmissionDenied} from '../ai/modelSdkAdmission.js';
import { Router, type Request, type RequestHandler } from 'express';
import { z } from 'zod';

import {
  chatCompletion,
  estimateMessageTokens,
  type ChatMessage,
} from '../ai/openaiCompat.js';
import {
  callableModelIds,
  resolveModelSpec,
  type ModelId,
} from '../ai/models.js';
import { normalizeProviderError,isTerminalModelFailure } from '../ai/providerRuntime.js';
import { SAFE_RICH_OUTPUT_GUIDE } from '../ai/prompts.js';
import { getRedis } from '../config/redis.js';
import {
  authMiddleware,
  type AuthRequest,
} from '../middleware/auth.js';

export const GUEST_CHAT_PROMPT_LIMIT = 5;
export const GUEST_CHAT_WINDOW_MS = 24 * 60 * 60_000;
export const GUEST_CHAT_IP_WINDOW_MS = 15 * 60_000;
export const GUEST_CHAT_IP_LIMIT = 10;
export const GUEST_CHAT_TOKEN_BUDGET = 16_000;
export const GUEST_CHAT_CONCURRENCY_TTL_MS = 45_000;
export const GUEST_CHAT_CLAIM_TTL_MS = 24 * 60 * 60_000;

interface RateBucket {
  count: number;
  resetsAt: number;
}

interface GuestLease {
  token: string;
  sessionId: string;
  redisKey?: string;
  expiresAt:number;
}
const issuedLeases=new WeakSet<GuestLease>();
const productionGuest=()=>process.env.NODE_ENV==='production'||Boolean(process.env.FLY_APP_NAME);
function guestAccountingDenied():never{throw Object.assign(Error('Guest admission or accounting is unavailable.'),{code:'PROVIDER_RESERVATION_DENIED',status:503});}
function requireGuestRedis(){const redis=getRedis();if(!redis&&productionGuest())guestAccountingDenied();return redis;}
function issueGuestLease(lease:GuestLease):GuestLease{Object.freeze(lease);issuedLeases.add(lease);return lease;}

const sessionBuckets = new Map<string, RateBucket>();
const ipBuckets = new Map<string, RateBucket>();
const tokenBuckets = new Map<string, RateBucket>();
const activeSessions = new Map<string, { token: string; expiresAt: number }>();
const claimedSessions = new Map<string, number>();

const guestChatSchema = z.object({
  guestSessionId: z.string().uuid().optional(),
  message: z.string().trim().min(1).max(4_000),
  history: z.array(z.object({
    role: z.enum(['user', 'assistant']),
    content: z.string().max(4_000),
  })).max(8).optional(),
}).strict();

const guestClaimSchema = z.object({
  guestSessionId: z.string().uuid(),
}).strict();

export const GUEST_SYSTEM = [
  'You are Xroga AI in guest preview mode.',
  'Give useful conversation, product planning, requirements, architecture guidance, debugging explanations, and implementation advice.',
  'Guest preview has no repository access, no file uploads, no live-web research, no connected apps, no external tools, no code execution, no builds, and no deployment or publishing authority.',
  'If the user asks you to build, deploy, connect an app, inspect a repository, upload or analyze a file, or take an external action, help them plan the task but clearly say real execution starts after they create or sign in to a free Xroga account.',
  'Never claim that a file, repository, deployment, integration, or external action was created or changed in guest mode.',
  'Never ask for passwords, API keys, tokens, or other secrets.',
  'If current or live information is required, say guest preview does not have live-web access rather than inventing freshness.',
  SAFE_RICH_OUTPUT_GUIDE,
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

function consumeTokenBucket(
  guestSessionId: string,
  requestedTokens: number,
  now: number,
) {
  const current = tokenBuckets.get(guestSessionId);
  const bucket =
    !current || current.resetsAt <= now
      ? { count: 0, resetsAt: now + GUEST_CHAT_WINDOW_MS }
      : current;

  if (bucket.count + requestedTokens > GUEST_CHAT_TOKEN_BUDGET) {
    tokenBuckets.set(guestSessionId, bucket);
    return {
      allowed: false as const,
      remaining: Math.max(0, GUEST_CHAT_TOKEN_BUDGET - bucket.count),
      resetsAt: bucket.resetsAt,
    };
  }

  bucket.count += requestedTokens;
  tokenBuckets.set(guestSessionId, bucket);
  return {
    allowed: true as const,
    remaining: Math.max(0, GUEST_CHAT_TOKEN_BUDGET - bucket.count),
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
  for (const [key, bucket] of tokenBuckets) {
    if (bucket.resetsAt <= now) tokenBuckets.delete(key);
  }
  for (const [key, lease] of activeSessions) {
    if (lease.expiresAt <= now) activeSessions.delete(key);
  }
  for (const [key, expiresAt] of claimedSessions) {
    if (expiresAt <= now) claimedSessions.delete(key);
  }
}

function guestClientAddress(req: Request): string {
  const flyClientIp = req.header('fly-client-ip')?.trim();
  if (flyClientIp) return flyClientIp.slice(0, 96);
  return (req.ip || req.socket.remoteAddress || 'unknown').slice(0, 96);
}

function stableAddressKey(address: string) {
  return createHash('sha256').update(address || 'unknown').digest('hex').slice(0, 32);
}

function fixedWindow(now: number, windowMs: number) {
  const start = Math.floor(now / windowMs) * windowMs;
  return { start, resetsAt: start + windowMs };
}

async function redisIncrement(
  key: string,
  amount: number,
  ttlMs: number,
): Promise<number> {
  const redis = getRedis();
  if (!redis) throw new Error('redis_not_configured');
  const result = await redis
    .multi()
    .incrby(key, amount)
    .pexpire(key, ttlMs * 2)
    .exec();
  const count=result?.[0]?.[1];
  if(!Array.isArray(result)||result.length!==2||result.some(row=>!row||row[0])
    ||typeof count!=='number'||!Number.isSafeInteger(count)||count<amount||result[1]?.[1]!==1)guestAccountingDenied();
  return count;
}

async function consumeGuestAllowanceDistributed(
  guestSessionId: string,
  clientAddress: string,
  now = Date.now(),
) {
  const redis = requireGuestRedis();
  if (!redis) return consumeGuestAllowance(guestSessionId, clientAddress, now);

  try {
    const ipWindow = fixedWindow(now, GUEST_CHAT_IP_WINDOW_MS);
    const ipKey =
      `xroga:guest:ip:${stableAddressKey(clientAddress)}:${ipWindow.start}`;
    const ipCount = await redisIncrement(
      ipKey,
      1,
      GUEST_CHAT_IP_WINDOW_MS,
    );
    if (ipCount > GUEST_CHAT_IP_LIMIT) {
      return {
        allowed: false as const,
        reason: 'ip' as const,
        remaining: 0,
        resetsAt: ipWindow.resetsAt,
      };
    }

    const sessionWindow = fixedWindow(now, GUEST_CHAT_WINDOW_MS);
    const sessionKey =
      `xroga:guest:session:${guestSessionId}:${sessionWindow.start}`;
    const sessionCount = await redisIncrement(
      sessionKey,
      1,
      GUEST_CHAT_WINDOW_MS,
    );
    if (sessionCount > GUEST_CHAT_PROMPT_LIMIT) {
      return {
        allowed: false as const,
        reason: 'session' as const,
        remaining: 0,
        resetsAt: sessionWindow.resetsAt,
      };
    }

    return {
      allowed: true as const,
      remaining: Math.max(0, GUEST_CHAT_PROMPT_LIMIT - sessionCount),
      resetsAt: Math.max(sessionWindow.resetsAt, ipWindow.resetsAt),
    };
  } catch (error) {
    if(productionGuest())guestAccountingDenied();
    console.warn('[guest/chat] Redis allowance unavailable');
    return consumeGuestAllowance(guestSessionId, clientAddress, now);
  }
}

async function consumeGuestTokenBudgetDistributed(
  guestSessionId: string,
  requestedTokens: number,
  now = Date.now(),
) {
  const redis = requireGuestRedis();
  if (!redis) return consumeGuestTokenBudget(guestSessionId, requestedTokens, now);

  try {
    const window = fixedWindow(now, GUEST_CHAT_WINDOW_MS);
    const key =
      `xroga:guest:tokens:${guestSessionId}:${window.start}`;
    const used = await redisIncrement(key, requestedTokens, GUEST_CHAT_WINDOW_MS);
    return {
      allowed: used <= GUEST_CHAT_TOKEN_BUDGET,
      remaining: Math.max(0, GUEST_CHAT_TOKEN_BUDGET - used),
      resetsAt: window.resetsAt,
    } as const;
  } catch (error) {
    if(productionGuest())guestAccountingDenied();
    console.warn('[guest/chat] Redis token-budget unavailable');
    return consumeGuestTokenBudget(guestSessionId, requestedTokens, now);
  }
}

async function acquireGuestLease(
  guestSessionId: string,
  now = Date.now(),
): Promise<GuestLease | null> {
  cleanExpired(now);
  const redis = requireGuestRedis();
  if (redis) {
    try {
      const token = randomUUID();
      const redisKey = `xroga:guest:active:${guestSessionId}`;
      const result = await redis.set(
        redisKey,
        token,
        'PX',
        GUEST_CHAT_CONCURRENCY_TTL_MS,
        'NX',
      );
      if (result !== 'OK') return null;
      return issueGuestLease({ token, sessionId: guestSessionId, redisKey,expiresAt:now+GUEST_CHAT_CONCURRENCY_TTL_MS });
    } catch (error) {
      if(productionGuest())guestAccountingDenied();
      console.warn('[guest/chat] Redis concurrency unavailable');
    }
  }

  const existing = activeSessions.get(guestSessionId);
  if (existing && existing.expiresAt > now) return null;
  const token = randomUUID();
  activeSessions.set(guestSessionId, {
    token,
    expiresAt: now + GUEST_CHAT_CONCURRENCY_TTL_MS,
  });
  return issueGuestLease({ token, sessionId: guestSessionId,expiresAt:now+GUEST_CHAT_CONCURRENCY_TTL_MS });
}

async function releaseGuestLease(lease: GuestLease) {
  issuedLeases.delete(lease);
  if (lease.redisKey) {
    const redis = getRedis();
    if (redis) {
      try {
        await redis.eval(
          "if redis.call('get',KEYS[1])==ARGV[1] then return redis.call('del',KEYS[1]) else return 0 end",
          1,
          lease.redisKey,
          lease.token,
        );
        return;
      } catch (error) {
        console.warn('[guest/chat] Redis lease release unavailable');
      }
    }
  }

  const current = activeSessions.get(lease.sessionId);
  if (current?.token === lease.token) activeSessions.delete(lease.sessionId);
}

async function isGuestSessionClaimed(guestSessionId: string, now = Date.now()) {
  cleanExpired(now);
  if ((claimedSessions.get(guestSessionId) ?? 0) > now) return true;

  const redis = requireGuestRedis();
  if (!redis) return false;
  try {
    const receipt=await redis.exists(`xroga:guest:claimed:${guestSessionId}`);
    if(receipt!==0&&receipt!==1)guestAccountingDenied();
    return receipt===1;
  } catch (error) {
    if(productionGuest())guestAccountingDenied();
    console.warn('[guest/chat] Redis claimed-session unavailable');
    return false;
  }
}

async function markGuestSessionClaimed(
  guestSessionId: string,
  userId: string,
  now = Date.now(),
) {
  claimedSessions.set(guestSessionId, now + GUEST_CHAT_CLAIM_TTL_MS);

  const redis = requireGuestRedis();
  if (!redis) return;
  try {
    const receipt=await redis.set(
      `xroga:guest:claimed:${guestSessionId}`,
      userId,
      'PX',
      GUEST_CHAT_CLAIM_TTL_MS,
    );
    if(receipt!=='OK')guestAccountingDenied();
  } catch (error) {
    if(productionGuest())guestAccountingDenied();
    console.warn('[guest/claim] Redis claim persistence unavailable');
  }
}

export function consumeGuestAllowance(
  guestSessionId: string,
  clientAddress: string,
  now = Date.now(),
) {
  cleanExpired(now);

  const ip = consumeBucket(
    ipBuckets,
    stableAddressKey(clientAddress || 'unknown'),
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

export function consumeGuestTokenBudget(
  guestSessionId: string,
  requestedTokens: number,
  now = Date.now(),
) {
  cleanExpired(now);
  return consumeTokenBucket(
    guestSessionId,
    Math.max(1, Math.floor(requestedTokens)),
    now,
  );
}

export function beginGuestConcurrencyForTest(
  guestSessionId: string,
  now = Date.now(),
) {
  cleanExpired(now);
  const existing = activeSessions.get(guestSessionId);
  if (existing && existing.expiresAt > now) return null;
  const token = randomUUID();
  activeSessions.set(guestSessionId, {
    token,
    expiresAt: now + GUEST_CHAT_CONCURRENCY_TTL_MS,
  });
  return token;
}

export function endGuestConcurrencyForTest(
  guestSessionId: string,
  token: string,
) {
  const current = activeSessions.get(guestSessionId);
  if (current?.token === token) activeSessions.delete(guestSessionId);
}

export function resetGuestChatRateLimitsForTest() {
  sessionBuckets.clear();
  ipBuckets.clear();
  tokenBuckets.clear();
  activeSessions.clear();
  claimedSessions.clear();
}

async function requireCurrentGuestLease(lease:GuestLease){
  if(!issuedLeases.has(lease)||lease.expiresAt<=Date.now())guestAccountingDenied();
  const redis=requireGuestRedis();
  if(lease.redisKey){
    if(!redis)guestAccountingDenied();
    let current:unknown;try{current=await redis.get(lease.redisKey);}catch{guestAccountingDenied();}
    if(current!==lease.token)guestAccountingDenied();
  }else{const current=activeSessions.get(lease.sessionId);if(!current||current.token!==lease.token||current.expiresAt<=Date.now())guestAccountingDenied();}
  if(await isGuestSessionClaimed(lease.sessionId))guestAccountingDenied();
}

async function guestCompletion(messages: ChatMessage[],lease:GuestLease,prepaidTokens:number,signal:AbortSignal) {
  messages=structuredClone(messages);
  const maximumInput=Buffer.byteLength(JSON.stringify(messages),'utf8'),maximumOutput=900;
  if(prepaidTokens!==maximumInput+maximumOutput)guestAccountingDenied();
  await requireCurrentGuestLease(lease);
  let wires=0;
  const callable = new Set(callableModelIds());
  const candidates: ModelId[] = ['deepseek_v4_flash', 'glm_5_3_flash'];

  let lastError: unknown = null;
  for (const modelId of candidates) {
    if (!callable.has(modelId)) continue;
    const apiModel=resolveModelSpec(modelId)?.apiModel;
    if(!apiModel)continue;
    let active=true;
    const beforeDispatch=async(body:string)=>{
      if(!active||signal.aborted)modelAdmissionDenied();
      const wire=JSON.parse(body);
      if(wire.model!==apiModel||wire.max_tokens!==maximumOutput||!isDeepStrictEqual(wire.messages,messages)||(wire.tools?.length??0)!==0)modelAdmissionDenied();
      await requireCurrentGuestLease(lease);
      if(wires>0&&!(await consumeGuestTokenBudgetDistributed(lease.sessionId,prepaidTokens)).allowed)guestAccountingDenied();
      wires++;
      await requireCurrentGuestLease(lease);
      if(!active||signal.aborted)modelAdmissionDenied();
    };
    const admitted=registerModelSdkAdmission(beforeDispatch,modelId,undefined);
    try {
      const result=await chatCompletion(modelId, messages, {
        maxTokens: 900,
        temperature: 0.45,
        reasoningMode: 'none',
        beforeDispatch,signal,
      });
      // The existing guest counter conservatively consumes each wire attempt's
      // full byte-bound input plus maximum output before sending, with no refund
      // or uncertain accounting replay. It grants no signed-in tenant authority.
      if(!wires||!Number.isSafeInteger(result.inputTokens)||result.inputTokens<0||result.inputTokens>maximumInput
        ||!Number.isSafeInteger(result.outputTokens)||result.outputTokens<0||result.outputTokens>maximumOutput)guestAccountingDenied();
      await requireCurrentGuestLease(lease);
      const completion=admitted.completion();if(!completion)guestAccountingDenied();
      completion.checkCancellation();completion.publish();
      return result;
    } catch (error) {
      lastError = error;
      if(signal.aborted||isTerminalModelFailure(error))throw error;
    }finally{active=false;admitted.revoke();}
  }

  if (lastError) throw lastError;
  throw new Error('No guest chat model is configured');
}

const router = Router();
function guestRoute(handler:RequestHandler):RequestHandler{
  return(req,res,next)=>{void Promise.resolve().then(()=>handler(req,res,next)).catch(()=>{
    if(!res.headersSent)res.status(503).json({error:'Guest preview is temporarily unavailable.',code:'GUEST_ADMISSION_UNAVAILABLE'});
    else res.end();
  });};
}

router.post('/claim', authMiddleware, guestRoute(async (req: AuthRequest, res) => {
  const parsed = guestClaimSchema.safeParse(req.body);
  if (!parsed.success || !req.userId) {
    res.status(400).json({
      error: 'A valid guest session is required.',
      code: 'INVALID_GUEST_CLAIM',
    });
    return;
  }

  await markGuestSessionClaimed(parsed.data.guestSessionId, req.userId);
  res.setHeader('Cache-Control', 'no-store');
  res.json({ ok: true });
}));

router.post('/chat', guestRoute(async (req, res) => {
  const parsed = guestChatSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      error: 'Send a short text message to continue.',
      code: 'INVALID_GUEST_REQUEST',
    });
    return;
  }

  const guestSessionId = parsed.data.guestSessionId ?? randomUUID();
  if (await isGuestSessionClaimed(guestSessionId)) {
    res.status(403).json({
      error: 'This guest preview was already attached to an account. Continue in your signed-in workspace.',
      code: 'GUEST_SESSION_CLAIMED',
      guestSessionId,
    });
    return;
  }

  const clientAddress = guestClientAddress(req);
  const allowance = await consumeGuestAllowanceDistributed(
    guestSessionId,
    clientAddress,
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

  const estimatedInputTokens = estimateMessageTokens(messages);
  if (estimatedInputTokens > 7_000) {
    res.status(413).json({
      error:
        'This guest conversation is too large. Send a shorter message or create a free account to continue.',
      code: 'GUEST_CONTEXT_TOO_LARGE',
      guestSessionId,
    });
    return;
  }

  // Reserve the maximum possible answer as well as the estimated input. Failed
  // provider calls still consume the reservation: retries must not become a way to
  // bypass the guest budget.
  const tokenBudget = await consumeGuestTokenBudgetDistributed(
    guestSessionId,
    Buffer.byteLength(JSON.stringify(messages),'utf8') + 900,
  );
  if (!tokenBudget.allowed) {
    res.status(429).json({
      error:
        'This guest preview used its safe token budget. Create a free Xroga account to keep the conversation and continue.',
      code: 'GUEST_TOKEN_BUDGET_REACHED',
      guestSessionId,
    });
    return;
  }

  const lease = await acquireGuestLease(guestSessionId);
  if (!lease) {
    res.status(429).json({
      error: 'Finish the current guest reply before sending another message.',
      code: 'GUEST_BUSY',
      guestSessionId,
    });
    return;
  }

  const controller=new AbortController();
  const cancel=()=>controller.abort();
  const close=()=>{if(!res.writableEnded)cancel();};
  req.once('aborted',cancel);res.once('close',close);
  if(req.aborted||res.destroyed)cancel();
  try {
    const result = await guestCompletion(messages,lease,Buffer.byteLength(JSON.stringify(messages),'utf8')+900,controller.signal);

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
  } finally {
    req.off('aborted',cancel);res.off('close',close);
    await releaseGuestLease(lease);
  }
}));

export default router;
