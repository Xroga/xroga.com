import { InsufficientActionsError } from '../errors/InsufficientActionsError.js';

const FRIENDLY_SWARM =
  "I'm putting the finishing touches on this — here's a helpful answer while XROGA keeps working in the background.";

const BUILD_FAILURE_HINT =
  '⚠️ Build could not finish. Connect GitHub under Integrations, then try again. Ensure DEEPSEEK_CODE_API_KEY (or DEEPSEEK_API_KEY) is set on Fly.io.';

function isBuildPromptText(prompt: string): boolean {
  return /\b(build|create|make)\b[\s\S]{0,80}\b(website|site|shop|coffee|store|restaurant|app)\b/i.test(prompt);
}

export function sanitizeErrorForUser(err: unknown, prompt?: string): string {
  if (err instanceof InsufficientActionsError) {
    return err.message;
  }
  if (prompt && isBuildPromptText(prompt)) {
    const detail = err instanceof Error ? err.message?.slice(0, 100) : '';
    return detail ? `${BUILD_FAILURE_HINT}\n\n(${detail})` : BUILD_FAILURE_HINT;
  }
  return FRIENDLY_SWARM;
}

export function sanitizeSwarmJsonError(err: unknown): {
  success: boolean;
  message: string;
  code?: string;
} {
  if (err instanceof InsufficientActionsError) {
    return { success: false, message: err.message, code: 'OUT_OF_ACTIONS' };
  }
  return {
    success: true,
    message: FRIENDLY_SWARM,
  };
}

/** SSE error events — never expose stack traces or API failures */
export function sanitizeSwarmSsePayload(err: unknown, prompt?: string): Record<string, unknown> {
  if (err instanceof InsufficientActionsError) {
    return { ...err.toJSON(), event: 'out_of_actions' };
  }
  const message = sanitizeErrorForUser(err, prompt);
  return {
    success: true,
    message,
    delta: message,
    featureCategory: prompt && isBuildPromptText(prompt) ? 'landing_page' : 'chat',
  };
}
