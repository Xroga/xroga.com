import { Router } from 'express';
import type { AuthRequest } from '../middleware/auth.js';
import {
  getCommunityPoolStatus,
  requestCommunityPoolTokens,
} from '../services/communityPoolService.js';

const router = Router();

router.get('/pool', async (req: AuthRequest, res) => {
  const status = await getCommunityPoolStatus(req.userId!);
  res.json(status);
});

router.post('/pool/request', async (req: AuthRequest, res) => {
  const result = await requestCommunityPoolTokens(req.userId!);
  res.status(result.success ? 200 : 400).json(result);
});

export default router;
