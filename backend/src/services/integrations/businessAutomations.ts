import { createTenantContext } from '../../security/tenantContext.js';
import { getSupabaseAdmin } from '../../config/supabase.js';
import { isComposioConfigured, upsertComposioTriggerForUser } from './composioClient.js';
import { splitExplicitBusinessWorkflow, type BusinessWorkflowStep } from './businessWorkflow.js';
import { createBusinessWorkflowRun } from './businessWorkflowRuns.js';

export interface BusinessAutomationRule {
  id: string;
  user_id: string;
  name: string;
  request: string;
  steps: BusinessWorkflowStep[];
  schedule_kind: 'interval' | 'trigger';
  interval_seconds: number | null;
  trigger_id: string | null;
  enabled: boolean;
  next_run_at: string | null;
  last_run_at: string | null;
}

export interface BusinessAutomationEvent {
  id: string;
  rule_id: string;
  status: 'claimed' | 'started' | 'failed';
  workflow_run_id: string | null;
  created_at: string;
}

function validRule(value: unknown): value is BusinessAutomationRule {
  if (!value || typeof value !== 'object') return false;
  const row = value as Record<string, unknown>;
  return typeof row.id === 'string'
    && typeof row.user_id === 'string'
    && typeof row.request === 'string'
    && Array.isArray(row.steps)
    && (row.schedule_kind === 'interval' || row.schedule_kind === 'trigger');
}

function explicitSteps(request: string): BusinessWorkflowStep[] {
  const steps = splitExplicitBusinessWorkflow(request);
  if (!steps) throw new Error('Automations need two to four explicit connected-app steps, including an action.');
  return steps;
}

export async function createBusinessAutomationRule(userId: string, input: {
  name: string;
  request: string;
  schedule: { kind: 'interval'; intervalSeconds: number } | { kind: 'trigger'; toolkit: string; triggerSlug: string; triggerConfig: Record<string, unknown> };
}): Promise<BusinessAutomationRule> {
  const name = input.name.trim();
  const request = input.request.trim();
  if (name.length < 3 || name.length > 120 || request.length < 8 || request.length > 1_500) throw new Error('Provide a short name and an explicit workflow request.');
  if (!isComposioConfigured()) throw new Error('Composio must be configured before creating an app automation.');
  const steps = explicitSteps(request);
  let triggerId: string | null = null;
  let intervalSeconds: number | null = null;
  if (input.schedule.kind === 'interval') {
    intervalSeconds = input.schedule.intervalSeconds;
    if (!Number.isInteger(intervalSeconds) || intervalSeconds < 3_600 || intervalSeconds > 2_592_000) throw new Error('The interval must be between one hour and 30 days.');
  } else {
    if (!process.env.COMPOSIO_WEBHOOK_SECRET?.trim()) throw new Error('A signed Composio webhook must be configured before event automations can be created.');
    triggerId = await upsertComposioTriggerForUser(userId, input.schedule);
  }
  const { data, error } = await getSupabaseAdmin()
    .from('business_automation_rules')
    .insert({
      user_id: userId,
      name,
      request,
      steps,
      schedule_kind: input.schedule.kind,
      interval_seconds: intervalSeconds,
      trigger_id: triggerId,
      enabled: false,
      next_run_at: null,
    })
    .select('*')
    .single();
  if (error || !validRule(data)) throw new Error('Automation could not be saved. It was not enabled.');
  return data;
}

export async function listBusinessAutomationRules(userId: string): Promise<BusinessAutomationRule[]> {
  const { data, error } = await getSupabaseAdmin()
    .from('business_automation_rules')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(100);
  if (error) throw new Error('Automations could not be loaded.');
  return (data ?? []).filter(validRule);
}

