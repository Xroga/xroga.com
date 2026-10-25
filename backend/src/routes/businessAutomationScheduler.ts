import { OAuth2Client } from 'google-auth-library';
import { Router, type Request, type Response } from 'express';
import { processDueBusinessAutomations } from '../services/integrations/businessAutomations.js';

const router = Router();
const verifier = new OAuth2Client();

export async function verifyBusinessAutomationSchedulerToken(
  authorization: string | undefined,
  config: { audience: string; serviceAccountEmail: string },
  verify: (idToken: string, audience: string) => Promise<{ email?: string; email_verified?: boolean; iss?: string }> = async (idToken, audience) => {
    const ticket = await verifier.verifyIdToken({ idToken, audience });
    return ticket.getPayload() ?? {};
  },
): Promise<boolean> {
  if (!config.audience || !config.serviceAccountEmail) return false;
  const match = /^Bearer ([A-Za-z0-9_\-.]+)$/.exec(authorization ?? '');
  if (!match) return false;
  try {
    const payload = await verify(match[1], config.audience);
    return payload.email_verified === true
      && payload.email === config.serviceAccountEmail
      && (payload.iss === 'https://accounts.google.com' || payload.iss === 'accounts.google.com');
  } catch {
    return false;
  }
}

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
    await processDueBusinessAutomations();
    return res.status(204).end();
  } catch (error) {
    console.warn('[businessAutomations] Cloud scheduler cycle failed:', error instanceof Error ? error.message : 'unknown');
    return res.status(503).json({ error: 'Scheduled automations could not be processed.' });
  }
});

export default router;
