export interface DecisionCriterion { id: string; weight: number }
export interface DecisionOption { id: string; scores: Record<string, number> }

/** Returns weighted 0–10 scores from supplied values; never invents a missing score. */
export function scoreDecisionOptions<T extends DecisionOption>(
  criteria: ReadonlyArray<DecisionCriterion>,
  options: ReadonlyArray<T>,
  overrides: Readonly<Record<string, number>> = {},
): Array<T & { total: number }> | null {
  const weights = criteria.map((criterion) => overrides[criterion.id] ?? criterion.weight);
  if (!criteria.length || weights.some((weight) => !Number.isFinite(weight) || weight < 0 || weight > 10)) return null;
  const sum = weights.reduce((total, weight) => total + weight, 0);
  if (sum === 0) return null;
  if (options.some((option) => criteria.some((criterion) => {
    const score = option.scores[criterion.id];
    return !Number.isFinite(score) || score < 0 || score > 10;
  }))) return null;
  return options.map((option) => ({
    ...option,
    total: criteria.reduce((total, criterion, index) => total + option.scores[criterion.id]! * weights[index]!, 0) / sum,
  })).sort((left, right) => right.total - left.total);
}
