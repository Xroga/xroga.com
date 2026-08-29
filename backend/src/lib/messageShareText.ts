/**
 * Turn an AI transcript into calm, literal share copy.
 *
 * The share page intentionally does not run a Markdown renderer. Removing the
 * presentation syntax here keeps the words/code the model produced while avoiding
 * headings, ornamental rules and empty emphasis markers in social previews.
 */
export function cleanSharedText(value: string): string {
  return value
    .replace(/\r\n?/g, '\n')
    .replace(/^\s*```[^\n]*$/gm, '')
    .replace(/^\s*#{1,6}\s+/gm, '')
    .replace(/^\s*>\s?/gm, '')
    .replace(/^\s*(?:[-*+]\s+|\d+[.)]\s+)/gm, '')
    .replace(/^\s*[-_*\\/]{3,}\s*$/gm, '')
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g, '$1 ($2)')
    .replace(/(\*\*|__)(.*?)\1/g, '$2')
    .replace(/(^|[^*])\*([^*\n]+)\*/g, '$1$2')
    .replace(/(^|[^_])_([^_\n]+)_/g, '$1$2')
    .replace(/~~(.*?)~~/g, '$1')
    .replace(/`([^`\n]+)`/g, '$1')
    .replace(/[ \t]+$/gm, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
