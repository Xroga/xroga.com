import { publicCompletionState } from './completionDiagnostics.js';
import { NATIVE_UI_FORMAT, recoverNativeMonthlyChart, splitNativeOpenUiAnswer, supplementUnfinishedNativeProse, validateNativeOpenUi } from './nativeOpenUi.js';
import { requiresNativeAuthorizationReview, suppliedMonthlyComparison } from './nativeOpenUiAccuracy.js';

/** Deployment-owned presentation choice; never reads a user role or client flag.
 * The paid founder evaluator has its own independent staging-only guard. */
export function usesNativeWorkspacePresentation(modelId: string, env = process.env): boolean {
  return env.XROGA_NATIVE_OPENUI_WORKSPACE === '1'
    && (env.XROGA_DEPLOYMENT_ENVIRONMENT === 'staging' || env.XROGA_DEPLOYMENT_ENVIRONMENT === 'production')
    && modelId === 'deepseek_v4_1_flash_1017';
}

export function completeNativeWorkspaceAnswer(
  raw: string,
  finishReason: string | null | undefined,
  evidenceIds?: ReadonlySet<string>,
  prompt?: string,
) {
  const { text, program } = splitNativeOpenUiAnswer(raw);
  const validation = program ? validateNativeOpenUi(program, evidenceIds, text) : undefined;
  const response = text || "Xroga couldn't finish the requested answer.";
  const completion = (validation?.ok === false && validation.reason === 'authorization_review') || requiresNativeAuthorizationReview(text)
    ? { status: 'partial' as const, reason: 'authorization_review' as const }
    : validation?.ok === false && validation.reason === 'data_review'
      ? { status: 'partial' as const, reason: 'data_review' as const }
      : publicCompletionState(finishReason, response);
  const supplied = prompt && !evidenceIds?.size ? suppliedMonthlyComparison(prompt) : undefined;
  if (supplied && finishReason === 'stop' && (validation?.ok || validation?.reason === 'data_review')) {
    const reviewed = recoverNativeMonthlyChart(program, supplied, !validation.ok);
    if (reviewed) {
      return {
        response: reviewed.text,
        completion: reviewed.dataMismatch || !validation.ok
          ? { status: 'partial' as const, reason: 'data_review' as const }
          : { status: 'complete' as const },
        responseSource: { format: NATIVE_UI_FORMAT, text: reviewed.program },
      };
    }
  }
  const valid = !!text && validation?.ok === true && completion.status === 'complete';
  const recovered = completion.status === 'partial' && completion.reason === 'data_review' ? recoverNativeMonthlyChart(program) : undefined;
  return {
    response: valid ? supplementUnfinishedNativeProse(response, program)
      : completion.status === 'partial' && completion.reason === 'data_review'
        ? recovered?.text ?? 'Partial answer. The written summary disagreed with the plotted data, and the chart could not be recovered.'
        : response,
    completion: (!text || (program && !valid)) && completion.status === 'complete'
      ? { status: 'partial' as const, reason: 'presentation_contract' as const } : completion,
    responseSource: { format: NATIVE_UI_FORMAT, text: valid ? program : recovered?.program ?? '' },
  };
}
