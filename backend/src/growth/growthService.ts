import { createHash } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import type { SupabaseClient } from '@supabase/supabase-js';
import { getSupabaseAdmin } from '../config/supabase.js';
import { OperationsService, OperationsServiceError } from '../operations/operationsService.js';
import { hasOperationsPermission } from '../operations/permissions.js';
import type { OperationsRole } from '../operations/types.js';
import { deterministicVariant, experimentResult, recommendationDecision, redactGrowthPayload, validateEventName } from './growthEngine.js';

type Row = Record<string, any>;

export class GrowthServiceError extends Error {
  constructor(public readonly code: string, message: string, public readonly statusCode = 400) { super(message); }
}

async function query<T = Row[]>(promise: PromiseLike<{ data: T | null; error: any }>, message: string, missing: T = [] as T): Promise<T> {
  const { data, error } = await promise;
  if (error) throw new GrowthServiceError('storage_unavailable', message, 503);
  return data ?? missing;
}

function hash(value: string): string { return createHash('sha256').update(value).digest('hex'); }

export class GrowthService {
  private readonly operations: OperationsService;
  constructor(private readonly db: SupabaseClient = getSupabaseAdmin()) { this.operations = new OperationsService(db); }

  private async access(userId: string, projectId: string, permission: 'view' | 'manage' = 'view'): Promise<{ tenantId: string; permissions: string[] }> {
    let result;
    try { result = await this.operations.permissions(userId, projectId); }
    catch (error) {
      if (error instanceof OperationsServiceError) throw new GrowthServiceError(error.code, error.message, error.statusCode);
      throw error;
    }
    if (permission === 'manage' && !result.permissions.includes('manage_automation')) throw new GrowthServiceError('forbidden', 'Growth management is not permitted', 403);
    if (typeof result.ownerId !== 'string' || !result.ownerId) throw new GrowthServiceError('storage_unavailable', 'Project ownership could not be verified', 503);
    return { tenantId: result.ownerId, permissions: result.permissions };
  }

  async overview(userId: string, projectId: string): Promise<Record<string, unknown>> {
    const { tenantId } = await this.access(userId, projectId);
    const [lifecycle, recommendations, campaigns, messages, segments, experiments, attribution, events] = await Promise.all([
      query(this.db.from('growth_lifecycle_state').select('*').eq('tenant_id', tenantId).eq('project_id', projectId).order('transitioned_at', { ascending: false }).limit(100), 'Lifecycle unavailable'),
      query(this.db.from('growth_recommendations').select('*').eq('tenant_id', tenantId).eq('project_id', projectId).order('priority', { ascending: false }).limit(50), 'Recommendations unavailable'),
      query(this.db.from('growth_campaigns').select('*').eq('tenant_id', tenantId).eq('project_id', projectId).order('created_at', { ascending: false }).limit(50), 'Campaigns unavailable'),
      query(this.db.from('growth_messages').select('id,campaign_id,channel,provider,status,attempt_count,evidence_reference,created_at,updated_at').eq('tenant_id', tenantId).eq('project_id', projectId).order('created_at', { ascending: false }).limit(100), 'Messages unavailable'),
      query(this.db.from('growth_segments').select('*').eq('tenant_id', tenantId).eq('project_id', projectId).order('created_at', { ascending: false }).limit(50), 'Segments unavailable'),
      query(this.db.from('growth_experiments').select('*').eq('tenant_id', tenantId).eq('project_id', projectId).order('created_at', { ascending: false }).limit(50), 'Experiments unavailable'),
      query(this.db.from('growth_attribution_touches').select('*').eq('tenant_id', tenantId).eq('project_id', projectId).order('occurred_at', { ascending: false }).limit(100), 'Attribution unavailable'),
      query(this.db.from('analytics_events').select('id,event_type,event_version,environment,consent_state,evidence_reference,occurred_at').eq('tenant_id', tenantId).eq('project_id', projectId).order('occurred_at', { ascending: false }).limit(100), 'Events unavailable'),
    ]);
    return { lifecycle, recommendations, campaigns, messages, segments, experiments, attribution, events, providerStates: { resend: process.env.RESEND_API_KEY ? 'configured_unverified' : 'external_setup_required', brevo: process.env.BREVO_API_KEY ? 'configured_unverified' : 'external_setup_required', inApp: 'available' } };
  }

