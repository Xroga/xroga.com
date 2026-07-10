import { Router } from 'express';
import type { AuthRequest } from '../middleware/auth.js';
import { listTasks, submitTask, dailyCheckIn } from '../services/taskService.js';

const router = Router();

router.get('/', async (req: AuthRequest, res) => {
  const tasks = await listTasks(req.userId!);
  res.json({ tasks });
});

router.post('/check-in', async (req: AuthRequest, res) => {
  const result = await dailyCheckIn(req.userId!);
  res.status(result.success ? 200 : 400).json(result);
});

router.post('/:taskId/submit', async (req: AuthRequest, res) => {
  const taskId = String(req.params.taskId);
  const { link, screenshotSize } = req.body as { link?: string; screenshotSize?: number };
  const result = await submitTask(req.userId!, taskId, { link, screenshotSize });
  res.status(result.success ? 200 : 400).json(result);
});

export default router;
