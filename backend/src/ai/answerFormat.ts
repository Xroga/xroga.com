// The request can ask for a bounded, directly consumable reply. Keep this check
// narrow so a model-planned heading never becomes an extra line in that reply.
const explicitHeading = /(?<!\bnot )(?<!\bnever )(?<!\bdon['’]t )\b(?:with|under|add|include|use|start with|begin with)\s+(?:(?:a|an|one|the|this|these|markdown|section|level-[a-z\d]+)\s+){0,3}(?:headings?|titles?)\b/iu;
const boundedReply = /\b(?:in|using)\s+(?:(?:exactly|at most|only)\s+)?(?:a single|one|two|three|[123])\s+(?:sentences?|lines?)(?=\s*(?:[.!?;,]|$))|\bexactly\s+(?:\d+|one|two|three|four|five)\s+words?(?=\s*(?:[.!?;,]|$))/iu;
const answerOnly = /\band nothing else(?=\s*(?:[.!?;]|$))|\b(?:give|return|output|show|provide|reply with)\s+(?:me\s+)?(?:only\s+(?:the\s+)?(?:answer|result|number|value|code|plain text)|(?:the\s+)?(?:answer|result|number|value|code|plain text) only)(?=\s*(?:[.!?;,]|$))/iu;
const noFraming = /\b(?:no|without)\s+(?:(?:a|an|any)\s+)?(?:explanations?|introductions?|headings?|titles?|extra text)(?=\s*(?:[.!?;,]|\b(?:but|and)\b|$))/iu;
const exactBullets = /\bexactly\s+(\d+|one|two|three|four|five|six|seven|eight|nine|ten)\s+(?:bullet points?|bullets?)(?=\s*(?:[.!?;]|$))/iu;
const counts: Readonly<Record<string, number>> = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10 };
const withoutInlineLiterals = (prompt: string) => prompt.replace(/`[^`\n]*`|"[^"\n]*"|“[^”\n]*”|(?<![\p{L}\p{N}])'[^'\n]+'(?![\p{L}\p{N}])/gu, '');

export function requestsUnadornedAnswer(prompt: string): boolean {
  // Inline literals can describe a formatting rule without requesting it.
  const instructions = withoutInlineLiterals(prompt);
  return !explicitHeading.test(instructions) && (boundedReply.test(instructions) || answerOnly.test(instructions) || exactBullets.test(instructions) || noFraming.test(instructions));
}

/** A bounded or exact answer can omit optional widgets. A request to omit a
 * heading alone says nothing about the requested components. */
export function requestsDirectAnswerContent(prompt: string): boolean {
  const instructions = withoutInlineLiterals(prompt);
  return boundedReply.test(instructions) || answerOnly.test(instructions) || exactBullets.test(instructions);
}

export type OmittedNativeFormat = 'chart' | 'table' | 'graph';
const formatNoun = /(?:(?:a|an|any|the|bar|line|pie|scatter|data|comparison|markdown)\s+){0,3}(charts?|plots?|histograms?|tables?|diagrams?|flowcharts?)\b/iu;
const clauseStart = '(?:^|[.!?;,\\n]\\s*|\\b(?:but|and)\\s+)(?:please\\s+)?';
const omittedNativeFormat = new RegExp(clauseStart
  + '(?:no|without|skip|omit|exclude|avoid|(?:do\\s+not|don[\'’]t|never)\\s+(?:add|include|show|make|create|draw|use|provide|render))\\s+'
  + formatNoun.source, 'giu');
const formatWithout = new RegExp(clauseStart + '(?:compare|answer|summarize|present|report)\\b[^.!?;\\n]{0,240}\\bwithout\\s+'
  + '(?:(?:using|adding|including)\\s+)?' + formatNoun.source, 'giu');

export function omittedNativeFormats(prompt: string): ReadonlySet<OmittedNativeFormat> {
  const text = withoutInlineLiterals(prompt);
  return new Set([...text.matchAll(omittedNativeFormat), ...text.matchAll(formatWithout)].map(([, noun]): OmittedNativeFormat =>
    /^table/i.test(noun) ? 'table' : /^(?:diagram|flowchart)/i.test(noun) ? 'graph' : 'chart'));
}

export function requestedUnadornedBulletCount(prompt: string): number | undefined {
  const instructions = withoutInlineLiterals(prompt);
  if (explicitHeading.test(instructions)) return;
  const value = exactBullets.exec(instructions)?.[1].toLowerCase();
  if (!value) return;
  const count = counts[value] ?? Number(value);
  if (Number.isSafeInteger(count) && count > 0) return count;
}

export const unadornedAnswerInstruction = 'Follow the explicit output format. Give the requested content directly without a heading, title, label, or framing. For bullet points, write the exact requested number of Markdown list items beginning with "- ". Keep requested code and other formatting. Omit the introduction and conclusion when the user asks.';

/** Remove one clearly separate Markdown heading. Never trim substantive lines,
 * alter a fenced response, or manufacture compliance by counting sentences. */
export function withoutLeadingAnswerHeading(text: string): string {
  const opening = /^(?:[ \t]*\r?\n)* {0,3}#{1,6}[ \t]+(\S[^\r\n]*)\r?\n(?:[ \t]*\r?\n)*(?=\s*\S)/u.exec(text);
  if (!opening) return text;
  const heading = opening[1].trim();
  // Keep a value, sentence, link, or uncertainty that the model put in the
  // heading itself. These may be part of the answer or its completion status.
  if (!/^[\p{L}\p{M}\s'’()-]+:?$/u.test(heading) ||
      /\b(?:is|are|was|were|has|have|cannot|without|no|not|verification|unverified|inconclusive|incomplete|unavailable|missing|unable|uncertain)\b|n['’]t\b/iu.test(heading)) return text;
  return text.slice(opening[0].length);
}

/** Recover the list marker only when every existing paragraph already maps
 * directly to an item. Preserve any substantive surplus or existing syntax. */
export function formatUnadornedAnswer(text: string, bulletCount?: number): string {
  const answer = withoutLeadingAnswerHeading(text);
  if (!bulletCount) return answer;
  const blocks = answer.trimEnd().split(/\r?\n(?:[ \t]*\r?\n)+/u);
  const structured = /^(?: {4}|\t|\s*(?:[-*+]\s|\d+[.)]\s|#{1,6}\s|>|\||`{3}|~{3}|[-=_*]{3}|<))/u;
  const framing = /^(?:\*{1,2})?(?:introduction|conclusion|summary)\b|^(?:here (?:are|is)|in (?:summary|conclusion)|to sum up)\b/iu;
  if (blocks.length !== bulletCount || blocks.some(block => !block.trim() || /[\r\n]/u.test(block) ||
    structured.test(block) || framing.test(block.trimStart()))) return answer;
  return blocks.map(block => '- ' + block.trim()).join('\n');
}
