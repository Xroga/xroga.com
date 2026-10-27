import {verifyGoogleServiceToken} from '../lib/googleServiceToken.js';
import { Router, type Request, type Response } from 'express';
import { processDueBusinessAutomations } from '../services/integrations/businessAutomations.js';
import {googleBackgroundSelected} from '../workers/googleSwarmQueue.js';
import {maintainGoogleDeliveries} from '../workers/googleDeliveryMaintenance.js';

const router = Router();
export const verifyBusinessAutomationSchedulerToken=verifyGoogleServiceToken;

router.post('/tick', async (req: Request, res: Response) => {
  if (process.env.XROGA_AUTOMATION_SCHEDULER_MODE !== 'cloud') {
    return res.status(503).json({ error: 'Cloud scheduler is not enabled.' });
  }
  const authorized = await verifyBusinessAutomationSchedulerToken(req.get('authorization'), {
    audience: process.env.XROGA_AUTOMATION_SCHEDULER_AUDIENCE?.trim() ?? '',
    serviceAccountEmail: process.env.XROGA_AUTOMATION_SCHEDULER_SERVICE_ACCOUNT?.trim() ?? '',
  });
  if (!authorized) return res.status(401).json({ error: 'Unauthorized.' });
  try {
    if(googleBackgroundSelected())await maintainGoogleDeliveries();
    await processDueBusinessAutomations();
    return res.status(204).end();
  } catch (error) {
    console.warn('[businessAutomations] Cloud scheduler cycle failed:', error instanceof Error ? error.message : 'unknown');
    return res.status(503).json({ error: 'Scheduled automations could not be processed.' });
  }
});

export default router;
