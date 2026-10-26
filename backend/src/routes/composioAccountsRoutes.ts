import { Router, type Response } from 'express';
import { z } from 'zod';

import type { AuthRequest } from '../middleware/auth.js';
import { ComposioClientError, canUserAccessComposioToolkit } from '../services/integrations/composioClient.js';
import { listComposioConnectedAccounts, setComposioAccountAlias } from '../services/integrations/composioAccounts.js';
import { readComposioCapabilityFlags } from '../services/integrations/composioPolicy.js';

/**
 * Several connected accounts for one app (for example a work and a personal Gmail).
 * Mounted under /api/integrations/xroga-connect/accounts, behind the same authentication as the rest of
 * the integrations router. Identity comes only from the verified request user; an account id from the
 * body is only ever used if it appears in that user's own freshly fetched list.
 */
export const composioAccountsRouter = Router();

const TOOLKIT = z.string().trim().min(2).max(80).regex(/^[A-Za-z0-9_-]+$/);

function fail(res: Response, error: unknown): void {
  if (error instanceof ComposioClientError) {
    res.status(error.status).json({ ok: false, error: error.message, code: error.code });
    return;
  }
  res.status(502).json({ ok: false, error: 'Xroga Connect is temporarily unavailable.', code: 'XROGA_CONNECT_ERROR' });
}

composioAccountsRouter.get('/', async (req: AuthRequest, res: Response) => {
  const parsed = TOOLKIT.safeParse(req.query.toolkit);
  if (!parsed.success) {
    res.status(400).json({ ok: false, error: 'A toolkit is required.' });
    return;
  }
  const toolkit = parsed.data.toLowerCase();
  if (!canUserAccessComposioToolkit(req.userId!, toolkit)) {
    res.status(404).json({ ok: false, error: 'Plugin not found.' });
    return;
  }
  const enabled = readComposioCapabilityFlags().multiAccount;
  if (!enabled) {
    res.json({ ok: true, multiAccount: false, accounts: [] });
    return;
  }
  try {
    res.json({ ok: true, multiAccount: true, accounts: await listComposioConnectedAccounts(req.userId!, { toolkit }) });
  } catch (error) {
    fail(res, error);
  }
});

composioAccountsRouter.patch('/:accountId', async (req: AuthRequest, res: Response) => {
  const schema = z.object({ toolkit: TOOLKIT, alias: z.string().trim().min(2).max(40).nullable() });
  const parsedBody = schema.safeParse(req.body);
  const accountId = z.string().regex(/^[A-Za-z0-9_-]{4,64}$/).safeParse(req.params.accountId);
  if (!parsedBody.success || !accountId.success) {
    res.status(400).json({ ok: false, error: 'A toolkit and an account name are required.' });
    return;
  }
  const toolkit = parsedBody.data.toolkit.toLowerCase();
  if (!canUserAccessComposioToolkit(req.userId!, toolkit)) {
    res.status(404).json({ ok: false, error: 'Plugin not found.' });
    return;
  }
  try {
    const account = await setComposioAccountAlias(req.userId!, { toolkit, accountId: accountId.data, alias: parsedBody.data.alias });
    res.json({ ok: true, account });
  } catch (error) {
    fail(res, error);
  }
});