  async recordEvent(userId: string, input: { projectId: string; name: string; idempotencyKey: string; environment: 'test'|'preview'|'production'; anonymousId?: string; sessionId?: string; releaseId?: string; deploymentId?: string; campaignId?: string; referralId?: string; experimentId?: string; consentState: 'granted'|'denied'|'unknown'|'not_required'; source: string; evidenceReference: string; metadata?: Record<string, unknown>; occurredAt?: string }): Promise<{ event: Row; duplicate: boolean }> {
    // Keep the admitted intent stable across ownership and database awaits.
    try { input = JSON.parse(JSON.stringify(input)); }
    catch { throw new GrowthServiceError('invalid_event', 'Event payload is invalid', 400); }
    if (!validateEventName(input.name)) throw new GrowthServiceError('invalid_event', 'Event name is not registered or versioned', 400);
    const payload = { user_id: userId, project_id: input.projectId, event_type: input.name,
      event_version: Number(input.name.match(/\.v([0-9]+)$/)?.[1] ?? 0), idempotency_key: input.idempotencyKey,
      environment: input.environment, anonymous_id: input.anonymousId ?? null, session_id: input.sessionId ?? null,
      release_id: input.releaseId ?? null, deployment_id: input.deploymentId ?? null, campaign_id: input.campaignId ?? null,
      referral_id: input.referralId ?? null, experiment_id: input.experimentId ?? null, consent_state: input.consentState,
      source: input.source.slice(0,80), evidence_reference: input.evidenceReference.slice(0,500), metadata: redactGrowthPayload(input.metadata ?? {}) };
    const { tenantId } = await this.access(userId, input.projectId);
    const matches = (row: Row) => row.tenant_id === tenantId && typeof row.id === 'string' && !!row.id
      && Object.entries(payload).every(([key,value]) => isDeepStrictEqual(row[key],value))
      && (!input.occurredAt || Date.parse(row.occurred_at) === Date.parse(input.occurredAt));
    const existing = await query<Row | null>(this.db.from('analytics_events').select('*').eq('tenant_id', tenantId).eq('idempotency_key', input.idempotencyKey).maybeSingle(), 'Event deduplication unavailable', null);
    if (existing && !matches(existing)) throw new GrowthServiceError('idempotency_conflict', 'Event key cannot be reused for a different event', 409);
    if (input.experimentId) {
      const experiment = await query<Row | null>(this.db.from('growth_experiments').select('id').eq('id', input.experimentId).eq('tenant_id', tenantId).eq('project_id', input.projectId).maybeSingle(), 'Event experiment unavailable', null);
      if (!experiment) throw new GrowthServiceError('not_found', 'Event experiment not found', 404);
    }
    if (input.campaignId) {
      const campaign = await query<Row | null>(this.db.from('growth_campaigns').select('id').eq('id', input.campaignId).eq('tenant_id', tenantId).eq('project_id', input.projectId).maybeSingle(), 'Event campaign unavailable', null);
      if (!campaign) throw new GrowthServiceError('not_found', 'Event campaign not found', 404);
    }
    if (input.referralId) {
      // A platform referral UUID alone is not authority for this product. Use
      // the existing server-owned project attribution, without inferring a new
      // qualification or reward policy from either referral participant.
      const attribution = await query<Row | null>(this.db.from('growth_referral_attribution')
        .select('tenant_id,project_id,referral_id').eq('tenant_id', tenantId)
        .eq('project_id', input.projectId).eq('referral_id', input.referralId).maybeSingle(),
      'Event referral unavailable', null);
      if (!attribution || attribution.tenant_id !== tenantId || attribution.project_id !== input.projectId
        || attribution.referral_id !== input.referralId) {
        throw new GrowthServiceError('not_found', 'Event referral not found', 404);
      }
    }
    const roles:OperationsRole[]=['viewer','operator','release_manager','recovery_manager','admin'];
    const {data:receipt,error}=await this.db.rpc('record_growth_event',{
      p_actor:userId,p_tenant:tenantId,p_project:input.projectId,p_intent:payload,p_occurred_at:input.occurredAt??null,
      p_allowed_roles:roles.filter(role=>hasOperationsPermission(role,'view_product_operations')),
    });
    if(error?.code==='42501')throw new GrowthServiceError('forbidden','Event recording is not permitted',403);
    if(error?.code==='P0002')throw new GrowthServiceError('not_found','Event reference not found',404);
    if(error?.code==='23505')throw new GrowthServiceError('idempotency_conflict','Event key cannot be reused for a different event',409);
    if(['22023','22P02','22007','22008'].includes(error?.code??''))throw new GrowthServiceError('invalid_event','Event admission is invalid',400);
    if(error||!receipt||typeof receipt.duplicate!=='boolean'||!receipt.event
      ||!matches(receipt.event)||typeof receipt.event.occurred_at!=='string'||!Number.isFinite(Date.parse(receipt.event.occurred_at))){
      throw new GrowthServiceError('storage_unavailable','Event persistence could not be verified',503);
    }
    return {event:receipt.event,duplicate:receipt.duplicate};
  }

