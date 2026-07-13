import { Router } from 'express';
import type { AuthRequest } from '../middleware/auth.js';
import { catalogForApi } from '../lib/aiEndpointCatalog.js';
import {
  deleteUserProviderKey,
  listUserProviderKeys,
  saveUserProviderKey,
} from '../services/integrations/userProviderKeys.js';

const router = Router();

/** Public AI integration catalog — free/paid endpoints for generated code */
router.get('/ai-catalog', (_req, res) => {
  res.json({
    catalog: catalogForApi(),
    xrogaResearch: {
      searxng: { free: true, note: 'Xroga uses SearXNG for web research during builds and chat.' },
      tavily: { freeTier: true, note: 'Xroga supplements with Tavily when TAVILY_API_KEY is set on server.' },
      grokSearch: { note: 'Xroga uses Grok web_search + x_search for live trends when GROK_API_KEY is set.' },
    },
  });
});

router.get('/provider-keys', async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;
    const keys = await listUserProviderKeys(userId);
    res.json({ keys });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

router.post('/provider-keys', async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;
    const { provider, apiKey } = req.body as { provider?: string; apiKey?: string };
    if (!provider?.trim() || !apiKey?.trim()) {
      res.status(400).json({ error: 'provider and apiKey required' });
      return;
    }
    const status = await saveUserProviderKey(userId, provider, apiKey);
    res.json({ ok: true, ...status });
  } catch (err) {
    res.status(400).json({ error: (err as Error).message });
  }
});

router.delete('/provider-keys/:provider', async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;
    await deleteUserProviderKey(userId, String(req.params.provider));
    res.json({ ok: true });
  } catch (err) {
    res.status(400).json({ error: (err as Error).message });
  }
});

export default router;
