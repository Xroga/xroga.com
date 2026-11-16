import { Router } from 'express';
import { z } from 'zod';
import { listComposioCatalog } from '../services/integrations/composioClient.js';
import { publicCatalogProjection } from '../services/integrations/publicCatalogProjection.js';

/**
 * Public marketing DIRECTORY metadata only. Existing private Xroga Connect
 * auth/connection/action routes remain behind authMiddleware. We never forward
 * user cookies, API credentials, custom MCP registrations or connection state.
 *
 * This route calls the public-metadata-safe branch of the canonical provider
 * service, which already supports missing tenantContext, with public scope
 * filtering. It is intentionally GET-only and cursor-bounded.
 */
const router = Router();
const inputs = z.object({
  limit: z.coerce.number().int().min(1).max(250).optional().default(250),
  // Composio uses opaque Base64 cursors; standard Base64 may contain '+' and '/'.
  // URLSearchParams encodes them when forwarding to the canonical client.
  cursor: z.string().trim().min(1).max(1000).regex(/^[A-Za-z0-9+/_=-]+$/).optional(),
  sortBy: z.enum(['usage', 'alphabetically']).optional().default('usage'),
}).strict();

const RATE_WINDOW_MS = 60_000;
const MAX_REQUESTS_PER_MINUTE = 40;
const limiters = new Map<string, { at: number; n: number }>();

function admit(ip: string): boolean {
  const now = Date.now();
  const key = ip.slice(0, 150);
  const prev = limiters.get(key);
  if (!prev || now - prev.at >= RATE_WINDOW_MS) {
    limiters.set(key, { at: now, n: 1 });
    if (limiters.size > 5_000) {
      for (const [k, v] of limiters) if (now - v.at >= RATE_WINDOW_MS) limiters.delete(k);
      if (limiters.size > 5_000) limiters.clear();
    }
    return true;
  }
  prev.n += 1;
  return prev.n <= MAX_REQUESTS_PER_MINUTE;
}

router.get('/catalog', async (req, res) => {
  if (!admit(req.ip || req.socket.remoteAddress || 'unknown')) {
    res.setHeader('Retry-After', '60');
    res.status(429).json({ ok: false, code: 'PUBLIC_CATALOG_RATE_LIMIT' });
    return;
  }

  const parsed = inputs.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ ok: false, code: 'INVALID_PUBLIC_CATALOG_QUERY' });
    return;
  }

  try {
    const page = await listComposioCatalog({
      limit: parsed.data.limit,
      sortBy: parsed.data.sortBy,
      ...(parsed.data.cursor ? { cursor: parsed.data.cursor } : {}),
    });
    const items = publicCatalogProjection(page.items);
    res.setHeader('Cache-Control', 'public, max-age=60, s-maxage=300, stale-while-revalidate=600');
    res.json({
      ok: true,
      items,
      totalItems: page.totalItems,
      ...(page.nextCursor ? { nextCursor: page.nextCursor } : {}),
    });
  } catch {
    // No provider key/tenant/internal diagnostic details on anonymous surfaces.
    res.setHeader('Cache-Control', 'no-store');
    res.status(503).json({ ok: false, code: 'PUBLIC_CATALOG_UNAVAILABLE' });
  }
});

export default router;
