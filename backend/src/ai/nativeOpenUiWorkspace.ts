import { publicCompletionState } from './completionDiagnostics.js';
import { NATIVE_UI_FORMAT, PARTIAL_NATIVE_PRESENTATION_NOTE, missingNativeFormats, nativeSourceMarkers, recoverNativeWorkspaceProgram, recoverNativeMonthlyChart, recoverTruncatedNativeWorkspaceProgram, restrictNativeWorkspaceProgram, splitNativeOpenUiAnswer, supplementNativeProse, validateNativeWorkspaceProgram, type NativeUiDiagnostic, type NativeUiValidation, type RequiredNativeFormat } from './nativeOpenUi.js';
import { nativeAnswerReviewReason, nativeFactualGuidance, nativeTechnicalCorrections, repairNativePlainAnswer, retainReviewedTechnicalProse, suppliedMonthlyComparison } from './nativeOpenUiAccuracy.js';
import { checklistFromProse, requestsEditableChecklist, suppliedPeriodicSeries } from './nativeOpenUiRecovery.js';
import { conflictingNativeReadouts, correctExplicitCurrencyReadouts, correctExplicitReadoutShares, initialNativeReadouts, nativePrincipalMultipleReview, recoverNativeReadoutProse } from './nativeOpenUiValues.js';
import { recoverNativeReadoutExplanations } from './nativeOpenUi.js';
import { bindNativeAnswerText, prioritizeNativeCalculator, removeRepeatedCalculatorFormulas } from './nativeOpenUi.js';
import { reviewEditorialProse } from './nativeOpenUiEditorial.js';
import { nativeMarkdownTables } from './nativeMarkdown.js';
import { compactNativeDocumentProse, requestedNativeDocumentFormat } from './nativeDocumentDownload.js';
import { formatUnadornedAnswer, omittedNativeFormats, requestedUnadornedBulletCount, requestsDirectAnswerContent, requestsUnadornedAnswer, type OmittedNativeFormat } from './answerFormat.js';

const outputLimitNote = 'This answer reached the provider output limit. The available answer is shown below.';
const promisesControls = (text: string) => /\b(?:controls?|sliders?|input fields?)\s+(?:above|below)\b|\b(?:above|below)\s+(?:calculator|controls?)\b/i.test(text);
const unavailableControlInstruction = /^ {0,3}(?:[-*+]\s+)?(?:(?:the\s+)?(?:controls?|sliders?|input fields?)\s+(?:above|below)\b|(?:change|adjust|edit|move|set|use|drag)\b[^.?!]*\b(?:in|with|via|using|on)\s+(?:the\s+)?(?:controls?|sliders?|input fields?)\b)/i;
const unavailableReactiveInstruction = /^ {0,3}(?:[-*+]\s+)?(?:chang(?:e|ing)|adjust(?:ing)?|edit(?:ing)?|reset(?:ting)?)\b[^.?!\n]*\b(?:updates? immediately|re-?runs?|recalculates?|restores?)\b/i;
const unavailableInputInstruction = /^ {0,3}(?:[-*+]\s+)?(?:adjust|change|edit)\s+the\s+inputs\s+to\s+(?:see|preview|update|recalculate)\b/i;
const unavailableCalculatorNote = "The interactive controls couldn't be displayed. Treat the calculation below as a worked example.";

