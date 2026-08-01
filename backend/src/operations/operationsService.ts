import { randomUUID } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { getSupabaseAdmin } from '../config/supabase.js';
import {
  ACTION_DEFINITIONS, actionPlanDigest, aggregatePortfolioProduct, approvalIsValid, automationDecision,
  initialActionStatus, maintenanceBlocksAction, providerResultToStatus, redactOperationsValue,
} from './operationsEngine.js';
import { hasOperationsPermission, permissionsForRole, roleForProjectAccess } from './permissions.js';
import { createInternalAdapter, httpVerificationAdapter, ProviderAdapterRegistry } from './providerAdapters.js';
import type {
  OperationalResource, OperationsPermission, OperationsRole, PortfolioProduct,
  ProviderResult, RiskLevel, SafeActionRequest,
} from './types.js';

type DbRow = Record<string, any>;

export class OperationsServiceError extends Error {
  constructor(
    public readonly code: 'forbidden' | 'not_found' | 'conflict' | 'invalid_state' | 'precondition_failed' | 'approval_required' | 'external_setup_required' | 'provider_unavailable' | 'verification_failed' | 'action_failed' | 'unknown',
    message: string,
    public readonly statusCode = 400,
  ) { super(message); }
}

function stale(staleAfter?: string | null): boolean {
  return Boolean(staleAfter && new Date(staleAfter).getTime() <= Date.now());
}

function availableActions(kind: string, status: string): string[] {
  const actions: Record<string, string[]> = {
    health_check: ['refresh_health'], service: ['refresh_health'], domain: ['verify_domain'],
    workflow_check: ['run_synthetic_check'], worker: ['prepare_repair'], queue: ['prepare_repair'],
    migration: ['apply_migration'], backup: ['restore_backup'], provider_status: ['prepare_repair'],
  };
  const values = [...(actions[kind] ?? [])];
  if (status === 'failed' && kind === 'job') values.push('retry_job');
  if (status === 'failed' && kind === 'webhook') values.push('retry_webhook');
  return values;
}

function mapResource(row: DbRow): OperationalResource {
  return {
    id: row.id, version: Number(row.version ?? 1), projectId: row.project_id, environmentId: row.environment_id ?? null,
    kind: row.kind, provider: row.provider, name: row.name, status: row.status,
    statusReason: row.status_reason ?? null, desiredState: row.desired_state ?? {},
    observedState: row.observed_state ?? {}, evidenceReference: row.evidence_reference ?? null,
    freshness: {
      source: row.source, observedAt: row.observed_at ?? null, verifiedAt: row.verified_at ?? null,
      staleAfter: row.stale_after ?? null, reconciliationState: row.reconciliation_state ?? 'unknown',
      stale: stale(row.stale_after),
    },
    availableActions: availableActions(row.kind, row.status),
  };
}

async function queryOrThrow<T = DbRow[]>(promise: PromiseLike<{ data: T | null; error: any }>, message: string): Promise<T> {
  const { data, error } = await promise;
  if (error) throw new OperationsServiceError('unknown', message, 503);
  return (data ?? []) as T;
}

export class OperationsService {
  private readonly registry = new ProviderAdapterRegistry();
  constructor(private readonly db: SupabaseClient = getSupabaseAdmin()) {
    this.registry.register(httpVerificationAdapter);
    this.registry.register(createInternalAdapter((capability, input) => this.executeInternal(capability, input)));
  }

  private async access(userId: string, projectId: string, permission: OperationsPermission): Promise<{ role: OperationsRole; ownerId: string }> {
    const [project, profile] = await Promise.all([
      queryOrThrow<DbRow | null>(this.db.from('projects').select('id,user_id').eq('id', projectId).maybeSingle(), 'Project lookup failed'),
      queryOrThrow<DbRow | null>(this.db.from('profiles').select('role').eq('id', userId).maybeSingle(), 'Profile lookup failed'),
    ]);
    if (!project) throw new OperationsServiceError('not_found', 'Product not found', 404);
    let role = roleForProjectAccess({ isAdmin: profile?.role === 'admin', isOwner: project.user_id === userId });
    if (!role) {
      const membership = await queryOrThrow<DbRow | null>(this.db.from('operations_memberships').select('role').eq('project_id', projectId).eq('member_user_id', userId).maybeSingle(), 'Membership lookup failed');
      role = membership?.role as OperationsRole | null;
    }
    if (!role || !hasOperationsPermission(role, permission)) throw new OperationsServiceError('forbidden', 'Operation is not permitted', 403);
    return { role, ownerId: project.user_id };
  }

  async permissions(userId: string, projectId: string): Promise<{ role: OperationsRole; permissions: OperationsPermission[] }> {
    const { role } = await this.access(userId, projectId, 'view_product_operations');
    return { role, permissions: permissionsForRole(role) };
  }

