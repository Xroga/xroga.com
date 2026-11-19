export type NativeDocumentFormat = 'docx' | 'pdf';

export function isNativeDocumentFormat(value: unknown): value is NativeDocumentFormat {
  return value === 'docx' || value === 'pdf';
}

// Only direct deliverable requests qualify. Mentions in questions, code,
// attachments, and proposed software features must not add a file control.
const request = /^(?:please\s+)?(?:(?:can|could|would)\s+you\s+)?(?:create|make|write|draft|generate|prepare|build|give\s+me)\s+/i;
const document = '(?:document|report|proposal|brief|memo|letter|summary|guide|plan|handout|worksheet|invoice|statement)';
const beforeFormat = new RegExp('^(?:(?:a|an|the|my)\\s+)?(?:[\\p{L}]+\\s+){0,3}(docx|pdf)(?:\\s+(?:[\\p{L}]+\\s+){0,3}' + document + ')?(?=\\s*(?:[.,!?]|$)|\\s+(?:from|using|with|about|based on|on|for)\\b)', 'iu');
const afterFormat = new RegExp('^(?:(?:a|an|the|my)\\s+)?(?:[\\p{L}]+\\s+){0,5}' + document + '\\s+(?:as|in)\\s+(?:a\\s+)?(docx|pdf)\\b', 'iu');
const exportFormat = /^(?:please\s+)?(?:(?:can|could|would)\s+you\s+)?(?:export|save|download|convert)\s+(?:(?:this|that|it|the\s+(?:answer|report|document)|your\s+(?:answer|report))\s+)?(?:as|to)\s+(?:a\s+)?(docx|pdf)\b/i;

export function requestedNativeDocumentFormat(prompt: string): NativeDocumentFormat | undefined {
  const text = prompt.trim();
  const direct = exportFormat.exec(text);
  const body = direct ? text : text.replace(request, '');
  const selection = direct ?? (body !== text ? beforeFormat.exec(body) ?? afterFormat.exec(body) : null);
  if (!selection) return;
  const candidate = selection[1]?.toLowerCase();
  if (!isNativeDocumentFormat(candidate)) return;
  const trailing = body.slice(selection[0].length);
  if (/\b(?:or|and|plus|instead of)\s+(?:an?\s+)?(?:docx|pdf|xlsx|pptx)\b|\b(?:no|do\s+not|don['’]t|without)\s+(?:(?:create|export|give|make|generate|attach|include|provide|a|an|the)\s+)*(?:files?|downloads?|docx|pdf)\b/i.test(trailing)) return;
  return candidate;
}

export function nativeDocumentRequiresAttachment(prompt: string): boolean {
  return /\b(?:my|the|this|that|these|those)\s+(?:attached|uploaded|attachments?)\b|\b(?:from|using|with)\s+(?:attached|uploaded|attachments?)\b/i.test(prompt);
}

export function nativeDocumentPrompt(format: NativeDocumentFormat, missingAttachment = false): string {
  if (missingAttachment) {
    return '\n\nThe required attachment is missing or unreadable. Ask for it and wait before drafting the document. Do not invent the data or claim a file was created.';
  }
  return '\n\nWrite the complete requested ' + format.toUpperCase() +
    ' document as readable Markdown in the primary answer, with headings and the supplied facts. ' +
    'The chat may offer to download that text as a local file. Do not invent a file URL, storage receipt, or claim a file was already created. ' +
    'When required source material is missing or unreadable, explain what is needed and do not invent its contents.';
}
