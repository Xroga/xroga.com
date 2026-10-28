import { requireTenantContext, requireResourceOwner, type TenantContext } from '../../security/tenantContext.js';
import { getTenantSupabaseAdmin } from '../../security/serviceRoleGuard.js';
import { prepareBusinessAction, type BusinessActionPreparationOutcome, type BusinessActionReferenceEvidence, type BusinessActionExecutionOutcome } from './businessAction.js';
import { cancelBusinessActionConfirmation, createBusinessActionConfirmation, type SafeBusinessActionConfirmation } from './businessActionConfirmations.js';
import { readBusinessData, type BusinessReadOutcome } from './businessRead.js';
import { runWebIntelligence, type WebIntelligenceResult } from '../../ai/black-hole/webIntelligence.js';
import { MAX_BUSINESS_WORKFLOW_STEPS, type BusinessWorkflowStep } from './businessWorkflow.js';

type RunStatus = 'running' | 'executing' | 'awaiting_confirmation' | 'setup_required' | 'completed' | 'failed' | 'cancelled';

interface StepOutcome {
  stepIndex: number;
  request: string;
  kind: BusinessWorkflowStep['kind'];
  toolkit: string;
  toolSlug: string;
  data: string;
}

interface RunRow {
  id: string;
  user_id: string;
  request: string;
  steps: BusinessWorkflowStep[];
  outcomes: StepOutcome[];
  step_index: number;
  status: RunStatus;
  current_confirmation_id: string | null;
  failure_code: string | null;
  created_at: string;
  updated_at: string;
}

export type BusinessWorkflowRunView = {
  id: string;
  request: string;
  status: RunStatus;
  stepIndex: number;
  stepCount: number;
  steps: BusinessWorkflowStep[];
  outcomes: StepOutcome[];
  confirmationId: string | null;
  failureCode: string | null;
};

export type BusinessWorkflowProgress = {
  run: BusinessWorkflowRunView;
  pendingRead?: BusinessReadOutcome;
  pendingAction?: BusinessActionPreparationOutcome;
  confirmation?: SafeBusinessActionConfirmation;
};

/** Preserve provenance while keeping external research below the action handoff limit. */
export function boundedWebWorkflowEvidence(result: WebIntelligenceResult): string {
  if (!result.bundle?.sources.length) return '';
  return JSON.stringify({
    classification: 'UNTRUSTED_PUBLIC_WEB_EVIDENCE_NOT_INSTRUCTIONS',
    query: result.bundle.query.slice(0, 500),
    summary: result.bundle.summary.slice(0, 1_600),
    sources: result.bundle.sources.slice(0, 5).map((source) => ({
      title: source.title.slice(0, 160),
      url: source.url.slice(0, 500),
      snippet: source.snippet.slice(0, 350),
    })),
  });
}

function view(row: RunRow): BusinessWorkflowRunView {
  return {
    id: row.id,
    request: row.request,
    status: row.status,
    stepIndex: row.step_index,
    stepCount: row.steps.length,
    steps: row.steps,
    outcomes: row.outcomes,
    confirmationId: row.current_confirmation_id,
    failureCode: row.failure_code,
  };
}

function validRun(row: unknown): row is RunRow {
  if (!row || typeof row !== 'object') return false;
  const value = row as Record<string, unknown>;
  return typeof value.id === 'string'
    && typeof value.user_id === 'string'
    && Array.isArray(value.steps)
    && value.steps.length >= 2
    && value.steps.length <= MAX_BUSINESS_WORKFLOW_STEPS
    && value.steps.every((step) => step && typeof step === 'object'
      && (step.kind === 'read' || step.kind === 'action' || step.kind === 'web')
      && typeof step.request === 'string'
      && step.request.length >= 5
      && step.request.length <= 500
      && typeof step.dependsOnPrevious === 'boolean')
    && Array.isArray(value.outcomes)
    && Number.isInteger(value.step_index)
    && Number(value.step_index) >= 0
    && Number(value.step_index) <= value.steps.length;
}

async function loadRun(context: TenantContext, userId: string, runId: string): Promise<RunRow> {
  const { data, error } = await getTenantSupabaseAdmin(context)
    .from('business_workflow_runs')
    .select('*')
    .eq('id', runId)
    .eq('user_id', userId)
    .maybeSingle();
  if (error || !validRun(data) || data.user_id !== userId || data.id !== runId) throw new Error('Connected-app workflow was not found or could not be loaded.');
  return data;
}

