import { Router } from 'express';
import { retiredJson } from './retiredSurface.js';

const router = Router();

/** Legacy AI provider catalog / BYOK / live AI proxy — retired. */
router.get('/ai-catalog', (_req, res) => {
  res.json({
    catalog: [],
    fieldEndpoints: [],
    legacyAiRetired: true,
    message: 'AI keys are server-managed: OpenRouter (DeepSeek only) + official Kimi/GLM/Grok/Tavily.',
  });
});

router.get('/provider-keys', (_req, res) => {
  res.json({ keys: [], legacyAiRetired: true });
});

router.post('/provider-keys', (_req, res) => retiredJson(res));
router.delete('/provider-keys/:provider', (_req, res) => retiredJson(res));
router.use('/live-ai', (_req, res) => retiredJson(res));
router.use('/search', (_req, res) => retiredJson(res));

export default router;
