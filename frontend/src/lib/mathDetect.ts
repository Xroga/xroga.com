/** Detect math solution content for structured KaTeX rendering */

export function isMathSolutionContent(content: string): boolean {
  if (!content?.trim()) return false;
  if (/\$\$[\s\S]+?\$\$|\\\([\s\S]+?\\\)|\\\[[\s\S]+?\\\]/.test(content)) return true;
  const equationLines = content.split(/\r?\n/).filter((line) =>
    /^[a-z0-9()[\].+\-*/^\s]+=[a-z0-9()[\].+\-*/^\s]+$/i.test(line.trim()) &&
    /\d|[a-z]/i.test(line),
  );
  return equationLines.length > 0 && /\b(?:solve|equation|calculate|simplify|factor|derive|integrate|differentiate)\b/i.test(content);
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
