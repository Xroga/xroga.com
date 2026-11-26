import { createParser, evaluate, parseExpression, split, tokenize, walkAST, type ASTNode, type EvaluationContext, type LibraryJSONSchema } from '@openuidev/lang-core';
import catalog from './nativeOpenUiCatalog.json' with { type: 'json' };
import { nativeFunctions } from './nativeOpenUiFunctions.generated.js';
import { nativeMarkdownTables } from './nativeMarkdown.js';

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
export function initialNativeReadouts(program: string, editableOnly = false): Array<{ label: string; value: string }> {
  try {
    const { symbols, scalar, spend } = snapshotEvaluator(program);
    const root = symbols.has('root') ? symbols.get('root')
      : [...symbols.values()].find(node => node.k === 'Comp' && node.name === 'Col');
    if (!root) return [];
    const pending = [root];
    const visited = new Set<ASTNode>();
    const metrics: Array<{ label: string; value: string; expression: ASTNode }> = [];
    const inputs = new Set<string>();
    function usesEditableState(expression: ASTNode) {
      const dependencies = [expression];
      const checked = new Set<ASTNode>();
      while (dependencies.length) {
        const current = dependencies.pop()!;
        if (checked.has(current)) continue;
        checked.add(current);
        let found = false;
        walkAST(current, node => {
          spend();
          if (node.k === 'StateRef' && inputs.has(node.n)) found = true;
          if (node.k === 'Ref') {
            const target = symbols.get(node.n);
            if (target) dependencies.push(target);
          }
        });
        if (found) return true;
      }
      return false;
    }
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
        if (node.k !== 'Comp') return;
        const input = node.args[0];
        if (editableOnly && (node.name === 'Input' || node.name === 'Slider') && input?.k === 'StateRef') {
          inputs.add(input.n);
        }
        if (node.name === 'Metric' && node.args.length >= 2) {
          const label = scalar(node.args[0]), value = scalar(node.args[1]);
          if (typeof label === 'string' && label.trim() && (typeof value === 'string' || typeof value === 'number')) {
            metrics.push({ label, value: String(value), expression: node.args[1] });
          }
        }
      });
    }
    const result: Array<{ label: string; value: string }> = [];
    for (const { label, value, expression } of metrics) {
      if (editableOnly && !usesEditableState(expression)) continue;
      if (!result.some(item => item.label === label && item.value === value)) result.push({ label, value });
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

export function formatInitialNativeCurrency(value: number, currency: unknown): string {
  const formatted: unknown = functions.Format.fn({
    value,
    kind: 'currency',
    currency: typeof currency === 'string' ? currency : undefined,
  });
  return typeof formatted === 'string' ? formatted : String(value);
}

const readoutParser = createParser(catalog.schema as LibraryJSONSchema, 'Col');
const metricLabelKey = (text: string) => text.toLowerCase().replace(/^total\s+|\s+earned$/g, '').trim();

/** Review only an explicit currency multiple of a visible principal input.
 * No guessed denominator, conversion rate or unrelated example is inferred. */
export function nativePrincipalMultipleReview(program: string) {
  try {
    const read = initialNativeValueReader(program);
    const principals = new Set<number>();
    const metrics: Array<{label:string;value:number;rounding:number;note:string}> = [];
    const seen = new Set<object>();
    let budget = 6000;
    const visit = (value: unknown): void => {
      if (--budget < 0) throw Error('Readout review budget');
      if (!value || typeof value !== 'object' || seen.has(value)) return;
      seen.add(value);
      const node = value as {type?:string;typeName?:string;props?:Record<string,unknown>};
      if (node.type === 'element' && node.props) {
        const label = read(node.props.label), amount = read(node.props.value);
        if (['Slider','Input'].includes(node.typeName ?? '') && typeof label === 'string' && /^(?:(?:initial|starting)\s+)?principal$/i.test(label.trim())
            && ['$', 'USD'].includes(String(read(node.props.unit) ?? ''))
            && typeof amount === 'number' && Number.isFinite(amount) && amount > 0) principals.add(amount);
        if (node.typeName === 'Metric' && typeof label === 'string' && typeof amount === 'string') {
          const money = /^\$([+-]?(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?)$/.exec(amount);
          if (money) metrics.push({label,value:Number(money[1].replace(/,/g,'')),
            rounding:0.5*10**-(money[1].split('.')[1]?.length ?? 0),note:String(read(node.props.note) ?? '')});
        }
        Object.values(node.props).forEach(visit);
      } else Object.values(value).forEach(visit);
    };
    visit(readoutParser.parse(program).root);
    if (principals.size !== 1 || !metrics.length) return;
    const principal = [...principals][0];
    const ratio = /(?:^|[^\d.])([+-]?\d{1,12}(?:\.\d{1,10})?)[ \t]{0,8}(?:x|×|times)[ \t]{0,8}(?:the[ \t]+)?(?:(?:initial|starting)[ \t]+)?principal\b/i;
    const disagrees = (text:string, metric:typeof metrics[number]) => {
      const claim=ratio.exec(text);
      return Boolean(claim && Math.abs(Number(claim[1])-metric.value/principal) >
        0.5*10**-(claim[1].split('.')[1]?.length ?? 0)+metric.rounding/principal+1e-6);
    };
    const conflictingNotes = new Set(metrics.filter(metric =>
      /^(?:about\s+|approximately\s+|roughly\s+|around\s+)?[+-]?\d/i.test(metric.note) && disagrees(metric.note,metric)
    ).map(metric => metric.label));
    const repairProse = (text:string) => text.split('\n').map(line => {
      const plain=line.replace(/[*_`]/g,'').replace(/^\s*[-+]\s*/,'');
      const label=/^([^:]{1,80}):/.exec(plain)?.[1];
      if(!label)return line;
      const matches=metrics.filter(metric=>metricLabelKey(metric.label)===metricLabelKey(label));
      if(matches.length!==1)return line;
      const amount=/^[^:]{1,80}:[ \t]*\$([+-]?(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?)/.exec(plain);
      if(!amount || Number(amount[1].replace(/,/g,'')) !== matches[0].value)return line;
      // Only an unqualified parenthesis tied to this labeled result is removed.
      // Explicitly described balance ratios and distinct examples stay intact.
      return line.replace(/[ \t]{0,8}\((?:about[ \t]+|approximately[ \t]+)?[+-]?\d{1,12}(?:\.\d{1,10})?[ \t]{0,8}(?:x|×|times)[ \t]{0,8}(?:the[ \t]+)?(?:(?:initial|starting)[ \t]+)?principal\)/gi,
        claim=>disagrees(claim,matches[0])?'':claim);
    }).join('\n');
    return {conflictingNotes,repairProse};
  } catch { return; }
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

const readoutSentenceBreak = /(?<=[.!?])\s+/;
const readoutClaimBreak = /(?<=[.!?])\s+|\n(?=[ \t]*(?:[-+*]|\d+[.)])\s)|[,;]\s*(?:but|whereas)\s+/i;
const readoutExampleBlock = /^\s*(?:for example|example|scenario|hypothetical|suppose|alternative)\b/i;
const readoutScenario = /^[ \t]*(?:(?:[-+*]|\d+[.)])\s+)?(?:\b(?:boundary|edge) (?:cases?|values?)\b|(?:for\s+)?(?:each|every)\s+(?:additional\b|\d+(?:\.\d+)?\s+(?:percentage|basis)\s+points?\b)[^.!?\n]{0,110}\b(?:adds?|changes?|increases?|decreases?|reduces?|subtracts?)\b)/i;
const explicitCurrencyReadout = /^( {0,3}(?:(?:[-+*]|\d+[.)])[ \t]+)?(?:\*\*|__)?)([^:=\r\n]{1,80}?)([ \t]*(?:[:=]|[ \t]+is[ \t]+)[ \t]*(?:\*\*|__)?[ \t]*)([$€£][ \t]*[+-]?(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?)([ \t]*(?:\*\*|__)?\.?[ \t]*)$/i;

/** An explicit result can be repaired in place when both representations name
 * one unambiguous currency metric. Keep equations, examples and notes intact. */
export function correctExplicitCurrencyReadouts(prose: string, readouts: ReturnType<typeof initialNativeReadouts>) {
  const lines = prose.split('\n').map(line => line.split(/(?<=[.!?])([ \t]+)(?=\S)/));
  const candidates = new Map<string, Array<{ line: number; part: number; match: RegExpExecArray }>>();
  let fence: string | undefined;
  let inExample = false;
  for (const [line, parts] of lines.entries()) {
    const text = parts.join('');
    const marker = /^ {0,3}(\x60{3,}|~{3,})(.*)$/.exec(text);
    if (marker) {
      if (!fence) fence = marker[1];
      else if (fence[0] === marker[1][0] && fence.length <= marker[1].length && !marker[2].trim()) fence = undefined;
      continue;
    }
    if (fence) continue;
    if (!text.trim()) inExample = false;
    for (const [part, sentence] of parts.entries()) {
      if (readoutExampleBlock.test(sentence)) inExample = true;
      if (inExample || /^(?: {4}|\t|\s*[>|])|\x60/.test(text)) continue;
      const match = explicitCurrencyReadout.exec(sentence);
      if (!match) continue;
      const label = metricLabelKey(match[2].replace(/[*_]/g, '').replace(/^the\s+/i, ''));
      const occurrences = candidates.get(label) ?? [];
      occurrences.push({ line, part, match });
      candidates.set(label, occurrences);
    }
  }
  for (const [label, occurrences] of candidates) {
    if (occurrences.length !== 1) continue;
    const metrics = readouts.filter(row => metricLabelKey(row.label) === label);
    if (metrics.length !== 1) continue;
    const { value } = metrics[0];
    const { line, part, match: [, prefix, name, separator, amount, suffix] } = occurrences[0];
    if (value[0] === amount[0] && explicitCurrencyReadout.test(name + ': ' + value) &&
        conflictingNativeReadouts(metrics[0].label + ': ' + amount, metrics).length) {
      lines[line][part] = prefix + name + separator + value + suffix;
    }
  }
  return lines.map(parts => parts.join('')).join('\n');
}

const readoutAmountPattern = '[+-]?(?:\\d{1,3}(?:,\\d{3})+|\\d+)(?:\\.\\d+)?';
const displayedAmount = new RegExp('^([$€£])[ \\t]*(' + readoutAmountPattern + ')$');
const balanceDifference = new RegExp('^([$€£]?)(' + readoutAmountPattern + ')[ \\t]+[−-][ \\t]+([$€£]?)(' + readoutAmountPattern + ')[ \\t]*$');
const explicitReadoutShare = new RegExp(
  '^([\\p{L}][\\p{L}\\p{N} \\-]{0,79}?)(?:[ \\t]*:[ \\t]*|[ \\t]+is[ \\t]+)' +
  '(?:([\\d,.$€£+−*/÷× \\-]{1,120})=[ \\t]*)?([$€£]?)[ \\t]*(' + readoutAmountPattern + ')' +
  '(?:,[ \\t]+which[ \\t]+is[ \\t]+|[ \\t]+\\()(?:(?:about|approximately)[ \\t]+)?' +
  '([+-]?\\d{1,9}(?:\\.\\d{1,8})?)%[ \\t]+of[ \\t]+(?:the[ \\t]+)?' +
  '([\\p{L}][\\p{L}\\p{N} \\-]{0,79}?)(?=[ \\t]*(?:[.!?)]|$|\\band[ \\t]+(?:an?[ \\t]+)?[+-]?\\d+(?:\\.\\d+)?%))', 'iu',
);

/** Recalculate a share only when both explicitly named initial readouts
 * identify one value in the same unit and the prose quotes the numerator. */
export function correctExplicitReadoutShares(prose: string, readouts: ReturnType<typeof initialNativeReadouts>): string {
  if (!prose.includes('%') || readouts.length < 2) return prose;
  const nameKey = (label: string) => metricLabelKey(label).replace(/^the\s+/i, '');
  const amount = (label: string, allowBalanceAlias = false) => {
    const key = nameKey(label);
    const matches = readouts.filter(row => {
      const name = nameKey(row.label);
      return name === key || (allowBalanceAlias && key === 'final balance' && name === 'projected balance');
    });
    if (matches.length !== 1) return;
    const match = displayedAmount.exec(matches[0].value);
    if (!match) return;
    const value = Number(match[2].replace(/,/g, ''));
    if (Number.isFinite(value)) return { readout: matches[0], unit: match[1], value, alias: nameKey(matches[0].label) !== key,
      rounding: 0.5 * 10 ** -(match[2].split('.')[1]?.length ?? 0) };
  };
  let fence: string | undefined;
  let example = false;
  return prose.split('\n').map(line => {
    const marker = /^ {0,3}(`{3,}|~{3,})(.*)$/.exec(line);
    if (marker) {
      if (!fence) fence = marker[1];
      else if (fence[0] === marker[1][0] && fence.length <= marker[1].length && !marker[2].trim()) fence = undefined;
      return line;
    }
    if (fence) return line;
    if (!line.trim()) example = false;
    if (readoutExampleBlock.test(line)) example = true;
    if (example || /^(?: {4}|\t|\s*[>|])|[`*_[\]]/.test(line)) return line;
    return line.split(/(?<=[.!?])([ \t]+)(?=\S)/).map(sentence => {
      const match = explicitReadoutShare.exec(sentence);
      if (!match) return sentence;
      const [claim, label, equation, statedUnit, statedAmount, percentage, denominatorLabel] = match;
      const numerator = amount(label), denominator = amount(denominatorLabel, Boolean(equation));
      if (!numerator || !denominator || numerator.readout === denominator.readout || numerator.unit !== denominator.unit || (statedUnit && statedUnit !== numerator.unit)
          || numerator.value !== Number(statedAmount.replace(/,/g, '')) || denominator.value <= denominator.rounding) return sentence;
      // "Final balance" and "projected balance" can refer to different
      // periods. Require the same balance and a consistent subtraction.
      if (denominator.alias) {
        const difference = balanceDifference.exec(equation);
        if (!difference) return sentence;
        const [, balanceUnit, balanceText, startingUnit, startingText] = difference;
        if ([balanceUnit, startingUnit].some(unit => unit && unit !== numerator.unit)) return sentence;
        const balance = Number(balanceText.replace(/,/g, '')), starting = Number(startingText.replace(/,/g, ''));
        if (balance !== denominator.value || Math.abs(balance - starting - numerator.value) > numerator.rounding) return sentence;
      }
      const share = numerator.value / denominator.value;
      const decimals = percentage.split('.')[1]?.length ?? 0;
      const error = (numerator.rounding + Math.abs(share) * denominator.rounding) / (denominator.value - denominator.rounding) * 100;
      if (Math.abs(Number(percentage) - share * 100) <= 0.5 * 10 ** -decimals + error + 1e-8) return sentence;
      const replacement = (share * 100).toFixed(decimals);
      if (!/^[+-]?\d{1,9}(?:\.\d+)?$/.test(replacement)) return sentence;
      const start = claim.lastIndexOf(percentage + '%');
      return sentence.slice(0, start) + replacement + sentence.slice(start + percentage.length);
    }).join('');
  }).join('\n');
}

/** Compare explicit currency claims to the corresponding labeled readout. An
 * unrelated example, input amount or uncategorized number is never rewritten. */
export function conflictingNativeReadouts(prose: string, readouts: ReturnType<typeof initialNativeReadouts>) {
  if (!readouts.length) return [];
  const money = /([$€£])\s*([+-]?(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?)/g;
  const tables = nativeMarkdownTables(prose);
  const metricRows = tables.flatMap(({ head, rows }) => head.length === 2
    ? rows.flatMap(([label, value]) => {
        const cell = value.replace(/[*_`]/g, '');
        const amount = cell.matchAll(money).next().value;
        return amount?.[0] === cell ? [{ label: metricLabelKey(label.replace(/[*_`]/g, '')), cell }] : [];
      }) : []);
  // A column heading does not claim that the first observation is the
  // current calculator result. Keep chart and table cells out of prose
  // matching, and check explicit two-cell metric rows on their own.
  if (tables.length) {
    const lines = prose.split(/\r\n?|\n/);
    for (const table of tables) lines.fill('', table.start, table.end);
    prose = lines.join('\n');
  }
  const plain = prose.replace(/[*_`]/g, '');
  const statements = plain.split(/\n\s*\n/).flatMap(paragraph =>
    readoutExampleBlock.test(paragraph)
      ? [] : paragraph.split(readoutClaimBreak));
  return readouts.filter(({ label, value }) => {
    const expected = [...value.matchAll(money)];
    if (expected.length !== 1) return false;
    const target = Number(expected[0][2].replace(/,/g, ''));
    const words = label.toLowerCase().trim();
    const key = metricLabelKey(label);
    const labeledRows = metricRows.filter(row => row.label === key)
      .map(row => label + ': ' + row.cell);
    for (const paragraph of [...statements, ...labeledRows]) {
      // Sensitivity and boundary examples describe other inputs and changes
      // in value. Compare the labeled active readout in its own claim.
      if (readoutScenario.test(paragraph)) continue;
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
        ? paragraph.slice(nearby.index! + nearby[0].length, nearby.index! + nearby[0].length + 240).match(
          /^[ \t]*(?:(?:÷|\/|×|\*|\+|−|-|divided by|times|plus|minus)[ \t]*[$€£]?[ \t]*[+-]?(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?%?(?:[ \t]+[a-zA-Z]+){0,3}[ \t]*){1,4}=[ \t]*([$€£])[ \t]*([+-]?(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?)/i,
        ) : null;
      const claimed = equation?.[1] === expected[0][1] ? equation[2] : nearby[2];
      const number = Number(claimed.replace(/,/g, ''));
      const decimals = claimed.split('.')[1]?.length ?? 0;
      if (Math.abs(number - target) > 0.5 * 10 ** -decimals + 1e-8) return true;
    }
    return false;
  });
}

/** Withhold conflicting readout claims while preserving independent prose. */
export function recoverNativeReadoutProse(
  prose: string,
  readouts: ReturnType<typeof initialNativeReadouts>,
  multiples: ReturnType<typeof nativePrincipalMultipleReview>,
) {
  const corrected = multiples?.repairProse(prose) ?? prose;
  const hasConflict = (text: string) => conflictingNativeReadouts(text, readouts).length > 0;
  if (!hasConflict(corrected)) return corrected;

  const blocks = corrected.split(/(\n\s*\n)/);
  const retained: string[] = [];
  for (let index = 0; index < blocks.length; index += 2) {
    const separator = blocks[index - 1];
    let block = blocks[index];
    let fence: string | undefined;
    // Keep a fenced block together, including any blank lines in its body.
    for (;;) {
      for (const [, marker, suffix] of blocks[index].matchAll(/^ {0,3}(\x60{3,}|~{3,})([^\n]*)/gm)) {
        if (!fence) fence = marker;
        else if (marker[0] === fence[0] && marker.length >= fence.length && !suffix.trim()) fence = undefined;
      }
      if (!fence || index + 2 >= blocks.length) break;
      block += blocks[index + 1] + blocks[index + 2];
      index += 2;
    }
    if (hasConflict(block)) {
      // Edit individual sentences only in ordinary paragraphs. Keep Markdown
      // structure intact by withholding a conflicting structured block whole.
      if (/\n|^\s*(?:#{1,6}\s|(?:[-*+>]|\d+[.)])\s|\||\x60{3}|~{3})/.test(block)) continue;
      block = block.split(readoutSentenceBreak).filter(sentence => !hasConflict(sentence)).join(' ');
      if (!block || hasConflict(block)) continue;
    }
    if (retained.length) retained.push(separator);
    retained.push(block);
  }
  return retained.join('').trim();
}