  async linkIdentity(userId: string, input: { projectId: string; anonymousId: string; evidenceReference: string }): Promise<Row> {
    input = { projectId: input.projectId, anonymousId: input.anonymousId, evidenceReference: input.evidenceReference };
    const { tenantId } = await this.access(userId, input.projectId);
    const binding = { tenant_id: tenantId, project_id: input.projectId, anonymous_id: input.anonymousId, user_id: userId };
    const roles:OperationsRole[]=['viewer','operator','release_manager','recovery_manager','admin'];
    const {data:row,error}=await this.db.rpc('link_growth_identity',{p_actor:userId,p_tenant:tenantId,p_project:input.projectId,
      p_anonymous:input.anonymousId,p_evidence:input.evidenceReference,p_allowed_roles:roles.filter(role=>hasOperationsPermission(role,'view_product_operations'))});
    if(error?.code==='42501')throw new GrowthServiceError('forbidden','Identity linking is not permitted',403);
    if(error?.code==='23505')throw new GrowthServiceError('identity_conflict','Identity binding could not be claimed',409);
    if(error?.code==='22023')throw new GrowthServiceError('invalid_identity','Identity admission is invalid',400);
    if (error || !row || Array.isArray(row) || typeof row.id !== 'string' || !row.id || Object.entries(binding).some(([key, value]) => row[key] !== value)
      || row.evidence_reference !== input.evidenceReference) throw new GrowthServiceError('storage_unavailable', 'Identity link receipt could not be verified', 503);
    return row;
  }

  async defineActivation(userId: string, input: { projectId: string; name: string; version: number; requiredEvents: string[] }): Promise<Row> {
    input = { ...input, requiredEvents: [...input.requiredEvents] };
    const { tenantId } = await this.access(userId, input.projectId, 'manage');
    if (!input.requiredEvents.length || input.requiredEvents.some((name) => !validateEventName(name) || name === 'onboarding.started.v1')) throw new GrowthServiceError('invalid_activation', 'Activation requires registered meaningful outcome events', 400);
    const roles:OperationsRole[]=['viewer','operator','release_manager','recovery_manager','admin'];
    const {data:rows,error}=await this.db.rpc('define_growth_activation',{
      p_actor:userId,p_tenant:tenantId,p_project:input.projectId,p_name:input.name,p_version:input.version,p_events:input.requiredEvents,
      p_allowed_roles:roles.filter(role=>hasOperationsPermission(role,'manage_automation')),
    });
    if(error?.code==='42501')throw new GrowthServiceError('forbidden','Growth management is not permitted',403);
    if(error?.code==='40001')throw new GrowthServiceError('conflict','Activation definition ownership changed',409);
    if(error?.code==='22023'||error?.code==='22003')throw new GrowthServiceError('invalid_activation','Activation definition is invalid',400);
    if(error||!Array.isArray(rows)||rows.length!==1||typeof rows[0]?.id!=='string'||!rows[0].id
      ||rows[0].tenant_id!==tenantId||rows[0].project_id!==input.projectId||rows[0].name!==input.name||rows[0].version!==input.version
      ||!isDeepStrictEqual(rows[0].required_event_names,input.requiredEvents)||rows[0].minimum_distinct_events!==input.requiredEvents.length||rows[0].active!==true){
      throw new GrowthServiceError('storage_unavailable','Activation definition persistence could not be verified',503);
    }
    return rows[0];
  }

  async evaluateActivation(userId: string, projectId: string, subjectUserId = userId): Promise<{ activated: boolean; lifecycle: Row | null; reason: string }> {
    const { tenantId } = await this.access(userId, projectId);
    const roles:OperationsRole[]=['viewer','operator','release_manager','recovery_manager','admin'];
    const {data:receipt,error}=await this.db.rpc('evaluate_growth_activation',{
      p_actor:userId,p_tenant:tenantId,p_project:projectId,p_subject:subjectUserId,
      p_allowed_roles:roles.filter(role=>hasOperationsPermission(role,'view_product_operations')),
    });
    if(error?.code==='42501')throw new GrowthServiceError('forbidden','Activation evaluation is not permitted',403);
    if(error?.code==='40001')throw new GrowthServiceError('conflict','Activation lifecycle ownership changed',409);
    if(error?.code==='22023')throw new GrowthServiceError('invalid_activation','Activation evaluation is invalid',400);
    if(error||!receipt||typeof receipt.activated!=='boolean')throw new GrowthServiceError('storage_unavailable','Activation evaluation could not be verified',503);
    if(!receipt.activated){
      if(receipt.lifecycle!==null||!['not_configured','required_events_missing','deployment_unverified'].includes(receipt.reason)){
        throw new GrowthServiceError('storage_unavailable','Activation evaluation could not be verified',503);
      }
      return {activated:false,lifecycle:null,reason:receipt.reason};
    }
    const row=receipt.lifecycle,basis=receipt.basis;
    if(receipt.reason!=='evidence_verified'||!row||typeof row.id!=='string'||!row.id||row.tenant_id!==tenantId||row.project_id!==projectId
      ||row.subject_type!=='user'||row.subject_id!==subjectUserId||row.lifecycle_state!=='activated'
      ||!basis||typeof basis.definitionId!=='string'||!basis.definitionId||typeof basis.deploymentId!=='string'||!basis.deploymentId
      ||row.activation_definition_id!==basis.definitionId||row.evidence_reference!==`activation:${basis.definitionId}:${basis.deploymentId}`
      ||!Number.isSafeInteger(row.version)||row.version<1||typeof row.transitioned_at!=='string'||!Number.isFinite(Date.parse(row.transitioned_at))){
      throw new GrowthServiceError('storage_unavailable','Activation lifecycle persistence could not be verified',503);
    }
    return {activated:true,lifecycle:row,reason:'evidence_verified'};
  }

