import { bindNativeAnswerText, NATIVE_UI_MARKER, splitNativeOpenUiAnswer, splitNativeOpenUiContinuation, validateNativeWorkspaceProgram } from './nativeOpenUi.js';
import type { ChatMessage, ChatResult } from './openaiCompat.js';

function leadingLineOverlap(previous: string[], next: string[]): number {
  const prefix = new Array<number>(next.length).fill(0);
  for (let i = 1; i < next.length; i++) {
    let matched = prefix[i - 1];
    while (matched > 0 && next[i] !== next[matched]) matched = prefix[matched - 1];
    prefix[i] = matched + Number(next[i] === next[matched]);
  }
  let matched = 0;
  for (const line of previous) {
    while (matched > 0 && (matched === next.length || line !== next[matched])) matched = prefix[matched - 1];
    if (line === next[matched]) matched++;
  }
  return matched;
}

function removeRepeatedTableHeader(previous: string[], next: string[]): string[] {
  let tableStart = previous.length;
  while (tableStart > 0 && previous[tableStart - 1].trimStart().startsWith('|')) tableStart--;
  if (tableStart + 2 > previous.length || next.length < 3 ||
      previous[tableStart] !== next[0] || previous[tableStart + 1] !== next[1] ||
      !/^\s*\|[\s|:\-]+\|\s*$/u.test(next[1])) return next;
  return next.slice(2);
}


function extendProse(previous: string, addition: string, insideCodeBlock: boolean): string {
  if (!previous || addition.startsWith(previous)) return addition || previous;
  if (!addition || previous.includes(addition)) return previous;
  const lines = previous.split('\n');
  const extension = addition.split('\n');
  const nextLines = insideCodeBlock ? extension : removeRepeatedTableHeader(lines, extension);
  const overlap = leadingLineOverlap(lines, nextLines);
  if (overlap) return [...lines, ...nextLines.slice(overlap)].join('\n');
  const last = lines.at(-1)!;
  if (last.trim().length >= 12 && nextLines[0].startsWith(last)) {
    return [...lines.slice(0, -1), ...nextLines].join('\n');
  }
  if (insideCodeBlock) return previous + (addition.startsWith('\n') ? '' : '\n') + addition;
  const sameTable = last.trimStart().startsWith('|') && nextLines[0].trimStart().startsWith('|');
  return previous + (sameTable ? '\n' : '\n\n') + nextLines.join('\n');
}

function mergeContinuation(previous: string, addition: string, evidenceIds: ReadonlySet<string> | undefined): string {
  const { draft, extension, insideCodeBlock } = splitNativeOpenUiContinuation(previous, addition);
  const draftReview = draft.program && validateNativeWorkspaceProgram(
    bindNativeAnswerText(draft.program, draft.text), evidenceIds, draft.text);
  if (!extension.program && extension.text && draftReview && !draftReview.ok && draftReview.reason === 'syntax') {
    // A continuation can resume directly inside the native program with no
    // second marker. Validate the exact joined source before treating it as UI.
    const joined = draft.program + addition;
    const review = validateNativeWorkspaceProgram(bindNativeAnswerText(joined, draft.text), evidenceIds, draft.text);
    if (review.ok) return draft.text + NATIVE_UI_MARKER + joined;
    // Syntactically complete but rejected native source is never answer prose.
    if (review.reason !== 'syntax' && review.reason !== 'budget') return previous;
  }
  const prose = extendProse(draft.text, extension.text, insideCodeBlock);
  let program = draft.program;
  // A second valid program may omit tables or controls already delivered in
  // the first. Keep the validated original while extending canonical prose.
  if (extension.program && extension.program !== program && !(draftReview && draftReview.ok) &&
      validateNativeWorkspaceProgram(bindNativeAnswerText(extension.program, prose), evidenceIds, prose).ok) {
    program = extension.program;
  }
  if (prose === draft.text && program === draft.program) return previous;
  return program ? prose + NATIVE_UI_MARKER + program : prose;
}

const instruction = 'Continue the preceding answer to the original request because generation stopped at its output boundary. '
  + 'Return only the remaining useful content. Preserve prior facts, numbers, citations and constraints. '
  + 'Do not repeat completed sections, tables or explanations. If a line ended midway, start with that line completed. '
  + 'Keep the existing presentation and continue in readable prose. If the draft has no complete presentation program '
  + 'and the request needs one, emit the complete program after the standard marker. '
  + 'Inside a code block, preserve exact indentation and close the existing fence before continuing in prose.';

/** Continue settled, progressing output-limit results while the caller's original
 * generation deadline and the provider's output capacity still allow another call. */
export async function continueWorkspaceAnswer(options: {
  initial: ChatResult;
  messages: ChatMessage[];
  maximumOutputTokens: number;
  preferredChunkTokens: number;
  signal: AbortSignal;
  evidenceIds?: ReadonlySet<string>;
  dispatch: (messages: ChatMessage[], maximumTokens: number) => Promise<ChatResult | undefined>;
  onFailure: (error: unknown) => void;
}): Promise<ChatResult> {
  let answer = options.initial;
  let consumed = answer.outputTokens;
  while (answer.finishReason === 'length' && !options.signal.aborted && consumed < options.maximumOutputTokens) {
    const nextBudget = Math.min(options.preferredChunkTokens, options.maximumOutputTokens - consumed);
    const messages: ChatMessage[] = [
      ...options.messages,
      { role: 'assistant', content: answer.text },
      { role: 'user', content: instruction },
    ];
    let result: ChatResult | undefined;
    try {
      result = await options.dispatch(messages, nextBudget);
    } catch (error) {
      if (!options.signal.aborted) options.onFailure(error);
      break;
    }
    if (!result || options.signal.aborted || result.modelId !== answer.modelId ||
        !Number.isSafeInteger(result.outputTokens) || result.outputTokens <= 0 ||
        (result.finishReason !== 'stop' && result.finishReason !== 'length')) break;
    consumed += result.outputTokens;
    const text = mergeContinuation(answer.text, result.text, options.evidenceIds);
    if (text === answer.text) break;
    const proseAdvanced = splitNativeOpenUiAnswer(text).text !== splitNativeOpenUiAnswer(answer.text).text;
    answer = { ...result, text };
    if (!proseAdvanced) break;
  }
  return answer;
}
