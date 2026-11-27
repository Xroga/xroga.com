import { createParser, evaluate, parseExpression, split, tokenize, walkAST, type ASTNode, type LibraryJSONSchema } from '@openuidev/lang-core';
import { claimsChartIsDeferred, contradictsMonthlyChart, monthlyChartDataFallback, nativeTechnicalReviewContext, reviewNativeAnswer, suppliedMonthlyComparison } from './nativeOpenUiAccuracy.js';
import { DIAGRAM_NODE_TONES, hasRenderableDiagramTopology } from './nativeDiagramTopology.js';
import { nativeMarkdownOutline, nativeMarkdownTables, nativeTableDecimalKey, type NativeMarkdownTable } from './nativeMarkdown.js';
import { reviewEditorialVisuals } from './nativeOpenUiEditorial.js';
import catalog from './nativeOpenUiCatalog.json' with { type: 'json' };
import { correctExplicitCurrencyReadouts, correctExplicitReadoutShares, formatInitialNativeCurrency, initialNativeReadouts, initialNativeValueReader, nativePrincipalMultipleReview, recoverNativeReadoutProse } from './nativeOpenUiValues.js';

export const NATIVE_UI_FORMAT = 'xroga-openui-v1' as const;
export const NATIVE_UI_LIBRARY = 'xroga-native-v1' as const;
export const NATIVE_UI_MARKER = '\n<<<XROGA_OPENUI_V1>>>\n';
export const PARTIAL_NATIVE_PRESENTATION_NOTE = 'Some visuals could not be validated. The available explanation and verified visuals are shown below.';
export const MAX_PROGRAM_CHARS = 24000;
const MAX_NATIVE_ANSWER_PROSE_CHARS = 200_000;
const nativeAnswerBinding = '\n_xroga_answer = ';
const compactNativeAnswerBinding = nativeAnswerBinding + '""';
// Expanded depth includes both layout nesting and shared formula references.
// Keep it bounded for evaluation, without rejecting ordinary composed calculators
// at the former 28-level limit. Node work, source size and cycles stay independent.
const MAX_EXPANDED_EXPRESSION_DEPTH = 96;
const parseProgram = createParser(catalog.schema as LibraryJSONSchema, 'Col');
const components = new Set(Object.keys(catalog.spec.components));
const pureFunctions = new Set(Object.keys(catalog.spec.functions));
const localActions = new Set(['Set', 'Reset']);
const registeredNativeCall = (name: string) => components.has(name) || pureFunctions.has(name) || localActions.has(name);
const operators = new Set(['+', '-', '*', '/', '%', '==', '!=', '<', '>', '<=', '>=', '&&', '||']);
const safeKey = (key: string) => !['__proto__', 'prototype', 'constructor'].includes(key);
// The Zurelay DeepSeek compatibility path can append the closing tool-call
// envelope to an otherwise valid native answer. Keep transport syntax out of
// the persisted program. A quoted example or an embedded tag is not a suffix.
const deepSeekToolClosingSuffix = /[ \t]*<\/｜DSML｜ parameter>[ \t]*\n[ \t]*<\/｜DSML｜ invoke>[ \t]*\n[ \t]*<\/｜DSML｜ calls>[ \t]*$/u;
const strayPresentationClosingLines = /(?:\n[ \t]*(?:<\/(?:Col>|<?XROGA_OPENUI_V1>>>|xroga_openui_v1>)|<<<XROGA_OPENUI_V1>>>)[ \t]*)+$/iu;
const nativeAssignmentStart = /^\$?[a-z_]\w*[ \t]*=/iu;
const nativeRootAssignment = /^ {0,3}root[ \t]*=[ \t]*[A-Z][A-Za-z0-9]*[ \t]*\(/;

export function splitNativeOpenUiAnswer(raw: string, streaming = false) {
  const { text, program } = scanNativeOpenUiAnswer(raw, streaming, true);
  return { text, program };
}

export function splitNativeOpenUiContinuation(previous: string, addition: string) {
  const draft = scanNativeOpenUiAnswer(previous, false, true);
  const extension = scanNativeOpenUiAnswer(addition, false, true, draft.fence);
  return { draft, extension, insideCodeBlock: Boolean(draft.fence) };
}

/** Bind Markdown to workspace prose. Keep large canonical prose out of the DSL
 * budget: the response already stores it alongside the program. */
export function bindNativeAnswerText(program: string, prose: string): string {
  if (!prose || prose.length > MAX_NATIVE_ANSWER_PROSE_CHARS || program.length > MAX_PROGRAM_CHARS) return program;
  try {
    const tokens = tokenize(program);
    if (tokens.length > 4800) return program;
    let depth = 0;
    for (const token of tokens) {
      if ([1, 3, 5].includes(token.t)) depth++;
      if ([2, 4, 6].includes(token.t)) depth--;
      if (depth < 0 || depth > 18) return program;
    }
    if (depth) return program;
    const statements = split(tokens);
    if (statements.length > 96 || statements.some(statement => statement.tokens.length > 1200)) return program;
    if (statements.some(statement => statement.id === '_xroga_answer')) return program;
    let referenced = false;
    for (const statement of statements) walkAST(parseExpression(statement.tokens), node => {
      if (node.k === 'Ref' && node.n === '_xroga_answer') referenced = true;
    });
    if (!referenced) return program;
    const binding = nativeAnswerBinding + JSON.stringify(prose);
    return program + (program.length + binding.length > MAX_PROGRAM_CHARS ? compactNativeAnswerBinding : binding);
  } catch {
    return program; // Existing validation and readable recovery remain authoritative.
  }
}

/** Supply separately persisted prose after validating the compact program.
 * This only replaces the exact reserved string literal with a JSON literal. */
export function materializeNativeAnswerText(program: string, prose: string): string {
  if (!program.endsWith(compactNativeAnswerBinding) || !prose || prose.length > MAX_NATIVE_ANSWER_PROSE_CHARS) return program;
  return program.slice(0, -2) + JSON.stringify(prose);
}

function scanNativeOpenUiAnswer(raw: string, streaming: boolean, allowJsonEnvelope: boolean, continuationFence?: string): {
  text: string; program: string; fence?: string;
} {
  const normalized = raw.replace(/\r\n/g, '\n');
  const marker = NATIVE_UI_MARKER.trim();
  const lines = normalized.split('\n');
  const prose: string[] = [];
  let fence = continuationFence;
  let fencedProgram: string | undefined;
  const envelope = (text: string, source: string) => {
    let program = source.trim().replace(deepSeekToolClosingSuffix, '').trimEnd().replace(strayPresentationClosingLines, '').trim();
    const wrapper = /^(\x60{3,}|~{3,})[ \t]*(?:openui(?:lang|-lang)?|xroga-openui-v1)?[ \t]*\n/i.exec(program);
    if (wrapper) {
      program = program.slice(wrapper[0].length);
      const close = new RegExp(`\\n[ \\t]*${wrapper[1]}${wrapper[1][0]}*[ \\t]*$`);
      program = program.replace(close, '').trim();
    }
    return { text: continuationFence ? text.trimEnd() : text.trim(), program, fence };
  };
  if (allowJsonEnvelope && !continuationFence && /^\s*\{/.test(normalized) && normalized.length <= 100_000) {
    try {
      const candidate: unknown = JSON.parse(normalized);
      if (candidate && typeof candidate === 'object' && 'format' in candidate && candidate.format === NATIVE_UI_FORMAT) {
        const text = 'text' in candidate && typeof candidate.text === 'string' ? candidate.text : '';
        const program = 'program' in candidate && typeof candidate.program === 'string' ? candidate.program : '';
        const readable = scanNativeOpenUiAnswer(text, streaming, false);
        fence = readable.fence;
        return envelope(readable.text, program || readable.program);
      }
    } catch { /* Plain code or prose still goes through the line scanner. */ }
  }
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const opening = /^ {0,3}(\x60{3,}|~{3,})(.*)$/.exec(line);
    if (fence) {
      prose.push(line);
      if (opening && opening[1][0] === fence[0] && opening[1].length >= fence.length && !opening[2].trim()) fence = undefined;
      continue;
    }
    const visible = line.trim();
    if (visible === marker) return envelope(prose.join('\n'), lines.slice(index + 1).join('\n'));
    if (!opening && visible.endsWith(marker)) {
      // The provider can omit the newline before the separator. A saved
      // answer may already have prose after a leaked separator, so preserve
      // that continuation unless the suffix starts a native program.
      prose.push(line.slice(0, line.lastIndexOf(marker)).trimEnd());
      const rest = lines.slice(index + 1);
      const root = rest.findIndex(candidate => nativeRootAssignment.test(candidate));
      if (streaming || root >= 0 && rest.slice(0, root).every(candidate =>
        !candidate.trim() || nativeAssignmentStart.test(candidate.trimStart()))) {
        return envelope(prose.join('\n'), rest.join('\n'));
      }
      continue;
    }
    if (streaming && index === lines.length - 1 && !opening) {
      const pending = /<{1,3}[A-Z0-9_>]*[ \t]*$/u.exec(line);
      if (pending && marker.startsWith(pending[0].trimEnd())) {
        prose.push(line.slice(0, pending.index).trimEnd());
        break;
      }
    }
    if (nativeRootAssignment.test(line)) {
      // State and component assignments can precede the root.
      let start = index;
      for (let previous = index - 1; previous >= 0; previous -= 1) {
        const candidate = lines[previous];
        if (!candidate.trim()) continue;
        const component = /^ {0,3}[a-z_]\w*[ \t]*=[ \t]*([A-Z][A-Za-z0-9]*)[ \t]*\(/.exec(candidate);
        if (!/^ {0,3}\$[a-z_]\w*[ \t]*=/i.test(candidate) && !(component && components.has(component[1]))) break;
        start = previous;
      }
      return envelope(prose.slice(0, start).join('\n'), lines.slice(start).join('\n'));
    }
    const nativeFence = opening && /^(?:openui(?:lang|-lang)?|xroga-openui-v1)$/i.test(opening[2].trim());
    if (opening && (nativeFence || /^(?:xroga-ui|xroga-response-json-v1)$/i.test(opening[2].trim()))) {
      const closing = new RegExp(`^ {0,3}${opening[1]}${opening[1][0]}*[ \\t]*$`);
      const start = index + 1;
      do { index += 1; } while (index < lines.length && !closing.test(lines[index]));
      if (nativeFence && fencedProgram === undefined) fencedProgram = lines.slice(start, index).join('\n');
      continue;
    }
    if (opening) fence = opening[1];
    prose.push(line);
  }
  return envelope(prose.join('\n'), fencedProgram ?? '');
}

export type RequiredNativeFormat = 'table' | 'chart' | 'graph' | 'calculator' | 'checklist';

function hasReactiveCalculator(program: string) {
  const symbols = new Map(split(tokenize(program)).map(statement => [statement.id, parseExpression(statement.tokens)]));
  const root = symbols.get('root');
  return root ? subtreeHasReactiveCalculator(root, symbols) : false;
}

function subtreeHasReactiveCalculator(root: ASTNode, symbols: ReadonlyMap<string, ASTNode>) {
  const inputs = new Set<string>();
  const outputs = new Set<string>();
  function inspect(start: ASTNode, see: (node: ASTNode) => void) {
    const pending = [start];
    const seen = new Set<ASTNode>();
    while (pending.length) {
      const expression = pending.pop()!;
      if (seen.has(expression)) continue;
      seen.add(expression);
      walkAST(expression, node => {
        see(node);
        if (node.k === 'Ref') {
          const reference = symbols.get(node.n);
          if (reference && !seen.has(reference)) pending.push(reference);
        }
      });
    }
  }
  inspect(root, node => {
    if (node.k !== 'Comp') return;
    const binding = node.args[0];
    if (['Slider', 'Input', 'Select', 'Checkbox', 'RadioGroup', 'SegmentedControl', 'ChoicePicker', 'DatePicker'].includes(node.name)
      && binding?.k === 'StateRef') inputs.add(binding.n);
    const readout = node.name === 'Metric' ? node.args[1] : ['Text', 'Math'].includes(node.name) ? binding : undefined;
    if (readout) inspect(readout, value => { if (value.k === 'StateRef') outputs.add(value.n); });
  });
  return [...inputs].some(input => outputs.has(input));
}

function* nativeElements(root: unknown) {
  const pending: unknown[] = [root];
  const visited = new Set<object>();
  while (pending.length) {
    const value = pending.pop();
    if (!value || typeof value !== 'object' || visited.has(value)) continue;
    visited.add(value);
    const element = value as { type?: string; typeName?: string; props?: Record<string, unknown> };
    if (element.type === 'element' && element.typeName) yield { typeName: element.typeName, props: element.props };
    pending.push(...Object.values(value));
  }
}

/** The caller has already validated every Source against the current evidence. */
export function nativeSourceMarkers(program: string): string[] {
  const markers = new Set<string>();
  for (const { typeName, props } of nativeElements(parseProgram.parse(program).root)) {
    const id = typeName === 'Source' && typeof props?.id === 'string' ? /^source-(\d+)$/.exec(props.id)?.[1] : undefined;
    if (id) markers.add('[' + id + ']');
  }
  return [...markers];
}

/** Inspect only the renderer tree, so unused declarations do not satisfy a request. */
export function missingNativeFormats(program: string, formats: readonly RequiredNativeFormat[]) {
  if (!formats.length) return [];
  const names = new Set<string>();
  if (program) for (const { typeName, props } of nativeElements(parseProgram.parse(program).root)) {
    if (typeName !== 'Diagram' || hasRenderableDiagramTopology(props?.nodes, props?.links)) names.add(typeName);
  }
  const available: Record<RequiredNativeFormat, boolean> = {
    table: names.has('Table'), chart: names.has('Chart'), graph: names.has('Diagram') || names.has('Svg'),
    calculator: Boolean(program && formats.includes('calculator') && hasReactiveCalculator(program)),
    checklist: names.has('Checkbox'),
  };
  return [...new Set(formats)].filter(format => !available[format]);
}

/** Compare the same readable content despite Markdown emphasis. */
export function nativeReadableTextKey(text: string): string {
  // Ignore emphasis only. Keep code, links, citations, strike-through and
  // identifier punctuation, which can change the meaning of an answer.
  return text.split(/(`[^`\n]+`|\[[^\]\n]+\]\([^)\s]+\))/g).map((part, index) => index % 2 ? part : part
    .replace(/\*\*([^*\n]+)\*\*/g, '$1')
    .replace(/(?<![\p{L}\p{N}_])__([^_\n]+)__(?![\p{L}\p{N}_])/gu, '$1')
    .replace(/(?<!\*)\*([^*\s][^*\n]*?)\*(?!\*)/g, '$1')
    .replace(/(?<![\p{L}\p{N}_])_([^_\s][^_\n]*?)_(?![\p{L}\p{N}_])/gu, '$1'))
    .join('').replace(/\s+/g, ' ').trim();
}

/** Compare one complete labeled amount with the renderer's en-US currency
 * notation. Keep the authored line, currency and decimal precision intact. */
export function nativeReadableMetricKey(line: string): string {
  const text = nativeReadableTextKey(line);
  const coded = /^([\p{L}][^:\n]{0,79}:) ([A-Z]{3}) ([+-]?(?:\d{1,3}(?:,\d{3}){1,7}|\d{1,24})(?:\.\d{1,10})?)$/u.exec(text);
  if (!coded) return text;
  const [label, currency, amount] = coded.slice(1);
  const [whole, fraction = ''] = amount.replace(/^[+-]|,/gu, '').split('.');
  // Borrow the formatter's currency placement without rounding the input.
  const parts = new Intl.NumberFormat('en-US', { style: 'currency', currency,
    minimumFractionDigits: fraction.length, maximumFractionDigits: fraction.length })
    .formatToParts(amount.startsWith('-') ? -0 : 0);
  const groups = whole.replace(/\B(?=(\d{3})+(?!\d))/gu, ',');
  const formatted = parts.map(({ type, value }) => type === 'integer' ? groups : type === 'fraction' ? fraction : value).join('');
  return label + ' ' + formatted.replace(/\s+/g, ' ');
}

function readableTaskKeys(prose: string): Set<string> {
  const tasks = new Set<string>();
  let fence: string | undefined;
  for (const line of prose.split(/\r?\n/)) {
    const marker = /^ {0,3}(\x60{3,}|~{3,})(.*)$/.exec(line);
    if (fence) {
      if (marker && marker[1][0] === fence[0] && marker[1].length >= fence.length && !marker[2].trim()) fence = undefined;
      continue;
    }
    if (marker) {
      fence = marker[1];
      continue;
    }
    const task = /^ {0,3}[-*+][ \t]+\[([ xX])\][ \t]+(.+)$/.exec(line);
    if (task) tasks.add(JSON.stringify([task[1] !== ' ', nativeReadableTextKey(task[2])]));
  }
  return tasks;
}

/** Recover readable details from an already validated program when the model
 * omitted its prose, returned an overview or left a heading without its body. */
export function supplementNativeProse(prose: string, program: string, includeAll = false): string {
  const unfinishedHeading = /(?:^|\n)#{1,6}[^\S\n]+[^\n]+$/.test(prose.trimEnd());
  const { root, stateDeclarations } = parseProgram.parse(program);
  if (!includeAll && !unfinishedHeading && (prose.length > 600 || prose.includes('\n'))) {
    // A generated local checklist can contain a deliverable missing from the
    // prose. Preserve those labels for Copy, Share and readable recovery too.
    const labels: string[] = [];
    const normalize = (text: string) => text.replace(/[*_`]/g, '').replace(/\s+/g, ' ').trim().toLowerCase();
    const existing = normalize(prose);
    let remaining = 6000;
    const visit = (value: unknown): void => {
      if (--remaining < 0 || !value || typeof value !== 'object') return;
      if (Array.isArray(value)) { value.forEach(visit); return; }
      const item = value as Record<string, unknown>;
      const props = item.props as Record<string, unknown> | undefined;
      if (item.type === 'element' && item.typeName === 'Checkbox' && typeof props?.label === 'string') {
        const label = props.label;
        if (!existing.includes(normalize(label)) && !labels.includes(label)) labels.push(label);
      }
      Object.values(item).forEach(visit);
    };
    visit(root);
    return labels.length ? prose + '\n\n' + labels.map(label => '- ' + label).join('\n') : prose;
  }
  const record = (value: unknown): Record<string, unknown> =>
    value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
  const array = (value: unknown) => Array.isArray(value) ? value as unknown[] : [];
  const scalar = (value: unknown): string => typeof value === 'string' || typeof value === 'number' ? String(value) : '';
  const readouts = initialNativeReadouts(program);
  const initialValue = initialNativeValueReader(program);
  const children = array(root?.props.children);
  const firstBlock = includeAll || !prose ? 0 : children.findIndex(child => (
    unfinishedHeading ? !['Title', 'Text', 'Badge'].includes(scalar(record(child).typeName))
      : ['Section', 'Code', 'Table', 'Diagram', 'Chart'].includes(scalar(record(child).typeName))
  ));
  if (firstBlock < 0) return prose;
  const lines: string[] = [];
  const seen = new Set<string>();
  // Compare parsed, complete tables instead of raw delimiter padding. Keep
  // links, citations and code literal. Compare numeric formatting without changing the authored cells.
  const tableKey = ({ head, rows }: NativeMarkdownTable) =>
    JSON.stringify([head, rows.map(row => row.map(nativeTableDecimalKey))]);
  const scopeLabel = (value: string) => /\x60|\]\(/.test(value) ? value.trim() : nativeReadableTextKey(value);
  const outline = nativeMarkdownOutline(prose);
  const authoredReadouts = new Set(readouts.length ? outline.readoutLines.map(nativeReadableMetricKey) : []);
  const authoredHeadings = new Map<string, string[]>();
  for (const heading of outline.headings) {
    const path = heading.map(scopeLabel);
    authoredHeadings.set(JSON.stringify(path), path);
  }
  const authoredTables = new Map<string, Map<string, string[]>>();
  const authoredOrderedItems = new Map<string, Map<string, string[]>>();
  for (const item of outline.orderedItems) {
    const key = nativeReadableTextKey(item.text);
    const scopes = authoredOrderedItems.get(key) ?? new Map<string, string[]>();
    const path = item.headings.map(scopeLabel);
    scopes.set(JSON.stringify(path), path);
    authoredOrderedItems.set(key, scopes);
  }
  for (const table of outline.tables) {
    const key = tableKey(table);
    const scopes = authoredTables.get(key) ?? new Map<string, string[]>();
    const path = table.headings.map(scopeLabel);
    scopes.set(JSON.stringify(path), path);
    authoredTables.set(key, scopes);
  }
  const isSingleScope = (paths: Iterable<readonly string[]>, scope: readonly string[]) => {
    let matched = false;
    for (const path of paths) {
      if (path.length < scope.length || !scope.every((heading, i) => path[path.length - scope.length + i] === heading)) continue;
      if (matched) return false;
      matched = true;
    }
    return matched;
  };
  const chartHasReadableData = (head: string[], rows: string[][], scope: readonly string[]) => {
    if (!scope.length || !rows.length) return false;
    const scoped = outline.tables.filter(table =>
      isSingleScope([table.headings.map(scopeLabel)], scope) && table.rows.length === rows.length);
    return scoped.some(table => {
      // Associate by the category heading and exact ordered values. Each
      // plotted column must be independently readable in the same table.
      const columns = head.map((heading, column) =>
        table.head.flatMap((label, index) => {
          if (column === 0 && label.toLowerCase() !== heading.toLowerCase()) return [];
          return table.rows.every((row, i) =>
            nativeTableDecimalKey(row[index]) === nativeTableDecimalKey(rows[i][column])) ? [index] : [];
        }));
      return columns.every(matches => matches.length === 1) && new Set(columns.flat()).size === head.length;
    });
  };
  const rootChartHasReadableData = (rows: string[][]) => {
    if (!rows.length) return false;
    const categories = new Set(rows.map(([label]) => label));
    if (categories.size !== rows.length) return false;

    return outline.tables.filter(table => {
      const plottedRows = table.rows.filter(([label]) => categories.has(label));
      if (plottedRows.length !== rows.length || !plottedRows.every(([label], index) => label === rows[index][0])) return false;
      const valueColumns = table.head.slice(1).filter((_heading, index) => plottedRows.every((row, rowIndex) =>
        nativeTableDecimalKey(row[index + 1]) === nativeTableDecimalKey(rows[rowIndex][1])));
      return valueColumns.length === 1;
    }).length === 1;
  };
  const metricHasReadableValue = (label: string, value: string, scope: readonly string[]) =>
    outline.tables.filter(table => !scope.length || isSingleScope([table.headings.map(scopeLabel)], scope))
      .flatMap(table => table.rows)
      .filter(([name, ...values]) => nativeReadableTextKey(name) === nativeReadableTextKey(label)
        && values.some(cell => nativeTableDecimalKey(cell) === nativeTableDecimalKey(value))).length === 1;
  const seenHeadings = new Set<string>();
  const seenTables = new Set<string>();
  const existingText = new Set(prose.split(/\n\s*\n|\n(?=\s*[-*+]\s)/).map(value =>
    nativeReadableTextKey(value.replace(/^\s*(?:#{1,6}\s+|[-*+]\s+)/, ''))));
  const existingTasks = readableTaskKeys(prose);
  let remaining = 24_000;
  const append = (value: string) => {
    lines.push(value);
    remaining -= value.length;
  };
  const addHeading = (title: string, scope: readonly string[], minimum = 2): readonly string[] => {
    if (!title) return scope;
    const level = Math.max(minimum, Math.min(4, scope.length + 2));
    const path = [...scope.slice(0, level - 2), scopeLabel(title)];
    const key = JSON.stringify(path);
    const value = '#'.repeat(level) + ' ' + title;
    if (value.length <= remaining && !seenHeadings.has(key) && !isSingleScope(authoredHeadings.values(), path)) {
      append(value);
    }
    seenHeadings.add(key);
    return path;
  };
  const add = (value: string, scope: readonly string[] = [], projectedTable?: NativeMarkdownTable) => {
    if (!value || value.length > remaining) return;
    let table = projectedTable;
    if (!table && value.includes('|') && value.includes('\n')) {
      const trimmed = value.trim();
      const [block] = nativeMarkdownTables(trimmed);
      if (block?.start === 0 && block.end === trimmed.split(/\r\n?|\n/).length) table = block;
    }
    if (table) {
      const key = tableKey(table);
      const scopes = authoredTables.get(key);
      const identity = JSON.stringify([scope, key]);
      const authoredInScope = scopes && (!scope.length || isSingleScope(scopes.values(), scope));
      if (seenTables.has(identity) || authoredInScope) return;
      seenTables.add(identity);
    } else {
      const key = nativeReadableTextKey(value.replace(/^\s*(?:#{1,6}\s+|[-*+]\s+)/, ''));
      if (seen.has(key) || existingText.has(key) || prose.includes(value)) return;
      seen.add(key);
    }
    append(value);
  };
  const addTable = (headings: string[], rows: string[][], scope: readonly string[]) => {
    if (!headings.length || !rows.length) return;
    const cell = (value: string) => value.replace(/[\r\n]+/g, ' ').trim();
    const head = headings.map(cell);
    const data = rows.map(cells => cells.map(cell));
    const row = (cells: string[]) => '| ' + cells.map(value => value.split(/(\x60[^\x60\n]+\x60)/g)
      .map((part, index) => index % 2 ? part : part.replace(/\\/g, '\\\\').replace(/\|/g, '\\|')).join('')).join(' | ') + ' |';
    add([row(head), row(head.map(() => '---')), ...data.map(row)].join('\n'), scope, { head, rows: data });
  };
  function project(value: unknown, scope: readonly string[] = []): void {
    if (remaining <= 0) return;
    if (Array.isArray(value)) { value.forEach(item => project(item, scope)); return; }
    if (typeof value === 'string' || typeof value === 'number') { add(String(value), scope); return; }
    const node = record(value);
    if (node.type !== 'element') {
      if (node.title || node.description) add('- ' + [scalar(node.title), scalar(node.description)].filter(Boolean).join(': '));
      return;
    }
    const props = record(node.props);
    if (node.typeName === 'ListItem') {
      add('- ' + [scalar(props.title), scalar(props.description)].filter(Boolean).join(': '));
    } else if (node.typeName === 'Checkbox') {
      const label = scalar(props.label);
      const checked = initialValue(props.checked);
      const key = nativeReadableTextKey(label);
      const orderedScopes = authoredOrderedItems.get(key);
      const alreadyOrdered = checked === false && orderedScopes && (scope.length
        ? isSingleScope(orderedScopes.values(), scope) : orderedScopes.size === 1);
      if (label && !alreadyOrdered && !existingTasks.has(JSON.stringify([checked, key]))) add('- ' + label);
    } else if (node.typeName === 'Section') {
      const path = addHeading(scalar(props.title), scope);
      add(scalar(props.introduction));
      project(props.children, path);
      return;
    } else if (node.typeName === 'Tabs') {
      add(scalar(props.label));
      for (const tab of array(props.tabs)) {
        const item = record(tab);
        const path = addHeading(scalar(item.title), scope, 3);
        project(item.content, path);
      }
    } else if (node.typeName === 'Popover') {
      project(props.trigger, scope);
      project(props.content, scope);
    } else if (node.typeName === 'Flashcard') {
      project(props.front, scope);
      project(props.back, scope);
    } else if (node.typeName === 'Math') {
      add(scalar(props.tex));
    } else if (node.typeName === 'Quote') {
      add(scalar(props.text));
      add(scalar(props.cite));
    } else if (node.typeName === 'Code') {
      const code = scalar(props.code);
      if (code && !prose.includes(code)) {
        const longestRun = (code.match(/\x60+/g) ?? []).reduce((length, run) => Math.max(length, run.length), 0);
        const fence = String.fromCharCode(96).repeat(Math.max(3, longestRun + 1));
        const language = scalar(props.language);
        add(fence + (/^[a-z0-9+#-]{1,30}$/i.test(language) ? language : '') + '\n' + code + '\n' + fence);
      }
    } else if (node.typeName === 'Metric') {
      const label = scalar(props.label);
      const initial = readouts.find(row => row.label === label);
      if (initial) {
        const readout = initial.label + ': ' + initial.value;
        if (!authoredReadouts.has(nativeReadableMetricKey(readout)) && !metricHasReadableValue(initial.label, initial.value, scope)) add(readout);
      }
      add(scalar(props.note));
    } else if (node.typeName === 'Table') {
      const headings = initialValue(props.columns);
      const resolved = initialValue(props.rows);
      // Keep the complete initial table or omit it as unavailable. Never turn an
      // unresolved expression into an invented blank, zero or partial row.
      if (Array.isArray(headings) && headings.every(heading => typeof heading === 'string') &&
          Array.isArray(resolved) && resolved.every(row => Array.isArray(row) && row.every(cell =>
        cell === null || ['string', 'number', 'boolean'].includes(typeof cell)))) {
        addTable(headings, resolved.map(row => row.map((cell: unknown) => cell === null ? '' : String(cell))), scope);
      }
    } else if (node.typeName === 'Chart' && Array.isArray(props.data)) {
      const presentation = record(props.presentation);
      const x = scalar(initialValue(props.x));
      const series = array(initialValue(props.series)).map(scalar).filter(Boolean);
      add(scalar(presentation.title));
      if (x && series.length) {
        const rows: string[][] = [];
        const currency = initialValue(props.currency);
        const isCurrency = props.format === 'currency';
        for (const value of props.data) {
          const row = record(value);
          const label = initialValue(Object.hasOwn(row, x) ? row[x] : undefined);
          const amounts = series.map(key => initialValue(Object.hasOwn(row, key) ? row[key] : undefined));
          if ((typeof label !== 'number' && (typeof label !== 'string' || props.type === 'scatter')) ||
              !amounts.every((amount): amount is number => typeof amount === 'number' && Math.abs(amount) <= 1e15)) {
            // A visual requires a finite value for every series. Keep the
            // explanation, and don't project fabricated blanks or partial rows.
            rows.length = 0;
            break;
          }
          rows.push([String(label), ...amounts.map(amount => isCurrency
            ? formatInitialNativeCurrency(amount, currency) : String(amount))]);
        }
        const yLabel = scalar(presentation.yLabel);
        const xLabel = scalar(presentation.xLabel);
        const headings = [xLabel || x, ...(series.length === 1 && yLabel ? [yLabel] : series)];
        if (series.length === 1 && (chartHasReadableData(headings, rows, scope)
          || (!scope.length && !xLabel && !yLabel && /^(?:name|label|category)$/iu.test(x) && rootChartHasReadableData(rows)))) {
          if (yLabel) add(yLabel, scope);
        } else {
          addTable(headings, rows, scope);
        }
      }
      add(scalar(presentation.note));
    } else if (node.typeName === 'Diagram') {
      const title = scalar(props.title);
      if (scope.at(-1) !== scopeLabel(title)) add(title);
      add(scalar(props.description));
      const names = new Map(array(props.nodes).map(item => {
        const node = record(item);
        return [scalar(node.id), scalar(node.label)];
      }));
      const firstRelationship = lines.length;
      array(props.links).forEach(item => {
        const link = record(item);
        const from = names.get(scalar(link.from)), to = names.get(scalar(link.to));
        if (from && to) add('- ' + from + ' → ' + to + (link.label ? ': ' + scalar(link.label) : ''));
      });
      if (lines.length > firstRelationship + 1) {
        lines.push(lines.splice(firstRelationship).join('\n'));
      }
    } else if (node.typeName === 'Text' && node.hasDynamicProps && record(props.text).k) {
      // Use the initial local state for the readable snapshot. Projection has no
      // function or action dispatch and cannot mutate the saved controls.
      try {
        const expression = props.text as ASTNode;
        let supported = true;
        walkAST(expression, part => {
          if (part.k === 'StateRef') supported &&= Object.hasOwn(stateDeclarations, part.n);
          else if (!['Str', 'Num', 'Bool', 'Null', 'BinOp', 'UnaryOp', 'Ternary'].includes(part.k)) supported = false;
        });
        if (supported) {
          const text = evaluate(expression, { getState: key => stateDeclarations[key], resolveRef: () => undefined });
          add(scalar(text));
        }
      } catch { /* Dynamic text remains available in the interactive answer. */ }
    } else if (node.typeName === 'Source') {
      const index = /^source-(\d+)$/.exec(scalar(props.id))?.[1];
      if (index) add('[' + index + ']');
    } else {
      for (const key of ['title', 'introduction', 'text', 'description', 'role', 'items'] as const) project(props[key], scope);
    }
    project(props.children, scope);
  }
  project(children.slice(firstBlock));
  return [prose, ...lines].filter(Boolean).join('\n\n');
}

export type NativeUiValidation = { ok: true } | {
  ok: false;
  reason: 'budget' | 'syntax' | 'authority' | 'reference' | 'schema' | 'authorization_review' | 'factual_review' | 'data_review';
  fallbackProse?: string;
};
const reject = (reason: Extract<NativeUiValidation, { ok: false }>['reason']) => ({ ok: false as const, reason });
type ValidationStage = 'limits' | 'lexer' | 'statements' | 'authority' | 'schema' | 'accuracy';
export type NativeUiDiagnostic = {
  stage: ValidationStage;
  reason: Extract<NativeUiValidation, { ok: false }>['reason'];
  statement?: number;
  workLimit?: 'statement_nodes' | 'expression_depth';
  expandedDepth?: number;
  failingShape?: { tokens: number; skeleton: string };
  programLength: number;
  shape: Array<{ tokens: number; skeleton: string }>;
  factualRule?: NonNullable<ReturnType<typeof reviewNativeAnswer>>['rule'];
  editorialIssue?: 'prose_conflict' | NonNullable<ReturnType<typeof reviewEditorialVisuals>>['issue'];
  referenceIssue?: 'missing' | 'cycle';
  authorityIssue?: 'unknown_capability' | 'invalid_action_binding' | 'unverified_source' | 'unsafe_expression' | 'non_scalar_state' | 'external_statement';
  unregisteredCallKind?: 'component' | 'function';
  declarationIssue?: 'invalid_name' | 'unsafe_name' | 'duplicate' | 'missing_root' | 'invalid_root' | 'expression';
  diagramTopology?: 'invalid';
  schemaState?: { hasRoot: boolean; incomplete: boolean; unresolved: number; errors: number };
  schema?: Array<{ code: string; statement?: number; component?: string; pathDepth: number; diagramField?: string }>;
};

/** Used only after a schema-valid program reached the data-review gate. */
export function recoverNativeMonthlyChart(program: string, supplied?: NonNullable<ReturnType<typeof suppliedMonthlyComparison>>, partial = true) {
  const root = parseProgram.parse(program).root;
  const recovered = monthlyChartDataFallback(root, supplied ? { supplied, partial } : undefined);
  if (recovered && validateNativeOpenUi(recovered.program, new Set(), recovered.text).ok) return recovered;
}

/** Audit all statements, including unreachable ones, before letting the upstream
 * parser resolve references or evaluate expressions. Limit expanded work as well
 * as input size, so repeated references cannot multiply the runtime budget. */
type EditorialContext = { request?: string; prose?: string };

export function validateNativeOpenUi(program: string, evidenceIds: ReadonlySet<string> = new Set(), prose = '', diagnose?: (value: NativeUiDiagnostic) => void, workspaceContract = false, editorial?: EditorialContext): NativeUiValidation {
  let stage: ValidationStage = 'limits';
  let statement: number | undefined;
  let statements: ReturnType<typeof split> = [];
  let schemaState: NativeUiDiagnostic['schemaState'];
  let factualRule: NativeUiDiagnostic['factualRule'];
  let editorialIssue: NativeUiDiagnostic['editorialIssue'];
  let referenceIssue: NativeUiDiagnostic['referenceIssue'];
  let authorityIssue: NativeUiDiagnostic['authorityIssue'];
  let unregisteredCallKind: NativeUiDiagnostic['unregisteredCallKind'];
  let declarationIssue: NativeUiDiagnostic['declarationIssue'];
  let diagramTopology: NativeUiDiagnostic['diagramTopology'];
  let workLimit: NativeUiDiagnostic['workLimit'];
  let expandedDepth = 0;
  const statementShape = ({ tokens }: ReturnType<typeof split>[number]) => ({
    tokens: tokens.length,
    skeleton: tokens.slice(0, 100).map((token, index) => {
      const name = token.v;
      return token.t !== 14 && tokens[index + 1]?.t === 1 && typeof name === 'string'
        && registeredNativeCall(name) ? name : String(token.t);
    }).join(' '),
  });
  const fail = (reason: NativeUiDiagnostic['reason'], errors?: ReturnType<typeof parseProgram.parse>['meta']['errors']) => {
    if (diagnose) diagnose({
      stage, reason, statement, programLength: program.length,
      shape: statements.slice(0, 12).map(statementShape),
      ...(workLimit ? { workLimit, expandedDepth } : {}),
      ...(statement && statements[statement - 1] ? { failingShape: statementShape(statements[statement - 1]) } : {}),
      ...(schemaState ? { schemaState } : {}),
      ...(factualRule ? { factualRule } : {}),
      ...(editorialIssue ? { editorialIssue } : {}),
      ...(referenceIssue ? { referenceIssue } : {}),
      ...(authorityIssue ? { authorityIssue } : {}),
      ...(unregisteredCallKind ? { unregisteredCallKind } : {}),
      ...(declarationIssue ? { declarationIssue } : {}),
      ...(diagramTopology ? { diagramTopology } : {}),
      ...(errors?.length ? { schema: errors.slice(0, 8).map(error => {
        const index = statements.findIndex(item => item.id === error.statementId);
        const diagramField = error.component === 'Diagram' &&
          /^\/(?:title|description|nodes|links|nodes\/\d+\/(?:id|label|level|detail|tone|icon)|links\/\d+\/(?:from|to|label))$/.test(error.path)
          ? error.path.replace(/\/\d+\//, '/*/') : undefined;
        return { code: error.code, ...(index < 0 ? {} : { statement: index + 1 }),
          ...(components.has(error.component) ? { component: error.component } : {}),
          ...(diagramField ? { diagramField } : {}),
          pathDepth: error.path.split('/').length - 1 };
      }) } : {}),
    });
    return reject(reason);
  };
  if (!program || program.length > MAX_PROGRAM_CHARS || program.includes("]]>")) return fail('budget');
  try {
    stage = 'lexer';
    const tokens = tokenize(program);
    if (tokens.length > 4800) return fail('budget');
    // Bound the expression parser before building any AST. The lexer treats
    // delimiters inside quoted strings as data.
    // Token discriminants from the pinned OpenUI lexer (left/right pairs).
    let nesting = 0;
    for (const token of tokens) {
      if ([1, 3, 5].includes(token.t)) nesting += 1;
      if ([2, 4, 6].includes(token.t)) nesting -= 1;
      if (nesting > 18 || nesting < 0) return fail('syntax');
    }
    if (nesting !== 0) return fail('syntax');
    stage = 'statements';
    statements = split(tokens);
    if (!statements.length || statements.length > 96) return fail('budget');
    const symbols = new Map<string, ASTNode>();
    for (const [index, declaration] of statements.entries()) {
      statement = index + 1;
      // Match the installed OpenUI lexer. The whole-program budget already
      // bounds identifier size, so a separate 40-character limit loses valid UI.
      if (!/^\$?[a-zA-Z_][a-zA-Z0-9_]*$/.test(declaration.id)) declarationIssue = 'invalid_name';
      else if (!safeKey(declaration.id.replace(/^\$/, ''))) declarationIssue = 'unsafe_name';
      else if (symbols.has(declaration.id)) declarationIssue = 'duplicate';
      if (declarationIssue) return fail('syntax');
      if (declaration.tokens.length > 1200) return fail('budget');
      try { symbols.set(declaration.id, parseExpression(declaration.tokens)); }
      catch { declarationIssue = 'expression'; return fail('syntax'); }
    }
    statement = undefined;
    // Upstream selects `root`, or the first Col declaration when root is absent.
    // It also follows ordinary references to the entry component.
    const entry = symbols.has('root') ? symbols.get('root')
      : [...symbols.values()].find(node => node.k === 'Comp' && node.name === 'Col');
    if (!entry) { declarationIssue = 'missing_root'; return fail('syntax'); }
    const resolvedEntry = resolveRecoveryReference(entry, symbols);
    if (resolvedEntry && resolvedEntry.k !== 'Comp') { declarationIssue = 'invalid_root'; return fail('syntax'); }
    stage = 'authority';
    let budget = 6000;
    const reviewStrings = new Set<string>();
    const boundAnswer = symbols.get('_xroga_answer');
    const compactAnswer = program.endsWith(compactNativeAnswerBinding) && boundAnswer?.k === 'Str' && boundAnswer.v === '';
    let compactReferences = 0;
    let reason: Extract<NativeUiValidation, { ok: false }>['reason'] = 'authority';
    function visit(node: ASTNode, active: Set<string>, depth = 0, allowBoundAnswer = false): boolean {
      expandedDepth = Math.max(expandedDepth, depth);
      if (--budget < 0 || depth > MAX_EXPANDED_EXPRESSION_DEPTH) {
        workLimit = depth > MAX_EXPANDED_EXPRESSION_DEPTH ? 'expression_depth' : 'statement_nodes';
        reason = 'budget'; return false;
      }
      const next = (value: ASTNode) => visit(value, active, depth + 1);
      switch (node.k) {
        case 'Comp':
          if (localActions.has(node.name) && node.args[0]?.k !== 'StateRef') {
            authorityIssue = 'invalid_action_binding';
            return false;
          }
          if (node.name === 'Source' && (node.args[0]?.k !== 'Str' || !evidenceIds.has(node.args[0].v))) {
            authorityIssue = 'unverified_source';
            return false;
          }
          if (!registeredNativeCall(node.name)) {
            authorityIssue = 'unknown_capability';
            unregisteredCallKind = node.fn ? 'function' : 'component';
            const declaration = statements.findIndex(item => item.id === [...active].at(-1));
            if (declaration >= 0) statement = declaration + 1;
            return false;
          }
          return node.args.every((arg, index) =>
            visit(arg, active, depth + 1, node.name === 'Markdown' && index === 0));
        case 'Ref':
        case 'StateRef': {
          const target = symbols.get(node.n);
          if (!target || active.has(node.n)) {
            reason = 'reference';
            referenceIssue = target ? 'cycle' : 'missing';
            return false;
          }
          if (compactAnswer && target === boundAnswer && (!allowBoundAnswer || node.k !== 'Ref' || ++compactReferences > 1)) return false;
          return visit(target, new Set([...active, node.n]), depth + 1,
            allowBoundAnswer && node.k === 'Ref' && target === boundAnswer);
        }
        case 'Obj': return node.entries.length <= 120 && node.entries.every(([key, value]) => safeKey(key) && next(value));
        case 'Arr': return node.els.length <= 160 && node.els.every(next);
        case 'BinOp': return operators.has(node.op) && next(node.left) && next(node.right);
        case 'UnaryOp': return ['-', '+', '!'].includes(node.op) && next(node.operand);
        case 'Ternary': return next(node.cond) && next(node.then) && next(node.else);
        case 'Member': return safeKey(node.field) && next(node.obj);
        case 'Index': return node.index.k === 'Num' && node.index.v >= 0 && next(node.obj);
        case 'Num': return Number.isFinite(node.v) && Math.abs(node.v) <= 1e15;
        case 'Str':
          reviewStrings.add(node.v);
          // The full Markdown answer is already bounded by the program size.
          // Other widget strings and alternate uses keep the smaller limit.
          return node.v.length <= 8000 || allowBoundAnswer && node === boundAnswer;
        case 'Bool': case 'Null': return true;
        default: return false;
      }
    }
    for (const [key, node] of symbols) {
      statement = (statement ?? 0) + 1;
      // Each declaration can be evaluated independently. Keep the same bound
      // on every expanded expression, including root and unreachable entries.
      // Re-auditing a shared dependency must not consume another declaration's
      // allowance. The statement count still bounds the total audit work.
      budget = 6000;
      compactReferences = 0;
      if (key.startsWith('$') && !['Num', 'Str', 'Bool', 'Null'].includes(node.k)) {
        authorityIssue = 'non_scalar_state';
        return fail('authority');
      }
      if (!visit(node, new Set([key]), 0, node === boundAnswer)) {
        if (reason === 'authority') authorityIssue ??= 'unsafe_expression';
        return fail(reason);
      }
    }
    statement = undefined;
    stage = 'accuracy';
    const narrative = [prose, ...reviewStrings].join('\n');
    const finding = reviewNativeAnswer(narrative);
    if (finding) {
      factualRule = finding.rule;
      return fail(finding.reason);
    }
    stage = 'schema';
    const result = parseProgram.parse(program);
    if (result.queryStatements.length || result.mutationStatements.length) {
      authorityIssue = 'external_statement';
      return fail('authority');
    }
    schemaState = {
      hasRoot: Boolean(result.root), incomplete: result.meta.incomplete,
      unresolved: result.meta.unresolved.length, errors: result.meta.errors.length,
    };
    if (!result.root || result.root.typeName !== 'Col' || result.meta.incomplete || result.meta.unresolved.length || result.meta.errors.length) return fail('schema', result.meta.errors);
    if (!Array.isArray(result.root.props.children) || !result.root.props.children.length) return fail('schema');
    const renderedElements = workspaceContract ? [...nativeElements(result.root)] : [];
    if (workspaceContract) {
      const review = reviewEditorialVisuals(editorial?.prose ?? prose, renderedElements
        .map(({ typeName, props }) => ({ typeName, props: props ?? {} })), editorial?.request);
      if (review) {
        stage = 'accuracy';
        editorialIssue = review.issue;
        return { ...fail('factual_review'), ...(review.fallbackProse !== undefined ? { fallbackProse: review.fallbackProse } : {}) };
      }
      const deferChart = claimsChartIsDeferred(prose);
      for (const { typeName, props } of renderedElements) {
        if (deferChart && typeName === 'Chart') {
          factualRule = 'unconfirmed_conflicting_input';
          return fail('factual_review');
        }
        if (typeName === 'Diagram' && !hasRenderableDiagramTopology(props?.nodes, props?.links)) {
          diagramTopology = 'invalid';
          return fail('schema');
        }
      }
      // Check render-time requirements the upstream schema does not enforce.
      let invalidBlock = false;
      const resolve = (node: ASTNode | undefined) => resolveRecoveryReference(node, symbols);
      for (const expression of symbols.values()) {
        walkAST(expression, node => {
          if (invalidBlock || node.k !== 'Comp') return;
          if (node.name === 'List') {
            const items = resolve(node.args[0]);
            invalidBlock = items?.k === 'Arr' && items.els.some(item => resolve(item)?.k === 'Obj');
          } else if (node.name === 'Table') {
            const columns = resolve(node.args[0]);
            const rows = resolve(node.args[1]);
            if (columns?.k !== 'Arr' || rows?.k !== 'Arr') return;
            invalidBlock = rows.els.some(item => {
              const row = resolve(item);
              return row?.k === 'Arr' && row.els.length !== columns.els.length;
            });
          }
        });
      }
      if (invalidBlock) return fail('schema');
    }
    stage = 'accuracy';
    if (contradictsMonthlyChart(result.root, narrative)) return fail('data_review');
    return { ok: true };
  } catch { return fail('syntax'); }
}

export function validateNativeWorkspaceProgram(program: string, evidenceIds: ReadonlySet<string> | undefined, prose: string, diagnose?: (value: NativeUiDiagnostic) => void, editorial?: EditorialContext) {
  return validateNativeOpenUi(program, evidenceIds, prose, diagnose, true, editorial);
}

// Only reprint changed expressions. Keeping untouched declarations verbatim preserves
// the original spelling of reactive formulas and state references.
function printRecoveryExpression(node: ASTNode): string {
  const print = printRecoveryExpression;
  switch (node.k) {
    case 'Comp': return (node.fn || localActions.has(node.name) ? '@' : '') + node.name + '(' + node.args.map(print).join(', ') + ')';
    case 'Ref': case 'StateRef': return node.n;
    case 'Arr': return '[' + node.els.map(print).join(', ') + ']';
    case 'Obj': return '{' + node.entries.map(([key, value]) => JSON.stringify(key) + ': ' + print(value)).join(', ') + '}';
    case 'BinOp': return '(' + print(node.left) + ' ' + node.op + ' ' + print(node.right) + ')';
    case 'UnaryOp': return '(' + node.op + print(node.operand) + ')';
    case 'Ternary': return '(' + print(node.cond) + ' ? ' + print(node.then) + ' : ' + print(node.else) + ')';
    case 'Member': return print(node.obj) + '.' + node.field;
    case 'Index': return print(node.obj) + '[' + print(node.index) + ']';
    case 'Num': case 'Str': case 'Bool': return JSON.stringify(node.v);
    case 'Null': return 'null';
    default: throw new Error('Unsupported OpenUI recovery expression');
  }
}

/** Keep a directly requested working calculator ahead of its fallback when
 * the model emits it as the first native sibling after the bound Markdown. */
export function prioritizeNativeCalculator(program: string, prompt: string): string {
  const opening = /^\s*(?:please\s+)?(?:(?:can|could|would)\s+you\s+)?(?:build|create|make|design|show(?:\s+me)?|give\s+me|provide(?:\s+me\s+with)?)\s+([^.!?;\n]+)/iu.exec(prompt)?.[1];
  const artifact = opening && /\b(?:calculator|(?:interactive|adjustable|editable)\s+(?:estimator|simulator|calculation))\b/iu.exec(opening);
  const differentDeliverable = /\b(?:and|with|including|alongside|plus|report|guide|document|spreadsheet|dashboard|diagram|table|chart)\b/iu;
  const sequence = /\b(?:first|then|last|followed\s+by|follow\s+it\s+with)\b/iu;
  const position = /\b(?:before|after|above|below|under|start\s+with|begin\s+with|lead\s+with)\s+(?:[\p{L}-]+\s+){0,4}(?:background|intro(?:duction)?|explanation|assumptions|walkthrough|overview|examples?|formula(?:s)?|controls?|calculator|charts?|tables?)\b/iu;
  const answerPosition = /\b(?:at|near)\s+the\s+(?:top|bottom|end)\s+of\s+(?:the|your|this)\s+(?:answer|response|output|page|message)\b/iu;
  const explicitOrder = sequence.test(prompt) || position.test(prompt) || answerPosition.test(prompt);
  if (!artifact || differentDeliverable.test(opening?.slice(0, artifact.index) ?? '') || explicitOrder) return program;
  try {
    const statements = split(tokenize(program));
    const symbols = new Map(statements.map(statement => [statement.id, parseExpression(statement.tokens)]));
    const entry = statements.find(statement => statement.id === 'root');
    const root = symbols.get('root');
    if (entry?.start === undefined || entry.end === undefined || root?.k !== 'Comp' || root.name !== 'Col') return program;
    const children = root.args[0];
    if (children?.k !== 'Arr') return program;
    const [first, second, ...rest] = children.els;
    const markdown = resolveRecoveryReference(first, symbols);
    if (markdown?.k !== 'Comp' || markdown.name !== 'Markdown' || markdown.args[0]?.k !== 'Ref'
      || markdown.args[0].n !== '_xroga_answer' || !second
      || !subtreeHasReactiveCalculator(second, symbols) || rest.some(child => subtreeHasReactiveCalculator(child, symbols))) return program;
    const ordered = { ...root, args: [{ ...children, els: [second, first, ...rest] }, ...root.args.slice(1)] };
    const expression = printRecoveryExpression(ordered);
    if (JSON.stringify(parseExpression(tokenize(expression))) !== JSON.stringify(ordered)) return program;
    return program.slice(0, entry.start) + 'root = ' + expression + program.slice(entry.end);
  } catch {
    return program;
  }
}

/** Keep formulas in the authoritative Markdown when a calculator also
 * includes a copy in its introduction or metric caption. */
export function removeRepeatedCalculatorFormulas(program: string, prose: string): string {
  if (!prose.includes('=') || /^(?: {0,3})(?:```|~~~)/m.test(prose)) return program;
  const sentences = /(?<=[.!?])\s+|\n+/;
  const formulaKey = (sentence: string) => {
    if (!sentence.includes('=')) return '';
    return nativeReadableTextKey(sentence).replace(/^[^:\n]{1,64}:\s*/, '').replace(/[.!?]$/, '').trim();
  };
  const formulas = new Set(prose.split(sentences).map(formulaKey).filter(Boolean));
  if (!formulas.size) return program;
  const statements = split(tokenize(program)).map(statement => ({
    id: statement.id, expression: parseExpression(statement.tokens),
  }));
  const root = statements.find(statement => statement.id === 'root')?.expression;
  const children = root?.k === 'Comp' ? root.args[0] : undefined;
  const showsProse = children?.k === 'Arr' && children.els.some(child =>
    child.k === 'Comp' && child.name === 'Markdown' && child.args[0]?.k === 'Ref' && child.args[0].n === '_xroga_answer');
  if (!showsProse) return program;
  const key = (value: string) => nativeReadableTextKey(value).replace(/[.!?]$/, '').trim().toLowerCase();
  const equations = new Map<string, Set<string>>();
  for (const formula of formulas) {
    const equation = /^([\p{L}][\p{L}\p{N}\s]{0,79}) = ([^=]+)$/u.exec(formula);
    if (!equation || !/[×*÷/−+^]|\s-\s/u.test(equation[2])) continue;
    const label = key(equation[1]);
    const bodies = equations.get(label) ?? new Set<string>();
    bodies.add(key(equation[2]));
    equations.set(label, bodies);
  }
  const constants = new Map(statements.flatMap(({ id, expression }) => expression.k === 'Num' && !id.startsWith('$')
    ? [[id.replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/_/g, ' ').toLowerCase(), expression.v] as const] : []));
  const visibleAmounts = new Set(prose.match(/\b[A-Z]{3} \d+(?:\.\d+)?(?![\p{L}\p{N}_]|[.,]\d)/gu) ?? []);
  const matchingMetricFormula = (label: string, caption: string) => {
    const bodies = equations.get(key(label));
    if (!bodies?.size) return false;
    const visibleCaption = nativeReadableTextKey(caption);
    const restatedCaption = visibleCaption.replace(/\b([A-Z]{3} \d+(?:\.\d+)?)\s+(?=\p{L})/gu,
      (match, amount: string, offset: number) => {
        const operand = visibleCaption.slice(offset + match.length).split(/[×*÷/−+^]|\s-\s/u)[0];
        // A caption may spell out a fixed operand. Keep it unless the program
        // declares that exact amount and the visible prose already states it.
        return constants.get(key(operand)) === Number(amount.slice(4)) && visibleAmounts.has(amount) ? '' : match;
      });
    return bodies.has(key(restatedCaption)) || formulas.has(formulaKey(visibleCaption));
  };
  let changed = false;
  for (const { expression } of statements) walkAST(expression, node => {
    if (node.k !== 'Comp' || node.args[2]?.k !== 'Str') return;
    const introduction = node.args[2];
    if (node.name === 'Metric' && node.args[0]?.k === 'Str' && matchingMetricFormula(node.args[0].v, introduction.v)) {
      introduction.v = '';
      changed = true;
      return;
    }
    if (node.name !== 'Section') return;
    const parts = introduction.v.split(sentences);
    const retained = parts.filter(sentence => !formulas.has(formulaKey(sentence)));
    if (retained.length === parts.length) return;
    introduction.v = retained.join(' ');
    changed = true;
  });
  return changed ? statements.map(({ id, expression }) => id + ' = ' + printRecoveryExpression(expression)).join('\n') : program;
}

/** Reconcile static explanations before deriving saved prose. Calculations,
 * inputs and unrelated text stay intact. Exact repair only replaces labeled values. */
export function recoverNativeReadoutExplanations(program: string, replaceExactReadoutsOnly = false): string {
  const readouts = initialNativeReadouts(program, replaceExactReadoutsOnly);
  const multiples = replaceExactReadoutsOnly ? undefined : nativePrincipalMultipleReview(program);
  const initial = multiples?.conflictingNotes.size ? initialNativeValueReader(program) : undefined;
  const statements = split(tokenize(program)).map(statement=>({id:statement.id,expression:parseExpression(statement.tokens)}));
  const symbols = new Map(statements.map(statement=>[statement.id,statement.expression]));
  let changed = false;
  for (const {expression} of statements) {
    walkAST(expression, node => {
      if (initial && node.k === 'Comp' && node.name === 'Metric' && multiples?.conflictingNotes.has(String(initial(node.args[0])))) {
        node.args[2] = { k: 'Str', v: '' };
        changed = true;
      }
      if (node.k !== 'Comp' || !['Text', 'Caption', 'Markdown'].includes(node.name)) return;
      const body = resolveRecoveryReference(node.args[0],symbols);
      if (body?.k !== 'Str') return;
      const corrected = replaceExactReadoutsOnly
        ? correctExplicitCurrencyReadouts(correctExplicitReadoutShares(body.v, readouts), readouts)
        : recoverNativeReadoutProse(body.v, readouts, multiples);
      if (corrected !== body.v) {
        // Ordinary refs can also serve Code or other components. Only the
        // host-owned Markdown binding mirrors the canonical answer globally.
        const argument = node.args[0];
        if (argument?.k === 'Ref' && argument.n === '_xroga_answer') body.v = corrected;
        else node.args[0] = { k: 'Str', v: corrected };
        changed = true;
      }
    });
  }
  const repaired = statements.map(({id,expression})=>id + ' = ' + printRecoveryExpression(expression)).join('\n');
  return changed ? repaired : program;
}

function resolveRecoveryReference(node: ASTNode | undefined, symbols: ReadonlyMap<string, ASTNode | undefined>) {
  const followed = new Set<string>();
  while (node?.k === 'Ref') {
    if (followed.has(node.n)) return;
    followed.add(node.n);
    node = symbols.get(node.n);
  }
  return node;
}

/** Prefer the full written instructions when a second view repeats the same
 * numbered checklist and the user did not ask for editable checkboxes. */
export function removeRepeatedOptionalChecklist(program: string, prose: string): string {
  if (!program.includes('Checkbox')) return program;
  const { headings, orderedItems } = nativeMarkdownOutline(prose);
  if (orderedItems.length < 2) return program;
  const statements = split(tokenize(program));
  const symbols = new Map(statements.map(statement => [statement.id, parseExpression(statement.tokens)]));
  const resolve = (node: ASTNode | undefined) => resolveRecoveryReference(node, symbols);
  const entry = statements.find(statement => statement.id === 'root');
  const root = symbols.get('root');
  if (entry?.start === undefined || entry.end === undefined || root?.k !== 'Comp' || root.name !== 'Col') return program;
  const children = root.args[0];
  if (children?.k !== 'Arr' || !children.els.some(child => {
    const node = resolve(child);
    return node?.k === 'Comp' && node.name === 'Markdown'
      && node.args[0]?.k === 'Ref' && node.args[0].n === '_xroga_answer';
  })) return program;

  const stepKey = (value: string) => nativeReadableTextKey(value).replace(/[.!?]$/u, '').trim();
  const stepLabel = (value: string) => stepKey(value).split(/\s+[–—]\s+/u, 1)[0];
  const checkboxDirections = /^(?:tick|check|mark)\s+(?:off\s+)?each\b[^.!?\n]*[.!?]?(?:\s+all\s+(?:\p{L}+|\d+)\s+must be recorded before any \p{L}+ claim[.!?]?)?$/iu;
  const retained = children.els.filter(child => {
    const node = resolve(child);
    if (node?.k !== 'Comp' || node.name !== 'Section') return true;
    const title = resolve(node.args[0]);
    const items = resolve(node.args[1]);
    const introduction = resolve(node.args[2]);
    if (title?.k !== 'Str' || items?.k !== 'Arr' || items.els.length < 2
      || (introduction && (introduction.k !== 'Str' || /[\[\]<>]/u.test(introduction.v)))) return true;
    if (introduction?.k === 'Str' && introduction.v.trim() && !prose.includes(introduction.v)
      && !checkboxDirections.test(introduction.v.trim())) return true;
    const matching = headings.filter(path => nativeReadableTextKey(path.at(-1) ?? '') === nativeReadableTextKey(title.v));
    if (matching.length !== 1) return true;
    const scope = JSON.stringify(matching[0]);
    const written = orderedItems.filter(item => JSON.stringify(item.headings) === scope);
    if (written.length !== items.els.length) return true;

    const labels = new Set<string>();
    const repeated = items.els.every((item, index) => {
      const control = resolve(item);
      if (control?.k !== 'Comp' || control.name !== 'Checkbox' || control.args.length !== 2) return false;
      const [state, text] = control.args;
      const value = state?.k === 'StateRef' ? symbols.get(state.n) : undefined;
      const label = resolve(text);
      if (value?.k !== 'Bool' || value.v || label?.k !== 'Str' || /[\[\]<>]/u.test(label.v)) return false;
      const writtenStep = written[index].text;
      const lead = /^\*\*([^*]+)\*\*[ \t]+\S/u.exec(writtenStep)?.[1];
      const key = stepLabel(label.v);
      if (!key || labels.has(key)) return false;
      labels.add(key);
      const quantities = new Set(writtenStep.match(/\d+(?:\.\d+)?/gu));
      return stepKey(label.v) === stepKey(writtenStep) || (lead !== undefined && key === stepLabel(lead)
        && (label.v.match(/\d+(?:\.\d+)?/gu) ?? []).every(quantity => quantities.has(quantity)));
    });
    return !repeated;
  });
  if (retained.length === children.els.length) return program;
  try {
    const rewritten = { ...root, args: [{ ...children, els: retained }, ...root.args.slice(1)] };
    const expression = printRecoveryExpression(rewritten);
    if (JSON.stringify(parseExpression(tokenize(expression))) !== JSON.stringify(rewritten)) return program;
    return restrictNativeWorkspaceProgram(program.slice(0, entry.start) + 'root = ' + expression + program.slice(entry.end), () => true);
  } catch {
    return program;
  }
}

function normalizeDiagramRows(node: ASTNode, symbols: ReadonlyMap<string, ASTNode>, isNode: boolean): ASTNode {
  const rows = resolveRecoveryReference(node, symbols);
  if (rows?.k !== 'Arr' || rows.els.length > (isNode ? 12 : 18)) return node;
  const optionalFields = isNode ? ['detail', 'tone', 'icon'] : ['label'];
  const els = rows.els.map(row => {
    const object = resolveRecoveryReference(row, symbols);
    if (object?.k !== 'Obj') return row;
    const entries = object.entries.flatMap(([key, raw]): [string, ASTNode][] => {
      const value = resolveRecoveryReference(raw, symbols);
      if (value?.k === 'Null' && optionalFields.includes(key)) return [];
      if (isNode && key === 'tone' && (value?.k !== 'Str' || !DIAGRAM_NODE_TONES.some(tone => tone === value.v))) return [];
      if (isNode && key === 'level' && value?.k === 'Str' && /^[0-5]$/.test(value.v)) {
        return [[key, { k: 'Num', v: Number(value.v) }]];
      }
      return [[key, raw]];
    });
    return entries.length !== object.entries.length || entries.some(([, value], i) => value !== object.entries[i][1])
      ? { ...object, entries } : row;
  });
  return els.some((row, index) => row !== rows.els[index]) ? { ...rows, els } : node;
}

function normalizeWorkspaceComponents(node: ASTNode, symbols: ReadonlyMap<string, ASTNode>, omitUnsupportedNotes = false): ASTNode {
  const normalize = (child: ASTNode) => normalizeWorkspaceComponents(child, symbols, omitUnsupportedNotes);
  const original = node.k === 'Comp' && node.name === 'List' ? node.args[0] : undefined;
  const items = resolveRecoveryReference(original, symbols);
  if (node.k === 'Comp') {
    const args = node.args.map((arg, index) => node.name === 'Diagram' && (index === 1 || index === 2)
      ? normalizeDiagramRows(arg, symbols, index === 1) : normalize(arg));
    // A Metric note is a display-only annotation. Retain the label, original
    // result expression and controls when a model invents a formatting helper
    // in that annotation. Never substitute a value in the calculation itself.
    const note = node.name === 'Metric' && omitUnsupportedNotes ? resolveRecoveryReference(args[2], symbols) : undefined;
    if (note) {
      let unsupported = false;
      walkAST(note, part => {
        if (part.k === 'Comp' && part.fn && !registeredNativeCall(part.name)) unsupported = true;
      });
      if (unsupported) args[2] = { k: 'Str', v: '' };
    }
    // Preserve a model-supplied table caption without widening Table's schema or
    // discarding the requested data. The complete candidate is validated below.
    if (node.name === 'Table' && args.length === 3
        && resolveRecoveryReference(args[2], symbols)?.k === 'Str') {
      return { k: 'Comp', name: 'Col', args: [{ k: 'Arr', els: [
        { k: 'Comp', name: 'Table', args: args.slice(0, 2) },
        { k: 'Comp', name: 'Caption', args: [args[2]] },
      ] }] };
    }
    if (items?.k === 'Arr') {
      const els = items.els.map(item => {
        const value = resolveRecoveryReference(item, symbols);
        if (value?.k !== 'Obj') return normalize(item);
        const fields = new Map(value.entries);
        const keys = ['title', 'description', 'marker', 'children'];
        const values = keys.map(key => fields.get(key));
        if (!values[0] || fields.size !== value.entries.length || [...fields.keys()].some(key => !keys.includes(key))) return item;
        let last = values.length - 1;
        while (values[last] === undefined) last -= 1;
        return { k: 'Comp', name: 'ListItem', args: values.slice(0, last + 1).map(value =>
          value ? normalize(value) : { k: 'Str', v: '' }) } satisfies ASTNode;
      });
      if (els.some((item, index) => item !== items.els[index])) args[0] = { ...items, els };
    }
    if (args.some((arg, index) => arg !== node.args[index])) return { ...node, args };
  } else if (node.k === 'Arr') {
    const els = node.els.map(normalize);
    if (els.some((item, index) => item !== node.els[index])) return { ...node, els };
  }
  return node;
}

/** Retain closed declarations and root children before a provider-truncated tail. */
type RecoveryValidator = (program: string, prose: string, diagnose?: (value: NativeUiDiagnostic) => void) => NativeUiValidation;
const defaultRecoveryValidator = (evidenceIds: ReadonlySet<string> | undefined): RecoveryValidator =>
  (program, prose, diagnose) => validateNativeWorkspaceProgram(program, evidenceIds, prose, diagnose);

export function recoverTruncatedNativeWorkspaceProgram(program: string, evidenceIds: ReadonlySet<string> | undefined, prose: string,
  check = defaultRecoveryValidator(evidenceIds)) {
  if (program.length > MAX_PROGRAM_CHARS) return;
  try {
    const tokens = tokenize(program);
    if (tokens.length > 4800) return;
    const statements = split(tokens);
    const tail = statements.at(-1);
    if (tail?.start === undefined || tail.end !== program.length || statements.slice(0, -1).some(item => item.id === tail.id)) return;

    // These delimiter token numbers are the same pinned lexer contract used by validation.
    const closes: number[] = [];
    let rootChildBoundary = 0;
    const [component, paren, list] = tail.tokens;
    let rootListOpen = tail.id === 'root' && component?.t === 17 && component.v === 'Col' && paren?.t === 1 && list?.t === 3;
    for (const [index, token] of tail.tokens.entries()) {
      if ([1, 3, 5].includes(token.t)) closes.push(token.t + 1);
      if ([2, 4, 6].includes(token.t) && closes.pop() !== token.t) return;
      if (rootListOpen && token.t === 7 && closes.length === 2) rootChildBoundary = index;
      if (rootListOpen && token.t === 4 && closes.length === 1) {
        rootChildBoundary = index;
        rootListOpen = false;
      }
    }
    if (!closes.length) return;

    let prefix = program.slice(0, tail.start).trimEnd();
    if (tail.id === 'root') {
      if (rootChildBoundary <= 3) return;
      // Retain only children terminated by a root-list comma or bracket.
      const expression = parseExpression([...tail.tokens.slice(0, rootChildBoundary), { t: 4 }, { t: 2 }]);
      const printed = printRecoveryExpression(expression);
      if (JSON.stringify(parseExpression(tokenize(printed))) !== JSON.stringify(expression)) return;
      prefix = [prefix, 'root = ' + printed].filter(Boolean).join('\n');
    }
    const validation = check(prefix, prose);
    if (validation.ok) return { program: prefix, validation, partial: true };
    if (validation.reason === 'reference') return recoverNativeWorkspaceProgram(prefix, evidenceIds, prose, 'reference', check);
  } catch {
    // A damaged token stream must not suppress the readable answer.
  }
}

const layoutChildren = new Map([['Col', 0], ['Row', 0], ['Grid', 0], ['Card', 0], ['Box', 0], ['Controls', 0], ['Section', 1]]);

/** Project an already validated program to the requested components. The caller
 * validates the projected program again before displaying it or reading prose. */
export function restrictNativeWorkspaceProgram(program: string, keep: (component: string) => boolean): string {
  const statements = split(tokenize(program));
  const original = new Map(statements.map(statement => [statement.id, parseExpression(statement.tokens)]));
  const projected = new Map<string, ASTNode | undefined>();
  const declaration = (name: string): ASTNode | undefined => {
    if (!projected.has(name)) {
      // The validated source is acyclic. Leave a defensive sentinel before
      // following references and reject an incomplete projection downstream.
      projected.set(name, undefined);
      const value = original.get(name);
      if (value) projected.set(name, project(value));
    }
    return projected.get(name);
  };
  function project(node: ASTNode): ASTNode | undefined {
    if (node.k === 'Ref') return declaration(node.n) ? node : undefined;
    if (node.k === 'Arr') {
      const els = node.els.map(project).filter((item): item is ASTNode => item !== undefined);
      return els.length === node.els.length && els.every((item, index) => item === node.els[index]) ? node : { ...node, els };
    }
    if (node.k === 'Obj') {
      const entries = node.entries.flatMap(([key, item]): [string, ASTNode][] => {
        const value = project(item);
        return value ? [[key, value]] : [];
      });
      return entries.length === node.entries.length && entries.every(([, item], index) => item === node.entries[index][1])
        ? node : { ...node, entries };
    }
    if (node.k === 'Comp') {
      if (components.has(node.name) && !keep(node.name)) return;
      const args = node.args.map(project);
      if (!args.every((arg): arg is ASTNode => arg !== undefined)) return;
      const index = layoutChildren.get(node.name);
      const child = index === undefined ? undefined : resolveRecoveryReference(args[index], projected);
      if (child?.k === 'Arr' && !child.els.length) return;
      return args.every((arg, index) => arg === node.args[index]) ? node : { ...node, args };
    }
    if (node.k === 'Ternary') {
      const then = project(node.then), otherwise = project(node.else);
      if (!then || !otherwise) return;
      return then === node.then && otherwise === node.else ? node : { ...node, then, else: otherwise };
    }
    return node;
  }
  if (!declaration('root')) return '';
  const reachable = new Set<string>();
  function visit(name: string) {
    if (reachable.has(name)) return;
    const node = declaration(name);
    if (!node) return;
    reachable.add(name);
    // Walk retained expressions for references from formulas and state bindings.
    walkAST(node, part => {
      if (part.k === 'Ref' || part.k === 'StateRef') visit(part.n);
    });
  }
  visit('root');
  return statements.flatMap(statement => {
    if (!reachable.has(statement.id)) return [];
    const node = projected.get(statement.id);
    if (!node) return [];
    if (node === original.get(statement.id) && statement.start !== undefined && statement.end !== undefined) {
      return [program.slice(statement.start, statement.end)];
    }
    const printed = printRecoveryExpression(node);
    if (JSON.stringify(parseExpression(tokenize(printed))) !== JSON.stringify(node)) throw new Error('OpenUI projection changed expression semantics');
    return [statement.id + ' = ' + printed];
  }).join('\n');
}

/** Every recovered candidate passes the full authority, schema and data checks.
 * Reachable branches with unresolved references may be omitted from the view. */
export function recoverNativeWorkspaceProgram(program: string, evidenceIds: ReadonlySet<string> | undefined, prose: string,
  failure: 'schema' | 'factual_review' | 'reference' | 'authority' = 'schema', check = defaultRecoveryValidator(evidenceIds)) {
  try {
    const statements = split(tokenize(program));
    const declarations = new Map(statements.map(item => [item.id, item]));
    const originals = new Map(statements.map(item => [item.id, parseExpression(item.tokens)]));
    const reviewStrings = new Set([prose]);
    for (const expression of originals.values()) walkAST(expression, node => {
      if (node.k === 'Str') reviewStrings.add(node.v);
    });
    const narrative = [...reviewStrings].join('\n');
    if (failure === 'reference' && reviewNativeAnswer(narrative)) return;
    if (failure === 'authority') {
      let unsafeBinding = false;
      for (const [id, expression] of originals) {
        if (id.startsWith('$') && !['Num', 'Str', 'Bool', 'Null'].includes(expression.k)) return;
        walkAST(expression, node => {
          if (node.k !== 'Comp') return;
          if (localActions.has(node.name) && node.args[0]?.k !== 'StateRef') unsafeBinding = true;
          if (node.name === 'Source' && (node.args[0]?.k !== 'Str' || !evidenceIds?.has(node.args[0].v))) unsafeBinding = true;
        });
      }
      if (unsafeBinding) return;
    }
    const symbols = new Map([...originals].map(([id, node]) => [
      id, normalizeWorkspaceComponents(node, originals, failure === 'authority'),
    ]));
    const root = resolveRecoveryReference(symbols.has('root') ? symbols.get('root')
      : [...symbols.values()].find(node => node.k === 'Comp' && node.name === 'Col'), symbols);
    if (root?.k !== 'Comp' || root.name !== 'Col') return;
    if (failure === 'schema' && !symbols.has('root')) {
      // Make upstream's selected fallback entry explicit. Preserve every original
      // declaration and require a fresh full validation before publishing it.
      const entry = [...originals].find(([, node]) => node.k === 'Comp' && node.name === 'Col');
      if (entry) {
        const explicit = 'root = ' + entry[0] + '\n' + program;
        const validation = check(explicit, prose);
        if (validation.ok) return { program: explicit, validation, partial: false };
      }
    }
    const sourceFor = (id: string, node: ASTNode) => {
      const item = declarations.get(id);
      if (item && originals.get(id) === node && item.start !== undefined && item.end !== undefined) {
        return program.slice(item.start, item.end);
      }
      const printed = printRecoveryExpression(node);
      // A reprinted expression must retain its meaning in the pinned parser.
      if (JSON.stringify(parseExpression(tokenize(printed))) !== JSON.stringify(node)) {
        throw new Error('OpenUI recovery changed expression semantics');
      }
      return id + ' = ' + printed;
    };
    const normalized = [...symbols].some(([id, node]) => originals.get(id) !== node);
    if (failure === 'schema' && normalized) {
      const full = [...symbols].map(([id, node]) => sourceFor(id, node)).join('\n');
      const validation = check(full, narrative);
      if (validation.ok || validation.reason === 'data_review') return { program: full, validation, partial: false };
      if (validation.reason !== 'schema') return;
    }

    function render(candidate: ASTNode): string {
      const included = new Set<string>();
      function collect(node: ASTNode): void {
        walkAST(node, ref => {
          if ((ref.k !== 'Ref' && ref.k !== 'StateRef') || included.has(ref.n)) return;
          const value = symbols.get(ref.n);
          if (!value || ref.n === 'root') return;
          included.add(ref.n);
          collect(value);
        });
      }
      collect(candidate);
      return [sourceFor('root', candidate), ...[...symbols].filter(([id]) => included.has(id))
        .map(([id, node]) => sourceFor(id, node))].join('\n');
    }

    if (failure === 'authority' && normalized) {
      const full = render(root);
      const validation = check(full, narrative);
      if (validation.ok || validation.reason === 'data_review') return { program: full, validation, partial: false };
    }

    if (failure === 'factual_review' && claimsChartIsDeferred(prose)) {
      const children = resolveRecoveryReference(root.args[0], symbols);
      if (children?.k !== 'Arr') return;
      const chartState = new Set<string>();
      function componentFacts(node: ASTNode, visit: (part: ASTNode) => void, seen = new Set<string>()) {
        walkAST(node, part => {
          visit(part);
          if (part.k !== 'Ref' || seen.has(part.n)) return;
          seen.add(part.n);
          const target = symbols.get(part.n);
          if (target) componentFacts(target, visit, seen);
        });
      }
      const branches = children.els.map(child => {
        let hasChart = false;
        const reads = new Set<string>();
        componentFacts(child, part => {
          if (part.k === 'StateRef') reads.add(part.n);
          if (part.k !== 'Comp' || part.name !== 'Chart') return;
          hasChart = true;
          componentFacts(part, value => { if (value.k === 'StateRef') chartState.add(value.n); });
        });
        return { child, hasChart, reads };
      });
      const kept = branches.filter(branch => !branch.hasChart && ![...branch.reads].some(state => chartState.has(state)));
      if (!kept.length) return;
      const recovered = render({ ...root, args: [{ k: 'Arr', els: kept.map(({ child }) => child) }, ...root.args.slice(1)] });
      const validation = check(recovered, prose);
      if (validation.ok && !contradictsMonthlyChart(parseProgram.parse(recovered).root, narrative)) {
        return { program: recovered, validation, partial: true };
      }
      return;
    }

    // Cap repeated parser calls independently of the provider output limits.
    let probes = 48;
    let blockedAuthority = false;
    // Keep the named platform in scope when its only mention was in a withheld component.
    const reviewContext = failure === 'factual_review' ? prose + '\n' + nativeTechnicalReviewContext(narrative) : prose;
    const validate = (candidate: ASTNode) => {
      if (blockedAuthority || probes-- <= 0) return;
      let authorityIssue: NativeUiDiagnostic['authorityIssue'];
      const validation = check(render(candidate), reviewContext,
        event => { authorityIssue = event.authorityIssue; });
      // Only an unregistered capability can be discarded as a visual branch.
      // An invalid action, source or expression still rejects the projection.
      if (validation.ok === false && validation.reason === 'authority' && authorityIssue !== 'unknown_capability') {
        blockedAuthority = true;
        return;
      }
      return validation;
    };
    if (failure === 'reference') {
      // The displayed root may already be intact. Drop only unreachable
      // declarations in that case and retain the complete layout.
      const reachable = render(root);
      const validation = check(reachable, narrative);
      if (validation.ok || validation.reason === 'data_review') return { program: reachable, validation, partial: false };
    }
    const group = (els: ASTNode[]): Extract<ASTNode, { k: 'Comp' }> => ({ k: 'Comp', name: 'Col', args: [{ k: 'Arr', els }] });
    const usable = (check: NativeUiValidation | undefined) => check?.ok === true || (check?.ok === false && check.reason === 'data_review');
    function salvage(children: ASTNode[], depth: number): ASTNode[] {
      if (!children.length || depth > 8 || probes <= 0) return [];
      const check = validate(group(children));
      if (usable(check)) return children;
      if (check?.ok !== false || (check.reason !== 'schema' && check.reason !== failure)) return [];
      if (children.length === 1) {
        const layout = salvageLayout(resolveRecoveryReference(children[0], symbols), depth);
        if (!layout) return [];
        // A malformed container prop should not erase its validated children.
        return usable(validate(group([layout.container]))) ? [layout.container] : layout.children;
      }
      const middle = Math.floor(children.length / 2);
      return [...salvage(children.slice(0, middle), depth), ...salvage(children.slice(middle), depth)];
    }
    function salvageLayout(node: ASTNode | undefined, depth: number) {
      if (node?.k !== 'Comp') return;
      const index = layoutChildren.get(node.name);
      if (index === undefined) return;
      const children = resolveRecoveryReference(node.args[index], symbols);
      if (children?.k !== 'Arr') return;
      const els = salvage(children.els, depth + 1);
      if (!els.length) return;
      const args = node.args.slice();
      args[index] = { k: 'Arr', els };
      return { container: { ...node, args }, children: els };
    }
    const layout = salvageLayout(root, 0);
    if (!layout) return;
    const recovered = usable(validate(layout.container)) ? layout.container : group(layout.children);
    if (blockedAuthority) return;
    const restored = render(recovered);
    const validation = check(restored, failure === 'factual_review' ? reviewContext : narrative);
    if (failure === 'factual_review') {
      // Omitted components must not hide a contradiction with any surviving chart.
      if (!validation.ok || contradictsMonthlyChart(parseProgram.parse(restored).root, narrative)) return;
    }
    if (validation.ok || validation.reason === 'data_review') {
      const originalChildren = resolveRecoveryReference(root.args[0], symbols);
      // A schema repair that only resets the root's optional layout settings
      // keeps every requested block. A discarded or replaced child stays partial.
      const keptAllChildren = failure === 'schema' && originalChildren?.k === 'Arr'
        && originalChildren.els.length === layout.children.length
        && originalChildren.els.every((child, index) => child === layout.children[index]);
      return { program: restored, validation, partial: !keptAllChildren };
    }
  } catch {
    // Keep the original prose when recovery cannot safely rebuild the layout.
  }
}
