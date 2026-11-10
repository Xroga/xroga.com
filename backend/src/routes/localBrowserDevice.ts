import { createHash, randomBytes } from 'node:crypto';
import { Router, type NextFunction, type Response } from 'express';
import { z } from 'zod';
import { authMiddleware, type AuthRequest } from '../middleware/auth.js';
import { createTenantContext, requireTenantContext } from '../security/tenantContext.js';
import { createPool } from '../storage/runtime.js';

const key = z.string().regex(/^[A-Za-z0-9_-]{43}$/);
const extension = z.string().regex(/^[a-p]{32}$/);
const accessPattern = /^xroga_browser_[A-Za-z0-9_-]{43}$/;
const hash = (value: string) => createHash('sha256').update(value).digest('base64url');
const secret = () => randomBytes(32).toString('base64url');
const accessToken = () => 'xroga_browser_' + secret();

export function localBrowserAccountAllowed(owner: string) {
  const configured = process.env.XROGA_LOCAL_BROWSER_ALLOWED_USER_IDS;
  return configured === undefined && process.env.NODE_ENV !== 'production'
    || (configured ?? '').split(',').some(value => value.trim() === owner);
}

export function browserDeviceExtension() {
  const parsed = extension.safeParse(process.env.XROGA_LOCAL_BROWSER_DEVICE_EXTENSION_ID);
  return process.env.XROGA_LOCAL_BROWSER_ENABLED === 'true' && parsed.success ? parsed.data : undefined;
}

export interface BrowserDeviceRequest extends AuthRequest {
  revalidateBrowserDevice?: () => Promise<boolean>;
}

type CredentialRow = { owner_id: string; id: string };
type Database = Pick<ReturnType<typeof createPool>, 'query'>;
let pool: Database | undefined;
const database = () => (pool ??= createPool());
const sameOrigin = (req: AuthRequest, extensionId: string) =>
  !req.headers.origin || req.headers.origin === 'chrome-extension://' + extensionId;

export function createBrowserDeviceRouter(db = database, configured = browserDeviceExtension) {
  const router = Router();
  router.use((_req, res, next) => {
    res.set('Cache-Control', 'no-store');
    if (!configured()) return res.status(404).json({ error: 'BROWSER_DEVICE_DISABLED' });
    next();
  });
  const route = (handler: (req: AuthRequest, res: Response) => Promise<unknown>) =>
    async (req: AuthRequest, res: Response) => {
      try {
        return await handler(req, res);
      } catch (error) {
        if (error instanceof z.ZodError) return res.status(400).json({ error: 'BROWSER_DEVICE_INVALID' });
        return res.status(503).json({ error: 'BROWSER_DEVICE_UNAVAILABLE' });
      }
    };

  router.post('/authorize', authMiddleware, route(async (req, res) => {
    const owner = requireTenantContext(req.tenantContext).userId;
    const data = z.object({ extensionId: extension, challenge: key }).strict().parse(req.body);
    if (!localBrowserAccountAllowed(owner) || data.extensionId !== configured()) {
      return res.status(403).json({ error: 'BROWSER_DEVICE_DENIED' });
    }
    const code = secret();
    // Codes are bound to the authenticated owner and an extension-held proof, then consumed atomically.
    // A repeated challenge cannot create another grant or replace a pending one.
    const created = await db().query(
      'insert into public.local_browser_device_sessions (owner_id, extension_id, code_hash, challenge, expires_at) ' +
      "values ($1, $2, $3, $4, now() + interval '90 seconds') on conflict (owner_id, challenge) do nothing",
      [owner, data.extensionId, hash(code), data.challenge],
    );
    if (created.rowCount !== 1) return res.status(409).json({ error: 'BROWSER_DEVICE_CHALLENGE_USED' });
    return res.status(201).json({ code });
  }));

  router.post('/exchange', route(async (req, res) => {
    const extensionId = configured()!;
    if (!sameOrigin(req, extensionId)) return res.status(403).json({ error: 'BROWSER_DEVICE_DENIED' });
    const { code, verifier, account } = z.object({ code: key, verifier: key, account: z.string().uuid() }).strict().parse(req.body);
    if (!localBrowserAccountAllowed(account)) return res.status(403).json({ error: 'BROWSER_DEVICE_DENIED' });
    const deviceKey = secret();
    const access = accessToken();
    const { rows } = await db().query<CredentialRow>(
      "update public.local_browser_device_sessions set code_hash = null, device_hash = $5, access_hash = $6, " +
      "expires_at = now() + interval '30 days', access_expires_at = now() + interval '5 minutes' " +
      'where extension_id = $1 and code_hash = $2 and challenge = $3 and owner_id = $4 and expires_at > now() ' +
      'returning owner_id, id',
      [extensionId, hash(code), hash(verifier), account, hash(deviceKey), hash(access)],
    );
    const row = rows[0];
    if (!row) return res.status(401).json({ error: 'BROWSER_DEVICE_AUTH_REQUIRED' });
    return res.json({ account: row.owner_id, deviceId: row.id, deviceKey, access, expiresIn: 300 });
  }));

  router.post('/refresh', route(async (req, res) => {
    const extensionId = configured()!;
    if (!sameOrigin(req, extensionId)) return res.status(403).json({ error: 'BROWSER_DEVICE_DENIED' });
    const { deviceId, deviceKey } = z.object({ deviceId: z.string().uuid(), deviceKey: key }).strict().parse(req.body);
    const access = accessToken();
    const { rows } = await db().query<CredentialRow>(
      "update public.local_browser_device_sessions set access_hash = $4, access_expires_at = now() + interval '5 minutes' " +
      'where id = $1 and extension_id = $2 and device_hash = $3 and expires_at > now() returning owner_id, id',
      [deviceId, extensionId, hash(deviceKey), hash(access)],
    );
    const row = rows[0];
    if (!row || !localBrowserAccountAllowed(row.owner_id)) {
      return res.status(401).json({ error: 'BROWSER_DEVICE_AUTH_REQUIRED' });
    }
    return res.json({ account: row.owner_id, access, expiresIn: 300 });
  }));

  router.post('/revoke', route(async (req, res) => {
    const extensionId = configured()!;
    if (!sameOrigin(req, extensionId)) return res.status(403).json({ error: 'BROWSER_DEVICE_DENIED' });
    const { deviceId, deviceKey } = z.object({ deviceId: z.string().uuid(), deviceKey: key }).strict().parse(req.body);
    await db().query('delete from public.local_browser_device_sessions where id = $1 and extension_id = $2 and device_hash = $3',
      [deviceId, extensionId, hash(deviceKey)]);
    return res.sendStatus(204);
  }));

  router.delete('/:deviceId', authMiddleware, route(async (req, res) => {
    const owner = requireTenantContext(req.tenantContext).userId;
    await db().query('delete from public.local_browser_device_sessions where id = $1 and owner_id = $2',
      [z.string().uuid().parse(req.params.deviceId), owner]);
    return res.sendStatus(204);
  }));
  return router;
}

