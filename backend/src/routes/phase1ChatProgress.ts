import { Router } from 'express';
import { readIntent } from '../ai/intentReasoning.js';
import { understandingProgress } from '../ai/startupProgress.js';
import { publicAiPayload } from '../lib/publicAiIdentity.js';
import { generateReasoningSummary, planStage, planStep, reasoningSummaryEnabled } from '../ai/reasoningSummary.js';
import { withPartialSink, withProgressSink } from '../ai/progressChannel.js';
import { splitNativeOpenUiAnswer } from '../ai/nativeOpenUi.js';
import { publicAiText } from '../lib/publicAiIdentity.js';
import { redactSecrets } from '../lib/truthfulExecution.js';
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

/** Timing of what is shown while an answer is prepared. Tests replace these. */
export const progressTiming = {
  /** How often a long request says it is still running. */
  everyMs: 12_000,
  /** An answer quicker than this is sent at once: notes about it would only delay it. */
  notesMatterAfterMs: 12_000,
  /** How long a longer answer may wait for notes still being written, so they are not lost by a moment. */
  notesGraceMs: 2_500,
  summarize: generateReasoningSummary,
};

/** Each line only restates what is known while the request is still open. */
function stillWorking(sourceCount: number): readonly string[] {
  const found = sourceCount ? ` with ${sourceCount} ${sourceCount === 1 ? 'source' : 'sources'}` : '';
  return [
    `Still working on your answer${found}`,
    'Still working. The reply appears once it is complete and checked',
    'This one is taking longer than usual and is still running',
  ];
}

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

  // A long answer reports nothing while the model writes, so this says it is still running, in its own step.
  const sourceUrls = new Set<string>();
  let updates = 0;
  const still = (activityStatus: 'running' | 'completed' | 'failed', text: string) => write('progress', publicAiPayload({
    agent: 'session', status: 'step', activityId: 'still-working', activityStatus, message: text, swarmActivity: text,
  }));
  const reminder = setInterval(() => {
    const lines = stillWorking(sourceUrls.size);
    still('running', lines[Math.min(updates++, lines.length - 1)]!);
  }, progressTiming.everyMs);
  reminder.unref?.();
  res.once('close', () => clearInterval(reminder));

  // One real step that spans the whole handler: it ends when the handler's answer (or refusal) arrives.
  const preparing = (activityStatus: 'running' | 'completed' | 'failed', text: string) => write('progress', {
    agent: 'session',
    status: 'preparing_answer',
    activityId: 'preparing-answer',
    activityStatus,
    message: text,
    swarmStatusLabel: 'Working',
    swarmActivity: text,
  });
  preparing('running', 'Preparing your answer');

  // Files that arrived with this request, by their own names. Nothing is claimed about reading them.
  const files = Array.isArray(req.body?.attachments) ? req.body.attachments.slice(0, 8) : [];
  if (files.length) {
    const names = files.map((file: unknown) => String((file as { name?: unknown } | null)?.name ?? '').slice(0, 60)).filter(Boolean);
    const text = `Received ${files.length} attached ${files.length === 1 ? 'file' : 'files'}${names.length ? `: ${names.slice(0, 4).join(', ')}` : ''}`;
    write('progress', publicAiPayload({ agent: 'session', status: 'step', activityId: 'attached-files', activityStatus: 'completed', message: text, swarmActivity: text }));
  }

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
  let notes: Promise<void> | null = null;
  let notesArrived = false;
  const startedAt = Date.now();
  if (message.trim() && req.userId && req.tenantContext && reasoningSummaryEnabled()) {
    const controller = new AbortController();
    res.once('close', () => controller.abort());
    notes = progressTiming.summarize({
      scope: { context: req.tenantContext, userId: req.userId },
      message: message.trim(),
      signal: controller.signal,
    }).then((summary) => {
      notesArrived = true;
      if (!summary || !open) return;
      // One frame per note, so each appears as its own written update.
      for (const line of summary.split('\n')) {
        const step = planStep(line);
        const note = step ?? line;
        write('progress', publicAiPayload({
          agent: 'session',
          status: 'reasoning_summary',
          message: note,
          swarmStatusLabel: 'Thinking',
          swarmActivity: note,
          ...(step ? { planStep: true, planStage: planStage(line) } : {}),
        }));
      }
    });
  }

  // Relay the handler's one JSON body (and its status) as the final frame.
  const sendJson = res.json.bind(res);
  const originalStatus = res.status.bind(res);
  let status = 200;
  res.status = ((code: number) => { status = code; return res; }) as typeof res.status;
  res.json = ((body: unknown) => {
    clearInterval(heartbeat);
    clearInterval(reminder);
    res.status = originalStatus;
    res.json = sendJson;
    const finish = () => {
      if (status < 400) preparing('completed', 'Prepared your answer');
      else preparing('failed', 'Could not prepare the answer');
      if (updates) still(status < 400 ? 'completed' : 'failed', status < 400 ? 'Finished the answer' : 'Could not finish the answer');
      write('result', { status, body });
      open = false;
      res.end();
    };
    if (notes && !notesArrived && status < 400 && Date.now() - startedAt >= progressTiming.notesMatterAfterMs) {
      let timer: NodeJS.Timeout | undefined;
      void Promise.race([notes, new Promise<void>((resolve) => { timer = setTimeout(resolve, progressTiming.notesGraceMs); })])
        .catch(() => undefined)
        .then(() => { clearTimeout(timer); finish(); });
    } else finish();
    return res;
  }) as typeof res.json;

  // The answer as it is written: readable prose only, with the same identity and secret filtering as the
  // finished reply. The checked result that follows replaces it.
  let shown = '';
  const partial = (raw: string) => {
    const text = publicAiText(redactSecrets(splitNativeOpenUiAnswer(raw, true).text)).trim();
    if (!text || text === shown || text.startsWith('{')) return;
    shown = text;
    write('partial', { text });
  };

  return withPartialSink(partial, () => withProgressSink((frame) => {
    for (const source of frame.sources ?? []) sourceUrls.add(source.url);
    write('progress', publicAiPayload({ ...frame }));
  }, () => next()));
});

export default router;