  async recommend(userId: string, input: { projectId: string; consent: boolean }): Promise<Row> {
    input = { ...input };
    const { tenantId } = await this.access(userId, input.projectId);
    const [incidents, deployment, lifecycle, suppression] = await Promise.all([
      query<Row[]>(this.db.from('production_incidents').select('id,severity,status').eq('user_id', tenantId).eq('project_id', input.projectId).not('status', 'in', '(resolved,closed,cancelled)'), 'Incident state unavailable'),
      query<Row | null>(this.db.from('deployment_status').select('id,status,verification_state').eq('user_id', tenantId).eq('project_id', input.projectId).order('created_at', { ascending: false }).limit(1).maybeSingle(), 'Deployment state unavailable', null),
      query<Row | null>(this.db.from('growth_lifecycle_state').select('lifecycle_state,evidence_reference').eq('tenant_id', tenantId).eq('project_id', input.projectId).eq('subject_type', 'user').eq('subject_id', userId).maybeSingle(), 'Lifecycle state unavailable', null),
      query<Row | null>(this.db.from('growth_suppressions').select('id').eq('tenant_id', tenantId).eq('channel', 'email').eq('address_hash', hash(userId)).maybeSingle(), 'Suppression state unavailable', null),
    ]);
    const critical = incidents.some((item) => ['critical','sev0','sev1'].includes(String(item.severity).toLowerCase()));
    const deploymentVerified = ['verified','production_verified','succeeded'].includes(String(deployment?.verification_state ?? deployment?.status));
    const decision = recommendationDecision({ criticalIncident: critical, deploymentVerified, activated: lifecycle?.lifecycle_state === 'activated' || lifecycle?.lifecycle_state === 'retained', consent: input.consent, suppressed: Boolean(suppression) });
    const evidenceReference = critical ? `incident:${incidents[0].id}` : deployment ? `deployment:${deployment.id}` : 'deployment:missing';
    const rows = await query<Row[]>(this.db.from('growth_recommendations').insert({ tenant_id: tenantId, project_id: input.projectId, recommendation_type: decision.type, priority: decision.priority, status: decision.status, blocker_category: decision.blocker, rationale: decision.blocker ? `Growth is gated by ${decision.blocker}` : 'Next action is eligible from verified lifecycle state', action_plan: decision.type === 'prepare_operational_repair' ? { operation: 'prepare_repair' } : { operation: decision.type }, evidence_reference: evidenceReference }).select('*'), 'Recommendation could not be persisted');
    return rows[0];
  }

  async transitionLifecycle(userId: string, input: { projectId: string; subjectType: 'user'|'product'; subjectId: string; state: string; evidenceReference: string }): Promise<Row> {
    input = { ...input };
    const { tenantId } = await this.access(userId, input.projectId, 'manage');
    const roles:OperationsRole[]=['viewer','operator','release_manager','recovery_manager','admin'];
    const {data:rows,error}=await this.db.rpc('transition_growth_lifecycle',{
      p_actor:userId,p_tenant:tenantId,p_project:input.projectId,p_subject_type:input.subjectType,p_subject:input.subjectId,
      p_state:input.state,p_evidence:input.evidenceReference,p_allowed_roles:roles.filter(role=>hasOperationsPermission(role,'manage_automation')),
    });
    if(error?.code==='42501')throw new GrowthServiceError('forbidden','Lifecycle transition is not permitted',403);
    if(error?.code==='40001')throw new GrowthServiceError('conflict','Lifecycle ownership or version changed',409);
    if(error?.code==='22023')throw new GrowthServiceError('invalid_lifecycle','Lifecycle transition is invalid',400);
    if(error||!Array.isArray(rows)||rows.length!==1||typeof rows[0]?.id!=='string'||!rows[0].id||rows[0].tenant_id!==tenantId
      ||rows[0].project_id!==input.projectId||rows[0].subject_type!==input.subjectType||rows[0].subject_id!==input.subjectId
      ||rows[0].lifecycle_state!==input.state||rows[0].evidence_reference!==input.evidenceReference||!Number.isSafeInteger(rows[0].version)||rows[0].version<1
      ||typeof rows[0].transitioned_at!=='string'||!Number.isFinite(Date.parse(rows[0].transitioned_at))){
      throw new GrowthServiceError('storage_unavailable','Lifecycle transition persistence could not be verified',503);
    }
    return rows[0];
  }

