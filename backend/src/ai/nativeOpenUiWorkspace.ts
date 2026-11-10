import { publicCompletionState } from './completionDiagnostics.js';
import { NATIVE_UI_FORMAT, splitNativeOpenUiAnswer, supplementUnfinishedNativeProse, validateNativeOpenUi } from './nativeOpenUi.js';
import { requiresNativeAuthorizationReview } from './nativeOpenUiAccuracy.js';

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
) {
  const { text, program } = splitNativeOpenUiAnswer(raw);
  const validation = program ? validateNativeOpenUi(program, evidenceIds, text) : undefined;
  const response = text || "Xroga couldn't finish the requested answer.";
  const completion = (validation?.ok === false && validation.reason === 'authorization_review') || requiresNativeAuthorizationReview(text)
    ? { status: 'partial' as const, reason: 'authorization_review' as const }
    : validation?.ok === false && validation.reason === 'data_review'
      ? { status: 'partial' as const, reason: 'data_review' as const }
      : publicCompletionState(finishReason, response);
  const valid = !!text && validation?.ok === true && completion.status === 'complete';
  return {
    response: valid ? supplementUnfinishedNativeProse(response, program) : response,
    completion: (!text || (program && !valid)) && completion.status === 'complete'
      ? { status: 'partial' as const, reason: 'presentation_contract' as const } : completion,
    responseSource: { format: NATIVE_UI_FORMAT, text: valid ? program : '' },
  };
}
