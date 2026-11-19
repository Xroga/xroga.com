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
const document = '(?:document|report|proposal|brief|memo|letter|summary|guide|plan|handout|worksheet|invoice|statement|workbook|spreadsheet|slide deck|slides|deck|presentation|file)';
const extensions = '\\.?(?:docx|pdf|xlsx|pptx)';
const fileFormat = '(' + extensions + '|word|excel|powerpoint)';
const optionalDescription = '(?:\\s+(?:[\\p{L}]+\\s+){0,3}' + document + ')';
const beforePrefix = '^(?:(?:a|an|the|my)\\s+)?(?:[\\p{L}]+\\s+){0,3}';
const beforeBoundary = '(?=\\s*(?:[.,!?]|$)|\\s+(?:from|using|with|about|based on|on|for)\\b)';
const beforeFormat = new RegExp(beforePrefix + '(' + extensions + ')' + optionalDescription + '?' + beforeBoundary, 'iu');
const beforeNamedFormat = new RegExp(beforePrefix + '(word|excel|powerpoint)' + optionalDescription + beforeBoundary, 'iu');
const afterFormat = new RegExp('^(?:(?:a|an|the|my)\\s+)?(?:[\\p{L}]+\\s+){0,5}' + document
  + '\\s+(?:as|in)\\s+(?:(?:a|an)\\s+)?' + fileFormat + '\\b', 'iu');
const exportFormat = new RegExp('^(?:please\\s+)?(?:(?:can|could|would)\\s+you\\s+)?(?:export|save|download|convert)\\s+'
  + '(?:(?:this|that|it|the\\s+(?:answer|report|document)|your\\s+(?:answer|report))\\s+)?(?:as|to)\\s+(?:(?:a|an)\\s+)?' + fileFormat + '\\b', 'i');

export function requestedNativeDocumentFormat(prompt: string): NativeDocumentFormat | undefined {
  const text = prompt.trim();
  const direct = exportFormat.exec(text);
  const body = direct ? text : text.replace(request, '');
  const selection = direct ?? (body !== text ? beforeFormat.exec(body) ?? beforeNamedFormat.exec(body) ?? afterFormat.exec(body) : null);
  if (!selection) return;
  const raw = selection[1]?.toLowerCase().replace(/^\./, '');
  if (raw === 'word' && !direct && /\b(?:as|in)\s+(?:a|an)\s+word\s*$/i.test(selection[0])) return;
  const candidate = raw === 'word' ? 'docx' : raw === 'excel' ? 'xlsx' : raw === 'powerpoint' ? 'pptx' : raw;
  if (!isNativeDocumentFormat(candidate)) return;
  const trailing = body.slice(selection[0].length);
  if (/\b(?:or|and|plus|instead of)\s+(?:an?\s+)?(?:\.?(?:docx|pdf|xlsx|pptx)|word|excel|powerpoint)\b|\b(?:no|do\s+not|don['’]t|without)\s+(?:(?:create|export|give|make|generate|attach|include|provide|a|an|the)\s+)*(?:files?|downloads?|docx|pdf|xlsx|pptx)\b/i.test(trailing)) return;
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
      : 'Use headings and complete prose with the supplied facts.';
  return '\n\nWrite the complete requested ' + format.toUpperCase() + ' artifact as readable Markdown in the primary answer. ' +
    formatInstructions + ' ' +
    'The chat may offer to download that text as a local file. Do not invent a file URL, storage receipt, or claim a file was already created. ' +
    'When required source material is missing or unreadable, explain what is needed and do not invent its contents.';
}

export function nativeDocumentDelivery(format: NativeDocumentFormat | undefined, missingAttachment: boolean, prompt: string,
  response: string, completion: PublicCompletionState): { completion: PublicCompletionState; downloadFormat?: NativeDocumentFormat } {
  if (!format || missingAttachment || completion.status !== 'complete') return { completion };
  if (!response.trim() || (format === 'xlsx' && !parseNativeWorkbook(response, wantsFormula(prompt))) ||
      (format === 'pptx' && !parseNativeSlideDeck(response))) return { completion: { status: 'partial', reason: 'presentation_contract' } };
  return { completion, downloadFormat: format };
}