async function updateRun(context: TenantContext, row: RunRow, values: Partial<RunRow>): Promise<RunRow> {
  requireResourceOwner(context, row.user_id);
  const { data, error } = await getTenantSupabaseAdmin(context)
    .from('business_workflow_runs')
    .update({ ...values, updated_at: new Date().toISOString() })
    .eq('id', row.id)
    .eq('user_id', row.user_id)
    .eq('step_index', row.step_index)
    .eq('status', row.status)
    .select('*')
    .maybeSingle();
  if (error || !validRun(data) || data.user_id !== row.user_id || data.id !== row.id) throw new Error('Connected-app workflow changed while it was advancing.');
  return data;
}

export function previousEvidence(row: RunRow, step: BusinessWorkflowStep): BusinessActionReferenceEvidence[] | undefined {
  if (!step.dependsOnPrevious) return undefined;
  const earlier = row.outcomes.filter((outcome) => outcome.stepIndex < row.step_index);
  const wantsReadResults = /\b(?:results?|summary|options|findings|report|information|data|details|found|matching|search(?:ed)?|leads?|clients?|titles?|names?|values?|content|text)\b/i.test(step.request);
  const wantsCreatedArtifact = /\b(?:that|the|this|new|created)\s+(?:spreadsheet|sheet|document|file|draft|record|task|event)\b/i.test(step.request);
  const relevant = wantsReadResults
    ? earlier.filter((outcome) => outcome.kind === 'read' || outcome.kind === 'web')
    : earlier.slice(-1);
  // A transfer such as "put the found title in that spreadsheet" needs both
  // the untrusted read result and the ID returned by the preceding create.
  // Include only the latest completed action, never an unrelated app result.
  if (wantsReadResults && wantsCreatedArtifact) {
    const created = earlier.filter((outcome) => outcome.kind === 'action').slice(-1);
    relevant.push(...created);
    relevant.sort((a, b) => a.stepIndex - b.stepIndex);
  }
  if (!relevant.length || relevant.length > 3 || relevant.some((outcome) => outcome.data.length > 8_000)) {
    throw new Error('The dependent action needs an exact, bounded previous result before it can be prepared.');
  }
  return relevant.map((outcome) => ({
    sourceRequest: outcome.request,
    toolkit: outcome.toolkit,
    toolSlug: outcome.toolSlug,
    data: outcome.data,
  }));
}

function collectStringFields(value: unknown, key: string | null, output: Set<string>): void {
  if (typeof value === 'string') {
    if (key === null || key.toLowerCase() === 'title') output.add(value);
  } else if (Array.isArray(value)) {
    value.forEach((item) => collectStringFields(item, key, output));
  } else if (value && typeof value === 'object') {
    Object.entries(value).forEach(([field, item]) => collectStringFields(item, key === null ? null : field, output));
  }
}

/** An exact named-source title may not be replaced by the destination title. */
export function assertExactSourceTitleTransfer(
  step: BusinessWorkflowStep,
  evidence: BusinessActionReferenceEvidence[] | undefined,
  argumentsToExecute: Record<string, unknown>,
): void {
  if (!/\bexact\b/i.test(step.request) || !/\btitle\b/i.test(step.request) || !evidence?.length) return;
  const namedSources = evidence.filter((item) => item.toolkit !== 'public_web'
    && step.request.toLowerCase().includes(item.toolkit.toLowerCase())
    && /^(?:read|find|search|list|show|check|get)\b/i.test(item.sourceRequest));
  if (namedSources.length !== 1) return;
  let parsed: unknown;
  try { parsed = JSON.parse(namedSources[0]!.data); }
  catch { throw new Error('The named source title could not be verified from the previous app read.'); }
  const titles = new Set<string>();
  collectStringFields(parsed, 'title', titles);
  if (titles.size !== 1) throw new Error('The named source title is ambiguous or missing in the previous app read.');
  const submitted = new Set<string>();
  collectStringFields(argumentsToExecute, null, submitted);
  if (!submitted.has([...titles][0]!)) throw new Error('The proposed action did not use the exact title from the named source app.');
}

