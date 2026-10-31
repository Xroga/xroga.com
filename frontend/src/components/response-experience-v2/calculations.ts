import type { ResponseNodeV2 } from './document';
export type CalculatorNode = Extract<ResponseNodeV2, { kind: 'calculator' }>;
export function calculateV2(node: CalculatorNode, values: Record<string, string>): number | null {
  const numbers = node.inputs.map(input => {
    const raw = values[input.id]; const value = typeof raw === 'string' && raw.trim() ? Number(raw) : NaN;
    return Number.isFinite(value) && (input.min == null || value >= input.min) && (input.max == null || value <= input.max) ? value : NaN;
  });
  if (!numbers.length || numbers.some(n => !Number.isFinite(n))) return null;
  const [a, b] = numbers; let result: number;
  switch (node.operation) {
    case 'sum': result = numbers.reduce((s, n) => s + n, 0); break;
    case 'difference': result = numbers.slice(1).reduce((s, n) => s - n, a); break;
    case 'product': result = numbers.reduce((s, n) => s * n, 1); break;
    case 'quotient': result = numbers.length === 2 && b !== 0 ? a / b : NaN; break;
    case 'average': result = numbers.reduce((s, n) => s + n, 0) / numbers.length; break;
    case 'percentage': result = numbers.length === 2 ? a * b / 100 : NaN; break;
    case 'percentage-change': result = numbers.length === 2 && a !== 0 ? (b - a) / a * 100 : NaN; break;
    case 'minimum': result = Math.min(...numbers); break;
    case 'maximum': result = Math.max(...numbers); break;
  }
  return Number.isFinite(result) ? result : null;
}
