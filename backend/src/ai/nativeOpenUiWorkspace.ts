import { publicCompletionState } from './completionDiagnostics.js';
import { NATIVE_UI_FORMAT, PARTIAL_NATIVE_PRESENTATION_NOTE, missingNativeFormats, recoverNativeWorkspaceProgram, recoverNativeMonthlyChart, splitNativeOpenUiAnswer, supplementNativeProse, validateNativeWorkspaceProgram, type NativeUiDiagnostic, type RequiredNativeFormat } from './nativeOpenUi.js';
import { nativeAnswerReviewReason, nativeFactualGuidance, nativeTechnicalCorrections, suppliedMonthlyComparison } from './nativeOpenUiAccuracy.js';

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
  diagnose?: (event: NativeUiDiagnostic | { stage: 'assembly'; reason: 'missing_prose'; programLength: number }
    | { stage: 'assembly'; reason: 'missing_formats'; formats: RequiredNativeFormat[] }) => void,
  requiredFormats: readonly RequiredNativeFormat[] = [],
) {
  const { text: prose, program: originalProgram } = splitNativeOpenUiAnswer(raw);
  let factualRule: NativeUiDiagnostic['factualRule'];
  const original = originalProgram ? validateNativeWorkspaceProgram(originalProgram, evidenceIds, prose, event => {
    factualRule = event.factualRule;
    diagnose?.(event);
  }) : undefined;
  const factualLayoutOnly = original?.ok === false && original.reason === 'factual_review'
    && factualRule && !nativeAnswerReviewReason(prose);
  const guidance = factualLayoutOnly && factualRule ? nativeFactualGuidance[factualRule] : '';
  const repair = finishReason === 'stop' && original?.ok === false && (original.reason === 'schema' || factualLayoutOnly)
    ? recoverNativeWorkspaceProgram(originalProgram, evidenceIds, prose, factualLayoutOnly ? 'factual_review' : 'schema') : undefined;
  const program = repair?.program ?? originalProgram;
  const validation = repair?.validation ?? original;
  const missing = missingNativeFormats(validation?.ok ? program : '', requiredFormats);
  if (missing.length) diagnose?.({ stage: 'assembly', reason: 'missing_formats', formats: missing });
  if (guidance) {
    const readable = repair?.validation.ok ? supplementNativeProse(prose, program, true) : prose;
    return {
      response: [repair?.validation.ok ? PARTIAL_NATIVE_PRESENTATION_NOTE : '', guidance, readable].filter(Boolean).join('\n\n'),
      completion: { status: 'partial' as const, reason: 'factual_review' as const },
      responseSource: { format: NATIVE_UI_FORMAT, text: repair?.validation.ok ? program : '' },
    };
  }
  const text = prose || (validation?.ok ? supplementNativeProse('', program) : '');
  const hasDataConflict = validation?.ok === false && validation.reason === 'data_review';
  if (!text && !hasDataConflict) {
    diagnose?.({ stage: 'assembly', reason: 'missing_prose', programLength: program.length });
    const completion = publicCompletionState(finishReason);
    return {
      response: "Xroga couldn't recover a readable answer. Send your question again to retry.",
      completion: completion.status === 'partial' ? completion : { status: 'partial' as const, reason: 'presentation_contract' as const },
      responseSource: { format: NATIVE_UI_FORMAT, text: '' },
    };
  }
  const response = text;
  const reviewReason = validation?.ok === false && (validation.reason === 'authorization_review' || validation.reason === 'factual_review')
    ? validation.reason : nativeAnswerReviewReason(text);
  const completion = reviewReason
    ? { status: 'partial' as const, reason: reviewReason }
    : hasDataConflict
      ? { status: 'partial' as const, reason: 'data_review' as const }
      : publicCompletionState(finishReason, response);
  const supplied = prompt && !evidenceIds?.size ? suppliedMonthlyComparison(prompt) : undefined;
  if (supplied && finishReason === 'stop' && (validation?.ok || validation?.reason === 'data_review')) {
    const reviewed = recoverNativeMonthlyChart(program, supplied, !validation.ok);
    if (reviewed) {
      const reason = reviewed.dataMismatch || !validation.ok ? 'data_review' as const
        : repair?.partial || missing.length ? 'presentation_contract' as const : undefined;
      return {
        response: reason === 'presentation_contract' ? PARTIAL_NATIVE_PRESENTATION_NOTE + '\n\n' + reviewed.text : reviewed.text,
        completion: reason ? { status: 'partial' as const, reason } : { status: 'complete' as const },
        responseSource: { format: NATIVE_UI_FORMAT, text: reviewed.program },
      };
    }
  }
  const corrections = reviewReason ? nativeTechnicalCorrections(text) : [];
  const reviewedProse = corrections.length
    ? ['## Technical corrections', ...corrections.map(({ guidance }) => '- ' + guidance),
      '## Original draft for review', 'Use the corrections above when reviewing this draft.', text].join('\n\n')
    : response;
  const valid = validation?.ok === true && completion.status === 'complete';
  const recovered = completion.status === 'partial' && completion.reason === 'data_review' ? recoverNativeMonthlyChart(program) : undefined;
  if (completion.status === 'complete' && (validation?.ok === false || repair?.partial || missing.length)) {
    return {
      response: valid ? PARTIAL_NATIVE_PRESENTATION_NOTE + '\n\n' + supplementNativeProse(response, program, true) : response,
      completion: { status: 'partial' as const, reason: 'presentation_contract' as const },
      responseSource: { format: NATIVE_UI_FORMAT, text: valid ? program : '' },
    };
  }
  return {
    response: valid ? supplementNativeProse(response, program, Boolean(repair))
      : completion.status === 'partial' && completion.reason === 'data_review'
        ? recovered?.text ?? 'Partial answer. The written summary disagreed with the plotted data, and the chart could not be recovered.'
        : reviewedProse,
    completion,
    responseSource: { format: NATIVE_UI_FORMAT, text: valid ? program : recovered?.program ?? '' },
  };
}
