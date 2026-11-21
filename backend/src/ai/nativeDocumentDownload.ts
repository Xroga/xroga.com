import type { PublicCompletionState } from './completionDiagnostics.js';
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
const documentDeliverable = new RegExp(beforePrefix
  + '(?:(?!(?:with|from|using|for|about|that|by|through|as|in|and|or)\\b)' + descriptionWord + '){0,5}' + document + '\\b', 'iu');
const followupExport = new RegExp('(?:^|[.!?]\\s+|\\n+)\\s*(?:please\\s+)?(?:provide|attach|export|save|include)\\s+'
  + '(?:it|the\\s+' + document + ')\\s+(?:as|in)\\s+(?:(?:a|an)\\s+)?(?:downloadable\\s+)?' + fileFormat + '\\b', 'giu');
const declinesDownload = /\b(?:no|do\s+not|don['’]t|without)\s+(?:(?:create|export|give|make|generate|attach|include|provide|a|an|the)\s+)*(?:files?|downloads?|docx|pdf|xlsx|pptx)\b/i;

export function requestedNativeDocumentFormat(prompt: string): NativeDocumentFormat | undefined {
  const text = prompt.trim();
  if (text.length > 32_000) return;
  const direct = exportFormat.exec(text);
  const body = direct ? text : text.replace(request, '');
  const inline = direct ?? (body !== text ? beforeFormat.exec(body) ?? beforeNamedFormat.exec(body) ?? afterFormat.exec(body) : null);
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

function wantsFormula(prompt: string) {
  return /\b(?:with|using|include|add|contain(?:ing)?|has|have)\b[^.!?\n]{0,70}\bformulas?\b/i.test(prompt);
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
      : 'Write the requested headings and use prose, lists or editable tables as appropriate. For a document populated from supplied facts, keep each entry in one place. Refer to that table or section from a checklist without restating its entries. Add derived values or extra instructions only when the user asks for them, and check those calculations against the original values.';
  return '\n\nWrite the complete requested ' + format.toUpperCase() + ' artifact as readable Markdown in the primary answer. ' +
    formatInstructions + ' ' +
    'Workspace handles the local download after it validates the answer. Write only the document body. Omit capability disclaimers, manual conversion instructions, file URLs and claims about file delivery. For a document-only request, submit the Markdown without an OpenUI program. ' +
    'When required source material is missing or unreadable, explain what is needed and do not invent its contents.';
}

export function nativeDocumentDelivery(format: NativeDocumentFormat | undefined, missingAttachment: boolean, prompt: string,
  response: string, completion: PublicCompletionState): { completion: PublicCompletionState; downloadFormat?: NativeDocumentFormat } {
  if (!format || missingAttachment || completion.status !== 'complete') return { completion };
  if (!response.trim() || (format === 'xlsx' && !parseNativeWorkbook(response, wantsFormula(prompt))) ||
      (format === 'pptx' && !parseNativeSlideDeck(response))) return { completion: { status: 'partial', reason: 'presentation_contract' } };
  return { completion, downloadFormat: format };
}
