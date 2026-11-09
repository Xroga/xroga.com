import { defineFunction } from "@openuidev/react-lang";
import { z } from "zod/v4";
import { agg, aggregate, finite, groups, list, numbers, read, toNum, type Agg } from "./shared";

const keyValue = () => z.array(z.object({ key: z.union([z.string(), z.number()]), value: z.number() }));
// Untyped arrays (a pluck over rows that lack the field) can still hold nulls
const finiteOnly = (values: unknown[]) => values.filter((v): v is number => typeof v === "number" && Number.isFinite(v));
const defaultAgg = (field: string | undefined, how: Agg | undefined): Agg => how ?? (field ? "sum" : "count");

/** Copy of each row with `field` replaced; field "" maps a list of numbers. */
function mapField(rows: unknown[], field: string, values: number[]): unknown[] {
  return rows.map((row, i) => (field ? { ...(row as object), [field]: values[i] } : values[i]));
}

export const GroupBy = defineFunction({
  name: "GroupBy",
  description:
    'One row per distinct key, in first-seen order; value is agg of field (default "sum"), or the row count without a field',
  params: z.object({ rows: list().max(160), key: z.string(), field: z.string().optional(), agg: agg().optional() }),
  returns: keyValue(),
  fn: ({ rows, key, field, agg: how }) =>
    [...groups(rows, key)].map(([k, members]) => ({ key: k, value: aggregate(members, field, defaultAgg(field, how)) })),
});

export const Top = defineFunction({
  name: "Top",
  description: 'The n rows with the largest field ("asc": the smallest)',
  params: z.object({ rows: list().max(160), field: z.string(), n: z.number(), direction: z.enum(["desc", "asc"]).optional() }),
  returns: list(),
  fn: ({ rows, field, n, direction = "desc" }) => {
    const sign = direction === "asc" ? 1 : -1;
    const ranked = rows
      .map((row, i) => ({ row, i, v: toNum(read(row, field)) }))
      .sort((a, b) => {
        if (a.v === null || b.v === null) return a.v === b.v ? a.i - b.i : a.v === null ? 1 : -1;
        return (a.v - b.v) * sign || a.i - b.i;
      });
    return ranked.slice(0, Math.max(0, Math.trunc(n))).map((r) => r.row);
  },
});

/** Orders two field values: numbers by value, anything else (such as "YYYY-MM-DD") as text. */
function compare(a: unknown, b: unknown): number {
  const x = toNum(a);
  const y = toNum(b);
  if (x !== null && y !== null) return x - y;
  const s = String(a);
  const t = String(b);
  return s < t ? -1 : s > t ? 1 : 0;
}

export const Between = defineFunction({
  name: "Between",
  description:
    'Rows whose field is from min to max, both included; compares numbers, or text such as "YYYY-MM-DD" dates. Leave min or max null for an open end',
  params: z.object({ rows: list().max(160), field: z.string(), min: z.any().optional(), max: z.any().optional() }),
  returns: list(),
  fn: ({ rows, field, min, max }) =>
    rows.filter((row) => {
      const v = read(row, field);
      if (v == null) return false;
      return (min == null || compare(v, min) >= 0) && (max == null || compare(v, max) <= 0);
    }),
});

export const Cumulative = defineFunction({
  name: "Cumulative",
  description: 'Copy of the rows with field replaced by its running total (field "" for a list of numbers)',
  params: z.object({ rows: list().max(160), field: z.string() }),
  returns: list(),
  fn: ({ rows, field }) => {
    let total = 0;
    return mapField(rows, field, rows.map((row) => (total += toNum(read(row, field)) ?? 0)));
  },
});

export const MovingAvg = defineFunction({
  name: "MovingAvg",
  description: 'Copy of the rows with field replaced by the average of its last window values (field "" for a list of numbers)',
  params: z.object({ rows: list().max(160), field: z.string(), window: z.number() }),
  returns: list(),
  fn: ({ rows, field, window }) => {
    const w = Math.trunc(window);
    if (w < 1) throw new Error("window must be at least 1");
    const values = rows.map((row) => toNum(read(row, field)) ?? 0);
    const averages = values.map((_, i) => {
      const span = values.slice(Math.max(0, i - w + 1), i + 1);
      return span.reduce((a, b) => a + b, 0) / span.length;
    });
    return mapField(rows, field, averages);
  },
});

export const Change = defineFunction({
  name: "Change",
  description: "Percent change from previous to current, e.g. @Change(120, 100) is 20; null when previous is 0",
  params: z.object({ current: z.number(), previous: z.number() }),
  returns: z.number().nullable(),
  // No previous value is normal while data loads, so it is null without an error
  fn: ({ current, previous }) => (previous === 0 ? null : finite(((current - previous) / Math.abs(previous)) * 100)),
});

export const Stats = defineFunction({
  name: "Stats",
  description: "Summary of numbers, all zeros for an empty list",
  params: z.object({ values: numbers().max(160) }),
  returns: z.object({
    count: z.number(),
    min: z.number(),
    max: z.number(),
    mean: z.number(),
    median: z.number(),
    stdev: z.number(),
  }),
  fn: ({ values: raw }) => {
    const values = finiteOnly(raw);
    const count = values.length;
    if (!count) return { count: 0, min: 0, max: 0, mean: 0, median: 0, stdev: 0 };
    const sorted = [...values].sort((a, b) => a - b);
    const mean = values.reduce((a, b) => a + b, 0) / count;
    const mid = Math.floor(count / 2);
    const median = count % 2 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
    const stdev = Math.sqrt(values.reduce((a, v) => a + (v - mean) ** 2, 0) / count);
    return { count, min: sorted[0]!, max: sorted[count - 1]!, mean, median, stdev };
  },
});
