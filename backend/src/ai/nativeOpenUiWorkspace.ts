import { publicCompletionState } from './completionDiagnostics.js';
import { NATIVE_UI_FORMAT, PARTIAL_NATIVE_PRESENTATION_NOTE, missingNativeFormats, recoverNativeWorkspaceProgram, recoverNativeMonthlyChart, recoverTruncatedNativeWorkspaceProgram, splitNativeOpenUiAnswer, supplementNativeProse, validateNativeWorkspaceProgram, type NativeUiDiagnostic, type RequiredNativeFormat } from './nativeOpenUi.js';
import { nativeAnswerReviewReason, nativeFactualGuidance, nativeTechnicalCorrections, suppliedMonthlyComparison } from './nativeOpenUiAccuracy.js';
import { checklistFromProse, requestsEditableChecklist, suppliedPeriodicSeries } from './nativeOpenUiRecovery.js';
import { conflictingNativeReadouts, initialNativeReadouts } from './nativeOpenUiValues.js';

const outputLimitNote = 'This answer reached the provider output limit. The available answer is shown below.';

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
  const recoverable = original?.ok === false && (original.reason === 'schema' || original.reason === 'reference' || factualLayoutOnly);
  const truncated = finishReason === 'length' && original?.ok === false && original.reason === 'syntax';
  let repair;
  if (finishReason === 'stop' && recoverable) {
    repair = recoverNativeWorkspaceProgram(originalProgram, evidenceIds, prose,
      factualLayoutOnly ? 'factual_review' : original.reason === 'reference' ? 'reference' : 'schema');
  } else if (truncated) {
    repair = recoverTruncatedNativeWorkspaceProgram(originalProgram, evidenceIds, prose);
  }
  // Rebuild only a single requested visual using readable prose or closed user data.
  // Authority, factual, data-review and provider-limit failures retain their own handling.
  if (finishReason === 'stop' && prompt && !evidenceIds?.size && !repair && requiredFormats.length === 1
      && (!original || (!original.ok && ['syntax', 'budget', 'schema', 'reference'].includes(original.reason)))) {
    const localProgram = requiredFormats[0] === 'checklist' && requestsEditableChecklist(prompt) ? checklistFromProse(prose)
      : requiredFormats[0] === 'chart' ? suppliedPeriodicSeries(prompt) : undefined;
    if (localProgram) {
      const validation = validateNativeWorkspaceProgram(localProgram, evidenceIds, prose, diagnose);
      if (validation.ok) repair = { program: localProgram, validation, partial: false };
    }
  }
  const program = repair?.program ?? originalProgram;
  const validation = repair?.validation ?? original;
  const missing = missingNativeFormats(validation?.ok ? program : '', requiredFormats);
  if (missing.length) diagnose?.({ stage: 'assembly', reason: 'missing_formats', formats: missing });
  if (guidance) {
    const safeProse = factualRule === 'unconfirmed_conflicting_input'
      ? prose.replace(/(^|[.!?]\s+|\n+)(?:The\s+)?(?:panel|chart|visualization|controls?)\s+(?:below|above)\s+[^.!?\n]+(?:[.!?]|$)/gi, '$1').trim()
      : prose;
    const readable = repair?.validation.ok ? supplementNativeProse(safeProse, program, true) : safeProse;
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
      response: finishReason === 'length'
        ? 'The provider reached its output limit before a readable answer was available.'
        : "Xroga couldn't recover a readable answer. Send your question again to retry.",
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
  if (supplied && (finishReason === 'stop' || finishReason === 'length') &&
      (validation?.ok || validation?.reason === 'data_review')) {
    const reviewed = recoverNativeMonthlyChart(program, supplied, !validation.ok);
    if (reviewed) {
      const reason = reviewed.dataMismatch || !validation.ok ? 'data_review' as const
        : finishReason === 'length' ? 'output_limit' as const
        : repair?.partial || missing.length ? 'presentation_contract' as const : undefined;
      return {
        response: reason === 'presentation_contract' ? PARTIAL_NATIVE_PRESENTATION_NOTE + '\n\n' + reviewed.text
          : reason === 'output_limit' ? outputLimitNote + '\n\n' + reviewed.text : reviewed.text,
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
  if (valid && conflictingNativeReadouts(response, initialNativeReadouts(program)).length) {
    // Preserve the working calculator and derive its readable snapshot from the
    // same pure upstream functions. Do not persist conflicting model totals.
    return {
      response: 'The calculated results replace an inconsistent numerical explanation.\n\n'
        + supplementNativeProse('', program, true),
      completion: { status: 'partial' as const, reason: 'data_review' as const },
      responseSource: { format: NATIVE_UI_FORMAT, text: program },
    };
  }
  const verifiedBeforeLimit = validation?.ok === true && completion.status === 'partial' && completion.reason === 'output_limit';
  const recovered = completion.status === 'partial' && completion.reason === 'data_review' ? recoverNativeMonthlyChart(program) : undefined;
  if (completion.status === 'complete' && (validation?.ok === false || repair?.partial || missing.length)) {
    return {
      response: valid ? PARTIAL_NATIVE_PRESENTATION_NOTE + '\n\n' + supplementNativeProse(response, program, true) : response,
      completion: { status: 'partial' as const, reason: 'presentation_contract' as const },
      responseSource: { format: NATIVE_UI_FORMAT, text: valid ? program : '' },
    };
  }
  if (completion.status === 'partial' && completion.reason === 'output_limit') {
    const verifiedText = verifiedBeforeLimit ? supplementNativeProse(response, program) : response;
    return {
      response: outputLimitNote + '\n\n' + verifiedText,
      completion,
      responseSource: { format: NATIVE_UI_FORMAT, text: verifiedBeforeLimit ? program : '' },
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