  async portfolio(userId: string, options: { search?: string; status?: string; type?: string; limit: number; offset: number }): Promise<{ products: PortfolioProduct[]; total: number; nextOffset: number | null }> {
    const { data: profile } = await this.db.from('profiles').select('role').eq('id', userId).maybeSingle();
    const memberships = profile?.role === 'admin' ? [] : await queryOrThrow<DbRow[]>(this.db.from('operations_memberships').select('project_id').eq('member_user_id', userId), 'Membership lookup failed');
    let projectsQuery = this.db.from('projects').select('id,name,type,github_repo_name,user_id', { count: 'exact' }).order('updated_at', { ascending: false });
    if (profile?.role !== 'admin') {
      const memberProjectIds = memberships.map((item) => item.project_id);
      projectsQuery = memberProjectIds.length ? projectsQuery.or(`user_id.eq.${userId},id.in.(${memberProjectIds.join(',')})`) : projectsQuery.eq('user_id', userId);
    }
    if (options.search) projectsQuery = projectsQuery.ilike('name', `%${options.search.replace(/[%_]/g, '')}%`);
    if (options.type) projectsQuery = projectsQuery.eq('type', options.type);
    const { data: projects, error, count } = await projectsQuery.range(options.offset, options.offset + options.limit - 1);
    if (error) throw new OperationsServiceError('unknown', 'Portfolio is unavailable', 503);
    const projectRows = projects ?? [];
    const ids = projectRows.map((project) => project.id);
    if (!ids.length) return { products: [], total: count ?? 0, nextOffset: null };

    const [environments, resources, incidents, alerts, approvals, deployments] = await Promise.all([
      queryOrThrow(this.db.from('operations_environments').select('*').in('project_id', ids).order('updated_at', { ascending: false }), 'Environment state unavailable'),
      queryOrThrow(this.db.from('operations_resources').select('*').in('project_id', ids), 'Operational resources unavailable'),
      queryOrThrow(this.db.from('production_incidents').select('id,project_id,status').in('project_id', ids).not('status', 'in', '(resolved,closed,cancelled)'), 'Incident state unavailable'),
      queryOrThrow(this.db.from('operations_alerts').select('id,project_id,status').in('project_id', ids).in('status', ['active','acknowledged']), 'Alert state unavailable'),
      queryOrThrow(
        this.db
          .from('operations_action_approvals')
          .select('id,action_id,decision,operations_actions!inner(project_id)')
          .eq('decision', 'pending')
          .in('operations_actions.project_id', ids),
        'Approval state unavailable',
      ),
      queryOrThrow(this.db.from('deployment_status').select('id,project_id,verification_state,status,created_at').in('project_id', ids).order('created_at', { ascending: false }), 'Deployment state unavailable'),
    ]);

    const products = projectRows.map((project) => {
      const projectResources = (resources as DbRow[]).filter((item) => item.project_id === project.id).map(mapResource);
      const environmentRow = (environments as DbRow[]).find((item) => item.project_id === project.id && item.environment_type === 'production')
        ?? (environments as DbRow[]).find((item) => item.project_id === project.id);
      const environment = environmentRow
        ? { environment_key: String(environmentRow.environment_key), observed_release_id: environmentRow.observed_release_id, observed_commit_sha: environmentRow.observed_commit_sha }
        : undefined;
      const deployment = (deployments as DbRow[]).find((item) => item.project_id === project.id);
      return aggregatePortfolioProduct({
        project,
        resources: projectResources,
        environment,
        incidentCount: (incidents as DbRow[]).filter((item) => item.project_id === project.id).length,
        alertCount: (alerts as DbRow[]).filter((item) => item.project_id === project.id).length,
        pendingApprovals: (approvals as DbRow[]).filter((item) => item.operations_actions?.project_id === project.id).length,
        deploymentState: deployment?.verification_state ?? deployment?.status ?? null,
      });
    }).filter((product) => !options.status || product.status === options.status);
    return { products, total: count ?? products.length, nextOffset: options.offset + options.limit < (count ?? 0) ? options.offset + options.limit : null };
  }

  async product(userId: string, projectId: string): Promise<Record<string, unknown>> {
    const access = await this.access(userId, projectId, 'view_product_operations');
    const [project, environments, resources, releases, deployments, incidents, alerts, actions, approvals, jobs, webhooks, maintenance] = await Promise.all([
      queryOrThrow<DbRow | null>(this.db.from('projects').select('id,name,type,status,github_repo_url,github_repo_name,created_at,updated_at').eq('id', projectId).maybeSingle(), 'Product unavailable'),
      queryOrThrow(this.db.from('operations_environments').select('*').eq('project_id', projectId).eq('user_id', access.ownerId).order('updated_at', { ascending: false }), 'Environments unavailable'),
      queryOrThrow(this.db.from('operations_resources').select('*').eq('project_id', projectId).eq('user_id', access.ownerId).order('updated_at', { ascending: false }), 'Resources unavailable'),
      queryOrThrow(this.db.from('production_releases').select('id,commit_sha,artifact_digest,environment,state,branch,build_id,verified_at,stale_after,created_at').eq('project_id', projectId).eq('user_id', access.ownerId).order('created_at', { ascending: false }).limit(50), 'Releases unavailable'),
      queryOrThrow(this.db.from('deployment_status').select('*').eq('project_id', projectId).eq('user_id', access.ownerId).order('created_at', { ascending: false }).limit(50), 'Deployments unavailable'),
      queryOrThrow(this.db.from('production_incidents').select('*').eq('project_id', projectId).eq('user_id', access.ownerId).order('opened_at', { ascending: false }).limit(50), 'Incidents unavailable'),
      queryOrThrow(this.db.from('operations_alerts').select('*').eq('project_id', projectId).eq('user_id', access.ownerId).order('last_observed_at', { ascending: false }).limit(100), 'Alerts unavailable'),
      queryOrThrow(this.db.from('operations_actions').select('id,action_type,target_type,target_id,risk_level,status,status_reason,evidence_reference,created_at,updated_at').eq('project_id', projectId).eq('user_id', access.ownerId).order('created_at', { ascending: false }).limit(100), 'Actions unavailable'),
      queryOrThrow(this.db.from('operations_action_approvals').select('id,action_id,required_role,decision,expires_at,created_at,operations_actions!inner(project_id)').eq('operations_actions.project_id', projectId).eq('user_id', access.ownerId).order('created_at', { ascending: false }).limit(100), 'Approvals unavailable'),
      queryOrThrow(this.db.from('swarm_job_queue').select('id,run_id,feature_category,status,attempt_count,max_attempts,error_category,safe_error,created_at,updated_at,completed_at').eq('project_id', projectId).eq('user_id', access.ownerId).order('created_at', { ascending: false }).limit(100), 'Jobs unavailable'),
      queryOrThrow(this.db.from('webhook_deliveries').select('delivery_id,provider,event_type,status,signature_verified,attempt_count,response_status,related_object,evidence_reference,received_at,completed_at,updated_at').eq('project_id', projectId).eq('user_id', access.ownerId).order('received_at', { ascending: false }).limit(100), 'Webhooks unavailable'),
      queryOrThrow(this.db.from('operations_maintenance_windows').select('*').eq('project_id', projectId).eq('user_id', access.ownerId).order('starts_at', { ascending: false }).limit(100), 'Maintenance windows unavailable'),
    ]);
    if (!project) throw new OperationsServiceError('not_found', 'Product not found', 404);
    return { project, environments, resources: (resources as DbRow[]).map(mapResource), releases, deployments, incidents, alerts, actions, approvals, jobs, webhooks, maintenance, role: access.role, permissions: permissionsForRole(access.role) };
  }