function withoutControlClaims(text: string): string {
  let fence: string | undefined;
  return text.split('\n').map(line => {
    const marker = /^ {0,3}(\x60{3,}|~{3,})(.*)$/.exec(line);
    if (marker) {
      if (!fence) fence = marker[1];
      else if (marker[1][0] === fence[0] && marker[1].length >= fence.length && !marker[2].trim()) fence = undefined;
      return line;
    }
    if (fence || !(unavailableControlInstruction.test(line) || unavailableReactiveInstruction.test(line)
        || unavailableInputInstruction.test(line))) return line;
    // Keep an independent sentence following the unusable instructions.
    const next = /[.!?][ \t]+(?=[\p{Lu}])/u.exec(line);
    return next ? line.slice(next.index + next[0].length) : '';
  }).join('\n').trim();
}
const tableControlRequests = [
  /(?<!non[- ])\b(?:interactive|sortable|filterable|searchable|editable|paginated|expandable)\s+(?:(?:data|decision|comparison|summary|results?)\s+){0,2}tables?\b/i,
  /\btables?\s+(?:with|supporting|that\s+(?:allows?|supports?))\s+(?:(?:column|row|local)\s+)?(?:sort\w*|filter\w*|search\w*|edit\w*|paginat\w*|controls?)\b/i,
  /\b(?:sort|filter|search|edit|page through)\s+(?:the\s+)?(?:table|rows|columns)\b/i,
  /\b(?:let|allow|enable)\s+(?:me|users?|readers?)\s+(?:to\s+)?(?:sort|filter|search|edit|page through)\b/i,
  /\b(?:table|rows|columns)\b[^.!?\n]{0,35}\b(?:can|should)\s+(?:be\s+)?(?:sort(?:ed)?|filter(?:ed)?|search(?:ed)?|edit(?:ed)?)\b/i,
];
const tableRequestClauses = /[.!?;,\n]+|\b(?:but|instead)\b|\band\b(?=\s+(?:add|include|show|provide|make|let|allow|enable)\b)/i;
const negatedTableControl = /\b(?:no|without|avoid|skip|omit|exclude|do\s+not|don['’]t)\s+(?:(?:add|include|show|provide|make|create|build|use|enable|allow|let|to|me|users?|readers?|a|an|the|any)\s+)*$/i;

export function requestsNativeTableControls(prompt: string): boolean {
  return prompt.split(tableRequestClauses).some(clause => tableControlRequests.some(pattern => {
    const match = pattern.exec(clause);
    return match && !negatedTableControl.test(clause.slice(0, match.index));
  }));
}

function editorialFallback(prose: string, validation: Extract<NativeUiValidation, { ok: false }>) {
  const note = validation.fallbackProse === undefined
    ? 'Xroga withheld a visual that disagreed with the procedure. Review the written answer before using it.'
    : 'Xroga withheld the visual and the written steps that disagreed with it. Verify the remaining procedure before using it.';
  return {
    response: [note, validation.fallbackProse ?? prose].filter(Boolean).join('\n\n'),
    completion: { status: 'partial' as const, reason: 'factual_review' as const },
    responseSource: { format: NATIVE_UI_FORMAT, text: '' },
  };
}

/** Deployment-owned presentation choice; never reads a user role or client flag.
 * The paid founder evaluator has its own independent staging-only guard. */
export function usesNativeWorkspacePresentation(modelId: string, env = process.env): boolean {
  return env.XROGA_NATIVE_OPENUI_WORKSPACE === '1'
    && (env.XROGA_DEPLOYMENT_ENVIRONMENT === 'staging' || env.XROGA_DEPLOYMENT_ENVIRONMENT === 'production')
    && modelId === 'deepseek_v4_1_flash_1017';
}

const nativeVisualFormat = new Map<string, OmittedNativeFormat>([
  ['Table', 'table'], ['Chart', 'chart'], ['Diagram', 'graph'], ['Svg', 'graph'],
]);
const nativeWrittenComponents = new Set([
  'Col', 'Row', 'Grid', 'Card', 'Box', 'Controls', 'Section', 'Text', 'Markdown', 'Quote', 'Code', 'Math', 'List', 'ListItem', 'Source',
]);

function requestedNativeContent(raw: string, reviewPrompt: string | undefined, evidenceIds: ReadonlySet<string> | undefined,
  excluded: ReadonlySet<OmittedNativeFormat>, directOnly: boolean) {
  const generated = splitNativeOpenUiAnswer(raw);
  if (!generated.program || (!directOnly && !excluded.size)) return generated;
  if (directOnly && generated.text && !evidenceIds?.size) return { text: generated.text, program: '' };
  const candidate = bindNativeAnswerText(generated.program, generated.text);
  const review = validateNativeWorkspaceProgram(candidate, evidenceIds, generated.text, undefined, { request: reviewPrompt });
  if (!review.ok && review.reason !== 'data_review' && review.reason !== 'schema') return { text: generated.text, program: '' };
  try {
    const projection = restrictNativeWorkspaceProgram(candidate, component => {
      const format = nativeVisualFormat.get(component);
      return directOnly ? nativeWrittenComponents.has(component) : !format || !excluded.has(format);
    });
    if (projection && validateNativeWorkspaceProgram(projection, evidenceIds, generated.text, undefined, { request: reviewPrompt }).ok) {
      if (!directOnly) return { text: generated.text, program: projection };
      if (!generated.text) return { text: supplementNativeProse('', projection, true), program: '' };
      const citations = nativeSourceMarkers(projection).filter(marker => !generated.text.includes(marker));
      return { text: [generated.text, ...citations].join(' '), program: '' };
    }
  } catch { /* The user's prose is independent of an unusable projection. */ }
  return { text: generated.text, program: '' };
}

export function completeNativeWorkspaceAnswer(
  raw: string,
  finishReason: string | null | undefined,
  evidenceIds?: ReadonlySet<string>,
  prompt?: string,
  diagnose?: (event: NativeUiDiagnostic | { stage: 'assembly'; reason: 'missing_prose'; programLength: number }
    | { stage: 'assembly'; reason: 'missing_formats'; formats: RequiredNativeFormat[] }) => void,
  requestedFormats: readonly RequiredNativeFormat[] = [],
  presentation?: { requiresTableControls?: boolean; unadornedAnswer?: boolean; bulletCount?: number; formatPrompt?: string },
) {
  const formatPrompt = presentation?.formatPrompt ?? prompt ?? '';
  const excluded = omittedNativeFormats(formatPrompt);
  const requiredFormats = requestedFormats.filter(format => format === 'calculator' || format === 'checklist' || !excluded.has(format));
  const boundedContent = requestsDirectAnswerContent(formatPrompt);
  const directOnly = boundedContent && !requiredFormats.length;
  const { text: generatedProse, program: generatedProgram } = requestedNativeContent(raw, prompt, evidenceIds, excluded, directOnly);
  const prose = (presentation?.unadornedAnswer ?? requestsUnadornedAnswer(formatPrompt))
    ? formatUnadornedAnswer(generatedProse, presentation?.bulletCount ?? requestedUnadornedBulletCount(formatPrompt)) : generatedProse;
  const reviewedProcedure = reviewEditorialProse(prose, prompt);
  if (reviewedProcedure !== undefined) {
    diagnose?.({ stage: 'accuracy', reason: 'factual_review', editorialIssue: 'prose_conflict', programLength: generatedProgram.length, shape: [] });
    return {
      response: [
        'This answer contained conflicting instructions. Xroga withheld the affected steps. Verify the remaining procedure before using it.',
        reviewedProcedure,
      ].filter(Boolean).join('\n\n'),
      completion: { status: 'partial' as const, reason: 'factual_review' as const },
      responseSource: { format: NATIVE_UI_FORMAT, text: '' },
    };
  }
  const originalProgram = bindNativeAnswerText(generatedProgram, prose);
  let factualRule: NativeUiDiagnostic['factualRule'];
  let editorialIssue: NativeUiDiagnostic['editorialIssue'];
  let authorityIssue: NativeUiDiagnostic['authorityIssue'];
  const original = originalProgram ? validateNativeWorkspaceProgram(originalProgram, evidenceIds, prose, event => {
    factualRule = event.factualRule;
    editorialIssue = event.editorialIssue;
    authorityIssue = event.authorityIssue;
    diagnose?.(event);
  }, { request: prompt }) : undefined;
  if (editorialIssue && original?.ok === false) return editorialFallback(prose, original);
  const factualLayoutOnly = original?.ok === false && original.reason === 'factual_review'
    && factualRule && !nativeAnswerReviewReason(prose);
  const guidance = factualLayoutOnly && factualRule ? nativeFactualGuidance[factualRule] : '';
  const unknownCapability = original?.ok === false && original.reason === 'authority' && authorityIssue === 'unknown_capability';
  const recoverable = original?.ok === false && (original.reason === 'schema' || original.reason === 'reference' || factualLayoutOnly || unknownCapability);
  const truncated = finishReason === 'length' && original?.ok === false && original.reason === 'syntax';
  const recoveryReview: { conflict?: Extract<NativeUiValidation, { ok: false }> } = {};
  const checkRecoveredProgram = (candidate: string, candidateProse: string, record?: (event: NativeUiDiagnostic) => void) => {
    if (recoveryReview.conflict) return recoveryReview.conflict;
    let conflict = false;
    const validation = validateNativeWorkspaceProgram(candidate, evidenceIds, candidateProse, event => {
      record?.(event);
      if (event.editorialIssue) {
        conflict = true;
        diagnose?.(event);
      }
    }, { prose, request: prompt });
    if (conflict && validation.ok === false) recoveryReview.conflict = validation;
    return validation;
  };
  let repair;
  if (finishReason === 'stop' && recoverable) {
    repair = recoverNativeWorkspaceProgram(originalProgram, evidenceIds, prose,
      factualLayoutOnly ? 'factual_review' : original.reason === 'reference' ? 'reference' : unknownCapability ? 'authority' : 'schema', checkRecoveredProgram);
    // A projection that loses the requested controls can only be a worked
    // example. Never publish its bound Markdown as a working calculator.
    if (unknownCapability && repair && (requiredFormats.includes('calculator') || promisesControls(prose))
      && missingNativeFormats(repair.validation.ok ? repair.program : '', ['calculator']).length) {
      repair = undefined;
    }
  } else if (truncated) {
    repair = recoverTruncatedNativeWorkspaceProgram(originalProgram, evidenceIds, prose, checkRecoveredProgram);
  }
  // Rebuild only a single requested visual using readable prose or closed user data.
  // Authority, factual, data-review and provider-limit failures retain their own handling.
  if (finishReason === 'stop' && prompt && !evidenceIds?.size && !repair && requiredFormats.length === 1
      && (!original || (!original.ok && ['syntax', 'budget', 'schema', 'reference'].includes(original.reason)))) {
    const localProgram = requiredFormats[0] === 'checklist' && requestsEditableChecklist(prompt) ? checklistFromProse(prose)
      : requiredFormats[0] === 'chart' ? suppliedPeriodicSeries(prompt) : undefined;
    if (localProgram) {
      const validation = checkRecoveredProgram(localProgram, prose, event => {
        if (!event.editorialIssue) diagnose?.(event);
      });
      if (validation.ok) repair = { program: localProgram, validation, partial: false };
    }
  }
  if (recoveryReview.conflict) return editorialFallback(prose, recoveryReview.conflict);
  const candidate = repair?.program ?? originalProgram;
  const validation = repair?.validation ?? original;
  const deduplicated = finishReason === 'stop' && validation?.ok && requiredFormats.includes('calculator')
    ? removeRepeatedCalculatorFormulas(candidate, prose) : candidate;
  const compatibleProgram = deduplicated !== candidate && validateNativeWorkspaceProgram(deduplicated, evidenceIds, prose,
    undefined, { request: prompt }).ok ? deduplicated : candidate;
  const ordered = finishReason === 'stop' && validation?.ok && requiredFormats.includes('calculator')
    ? prioritizeNativeCalculator(compatibleProgram, formatPrompt) : compatibleProgram;
  const program = ordered !== compatibleProgram && validateNativeWorkspaceProgram(ordered, evidenceIds, prose,
    undefined, { request: prompt }).ok ? ordered : compatibleProgram;
  const missing = missingNativeFormats(validation?.ok ? program : '', requiredFormats).filter(format =>
    format !== 'table' || (presentation?.requiresTableControls ?? requestsNativeTableControls(prompt ?? ''))
      || !nativeMarkdownTables(prose).length);
  // The model can promise controls even when its program was rejected and
  // the original wording did not match an explicit calculator obligation.
  const promisesInlineControls = promisesControls(prose);
  const calculatorUnavailable = missing.includes('calculator')
    || (validation?.ok === false && promisesInlineControls);
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
  const proseReview = nativeAnswerReviewReason(text);
  const reviewReason = validation?.ok === false && (validation.reason === 'authorization_review' || validation.reason === 'factual_review')
    ? validation.reason : proseReview;
  const completion = reviewReason
    ? { status: 'partial' as const, reason: reviewReason }
    : hasDataConflict
      ? { status: 'partial' as const, reason: 'data_review' as const }
      : publicCompletionState(finishReason, response);
  const permitsMonthlyChart = (!boundedContent || requiredFormats.includes('chart')) && !excluded.has('chart') && !excluded.has('table');
  const supplied = permitsMonthlyChart && prompt && !evidenceIds?.size ? suppliedMonthlyComparison(prompt) : undefined;
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
  if (reviewReason === 'factual_review' && finishReason === 'stop' && !generatedProgram && !evidenceIds?.size && !requiredFormats.length) {
    const corrected = repairNativePlainAnswer(response);
    if (corrected) return {
      response: corrected,
      completion: { status: 'complete' as const },
      responseSource: { format: NATIVE_UI_FORMAT, text: '' },
    };
  }
  const corrections = reviewReason ? nativeTechnicalCorrections(text) : [];
  const reviewedProse = corrections.length
    ? ['## Technical corrections', ...corrections.map(({ guidance }) => '- ' + guidance),
      proseReview === 'authorization_review' ? '' : retainReviewedTechnicalProse(text, corrections)].filter(Boolean).join('\n\n')
    : proseReview === 'authorization_review' ? 'I couldn’t verify the authorization guidance in this answer.' : response;
  const valid = validation?.ok === true && completion.status === 'complete';
  const readouts = valid ? initialNativeReadouts(program) : [];
  const multiples = valid ? nativePrincipalMultipleReview(program) : undefined;
  const proseMultipleConflict = multiples && multiples.repairProse(response) !== response;
  const multipleConflict = proseMultipleConflict || (multiples?.conflictingNotes.size ?? 0) > 0;
  const proseReadoutConflict = conflictingNativeReadouts(response, readouts).length > 0;
  const projectedReadouts = readouts.length > 0 ? supplementNativeProse('', program, true) : '';
  const visualReadoutConflict = conflictingNativeReadouts(projectedReadouts, readouts).length > 0;
  const canCorrectLocalReadouts = valid && !evidenceIds?.size && !repair?.partial && !missing.length && requiredFormats.includes('calculator');
  const editableReadouts = canCorrectLocalReadouts ? initialNativeReadouts(program, true) : [];
  const correctedShares = correctExplicitReadoutShares(response, editableReadouts);
  const shareConflict = correctedShares !== response || correctExplicitReadoutShares(projectedReadouts, editableReadouts) !== projectedReadouts;
  if (valid && (proseReadoutConflict || multipleConflict || visualReadoutConflict || shareConflict)) {
    const optionalCalculator = !requiredFormats.length && !missingNativeFormats(program, ['calculator']).length;
    // The complete prose can stand on its own when only an optional calculator
    // supplied the contradictory content. Keep requested or relied-on visuals partial.
    if (optionalCalculator && prose.trim() && !repair?.partial && !missing.length
        && !promisesInlineControls && !proseReadoutConflict && !proseMultipleConflict
        && withoutControlClaims(response) === response.trim()) {
      return { response, completion, responseSource: { format: NATIVE_UI_FORMAT, text: '' } };
    }
    if (canCorrectLocalReadouts && !multipleConflict) {
      const correctedProse = correctExplicitCurrencyReadouts(correctedShares, editableReadouts);
      const correctedProgram = recoverNativeReadoutExplanations(program, true);
      // Exact replacements in both representations preserve all instructions
      // and leave the model's validated controls and formulas intact.
      if ((correctedProse !== response || correctedProgram !== program)
          && validateNativeWorkspaceProgram(correctedProgram, evidenceIds, correctedProse, undefined, { prose: correctedProse, request: prompt }).ok
          && !missingNativeFormats(correctedProgram, requiredFormats).length
          && !conflictingNativeReadouts(supplementNativeProse('', correctedProgram, true), readouts).length) {
        const projection = supplementNativeProse(correctedProse, correctedProgram, true);
        if (!conflictingNativeReadouts(projection, readouts).length && correctExplicitReadoutShares(projection, editableReadouts) === projection) return {
          response: projection,
          completion: { status: 'complete' as const },
          responseSource: { format: NATIVE_UI_FORMAT, text: correctedProgram },
        };
      }
    }
    // Preserve independent prose and the calculator when its corrected
    // presentation agrees with the evaluated readouts.
    const safeProse = recoverNativeReadoutProse(correctedShares, readouts, multiples);
    const correctedProgram = recoverNativeReadoutExplanations(program);
    const corrected = validateNativeWorkspaceProgram(correctedProgram, evidenceIds, '');
    const projected = corrected.ok ? supplementNativeProse(safeProse, correctedProgram, true) : '';
    const readable = corrected.ok ? recoverNativeReadoutProse(correctExplicitReadoutShares(projected, editableReadouts), readouts, multiples)
      : [safeProse, ...readouts.map(row => row.label + ': ' + row.value)].filter(Boolean).join('\n\n');
    const keepVisual = corrected.ok && readable === projected;
    const controlsUnavailable = !keepVisual && (optionalCalculator || requiredFormats.includes('calculator') || promisesInlineControls);
    const fallback = optionalCalculator && controlsUnavailable ? safeProse : readable;
    return {
      response: [controlsUnavailable ? unavailableCalculatorNote : '',
        'The calculated results replace an inconsistent numerical explanation.',
        controlsUnavailable ? withoutControlClaims(fallback) : fallback].filter(Boolean).join('\n\n'),
      completion: { status: 'partial' as const, reason: 'data_review' as const },
      responseSource: { format: NATIVE_UI_FORMAT, text: keepVisual ? correctedProgram : '' },
    };
  }
  const verifiedBeforeLimit = validation?.ok === true && completion.status === 'partial' && completion.reason === 'output_limit';
  const recovered = permitsMonthlyChart && completion.status === 'partial' && completion.reason === 'data_review' ? recoverNativeMonthlyChart(program) : undefined;
  if (completion.status === 'complete' && (validation?.ok === false || repair?.partial || missing.length)) {
    return {
      response: valid ? PARTIAL_NATIVE_PRESENTATION_NOTE + '\n\n' + supplementNativeProse(response, program, true)
        : calculatorUnavailable
          ? unavailableCalculatorNote + '\n\n' + withoutControlClaims(response)
          : response,
      completion: { status: 'partial' as const, reason: 'presentation_contract' as const },
      responseSource: { format: NATIVE_UI_FORMAT, text: valid ? program : '' },
    };
  }
  if (completion.status === 'partial' && completion.reason === 'output_limit') {
    const verifiedText = verifiedBeforeLimit ? supplementNativeProse(response, program, true) : response;
    return {
      response: outputLimitNote + '\n\n' + verifiedText,
      completion,
      responseSource: { format: NATIVE_UI_FORMAT, text: verifiedBeforeLimit ? program : '' },
    };
  }
  const deliveredProse = !generatedProgram && !evidenceIds?.size && prompt && completion.status === 'complete'
    ? compactNativeDocumentProse(requestedNativeDocumentFormat(prompt), prompt, reviewedProse) : reviewedProse;
  return {
    response: valid ? supplementNativeProse(response, program, true)
      : completion.status === 'partial' && completion.reason === 'data_review'
        ? recovered?.text ?? 'Partial answer. The written summary disagreed with the plotted data, and the chart could not be recovered.'
        : deliveredProse,
    completion,
    responseSource: { format: NATIVE_UI_FORMAT, text: valid ? program : recovered?.program ?? '' },
  };
}