export async function listBusinessAutomationEvents(userId: string): Promise<BusinessAutomationEvent[]> {
  const { data, error } = await getSupabaseAdmin()
    .from('business_automation_events')
    .select('id,rule_id,status,workflow_run_id,created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(50);
  if (error) throw new Error('Automation history could not be loaded.');
  return (data ?? []).filter((item): item is BusinessAutomationEvent =>
    typeof item.id === 'string' && typeof item.rule_id === 'string'
    && typeof item.status === 'string' && typeof item.created_at === 'string');
}

export async function setBusinessAutomationEnabled(userId: string, ruleId: string, enabled: boolean): Promise<BusinessAutomationRule> {
  const { data: existing, error: readError } = await getSupabaseAdmin()
    .from('business_automation_rules')
    .select('*')
    .eq('id', ruleId)
    .eq('user_id', userId)
    .maybeSingle();
  if (readError || !validRule(existing)) throw new Error('Automation not found.');
  if (enabled && existing.schedule_kind === 'trigger' && !process.env.COMPOSIO_WEBHOOK_SECRET?.trim()) throw new Error('Signed Composio webhook delivery is not configured.');
  const now = Date.now();
  const nextRunAt = enabled && existing.schedule_kind === 'interval'
    ? new Date(now + (existing.interval_seconds ?? 3_600) * 1_000).toISOString()
    : null;
  const { data, error } = await getSupabaseAdmin()
    .from('business_automation_rules')
    .update({ enabled, next_run_at: nextRunAt, updated_at: new Date(now).toISOString() })
    .eq('id', ruleId)
    .eq('user_id', userId)
    .select('*')
    .single();
  if (error || !validRule(data)) throw new Error('Automation could not be changed.');
  return data;
}

async function claimEvent(rule: BusinessAutomationRule, eventKey: string): Promise<string | null> {
  const { data, error } = await getSupabaseAdmin()
    .from('business_automation_events')
    .insert({ rule_id: rule.id, user_id: rule.user_id, event_key: eventKey.slice(0, 200) })
    .select('id')
    .maybeSingle();
  if (error?.code === '23505') return null;
  if (error || !data?.id) throw new Error('Automation event could not be claimed.');
  return String(data.id);
}

async function launchRule(rule: BusinessAutomationRule, eventKey: string, initialEvidence?: { toolkit: string; toolSlug: string; data: string }): Promise<void> {
  const eventId = await claimEvent(rule, eventKey);
  if (!eventId) return;
  try {
    const progress = await createBusinessWorkflowRun(createTenantContext({ userId: rule.user_id, via: 'persisted_owner' }), rule.request, rule.steps, initialEvidence);
    const { error } = await getSupabaseAdmin().from('business_automation_events')
      .update({ status: 'started', workflow_run_id: progress.run.id })
      .eq('id', eventId)
      .eq('user_id', rule.user_id);
    if (error) throw new Error('The automation run was created, but its event record could not be updated.');
  } catch {
    await getSupabaseAdmin().from('business_automation_events')
      .update({ status: 'failed' })
      .eq('id', eventId)
      .eq('user_id', rule.user_id);
  }
}

export async function processDueBusinessAutomations(): Promise<void> {
  if (!isComposioConfigured()) return;
  const now = new Date().toISOString();
  const { data, error } = await getSupabaseAdmin()
    .from('business_automation_rules')
    .select('*')
    .eq('enabled', true)
    .eq('schedule_kind', 'interval')
    .lte('next_run_at', now)
    .order('next_run_at', { ascending: true })
    .limit(10);
  if (error) throw new Error('Scheduled app automations could not be loaded.');
  for (const candidate of data ?? []) {
    if (!validRule(candidate) || !candidate.next_run_at || !candidate.interval_seconds) continue;
    const nextRun = new Date(Date.now() + candidate.interval_seconds * 1_000).toISOString();
    const { data: claimed, error: claimError } = await getSupabaseAdmin()
      .from('business_automation_rules')
      .update({ next_run_at: nextRun, last_run_at: now, updated_at: now })
      .eq('id', candidate.id)
      .eq('user_id', candidate.user_id)
      .eq('enabled', true)
      .eq('next_run_at', candidate.next_run_at)
      .select('id')
      .maybeSingle();
    if (claimError || !claimed) continue;
    await launchRule(candidate, `interval:${candidate.next_run_at}`);
  }
}

export async function handleBusinessAutomationTrigger(input: {
  triggerId: string;
  userId: string;
  eventKey: string;
  triggerSlug: string;
  payload: unknown;
}): Promise<void> {
  const { data, error } = await getSupabaseAdmin()
    .from('business_automation_rules')
    .select('*')
    .eq('trigger_id', input.triggerId)
    .eq('user_id', input.userId)
    .eq('enabled', true)
    .maybeSingle();
  if (error) throw new Error('Triggered automation could not be loaded.');
  if (!validRule(data)) return;
  const eventData = JSON.stringify(input.payload ?? {});
  if (eventData.length > 8_000) throw new Error('Trigger data is too large for a bounded workflow.');
  await launchRule(data, `trigger:${input.eventKey}`, { toolkit: input.triggerSlug.split('_')[0]?.toLowerCase() ?? 'app', toolSlug: input.triggerSlug, data: eventData });
}

let polling = false;
export function startBusinessAutomationScheduler(): () => void {
  const timer = setInterval(() => {
    if (polling) return;
    polling = true;
    void processDueBusinessAutomations()
      .catch((error) => console.warn('[businessAutomations] Scheduler cycle failed:', error instanceof Error ? error.message : 'unknown'))
      .finally(() => { polling = false; });
  }, 60_000);
  timer.unref();
  return () => clearInterval(timer);
}