  async resources(userId: string, projectId: string, filters: { kind?: string; environmentId?: string; limit: number; offset: number }): Promise<{ resources: OperationalResource[]; nextOffset: number | null }> {
    const access = await this.access(userId, projectId, 'view_product_operations');
    let query = this.db.from('operations_resources').select('*').eq('project_id', projectId).eq('user_id', access.ownerId).order('updated_at', { ascending: false });
    if (filters.kind) query = query.eq('kind', filters.kind);
    if (filters.environmentId) query = query.eq('environment_id', filters.environmentId);
    const rows = await queryOrThrow<DbRow[]>(query.range(filters.offset, filters.offset + filters.limit), 'Resources unavailable');
    return { resources: rows.slice(0, filters.limit).map(mapResource), nextOffset: rows.length > filters.limit ? filters.offset + filters.limit : null };
  }

  async configuration(userId: string, projectId: string): Promise<DbRow[]> {
    const access = await this.access(userId, projectId, 'view_environment_operations');
    return queryOrThrow(this.db.from('operations_config_checks')
      .select('id,project_id,environment_id,variable_name,provider,present,validation_status,restart_required,redeploy_required,evidence_reference,verified_at,stale_after')
      .eq('project_id', projectId).eq('user_id', access.ownerId).order('variable_name'), 'Configuration posture unavailable');
  }

  async slo(userId: string, projectId: string): Promise<DbRow[]> {
    const access = await this.access(userId, projectId, 'view_metrics');
    return queryOrThrow(this.db.from('operations_slo_snapshots').select('*').eq('project_id', projectId).eq('user_id', access.ownerId).order('created_at', { ascending: false }).limit(100), 'SLO state unavailable');
  }

  async createAction(userId: string, request: SafeActionRequest): Promise<DbRow> {
    const definition = ACTION_DEFINITIONS[request.actionType];
    if (!definition || !definition.supportedTargetTypes.includes(request.targetType)) throw new OperationsServiceError('precondition_failed', 'Unsupported action or target', 400);
    const access = await this.access(userId, request.projectId, definition.permission);
    const windows = await queryOrThrow<DbRow[]>(this.db.from('operations_maintenance_windows').select('starts_at,ends_at,allowed_actions,blocked_actions').eq('project_id', request.projectId).eq('user_id', access.ownerId), 'Maintenance state unavailable');
    if (maintenanceBlocksAction({ actionType: request.actionType, now: new Date(), windows: windows.map((item) => ({ startsAt: item.starts_at, endsAt: item.ends_at, allowedActions: item.allowed_actions, blockedActions: item.blocked_actions })) })) {
      throw new OperationsServiceError('precondition_failed', 'Action is blocked by an active maintenance window', 409);
    }
    const digest = actionPlanDigest(request);
    const status = initialActionStatus(definition, request.confirmed);
    const row = {
      user_id: access.ownerId, project_id: request.projectId, environment_id: request.environmentId ?? null,
      action_type: request.actionType, target_type: request.targetType, target_id: request.targetId,
      requested_by: userId, permission_required: definition.permission, risk_level: definition.riskLevel,
      status, idempotency_key: request.idempotencyKey, target_version: request.targetVersion,
      action_plan_digest: digest, preconditions: [], execution_plan: redactOperationsValue(request.parameters ?? {}),
      rollback_plan: {}, verification_plan: { required: true }, max_attempts: definition.maxAttempts,
      confirmation_digest: request.confirmed ? digest : null,
    };
    const { data, error } = await this.db.from('operations_actions').insert(row).select('*').single();
    if (error) {
      const existing = await queryOrThrow<DbRow | null>(this.db.from('operations_actions').select('*').eq('user_id', access.ownerId).eq('idempotency_key', request.idempotencyKey).maybeSingle(), 'Action conflict');
      if (existing) return existing;
      throw new OperationsServiceError('conflict', 'Action could not be created', 409);
    }
    try {
      await this.audit({ userId: access.ownerId, actorId: userId, projectId: request.projectId, environmentId: request.environmentId, action: 'operations.action.requested', targetType: 'action', targetId: data.id, outcome: status, afterState: row, correlationId: request.idempotencyKey });
    } catch (error) {
      await this.db.from('operations_actions').update({ status: 'blocked', status_reason: 'audit_storage_unavailable', updated_at: new Date().toISOString() }).eq('id', data.id);
      throw error;
    }
    if (status === 'approval_required' && definition.approvalRole) {
      await queryOrThrow(this.db.from('operations_action_approvals').insert({ action_id: data.id, user_id: access.ownerId, requester_id: userId, required_role: definition.approvalRole, target_version: request.targetVersion, action_plan_digest: digest, expires_at: new Date(Date.now() + 30 * 60_000).toISOString() }).select(), 'Approval request failed');
      return data;
    }
    if (status === 'queued') return this.executeAction(userId, data.id);
    return data;
  }

