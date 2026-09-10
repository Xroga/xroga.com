import { Router } from 'express';
import type { AuthRequest } from '../middleware/auth.js';
import { runChatPipeline } from '../ai/pipeline.js';
import { assertHasQuota, getUsage, usageToTokenUsage } from '../ai/quota.js';
import { MONTHLY_USER_PRICE_USD } from '../ai/models.js';
import { getProviderEntitlementStatus } from '../ai/providerBudget.js';
import { planSemanticRequest } from '../ai/universal/semanticRequestPlanner.js';
import { goalContractSchema } from '../ai/universal/goalContract.js';
import { analyzeGitHubRepo } from '../services/integrations/githubDeploy.js';

const router = Router();

router.post('/plan', async (req: AuthRequest, res) => {
  const userId = requireUserId(req);
  if (!userId) return res.status(401).json({ error: 'Sign in required', code: 'UNAUTHORIZED' });
  const message = typeof req.body?.message === 'string' ? req.body.message.trim() : '';
  if (!message) return res.status(400).json({ error: 'message required', code: 'INVALID_GOAL' });
  try {
    const contextCandidate = req.body?.projectContext && typeof req.body.projectContext === 'object'
      ? req.body.projectContext as Record<string, unknown>
      : null;
    const context = contextCandidate && typeof contextCandidate.repo === 'string' && typeof contextCandidate.branch === 'string'
      ? { repo: contextCandidate.repo, branch: contextCandidate.branch, projectRoot: typeof contextCandidate.projectRoot === 'string' ? contextCandidate.projectRoot : '/' }
      : null;
    const plan = await planSemanticRequest({
      userId,
      message,
      history: Array.isArray(req.body?.history)
        ? req.body.history.slice(-12).map((item: { role?: unknown; content?: unknown }) => `${item.role === 'assistant' ? 'assistant' : 'user'}: ${String(item.content ?? '').slice(0, 8_000)}`)
        : [],
      attachments: Array.isArray(req.body?.attachments)
        ? req.body.attachments.map((item: { mimeType?: unknown; name?: unknown }) => ({ mediaType: String(item.mimeType ?? 'application/octet-stream'), name: typeof item.name === 'string' ? item.name : undefined }))
        : [],
      projectContext: context,
      projectState: req.body?.projectState && typeof req.body.projectState === 'object' ? req.body.projectState : undefined,
    });
    return res.json(plan);
  } catch (err) {
    const error = err as Error & { code?: string };
    console.error('[phase1/plan]', { code: error.code ?? 'SEMANTIC_PLANNING_FAILED', message: error.message });
    return res.status(error.code === 'SEMANTIC_PLANNER_UNAVAILABLE' ? 503 : 422).json({
      error: error.message,
      code: error.code ?? 'SEMANTIC_PLANNING_FAILED',
    });
  }
});

function requireUserId(req: AuthRequest): string | null {
  return req.userId || (typeof req.body?.userId === 'string' ? req.body.userId : null);
}

