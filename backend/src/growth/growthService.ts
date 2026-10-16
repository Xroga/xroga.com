import { createHash } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { getSupabaseAdmin } from '../config/supabase.js';
import { OperationsService, OperationsServiceError } from '../operations/operationsService.js';
import { activationSatisfied, deterministicVariant, experimentResult, recommendationDecision, redactGrowthPayload, validateEventName } from './growthEngine.js';

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
    if (!validateEventName(input.name)) throw new GrowthServiceError('invalid_event', 'Event name is not registered or versioned', 400);
    const { tenantId } = await this.access(userId, input.projectId);
    const existing = await query<Row | null>(this.db.from('analytics_events').select('*').eq('tenant_id', tenantId).eq('idempotency_key', input.idempotencyKey).maybeSingle(), 'Event deduplication unavailable', null);
    if (existing) {
      if (existing.project_id !== input.projectId) throw new GrowthServiceError('idempotency_conflict', 'Event key cannot be reused for this project', 409);
      return { event: existing, duplicate: true };
    }
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
    const version = Number(input.name.match(/\.v([0-9]+)$/)?.[1] ?? 0);
    const rows = await query<Row[]>(this.db.from('analytics_events').insert({ user_id: userId, tenant_id: tenantId, project_id: input.projectId, event_type: input.name, event_version: version, idempotency_key: input.idempotencyKey, environment: input.environment, anonymous_id: input.anonymousId ?? null, session_id: input.sessionId ?? null, release_id: input.releaseId ?? null, deployment_id: input.deploymentId ?? null, campaign_id: input.campaignId ?? null, referral_id: input.referralId ?? null, experiment_id: input.experimentId ?? null, consent_state: input.consentState, source: input.source.slice(0, 80), evidence_reference: input.evidenceReference.slice(0, 500), metadata: redactGrowthPayload(input.metadata ?? {}), occurred_at: input.occurredAt ?? new Date().toISOString() }).select('*'), 'Event could not be recorded');
    return { event: rows[0], duplicate: false };
  }

  async linkIdentity(userId: string, input: { projectId: string; anonymousId: string; evidenceReference: string }): Promise<Row> {
    const { tenantId } = await this.access(userId, input.projectId);
    const rows = await query<Row[]>(this.db.from('growth_identity_links').upsert({ tenant_id: tenantId, project_id: input.projectId, anonymous_id: input.anonymousId, user_id: userId, evidence_reference: input.evidenceReference }, { onConflict: 'tenant_id,project_id,anonymous_id' }).select('*'), 'Identity link failed');
    return rows[0];
  }

  async defineActivation(userId: string, input: { projectId: string; name: string; version: number; requiredEvents: string[] }): Promise<Row> {
    const { tenantId } = await this.access(userId, input.projectId, 'manage');
    if (!input.requiredEvents.length || input.requiredEvents.some((name) => !validateEventName(name) || name === 'onboarding.started.v1')) throw new GrowthServiceError('invalid_activation', 'Activation requires registered meaningful outcome events', 400);
    const rows = await query<Row[]>(this.db.from('growth_activation_definitions').upsert({ tenant_id: tenantId, project_id: input.projectId, name: input.name, version: input.version, required_event_names: input.requiredEvents, minimum_distinct_events: input.requiredEvents.length, active: true }, { onConflict: 'project_id,version' }).select('*'), 'Activation definition failed');
    return rows[0];
  }

  async evaluateActivation(userId: string, projectId: string, subjectUserId = userId): Promise<{ activated: boolean; lifecycle: Row | null; reason: string }> {
    const { tenantId } = await this.access(userId, projectId);
    const definition = await query<Row | null>(this.db.from('growth_activation_definitions').select('*').eq('tenant_id', tenantId).eq('project_id', projectId).eq('active', true).order('version', { ascending: false }).limit(1).maybeSingle(), 'Activation definition unavailable', null);
    if (!definition) return { activated: false, lifecycle: null, reason: 'not_configured' };
    const [events, deployment] = await Promise.all([
      query<Row[]>(this.db.from('analytics_events').select('event_type').eq('tenant_id', tenantId).eq('project_id', projectId).eq('user_id', subjectUserId), 'Activation events unavailable'),
      query<Row | null>(this.db.from('deployment_status').select('id,status,verification_state').eq('user_id', tenantId).eq('project_id', projectId).order('created_at', { ascending: false }).limit(1).maybeSingle(), 'Deployment evidence unavailable', null),
    ]);
    const deploymentVerified = ['verified','production_verified','succeeded'].includes(String(deployment?.verification_state ?? deployment?.status));
    const activated = activationSatisfied(definition.required_event_names, events.map((item) => item.event_type), deploymentVerified);
    if (!activated) return { activated: false, lifecycle: null, reason: deploymentVerified ? 'required_events_missing' : 'deployment_unverified' };
    const evidenceReference = `activation:${definition.id}:${deployment!.id}`;
    const rows = await query<Row[]>(this.db.from('growth_lifecycle_state').upsert({ tenant_id: tenantId, project_id: projectId, subject_type: 'user', subject_id: subjectUserId, lifecycle_state: 'activated', activation_definition_id: definition.id, evidence_reference: evidenceReference, transitioned_at: new Date().toISOString() }, { onConflict: 'project_id,subject_type,subject_id' }).select('*'), 'Activation state failed');
    return { activated: true, lifecycle: rows[0], reason: 'evidence_verified' };
  }

  async recommend(userId: string, input: { projectId: string; consent: boolean }): Promise<Row> {
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
    const { tenantId } = await this.access(userId, input.projectId, 'manage');
    const existing = await query<Row | null>(this.db.from('growth_lifecycle_state').select('version').eq('project_id', input.projectId).eq('subject_type', input.subjectType).eq('subject_id', input.subjectId).maybeSingle(), 'Lifecycle state unavailable', null);
    const rows = await query<Row[]>(this.db.from('growth_lifecycle_state').upsert({ tenant_id: tenantId, project_id: input.projectId, subject_type: input.subjectType, subject_id: input.subjectId, lifecycle_state: input.state, version: Number(existing?.version ?? 0) + 1, evidence_reference: input.evidenceReference, transitioned_at: new Date().toISOString() }, { onConflict: 'project_id,subject_type,subject_id' }).select('*'), 'Lifecycle transition failed');
    return rows[0];
  }

  async suppress(userId: string, input: { projectId: string; channel: 'email'|'in_app'; address: string; reason: 'unsubscribed'|'bounced'|'complained'|'manual'|'consent_denied'; evidenceReference: string }): Promise<Row> {
    const { tenantId } = await this.access(userId, input.projectId, 'manage');
    const rows = await query<Row[]>(this.db.from('growth_suppressions').upsert({ tenant_id: tenantId, project_id: input.projectId, channel: input.channel, address_hash: hash(input.address.trim().toLowerCase()), reason: input.reason, source_evidence: input.evidenceReference }, { onConflict: 'tenant_id,channel,address_hash' }).select('id,project_id,channel,reason,source_evidence,created_at'), 'Suppression could not be stored');
    return rows[0];
  }

  async recordAttribution(userId: string, input: { projectId: string; anonymousId?: string; touchType: 'first'|'recent'|'utm'|'referral'|'unknown'; source?: string; medium?: string; campaign?: string; evidenceReference: string }): Promise<Row> {
    const { tenantId } = await this.access(userId, input.projectId);
    const rows = await query<Row[]>(this.db.from('growth_attribution_touches').insert({ tenant_id: tenantId, project_id: input.projectId, user_id: userId, anonymous_id: input.anonymousId ?? null, touch_type: input.touchType, source: input.source?.slice(0, 120) ?? null, medium: input.medium?.slice(0, 120) ?? null, campaign: input.campaign?.slice(0, 120) ?? null, evidence_reference: input.evidenceReference }).select('*'), 'Attribution could not be recorded');
    return rows[0];
  }

  async createSegment(userId: string, input: { projectId: string; name: string; lifecycleStates: string[] }): Promise<Row> {
    const { tenantId } = await this.access(userId, input.projectId, 'manage');
    if (!input.lifecycleStates.length) throw new GrowthServiceError('invalid_segment', 'At least one lifecycle state is required');
    const rows = await query<Row[]>(this.db.from('growth_segments').insert({ tenant_id: tenantId, project_id: input.projectId, name: input.name, definition: { lifecycleStates: input.lifecycleStates }, status: 'active' }).select('*'), 'Segment could not be stored');
    return rows[0];
  }

  async createCampaign(userId: string, input: { projectId: string; segmentId: string; name: string; channel: 'email'|'in_app'; templateKey: string; idempotencyKey: string }): Promise<{ campaign: Row; action: Row }> {
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
    const action = await this.operations.createAction(userId, { actionType: 'execute_growth_campaign', projectId: input.projectId, targetType: 'growth_campaign', targetId: campaign.id, targetVersion: campaign.version, idempotencyKey: input.idempotencyKey, confirmed: true, parameters: { campaignId: campaign.id, recipientPolicy: 'consented_and_not_suppressed' } });
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
    const { tenantId } = await this.access(userId, input.projectId, 'manage');
    deterministicVariant({ experimentId: 'validation', subjectKey: 'validation', seed: input.seed, variants: input.variants });
    const rows = await query<Row[]>(this.db.from('growth_experiments').insert({ tenant_id: tenantId, project_id: input.projectId, key: input.key, status: 'running', variants: input.variants, allocation_seed: input.seed, minimum_sample_size: input.minimumSampleSize }).select('*'), 'Experiment could not be stored');
    return rows[0];
  }

  async assignExperiment(userId: string, experimentId: string, subjectKey: string): Promise<Row> {
    const experiment = await query<Row | null>(this.db.from('growth_experiments').select('*').eq('id', experimentId).maybeSingle(), 'Experiment unavailable', null);
    if (!experiment) throw new GrowthServiceError('not_found', 'Experiment not found', 404);
    const { tenantId } = await this.access(userId, experiment.project_id);
    if (experiment.tenant_id !== tenantId) throw new GrowthServiceError('not_found', 'Experiment not found', 404);
    const existing = await query<Row | null>(this.db.from('growth_experiment_assignments').select('*').eq('experiment_id', experimentId).eq('tenant_id', tenantId).eq('subject_key', subjectKey).maybeSingle(), 'Assignment unavailable', null);
    if (existing) return existing;
    const variant = deterministicVariant({ experimentId, subjectKey, seed: experiment.allocation_seed, variants: experiment.variants });
    const rows = await query<Row[]>(this.db.from('growth_experiment_assignments').insert({ experiment_id: experimentId, tenant_id: tenantId, subject_key: subjectKey, variant }).select('*'), 'Assignment failed');
    return rows[0];
  }

  async exposeExperiment(userId: string, assignmentId: string, evidenceReference: string): Promise<Row> {
    const assignment = await query<Row | null>(this.db.from('growth_experiment_assignments').select('*,growth_experiments(project_id,tenant_id)').eq('id', assignmentId).maybeSingle(), 'Assignment unavailable', null);
    if (!assignment?.growth_experiments) throw new GrowthServiceError('not_found', 'Assignment not found', 404);
    const { tenantId } = await this.access(userId, assignment.growth_experiments.project_id);
    if (assignment.tenant_id !== tenantId || assignment.growth_experiments.tenant_id !== tenantId) throw new GrowthServiceError('not_found', 'Assignment not found', 404);
    const rows = await query<Row[]>(this.db.from('growth_experiment_assignments').update({ exposed_at: new Date().toISOString(), evidence_reference: evidenceReference }).eq('id', assignmentId).eq('tenant_id', tenantId).eq('experiment_id', assignment.experiment_id).is('exposed_at', null).select('*'), 'Exposure could not be recorded');
    if (!rows.length) return assignment;
    return rows[0];
  }

  async recordExperimentOutcome(userId: string, input: { experimentId: string; assignmentId: string; eventId: string; metricKey: string }): Promise<Row> {
    const experiment = await query<Row | null>(this.db.from('growth_experiments').select('project_id,tenant_id').eq('id', input.experimentId).maybeSingle(), 'Experiment unavailable', null);
    if (!experiment) throw new GrowthServiceError('not_found', 'Experiment not found', 404);
    const { tenantId } = await this.access(userId, experiment.project_id);
    if (experiment.tenant_id !== tenantId) throw new GrowthServiceError('not_found', 'Experiment not found', 404);
    const assignment = await query<Row | null>(this.db.from('growth_experiment_assignments').select('id,exposed_at').eq('id', input.assignmentId).eq('experiment_id', input.experimentId).eq('tenant_id', tenantId).maybeSingle(), 'Assignment unavailable', null);
    if (!assignment?.exposed_at) throw new GrowthServiceError('invalid_state', 'Outcome requires recorded exposure', 409);
    const event = await query<Row | null>(this.db.from('analytics_events').select('id').eq('id', input.eventId).eq('tenant_id', tenantId).eq('project_id', experiment.project_id).eq('experiment_id', input.experimentId).maybeSingle(), 'Outcome event unavailable', null);
    if (!event) throw new GrowthServiceError('not_found', 'Outcome event not found', 404);
    const rows = await query<Row[]>(this.db.from('growth_experiment_outcomes').upsert({ experiment_id: input.experimentId, assignment_id: input.assignmentId, event_id: input.eventId, metric_key: input.metricKey }, { onConflict: 'assignment_id,event_id,metric_key' }).select('*'), 'Experiment outcome failed');
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
