import { Router } from 'express';
import { z } from 'zod';
import type { BrowserDeviceRequest } from './localBrowserDevice.js';
import { requireTenantContext } from '../security/tenantContext.js';
import {
  createComposioConnectionLink, createReadOnlyComposioSession, filterComposioCatalogForUser,
  getComposioCatalogToolkit, isComposioConfigured, listComposioCatalog, listComposioCatalogTools, listConnectedComposioToolkits,
} from '../services/integrations/composioClient.js';
import { canUserAccessComposioToolkit } from '../services/integrations/composioNamespace.js';

// Only Composio's own logo host, over https, is passed on; anything else is dropped.
export function safePluginLogo(value: unknown): string | undefined {
  if (typeof value !== 'string' || value.length > 300) return undefined;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && url.hostname === 'logos.composio.dev' && !url.username && !url.password && !url.port ? url.href : undefined;
  } catch {
    return undefined;
  }
}

export const browserPluginToolkit = z.string().regex(/^[a-z0-9_-]{2,80}$/i);
const catalogQuery = z.object({
  search: z.string().trim().max(120).optional(),
  cursor: z.string().max(1000).optional(),
  category: z.string().trim().max(120).optional(),
}).strict();

export function createLocalBrowserPluginCatalog() {
  const router = Router();
  router.use((req: BrowserDeviceRequest, res, next) => {
    res.set('Cache-Control', 'no-store');
    if (!req.revalidateBrowserDevice) return res.status(403).json({ error: 'BROWSER_PLUGIN_DEVICE_REQUIRED' });
    if (!isComposioConfigured()) return res.status(503).json({ error: 'BROWSER_PLUGIN_NOT_CONFIGURED' });
    next();
  });
  router.get('/catalog', async (req: BrowserDeviceRequest, res) => {
    try {
      const actor = requireTenantContext(req.tenantContext);
      const query = catalogQuery.parse(req.query);
      const page = await listComposioCatalog({ ...query, limit: 25, sortBy: 'usage' }, actor);
      if (!await req.revalidateBrowserDevice!()) return res.sendStatus(403);
      const items = filterComposioCatalogForUser(actor.userId, page.items).map(item => ({
        slug: item.slug, name: item.name, description: item.description, categories: item.categories,
        toolsCount: item.toolsCount, noAuth: item.noAuth, deprecated: item.deprecated,
        canConnect: item.managedAuthSchemes.length > 0, logo: safePluginLogo(item.logo),
      }));
      return res.json({ items, nextCursor: page.nextCursor });
    } catch (error) {
      return res.status(error instanceof z.ZodError ? 400 : 503).json({ error: 'BROWSER_PLUGIN_CATALOG_UNAVAILABLE' });
    }
  });
  router.get('/connected', async (req: BrowserDeviceRequest, res) => {
    try {
      const actor = requireTenantContext(req.tenantContext);
      const session = await createReadOnlyComposioSession(actor.userId, actor);
      const items = await listConnectedComposioToolkits(actor.userId, { sessionId: session.session_id }, actor);
      if (!await req.revalidateBrowserDevice!()) return res.sendStatus(403);
      return res.json({ items: items.filter(item => item.connected && canUserAccessComposioToolkit(actor.userId, item.toolkit))
        .map(item => ({ slug: item.toolkit, name: item.name, noAuth: item.noAuth, logo: safePluginLogo(item.logo) })) });
    } catch {
      return res.status(503).json({ error: 'BROWSER_PLUGIN_CONNECTIONS_UNAVAILABLE' });
    }
  });
  router.get('/details/:toolkit', async (req: BrowserDeviceRequest, res) => {
    try {
      const actor = requireTenantContext(req.tenantContext);
      const toolkit = browserPluginToolkit.parse(req.params.toolkit);
      if (!canUserAccessComposioToolkit(actor.userId, toolkit)) return res.sendStatus(404);
      const page = await listComposioCatalogTools(toolkit, { limit: 12 }, actor);
      if (!await req.revalidateBrowserDevice!()) return res.sendStatus(403);
      return res.json({ tools: page.items.map(tool => ({ slug: tool.slug, name: tool.name, risk: tool.risk, scopes: tool.scopes })) });
    } catch {
      return res.status(503).json({ error: 'BROWSER_PLUGIN_DETAILS_UNAVAILABLE' });
    }
  });
  router.post('/link', async (req: BrowserDeviceRequest, res) => {
    try {
      const actor = requireTenantContext(req.tenantContext);
      const { toolkit } = z.object({ toolkit: browserPluginToolkit }).strict().parse(req.body);
      if (!canUserAccessComposioToolkit(actor.userId, toolkit)) return res.sendStatus(404);
      const metadata = await getComposioCatalogToolkit(toolkit, actor);
      if (metadata.noAuth || metadata.deprecated || !metadata.managedAuthSchemes.length) return res.sendStatus(403);
      const session = await createReadOnlyComposioSession(actor.userId, actor);
      const connections = await listConnectedComposioToolkits(actor.userId, { sessionId: session.session_id, toolkits: [toolkit] }, actor);
      if (connections.some(item => item.connected && item.toolkit === toolkit)) {
        return res.status(409).json({ error: 'BROWSER_PLUGIN_ALREADY_CONNECTED' });
      }
      if (!await req.revalidateBrowserDevice!()) return res.sendStatus(403);
      const callbackUrl = new URL('/dashboard/integrations/connect/callback', process.env.FRONTEND_URL?.trim() || 'https://xroga.com').href;
      const link = await createComposioConnectionLink(actor.userId, { sessionId: session.session_id, toolkit, callbackUrl }, actor);
      const redirect = new URL(link.redirectUrl);
      if (redirect.protocol !== 'https:' || redirect.port || redirect.username || redirect.password ||
          redirect.hostname !== 'connect.composio.dev') {
        return res.status(502).json({ error: 'BROWSER_PLUGIN_LINK_UNTRUSTED' });
      }
      if (!await req.revalidateBrowserDevice!()) return res.sendStatus(403);
      return res.json({ redirectUrl: redirect.href });
    } catch {
      return res.status(503).json({ error: 'BROWSER_PLUGIN_LINK_UNAVAILABLE' });
    }
  });
  return router;
}
