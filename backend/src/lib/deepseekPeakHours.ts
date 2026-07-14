/**
 * DeepSeek peak windows (Beijing time): 09:00–12:00 and 14:00–18:00 → 2× pricing.
 * Soft nudge only — never blocks chat or builds.
 */

const BEIJING_OFFSET_MS = 8 * 60 * 60 * 1000;

export interface DeepSeekPeakStatus {
  isPeak: boolean;
  beijingHour: number;
  nudge: string | null;
}

function beijingParts(now = Date.now()): { hour: number; minute: number } {
  const d = new Date(now + BEIJING_OFFSET_MS);
  return { hour: d.getUTCHours(), minute: d.getUTCMinutes() };
}

export function getDeepSeekPeakStatus(now = Date.now()): DeepSeekPeakStatus {
  const { hour, minute } = beijingParts(now);
  const mins = hour * 60 + minute;
  const morning = mins >= 9 * 60 && mins < 12 * 60;
  const afternoon = mins >= 14 * 60 && mins < 18 * 60;
  const isPeak = morning || afternoon;
  return {
    isPeak,
    beijingHour: hour,
    nudge: isPeak
      ? 'DeepSeek is in peak hours — this build may run a bit slower. Chat and planning stay full speed.'
      : null,
  };
}