  async suppress(userId: string, input: { projectId: string; channel: 'email'|'in_app'; address: string; reason: 'unsubscribed'|'bounced'|'complained'|'manual'|'consent_denied'; evidenceReference: string }): Promise<Row> {
    input = { ...input };
    const { tenantId } = await this.access(userId, input.projectId, 'manage');
    const rows = await query<Row[]>(this.db.from('growth_suppressions').upsert({ tenant_id: tenantId, project_id: input.projectId, channel: input.channel, address_hash: hash(input.address.trim().toLowerCase()), reason: input.reason, source_evidence: input.evidenceReference }, { onConflict: 'tenant_id,channel,address_hash' }).select('id,project_id,channel,reason,source_evidence,created_at'), 'Suppression could not be stored');
    return rows[0];
  }

  async recordAttribution(userId: string, input: { projectId: string; anonymousId?: string; touchType: 'first'|'recent'|'utm'|'referral'|'unknown'; source?: string; medium?: string; campaign?: string; evidenceReference: string }): Promise<Row> {
    input = { ...input };
    const { tenantId } = await this.access(userId, input.projectId);
    const rows = await query<Row[]>(this.db.from('growth_attribution_touches').insert({ tenant_id: tenantId, project_id: input.projectId, user_id: userId, anonymous_id: input.anonymousId ?? null, touch_type: input.touchType, source: input.source?.slice(0, 120) ?? null, medium: input.medium?.slice(0, 120) ?? null, campaign: input.campaign?.slice(0, 120) ?? null, evidence_reference: input.evidenceReference }).select('*'), 'Attribution could not be recorded');
    return rows[0];
  }

  async createSegment(userId: string, input: { projectId: string; name: string; lifecycleStates: string[] }): Promise<Row> {
    input = { ...input, lifecycleStates: [...input.lifecycleStates] };
    const { tenantId } = await this.access(userId, input.projectId, 'manage');
    if (!input.lifecycleStates.length) throw new GrowthServiceError('invalid_segment', 'At least one lifecycle state is required');
    const rows = await query<Row[]>(this.db.from('growth_segments').insert({ tenant_id: tenantId, project_id: input.projectId, name: input.name, definition: { lifecycleStates: input.lifecycleStates }, status: 'active' }).select('*'), 'Segment could not be stored');
    return rows[0];
  }

  async createCampaign(userId: string, input: { projectId: string; segmentId: string; name: string; channel: 'email'|'in_app'; templateKey: string; idempotencyKey: string }): Promise<{ campaign: Row; action: Row }> {
    input = { ...input };
    const { tenantId } = await this.access(userId, input.projectId, 'manage');
    const segment = await query<Row | null>(this.db.from('growth_segments').select('id').eq('id', input.segmentId).eq('tenant_id', tenantId).eq('project_id', input.projectId).eq('status', 'active').maybeSingle(), 'Segment unavailable', null);
    if (!segment) throw new GrowthServiceError('not_found', 'Segment not found', 404);
    if (input.channel === 'email' && !process.env.RESEND_API_KEY && !process.env.BREVO_API_KEY) throw new GrowthServiceError('external_setup_required', 'No email provider is configured', 409);
    const rows = await query<Row[]>(this.db.from('growth_campaigns').insert({ tenant_id: tenantId, project_id: input.projectId, segment_id: input.segmentId, name: input.name, channel: input.channel, status: 'approval_required', template_key: input.templateKey, consent_required: true }).select('*'), 'Campaign could not be stored');
    const campaign = rows[0];
    if (rows.length !== 1 || !campaign || typeof campaign.id !== 'string' || !campaign.id
      || campaign.tenant_id !== tenantId || campaign.project_id !== input.projectId || campaign.segment_id !== input.segmentId
      || campaign.channel !== input.channel || campaign.name !== input.name || campaign.template_key !== input.templateKey
      || campaign.consent_required !== true || campaign.status !== 'approval_required' || !Number.isSafeInteger(campaign.version) || campaign.version < 1) {
      throw new GrowthServiceError('storage_unavailable', 'Campaign creation could not be verified', 503);
    }
    let action: Row;
    try {
      action = await this.operations.createAction(userId, { actionType: 'execute_growth_campaign', projectId: input.projectId, targetType: 'growth_campaign', targetId: campaign.id, targetVersion: campaign.version, idempotencyKey: input.idempotencyKey, confirmed: true, parameters: { campaignId: campaign.id, recipientPolicy: 'consented_and_not_suppressed' } });
    } catch (error) {
      if (error instanceof OperationsServiceError && error.code === 'conflict') {
        throw new GrowthServiceError('idempotency_conflict', 'Campaign action does not match the requested campaign', 409);
      }
      throw error;
    }
    if (!action || typeof action.id !== 'string' || !action.id || action.user_id !== tenantId || action.project_id !== input.projectId
      || action.requested_by !== userId || action.action_type !== 'execute_growth_campaign' || action.target_type !== 'growth_campaign'
      || action.target_id !== campaign.id || action.target_version !== campaign.version || action.idempotency_key !== input.idempotencyKey) {
      throw new GrowthServiceError('idempotency_conflict', 'Campaign action does not match the requested campaign', 409);
    }
    const reference = `operations_action:${action.id}`;
    const linked = await query<Row[]>(this.db.from('growth_campaigns').update({ approval_id: null, evidence_reference: reference })
      .eq('id', campaign.id).eq('tenant_id', tenantId).eq('project_id', input.projectId)
      .eq('version', campaign.version).eq('status', 'approval_required').select('*'), 'Campaign action link failed');
    const receipt = linked[0];
    if (linked.length !== 1 || !receipt || receipt.id !== campaign.id || receipt.tenant_id !== tenantId
      || receipt.project_id !== input.projectId || receipt.version !== campaign.version || receipt.status !== 'approval_required'
      || receipt.segment_id !== campaign.segment_id || receipt.channel !== campaign.channel || receipt.name !== campaign.name
      || receipt.template_key !== campaign.template_key || receipt.consent_required !== true
      || receipt.evidence_reference !== reference || receipt.approval_id !== null) {
      throw new GrowthServiceError('storage_unavailable', 'Campaign action link could not be verified', 503);
    }
    return { campaign: receipt, action };
  }

