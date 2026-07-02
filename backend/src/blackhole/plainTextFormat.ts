/**
 * Plain professional text — no markdown symbols (# * | ` >) in user-facing output.
 */

/** Strip markdown / markup symbols; keep code fences intact */
export function formatPlainProfessional(text: string): string {
  const parts: string[] = [];
  const codeFence = /```[\s\S]*?```/g;
  let last = 0;
  let match: RegExpExecArray | null;

  while ((match = codeFence.exec(text)) !== null) {
    if (match.index > last) {
      parts.push(plainifySegment(text.slice(last, match.index)));
    }
    parts.push(match[0]);
    last = match.index + match[0].length;
  }
  parts.push(plainifySegment(text.slice(last)));

  return parts
    .join('')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function plainifySegment(segment: string): string {
  let out = segment;

  out = out.replace(/^#{1,6}\s*/gm, '');
  out = out.replace(/\*\*([^*]+)\*\*/g, '$1');
  out = out.replace(/\*([^*]+)\*/g, '$1');
  out = out.replace(/_([^_]+)_/g, '$1');
  out = out.replace(/^>\s?/gm, '');
  out = out.replace(/^[-*•]\s+/gm, '');
  out = out.replace(/^\d+[.)]\s+/gm, '');
  out = out.replace(/\|/g, ' ');
  out = out.replace(/^:?-{2,}:?$/gm, '');
  out = out.replace(/^---+$/gm, '');
  out = out.replace(/`([^`]+)`/g, '$1');
  out = out.replace(/\[ASSUMPTION\]/gi, 'Note:');
  out = out.replace(/[ \t]+\n/g, '\n');
  out = out.replace(/\n{3,}/g, '\n\n');

  return out.trim();
}

export function buildDecisionPlain(cleaned: string, userQuery: string): string {
  const lead = cleaned.split('\n').find((l) => l.trim()) ?? 'Here is a clear take on your decision.';
  return formatPlainProfessional(`Decision summary

${lead}

${cleaned.slice(0, 1400)}

Contrarian view
Consider whether the conventional choice fits your situation — a smaller test or hybrid path may beat a binary yes or no.

Your question
${userQuery.slice(0, 200)}`);
}
