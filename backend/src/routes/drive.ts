import { Router, type Response } from 'express';
import { z } from 'zod';
import type { AuthRequest } from '../middleware/auth.js';
import { actorFromUserId, getStorageService } from '../storage/runtime.js';
import type { StorageService } from '../storage/storageService.js';
import { httpStatusFor, StorageError } from '../storage/types.js';

const uuid = z.string().uuid();
const initiate = z.object({
  projectId: uuid.nullish(),
  filename: z.string().min(1).max(255),
  contentType: z.string().min(3).max(150),
  size: z.number().int().min(0),
  sha256: z.string().regex(/^[0-9a-f]{64}$/).nullish(),
}).strict();
const parts = z.object({ partNumbers: z.array(z.number().int().min(1).max(10_000)).min(1).max(100) }).strict();
const complete = z.object({ parts: z.array(z.object({ partNumber: z.number().int().min(1).max(10_000), etag: z.string().min(1).max(200) }).strict()).max(10_000).optional() }).strict();
const download = z.object({ ttlSeconds: z.number().int().min(1).max(300).optional() }).strict();

function fail(res: Response, err: unknown) {
  if (err instanceof StorageError) {
    res.status(err.status === 400 ? httpStatusFor(err.code) : err.status).json({ error: err.message, code: err.code });
    return;
  }
  if (err instanceof z.ZodError) { res.status(400).json({ error: 'Invalid request', code: 'INVALID_REQUEST' }); return; }
  // never echo provider errors: they can carry request ids, hosts or signed material
  console.error('[drive] unexpected error:', (err as Error)?.name);
  res.status(500).json({ error: 'Storage request failed', code: 'INTERNAL' });
}

/** `resolve` is injectable for tests; production uses the lazily-built singleton. */
export function createDriveRouter(resolve: () => StorageService | null = getStorageService): Router {
  const router = Router();
  router.use((_req, res, next) => { res.setHeader('Cache-Control', 'no-store'); next(); });

  const handler = (fn: (svc: StorageService, req: AuthRequest, res: Response) => Promise<unknown>) => async (req: AuthRequest, res: Response) => {
    const svc = resolve();
    if (!svc) { res.status(503).json({ error: 'Xroga Drive is not configured on this deployment', code: 'STORAGE_NOT_CONFIGURED' }); return; }
    if (!req.userId) { res.status(401).json({ error: 'Unauthorized', code: 'NO_TOKEN' }); return; }
    try { await fn(svc, req, res); } catch (err) { fail(res, err); }
  };
  // identity ONLY from the authenticated request; body/query/params can never name a tenant or owner
  const actor = (req: AuthRequest) => actorFromUserId(req.userId as string);
  const pid = (req: AuthRequest) => String(req.params.id);

  router.post('/uploads', handler(async (s, req, res) => res.status(201).json(await s.initiateUpload(actor(req), initiate.parse(req.body)))));
  router.post('/uploads/:id/parts', handler(async (s, req, res) => res.json({ parts: await s.signUploadParts(actor(req), pid(req), parts.parse(req.body).partNumbers) })));
  router.post('/uploads/:id/complete', handler(async (s, req, res) => res.json(await s.completeUpload(actor(req), pid(req), complete.parse(req.body ?? {})))));
  router.get('/objects', handler(async (s, req, res) => {
    const q = z.object({ projectId: uuid.optional(), limit: z.coerce.number().int().min(1).max(500).optional(), after: uuid.optional() }).parse(req.query);
    res.json({ objects: await s.listObjects(actor(req), { projectId: q.projectId, limit: q.limit, afterId: q.after }) });
  }));
  router.get('/objects/:id', handler(async (s, req, res) => res.json(await s.getObjectMeta(actor(req), pid(req)))));
  router.post('/objects/:id/download-url', handler(async (s, req, res) => res.json(await s.getDownload(actor(req), pid(req), download.parse(req.body ?? {}).ttlSeconds))));
  router.delete('/objects/:id', handler(async (s, req, res) => { await s.deleteObject(actor(req), pid(req)); res.status(204).end(); }));
  return router;
}

export default createDriveRouter();
