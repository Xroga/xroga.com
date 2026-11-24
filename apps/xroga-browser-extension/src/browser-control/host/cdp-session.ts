// Raw CDP commands through chrome.debugger, sent to the session of a frame that Puppeteer reports.
// Elements are never reached through Puppeteer; every element command goes through here.
import { LayerError } from '../protocol/errors';

/** The pseudo session ID ExtensionTransport gives the page target. chrome.debugger addresses it with no sessionId. */
export const PAGE_SESSION_ALIAS = 'pageTargetSessionId';

/** Session ID as the layer uses it: undefined for the tab's root session. */
export function normalizeSessionId(sessionId: string | undefined): string | undefined {
  return sessionId === PAGE_SESSION_ALIAS ? undefined : sessionId;
}

/** @deprecated name kept for the step 0.2 spike; use normalizeSessionId. */
export const toDebuggerSessionId = normalizeSessionId;

export class CdpCommandError extends Error {
  constructor(
    readonly method: string,
    message: string,
  ) {
    super(`${method}: ${message}`);
    this.name = 'CdpCommandError';
  }
}

/** A command that did not answer in time. It cannot be cancelled, so its outcome is unknown. */
export class CdpTimeoutError extends Error {
  constructor(
    readonly method: string,
    readonly timeoutMs: number,
  ) {
    super(`${method}: no answer within ${timeoutMs} ms`);
    this.name = 'CdpTimeoutError';
  }
}

/** Timeouts: 10 s for captures, 5 s otherwise. */
export const DEFAULT_COMMAND_TIMEOUT_MS = 30_000;
export const CAPTURE_TIMEOUT_MS = 10_000;

/** One input the agent dispatched through the debugger: what the page will see as a trusted event, to tell it from a person's. */
export interface AgentInput { tabId: number; t: number; kind: 'mouse' | 'key' | 'wheel' | 'touch'; x?: number; y?: number }
const agentInputs: AgentInput[] = [];
/** The agent's own recent input (newest last, the last 200, at most 30 s old). */
export function recentAgentInput(tabId: number, sinceMs: number): AgentInput[] {
  const from = Date.now() - sinceMs;
  return agentInputs.filter(a => a.tabId === tabId && a.t >= from);
}
/** Also called for commands that reach Chrome another way (Puppeteer's keyboard): every agent input must be in this log, or the person-guard and the recorder take it for the person's. */
export function logAgentInput(tabId: number, method: string, params: Record<string, unknown>): void {
  let kind: AgentInput['kind'] | null = null;
  if (method === 'Input.dispatchMouseEvent') kind = params.type === 'mouseWheel' ? 'wheel' : params.type === 'mouseMoved' ? null : 'mouse';
  else if (method === 'Input.dispatchKeyEvent' || method === 'Input.insertText' || method === 'Input.imeSetComposition') kind = 'key';
  else if (method === 'Input.dispatchTouchEvent') kind = 'touch';
  else if (method === 'Input.dispatchDragEvent') kind = 'mouse';
  if (!kind) return;
  agentInputs.push({ tabId, t: Date.now(), kind, x: typeof params.x === 'number' ? params.x : undefined, y: typeof params.y === 'number' ? params.y : undefined });
  const cut = Date.now() - 30_000;
  while (agentInputs.length > 200 || (agentInputs.length && agentInputs[0]!.t < cut)) agentInputs.shift();
}

/** Sends one command. `cancel`, when it settles first, rejects the command (used for detach). */
export async function sendRaw<T = unknown>(
  tabId: number,
  sessionId: string | undefined,
  method: string,
  params: object = {},
  timeoutMs = DEFAULT_COMMAND_TIMEOUT_MS,
  cancel?: Promise<never>,
): Promise<T> {
  const target: chrome.debugger.DebuggerSession = { tabId };
  if (method.startsWith('Input.')) logAgentInput(tabId, method, params as Record<string, unknown>);
  const debuggerSessionId = normalizeSessionId(sessionId);
  if (debuggerSessionId) target.sessionId = debuggerSessionId;

  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new CdpTimeoutError(method, timeoutMs)), timeoutMs);
  });
  try {
    const command = chrome.debugger
      .sendCommand(target, method, params as Record<string, unknown>)
      .catch((error: unknown) => {
        const message = error instanceof Error ? error.message : String(error);
        if (/not attached|Detached while handling command|No tab with given id/i.test(message)) {
          throw new LayerError('DEBUGGER_DETACHED', `${method}: ${message}`, { delivered: 'unknown' });
        }
        throw new CdpCommandError(method, message);
      });
    return (await Promise.race(cancel ? [command, timeout, cancel] : [command, timeout])) as T;
  } finally {
    clearTimeout(timer);
  }
}