  async approveAction(userId: string, actionId: string, decision: 'approved' | 'rejected', reason: string): Promise<DbRow> {
    const action = await queryOrThrow<DbRow | null>(this.db.from('operations_actions').select('*').eq('id', actionId).maybeSingle(), 'Action unavailable');
    if (!action) throw new OperationsServiceError('not_found', 'Action not found', 404);
    const access = await this.access(userId, action.project_id, 'view_product_operations');
    if (action.requested_by === userId) throw new OperationsServiceError('forbidden', 'Requester cannot approve this action', 403);
    const approval = await queryOrThrow<DbRow | null>(this.db.from('operations_action_approvals').select('*').eq('action_id', actionId).eq('decision', 'pending').maybeSingle(), 'Approval unavailable');
    if (!approval) throw new OperationsServiceError('invalid_state', 'No pending approval exists', 409);
    if (access.role !== 'admin' && access.role !== approval.required_role) throw new OperationsServiceError('forbidden', `This action requires a ${approval.required_role}`, 403);
    if (new Date(approval.expires_at).getTime() <= Date.now()) {
      await this.db.from('operations_action_approvals').update({ decision: 'expired', decided_at: new Date().toISOString() }).eq('id', approval.id);
      throw new OperationsServiceError('invalid_state', 'Approval expired', 409);
    }
    const nextActionStatus = decision === 'approved' ? 'approved' : 'blocked';
    await queryOrThrow(this.db.from('operations_action_approvals').update({ decision, reason: reason.slice(0, 500), approver_id: userId, decided_at: new Date().toISOString() }).eq('id', approval.id).select(), 'Approval update failed');
    const updated = await queryOrThrow<DbRow[]>(this.db.from('operations_actions').update({ status: nextActionStatus, status_reason: decision === 'rejected' ? 'approval_rejected' : null, updated_at: new Date().toISOString() }).eq('id', actionId).select('*'), 'Action update failed');
    await this.audit({ userId: access.ownerId, actorId: userId, projectId: action.project_id, environmentId: action.environment_id, action: `operations.approval.${decision}`, targetType: 'action', targetId: actionId, outcome: nextActionStatus, reason, correlationId: action.idempotency_key });
    return updated[0];
  }

  async confirmAction(userId: string, actionId: string): Promise<DbRow> {
    const action = await queryOrThrow<DbRow | null>(this.db.from('operations_actions').select('*').eq('id', actionId).maybeSingle(), 'Action unavailable');
    if (!action) throw new OperationsServiceError('not_found', 'Action not found', 404);
    if (action.requested_by !== userId) throw new OperationsServiceError('forbidden', 'Only the requester can confirm this action', 403);
    const definition = ACTION_DEFINITIONS[action.action_type];
    await this.access(userId, action.project_id, definition.permission);
    if (action.status !== 'confirmation_required') throw new OperationsServiceError('invalid_state', 'Action is not waiting for confirmation', 409);
    const status = definition.approvalRole ? 'approval_required' : 'queued';
    const updated = await queryOrThrow<DbRow[]>(this.db.from('operations_actions').update({ confirmation_digest: action.action_plan_digest, status, updated_at: new Date().toISOString() }).eq('id', actionId).eq('status', 'confirmation_required').select('*'), 'Action confirmation failed');
    if (!updated.length) throw new OperationsServiceError('conflict', 'Action state changed before confirmation', 409);
    if (definition.approvalRole) {
      await queryOrThrow(this.db.from('operations_action_approvals').insert({ action_id: action.id, user_id: action.user_id, requester_id: userId, required_role: definition.approvalRole, target_version: action.target_version, action_plan_digest: action.action_plan_digest, expires_at: new Date(Date.now() + 30 * 60_000).toISOString() }).select(), 'Approval request failed');
      return updated[0];
    }
    return this.executeAction(userId, actionId);
  }

  private async currentTargetVersion(action: DbRow): Promise<number | null> {
    const lookups: Record<string, { table: string; idColumn: string; versionColumn: string }> = {
      service: { table: 'operations_resources', idColumn: 'id', versionColumn: 'version' }, health_check: { table: 'operations_resources', idColumn: 'id', versionColumn: 'version' },
      workflow_check: { table: 'operations_resources', idColumn: 'id', versionColumn: 'version' }, domain: { table: 'operations_resources', idColumn: 'id', versionColumn: 'version' },
      incident: { table: 'production_incidents', idColumn: 'id', versionColumn: 'version' }, job: { table: 'swarm_job_queue', idColumn: 'id', versionColumn: 'attempt_count' },
      webhook: { table: 'webhook_deliveries', idColumn: 'delivery_id', versionColumn: 'attempt_count' }, automation: { table: 'operations_automation_rules', idColumn: 'id', versionColumn: 'version' },
      environment: { table: 'operations_environments', idColumn: 'id', versionColumn: 'version' }, maintenance: { table: 'operations_maintenance_windows', idColumn: 'id', versionColumn: 'version' },
      migration: { table: 'operations_resources', idColumn: 'id', versionColumn: 'version' }, backup: { table: 'operations_resources', idColumn: 'id', versionColumn: 'version' }, queue: { table: 'operations_resources', idColumn: 'id', versionColumn: 'version' },
      growth_campaign: { table: 'growth_campaigns', idColumn: 'id', versionColumn: 'version' },
    };
    const lookup = lookups[action.target_type];
    if (!lookup) return action.target_type === 'release' ? 1 : null;
    const row = await queryOrThrow<DbRow | null>(this.db.from(lookup.table).select(lookup.versionColumn).eq(lookup.idColumn, action.target_id).eq('user_id', action.user_id).maybeSingle(), 'Target state unavailable');
    return row ? Number(row[lookup.versionColumn]) : null;
  }

