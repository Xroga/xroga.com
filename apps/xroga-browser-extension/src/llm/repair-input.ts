// A model sometimes returns tool arguments that are not clean JSON: wrapped in a code fence, stringified twice, followed by
// a trailing comma, or surrounded by words. One such reply costs a whole turn (the call is refused and the model has to
// try again). This repairs the common shapes before the call is refused. Pattern from alibaba/page-agent autoFixer.ts (MIT)
// and openbrowse tool-input-normalize.ts (MIT); written fresh. It only ever returns a plain object, otherwise undefined.

function parseObject(text: string): Record<string, unknown> | undefined {
  try {
    const value: unknown = JSON.parse(text);
    if (value && typeof value === 'object' && !Array.isArray(value)) return value as Record<string, unknown>;
    // Stringified twice: the first parse gives a string that is itself the object.
    if (typeof value === 'string') return parseObject(value.trim());
  } catch {
    /* not this shape */
  }
  return undefined;
}

function firstBalancedObject(text: string): string | undefined {
  const start = text.indexOf('{');
  if (start < 0) return undefined;
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < text.length; i++) {
    const c = text[i]!;
    if (inString) {
      if (escaped) escaped = false;
      else if (c === '\\') escaped = true;
      else if (c === '"') inString = false;
      continue;
    }
    if (c === '"') inString = true;
    else if (c === '{') depth++;
    else if (c === '}' && --depth === 0) return text.slice(start, i + 1);
  }
  return undefined;
}

/** The tool's arguments as an object, or undefined when no safe repair exists. */
export function repairToolInput(raw: unknown): Record<string, unknown> | undefined {
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) return raw as Record<string, unknown>;
  if (typeof raw !== 'string') return undefined;
  const text = raw.trim();
  // A tool that takes no arguments, called with an empty string or "null".
  if (text === '' || text === 'null' || text === '""') return {};
  const direct = parseObject(text);
  if (direct) return direct;
  const fenced = /^```(?:json)?\s*([\s\S]*?)\s*```$/i.exec(text);
  if (fenced) {
    const inner = parseObject(fenced[1]!);
    if (inner) return inner;
  }
  const balanced = firstBalancedObject(text);
  if (balanced) {
    const found = parseObject(balanced) ?? parseObject(balanced.replace(/,\s*([}\]])/g, '$1'));
    if (found) return found;
  }
  return undefined;
}