// A device access token is intentionally recognized only on the browser task API.
export function createLocalBrowserAuth(db = database, configured = browserDeviceExtension) {
  return async (req: BrowserDeviceRequest, res: Response, next: NextFunction) => {
    const bearer = req.headers.authorization?.slice(7);
    if (!req.headers.authorization?.startsWith('Bearer xroga_browser_')) return authMiddleware(req, res, next);
    const extensionId = configured();
    const taskPath = /^\/runs\/[0-9a-f-]{36}$/i;
    const taskAction = /^\/runs\/[0-9a-f-]{36}\/(?:turn|resume|finish|plugin-search|plugin-read|plugin-review|plugin-action-search|plugin-act|plugin-act-review)$/i;
    const pluginGet = /^\/plugins\/(?:catalog|connected|details\/[a-z0-9_-]{2,80})$/i;
    const permitted = (req.method === 'GET' && (req.path === '/session' || taskPath.test(req.path) || pluginGet.test(req.path)))
      || (req.method === 'DELETE' && taskPath.test(req.path))
      || (req.method === 'POST' && (req.path === '/runs' || req.path === '/documents' || req.path === '/plugins/link' || taskAction.test(req.path)));
    res.set('Cache-Control', 'no-store');
    if (!extensionId || !permitted || !bearer || !accessPattern.test(bearer) || !sameOrigin(req, extensionId)) {
      return res.status(401).json({ error: 'BROWSER_DEVICE_AUTH_REQUIRED' });
    }
    try {
      const { rows } = await db().query<CredentialRow>(
        'select owner_id, id from public.local_browser_device_sessions where extension_id = $1 and access_hash = $2 ' +
        'and expires_at > now() and access_expires_at > now()',
        [extensionId, hash(bearer)],
      );
      const row = rows[0];
      if (!row || !localBrowserAccountAllowed(row.owner_id)) {
        return res.status(401).json({ error: 'BROWSER_DEVICE_AUTH_REQUIRED' });
      }
      req.tenantContext = createTenantContext({ userId: row.owner_id, via: 'persisted_owner' });
      req.userId = row.owner_id;
      req.revalidateBrowserDevice = async () => {
        if (configured() !== extensionId || !localBrowserAccountAllowed(row.owner_id)) return false;
        const result = await db().query(
          'select 1 from public.local_browser_device_sessions where id = $1 and owner_id = $2 and extension_id = $3 and expires_at > now()',
          [row.id, row.owner_id, extensionId],
        );
        return result.rowCount === 1;
      };
      next();
    } catch {
      return res.status(503).json({ error: 'BROWSER_DEVICE_UNAVAILABLE' });
    }
  };
}
