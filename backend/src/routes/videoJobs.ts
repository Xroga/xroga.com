import { Router } from 'express';
import type { AuthRequest } from '../middleware/auth.js';
import { getVideoJob, listActiveVideoJobs } from '../services/media/videoJobService.js';

const router = Router();

router.get('/active', async (req: AuthRequest, res) => {
  try {
    const jobs = await listActiveVideoJobs(req.userId!);
    res.json(jobs);
  } catch {
    res.json([]);
  }
});

router.get('/:jobId', async (req: AuthRequest, res) => {
  try {
    const job = await getVideoJob(req.userId!, String(req.params.jobId));
    if (!job) {
      res.status(404).json({ error: 'Job not found' });
      return;
    }
    res.json(job);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

export default router;
