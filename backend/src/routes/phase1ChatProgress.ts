import { Router } from 'express';
import { readIntent } from '../ai/intentReasoning.js';
import { understandingProgress } from '../ai/startupProgress.js';
import { publicAiPayload } from '../lib/publicAiIdentity.js';
import { generateReasoningSummary, reasoningSummaryEnabled } from '../ai/reasoningSummary.js';
import type { AuthRequest } from '../middleware/auth.js';

/**
 * Optional live progress for the Workspace chat answer lane.
 *
 * `POST /api/phase1/chat` answers with one JSON body. A client that sends
 * `Accept: text/event-stream` instead gets the same answer as the final `result` event,
 * preceded by real progress frames, so the Workspace can show what is happening while the
 * answer is prepared. Every other client is untouched: this router calls `next()` without
 * changing anything.
 *
 * What a frame may say:
 * - the deterministic reading of the request (`readIntent`), which
 *   is computed here, costs no model call and contains no provider reasoning text;
 * - that the request reached the answer lane and is being prepared.
 * Nothing is reported that the server has not actually done, and there are no percentages.
 *
 * The existing handler is not modified. It still authorises, meters and answers exactly as
 * before; this router only relays its single JSON response as the last frame, together with
 * its HTTP status so a refusal or a quota error is still a refusal on the client.
 */
const router = Router();

const HEARTBEAT_MS = 10_000;

function wantsStream(accept: unknown): boolean {
  return typeof accept === 'string' && accept.toLowerCase().includes('text/event-stream');
}

router.post('/chat', (req: AuthRequest, res, next) => {
  if (!wantsStream(req.headers.accept)) return next();

  const message = typeof req.body?.message === 'string' ? req.body.message
    : typeof req.body?.prompt === 'string' ? req.body.prompt : '';

  res.status(200);
  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders?.();

  let open = true;
  const write = (event: string, data: unknown) => {
    if (!open || res.writableEnded || res.destroyed) return;
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  };

  const heartbeat = setInterval(() => {
    if (open && !res.writableEnded && !res.destroyed) res.write(': keep-alive\n\n');
  }, HEARTBEAT_MS);
  heartbeat.unref?.();
  res.once('close', () => { open = false; clearInterval(heartbeat); });

  write('progress', {
    agent: 'session',
    status: 'preparing_answer',
    message: 'Preparing your answer.',
    swarmStatusLabel: 'Working',
    swarmActivity: 'Preparing your answer',
  });

  try {
    if (message.trim()) {
      const reading = readIntent(message.trim());
      const line = understandingProgress(reading.reasoning);
      if (line) write('progress', publicAiPayload({ ...line }));
    }
  } catch {
    // The summary is optional. It must never prevent the answer.
  }

  // A short model-written note on the approach. It is a separate bounded call under the caller's own
  // tenant reservation, runs alongside the answer, and is dropped if the answer finishes first.
  if (message.trim() && req.userId && req.tenantContext && reasoningSummaryEnabled()) {
    const controller = new AbortController();
    res.once('close', () => controller.abort());
    void generateReasoningSummary({
      scope: { context: req.tenantContext, userId: req.userId },
      message: message.trim(),
      signal: controller.signal,
    }).then((summary) => {
      if (!summary || !open) return;
      write('progress', publicAiPayload({
        agent: 'session',
        status: 'reasoning_summary',
        message: summary,
        swarmStatusLabel: 'Thinking',
        swarmActivity: summary,
      }));
    });
  }

  // Relay the handler's one JSON body (and its status) as the final frame.
  const sendJson = res.json.bind(res);
  const originalStatus = res.status.bind(res);
  let status = 200;
  res.status = ((code: number) => { status = code; return res; }) as typeof res.status;
  res.json = ((body: unknown) => {
    clearInterval(heartbeat);
    res.status = originalStatus;
    res.json = sendJson;
    write('result', { status, body });
    open = false;
    res.end();
    return res;
  }) as typeof res.json;

  return next();
});

export default router;