  async processCampaign(userId: string, campaignId: string): Promise<{ queued: number; suppressed: number; duplicate: number }> {
    const campaign = await query<Row | null>(this.db.from('growth_campaigns').select('*').eq('id', campaignId).maybeSingle(), 'Campaign unavailable', null);
    if (!campaign) throw new GrowthServiceError('not_found', 'Campaign not found', 404);
    const { tenantId } = await this.access(userId, campaign.project_id, 'manage');
    if (campaign.tenant_id !== tenantId || !['running','completed'].includes(campaign.status)) throw new GrowthServiceError('approval_required', 'Campaign requires a verified operations approval', 409);
    if (campaign.channel !== 'in_app') throw new GrowthServiceError('external_setup_required', 'Configured email delivery adapter is required', 409);
    const segment = await query<Row | null>(this.db.from('growth_segments').select('definition').eq('id', campaign.segment_id).eq('tenant_id', tenantId).eq('project_id', campaign.project_id).eq('status', 'active').maybeSingle(), 'Segment unavailable', null);
    if (!segment) throw new GrowthServiceError('not_found', 'Segment not found', 404);
    const { data, error } = await this.db.rpc('process_growth_in_app_campaign', { p_actor: userId, p_campaign: campaignId });
    if (error?.code === '42501' || error?.code === 'P0002') throw new GrowthServiceError('not_found', 'Campaign unavailable', 404);
    if (error?.code === 'P0001') throw new GrowthServiceError('approval_required', 'Campaign approval or delivery recovery is required', 409);
    if (error?.code === '0A000') throw new GrowthServiceError('external_setup_required', 'Configured email delivery adapter is required', 409);
    if (error || !data || data.campaign_id !== campaignId || data.tenant_id !== tenantId || data.project_id !== campaign.project_id
      || data.status !== 'completed' || data.version !== campaign.version + (campaign.status === 'running' ? 1 : 0)
      || typeof data.replayed !== 'boolean' || ['queued','suppressed','duplicate'].some(key => !Number.isSafeInteger(data[key]) || data[key] < 0)
      || data.queued + data.suppressed + data.duplicate > 500) {
      throw new GrowthServiceError('storage_unavailable', 'Campaign delivery receipt could not be verified', 503);
    }
    return { queued: data.queued, suppressed: data.suppressed, duplicate: data.duplicate };
  }

  async createExperiment(userId: string, input: { projectId: string; key: string; seed: string; variants: Array<{ key: string; weight: number }>; minimumSampleSize: number }): Promise<Row> {
    input = { ...input, variants: input.variants.map(variant => ({ ...variant })) };
    const { tenantId } = await this.access(userId, input.projectId, 'manage');
    deterministicVariant({ experimentId: 'validation', subjectKey: 'validation', seed: input.seed, variants: input.variants });
    const rows = await query<Row[]>(this.db.from('growth_experiments').insert({ tenant_id: tenantId, project_id: input.projectId, key: input.key, status: 'running', variants: input.variants, allocation_seed: input.seed, minimum_sample_size: input.minimumSampleSize }).select('*'), 'Experiment could not be stored');
    return rows[0];
  }

