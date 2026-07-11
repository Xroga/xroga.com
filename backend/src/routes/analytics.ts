import { Router } from 'express';
import type { AuthRequest } from '../middleware/auth.js';
import { cacheGet } from '../middleware/cacheMiddleware.js';
import { getAnalyticsDashboard, trackAnalyticsEvent } from '../services/analyticsService.js';

const router = Router();

router.get('/dashboard', cacheGet(60), async (req: AuthRequest, res) => {
  const dashboard = await getAnalyticsDashboard(req.userId!);
  res.json(dashboard);
});

router.post('/events', async (req: AuthRequest, res) => {
  const { eventType, metadata } = req.body ?? {};
  if (!eventType) {
    res.status(400).json({ error: 'eventType required' });
    return;
  }
  await trackAnalyticsEvent(req.userId!, String(eventType), metadata ?? {});
  res.json({ success: true });
});

export default router;
