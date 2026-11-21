import { defineFunction } from '@openuidev/react-lang';
import { z } from 'zod/v4';
import { read, same } from './shared';

// Bounded adaptations of Open Intelligent UI lists.ts and colors.ts (MIT).
const items = () => z.array(z.any()).max(160);
const text = () => z.string().max(8000);
const sequence = () => z.union([items(), text()]);
const hex = () => z.string().regex(/^#?[\da-f]{3}(?:[\da-f]{3})?$/i);

export const Includes = defineFunction({
  name: 'Includes',
  description: 'Whether a local list contains a value, or a string contains the supplied text.',
  params: z.object({ list: sequence(), item: z.any() }),
  returns: z.boolean(),
  fn: ({ list, item }) => typeof list === 'string' ? item != null && list.includes(String(item)) : list.some(value => same(value, item)),
});

export const Find = defineFunction({
  name: 'Find',
  description: 'First local row whose field equals the supplied value, or null. Empty field compares the whole item.',
  params: z.object({ list: items(), field: z.string().max(120), value: z.any() }),
  returns: z.any(),
  fn: ({ list, field, value }) => list.find(item => same(read(item, field), value)) ?? null,
});

export const Take = defineFunction({
  name: 'Take',
  description: 'First n items from a local list, or the last n when n is negative.',
  params: z.object({ list: items(), n: z.number().int() }),
  returns: items(),
  fn: ({ list, n }) => n >= 0 ? list.slice(0, n) : list.slice(n),
});

export const Slice = defineFunction({
  name: 'Slice',
  description: 'Local items or text from start up to end (exclusive). Negative indices count from the end.',
  params: z.object({ list: sequence(), start: z.number().int(), end: z.number().int().optional() }),
  returns: sequence(),
  fn: ({ list, start, end }) => list.slice(start, end),
});

export const Reverse = defineFunction({
  name: 'Reverse',
  description: 'A local list in reverse order without changing the original.',
  params: z.object({ list: items() }),
  returns: items(),
  fn: ({ list }) => [...list].reverse(),
});

export const Chunk = defineFunction({
  name: 'Chunk',
  description: 'Split a bounded local list into consecutive batches of the specified size.',
  params: z.object({ list: items(), size: z.number().int().min(1).max(160) }),
  returns: z.array(items()).max(160),
  fn: ({ list, size }) => {
    const result: unknown[][] = [];
    for (let start = 0; start < list.length; start += size) result.push(list.slice(start, start + size));
    return result;
  },
});

function channels(color: string) {
  const literal = color.replace(/^#/, '');
  const full = literal.length === 3 ? literal.replace(/./g, '$&$&') : literal;
  return [0, 2, 4].map(index => parseInt(full.slice(index, index + 2), 16));
}

export const MixColor = defineFunction({
  name: 'MixColor',
  description: 'Blend two hex colors at a fraction t from 0 to 1 for a local tint. Keep text contrast and prefer semantic theme tokens for ordinary text.',
  params: z.object({ from: hex(), to: hex(), t: z.number() }),
  returns: hex(),
  fn: ({ from, to, t }) => {
    const a = channels(from);
    const b = channels(to);
    const k = Math.min(1, Math.max(0, t));
    return '#' + a.map((value, index) => Math.round(value + (b[index] - value) * k).toString(16).padStart(2, '0')).join('');
  },
});
