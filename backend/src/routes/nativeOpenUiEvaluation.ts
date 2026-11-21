import { Router } from 'express';
import { z } from 'zod';
import { authMiddleware, type AuthRequest } from '../middleware/auth.js';
import { requireTenantContext } from '../security/tenantContext.js';
import { createSupabaseClient } from '../config/supabase.js';
import { chatCompletionStream, type ChatMessage } from '../ai/openaiCompat.js';
import { withTenantModelReservation } from '../ai/tenantModelDispatch.js';
import { assertCanUseModel } from '../ai/quota.js';
import { resolveModelSpec } from '../ai/models.js';
import { actualProviderCostMicroUsd } from '../ai/providerBudget.js';
import { nativeAnswerReviewReason } from '../ai/nativeOpenUiAccuracy.js';
import { publicRuntimeFailure } from '../ai/universal/runtimeFailure.js';
import { NATIVE_UI_FORMAT, NATIVE_UI_LIBRARY, splitNativeOpenUiAnswer, validateNativeOpenUi } from '../ai/nativeOpenUi.js';
import { nativeOpenUiPrompt } from '../ai/nativeOpenUiPrompt.js';
import { readNativeOpenUiRun } from '../ai/nativeOpenUiRun.js';

const modelId = 'deepseek_v4_1_flash_1017';
const externalModelId = 'deepseek-v4.1-flash-1017';
const outputTokens = 3200;
const bodySchema = z.object({ prompt: z.string().trim().min(1).max(6000), attempt: z.string().uuid() }).strict();
const router = Router();

const currentRun = () => readNativeOpenUiRun(
  process.env.XROGA_DEPLOYMENT_ENVIRONMENT, process.env.NATIVE_OPENUI_EVALUATION_RUN,
);

router.post('/evaluate', (req, res, next) => {
  res.setHeader('Cache-Control', 'no-store');
  if (!process.env.NATIVE_OPENUI_EVALUATOR_ID || !currentRun()) {
    return res.status(404).json({ error: 'Evaluation is unavailable.' });
  }
  next();
}, authMiddleware, async (req: AuthRequest, res) => {
  const run = currentRun();
  const owner = process.env.NATIVE_OPENUI_EVALUATOR_ID;
  if (!run || !owner || req.userId !== owner) {
    return res.status(404).json({ error: 'Evaluation is unavailable.' });
  }
  const body = bodySchema.safeParse(req.body);
  if (!body.success) return res.status(400).json({ error: 'Select an approved evaluation prompt.' });
  const slot = run.slots.find(candidate => candidate.id === body.data.attempt && candidate.prompt === body.data.prompt);
  if (!slot) return res.status(403).json({ error: 'This prompt is outside the approved evaluation.' });

  const emit = (event: 'status' | 'answer' | 'error', payload: object) => {
    if (res.writableEnded || res.destroyed) return;
    res.write('event: ' + event + '\n' + 'data: ' + JSON.stringify(payload) + '\n\n');
  };

  const controller = new AbortController();
  const cancel = () => { if (!res.writableEnded) controller.abort(); };
  res.once('close', cancel);
  const started = Date.now();
  try {
    const context = requireTenantContext(req.tenantContext);
    const token = req.accessToken;
    if (!token) return res.status(404).json({ error: 'Evaluation is unavailable.' });
    // Use only the caller-scoped Supabase client. The role RPC binds to auth.uid().
    const supabase = createSupabaseClient(token);
    const verifyFounder = async () => {
      const identity = await supabase.auth.getUser(token);
      const user = identity.data.user;
      if (identity.error || user?.id !== context.userId || !user.email_confirmed_at || user.email?.toLowerCase() !== 'hello@xroga.com') return false;
      const [assurance, profile] = await Promise.all([
        supabase.auth.mfa.getAuthenticatorAssuranceLevel(token),
        supabase.rpc('current_community_role'),
      ]);
      return !assurance.error && assurance.data.currentLevel === 'aal2' && !profile.error && profile.data === 'owner';
    };
    if (!await verifyFounder()) return res.status(404).json({ error: 'Evaluation is unavailable.' });
    if (resolveModelSpec(modelId)?.apiModel !== externalModelId) {
      return res.status(503).json({ error: 'The configured model does not match the approved evaluator.' });
    }
    await assertCanUseModel(context.userId, modelId);
    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();
    emit('status', { phase: 'generating' });
    const messages: ChatMessage[] = [{ role: 'system', content: nativeOpenUiPrompt }, { role: 'user', content: slot.prompt }];
    const result = await withTenantModelReservation({
      scope: {
        context, userId: context.userId, connectedAccountId: 'platform',
        maximumCostMicroUsd: run.maximumCostMicroUsd,
        revalidateBeforeDispatch: async () => {
          if (controller.signal.aborted || Date.parse(run.expiresAt) <= Date.now() || !await verifyFounder()) throw new Error('Evaluation access expired or was revoked');
        },
      },
      modelId, payload: { messages }, idempotencyKey: slot.id,
      estimatedInputTokens: Buffer.byteLength(JSON.stringify(messages), 'utf8'),
      maximumOutputTokens: outputTokens,
      execute: dispatch => chatCompletionStream(modelId, dispatch.payload.messages as ChatMessage[], {
        maxTokens: outputTokens, temperature: 0.2, reasoningMode: 'none',
        beforeDispatch: dispatch.beforeDispatch, signal: controller.signal,
        credentialOverride: dispatch.credentialOverride,
      }),
    });
    const { text, program } = splitNativeOpenUiAnswer(result.text);
    if (!text || !result.providerRequestId || result.provider !== 'zurelay' || result.apiModel !== externalModelId) {
      emit('error', { error: 'The response or its provider receipt could not be verified. Review the ledger before another run.' });
      return res.end();
    }
    const reviewReason = nativeAnswerReviewReason(text);
    const validation = reviewReason
      ? { ok: false as const, reason: reviewReason }
      : program ? validateNativeOpenUi(program, undefined, text) : null;
    emit('answer', {
      text, format: NATIVE_UI_FORMAT, library: NATIVE_UI_LIBRARY,
      ...(validation?.ok && result.finishReason === 'stop' ? { program } : {}),
      ...(validation && !validation.ok ? { fallbackReason: validation.reason } : {}),
      finishReason: result.finishReason,
      receipt: {
        providerRequestId: result.providerRequestId, modelId: result.apiModel, provider: result.provider,
        inputTokens: result.inputTokens, outputTokens: result.outputTokens,
        costMicroUsd: actualProviderCostMicroUsd(result), elapsedMs: Date.now() - started,
      },
    });
    return res.end();
  } catch (error) {
    if (controller.signal.aborted || res.destroyed) return;
    const failure = publicRuntimeFailure(error);
    if (!res.headersSent) return res.status(failure.status).json(failure.body);
    emit('error', failure.body);
    return res.end();
  } finally {
    res.removeListener('close', cancel);
  }
});

export default router;
