import { Router } from 'express';
import { z } from 'zod';
import { SwarmService, handleInsufficientActions } from '../services/SwarmService.js';
import { InsufficientActionsError } from '../errors/InsufficientActionsError.js';
import { initSSE, endSSE, sendSSE } from '../lib/sse.js';
import { sanitizeErrorForUser, sanitizeSwarmSsePayload } from '../lib/sanitizeUserResponse.js';
import type { AuthRequest } from '../middleware/auth.js';

const router = Router();

const executeSchema = z.object({
  prompt: z.string().min(1).max(10000),
  projectId: z.string().uuid().optional(),
  stream: z.boolean().optional(),
  history: z
    .array(
      z.object({
        role: z.enum(['user', 'assistant']),
        content: z.string().max(4000),
      })
    )
    .max(12)
    .optional(),
  attachments: z
    .array(
      z.object({
        url: z.string().min(1),
        mimeType: z.string().optional(),
        name: z.string().optional(),
      })
    )
    .max(4)
    .optional(),
  clientMeta: z
    .object({
      assistantMessageId: z.string().optional(),
      userMessageId: z.string().optional(),
      userPrompt: z.string().optional(),
      buildContinuation: z.boolean().optional(),
      buildOriginalPrompt: z.string().max(500).optional(),
      buildUpdate: z.boolean().optional(),
    })
    .optional(),
});

const FRIENDLY_FALLBACK =
  "I'm putting the finishing touches on this — here's a helpful answer while XROGA keeps working in the background.";

/**
 * Swarm execute – triggers Phase 2 feature routing via Natural Language Command.
 * Supports SSE streaming for Real-Time Progress Updates (Feature #6).
 */
router.post('/execute', async (req: AuthRequest, res) => {
  const parsed = executeSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid request — please check your prompt and try again.' });
    return;
  }

  const wantsStream =
    parsed.data.stream === true ||
    req.query.stream === 'true' ||
    req.headers.accept?.includes('text/event-stream');

  if (wantsStream) {
    initSSE(res);
    try {
      await SwarmService.runWithSSE(
        req.userId!,
        parsed.data.prompt,
        res,
        parsed.data.projectId,
        parsed.data.attachments,
        parsed.data.clientMeta,
        parsed.data.history
      );
      endSSE(res);
    } catch (err) {
      if (err instanceof InsufficientActionsError) {
        res.write(`event: error\ndata: ${JSON.stringify(err.toJSON())}\n\n`);
      } else {
        const payload = sanitizeSwarmSsePayload(err);
        sendSSE(res, { event: 'delta', data: { delta: payload.delta ?? FRIENDLY_FALLBACK } });
        sendSSE(res, {
          event: 'complete',
          data: {
            success: true,
            output: { type: 'chat', content: payload.message ?? FRIENDLY_FALLBACK },
            featureCategory: 'chat',
          },
        });
      }
      res.end();
    }
    return;
  }

  try {
    const result = await SwarmService.run(req.userId!, parsed.data.prompt, parsed.data.projectId);
    res.json(result);
  } catch (err) {
    if (err instanceof InsufficientActionsError) {
      handleInsufficientActions(res, err);
      return;
    }
    res.status(200).json({
      runId: crypto.randomUUID(),
      result: {
        success: true,
        iterations: 0,
        defectsFound: 0,
        output: { type: 'chat', content: sanitizeErrorForUser(err) },
      },
      actions: { success: true, remaining: 0, cost: 0 },
      featureCategory: 'chat',
    });
  }
});

router.get('/history', async (req: AuthRequest, res) => {
  try {
    const limit = Math.min(Number(req.query.limit) || 20, 50);
    const runs = await SwarmService.listRuns(req.userId!, limit);
    res.json(runs);
  } catch {
    res.json([]);
  }
});

router.get('/runs/:runId', async (req: AuthRequest, res) => {
  try {
    const runId = String(req.params.runId);
    const run = await SwarmService.getRun(req.userId!, runId);
    res.json(run);
  } catch {
    res.status(404).json({ error: 'Run not found' });
  }
});

router.get('/runs/:runId/status', async (req: AuthRequest, res) => {
  try {
    const runId = String(req.params.runId);
    const status = await SwarmService.getStatus(req.userId!, runId);
    res.json(status);
  } catch {
    res.json({ status: 'completed', currentAgent: null, iteration: 0 });
  }
});

export default router;
