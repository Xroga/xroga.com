/**
 * /api/existing-source — link an EXISTING GitHub repository to Xroga and inspect it read-only (Batch 3, Phase 1).
 * Mounted behind `authMiddleware`. Off unless XROGA_EXISTING_SOURCE=1 (development only until the release is authorised).
 *
 *   GET    /repositories             repositories the connected account can read (metadata only, nothing fetched from them)
 *   POST   /links                    { repositoryId, branch? } link at the exact commit the branch points at now
 *   GET    /links                    the owner's linked repositories
 *   GET    /links/:id                re-verify against GitHub: account, access, ownership, where the branch is now
 *   POST   /links/:id/refresh        move the base commit to the branch's current head, on purpose and recorded
 *   DELETE /links/:id                unlink (the repository itself is untouched)
 *   GET    /links/:id/directory      one directory level at the base commit (?path=)
 *   GET    /links/:id/file           one file at the base commit (?path=, optional ?startLine=&endLine=), redacted and bounded
 *
 * Identity comes only from the issued TenantContext. A repository is named by GitHub's immutable id and judged with the caller's own
 * connected-account token; the response never contains a token.
 */
import { Router, type Response } from 'express';
import { z } from 'zod';
import type { AuthRequest } from '../middleware/auth.js';
import { ExistingSourceService } from '../existingSource/service.js';
import { createRestSourcePort } from '../existingSource/provider.js';
import { SupabaseSourceBindingStore } from '../existingSource/store.js';
import { ExistingSourceError } from '../existingSource/types.js';
import { getGitHubToken } from '../services/integrations/githubAuth.js';
import { getTenantSupabaseAdmin } from '../security/serviceRoleGuard.js';
import { TenantAccessError } from '../security/tenantErrors.js';
import { requireTenantContext, type TenantContext } from '../security/tenantContext.js';

export const existingSourceEnabled = (env: NodeJS.ProcessEnv = process.env): boolean => env.XROGA_EXISTING_SOURCE === '1';

export type ExistingSourceServiceFactory = (tenant: TenantContext) => ExistingSourceService;

/** Finds or creates the Xroga project a linked repository shows up as, without renaming a project the owner already has for it. */
async function projectFor(tenant: TenantContext, input: { ownerId: string; repositoryFullName: string; repositoryUrl: string; branch: string }): Promise<string | null> {
  const db = getTenantSupabaseAdmin(tenant);
  const existing = await db.from('projects').select('id').eq('user_id', input.ownerId).eq('github_repo_name', input.repositoryFullName).limit(2);
  if (existing.error) return null;
  if ((existing.data ?? []).length === 1) return String(existing.data![0]!.id);
  if ((existing.data ?? []).length > 1) return null; // ambiguous legacy data: never guess
  const saved = await db.rpc('save_owned_project_atomic', {
    p_owner_id: input.ownerId,
    p_project: { name: input.repositoryFullName.split('/')[1] ?? input.repositoryFullName, type: 'app', github_repo_url: input.repositoryUrl, github_repo_name: input.repositoryFullName, github_branch: input.branch },
  });
  const project = (saved.data as { project?: { id?: string; user_id?: string } } | null)?.project;
  return !saved.error && project?.id && project.user_id === input.ownerId ? project.id : null;
}

export const defaultExistingSourceService: ExistingSourceServiceFactory = (tenant) => {
  const context = requireTenantContext(tenant);
  return new ExistingSourceService({
    store: new SupabaseSourceBindingStore(context),
    tokenFor: (userId) => getGitHubToken(userId),
    portFor: (token) => createRestSourcePort(token),
    projectFor: (input) => projectFor(context, input),
  });
};

const id = z.string().uuid();
const link = z.object({ repositoryId: z.string().regex(/^[0-9]{1,20}$/), branch: z.string().min(1).max(200).optional() }).strict();
const page = z.coerce.number().int().min(1).max(50).default(1);
const directory = z.object({ path: z.string().max(1_000).optional() });
const file = z.object({ path: z.string().min(1).max(1_000), startLine: z.coerce.number().int().min(1).optional(), endLine: z.coerce.number().int().min(1).optional() })
  .refine((q) => (q.startLine === undefined) === (q.endLine === undefined), 'startLine and endLine go together');

export function createExistingSourceRouter(serviceFor: ExistingSourceServiceFactory = defaultExistingSourceService, enabled: () => boolean = () => existingSourceEnabled()): Router {
  const router = Router();
  router.use((_req, res, next) => { res.setHeader('Cache-Control', 'no-store'); next(); });
  router.use((_req, res, next) => {
    if (!enabled()) { res.status(503).json({ error: 'Existing-repository editing is not enabled on this deployment', code: 'EXISTING_SOURCE_DISABLED' }); return; }
    next();
  });

  const fail = (res: Response, e: unknown) => {
    if (e instanceof TenantAccessError) { res.status(e.status).json({ error: e.message, code: e.code }); return; }
    if (e instanceof ExistingSourceError) { res.status(e.status).json({ error: e.message, code: e.code }); return; }
    if (e instanceof z.ZodError) { res.status(400).json({ error: 'Invalid request', code: 'INVALID_REQUEST' }); return; }
    res.status(500).json({ error: 'The request could not be completed', code: 'INTERNAL' });
  };

  const handle = (fn: (tenant: TenantContext, service: ExistingSourceService, req: AuthRequest, res: Response) => Promise<unknown>) => async (req: AuthRequest, res: Response) => {
    try {
      const tenant = requireTenantContext(req.tenantContext);
      await fn(tenant, serviceFor(tenant), req, res);
    } catch (e) { fail(res, e); }
  };

  router.get('/repositories', handle(async (t, s, req, res) => { res.json(await s.listRepositories(t.userId, page.parse(req.query.page))); }));
  router.post('/links', handle(async (t, s, req, res) => {
    const body = link.parse(req.body);
    const result = await s.link(t.userId, body);
    res.status(result.created ? 201 : 200).json(result);
  }));
  router.get('/links', handle(async (t, s, _req, res) => { res.json({ links: await s.list(t.userId) }); }));
  router.get('/links/:id', handle(async (t, s, req, res) => { res.json(await s.verify(t.userId, id.parse(req.params.id), { maxAgeMs: 0 })); }));
  router.post('/links/:id/refresh', handle(async (t, s, req, res) => { res.json(await s.refreshBase(t.userId, id.parse(req.params.id))); }));
  router.delete('/links/:id', handle(async (t, s, req, res) => { await s.unlink(t.userId, id.parse(req.params.id)); res.status(204).end(); }));
  router.get('/links/:id/directory', handle(async (t, s, req, res) => { res.json(await s.listDirectory(t.userId, id.parse(req.params.id), directory.parse(req.query))); }));
  router.get('/links/:id/file', handle(async (t, s, req, res) => { res.json(await s.readFile(t.userId, id.parse(req.params.id), file.parse(req.query))); }));
  return router;
}

export default createExistingSourceRouter();
