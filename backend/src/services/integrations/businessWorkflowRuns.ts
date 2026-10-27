import { requireTenantContext, requireResourceOwner, type TenantContext } from '../../security/tenantContext.js';
import { getTenantSupabaseAdmin } from '../../security/serviceRoleGuard.js';
import { prepareBusinessAction, type BusinessActionPreparationOutcome, type BusinessActionReferenceEvidence, type BusinessActionExecutionOutcome } from './businessAction.js';
import { cancelBusinessActionConfirmation, createBusinessActionConfirmation, type SafeBusinessActionConfirmation } from './businessActionConfirmations.js';
import { readBusinessData, type BusinessReadOutcome } from './businessRead.js';
import type { BusinessWorkflowStep } from './businessWorkflow.js';

type RunStatus = 'running' | 'executing' | 'awaiting_confirmation' | 'setup_required' | 'completed' | 'failed' | 'cancelled';

interface StepOutcome {
  stepIndex: number;
  request: string;
  kind: 'read' | 'action';
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

function view(row: RunRow): BusinessWorkflowRunView {
  return {
    id: row.id,
    request: row.request,
    status: row.status,
    stepIndex: row.step_index,
    stepCount: row.steps.length,
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
    && value.steps.length <= 4
    && value.steps.every((step) => step && typeof step === 'object'
      && (step.kind === 'read' || step.kind === 'action')
      && typeof step.request === 'string'
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

function previousEvidence(row: RunRow, step: BusinessWorkflowStep): BusinessActionReferenceEvidence[] | undefined {
  if (!step.dependsOnPrevious) return undefined;
  const earlier = row.outcomes.filter((outcome) => outcome.stepIndex < row.step_index);
  const wantsReadResults = /\b(?:results?|found|matching|search(?:ed)?|leads?|clients?)\b/i.test(step.request);
  const relevant = wantsReadResults ? earlier.filter((outcome) => outcome.kind === 'read') : earlier.slice(-1);
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

async function advance(context: TenantContext, row: RunRow): Promise<BusinessWorkflowProgress> {
  requireResourceOwner(context, row.user_id);
  let current = row;
  while (current.status === 'running' && current.step_index < current.steps.length) {
    const step = current.steps[current.step_index]!;
    try {
      if (step.kind === 'read') {
        const eventEvidence = current.outcomes.filter((item) => item.stepIndex === -1).map((item) => ({ sourceRequest: item.request, toolkit: item.toolkit, toolSlug: item.toolSlug, data: item.data }));
        const result = await readBusinessData({ userId: current.user_id, tenantContext: context, useCase: step.request, referenceEvidence: eventEvidence });
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
        tenantContext: context,
        useCase: step.request,
        referenceEvidence,
        forceConfirmation: true,
      });
      if (preparation.status !== 'ready') {
        current = await updateRun(context, current, { status: 'setup_required' });
        return { run: view(current), pendingAction: preparation };
      }
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
  if (steps.length < 2 || steps.length > 4 || !steps.some((step) => step.kind === 'action')) throw new Error('A connected-app workflow needs two to four explicit steps, including an action.');
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
  if (row.status !== 'setup_required' || row.failure_code === 'READ_RESULT_TOO_LARGE') throw new Error('This workflow is not waiting for a connection or app choice.');
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
