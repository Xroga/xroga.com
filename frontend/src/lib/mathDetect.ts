/** Detect math solution content for structured KaTeX rendering */

export function isMathSolutionContent(content: string): boolean {
  if (!content?.trim()) return false;
  const t = content.toLowerCase();
  return (
    /^solving for/m.test(content) ||
    /^step\s+\d+/im.test(content) ||
    /\bsolve\s+for\s+[a-z]\b/i.test(t) ||
    (/\banswer\b/i.test(t) && /=/.test(content) && /\bstep\s+\d+/i.test(t)) ||
    (/in plain words:/i.test(t) && /=/.test(content)) ||
    /^your problem$/im.test(content) ||
    /^the bottom line$/im.test(content)
  );
}

export function isMathQueryPrompt(prompt: string): boolean {
  const t = prompt.toLowerCase();
  if (t.length > 500) return false;
  return (
    /\bsolve\s+for\b/.test(t) ||
    /\b(solve|simplify|factor|expand|derive|integrate|differentiate)\b/.test(t) ||
    /\b(equation|polynomial|quadratic|linear equation|algebra|calculus|geometry)\b/.test(t) ||
    /[0-9x]\s*[+\-*/^=]\s*[0-9x]/.test(t) ||
    /\\\(|\\\)|\$\$/.test(t)
  );
}
