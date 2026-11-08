import { Router } from 'express';
import { z } from 'zod';
import { authMiddleware, type AuthRequest } from '../middleware/auth.js';
import { requireTenantContext } from '../security/tenantContext.js';
import { createSupabaseClient } from '../config/supabase.js';
import { chatCompletionStream, type ChatMessage } from '../ai/openaiCompat.js';
import { withTenantModelReservation } from '../ai/tenantModelDispatch.js';
import { assertCanUseModel } from '../ai/quota.js';
import { actualProviderCostMicroUsd } from '../ai/providerBudget.js';
import { publicRuntimeFailure } from '../ai/universal/runtimeFailure.js';
import { NATIVE_UI_FORMAT, NATIVE_UI_LIBRARY, splitNativeOpenUiAnswer, validateNativeOpenUi } from '../ai/nativeOpenUi.js';
import { nativeOpenUiPrompt } from '../ai/nativeOpenUiPrompt.js';

const modelId = 'deepseek_v4_1_flash_1017';
const outputTokens = 2500;
const bodySchema = z.object({ prompt: z.string().trim().min(1).max(6000), attempt: z.string().uuid() }).strict();
const router = Router();

const maxCost = () => Number(process.env.NATIVE_OPENUI_EVALUATION_MAX_MICRO_USD);
const evaluationEnabled = (owner: string | undefined, cap: number) =>
  Boolean(owner) && Number.isSafeInteger(cap) && cap >= 1 && cap <= 50_000;

router.post('/evaluate', (req, res, next) => {
  res.setHeader('Cache-Control', 'no-store');
  if (!evaluationEnabled(process.env.NATIVE_OPENUI_EVALUATOR_ID, maxCost())) {
    return res.status(404).json({ error: 'Evaluation is unavailable.' });
  }
  next();
}, authMiddleware, async (req: AuthRequest, res) => {
  const cap = maxCost();
  const owner = process.env.NATIVE_OPENUI_EVALUATOR_ID;
  if (!evaluationEnabled(owner, cap) || req.userId !== owner) {
    return res.status(404).json({ error: 'Evaluation is unavailable.' });
  }
  const body = bodySchema.safeParse(req.body);
  if (!body.success) return res.status(400).json({ error: 'Enter a prompt of at most 6,000 characters.' });

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
    await assertCanUseModel(context.userId, modelId);
    const messages: ChatMessage[] = [{ role: 'system', content: nativeOpenUiPrompt }, { role: 'user', content: body.data.prompt }];
    const result = await withTenantModelReservation({
      scope: { context, userId: context.userId, connectedAccountId: 'platform', maximumCostMicroUsd: cap, revalidateBeforeDispatch: async () => { if (!await verifyFounder()) throw new Error('Evaluation access was revoked'); } },
      modelId, payload: { messages }, idempotencyKey: 'native-openui:' + body.data.attempt,
      estimatedInputTokens: Buffer.byteLength(JSON.stringify(messages), 'utf8'),
      maximumOutputTokens: outputTokens,
      execute: dispatch => chatCompletionStream(modelId, dispatch.payload.messages as ChatMessage[], {
        maxTokens: outputTokens, temperature: 0.2, reasoningMode: 'none',
        beforeDispatch: dispatch.beforeDispatch, signal: controller.signal,
        credentialOverride: dispatch.credentialOverride,
      }),
    });
    const { text, program } = splitNativeOpenUiAnswer(result.text);
    if (!text) return res.status(502).json({ error: 'The model returned no readable answer.' });
    const validation = program ? validateNativeOpenUi(program) : null;
    return res.json({
      text, format: NATIVE_UI_FORMAT, library: NATIVE_UI_LIBRARY,
      ...(validation?.ok ? { program } : {}),
      ...(validation && !validation.ok ? { fallbackReason: validation.reason } : {}),
      finishReason: result.finishReason,
      receipt: {
        providerRequestId: result.providerRequestId ?? null, modelId: result.modelId,
        inputTokens: result.inputTokens, outputTokens: result.outputTokens,
        costMicroUsd: actualProviderCostMicroUsd(result), elapsedMs: Date.now() - started,
      },
    });
  } catch (error) {
    if (controller.signal.aborted || res.destroyed) return;
    const failure = publicRuntimeFailure(error);
    return res.status(failure.status).json(failure.body);
  } finally {
    res.removeListener('close', cancel);
  }
});

export default router;
