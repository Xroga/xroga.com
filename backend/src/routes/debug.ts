import { Router } from 'express';
import { z } from 'zod';
import { SwarmService, handleInsufficientActions } from '../services/SwarmService.js';
import { InsufficientActionsError } from '../errors/InsufficientActionsError.js';
import { computeDebugActionCost } from '../services/debugging/codeDebugger.js';
import { getSupabaseAdmin } from '../config/supabase.js';
import type { AuthRequest } from '../middleware/auth.js';

const router = Router();

const executeSchema = z.object({
  code: z.string().min(1).max(500000),
  filename: z.string().min(1).max(255).default('snippet.js'),
  language: z.string().optional(),
  projectId: z.string().uuid().optional(),
});

/**
 * Multi-Agent Debugging (#87)
 * Accepts code paste. Runs full Swarm loop with zero-defects guarantee.
 */
router.post('/execute', async (req: AuthRequest, res) => {
  const parsed = executeSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }

  const lineCount = parsed.data.code.split('\n').length;
  const actionCost = computeDebugActionCost(lineCount);

  try {
    const result = await SwarmService.run(
      req.userId!,
      `Debug ${parsed.data.filename}`,
      parsed.data.projectId,
      undefined,
      {
        lineCount,
        extras: {
          code: parsed.data.code,
          filename: parsed.data.filename,
          language: parsed.data.language,
        },
      }
    );

    const debugOutput = result.result.output as { type?: string; zeroDefects?: boolean; fixedCode?: string };

    if (parsed.data.projectId && debugOutput.fixedCode) {
      const supabase = getSupabaseAdmin();
      await supabase.from('project_files').insert({
        project_id: parsed.data.projectId,
        file_name: parsed.data.filename,
        file_type: 'code',
        content: debugOutput.fixedCode,
      });
    }

    res.json({
      success: result.result.success,
      result: result.result.output,
      swarm: result.result,
      actions: result.actions,
      actionCost,
    });
  } catch (err) {
    if (err instanceof InsufficientActionsError) {
      handleInsufficientActions(res, err);
      return;
    }
    res.status(500).json({ error: (err as Error).message });
  }
});

export default router;