  async executeAction(userId: string, actionId: string): Promise<DbRow> {
    const action = await queryOrThrow<DbRow | null>(this.db.from('operations_actions').select('*').eq('id', actionId).maybeSingle(), 'Action unavailable');
    if (!action) throw new OperationsServiceError('not_found', 'Action not found', 404);
    const definition = ACTION_DEFINITIONS[action.action_type];
    const access = await this.access(userId, action.project_id, definition.permission);
    if (action.status === 'verified') return action;
    const currentVersion = await this.currentTargetVersion(action);
    if (currentVersion !== null && currentVersion !== Number(action.target_version)) {
      await this.db.from('operations_action_approvals').update({ decision: 'expired', decided_at: new Date().toISOString() }).eq('action_id', actionId).eq('decision', 'approved');
      await this.db.from('operations_actions').update({ status: 'expired', status_reason: 'target_state_changed', updated_at: new Date().toISOString() }).eq('id', actionId);
      throw new OperationsServiceError('invalid_state', 'Target state changed after this action was planned; create a new action', 409);
    }
    if (definition.confirmationRequired && action.confirmation_digest !== action.action_plan_digest) throw new OperationsServiceError('precondition_failed', 'Action confirmation is missing or stale', 409);
    if (definition.approvalRole) {
      const approval = await queryOrThrow<DbRow | null>(this.db.from('operations_action_approvals').select('*').eq('action_id', actionId).maybeSingle(), 'Approval unavailable');
      if (!approval?.approver_id) throw new OperationsServiceError('approval_required', 'Action approval is required', 409);
      const validity = approvalIsValid({ requesterId: action.requested_by, approverId: approval.approver_id, decision: approval.decision, expiresAt: approval.expires_at, approvedTargetVersion: approval.target_version, currentTargetVersion: action.target_version, approvedPlanDigest: approval.action_plan_digest, currentPlanDigest: action.action_plan_digest });
      if (!validity.valid) throw new OperationsServiceError('invalid_state', validity.reason ?? 'Approval invalid', 409);
    }
    const claimed = await queryOrThrow<DbRow[]>(this.db.rpc('operations_claim_action', { p_action_id: actionId, p_lease_owner: `api:${userId}`, p_lease_seconds: 60 }), 'Action lock unavailable');
    if (!claimed.length) {
      const current = await queryOrThrow<DbRow | null>(this.db.from('operations_actions').select('*').eq('id', actionId).maybeSingle(), 'Action unavailable');
      if (current?.status === 'verified') return current;
      throw new OperationsServiceError('conflict', 'Action is already running or not executable', 409);
    }
    const running = claimed[0];
    const adapter = ['refresh_health','verify_domain','run_synthetic_check'].includes(action.action_type)
      ? this.registry.get('http_verification')
      : this.registry.get('internal_database');
    let result: ProviderResult;
    if (!adapter || !adapter.supportedCapabilities.includes(definition.providerCapability)) {
      result = { status: 'unsupported', safeSummary: 'No working provider adapter supports this action' };
    } else {
      let input = { ...(action.execution_plan ?? {}), userId: access.ownerId, actorId: userId, projectId: action.project_id, environmentId: action.environment_id, targetType: action.target_type, targetId: action.target_id, targetVersion: action.target_version, actionId };
      if (adapter.id === 'http_verification') {
        const resource = await queryOrThrow<DbRow | null>(this.db.from('operations_resources').select('*').eq('id', action.target_id).eq('project_id', action.project_id).eq('user_id', access.ownerId).maybeSingle(), 'Verification target unavailable');
        if (!resource) result = { status: 'blocked', safeSummary: 'Verification target was not found', errorCategory: 'not_found' };
        else {
          try { result = await adapter.execute(definition.providerCapability, { ...input, url: resource.observed_state?.url ?? resource.desired_state?.url, expectedMarker: resource.desired_state?.expectedMarker }); }
          catch { result = { status: 'provider_unavailable', safeSummary: 'Provider execution failed safely', errorCategory: 'provider_unavailable' }; }
        }
      } else {
        try { result = await adapter.execute(definition.providerCapability, input); }
        catch { result = { status: 'failed', safeSummary: 'Operational mutation failed safely', errorCategory: 'action_failed' }; }
      }
    }
    const evidenceId = `ev_${randomUUID()}`;
    await queryOrThrow(this.db.from('production_evidence').insert({ id: evidenceId, user_id: access.ownerId, project_id: action.project_id, environment_id: action.environment_id, action_id: actionId, kind: 'action_verification', source: adapter?.id ?? 'unsupported', status: result.status === 'verified' ? 'verified' : result.status === 'failed' ? 'degraded' : 'blocked', summary: String(redactOperationsValue(result.safeSummary)).slice(0, 500), reference: result.providerReference ?? null, metadata: redactOperationsValue({ errorCategory: result.errorCategory, observedState: result.observedState }), observed_at: new Date().toISOString(), verified_at: result.status === 'verified' ? new Date().toISOString() : null }).select(), 'Evidence write failed');
    const finalStatus = providerResultToStatus(result);
    await queryOrThrow(this.db.from('operations_action_runs').insert({ action_id: actionId, user_id: access.ownerId, attempt: running.attempt_count, provider: adapter?.id ?? 'unsupported', status: finalStatus === 'verified' ? 'verified' : finalStatus === 'blocked' ? 'blocked' : 'failed', error_category: result.errorCategory ?? null, safe_error: result.status === 'verified' ? null : String(redactOperationsValue(result.safeSummary)).slice(0, 500), provider_reference: result.providerReference ?? null, evidence_reference: evidenceId, completed_at: new Date().toISOString() }).select(), 'Action run write failed');
    const updated = await queryOrThrow<DbRow[]>(this.db.from('operations_actions').update({ status: finalStatus, status_reason: result.safeSummary, evidence_reference: evidenceId, completed_at: new Date().toISOString(), lease_owner: null, lease_expires_at: null, updated_at: new Date().toISOString() }).eq('id', actionId).select('*'), 'Action completion failed');
    await this.audit({ userId: access.ownerId, actorId: userId, projectId: action.project_id, environmentId: action.environment_id, action: 'operations.action.completed', targetType: 'action', targetId: actionId, outcome: finalStatus, afterState: result, correlationId: action.idempotency_key, evidenceReference: evidenceId });
    return updated[0];
  }

