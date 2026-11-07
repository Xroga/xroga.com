export type CalculatorOperation =
  | 'sum'
  | 'difference'
  | 'product'
  | 'quotient'
  | 'average'
  | 'percentage'
  | 'percentage-change'
  | 'loan-payment'
  | 'compound-growth'
  | 'minimum'
  | 'maximum';

/** Standard amortization: monthly payment for a loan amount, annual rate in percent and term in years. */
export function loanPayment(principal: number, annualRatePercent: number, years: number): number {
  const months = years * 12;
  if (!(months > 0) || principal < 0 || annualRatePercent < 0) return Number.NaN;
  const monthly = annualRatePercent / 100 / 12;
  return monthly === 0 ? principal / months : principal * monthly / (1 - Math.pow(1 + monthly, -months));
}

/** Executes only allowlisted arithmetic operations; AI content is never evaluated as code. */
export function calculateValues(operation: CalculatorOperation, values: number[]): number {
  if (!values.length || values.some((value) => !Number.isFinite(value))) return Number.NaN;
  switch (operation) {
    case 'sum': return values.reduce((total, value) => total + value, 0);
    case 'difference': return values.slice(1).reduce((total, value) => total - value, values[0] ?? 0);
    case 'product': return values.reduce((total, value) => total * value, 1);
    case 'quotient': return values.slice(1).reduce((total, value) => value === 0 ? Number.NaN : total / value, values[0] ?? 0);
    case 'average': return values.reduce((total, value) => total + value, 0) / values.length;
    case 'percentage': return values.length >= 2 && values[1] !== 0 ? (values[0] / values[1]) * 100 : Number.NaN;
    case 'percentage-change': return values.length >= 2 && values[0] !== 0 ? ((values[1] - values[0]) / Math.abs(values[0])) * 100 : Number.NaN;
    case 'loan-payment': return values.length === 3 ? loanPayment(values[0], values[1], values[2]) : Number.NaN;
    case 'compound-growth': return values.length === 3 ? values[0] * Math.pow(1 + values[1] / 100, values[2]) : Number.NaN;
    case 'minimum': return Math.min(...values);
    case 'maximum': return Math.max(...values);
  }
}