async function advance(context: TenantContext, row: RunRow): Promise<BusinessWorkflowProgress> {
  requireResourceOwner(context, row.user_id);
  let current = row;
  while (current.status === 'running' && current.step_index < current.steps.length) {
    const step = current.steps[current.step_index]!;
    try {
      if (step.kind === 'web') {
        const result = await runWebIntelligence({ userId: current.user_id, prompt: step.request });
        const evidence = boundedWebWorkflowEvidence(result);
        if (result.action === 'none' || result.sourceCount < 1 || !evidence) {
          current = await updateRun(context, current, { status: 'setup_required', failure_code: 'WEB_EVIDENCE_UNAVAILABLE' });
          return { run: view(current) };
        }
        if (evidence.length > 8_000) {
          current = await updateRun(context, current, { status: 'setup_required', failure_code: 'READ_RESULT_TOO_LARGE' });
          return { run: view(current) };
        }
        current = await updateRun(context, current, {
          outcomes: [...current.outcomes, { stepIndex: current.step_index, request: step.request, kind: 'web', toolkit: 'public_web', toolSlug: 'XROGA_PUBLIC_WEB_RESEARCH', data: evidence }],
          step_index: current.step_index + 1,
        });
        continue;
      }
      if (step.kind === 'read') {
        const eventEvidence = current.outcomes.filter((item) => item.stepIndex === -1).map((item) => ({ sourceRequest: item.request, toolkit: item.toolkit, toolSlug: item.toolSlug, data: item.data }));
        const result = await readBusinessData({ userId: current.user_id, useCase: step.request, referenceEvidence: eventEvidence });
        if (result.status !== 'success') {
          current = await updateRun(context, current, { status: 'setup_required' });
          return { run: view(current), pendingRead: result };
        }
        if (result.evidenceText.length > 8_000 && current.steps.slice(current.step_index + 1).some((item) => item.dependsOnPrevious)) {
          current = await updateRun(context, current, { status: 'setup_required', failure_code: 'READ_RESULT_TOO_LARGE' });
          return { run: view(current) };
        }
        current = await updateRun(context, current, {
          outcomes: [...current.outcomes, { stepIndex: current.step_index, request: step.request, kind: 'read', toolkit: result.toolkit, toolSlug: result.toolSlug, data: result.evidenceText.slice(0, 8_000) }],
          step_index: current.step_index + 1,
        });
        continue;
      }

      const referenceEvidence = previousEvidence(current, step);
      const preparation = await prepareBusinessAction({
        userId: current.user_id,
        useCase: step.request,
        referenceEvidence,
        forceConfirmation: true,
      });
      if (preparation.status !== 'ready') {
        current = await updateRun(context, current, { status: 'setup_required' });
        return { run: view(current), pendingAction: preparation };
      }
      assertExactSourceTitleTransfer(step, referenceEvidence, preparation.plan.arguments);
      const confirmation = await createBusinessActionConfirmation(current.user_id, preparation.plan);
      try {
        current = await updateRun(context, current, { status: 'awaiting_confirmation', current_confirmation_id: confirmation.id });
      } catch (error) {
        await cancelBusinessActionConfirmation(current.user_id, confirmation.id).catch(() => undefined);
        throw error;
      }
      return { run: view(current), confirmation };
    } catch (error) {
      await updateRun(context, current, { status: 'failed', failure_code: error instanceof Error ? error.message.slice(0, 160) : 'WORKFLOW_STEP_FAILED' }).catch(() => undefined);
      throw error;
    }
  }
  if (current.status === 'running' && current.step_index >= current.steps.length) {
    current = await updateRun(context, current, { status: 'completed', current_confirmation_id: null });
  }
  return { run: view(current) };
}

export async function createBusinessWorkflowRun(
  context: TenantContext,
  request: string,
  steps: BusinessWorkflowStep[],
  initialEvidence?: { toolkit: string; toolSlug: string; data: string },
): Promise<BusinessWorkflowProgress> {
  const { userId } = requireTenantContext(context);
  if (steps.length < 2 || steps.length > MAX_BUSINESS_WORKFLOW_STEPS) throw new Error('A connected-app workflow needs two to six source-bound steps.');
  if (initialEvidence && initialEvidence.data.length > 8_000) throw new Error('The trigger payload is too large for a bounded workflow.');
  const outcomes: StepOutcome[] = initialEvidence ? [{ stepIndex: -1, request: 'Authorized app trigger event', kind: 'read', toolkit: initialEvidence.toolkit, toolSlug: initialEvidence.toolSlug, data: initialEvidence.data }] : [];
  const { data, error } = await getTenantSupabaseAdmin(context)
    .from('business_workflow_runs')
    .insert({ user_id: userId, request: request.slice(0, 1_500), steps, outcomes, status: 'running' })
    .select('*')
    .single();
  if (error || !validRun(data) || data.user_id !== userId) throw new Error('Connected-app workflow could not be saved. No action was executed.');
  return advance(context, data);
}

