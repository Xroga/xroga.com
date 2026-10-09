/**
 * Command bar rules (V7 §22–§28), kept pure so they can be tested.
 *
 * The demo request is an overlay, never the input's value, so it can't overwrite what someone typed.
 * Focusing or typing pauses only that overlay; the stage keeps running (the clock never reads bar state).
 * Submitting uses the product's existing hand-off: the prompt goes into localStorage under
 * PENDING_PROMPT_KEY, the visitor lands in /workspace (or signs up first), and the workspace's
 * TerminalChatContext picks it up and submits it. Nothing is put in the URL.
 */

export const RESUME_AFTER_BLUR_MS = 2000;

export interface BarState {
  value: string;
  focused: boolean;
  /** Demo text may come back after this time (ms, performance clock). */
  resumeAt: number;
}

/** Whether the demo request overlay is shown. */
export function demoVisible(s: BarState, now: number): boolean {
  return s.value.length === 0 && !s.focused && now >= s.resumeAt;
}

/** Next state after the field loses focus: empty fields resume the demo after a pause, typed text stays. */
export function onBlur(s: BarState, now: number): BarState {
  return { ...s, focused: false, resumeAt: s.value.length ? Infinity : now + RESUME_AFTER_BLUR_MS };
}

export function onFocus(s: BarState): BarState {
  return { ...s, focused: true };
}

/** Typing replaces only the user's own value. */
export function onType(s: BarState, value: string): BarState {
  return { ...s, value, resumeAt: value.length ? Infinity : s.resumeAt };
}

export interface Submission {
  /** Prompt to hand to the workspace, exactly as typed, or null for a fresh start. */
  prompt: string | null;
  route: '/workspace' | '/auth/signup';
}

/** An empty submit opens the workspace without a prompt; it never sends the demo text on someone's behalf. */
export function submission(value: string, signedIn: boolean): Submission {
  return { prompt: value.trim().length ? value : null, route: signedIn ? '/workspace' : '/auth/signup' };
}
