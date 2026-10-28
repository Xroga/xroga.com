import {randomUUID} from 'node:crypto';
import {guestAccountingDenied,consumeGuestAllowanceDistributed,consumeGuestTokenBudgetDistributed,acquireGuestLease,releaseGuestLease,isGuestSessionClaimed,markGuestSessionClaimed,requireCurrentGuestLease,GUEST_CHAT_PROMPT_LIMIT,type GuestLease} from '../ai/guestBudget.js';
export {GUEST_CHAT_PROMPT_LIMIT,GUEST_CHAT_WINDOW_MS,GUEST_CHAT_IP_WINDOW_MS,GUEST_CHAT_IP_LIMIT,GUEST_CHAT_TOKEN_BUDGET,GUEST_CHAT_CONCURRENCY_TTL_MS,GUEST_CHAT_CLAIM_TTL_MS,consumeGuestAllowance,consumeGuestTokenBudget,beginGuestConcurrencyForTest,endGuestConcurrencyForTest,resetGuestChatRateLimitsForTest} from '../ai/guestBudget.js';
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
import {
  authMiddleware,
  type AuthRequest,
} from '../middleware/auth.js';

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

export function guestClientAddress(req: Pick<Request, 'header' | 'ip' | 'socket'>, env: NodeJS.ProcessEnv = process.env): string {
  if (env.FLY_APP_NAME) {
    const flyClientIp = req.header('fly-client-ip')?.trim();
    if (flyClientIp) return flyClientIp.slice(0, 96);
  } else if (env.K_SERVICE) {
    const hops = Math.max(1, Math.min(5, Number(env.XROGA_TRUSTED_PROXY_HOPS ?? 1) || 1));
    const entries = (req.header('x-forwarded-for') ?? '').split(',').map((entry) => entry.trim()).filter(Boolean);
    const trusted = entries[entries.length - hops];
    if (trusted && /^[0-9a-fA-F:.]{3,45}$/.test(trusted)) return trusted;
  }
  return (req.socket.remoteAddress || req.ip || 'unknown').slice(0, 96);
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
