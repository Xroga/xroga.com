/** Strict math detection for the dedicated KaTeX solution renderer. */

function hasExplicitMathSignal(content: string): boolean {
  return (
    /\\\(|\\\[|\\frac\b|\\sqrt\b|\$\$/.test(content) ||
    /(?:^|\n)\s*[A-Za-z0-9().]+\s*=\s*[^\n]+/m.test(content) ||
    /(?:\d|\b[x-z]\b)\s*[+\-*/^=]\s*(?:\d|\b[x-z]\b)/i.test(content) ||
    /[∫∑√±×÷]/.test(content)
  );
}

export function isMathSolutionContent(content: string): boolean {
  if (!content?.trim() || !hasExplicitMathSignal(content)) return false;

  return (
    /^solving for\b/im.test(content) ||
    /^step\s+\d+\b/im.test(content) ||
    /\bsolve\s+for\s+[a-z]\b/i.test(content) ||
    /^answer\s*$/im.test(content) ||
    /\bin plain words:\s*/i.test(content) ||
    /^your problem\s*$/im.test(content) ||
    /^the bottom line\s*$/im.test(content)
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
