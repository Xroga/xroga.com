import { Router, type Response } from 'express';

import type { AuthRequest } from '../middleware/auth.js';
import type { BuilderService } from '../builder/service.js';
import { builderServiceFor } from '../builder/swarmBridge.js';
import { BuilderError } from '../builder/types.js';
import { TenantAccessError } from '../security/tenantErrors.js';
import { requireTenantContext, type TenantContext } from '../security/tenantContext.js';
import { createBuilderPhase2Router, type Phase2ServicesFactory } from './builderPhase2.js';
import { createBuilderPhase3Router } from './builderPhase3.js';

/**
 * AI Product Builder project API. Ownership comes only from the verified, issued tenant context;
 * the project id in the path is a lookup key that is matched against that owner in storage.
 * Building itself runs through the canonical chat route (POST /api/swarm/execute with
 * builderProjectId), so budget, cancellation, progress replay and events are the existing ones.
 */
export type BuilderServiceFactory = (tenant: TenantContext) => BuilderService;

const STATUS: Record<BuilderError['code'], number> = {
  invalid_input: 400,
  not_found: 404,
  conflict: 409,
  unsupported: 422,
  storage_failed: 503,
  too_large: 413,
  budget_exhausted: 402,
};

function fail(res: Response, error: unknown) {
  if (error instanceof TenantAccessError) return res.status(error.status).json({ error: error.message, code: error.code });
  if (error instanceof BuilderError) return res.status(STATUS[error.code]).json({ error: error.message, code: error.code.toUpperCase() });
  return res.status(500).json({ error: 'The request could not be completed.', code: 'BUILDER_FAILED' });
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function id(value: unknown): string {
  const text = typeof value === 'string' ? value : '';
  if (!UUID.test(text)) throw new BuilderError('not_found', 'Project not found.');
  return text;
}

export function createBuilderRouter(serviceFor: BuilderServiceFactory = builderServiceFor, phase2For?: Phase2ServicesFactory): Router {
  const router = Router();
  router.use(createBuilderPhase2Router(phase2For));
  router.use(createBuilderPhase3Router(phase2For));

  router.post('/projects', async (req: AuthRequest, res) => {
    try {
      const tenant = requireTenantContext(req.tenantContext);
      const prompt = typeof req.body?.prompt === 'string' ? req.body.prompt : '';
      const requestKey = typeof req.body?.requestKey === 'string' ? req.body.requestKey : '';
      const conversationId = typeof req.body?.conversationId === 'string' ? req.body.conversationId.slice(0, 128) : null;
      const { project, created } = await serviceFor(tenant).createProject(tenant.userId, { prompt, requestKey, conversationId });
      return res.status(created ? 201 : 200).json({ project, created });
    } catch (error) {
      return fail(res, error);
    }
  });

  router.get('/projects', async (req: AuthRequest, res) => {
    try {
      const tenant = requireTenantContext(req.tenantContext);
      return res.json({ projects: await serviceFor(tenant).listProjects(tenant.userId) });
    } catch (error) {
      return fail(res, error);
    }
  });

  router.get('/projects/:projectId', async (req: AuthRequest, res) => {
    try {
      const tenant = requireTenantContext(req.tenantContext);
      return res.json(await serviceFor(tenant).getState(tenant.userId, id(req.params.projectId)));
    } catch (error) {
      return fail(res, error);
    }
  });

  router.get('/projects/:projectId/revisions', async (req: AuthRequest, res) => {
    try {
      const tenant = requireTenantContext(req.tenantContext);
      return res.json({ revisions: await serviceFor(tenant).history(tenant.userId, id(req.params.projectId)) });
    } catch (error) {
      return fail(res, error);
    }
  });

  router.get('/projects/:projectId/revisions/:revisionId', async (req: AuthRequest, res) => {
    try {
      const tenant = requireTenantContext(req.tenantContext);
      const revision = await serviceFor(tenant).revisionFiles(tenant.userId, id(req.params.projectId), id(req.params.revisionId));
      return res.json({ revision });
    } catch (error) {
      return fail(res, error);
    }
  });

  /** Source of the current head revision, for the file explorer. */
  router.get('/projects/:projectId/files', async (req: AuthRequest, res) => {
    try {
      const tenant = requireTenantContext(req.tenantContext);
      const service = serviceFor(tenant);
      const project = await service.requireProject(tenant.userId, id(req.params.projectId));
      const { revision, files } = await service.headFiles(tenant.userId, project);
      return res.json({ revisionId: revision?.id ?? null, revisionNumber: revision?.revisionNumber ?? 0, contentSha256: revision?.contentSha256 ?? null, files });
    } catch (error) {
      return fail(res, error);
    }
  });

  return router;
}

export default createBuilderRouter();
