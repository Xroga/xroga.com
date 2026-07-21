/**
 * Heuristic: prompt will gather live web + X sources (mirrors backend router RESEARCH_RE / REALTIME_RE).
 * Used only for wait-state UI — not for routing.
 */
const RESEARCH_WAIT_RE =
  /\b(research|latest|news|trends?|market|report|compare|sources?|citations?|web\s*search|current|today|breaking|x\.com|twitter|crypto\s*price|live\s*(web|search|data)|realtime|real[- ]time)\b/i;

export function promptWantsLiveResearch(prompt: string): boolean {
  const t = prompt.trim();
  if (!t) return false;
  return RESEARCH_WAIT_RE.test(t);
}
