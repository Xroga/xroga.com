import { createParser, evaluate, parseExpression, split, tokenize, walkAST, type ASTNode, type LibraryJSONSchema } from '@openuidev/lang-core';
import { contradictsMonthlyChart, monthlyChartDataFallback, nativeAnswerReviewReason, suppliedMonthlyComparison } from './nativeOpenUiAccuracy.js';
import catalog from './nativeOpenUiCatalog.json' with { type: 'json' };

export const NATIVE_UI_FORMAT = 'xroga-openui-v1' as const;
export const NATIVE_UI_LIBRARY = 'xroga-native-v1' as const;
export const NATIVE_UI_MARKER = '\n<<<XROGA_OPENUI_V1>>>\n';
export const PARTIAL_NATIVE_PRESENTATION_NOTE = 'Some visuals could not be validated. The available explanation and verified visuals are shown below.';
export const MAX_PROGRAM_CHARS = 24000;
const parseProgram = createParser(catalog.schema as LibraryJSONSchema, 'Col');
const components = new Set(Object.keys(catalog.spec.components));
const pureFunctions = new Set(Object.keys(catalog.spec.functions));
const localActions = new Set(['Set', 'Reset']);
const operators = new Set(['+', '-', '*', '/', '%', '==', '!=', '<', '>', '<=', '>=', '&&', '||']);
const safeKey = (key: string) => !['__proto__', 'prototype', 'constructor'].includes(key);
// The Zurelay DeepSeek compatibility path can append the closing tool-call
// envelope to an otherwise valid native answer. Keep transport syntax out of
// the persisted program. A quoted example or an embedded tag is not a suffix.
const deepSeekToolClosingSuffix = /[ \t]*<\/｜DSML｜ parameter>[ \t]*\n[ \t]*<\/｜DSML｜ invoke>[ \t]*\n[ \t]*<\/｜DSML｜ calls>[ \t]*$/u;
const strayRootClosingLine = /\n[ \t]*<\/Col>[ \t]*$/u;

export function splitNativeOpenUiAnswer(raw: string, streaming = false) {
  const normalized = raw.replace(/\r\n/g, '\n');
  const marker = normalized.indexOf(NATIVE_UI_MARKER);
  const openingMarker = NATIVE_UI_MARKER.slice(1);
  const startsWithMarker = normalized.startsWith(openingMarker);
  if (marker >= 0 || startsWithMarker) return {
    text: startsWithMarker ? '' : normalized.slice(0, marker).trim(),
    program: normalized.slice(startsWithMarker ? openingMarker.length : marker + NATIVE_UI_MARKER.length).trimEnd().replace(deepSeekToolClosingSuffix, '').trimEnd()
      .replace(strayRootClosingLine, '').trim(),
  };
  // Never flash a partial separator as part of the answer.
  let text = normalized;
  if (streaming) {
    if (openingMarker.startsWith(text)) return { text: '', program: '' };
    const last = text.lastIndexOf('\n');
    if (last >= 0 && NATIVE_UI_MARKER.startsWith(text.slice(last))) text = text.slice(0, last);
  }
  return { text: text.trim(), program: '' };
}

/** Recover readable details from an already validated program when the model
 * omitted its prose, returned an overview or left a heading without its body. */
