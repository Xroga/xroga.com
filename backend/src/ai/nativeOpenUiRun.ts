import { z } from 'zod';

const runSchema = z.object({
  expiresAt: z.string().datetime(),
  maximumCostMicroUsd: z.number().int().positive().max(50_000),
  maximumTotalMicroUsd: z.number().int().positive().max(100_000),
  slots: z.array(z.object({
    id: z.string().uuid(),
    label: z.string().trim().min(1).max(100),
    prompt: z.string().trim().min(1).max(6000),
  }).strict()).min(1).max(30),
}).strict().superRefine((run, ctx) => {
  if (run.maximumCostMicroUsd * run.slots.length > run.maximumTotalMicroUsd) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['maximumTotalMicroUsd'], message: 'Approved slots exceed the run cap.' });
  }
  if (new Set(run.slots.map(slot => slot.id.toLowerCase())).size !== run.slots.length) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['slots'], message: 'Slot IDs must be distinct.' });
  }
});

export function readNativeOpenUiRun(
  environment: string | undefined,
  configuration: string | undefined,
  now = Date.now(),
) {
  if (environment !== 'staging' || !configuration || configuration.length > 200_000) return null;
  try {
    const result = runSchema.safeParse(JSON.parse(configuration));
    if (!result.success || Date.parse(result.data.expiresAt) <= now) return null;
    return result.data;
  } catch {
    return null;
  }
}
