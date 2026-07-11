import { Router } from 'express';
import type { AuthRequest } from '../middleware/auth.js';
import { cacheGet } from '../middleware/cacheMiddleware.js';
import {
  createMarketplaceListing,
  getMarketplaceCategories,
  getMarketplaceStats,
  listMarketplaceListings,
  purchaseMarketplaceListing,
} from '../services/marketplaceService.js';

const router = Router();

router.get('/categories', (_req, res) => {
  res.json({ categories: getMarketplaceCategories() });
});

router.get('/listings', cacheGet(30), async (req: AuthRequest, res) => {
  const category = typeof req.query.category === 'string' ? req.query.category : undefined;
  const mine = req.query.mine === '1';
  const listings = await listMarketplaceListings(req.userId!, { category, mine });
  res.json({ listings });
});

router.get('/stats', cacheGet(30), async (req: AuthRequest, res) => {
  const stats = await getMarketplaceStats(req.userId!);
  res.json(stats);
});

router.post('/listings', async (req: AuthRequest, res) => {
  const { title, description, category, priceXrg, previewUrl, tags } = req.body ?? {};
  const result = await createMarketplaceListing(req.userId!, {
    title: String(title ?? ''),
    description: String(description ?? ''),
    category: String(category ?? 'template'),
    priceXrg: Number(priceXrg ?? 0),
    previewUrl: previewUrl ? String(previewUrl) : undefined,
    tags: Array.isArray(tags) ? tags.map(String) : undefined,
  });
  res.status(result.success ? 200 : 400).json(result);
});

router.post('/listings/:id/purchase', async (req: AuthRequest, res) => {
  const listingId = String(req.params.id);
  const result = await purchaseMarketplaceListing(req.userId!, listingId);
  res.status(result.success ? 200 : 400).json(result);
});

export default router;
