import { Router, type Response } from 'express';

import type { AuthRequest } from '../middleware/auth.js';
import { phase2ServicesFor, type Phase2Services } from '../builder/phase2Bridge.js';
import { BuilderError } from '../builder/types.js';
import { TenantAccessError } from '../security/tenantErrors.js';
import { requireTenantContext, type TenantContext } from '../security/tenantContext.js';

/**
 * Phase 3 project API: customer-owned Supabase (select, reviewed schema), Vercel (preview and
 * separately approved production) and delivery provenance. Identity comes only from the issued
 * tenant context. Every external change is prepare, then an explicit approve quoting the plan
 * digest, then execute; production additionally needs a typed confirmation.
 */
export type Phase3ServicesFactory = (tenant: TenantContext) => Phase2Services;

const STATUS: Record<BuilderError['code'], number> = { invalid_input: 400, not_found: 404, conflict: 409, unsupported: 422, storage_failed: 503, too_large: 413, budget_exhausted: 402 };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const OPERATION_KEY = /^[A-Za-z0-9_.:-]{8,128}$/;

function fail(res: Response, error: unknown) {
  if (error instanceof TenantAccessError) return res.status(error.status).json({ error: error.message, code: error.code });
  if (error instanceof BuilderError) return res.status(STATUS[error.code]).json({ error: error.message, code: error.code.toUpperCase() });
  return res.status(500).json({ error: 'The request could not be completed.', code: 'BUILDER_FAILED' });
}

const id = (value: unknown): string => {
  const text = typeof value === 'string' ? value : '';
  if (!UUID.test(text)) throw new BuilderError('not_found', 'Not found.');
  return text;
};

const text = (value: unknown, max: number, field: string): string => {
  if (typeof value !== 'string' || value.length === 0 || value.length > max) throw new BuilderError('invalid_input', `${field} is required (up to ${max} characters).`);
  return value;
};

const operationKey = (value: unknown): string => {
  if (typeof value !== 'string' || !OPERATION_KEY.test(value)) throw new BuilderError('invalid_input', 'An operationKey of 8 to 128 safe characters is required so a retry is safe.');
  return value;
};