/** Chat and research lane. Build requests are redirected to the durable workspace pipeline. */
router.post('/chat', async (req: AuthRequest, res) => {
  const userId = requireUserId(req);
  if (!userId) return res.status(401).json({ error: 'Sign in required', code: 'UNAUTHORIZED' });

  const message =
    (typeof req.body?.message === 'string' && req.body.message) ||
    (typeof req.body?.prompt === 'string' && req.body.prompt) ||
    '';
  const attachments = Array.isArray(req.body?.attachments) ? req.body.attachments : undefined;
  if (!message.trim() && !(attachments && attachments.length)) {
    return res.status(400).json({ error: 'message or attachments required' });
  }
  const history = Array.isArray(req.body?.history)
    ? (req.body.history as Array<{ role: 'user' | 'assistant'; content: string }>)
    : [];
  const semanticGoal = goalContractSchema.safeParse(req.body?.goalContract);

  try {
    let projectEvidence: string | undefined;
    if (semanticGoal.success && semanticGoal.data.requiredCapabilities.includes('repository.read') && semanticGoal.data.projectContext) {
      const context = semanticGoal.data.projectContext;
      const analysis = await analyzeGitHubRepo(userId, context.repo, context.branch);
      projectEvidence = JSON.stringify({
        repo: analysis.repoName,
        branch: analysis.defaultBranch,
        summary: analysis.summary,
        techStack: analysis.techStack,
        fileCount: analysis.fileCount,
        topLevelEntries: analysis.topLevelEntries,
        treeSample: analysis.treeSample,
        report: analysis.report,
      });
    }
    const result = await runChatPipeline({
      userId,
      prompt: message.trim(),
      history,
      attachments,
      ...(semanticGoal.success ? { goalContract: semanticGoal.data } : {}),
      ...(projectEvidence ? { projectEvidence } : {}),
    });
    return res.json({
      response: result.response,
      intent: result.intent,
      usage: result.usage,
      webSources: result.webSources,
      engine: 'xroga',
    });
  } catch (err) {
    const error = err as Error & { code?: string };
    if (error.code === 'USE_BUILD_PIPELINE' || error.message === 'USE_BUILD_PIPELINE') {
      return res.status(409).json({
        error: 'This looks like a build request - use the workspace build pipeline.',
        code: 'USE_BUILD_PIPELINE',
      });
    }
    if (['OUT_OF_TOKENS', 'MODEL_CAP_REACHED', 'PAID_PROVIDER_CAPACITY_UNAVAILABLE'].includes(error.code ?? '')) {
      return res.status(402).json({
        error: error.message,
        code: 'CAPACITY_UNAVAILABLE',
        paymentLink: '/pricing',
      });
    }
    console.error('[phase1/chat]', { code: error.code ?? 'CHAT_FAILED', message: error.message });
    return res.status(500).json({ error: 'Chat is temporarily unavailable', code: 'CHAT_FAILED' });
  }
});

router.get('/usage', async (req: AuthRequest, res) => {
  const userId = requireUserId(req);
  if (!userId) return res.status(401).json({ error: 'Sign in required', code: 'UNAUTHORIZED' });
  try {
    const usage = await getUsage(userId);
    return res.json({ usage: usageToTokenUsage(usage) });
  } catch (err) {
    console.error('[phase1/usage]', { category: 'usage_read_failed' });
    return res.status(500).json({ error: 'Failed to load usage' });
  }
});

/** Customer-safe plan information. Internal provider economics are never returned. */
router.get('/economics', async (req: AuthRequest, res) => {
  const userId = requireUserId(req);
  if (!userId) return res.status(401).json({ error: 'Sign in required' });
  try {
    res.json({
      plan: 'Xroga AI',
      price: `$${MONTHLY_USER_PRICE_USD} per 30 days`,
      entitlement: await getProviderEntitlementStatus(userId),
    });
  } catch {
    res.status(503).json({ error: 'Plan capacity is temporarily unavailable', code: 'BILLING_UNAVAILABLE' });
  }
});

router.post('/emergency-tokens', (_req, res) => {
  res.status(410).json({
    success: false,
    message: 'Emergency capacity grants are not available on the current plan.',
    code: 'NOT_SUPPORTED',
  });
});

router.get('/health', (_req, res) => {
  res.json({ ok: true, service: 'xroga-ai' });
});

/** Non-mutating quota preflight used by the workspace. */
router.get('/quota-check', async (req: AuthRequest, res) => {
  const userId = requireUserId(req);
  if (!userId) return res.status(401).json({ error: 'Sign in required' });
  try {
    const usage = await assertHasQuota(userId);
    res.json({ ok: true, usage: usageToTokenUsage(usage) });
  } catch (err) {
    const error = err as Error & { code?: string };
    res.status(402).json({ ok: false, error: error.message, code: error.code });
  }
});

export default router;