  private async executeInternal(capability: string, input: Record<string, unknown>): Promise<ProviderResult> {
    const userId = String(input.userId); const projectId = String(input.projectId); const targetId = String(input.targetId);
    const now = new Date().toISOString();
    if (capability === 'acknowledge_incident') {
      const rows = await queryOrThrow<DbRow[]>(this.db.from('production_incidents').update({ status: 'investigating', version: Number(input.targetVersion) + 1, updated_at: now }).eq('id', targetId).eq('project_id', projectId).eq('user_id', userId).in('status', ['detected','open']).eq('version', Number(input.targetVersion)).select('id,status'), 'Incident acknowledgement failed');
      return rows.length ? { status: 'verified', safeSummary: 'Incident acknowledgement persisted and verified' } : { status: 'blocked', safeSummary: 'Incident state no longer permits acknowledgement', errorCategory: 'invalid_state' };
    }
    if (capability === 'resolve_incident') {
      const evidence = typeof input.recoveryEvidenceReference === 'string' ? input.recoveryEvidenceReference : null;
      if (!evidence) return { status: 'blocked', safeSummary: 'Recovery evidence is required before incident resolution', errorCategory: 'verification_required' };
      const rows = await queryOrThrow<DbRow[]>(this.db.from('production_incidents').update({ status: 'resolved', recovery_evidence_reference: evidence, resolved_at: now, version: Number(input.targetVersion) + 1, updated_at: now }).eq('id', targetId).eq('project_id', projectId).eq('user_id', userId).in('status', ['investigating','identified','mitigating','monitoring','acknowledged']).eq('version', Number(input.targetVersion)).select('id,status'), 'Incident resolution failed');
      return rows.length ? { status: 'verified', safeSummary: 'Incident resolution persisted with recovery evidence' } : { status: 'blocked', safeSummary: 'Incident state does not permit resolution', errorCategory: 'invalid_state' };
    }
    if (capability === 'retry_job') {
      const rows = await queryOrThrow<DbRow[]>(this.db.from('swarm_job_queue').update({ status: 'queued', attempt_count: Number(input.targetVersion) + 1, updated_at: now, safe_error: null }).eq('id', targetId).eq('user_id', userId).eq('status', 'failed').lt('attempt_count', 3).select('id,status,attempt_count'), 'Job retry failed');
      return rows.length ? { status: 'verified', safeSummary: 'Job retry was queued exactly once' } : { status: 'blocked', safeSummary: 'Job is not retryable or retry limit was reached', errorCategory: 'invalid_state' };
    }
    if (capability === 'retry_webhook') {
      const rows = await queryOrThrow<DbRow[]>(this.db.from('webhook_deliveries').update({ status: 'processing', attempt_count: Number(input.targetVersion) + 1, updated_at: now, safe_error: null }).eq('delivery_id', targetId).eq('user_id', userId).eq('status', 'failed').select('delivery_id,status,attempt_count'), 'Webhook retry failed');
      return rows.length ? { status: 'verified', safeSummary: 'Webhook reprocessing was queued without duplicating receipt evidence' } : { status: 'blocked', safeSummary: 'Webhook is not eligible for retry', errorCategory: 'invalid_state' };
    }
    if (capability === 'emergency_stop' || capability === 'resume_automation') {
      const stopped = capability === 'emergency_stop';
      let update = this.db.from('operations_automation_rules').update({ emergency_stopped: stopped, version: Number(input.targetVersion) + 1, updated_at: now }).eq('user_id', userId).eq('project_id', projectId);
      if (targetId !== projectId) update = update.eq('id', targetId).eq('version', Number(input.targetVersion));
      const rows = await queryOrThrow<DbRow[]>(update.select('id'), 'Automation control failed');
      return { status: 'verified', safeSummary: `${stopped ? 'Emergency stop enabled' : 'Automation resumed'} for ${rows.length} rule(s)` };
    }
    if (capability === 'enable_automation' || capability === 'disable_automation') {
      const enabled = capability === 'enable_automation';
      const rows = await queryOrThrow<DbRow[]>(this.db.from('operations_automation_rules').update({ enabled, version: Number(input.targetVersion) + 1, updated_at: now }).eq('id', targetId).eq('user_id', userId).eq('project_id', projectId).eq('version', Number(input.targetVersion)).select('id,enabled'), 'Automation rule update failed');
      return rows.length ? { status: 'verified', safeSummary: `Automation rule ${enabled ? 'enabled' : 'disabled'} and verified` } : { status: 'blocked', safeSummary: 'Automation rule changed before this action executed', errorCategory: 'invalid_state' };
    }
    if (capability === 'schedule_maintenance') {
      const startsAt = new Date(String(input.startsAt)); const endsAt = new Date(String(input.endsAt));
      if (!Number.isFinite(startsAt.getTime()) || !Number.isFinite(endsAt.getTime()) || endsAt <= startsAt || endsAt.getTime() - startsAt.getTime() > 31 * 86_400_000) {
        return { status: 'blocked', safeSummary: 'Maintenance timestamps are invalid or exceed 31 days', errorCategory: 'invalid_request' };
      }
      const reason = typeof input.reason === 'string' ? input.reason.trim().slice(0, 500) : '';
      if (reason.length < 3) return { status: 'blocked', safeSummary: 'Maintenance reason is required', errorCategory: 'invalid_request' };
      const rows = await queryOrThrow<DbRow[]>(this.db.from('operations_maintenance_windows').insert({ user_id: userId, project_id: projectId, environment_id: targetId, starts_at: startsAt.toISOString(), ends_at: endsAt.toISOString(), reason, owner_id: String(input.actorId), allowed_actions: Array.isArray(input.allowedActions) ? input.allowedActions : [], blocked_actions: Array.isArray(input.blockedActions) ? input.blockedActions : [] }).select('id,status,version'), 'Maintenance scheduling failed');
      return rows.length ? { status: 'verified', safeSummary: 'Maintenance window persisted and verified', observedState: { maintenanceId: rows[0].id } } : { status: 'failed', safeSummary: 'Maintenance window was not persisted', errorCategory: 'storage_failure' };
    }
    if (capability === 'cancel_maintenance') {
      const rows = await queryOrThrow<DbRow[]>(this.db.from('operations_maintenance_windows').update({ status: 'cancelled', version: Number(input.targetVersion) + 1, updated_at: now }).eq('id', targetId).eq('project_id', projectId).eq('user_id', userId).eq('version', Number(input.targetVersion)).in('status', ['scheduled','active']).select('id,status'), 'Maintenance cancellation failed');
      return rows.length ? { status: 'verified', safeSummary: 'Maintenance cancellation persisted and verified' } : { status: 'blocked', safeSummary: 'Maintenance window changed or is no longer cancellable', errorCategory: 'invalid_state' };
    }
    if (capability === 'execute_growth_campaign') {
      const rows = await queryOrThrow<DbRow[]>(this.db.from('growth_campaigns').update({ status: 'running', version: Number(input.targetVersion) + 1, updated_at: now }).eq('id', targetId).eq('project_id', projectId).eq('tenant_id', userId).eq('version', Number(input.targetVersion)).eq('status', 'approval_required').select('id,status,version'), 'Growth campaign approval failed');
      return rows.length ? { status: 'verified', safeSummary: 'Growth campaign approval persisted; recipient processing may begin' } : { status: 'blocked', safeSummary: 'Campaign changed or is not awaiting approval', errorCategory: 'invalid_state' };
    }
    if (capability === 'prepare_repair') return { status: 'verified', safeSummary: 'Repair request prepared; branch creation, merge, and production promotion remain separate authorised actions', observedState: { command1Boundary: 'approval_required_before_production' } };
    return { status: 'unsupported', safeSummary: `${capability} is not implemented` };
  }

