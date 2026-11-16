import { evaluate, parseExpression, split, tokenize, walkAST, type ASTNode, type EvaluationContext } from '@openuidev/lang-core';
import catalog from './nativeOpenUiCatalog.json' with { type: 'json' };
import { nativeFunctions } from './nativeOpenUiFunctions.generated.js';

const functions: NonNullable<EvaluationContext['functions']> = Object.fromEntries(nativeFunctions.map(fn => [fn.name, {
  ...catalog.schema.functions[fn.name as keyof typeof catalog.schema.functions],
  fn: (args: unknown) => {
    // The upstream declarations use full Zod schemas, while defineFunction's
    // public type exposes only Zod Core. Invoke each schema's own parser so
    // validation does not mix the frontend and backend Zod installations.
    const params = fn.params as unknown as { parse(value: unknown): Record<string, unknown> };
    const returns = fn.returns as unknown as { parse(value: unknown): unknown } | undefined;
    // Each function receives the object parsed by its own schema. Erase the
    // heterogeneous registry union only at this validated dispatch boundary.
    const invoke = fn.fn as unknown as (value: Record<string, unknown>) => unknown;
    const result = invoke(params.parse(args));
    return returns ? returns.parse(result) : result;
  },
}]));

/** Initial readouts only, from a program that has already passed native validation.
 * Reuses the renderer's upstream functions and OpenUI evaluator. No actions, tools,
 * network, persisted-state writes or inferred inputs are available here. */
export function initialNativeReadouts(program: string): Array<{ label: string; value: string }> {
  try {
    const { symbols, scalar, spend } = snapshotEvaluator(program);
    const root = symbols.has('root') ? symbols.get('root')
      : [...symbols.values()].find(node => node.k === 'Comp' && node.name === 'Col');
    if (!root) return [];
    const pending = [root];
    const visited = new Set<ASTNode>();
    const result: Array<{ label: string; value: string }> = [];
    while (pending.length) {
      const current = pending.pop()!;
      if (visited.has(current)) continue;
      visited.add(current);
      walkAST(current, node => {
        spend();
        if (node.k === 'Ref') {
          const target = symbols.get(node.n);
          if (target && !visited.has(target)) pending.push(target);
        }
        if (node.k === 'Comp' && node.name === 'Metric' && node.args.length >= 2) {
          const label = scalar(node.args[0]), value = scalar(node.args[1]);
          if (typeof label === 'string' && label.trim() && (typeof value === 'string' || typeof value === 'number')) {
            const row = { label, value: String(value) };
            if (!result.some(item => item.label === row.label && item.value === row.value)) result.push(row);
          }
        }
      });
    }
    return result;
  } catch { return []; }
}

/** Read initial scalar/array presentation values with the same pure registry.
 * A failed expression remains unavailable, never a fabricated blank or zero. */
function snapshotEvaluator(program: string) {
  const symbols = new Map(split(tokenize(program)).map(statement => [statement.id, parseExpression(statement.tokens)]));
  const active = new Set<string>();
  const cache = new Map<string, unknown>();
  let budget = 6000;
  const spend = () => { if (--budget < 0) throw Error('Snapshot evaluation budget'); };
  const resolve = (name: string): unknown => {
    if (--budget < 0 || active.has(name)) throw Error('Snapshot evaluation budget');
    if (cache.has(name)) return cache.get(name);
    const expression = symbols.get(name);
    if (!expression) throw Error('Unresolved snapshot reference');
    active.add(name);
    try {
      const result = expressionValue(expression);
      cache.set(name, result);
      return result;
    } finally { active.delete(name); }
  };
  const context: EvaluationContext = {
    getState: resolve, resolveRef: resolve, functions,
    reportError: () => { throw Error('Invalid snapshot calculation'); },
  };
  function expressionValue(expression: ASTNode): unknown {
    walkAST(expression, node => {
      if (--budget < 0 || (node.k === 'Comp' && (!node.fn || !Object.hasOwn(functions, node.name)))) {
        throw Error('Snapshot accepts registered pure functions only');
      }
    });
    return evaluate(expression, context);
  }
  function read(value: unknown): unknown {
    if (--budget < 0) throw Error('Snapshot evaluation budget');
    if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
    if (typeof value === 'number') return Number.isFinite(value) ? value : undefined;
    if (Array.isArray(value)) return value.map(read);
    if (value && typeof value === 'object' && typeof (value as { k?: unknown }).k === 'string') {
      return read(expressionValue(value as ASTNode));
    }
    return undefined;
  }
  return { symbols, scalar: expressionValue, spend, read };
}

