/**
 * Black Hole V∞ emission filter — regex + templates (no heavy LLM).
 */

/** Strip emoji / pictographs from user-facing text */
export function stripEmojis(text: string): string {
  return text
    .replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE00}-\u{FE0F}\u{200D}\u{E0020}-\u{E007F}]/gu, '')
    .replace(/\s{2,}/g, ' ')
    .replace(/ +\n/g, '\n')
    .trim();
}

const BANNED_REPLACEMENTS: Array<[RegExp, string]> = [
  [/\bdelve\b/gi, 'examine'],
  [/\btapestry\b/gi, 'landscape'],
  [/\bunlock\b/gi, 'open'],
  [/\bpivotal\b/gi, 'key'],
  [/\brealm\b/gi, 'space'],
  [/\bnavigate\b/gi, 'work through'],
  [/\bembrace\b/gi, 'use'],
  [/\bIn conclusion,?\s*/gi, ''],
  [/\bFurthermore,?\s*/gi, ''],
  [/\bMoreover,?\s*/gi, ''],
  [/\bIt's worth noting that\s*/gi, ''],
  [/\bIt's important to note that\s*/gi, ''],
  [/\bAs an AI language model,?\s*/gi, ''],
  [/\bI hope this helps!?\s*/gi, ''],
];

export function deAiFilter(text: string): string {
  let out = stripEmojis(text);
  for (const [pattern, replacement] of BANNED_REPLACEMENTS) {
    out = out.replace(pattern, replacement);
  }
  return out.replace(/\n{3,}/g, '\n\n').trim();
}

export function markdownBeautifier(text: string): string {
  const lines = text.split('\n');
  const out: string[] = [];
  let inList = false;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      inList = false;
      out.push('');
      continue;
    }
    if (/^#{1,6}\s/.test(trimmed)) {
      inList = false;
      out.push(trimmed.startsWith('##') ? trimmed : `## ${trimmed.replace(/^#+\s*/, '')}`);
      continue;
    }
    if (/^[-*•]\s/.test(trimmed) || /^\d+\.\s/.test(trimmed)) {
      inList = true;
      out.push(trimmed.startsWith('-') ? trimmed : `- ${trimmed.replace(/^[-*•]\s*/, '')}`);
      continue;
    }
    if (inList && trimmed.length < 120) {
      out.push(`- ${trimmed}`);
      continue;
    }
    inList = false;
    out.push(trimmed);
  }
  return out.join('\n').trim();
}

export function buildDecisionMatrix(cleaned: string, userQuery: string): string {
  const snippet = cleaned.slice(0, 1200);
  return `## Gravitational Verdict

${snippet.split('\n')[0] ?? 'Here is a structured take on your decision.'}

## Pros & Cons

| Pros | Cons |
| :--- | :--- |
| *(from analysis below)* | *(risks to weigh)* |

${snippet}

## Contrarian View

Consider the opposite path: what if the conventional choice is wrong for *your* context?

## Option C

A third path: reduce scope, test small, then commit — often beats binary yes/no.

## Decision Chart

\`\`\`
    [ Stay ]───────┐
        │          │
        v          v
   [ Change ]──> [ Hybrid ]
        │
        v
   [ Wait 30d ]
\`\`\`

> **Your question:** ${userQuery.slice(0, 200)}
`;
}

export function needsPolish(text: string): boolean {
  return (
    /\b(delve|tapestry|Furthermore|Moreover|As an AI)\b/i.test(text) ||
    (text.length > 80 && !text.includes('\n') && !text.includes('##'))
  );
}