export function createBuilderPhase3Router(servicesFor: Phase3ServicesFactory = phase2ServicesFor): Router {
  const router = Router();
  const handle = (run: (tenant: TenantContext, services: Phase2Services, req: AuthRequest, res: Response) => Promise<unknown>) =>
    async (req: AuthRequest, res: Response) => {
      try {
        const tenant = requireTenantContext(req.tenantContext);
        await run(tenant, servicesFor(tenant), req, res);
      } catch (error) {
        if (!res.headersSent) fail(res, error);
      }
    };

  // ---- Provenance ----
  router.get('/projects/:projectId/delivery', handle(async (tenant, services, req, res) => {
    res.json({ revisions: await services.provenance(tenant.userId, id(req.params.projectId)) });
  }));

  // ---- Customer-owned Supabase ----
  router.get('/supabase/projects', handle(async (tenant, { data }, _req, res) => {
    res.json(await data.projects(tenant.userId));
  }));

  router.get('/projects/:projectId/supabase', handle(async (tenant, { data }, req, res) => {
    const projectId = id(req.params.projectId);
    res.json({ binding: await data.binding(tenant.userId, projectId), schema: await data.schemaFor(tenant.userId, projectId).then((schema) => (schema ? { archetype: schema.archetype, tables: schema.tables, protections: schema.protections } : null)), operations: await data.operations(tenant.userId, projectId) });
  }));

  router.post('/projects/:projectId/supabase/bind/prepare', handle(async (tenant, { data }, req, res) => {
    const result = await data.prepareBind(tenant.userId, id(req.params.projectId), { operationKey: operationKey(req.body?.operationKey), projectRef: text(req.body?.projectRef, 40, 'projectRef') });
    res.status(result.created ? 201 : 200).json(result);
  }));

  router.post('/projects/:projectId/supabase/migration/prepare', handle(async (tenant, { data }, req, res) => {
    const result = await data.prepareMigration(tenant.userId, id(req.params.projectId), { operationKey: operationKey(req.body?.operationKey) });
    res.status(result.created ? 201 : 200).json(result);
  }));

  router.post('/projects/:projectId/supabase/operations/:operationId/approve', handle(async (tenant, { data }, req, res) => {
    res.json({ operation: await data.approve(tenant.userId, id(req.params.projectId), id(req.params.operationId), text(req.body?.digest, 64, 'digest')) });
  }));

  router.post('/projects/:projectId/supabase/operations/:operationId/execute-bind', handle(async (tenant, { data }, req, res) => {
    res.json({ operation: await data.executeBind(tenant.userId, id(req.params.projectId), id(req.params.operationId)) });
  }));

  router.post('/projects/:projectId/supabase/operations/:operationId/execute-migration', handle(async (tenant, { data }, req, res) => {
    res.json({ operation: await data.executeMigration(tenant.userId, id(req.params.projectId), id(req.params.operationId)) });
  }));

  router.post('/projects/:projectId/supabase/operations/:operationId/cancel', handle(async (tenant, { data }, req, res) => {
    res.json({ operation: await data.cancel(tenant.userId, id(req.params.projectId), id(req.params.operationId)) });
  }));

  // ---- Customer-owned Vercel ----
  router.get('/vercel/targets', handle(async (tenant, { hosting }, _req, res) => {
    res.json(await hosting.targets(tenant.userId));
  }));

  router.get('/projects/:projectId/vercel', handle(async (tenant, { hosting }, req, res) => {
    const projectId = id(req.params.projectId);
    res.json({ state: await hosting.state(tenant.userId, projectId), operations: await hosting.operations(tenant.userId, projectId) });
  }));

  router.post('/projects/:projectId/vercel/preview/prepare', handle(async (tenant, { hosting }, req, res) => {
    const body = req.body ?? {};
    const scopeId = body.scopeId === null || body.scopeId === undefined ? null : text(body.scopeId, 60, 'scopeId');
    const result = await hosting.preparePreview(tenant.userId, id(req.params.projectId), {
      operationKey: operationKey(body.operationKey), scopeId, ...(typeof body.projectName === 'string' ? { projectName: body.projectName } : {}), existingProject: body.existingProject === true,
      ...(typeof body.revisionId === 'string' ? { revisionId: id(body.revisionId) } : {}),
    });
    res.status(result.created ? 201 : 200).json(result);
  }));

  router.post('/projects/:projectId/vercel/operations/:operationId/approve', handle(async (tenant, { hosting }, req, res) => {
    res.json({ operation: await hosting.approve(tenant.userId, id(req.params.projectId), id(req.params.operationId), text(req.body?.digest, 64, 'digest')) });
  }));

  router.post('/projects/:projectId/vercel/operations/:operationId/execute-preview', handle(async (tenant, { hosting }, req, res) => {
    res.json({ operation: await hosting.executePreview(tenant.userId, id(req.params.projectId), id(req.params.operationId)) });
  }));

  router.post('/projects/:projectId/vercel/operations/:operationId/cancel', handle(async (tenant, { hosting }, req, res) => {
    res.json({ operation: await hosting.cancel(tenant.userId, id(req.params.projectId), id(req.params.operationId)) });
  }));

  // Production: its own preparation, its own approval (digest AND typed confirmation), its own execution.
  router.post('/projects/:projectId/vercel/production/prepare', handle(async (tenant, { hosting }, req, res) => {
    const result = await hosting.preparePromotion(tenant.userId, id(req.params.projectId), { operationKey: operationKey(req.body?.operationKey), previewOperationId: id(req.body?.previewOperationId) });
    res.status(result.created ? 201 : 200).json(result);
  }));

  router.post('/projects/:projectId/vercel/production/:operationId/approve', handle(async (tenant, { hosting }, req, res) => {
    res.json({ operation: await hosting.approvePromotion(tenant.userId, id(req.params.projectId), id(req.params.operationId), { digest: text(req.body?.digest, 64, 'digest'), confirmation: text(req.body?.confirmation, 200, 'confirmation') }) });
  }));

  router.post('/projects/:projectId/vercel/production/:operationId/execute', handle(async (tenant, { hosting }, req, res) => {
    res.json({ operation: await hosting.executePromotion(tenant.userId, id(req.params.projectId), id(req.params.operationId)) });
  }));

  return router;
}