export function initialNativeValueReader(program: string): (value: unknown) => unknown {
  try {
    const { read } = snapshotEvaluator(program);
    return value => { try { return read(value); } catch { return undefined; } };
  } catch { return () => undefined; }
}

// Match a label within normal prose without a backtracking regular expression.
// A bounded number of intervening words permits "Team is cheaper per seat".
function contextualReadoutLabel(text: string, label: string) {
  const words = [...text.toLowerCase().matchAll(/[a-z0-9]+/g)];
  const target = label.toLowerCase().match(/[a-z0-9]+/g) ?? [];
  if (target.length < 2) return;
  let budget = 8000;
  for (let start = 0; start < words.length; start++) {
    if (--budget < 0) return;
    if (words[start][0] !== target[0]) continue;
    let cursor = start, matched = true;
    for (const word of target.slice(1)) {
      if (--budget < 0) return;
      const end = Math.min(cursor + 6, words.length);
      let next = cursor + 1;
      while (next < end && words[next][0] !== word) {
        if (--budget < 0) return;
        next++;
      }
      if (next === end) { matched = false; break; }
      cursor = next;
    }
    if (matched) {
      const index = words[start].index!;
      return { index, text: text.slice(index, words[cursor].index! + words[cursor][0].length) };
    }
  }
}

/** Compare explicit currency claims to the corresponding labeled readout. An
 * unrelated example, input amount or uncategorized number is never rewritten. */
export function conflictingNativeReadouts(prose: string, readouts: ReturnType<typeof initialNativeReadouts>) {
  const money = /([$€£])\s*([+-]?(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?)/g;
  const plain = prose.replace(/[*_`]/g, '');
  return readouts.filter(({ label, value }) => {
    const expected = [...value.matchAll(money)];
    if (expected.length !== 1) return false;
    const target = Number(expected[0][2].replace(/,/g, ''));
    const words = label.toLowerCase().trim();
    const statements = plain.split(/\n\s*\n/).flatMap(paragraph =>
      /^\s*(?:for example|example|scenario|hypothetical|suppose|alternative)\b/i.test(paragraph)
        ? [] : paragraph.split(/(?<=[.!?])\s+/));
    for (const paragraph of statements) {
      if (/\b(?:example|scenario|hypothetical|suppose|instead|if you|alternative)\b/i.test(paragraph)) continue;
      const lower = paragraph.toLowerCase();
      const contextual = lower.includes(words) ? undefined : contextualReadoutLabel(paragraph, words);
      const at = lower.indexOf(words) >= 0 ? lower.indexOf(words)
        : contextual ? contextual.index : words.startsWith('total ') ? lower.indexOf(words.slice(6)) : -1;
      if (at < 0) continue;
      const matchedWords = lower.indexOf(words) >= 0 ? words : contextual?.text ?? words.slice(6);
      const candidates = [...paragraph.matchAll(money)].filter(match => match[1] === expected[0][1]);
      const nearby = candidates.map(match => ({ match, distance: Math.min(Math.abs(match.index! + match[0].length - at), Math.abs(match.index! - (at + matchedWords.length))) }))
        .filter(item => item.distance <= 35).sort((a, b) => a.distance - b.distance)[0]?.match;
      if (!nearby) continue;
      // An explicitly labeled calculation claims its result, not its first
      // operand. Stay within that equation so another clause cannot excuse an
      // incorrect readout. The evaluated component remains authoritative.
      const equation = nearby.index! >= at + matchedWords.length
        ? paragraph.slice(nearby.index! + nearby[0].length).match(
          /^[ \t]*(?:÷|\/|×|\+|−|-|divided by|times|plus|minus)[ \t]*[$€£]?[ \t]*[+-]?(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?(?:[ \t]+[a-zA-Z]+){0,3}[ \t]*=[ \t]*([$€£])[ \t]*([+-]?(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?)/i,
        ) : null;
      const claimed = equation?.[1] === expected[0][1] ? equation[2] : nearby[2];
      const number = Number(claimed.replace(/,/g, ''));
      const decimals = claimed.split('.')[1]?.length ?? 0;
      if (Math.abs(number - target) > 0.5 * 10 ** -decimals + 1e-8) return true;
    }
    return false;
  });
}
