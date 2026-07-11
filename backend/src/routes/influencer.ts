import { Router } from 'express';
import type { AuthRequest } from '../middleware/auth.js';
import { cacheGet } from '../middleware/cacheMiddleware.js';
import { applyForInfluencer, getInfluencerDashboard } from '../services/influencerService.js';

const router = Router();

router.get('/dashboard', cacheGet(30), async (req: AuthRequest, res) => {
  const dashboard = await getInfluencerDashboard(req.userId!);
  res.json(dashboard);
});

router.post('/apply', async (req: AuthRequest, res) => {
  const { followerCount, usernameSlug, applicationNote, socialLinks } = req.body ?? {};
  const result = await applyForInfluencer(req.userId!, {
    followerCount: Number(followerCount ?? 0),
    usernameSlug: usernameSlug ? String(usernameSlug) : undefined,
    applicationNote: applicationNote ? String(applicationNote) : undefined,
    socialLinks: socialLinks && typeof socialLinks === 'object' ? socialLinks : undefined,
  });
  res.status(result.success ? 200 : 400).json(result);
});

export default router;
