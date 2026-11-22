import type { PublicCompletionState } from './completionDiagnostics.js';
import { nativeMarkdownTables } from './nativeMarkdown.js';
import { parseNativeSlideDeck, parseNativeWorkbook } from './nativeOfficeContent.js';

export const nativeDocumentFormats = ['docx', 'pdf', 'xlsx', 'pptx'] as const;
export type NativeDocumentFormat = typeof nativeDocumentFormats[number];

export function isNativeDocumentFormat(value: unknown): value is NativeDocumentFormat {
  return typeof value === 'string' && nativeDocumentFormats.some(format => format === value);
}

// Only direct deliverable requests qualify. Mentions in questions, code,
// attachments, and proposed software features must not add a file control.
const request = /^(?:please\s+)?(?:(?:can|could|would)\s+you\s+)?(?:create|make|write|draft|generate|prepare|build|give\s+me)\s+/i;
const document = '(?:document|report|proposal|brief|memo|letter|summary|guide|plan|handout|worksheet|sheet|checklist|agenda|schedule|runbook|playbook|handbook|timeline|invoice|statement|workbook|spreadsheet|slide deck|slides|deck|presentation|file)';
const extensions = '\\.?(?:docx|pdf|xlsx|pptx)';
const fileFormat = '(' + extensions + '|word|excel|powerpoint)';
const descriptionWord = '[\\p{L}\\p{N}-]+\\s+';
const beforePrefix = '^(?:(?:a|an|the|my)\\s+)?';
const optionalDescription = '(?:\\s+(?:' + descriptionWord + '){0,3}' + document + ')';
const inlinePrefix = beforePrefix + '(?:' + descriptionWord + '){0,3}';
const beforeBoundary = '(?=\\s*(?:[.,!?]|$)|\\s+(?:from|using|with|about|based on|on|for)\\b)';
const beforeFormat = new RegExp(inlinePrefix + '(' + extensions + ')' + optionalDescription + '?' + beforeBoundary, 'iu');
const beforeNamedFormat = new RegExp(inlinePrefix + '(word|excel|powerpoint)' + optionalDescription + beforeBoundary, 'iu');
const afterFormat = new RegExp(beforePrefix + '(?:' + descriptionWord + '){0,5}' + document
  + '\\s+(?:as|in)\\s+(?:(?:a|an)\\s+)?' + fileFormat + '\\b', 'iu');
const exportFormat = new RegExp('^(?:please\\s+)?(?:(?:can|could|would)\\s+you\\s+)?(?:export|save|download|convert)\\s+'
  + '(?:(?:this|that|it|the\\s+(?:answer|report|document)|your\\s+(?:answer|report))\\s+)?(?:as|to)\\s+(?:(?:a|an)\\s+)?' + fileFormat + '\\b', 'i');
const priorContent = '(?:the (?:above|previous|earlier)(?:\\s+(?:answer|report|document|text))?|your last (?:answer|report))';
const priorExport = new RegExp('^(?:please\\s+)?(?:(?:can|could|would)\\s+you\\s+)?'
  + '(?:put|turn|export|save|convert|format)\\s+' + priorContent
  + '\\s+(?:into|as|to|in)\\s+(?:(?:a|an|editable|downloadable|printable)\\s+){0,3}' + fileFormat + '\\b', 'iu');
const documentDeliverable = new RegExp(beforePrefix
  + '(?:(?!(?:with|from|using|for|about|that|by|through|as|in|and|or)\\b)' + descriptionWord + '){0,5}' + document + '\\b', 'iu');
const followupExport = new RegExp('(?:^|[.!?]\\s+|\\n+)\\s*(?:please\\s+)?(?:provide|attach|export|save|include)\\s+'
  + '(?:it|the\\s+' + document + ')\\s+(?:as|in)\\s+(?:(?:a|an)\\s+)?(?:downloadable\\s+)?' + fileFormat + '\\b', 'giu');