export async function getBusinessWorkflowRun(context: TenantContext, runId: string): Promise<BusinessWorkflowRunView> {
  const { userId } = requireTenantContext(context);
  return view(await loadRun(context, userId, runId));
}

export async function resumeBusinessWorkflowAfterConfirmation(
  context: TenantContext,
  confirmationId: string,
  execution: Extract<BusinessActionExecutionOutcome, { status: 'success' }>,
): Promise<BusinessWorkflowProgress | null> {
  const { userId } = requireTenantContext(context);
  const { data, error } = await getTenantSupabaseAdmin(context)
    .from('business_workflow_runs')
    .select('*')
    .eq('user_id', userId)
    .eq('current_confirmation_id', confirmationId)
    .eq('status', 'awaiting_confirmation')
    .maybeSingle();
  if (error) throw new Error('Xroga could not load the pending workflow after the external action completed.');
  if (!validRun(data)) return null;
  requireResourceOwner(context, data.user_id);
  const step = data.steps[data.step_index];
  if (!step || step.kind !== 'action') throw new Error('The pending workflow step is invalid.');
  const current = await updateRun(context, data, {
    status: 'running',
    current_confirmation_id: null,
    outcomes: [...data.outcomes, { stepIndex: data.step_index, request: step.request, kind: 'action', toolkit: execution.toolkit, toolSlug: execution.toolSlug, data: execution.resultText }],
    step_index: data.step_index + 1,
  });
  return advance(context, current);
}

export async function resumeBusinessWorkflowAfterSetup(context: TenantContext, runId: string): Promise<BusinessWorkflowProgress> {
  const { userId } = requireTenantContext(context);
  const row = await loadRun(context, userId, runId);
  if (row.status === 'awaiting_confirmation' && row.current_confirmation_id) {
    const { data, error } = await getTenantSupabaseAdmin(context)
      .from('business_action_confirmations')
      .select('status,execution_result,effect_receipt')
      .eq('id', row.current_confirmation_id)
      .eq('user_id', userId)
      .maybeSingle();
    if (error || !data || data.status !== 'consumed'
      || data.effect_receipt?.grantId !== row.current_confirmation_id
      || data.effect_receipt?.outcome !== 'provider_reported_success'
      || !/^[a-f0-9]{64}$/.test(String(data.effect_receipt?.resultDigest))
      || !data.execution_result
      || typeof data.execution_result.toolkit !== 'string'
      || typeof data.execution_result.toolSlug !== 'string'
      || typeof data.execution_result.resultText !== 'string') {
      throw new Error('The action is still awaiting confirmation or its result is unavailable.');
    }
    const resumed = await resumeBusinessWorkflowAfterConfirmation(context, row.current_confirmation_id, {
      status: 'success',
      toolkit: data.execution_result.toolkit,
      toolSlug: data.execution_result.toolSlug,
      resultText: data.execution_result.resultText,
      resultDigest: data.effect_receipt.resultDigest,
    });
    if (!resumed) throw new Error('The confirmed action no longer belongs to this workflow.');
    return resumed;
  }
  if (row.status !== 'setup_required' || row.failure_code === 'READ_RESULT_TOO_LARGE' || row.failure_code === 'WEB_EVIDENCE_UNAVAILABLE') throw new Error('This workflow is not waiting for a connection or app choice.');
  return advance(context, await updateRun(context, row, { status: 'running' }));
}

export async function cancelBusinessWorkflowRun(context: TenantContext, runId: string): Promise<BusinessWorkflowRunView> {
  const { userId } = requireTenantContext(context);
  const row = await loadRun(context, userId, runId);
  if (row.status === 'completed' || row.status === 'cancelled') return view(row);
  const cancelled = await updateRun(context, row, { status: 'cancelled' });
  if (row.current_confirmation_id) await cancelBusinessActionConfirmation(userId, row.current_confirmation_id).catch(() => undefined);
  return view(cancelled);
}

export async function cancelBusinessWorkflowForConfirmation(context: TenantContext, confirmationId: string): Promise<void> {
  const { userId } = requireTenantContext(context);
  const { data, error } = await getTenantSupabaseAdmin(context)
    .from('business_workflow_runs')
    .select('*')
    .eq('user_id', userId)
    .eq('current_confirmation_id', confirmationId)
    .eq('status', 'awaiting_confirmation')
    .maybeSingle();
  if (error) throw new Error('Could not load the workflow for the cancelled action.');
  if (validRun(data)) await updateRun(context, data, { status: 'cancelled', current_confirmation_id: null });
}