  async assignExperiment(userId: string, experimentId: string, subjectKey: string): Promise<Row> {
    const loaded = await query<Row | null>(this.db.from('growth_experiments').select('*').eq('id', experimentId).maybeSingle(), 'Experiment unavailable', null);
    if (!loaded || loaded.id!==experimentId) throw new GrowthServiceError('not_found', 'Experiment not found', 404);
    const experiment=structuredClone(loaded);
    const { tenantId } = await this.access(userId, experiment.project_id);
    if (experiment.tenant_id !== tenantId) throw new GrowthServiceError('not_found', 'Experiment not found', 404);
    let variant:string|null=null;
    try{variant=deterministicVariant({experimentId,subjectKey,seed:experiment.allocation_seed,variants:experiment.variants});}catch{/* Existing cohort replay must not be reassigned from changed configuration. */}
    const roles:OperationsRole[]=['viewer','operator','release_manager','recovery_manager','admin'];
    const {data:receipt,error}=await this.db.rpc('assign_growth_experiment',{
      p_actor:userId,p_tenant:tenantId,p_project:experiment.project_id,p_expected:experiment,p_subject:subjectKey,p_variant:variant,
      p_allowed_roles:roles.filter(role=>hasOperationsPermission(role,'view_product_operations')),
    });
    if(error?.code==='42501')throw new GrowthServiceError('forbidden','Experiment assignment is not permitted',403);
    if(error?.code==='P0002')throw new GrowthServiceError('not_found','Experiment assignment unavailable',404);
    if(error?.code==='40001')throw new GrowthServiceError('conflict','Experiment assignment changed',409);
    if(error?.code==='22023')throw new GrowthServiceError('invalid_experiment','Experiment has no eligible assignment',400);
    const row=receipt?.assignment;
    if(error||!receipt||typeof receipt.replayed!=='boolean'||!row||typeof row.id!=='string'||!row.id||row.experiment_id!==experimentId
      ||row.tenant_id!==tenantId||row.subject_key!==subjectKey||typeof row.variant!=='string'||!row.variant
      ||typeof row.assigned_at!=='string'||!Number.isFinite(Date.parse(row.assigned_at))
      ||(row.exposed_at!==null&&(typeof row.exposed_at!=='string'||!Number.isFinite(Date.parse(row.exposed_at))))
      ||(row.evidence_reference!==null&&typeof row.evidence_reference!=='string')
      ||(!receipt.replayed&&(row.variant!==variant||row.exposed_at!==null||row.evidence_reference!==null))){
      throw new GrowthServiceError('storage_unavailable','Experiment assignment could not be verified',503);
    }
    return row;
  }

  async exposeExperiment(userId: string, assignmentId: string, evidenceReference: string): Promise<Row> {
    const loaded = await query<Row | null>(this.db.from('growth_experiment_assignments').select('*,growth_experiments(project_id,tenant_id)').eq('id', assignmentId).maybeSingle(), 'Assignment unavailable', null);
    if (!loaded?.growth_experiments || loaded.id!==assignmentId) throw new GrowthServiceError('not_found', 'Assignment not found', 404);
    const assignment=structuredClone(loaded);
    const { tenantId } = await this.access(userId, assignment.growth_experiments.project_id);
    if (assignment.tenant_id !== tenantId || assignment.growth_experiments.tenant_id !== tenantId) throw new GrowthServiceError('not_found', 'Assignment not found', 404);
    const roles:OperationsRole[]=['viewer','operator','release_manager','recovery_manager','admin'];
    const {data:receipt,error}=await this.db.rpc('expose_growth_experiment',{
      p_actor:userId,p_tenant:tenantId,p_project:assignment.growth_experiments.project_id,p_expected:assignment,p_evidence:evidenceReference,
      p_allowed_roles:roles.filter(role=>hasOperationsPermission(role,'view_product_operations')),
    });
    if(error?.code==='42501')throw new GrowthServiceError('forbidden','Experiment exposure is not permitted',403);
    if(error?.code==='P0002')throw new GrowthServiceError('not_found','Experiment exposure unavailable',404);
    if(error?.code==='40001')throw new GrowthServiceError('conflict','Experiment exposure changed',409);
    if(error?.code==='22023')throw new GrowthServiceError('invalid_exposure','Invalid experiment exposure',400);
    const row=receipt?.assignment;
    if(error||!receipt||typeof receipt.replayed!=='boolean'||!row
      ||!['id','experiment_id','tenant_id','subject_key','variant'].every(key=>typeof row[key]==='string'&&!!row[key]&&row[key]===assignment[key])
      ||typeof row.assigned_at!=='string'||!Number.isFinite(Date.parse(row.assigned_at))||Date.parse(row.assigned_at)!==Date.parse(assignment.assigned_at)
      ||typeof row.exposed_at!=='string'||!Number.isFinite(Date.parse(row.exposed_at))
      ||(row.evidence_reference!==null&&typeof row.evidence_reference!=='string')
      ||(!receipt.replayed&&row.evidence_reference!==evidenceReference)
      ||(assignment.exposed_at!==null&&(!receipt.replayed||Date.parse(row.exposed_at)!==Date.parse(assignment.exposed_at)||row.evidence_reference!==assignment.evidence_reference))){
      throw new GrowthServiceError('storage_unavailable','Experiment exposure could not be verified',503);
    }
    return row;
  }