  async listActions(userId: string, projectId: string): Promise<DbRow[]> {
    const access = await this.access(userId, projectId, 'view_product_operations');
    return queryOrThrow(this.db.from('operations_actions').select('id,action_type,target_type,target_id,risk_level,status,status_reason,attempt_count,max_attempts,evidence_reference,created_at,updated_at').eq('user_id', access.ownerId).eq('project_id', projectId).order('created_at', { ascending: false }).limit(100), 'Actions unavailable');
  }

  async listAudit(userId: string, projectId: string, limit: number): Promise<DbRow[]> {
    const access = await this.access(userId, projectId, 'view_operational_audit');
    return queryOrThrow(this.db.from('production_audit_log').select('id,actor_id,action,target_type,target_id,outcome,reason,correlation_id,evidence_reference,created_at').eq('user_id', access.ownerId).eq('project_id', projectId).order('created_at', { ascending: false }).limit(limit), 'Audit history unavailable');
  }

  async listEvidence(userId: string, projectId: string, limit: number): Promise<DbRow[]> {
    const access = await this.access(userId, projectId, 'view_operational_evidence');
    return queryOrThrow(this.db.from('production_evidence').select('id,release_id,environment_id,action_id,kind,source,status,summary,reference,observed_at,verified_at,stale_after').eq('user_id', access.ownerId).eq('project_id', projectId).order('observed_at', { ascending: false }).limit(limit), 'Evidence unavailable');
  }

  async automation(userId: string, projectId: string): Promise<{ rules: DbRow[]; runs: DbRow[] }> {
    const access = await this.access(userId, projectId, 'view_product_operations');
    const [rules, runs] = await Promise.all([
      queryOrThrow<DbRow[]>(this.db.from('operations_automation_rules').select('*').eq('user_id', access.ownerId).eq('project_id', projectId).order('updated_at', { ascending: false }), 'Automation rules unavailable'),
      queryOrThrow<DbRow[]>(this.db.from('operations_automation_runs').select('*,operations_automation_rules!inner(project_id)').eq('user_id', access.ownerId).eq('operations_automation_rules.project_id', projectId).order('started_at', { ascending: false }).limit(100), 'Automation history unavailable'),
    ]);
    return { rules, runs };
  }

  async createAutomationRule(userId: string, projectId: string, input: {
    ruleKey: string; name: string; triggerType: string; riskLevel: RiskLevel; actionType: string;
    conditions: Record<string, unknown>; exclusions: Record<string, unknown>; maxRuns: number; windowSeconds: number; enabled: boolean;
  }): Promise<DbRow> {
    const access = await this.access(userId, projectId, 'manage_automation');
    const definition = ACTION_DEFINITIONS[input.actionType];
    if (!definition) throw new OperationsServiceError('precondition_failed', 'Automation action is unsupported', 400);
    if (['high','critical'].includes(input.riskLevel) && !definition.approvalRole) throw new OperationsServiceError('precondition_failed', 'High-risk automation requires an action with independent approval', 400);
    const rows = await queryOrThrow<DbRow[]>(this.db.from('operations_automation_rules').insert({ user_id: access.ownerId, project_id: projectId, rule_key: input.ruleKey, name: input.name, trigger_type: input.triggerType, risk_level: input.riskLevel, action_type: input.actionType, conditions: redactOperationsValue(input.conditions), exclusions: redactOperationsValue(input.exclusions), rate_limit: { maxRuns: input.maxRuns, windowSeconds: input.windowSeconds }, enabled: input.enabled, approval_policy: definition.approvalRole ? { requiredRole: definition.approvalRole } : {}, verification_plan: { required: true } }).select('*'), 'Automation rule write failed');
    await this.audit({ userId: access.ownerId, actorId: userId, projectId, action: 'operations.automation.created', targetType: 'automation_rule', targetId: rows[0].id, outcome: input.enabled ? 'enabled' : 'disabled', correlationId: randomUUID() });
    return rows[0];
  }

