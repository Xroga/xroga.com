import { randomUUID } from 'node:crypto';
import { isBuilderSecurityDenial } from '../builder/providerAuthority.js';

import { Router, type Response } from 'express';

import type { AuthRequest } from '../middleware/auth.js';
import { classifyBuilderIntent } from '../builder/intent.js';
import { phase2ServicesFor, type Phase2Services } from '../builder/phase2Bridge.js';
import { BuilderError } from '../builder/types.js';
import { TenantAccessError } from '../security/tenantErrors.js';
import { requireTenantContext, type TenantContext } from '../security/tenantContext.js';

/**
 * Phase 2 project API: browser QA and repair, restore and diff, source export and customer-owned
 * GitHub export. Ownership comes only from the issued tenant context. Every external change is
 * prepare, then an explicit approve that quotes the plan digest, then execute.
 */
export type Phase2ServicesFactory = (tenant: TenantContext) => Phase2Services;

const STATUS: Record<BuilderError['code'], number> = { invalid_input: 400, not_found: 404, conflict: 409, unsupported: 422, storage_failed: 503, too_large: 413, budget_exhausted: 402 };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const OPERATION_KEY = /^[A-Za-z0-9_.:-]{8,128}$/;

function fail(res: Response, error: unknown) {
  if (isBuilderSecurityDenial(error)) return res.status(403).json({ error: 'This action requires current authorization for its exact account and source.', code: 'BUILDER_PROVIDER_ADMISSION_DENIED' });
  if (error instanceof TenantAccessError) return res.status(error.status).json({ error: error.message, code: error.code });
  if (error instanceof BuilderError) return res.status(STATUS[error.code]).json({ error: error.message, code: error.code.toUpperCase() });
  return res.status(500).json({ error: 'The request could not be completed.', code: 'BUILDER_FAILED' });
}

function id(value: unknown): string {
  const text = typeof value === 'string' ? value : '';
  if (!UUID.test(text)) throw new BuilderError('not_found', 'Not found.');
  return text;
}

function text(value: unknown, max: number, field: string): string {
  if (typeof value !== 'string' || value.length === 0 || value.length > max) throw new BuilderError('invalid_input', `${field} is required (up to ${max} characters).`);
  return value;
}

function operationKey(value: unknown): string {
  if (typeof value !== 'string' || !OPERATION_KEY.test(value)) throw new BuilderError('invalid_input', 'An operationKey of 8 to 128 safe characters is required so a retry is safe.');
  return value;
}

/** Aborts a long operation when the client disconnects, so work and spend stop with the request. */
function abortOnClose(req: AuthRequest, res: Response): AbortController {
  const controller = new AbortController();
  res.on('close', () => {
    if (!res.writableEnded) controller.abort();
  });
  void req;
  return controller;
}