  async recordExperimentOutcome(userId: string, input: { experimentId: string; assignmentId: string; eventId: string; metricKey: string }): Promise<Row> {
    input = { ...input };
    const experiment = await query<Row | null>(this.db.from('growth_experiments').select('project_id,tenant_id').eq('id', input.experimentId).maybeSingle(), 'Experiment unavailable', null);
    if (!experiment) throw new GrowthServiceError('not_found', 'Experiment not found', 404);
    const { tenantId } = await this.access(userId, experiment.project_id);
    if (experiment.tenant_id !== tenantId) throw new GrowthServiceError('not_found', 'Experiment not found', 404);
    const assignment = await query<Row | null>(this.db.from('growth_experiment_assignments').select('id,exposed_at').eq('id', input.assignmentId).eq('experiment_id', input.experimentId).eq('tenant_id', tenantId).maybeSingle(), 'Assignment unavailable', null);
    if (!assignment?.exposed_at) throw new GrowthServiceError('invalid_state', 'Outcome requires recorded exposure', 409);
    const event = await query<Row | null>(this.db.from('analytics_events').select('id').eq('id', input.eventId).eq('tenant_id', tenantId).eq('project_id', experiment.project_id).eq('experiment_id', input.experimentId).maybeSingle(), 'Outcome event unavailable', null);
    if (!event) throw new GrowthServiceError('not_found', 'Outcome event not found', 404);
    const { data: rows, error } = await this.db.rpc('record_growth_experiment_outcome', {
      p_actor: userId, p_tenant: tenantId, p_project: experiment.project_id, p_experiment: input.experimentId,
      p_assignment: input.assignmentId, p_event: input.eventId, p_metric: input.metricKey,
    });
    if (error?.code === 'P0002') throw new GrowthServiceError('not_found', 'Experiment outcome parent unavailable', 404);
    if (error?.code === '42501') throw new GrowthServiceError('forbidden', 'Experiment recording is not permitted', 403);
    if (error?.code === 'P0001') throw new GrowthServiceError('invalid_state', 'Outcome requires recorded exposure', 409);
    if (error?.code === '40001') throw new GrowthServiceError('conflict', 'Experiment outcome changed', 409);
    if (error?.code === '22023') throw new GrowthServiceError('invalid_request', 'Invalid experiment outcome', 400);
    if (error || !Array.isArray(rows) || rows.length !== 1 || typeof rows[0]?.id !== 'string' || !rows[0].id
      || rows[0].experiment_id !== input.experimentId || rows[0].assignment_id !== input.assignmentId
      || rows[0].event_id !== input.eventId || rows[0].metric_key !== input.metricKey) {
      throw new GrowthServiceError('storage_unavailable', 'Experiment outcome could not be verified', 503);
    }
    return rows[0];
  }

  async experimentResult(userId: string, experimentId: string): Promise<Record<string, unknown>> {
    const experiment = await query<Row | null>(this.db.from('growth_experiments').select('*').eq('id', experimentId).maybeSingle(), 'Experiment unavailable', null);
    if (!experiment) throw new GrowthServiceError('not_found', 'Experiment not found', 404);
    const { tenantId } = await this.access(userId, experiment.project_id);
    if (experiment.tenant_id !== tenantId) throw new GrowthServiceError('not_found', 'Experiment not found', 404);
    const [assignments, outcomes] = await Promise.all([
      query<Row[]>(this.db.from('growth_experiment_assignments').select('id,variant').eq('experiment_id', experimentId).eq('tenant_id', tenantId), 'Assignments unavailable'),
      query<Row[]>(this.db.from('growth_experiment_outcomes').select('assignment_id').eq('experiment_id', experimentId), 'Outcomes unavailable'),
    ]);
    const assignmentById = new Map(assignments.map((item) => [item.id, item.variant]));
    const counts: Record<string, number> = {};
    for (const outcome of outcomes) { const variant = assignmentById.get(outcome.assignment_id); if (variant) counts[variant] = (counts[variant] ?? 0) + 1; }
    return experimentResult({ assignmentCount: assignments.length, minimumSampleSize: experiment.minimum_sample_size, outcomeCounts: counts });
  }
}
