import type { ResponseNodeV2 } from './document';

/** Standard amortization: monthly payment for a loan amount, annual rate in percent and term in years. Kept local so this module has no other imports. */
function loanPayment(principal: number, annualRatePercent: number, years: number): number {
  const months = years * 12;
  if (!(months > 0) || principal < 0 || annualRatePercent < 0) return NaN;
  const monthly = annualRatePercent / 100 / 12;
  return monthly === 0 ? principal / months : principal * monthly / (1 - Math.pow(1 + monthly, -months));
}
export type CalculatorNode = Extract<ResponseNodeV2, { kind: 'calculator' }>;
export function validDerivedResults(node: CalculatorNode): boolean {
  const derived = node.derivedResults ?? [];
  const ids = new Set(node.inputs.map(input => input.id));
  return !ids.has('$result') && new Set(derived.map(item => item.id)).size === derived.length &&
    derived.every(item => item.operands.every(value => typeof value === 'number' || value === '$result' || ids.has(value)) &&
      (!['quotient', 'percentage', 'percentage-change'].includes(item.operation) || item.operands.length === 2) &&
      (!['loan-payment', 'compound-growth'].includes(item.operation) || item.operands.length === 3));
}

/** One bounded arithmetic step over original inputs or the primary result.
 * No expression parser, code evaluation, recursive references or network IO. */
export function derivedCalculationsV2(node: CalculatorNode, values: Record<string, string>) {
  const primary = calculateV2(node, values);
  return (node.derivedResults ?? []).map(item => {
    const inputs = item.operands.map((operand, index) => ({ id: String(index), label: String(index), value: 0 }));
    const resolved = Object.fromEntries(item.operands.map((operand, index) => [String(index),
      typeof operand === 'number' ? String(operand) : operand === '$result' ? String(primary) : values[operand]]));
    const derivedNode: CalculatorNode = { ...node, inputs, operation: item.operation, derivedResults: undefined };
    const raw = primary === null || !validDerivedResults(node) ? null : calculateV2(derivedNode, resolved);
    const value = raw === null ? null : item.rounding === 'floor' ? Math.floor(raw) : item.rounding === 'ceil' ? Math.ceil(raw) : item.rounding === 'round' ? Math.round(raw) : raw;
    // Display only: floating-point noise such as 9835.755000000001 is shown as 9835.755. The computed value is unchanged.
    const tidy = (value: string) => /^-?\d+(\.\d+)?$/.test(value) ? String(Number(Number(value).toPrecision(12))) : value;
    const expression = raw === null ? null : formulaV2(derivedNode, Object.fromEntries(Object.entries(resolved).map(([key, value]) => [key, tidy(value)])));
    return { ...item, value, formula: expression && item.rounding ? `${item.rounding}(${expression})` : expression };
  });
}
/** Display the exact supported operation, never a model-authored executable formula. */
export function formulaV2(node: CalculatorNode, values: Record<string, string>): string | null {
  if (calculateV2(node, values) == null) return null;
  const inputs = node.inputs.map(input => values[input.id].trim());
  const [a, b] = inputs;
  switch (node.operation) {
    case 'sum': return inputs.join(' + ');
    case 'difference': return inputs.join(' − ');
    case 'product': return inputs.map(value => Number(value) < 0 ? `(${value})` : value).join(' × ');
    case 'quotient': return `${a} ÷ ${b}`;
    case 'average': return `(${inputs.join(' + ')}) ÷ ${inputs.length}`;
    case 'percentage': return `${a} × ${b} ÷ 100`;
    case 'percentage-change': return `(${b} − ${a}) ÷ ${a} × 100`;
    case 'loan-payment': return `${a} × r ÷ (1 − (1 + r)^−n), r = ${b}% ÷ 12, n = ${inputs[2]} × 12`;
    case 'compound-growth': return `${a} × (1 + ${b}%)^${inputs[2]}`;
    case 'minimum': return `min(${inputs.join(', ')})`;
    case 'maximum': return `max(${inputs.join(', ')})`;
  }
}
export function calculateV2(node: CalculatorNode, values: Record<string, string>): number | null {
  const numbers = node.inputs.map(input => {
    const raw = values[input.id]; const value = typeof raw === 'string' && raw.trim() ? Number(raw) : NaN;
    return Number.isFinite(value) && (input.min == null || value >= input.min) && (input.max == null || value <= input.max) ? value : NaN;
  });
  if (!numbers.length || numbers.some(n => !Number.isFinite(n))) return null;
  const [a, b, c] = numbers; let result: number;
  switch (node.operation) {
    case 'sum': result = numbers.reduce((s, n) => s + n, 0); break;
    case 'difference': result = numbers.slice(1).reduce((s, n) => s - n, a); break;
    case 'product': result = numbers.reduce((s, n) => s * n, 1); break;
    case 'quotient': result = numbers.length === 2 && b !== 0 ? a / b : NaN; break;
    case 'average': result = numbers.reduce((s, n) => s + n, 0) / numbers.length; break;
    case 'percentage': result = numbers.length === 2 ? a * b / 100 : NaN; break;
    case 'percentage-change': result = numbers.length === 2 && a !== 0 ? (b - a) / a * 100 : NaN; break;
    case 'loan-payment': result = numbers.length === 3 ? loanPayment(a, b, c) : NaN; break;
    case 'compound-growth': result = numbers.length === 3 ? a * Math.pow(1 + b / 100, c) : NaN; break;
    case 'minimum': result = Math.min(...numbers); break;
    case 'maximum': result = Math.max(...numbers); break;
  }
  return Number.isFinite(result) ? result : null;
}