export function createBuilderPhase2Router(servicesFor: Phase2ServicesFactory = phase2ServicesFor): Router {
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

  // What does this message mean for the workspace: change the current project, or start another?
  router.post('/intent', handle(async (tenant, { builder }, req, res) => {
    const prompt = text(req.body?.prompt, 8000, 'prompt');
    let projectId: string | null = null;
    if (typeof req.body?.projectId === 'string' && req.body.projectId) {
      // Ownership is verified; a foreign or unknown id is treated as "no project".
      try {
        projectId = (await builder.requireProject(tenant.userId, id(req.body.projectId))).id;
      } catch {
        projectId = null;
      }
    }
    const intent = classifyBuilderIntent(prompt, { hasProject: projectId !== null });
    res.json({ intent, projectId: intent === 'followup' ? projectId : null });
  }));

  // ---- Iteration: diff and safe restore ----
  router.get('/projects/:projectId/revisions/:revisionId/diff', handle(async (tenant, { builder }, req, res) => {
    const against = typeof req.query.against === 'string' && req.query.against ? id(req.query.against) : undefined;
    res.json(await builder.diff(tenant.userId, id(req.params.projectId), id(req.params.revisionId), against));
  }));

  router.post('/projects/:projectId/revisions/:revisionId/restore', handle(async (tenant, { builder, preview, qa }, req, res) => {
    const projectId = id(req.params.projectId);
    const result = await builder.restoreRevision(tenant.userId, projectId, id(req.params.revisionId));
    res.json(result);
    // Restored source is tested before it is reported ready: restart the preview from it and rerun the browser tests,
    // best effort and detached. Until a test passes, the project stays PARTIAL.
    if (!result.unchanged) void preview.restart(tenant.userId, projectId).then(() => qa.runQa(tenant.userId, projectId)).catch(() => undefined);
  }));

  // Starts (or restarts) the isolated preview from the latest SAVED version, so a destroyed or expired sandbox is recoverable.
  router.post('/projects/:projectId/preview/restart', handle(async (tenant, { preview }, req, res) => {
    res.json(await preview.restart(tenant.userId, id(req.params.projectId)));
  }));

  // ---- Browser QA and repair ----
  router.post('/projects/:projectId/qa', handle(async (tenant, { qa }, req, res) => {
    const controller = abortOnClose(req, res);
    res.json(await qa.runQa(tenant.userId, id(req.params.projectId), { signal: controller.signal }));
  }));

  router.post('/projects/:projectId/verify-and-repair', handle(async (tenant, { qa }, req, res) => {
    const controller = abortOnClose(req, res);
    const requested = Number(req.body?.maxAttempts);
    const maxAttempts = Number.isInteger(requested) && requested >= 0 && requested <= 5 ? requested : undefined;
    const result = await qa.verifyAndRepair(tenant.userId, id(req.params.projectId), { maxAttempts, signal: controller.signal });
    res.json({ status: result.status, reason: result.reason, attempts: result.attempts, headRevisionId: result.headRevision.id, headRevisionNumber: result.headRevision.revisionNumber, qa: { status: result.finalReport.status, executedChecks: result.finalReport.executedChecks, failedChecks: result.finalReport.failedChecks, pendingChecks: result.finalReport.pendingChecks, reason: result.finalReport.reason } });
  }));

  router.get('/projects/:projectId/qa', handle(async (tenant, { qa }, req, res) => {
    const projectId = id(req.params.projectId);
    if (req.query.latest === '1') return res.json({ latest: await qa.latest(tenant.userId, projectId) });
    const revisionId = typeof req.query.revision === 'string' && req.query.revision ? id(req.query.revision) : undefined;
    res.json({ verifications: await qa.history(tenant.userId, projectId, revisionId) });
  }));

  router.get('/projects/:projectId/qa/:verificationId', handle(async (tenant, { qa }, req, res) => {
    res.json({ verification: await qa.report(tenant.userId, id(req.params.projectId), id(req.params.verificationId)) });
  }));

  // ---- Source export ----
  router.get('/projects/:projectId/export.zip', handle(async (tenant, { exporter }, req, res) => {
    const revisionId = typeof req.query.revision === 'string' && req.query.revision ? id(req.query.revision) : undefined;
    const archive = await exporter.exportRevision(tenant.userId, id(req.params.projectId), { revisionId, runId: randomUUID() });
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="${archive.filename}"`);
    res.setHeader('Content-Length', String(archive.bytes));
    res.setHeader('X-Xroga-Archive-Sha256', archive.sha256);
    res.setHeader('X-Xroga-Revision', String(archive.revisionNumber));
    res.setHeader('Cache-Control', 'private, no-store');
    res.end(archive.buffer);
  }));

  // ---- Customer-owned GitHub ----
  router.get('/github/targets', handle(async (tenant, { github }, _req, res) => {
    res.json(await github.targets(tenant.userId));
  }));

  router.get('/projects/:projectId/github', handle(async (tenant, { github }, req, res) => {
    const projectId = id(req.params.projectId);
    res.json({ binding: await github.binding(tenant.userId, projectId), operations: await github.operations(tenant.userId, projectId) });
  }));

  router.post('/projects/:projectId/github/prepare', handle(async (tenant, { github }, req, res) => {
    const body = req.body ?? {};
    const visibility = body.visibility === undefined ? 'private' : body.visibility;
    if (visibility !== 'private' && visibility !== 'public') throw new BuilderError('invalid_input', 'Visibility must be private or public.');
    const result = await github.prepareCreate(tenant.userId, id(req.params.projectId), {
      operationKey: operationKey(body.operationKey), owner: text(body.owner, 100, 'owner'), repositoryName: text(body.repositoryName, 100, 'repositoryName'), visibility,
      ...(typeof body.branch === 'string' ? { branch: body.branch } : {}), ...(typeof body.revisionId === 'string' ? { revisionId: id(body.revisionId) } : {}),
    });
    res.status(result.created ? 201 : 200).json(result);
  }));

  router.post('/projects/:projectId/github/sync/prepare', handle(async (tenant, { github }, req, res) => {
    const body = req.body ?? {};
    const result = await github.prepareSync(tenant.userId, id(req.params.projectId), { operationKey: operationKey(body.operationKey), ...(typeof body.revisionId === 'string' ? { revisionId: id(body.revisionId) } : {}) });
    res.status(result.created ? 201 : 200).json(result);
  }));

  router.post('/projects/:projectId/github/operations/:operationId/approve', handle(async (tenant, { github }, req, res) => {
    // Approval is a deliberate user request quoting the digest of the plan they were shown.
    const digest = text(req.body?.digest, 64, 'digest');
    res.json({ operation: await github.approve(tenant.userId, id(req.params.projectId), id(req.params.operationId), { digest }) });
  }));

  router.post('/projects/:projectId/github/operations/:operationId/execute', handle(async (tenant, { github }, req, res) => {
    res.json({ operation: await github.execute(tenant.userId, id(req.params.projectId), id(req.params.operationId)) });
  }));

  router.post('/projects/:projectId/github/operations/:operationId/cancel', handle(async (tenant, { github }, req, res) => {
    res.json({ operation: await github.cancel(tenant.userId, id(req.params.projectId), id(req.params.operationId)) });
  }));

  return router;
}
