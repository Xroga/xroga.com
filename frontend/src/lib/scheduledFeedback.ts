const SUBMITTED_KEY = 'xroga_feedback_submitted';
const LAST_PROMPT_KEY = 'xroga_feedback_last_prompt';
const FIRST_VISIT_KEY = 'xroga_first_visit';

const FIVE_HOURS_MS = 5 * 60 * 60 * 1000;
const FIVE_DAYS_MS = 5 * 24 * 60 * 60 * 1000;

export function markFeedbackSubmitted() {
  if (typeof window === 'undefined') return;
  localStorage.setItem(SUBMITTED_KEY, '1');
}

export function hasSubmittedFeedback(): boolean {
  if (typeof window === 'undefined') return false;
  return localStorage.getItem(SUBMITTED_KEY) === '1';
}

export function getFirstVisitTime(): number {
  if (typeof window === 'undefined') return Date.now();
  const stored = localStorage.getItem(FIRST_VISIT_KEY);
  if (stored) return Number(stored);
  const now = Date.now();
  localStorage.setItem(FIRST_VISIT_KEY, String(now));
  return now;
}

export function shouldShowScheduledFeedback(): boolean {
  if (typeof window === 'undefined') return false;
  if (hasSubmittedFeedback()) return false;

  const now = Date.now();
  const firstVisit = getFirstVisitTime();
  const lastPrompt = Number(localStorage.getItem(LAST_PROMPT_KEY) ?? 0);

  if (now - firstVisit >= FIVE_HOURS_MS && lastPrompt === 0) return true;
  if (lastPrompt > 0 && now - lastPrompt >= FIVE_DAYS_MS) return true;
  return false;
}

export function markFeedbackPromptShown() {
  if (typeof window === 'undefined') return;
  localStorage.setItem(LAST_PROMPT_KEY, String(Date.now()));
}