const declinesDownload = /\b(?:no|do\s+not|don['’]t|without)\s+(?:(?:create|export|give|make|generate|attach|include|provide|a|an|the)\s+)*(?:files?|downloads?|docx|pdf|xlsx|pptx)\b/i;
const conciseFormat = new RegExp('^(?:(?:downloadable|editable|printable|[\\p{L}\\p{N}]+-(?:page|slide))\\s+){0,2}(' + extensions + ')\\s+', 'iu');

function conciseDeliverable(text: string): RegExpExecArray | null {
  const format = conciseFormat.exec(text);
  if (!format || text.endsWith('?')) return null;
  const details = text.slice(format[0].length);
  const heading = details.split(/[,;:.\n]/, 1)[0];
  // A heading or supplied acceptance details establish a request for the
  // file itself. A product name or statement about the format does not.
  if (/\b(?:app|editor|generator|parser|reader|viewer|converter|is|are|uses?|does)\b/i.test(heading)) return null;
  if (documentDeliverable.test(heading)) return format;
  return /:\s*\S|\s[+-]?\d+(?:[\s,.;]|$)/.test(details) ? format : null;
}

export function requestedNativeDocumentFormat(prompt: string): NativeDocumentFormat | undefined {
  const text = prompt.trim();
  if (text.length > 32_000) return;
  const direct = exportFormat.exec(text) ?? priorExport.exec(text);
  const body = direct ? text : text.replace(request, '');
  const inline = direct ?? (body !== text ? beforeFormat.exec(body) ?? beforeNamedFormat.exec(body) ?? afterFormat.exec(body) : conciseDeliverable(text));
  const followups = body !== text && documentDeliverable.test(body) ? [...body.matchAll(followupExport)] : [];
  if (followups.length > 1 || inline && followups.length) return;
  const selection = inline ?? followups[0];
  if (!selection) return;
  const raw = selection[1]?.toLowerCase().replace(/^\./, '');
  if (raw === 'word' && !direct && /\b(?:as|in)\s+(?:a|an)\s+word\s*$/i.test(selection[0])) return;
  const candidate = raw === 'word' ? 'docx' : raw === 'excel' ? 'xlsx' : raw === 'powerpoint' ? 'pptx' : raw;
  if (!isNativeDocumentFormat(candidate)) return;
  const trailing = body.slice(selection.index + selection[0].length);
  if (/\b(?:or|and|plus|instead of)\s+(?:an?\s+)?(?:\.?(?:docx|pdf|xlsx|pptx)|word|excel|powerpoint)\b/i.test(trailing)
      || declinesDownload.test(followups.length ? body : trailing)) return;
  return candidate;
}

export function nativeDocumentRequiresAttachment(prompt: string): boolean {
  return /\b(?:my|the|this|that|these|those)\s+(?:attached|uploaded|attachments?)\b|\b(?:from|using|with)\s+(?:attached|uploaded|attachments?)\b/i.test(prompt);
}

export function nativeDocumentRequiresPriorAnswer(prompt: string): boolean {
  return priorExport.test(prompt.trim());
}

function wantsFormula(prompt: string) {
  return /\b(?:with|using|include|add|contain(?:ing)?|has|have)\b[^.!?\n]{0,70}\bformulas?\b|\band\s+(?:(?:a|the)\s+)?formulas?\b/i.test(prompt);
}

export function nativeDocumentPrompt(format: NativeDocumentFormat, missingAttachment = false, prompt = ''): string {
  if (missingAttachment) {
    return '\n\nThe required attachment is missing or unreadable. Ask for it and wait before drafting the document. Do not invent the data or claim a file was created.';
  }
  const formatInstructions = format === 'xlsx'
    ? 'Use exactly one Markdown table with 2 to 50 named columns and 1 to 250 data rows, with row 1 holding the headers. Use plain numbers for calculated inputs and put units in the headers. Leave calculated cells empty in the table. '
      + (wantsFormula(prompt) ? 'Include the requested calculations. ' : '')
      + 'For calculations, immediately follow the table with "## Formulas" and one list item per formula like "- C2: =A2*B2". Use one arithmetic operator between local numeric cells/numbers, or SUM, AVERAGE, MIN or MAX on one local numeric range. Do not add external references or a second table.'
    : format === 'pptx'
      ? 'Use a level-one deck title, then one level-two heading per slide with its complete visible text or bullets underneath. Do not add other level-two sections or use fenced code. Preserve the supplied facts and keep each slide readable.'
      : 'Write the requested headings and use prose, lists or editable tables as appropriate. For a document populated from supplied facts, keep each entry in one place. A checklist that refers to a table should point to it without repeating its names or values. When the user names the sections and asks for a specific reminder, include the named sections and that reminder without adding template fields or extra checklist items. Use a list for separate fields when requested. Add derived values or extra instructions only when the user asks for them, and check those calculations against the original values.';
  return '\n\nWrite the complete requested ' + format.toUpperCase() + ' artifact as readable Markdown in the primary answer. ' +
    formatInstructions + ' ' +
    'Workspace handles the local download after it validates the answer. Write only the document body. Omit capability disclaimers, manual conversion instructions, file URLs and claims about file delivery. For a document-only request, submit the Markdown without an OpenUI program. ' +
    'When required source material is missing or unreadable, explain what is needed and do not invent its contents.';
}

/** Keep both the table and its independent checklist instruction. An exact
 * enumeration of every row name adds no content to that instruction. */
export function compactNativeDocumentProse(format: NativeDocumentFormat | undefined, prompt: string, response: string): string {
  if ((format !== 'docx' && format !== 'pdf') || /^(?: {0,3})(?:```|~~~)/m.test(response)
      || /\b(?:repeat|restate|relist|recap|list\s+[^.\n]{0,60}\s+again)\b/i.test(prompt)) return response;

  const key = (labels: readonly string[]) => JSON.stringify(labels.map(label => label.trim()));
  const tableNames = new Set<string>();
  for (const table of nativeMarkdownTables(response)) {
    const labels = table.rows.map(row => row[0]);
    if (labels.length >= 3 && labels.every(label => /^[\p{L}\p{N}][\p{L}\p{N} -]*$/u.test(label))
        && new Set(labels).size === labels.length) tableNames.add(key(labels));
  }
  if (!tableNames.size) return response;

  const reviewItem = /^( {0,3}[-*+]\s+\[[ xX]\]\s+(?:confirm|check|review|verify|ensure)\b[^:\n]{1,110}): ([^\n.!?]+)\.?$/gim;
  return response.replace(reviewItem, (line, instruction: string, names: string) =>
    tableNames.has(key(names.split(','))) ? `${instruction}.` : line);
}

export function nativeDocumentDelivery(format: NativeDocumentFormat | undefined, missingSource: boolean, prompt: string,
  response: string, completion: PublicCompletionState): { completion: PublicCompletionState; downloadFormat?: NativeDocumentFormat } {
  if (!format || completion.status !== 'complete') return { completion };
  if (missingSource) return { completion: { status: 'partial', reason: 'presentation_contract' } };
  if (!response.trim() || (format === 'xlsx' && !parseNativeWorkbook(response, wantsFormula(prompt))) ||
      (format === 'pptx' && !parseNativeSlideDeck(response))) return { completion: { status: 'partial', reason: 'presentation_contract' } };
  return { completion, downloadFormat: format };
}