  async evaluateAutomationSignal(userId: string, projectId: string, signal: {
    triggerType: string; triggerId: string; targetType: string; targetId: string; targetVersion: number;
    environmentId?: string; attributes: Record<string, unknown>; evidenceReference?: string;
  }): Promise<DbRow[]> {
    const access = await this.access(userId, projectId, 'manage_automation');
    const rules = await queryOrThrow<DbRow[]>(this.db.from('operations_automation_rules').select('*').eq('user_id', access.ownerId).eq('project_id', projectId).eq('trigger_type', signal.triggerType), 'Automation rules unavailable');
    const windows = await queryOrThrow<DbRow[]>(this.db.from('operations_maintenance_windows').select('starts_at,ends_at,allowed_actions,blocked_actions').eq('user_id', access.ownerId).eq('project_id', projectId), 'Maintenance state unavailable');
    const results: DbRow[] = [];
    for (const rule of rules) {
      const digest = actionPlanDigest({ actionType: rule.action_type, projectId, environmentId: signal.environmentId, targetType: signal.targetType, targetId: `${signal.targetId}:${signal.triggerId}`, targetVersion: signal.targetVersion, idempotencyKey: 'automation', confirmed: true, parameters: signal.attributes });
      const existing = await queryOrThrow<DbRow | null>(this.db.from('operations_automation_runs').select('*').eq('rule_id', rule.id).eq('trigger_digest', digest).maybeSingle(), 'Automation deduplication unavailable');
      const rate = rule.rate_limit ?? {}; const windowSeconds = Math.max(60, Math.min(86_400, Number(rate.windowSeconds ?? 3600))); const maxRuns = Math.max(1, Math.min(20, Number(rate.maxRuns ?? 3)));
      const recent = await queryOrThrow<DbRow[]>(this.db.from('operations_automation_runs').select('id').eq('rule_id', rule.id).gte('started_at', new Date(Date.now() - windowSeconds * 1000).toISOString()), 'Automation rate state unavailable');
      const attributes = signal.attributes ?? {};
      const matches = Object.entries(rule.conditions ?? {}).every(([key, value]) => attributes[key] === value);
      const excluded = Object.entries(rule.exclusions ?? {}).some(([key, value]) => attributes[key] === value);
      const maintenanceBlocked = maintenanceBlocksAction({ actionType: rule.action_type, now: new Date(), windows: windows.map((item) => ({ startsAt: item.starts_at, endsAt: item.ends_at, allowedActions: item.allowed_actions, blockedActions: item.blocked_actions })) });
      let decision = automationDecision({ enabled: Boolean(rule.enabled && matches && !excluded), emergencyStopped: Boolean(rule.emergency_stopped), riskLevel: rule.risk_level, recentRuns: recent.length, maxRuns, maintenanceBlocked, duplicate: Boolean(existing) });
      if (existing) { results.push(existing); continue; }
      const statusMap: Record<string, string> = { execute: 'evaluating', approval_required: 'evaluating', disabled: 'blocked', stopped: 'stopped', rate_limited: 'rate_limited', maintenance_blocked: 'blocked', duplicate: 'blocked' };
      const runRows = await queryOrThrow<DbRow[]>(this.db.from('operations_automation_runs').insert({ user_id: access.ownerId, rule_id: rule.id, trigger_digest: digest, status: statusMap[decision], evidence_reference: signal.evidenceReference ?? null, safe_error: ['execute','approval_required'].includes(decision) ? null : decision, completed_at: ['execute','approval_required'].includes(decision) ? null : new Date().toISOString() }).select('*'), 'Automation run write failed');
      let run = runRows[0];
      if (['execute','approval_required'].includes(decision)) {
        try {
          const action = await this.createAction(userId, { actionType: rule.action_type, projectId, environmentId: signal.environmentId, targetType: signal.targetType, targetId: signal.targetId, targetVersion: signal.targetVersion, idempotencyKey: randomUUID(), confirmed: true, parameters: { triggerId: signal.triggerId, evidenceReference: signal.evidenceReference } });
          const runStatus = action.status === 'approval_required' ? 'approval_required' : action.status === 'verified' ? 'verified' : 'action_created';
          const updated = await queryOrThrow<DbRow[]>(this.db.from('operations_automation_runs').update({ status: runStatus, action_id: action.id, completed_at: action.status === 'verified' ? new Date().toISOString() : null }).eq('id', run.id).select('*'), 'Automation run update failed');
          run = updated[0];
        } catch (error) {
          const safeError = error instanceof OperationsServiceError ? error.code : 'action_failed';
          const updated = await queryOrThrow<DbRow[]>(this.db.from('operations_automation_runs').update({ status: 'failed', safe_error: safeError, completed_at: new Date().toISOString() }).eq('id', run.id).select('*'), 'Automation failure write failed');
          run = updated[0];
        }
      }
      await this.audit({ userId: access.ownerId, actorId: userId, projectId, environmentId: signal.environmentId, action: 'operations.automation.evaluated', targetType: 'automation_run', targetId: run.id, outcome: run.status, reason: run.safe_error ?? undefined, correlationId: digest, evidenceReference: signal.evidenceReference });
      results.push(run);
    }
    return results;
  }

  providerContracts(): ReturnType<ProviderAdapterRegistry['describe']> { return this.registry.describe(); }

  private async audit(input: { userId: string; actorId: string; projectId: string; environmentId?: string | null; action: string; targetType: string; targetId: string; outcome: string; reason?: string; beforeState?: unknown; afterState?: unknown; correlationId: string; evidenceReference?: string }): Promise<void> {
    const { error } = await this.db.from('production_audit_log').insert({
      user_id: input.userId, actor_id: input.actorId, project_id: input.projectId,
      environment_id: input.environmentId ?? null, action: input.action, target_type: input.targetType,
      target_id: input.targetId, outcome: input.outcome, reason: input.reason?.slice(0, 500) ?? null,
      before_state: redactOperationsValue(input.beforeState ?? null), after_state: redactOperationsValue(input.afterState ?? null),
      correlation_id: input.correlationId, evidence_reference: input.evidenceReference ?? null, metadata: {},
    });
    if (error) throw new OperationsServiceError('action_failed', 'Audit evidence could not be stored; action was not accepted as complete', 503);
  }
}
