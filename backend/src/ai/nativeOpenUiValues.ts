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
    const symbols = new Map(split(tokenize(program)).map(statement => [statement.id, parseExpression(statement.tokens)]));
    const active = new Set<string>();
    const cache = new Map<string, unknown>();
    let budget = 6000;
    const resolve = (name: string): unknown => {
      if (--budget < 0 || active.has(name)) throw Error('Snapshot evaluation budget');
      if (cache.has(name)) return cache.get(name);
      const expression = symbols.get(name);
      if (!expression) throw Error('Unresolved snapshot reference');
      active.add(name);
      try {
        const result = scalar(expression);
        cache.set(name, result);
        return result;
      } finally { active.delete(name); }
    };
    const context: EvaluationContext = {
      getState: resolve, resolveRef: resolve, functions,
      reportError: () => { throw Error('Invalid snapshot calculation'); },
    };
    function scalar(expression: ASTNode): unknown {
      walkAST(expression, node => {
        if (--budget < 0 || (node.k === 'Comp' && (!node.fn || !Object.hasOwn(functions, node.name)))) {
          throw Error('Snapshot accepts registered pure functions only');
        }
      });
      return evaluate(expression, context);
    }
    const root = symbols.get('root');
    if (!root) return [];
    const pending = [root];
    const visited = new Set<ASTNode>();
    const result: Array<{ label: string; value: string }> = [];
    while (pending.length) {
      const current = pending.pop()!;
      if (visited.has(current)) continue;
      visited.add(current);
      walkAST(current, node => {
        if (--budget < 0) throw Error('Snapshot traversal budget');
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
    for (const paragraph of plain.split(/\n\s*\n/)) {
      if (/\b(?:example|scenario|hypothetical|suppose|instead|if you|alternative)\b/i.test(paragraph)) continue;
      const at = paragraph.toLowerCase().indexOf(words);
      if (at < 0) continue;
      const candidates = [...paragraph.matchAll(money)].filter(match => match[1] === expected[0][1]);
      const nearby = candidates.map(match => ({ match, distance: Math.min(Math.abs(match.index! + match[0].length - at), Math.abs(match.index! - (at + words.length))) }))
        .filter(item => item.distance <= 35).sort((a, b) => a.distance - b.distance)[0]?.match;
      if (!nearby) continue;
      const number = Number(nearby[2].replace(/,/g, ''));
      const decimals = nearby[2].split('.')[1]?.length ?? 0;
      if (Math.abs(number - target) > 0.5 * 10 ** -decimals + 1e-8) return true;
    }
    return false;
  });
}
