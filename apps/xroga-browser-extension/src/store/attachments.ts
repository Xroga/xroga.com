// What can be attached: shared by the panel, which checks a file before writing it to the blob store, and the
// worker, which checks it again before using it.

export const MAX_FILE = 25 * 1024 * 1024;
export const MAX_CONVERSATION = 100 * 1024 * 1024;
export const MAX_XROGA_FILES = 10;
/** The Xroga product accepts files up to the general limit: photos, videos, audio, archives and documents can all be attached. */
export const MAX_XROGA_FILE = MAX_FILE;

const IMAGE_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif']);
const TEXT_TYPES = new Set([
  'application/json',
  'application/xml',
  'application/javascript',
  'application/x-javascript',
  'application/typescript',
  'application/x-yaml',
  'application/yaml',
  'application/x-sh',
  'application/sql',
]);
const TEXT_EXTENSIONS =
  /\.(txt|md|markdown|csv|tsv|json|jsonl|xml|html?|css|js|jsx|mjs|ts|tsx|py|rb|go|rs|java|kt|c|h|cc|cpp|hpp|cs|php|sh|bash|zsh|yaml|yml|toml|ini|cfg|conf|log|sql|swift|r|lua|pl|scala|vue|svelte)$/i;
const DOCUMENT_EXTENSIONS = /\.(pdf|docx?|xlsx?|pptx?|odt|ods|odp|rtf|pages|numbers|key)$/i;

/** `file` is any other file (video, audio, archive, PDF, spreadsheet...): kept as bytes so it can be uploaded to a site; it is not read as text. */
export type AttachmentKind = 'image' | 'text' | 'file';

/** What a file is, or why it cannot be attached. */
export function attachmentKind(
  name: string,
  mimeType: string,
): { kind: AttachmentKind } | { refused: string; reason: 'document' | 'type' } {
  if (IMAGE_TYPES.has(mimeType)) return { kind: 'image' };
  // Spreadsheets and Word documents are read into text by store/office.ts (no library; PDF is not).
  if (/\.(xlsx|docx)$/i.test(name)) return { kind: 'text' };
  if (mimeType.startsWith('text/') || TEXT_TYPES.has(mimeType) || TEXT_EXTENSIONS.test(name)) {
    // A spreadsheet or a Word file by another extension is still a document, not text.
    if (!DOCUMENT_EXTENSIONS.test(name)) return { kind: 'text' };
  }
  // Everything else is attached as bytes (video, audio, archives, PDFs, old Office files, other images): the agent can upload it.
  return { kind: 'file' };
}
