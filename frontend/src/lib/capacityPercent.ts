/**
 * Capacity percentages are a public product contract: 0–100 or unknown.
 *
 * The backend is authoritative, but the client clamps defensively so stale cached
 * responses or a partially rolled-out API can never render impossible values such
 * as 600% or 815.2%.
 */
export function normalizeCapacityPercent(
  value: number | null | undefined,
): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  return Math.min(100, Math.max(0, Math.round(value * 10) / 10));
}
