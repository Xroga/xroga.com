/**
 * Makes a model request fit the limits the Xroga server enforces on every field (backend/src/routes/localBrowser.ts: `message`, `tool`,
 * `toolCall`). A request over any limit is refused whole (BROWSER_REQUEST_INVALID) and the run pauses before doing anything, which is what a
 * long page or a long app-tool description used to cause. Text over a limit keeps its beginning and its end, with a note of what was cut,
 * so nothing is silently lost and nothing is invented.
 */
export const MAX_TEXT = 48_000;
export const MAX_DESCRIPTION = 6_000;
export const MAX_ARGUMENTS = 16_000;

export function clip(text: string, limit: number): string {
  if (text.length <= limit) return text;
  const note = `\n[… ${text.length - limit + 80} characters cut to fit the request …]\n`;
  const keep = Math.max(0, limit - note.length);
  const head = Math.ceil(keep * 0.7);
  return text.slice(0, head) + note + text.slice(text.length - (keep - head));
}

type Json = Record<string, unknown>;

function fitContent(content: unknown): unknown {
  if (typeof content === 'string') return clip(content, MAX_TEXT);
  if (Array.isArray(content)) {
    return content.slice(0, 24).map(part => {
      const p = part as Json;
      return p && typeof p.text === 'string' ? { ...p, text: clip(p.text, MAX_TEXT) } : part;
    });
  }
  return content;
}

export function fitRequest<T extends { messages?: unknown; tools?: unknown }>(request: T): T {
  const out: Json = { ...request };
  if (Array.isArray(request.messages)) {
    out.messages = (request.messages as Json[]).map(message => {
      const next: Json = { ...message };
      if ('content' in message) next.content = fitContent(message.content);
      if (Array.isArray(message.tool_calls)) {
        next.tool_calls = (message.tool_calls as Json[]).slice(0, 20).map(call => {
          const fn = call.function as Json | undefined;
          // A tool call's arguments are JSON and must stay JSON: a call too long to send is not clipped into broken text.
          return fn && typeof fn.arguments === 'string' && fn.arguments.length > MAX_ARGUMENTS
            ? { ...call, function: { ...fn, arguments: JSON.stringify({ note: 'arguments were too long to resend' }) } }
            : call;
        });
      }
      return next;
    });
  }
  if (Array.isArray(request.tools)) {
    out.tools = (request.tools as Json[]).map(tool => {
      const fn = tool.function as Json | undefined;
      return fn && typeof fn.description === 'string' && fn.description.length > MAX_DESCRIPTION
        ? { ...tool, function: { ...fn, description: clip(fn.description, MAX_DESCRIPTION) } }
        : tool;
    });
  }
  return out as T;
}