export function supplementNativeProse(prose: string, program: string, includeAll = false): string {
  const unfinishedHeading = /(?:^|\n)#{1,6}[^\S\n]+[^\n]+$/.test(prose.trimEnd());
  if (!includeAll && !unfinishedHeading && (prose.length > 600 || prose.includes('\n'))) return prose;
  const record = (value: unknown): Record<string, unknown> =>
    value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
  const array = (value: unknown) => Array.isArray(value) ? value as unknown[] : [];
  const scalar = (value: unknown): string => typeof value === 'string' || typeof value === 'number' ? String(value) : '';
  const { root, stateDeclarations } = parseProgram.parse(program);
  const children = array(root?.props.children);
  const firstBlock = includeAll || !prose ? 0 : children.findIndex(child => (
    unfinishedHeading ? !['Title', 'Text', 'Badge'].includes(scalar(record(child).typeName))
      : ['Section', 'Code', 'Table', 'Diagram', 'Chart'].includes(scalar(record(child).typeName))
  ));
  if (firstBlock < 0) return prose;
  const lines: string[] = [];
  const seen = new Set<string>();
  let remaining = 24_000;
  const add = (value: string) => {
    if (!value || value.length > remaining || seen.has(value) || prose.includes(value)) return;
    lines.push(value);
    seen.add(value);
    remaining -= value.length;
  };
  const addTable = (headings: string[], rows: string[][]) => {
    if (!headings.length || !rows.length) return;
    const row = (cells: string[]) => '| ' + cells.map(cell =>
      cell.replace(/\\/g, '\\\\').replace(/\|/g, '\\|').replace(/[\r\n]+/g, ' ')).join(' | ') + ' |';
    add([row(headings), row(headings.map(() => '---')), ...rows.map(row)].join('\n'));
  };
  function project(value: unknown): void {
    if (remaining <= 0) return;
    if (Array.isArray(value)) { value.forEach(project); return; }
    if (typeof value === 'string' || typeof value === 'number') { add(String(value)); return; }
    const node = record(value);
    if (node.type !== 'element') {
      if (node.title || node.description) add('- ' + [scalar(node.title), scalar(node.description)].filter(Boolean).join(': '));
      return;
    }
    const props = record(node.props);
    if (node.typeName === 'ListItem') {
      add('- ' + [scalar(props.title), scalar(props.description)].filter(Boolean).join(': '));
    } else if (node.typeName === 'Section') {
      const title = scalar(props.title);
      if (title) add('## ' + title);
      add(scalar(props.introduction));
    } else if (node.typeName === 'Code') {
      const code = scalar(props.code);
      if (code && !prose.includes(code)) {
        const longestRun = (code.match(/\x60+/g) ?? []).reduce((length, run) => Math.max(length, run.length), 0);
        const fence = String.fromCharCode(96).repeat(Math.max(3, longestRun + 1));
        const language = scalar(props.language);
        add(fence + (/^[a-z0-9+#-]{1,30}$/i.test(language) ? language : '') + '\n' + code + '\n' + fence);
      }
    } else if (node.typeName === 'Table') {
      addTable(array(props.columns).map(scalar), array(props.rows).map(cells => array(cells).map(scalar)));
    } else if (node.typeName === 'Chart' && Array.isArray(props.data)) {
      const presentation = record(props.presentation);
      const columns = [scalar(props.x), ...array(props.series).map(scalar)].filter(Boolean);
      add(scalar(presentation.title));
      if (columns.length > 1) {
        const series = columns.slice(1);
        const yLabel = scalar(presentation.yLabel);
        addTable([scalar(presentation.xLabel) || columns[0], ...(series.length === 1 && yLabel ? [yLabel] : series)],
          props.data.map(row => columns.map(key => scalar(record(row)[key]))));
      }
      add(scalar(presentation.note));
    } else if (node.typeName === 'Diagram') {
      add(scalar(props.title));
      add(scalar(props.description));
      const names = new Map(array(props.nodes).map(item => {
        const node = record(item);
        return [scalar(node.id), scalar(node.label)];
      }));
      array(props.links).forEach(item => {
        const link = record(item);
        const from = names.get(scalar(link.from)), to = names.get(scalar(link.to));
        if (from && to) add('- ' + from + ' → ' + to + (link.label ? ': ' + scalar(link.label) : ''));
      });
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
      for (const key of ['title', 'introduction', 'text', 'description', 'role', 'items'] as const) project(props[key]);
    }
    project(props.children);
  }
  project(children.slice(firstBlock));
  return [prose, ...lines].filter(Boolean).join('\n\n');
}

export type NativeUiValidation = { ok: true } | { ok: false; reason: 'budget' | 'syntax' | 'authority' | 'reference' | 'schema' | 'authorization_review' | 'factual_review' | 'data_review' };
const reject = (reason: Extract<NativeUiValidation, { ok: false }>['reason']): NativeUiValidation => ({ ok: false, reason });
type ValidationStage = 'limits' | 'lexer' | 'statements' | 'authority' | 'schema' | 'accuracy';
export type NativeUiDiagnostic = {
  stage: ValidationStage;
  reason: Extract<NativeUiValidation, { ok: false }>['reason'];
  statement?: number;
  programLength: number;
  shape: Array<{ tokens: number; skeleton: string }>;
  schemaState?: { hasRoot: boolean; incomplete: boolean; unresolved: number; errors: number };
  schema?: Array<{ code: string; statement?: number; component?: string; pathDepth: number }>;
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
export function validateNativeOpenUi(program: string, evidenceIds: ReadonlySet<string> = new Set(), prose = '', diagnose?: (value: NativeUiDiagnostic) => void, workspaceContract = false): NativeUiValidation {
  let stage: ValidationStage = 'limits';
  let statement: number | undefined;
  let statements: ReturnType<typeof split> = [];
  let schemaState: NativeUiDiagnostic['schemaState'];
  const fail = (reason: NativeUiDiagnostic['reason'], errors?: ReturnType<typeof parseProgram.parse>['meta']['errors']) => {
    if (diagnose) diagnose({
      stage, reason, statement, programLength: program.length,
      shape: statements.slice(0, 12).map(({ tokens }) => ({
        tokens: tokens.length,
        skeleton: tokens.slice(0, 100).map((token, index) => {
          const name = token.v;
          return token.t !== 14 && tokens[index + 1]?.t === 1 && typeof name === 'string'
            && (components.has(name) || pureFunctions.has(name) || localActions.has(name)) ? name : String(token.t);
        }).join(' '),
      })),
      ...(schemaState ? { schemaState } : {}),
      ...(errors?.length ? { schema: errors.slice(0, 8).map(error => {
        const index = statements.findIndex(item => item.id === error.statementId);
        return { code: error.code, ...(index < 0 ? {} : { statement: index + 1 }),
          ...(components.has(error.component) ? { component: error.component } : {}),
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
    for (const statement of statements) {
      if (!/^\$?[a-zA-Z][a-zA-Z0-9_]{0,39}$/.test(statement.id) || !safeKey(statement.id) || symbols.has(statement.id)) return fail('syntax');
      if (statement.tokens.length > 1200) return fail('budget');
      symbols.set(statement.id, parseExpression(statement.tokens));
    }
    if (symbols.get('root')?.k !== 'Comp') return fail('syntax');
    stage = 'authority';
    let budget = 6000;
    const reviewStrings = new Set<string>();
    let reason: Extract<NativeUiValidation, { ok: false }>['reason'] = 'authority';
    function visit(node: ASTNode, active: Set<string>, depth = 0): boolean {
      if (--budget < 0 || depth > 28) { reason = 'budget'; return false; }
      const next = (value: ASTNode) => visit(value, active, depth + 1);
      switch (node.k) {
        case 'Comp':
          if (localActions.has(node.name) && node.args[0]?.k !== 'StateRef') return false;
          if (node.name === 'Source' && (node.args[0]?.k !== 'Str' || !evidenceIds.has(node.args[0].v))) return false;
          if (!components.has(node.name) && !pureFunctions.has(node.name) && !localActions.has(node.name)) return false;
          return node.args.every(next);
        case 'Ref':
        case 'StateRef': {
          const target = symbols.get(node.n);
          if (!target || active.has(node.n)) { reason = 'reference'; return false; }
          return visit(target, new Set([...active, node.n]), depth + 1);
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
          return node.v.length <= 8000;
        case 'Bool': case 'Null': return true;
        default: return false;
      }
    }
    for (const [key, node] of symbols) {
      statement = (statement ?? 0) + 1;
      if (key.startsWith('$') && !['Num', 'Str', 'Bool', 'Null'].includes(node.k)) return fail('authority');
      if (!visit(node, new Set([key]))) return fail(reason);
    }
    statement = undefined;
    stage = 'accuracy';
    const narrative = [prose, ...reviewStrings].join('\n');
    const reviewReason = nativeAnswerReviewReason(narrative);
    if (reviewReason) return fail(reviewReason);
    stage = 'schema';
    const result = parseProgram.parse(program);
    if (result.queryStatements.length || result.mutationStatements.length) return fail('authority');
    schemaState = {
      hasRoot: Boolean(result.root), incomplete: result.meta.incomplete,
      unresolved: result.meta.unresolved.length, errors: result.meta.errors.length,
    };
    if (!result.root || result.root.typeName !== 'Col' || result.meta.incomplete || result.meta.unresolved.length || result.meta.errors.length) return fail('schema', result.meta.errors);
    if (!Array.isArray(result.root.props.children) || !result.root.props.children.length) return fail('schema');
    if (workspaceContract) {
      // The upstream parser currently accepts plain objects in this union.
      // The actual List renderer only understands strings and ListItem nodes.
      let invalidList = false;
      for (const expression of symbols.values()) {
        walkAST(expression, node => {
          if (node.k !== 'Comp' || node.name !== 'List') return;
          const items = resolveRecoveryReference(node.args[0], symbols);
          if (items?.k === 'Arr' && items.els.some(item => resolveRecoveryReference(item, symbols)?.k === 'Obj')) invalidList = true;
        });
      }
      if (invalidList) return fail('schema');
    }
    stage = 'accuracy';
    if (contradictsMonthlyChart(result.root, narrative)) return fail('data_review');
    return { ok: true };
  } catch { return fail('syntax'); }
}

export function validateNativeWorkspaceProgram(program: string, evidenceIds: ReadonlySet<string> | undefined, prose: string, diagnose?: (value: NativeUiDiagnostic) => void) {
  return validateNativeOpenUi(program, evidenceIds, prose, diagnose, true);
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

// The authority check has already rejected cyclic references.
function resolveRecoveryReference(node: ASTNode | undefined, symbols: ReadonlyMap<string, ASTNode>) {
  while (node?.k === 'Ref') node = symbols.get(node.n);
  return node;
}

function rewriteListItems(node: ASTNode, symbols: ReadonlyMap<string, ASTNode>): ASTNode {
  const original = node.k === 'Comp' && node.name === 'List' ? node.args[0] : undefined;
  const items = resolveRecoveryReference(original, symbols);
  if (node.k === 'Comp') {
    const args = node.args.map(arg => rewriteListItems(arg, symbols));
    if (items?.k === 'Arr') {
      const els = items.els.map(item => {
        const value = resolveRecoveryReference(item, symbols);
        if (value?.k !== 'Obj') return rewriteListItems(item, symbols);
        const fields = new Map(value.entries);
        const keys = ['title', 'description', 'marker', 'children'];
        const values = keys.map(key => fields.get(key));
        if (!values[0] || fields.size !== value.entries.length || [...fields.keys()].some(key => !keys.includes(key))) return item;
        let last = values.length - 1;
        while (values[last] === undefined) last -= 1;
        return { k: 'Comp', name: 'ListItem', args: values.slice(0, last + 1).map(value =>
          value ? rewriteListItems(value, symbols) : { k: 'Str', v: '' }) } satisfies ASTNode;
      });
      if (els.some((item, index) => item !== items.els[index])) args[0] = { ...items, els };
    }
    if (args.some((arg, index) => arg !== node.args[index])) return { ...node, args };
  } else if (node.k === 'Arr') {
    const els = node.els.map(item => rewriteListItems(item, symbols));
    if (els.some((item, index) => item !== node.els[index])) return { ...node, els };
  }
  return node;
}

const layoutChildren = new Map([['Col', 0], ['Row', 0], ['Grid', 0], ['Card', 0], ['Box', 0], ['Section', 1]]);

/** Workspace calls this only after the original passes the authority and factual
 * gates and fails schema validation. Every candidate passes the same validator. */
export function recoverNativeWorkspaceProgram(program: string, evidenceIds: ReadonlySet<string> | undefined, prose: string) {
  try {
    const statements = split(tokenize(program));
    const declarations = new Map(statements.map(item => [item.id, item]));
    const originals = new Map(statements.map(item => [item.id, parseExpression(item.tokens)]));
    const reviewStrings = new Set([prose]);
    for (const expression of originals.values()) walkAST(expression, node => {
      if (node.k === 'Str') reviewStrings.add(node.v);
    });
    const narrative = [...reviewStrings].join('\n');
    const symbols = new Map([...originals].map(([id, node]) => [id, rewriteListItems(node, originals)]));
    const root = symbols.get('root');
    if (root?.k !== 'Comp' || root.name !== 'Col') return;
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
    if (normalized) {
      const full = [...symbols].map(([id, node]) => sourceFor(id, node)).join('\n');
      const validation = validateNativeWorkspaceProgram(full, evidenceIds, narrative);
      if (validation.ok || validation.reason === 'data_review') return { program: full, validation, partial: false };
      if (validation.reason !== 'schema') return;
    }

    function render(candidate: ASTNode): string {
      const included = new Set<string>();
      function collect(node: ASTNode): void {
        walkAST(node, ref => {
          if ((ref.k !== 'Ref' && ref.k !== 'StateRef') || included.has(ref.n)) return;
          const value = symbols.get(ref.n);
          if (!value || ref.n === 'root') throw new Error('Missing recovery dependency');
          included.add(ref.n);
          collect(value);
        });
      }
      collect(candidate);
      return [sourceFor('root', candidate), ...[...symbols].filter(([id]) => included.has(id))
        .map(([id, node]) => sourceFor(id, node))].join('\n');
    }

    // Cap repeated parser calls independently of the provider output limits.
    let probes = 48;
    const validate = (candidate: ASTNode) => probes-- > 0
      ? validateNativeWorkspaceProgram(render(candidate), evidenceIds, prose) : undefined;
    const group = (els: ASTNode[]): Extract<ASTNode, { k: 'Comp' }> => ({ k: 'Comp', name: 'Col', args: [{ k: 'Arr', els }] });
    const usable = (check: NativeUiValidation | undefined) => check?.ok === true || (check?.ok === false && check.reason === 'data_review');
    function salvage(children: ASTNode[], depth: number): ASTNode[] {
      if (!children.length || depth > 8 || probes <= 0) return [];
      const check = validate(group(children));
      if (usable(check)) return children;
      if (check?.ok !== false || check.reason !== 'schema') return [];
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
    const recovered = layout && (usable(validate(layout.container)) ? layout.container : group(layout.children));
    if (!recovered) return;
    const restored = render(recovered);
    const validation = validateNativeWorkspaceProgram(restored, evidenceIds, narrative);
    if (validation.ok || validation.reason === 'data_review') return { program: restored, validation, partial: true };
  } catch {
    // Keep the original prose when recovery cannot safely rebuild the layout.
  }
}
