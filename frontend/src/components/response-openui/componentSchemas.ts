import { z } from 'zod/v4';

const scalar = z.union([z.string(), z.number(), z.boolean(), z.null()]);

// Property order is the public argument order for these OpenUI components.
export const tableProps = z.object({
  columns: z.array(z.string()),
  rows: z.array(z.array(scalar)),
  title: z.string(),
});

export const chartProps = z.object({
  type: z.enum(['bar', 'line', 'area', 'pie', 'donut', 'scatter']),
  data: z.array(z.record(z.string(), z.union([z.string(), z.number()]))),
  x: z.string().optional(),
  series: z.array(z.string()).optional(),
  format: z.enum(['number', 'currency', 'percent']).optional(),
  currency: z.string().optional(),
  stacked: z.boolean().optional(),
  height: z.number().optional(),
});
