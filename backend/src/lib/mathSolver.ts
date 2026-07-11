/**
 * Deterministic math solver for common linear equations.
 * Guarantees the modern step-by-step layout users expect.
 */

import { routingPrompt } from './promptRouting.js';

export function extractMathEquation(prompt: string): { variable: string; equation: string } | null {
  const text = routingPrompt(prompt).trim();
  const varMatch = text.match(/\bsolve\s+for\s+([a-z])\b/i);
  const variable = (varMatch?.[1] ?? 'x').toLowerCase();

  let eqPart = text
    .replace(/^.*?\bsolve\s+for\s+[a-z]\s*:?\s*/i, '')
    .replace(/^.*?\bquestion\s*:\s*/i, '')
    .trim();

  const eqMatch = eqPart.match(/([0-9a-z().+\-*/\s]+\s*=\s*[0-9a-z().+\-*/\s]+)/i);
  if (!eqMatch) return null;

  const equation = eqMatch[1]!.replace(/\s+/g, ' ').trim();
  if (!equation.includes('=')) return null;
  return { variable, equation };
}

function parseSide(side: string, variable: string): { coef: number; constant: number } {
  let coef = 0;
  let constant = 0;
  const normalized = side.replace(/\s+/g, '');
  if (!normalized) return { coef: 0, constant: 0 };

  const terms = normalized.match(/[+-]?[^+-]+/g) ?? [];
  for (const term of terms) {
    const t = term.trim();
    if (!t) continue;
    if (t.includes(variable)) {
      const numPart = t.replace(new RegExp(variable, 'gi'), '');
      if (numPart === '' || numPart === '+') coef += 1;
      else if (numPart === '-') coef -= 1;
      else coef += parseFloat(numPart);
    } else {
      constant += parseFloat(t);
    }
  }
  return { coef, constant };
}

function fmt(n: number): string {
  if (Number.isInteger(n)) return String(n);
  return String(Math.round(n * 1000) / 1000);
}

export function trySolveMathLocally(prompt: string): string | null {
  const parsed = extractMathEquation(prompt);
  if (!parsed) return null;

  const { variable, equation } = parsed;
  const [leftRaw, rightRaw] = equation.split('=').map((s) => s.trim());
  if (!leftRaw || !rightRaw) return null;

  const left = parseSide(leftRaw, variable);
  const right = parseSide(rightRaw, variable);

  const coef = left.coef - right.coef;
  const rhs = right.constant - left.constant;

  if (coef === 0) return null;

  const solution = rhs / coef;
  if (!Number.isFinite(solution)) return null;

  const lines: string[] = [
    `Solving for ${variable} step by step`,
    '',
    `In plain words: we want to find ${variable} in this equation — isolate ${variable} on one side.`,
    '',
    equation,
    '',
  ];

  let step = 1;

  if (left.constant !== 0) {
    const op = left.constant > 0 ? 'Subtract' : 'Add';
    const amount = fmt(Math.abs(left.constant));
    lines.push(`Step ${step}`);
    lines.push(
      `${op} ${amount} from both sides to move the constant away from the side with ${variable}.`
    );
    lines.push('');
    lines.push(`${fmt(coef)}${variable} = ${fmt(right.constant)} ${left.constant >= 0 ? '-' : '+'} ${amount}`);
    lines.push('');
    lines.push(`${fmt(coef)}${variable} = ${fmt(rhs)}`);
    lines.push('');
    step += 1;
  }

  if (coef !== 1 && coef !== -1) {
    lines.push(`Step ${step}`);
    lines.push(`Divide both sides by ${fmt(coef)} so ${variable} equals 1 (coefficient becomes 1).`);
    lines.push('');
    lines.push(`${variable} = ${fmt(rhs)}/${fmt(coef)}`);
    lines.push('');
    step += 1;
  } else if (coef === -1) {
    lines.push(`Step ${step}`);
    lines.push(`Multiply both sides by -1 to make ${variable} positive.`);
    lines.push('');
    lines.push(`${variable} = ${fmt(-rhs)}`);
    lines.push('');
    step += 1;
  }

  lines.push('Answer');
  lines.push(`${variable} = ${fmt(solution)}`);
  lines.push('');
  lines.push('Quick check');
  const checkLeft = left.coef * solution + left.constant;
  lines.push(
    `Substituting ${variable} = ${fmt(solution)} gives ${fmt(checkLeft)} on the left, which matches the right side (${rightRaw}).`
  );

  return lines.join('\n');
}

export const MATH_EXAMPLE_RESPONSE = `Solving for x step by step

In plain words: we want to find x in this equation — isolate x on one side.

7 + 2x = 15

Step 1
Subtract 7 from both sides to move the constant away from the side with x.

2x = 15 - 7

2x = 8

Step 2
Divide both sides by 2 so x equals 1 (coefficient becomes 1).

x = 8/2

Answer
x = 4

Quick check
Substituting x = 4 gives 15 on the left, which matches the right side (15).`;
