import { InsufficientActionsError } from '../errors/InsufficientActionsError.js';

const FRIENDLY_SWARM =
  "I'm putting the finishing touches on this — here's a helpful answer while XROGA keeps working in the background.";

export function sanitizeErrorForUser(err: unknown): string {
  if (err instanceof InsufficientActionsError) {
    return err.message;
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
export function sanitizeSwarmSsePayload(err: unknown): Record<string, unknown> {
  if (err instanceof InsufficientActionsError) {
    return { ...err.toJSON(), event: 'out_of_actions' };
  }
  return {
    success: true,
    message: FRIENDLY_SWARM,
    delta: FRIENDLY_SWARM,
  };
}
