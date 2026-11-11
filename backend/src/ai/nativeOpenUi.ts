import { createParser, parseExpression, split, tokenize, walkAST, type ASTNode, type LibraryJSONSchema } from '@openuidev/lang-core';
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
  if (marker >= 0) return {
    text: normalized.slice(0, marker).trim(),
    program: normalized.slice(marker + NATIVE_UI_MARKER.length).trimEnd().replace(deepSeekToolClosingSuffix, '').trimEnd()
      .replace(strayRootClosingLine, '').trim(),
  };
  // Never flash a partial separator as part of the answer.
  let text = normalized;
  if (streaming) {
    const last = text.lastIndexOf('\n');
    if (last >= 0 && NATIVE_UI_MARKER.startsWith(text.slice(last))) text = text.slice(0, last);
  }
  return { text: text.trim(), program: '' };
}

/** Recover readable details from an already validated program when the model
 * returned only an overview or left a Markdown heading without its body. */
export function supplementNativeProse(prose: string, program: string): string {
  const unfinishedHeading = /(?:^|\n)#{1,6}[^\S\n]+[^\n]+$/.test(prose.trimEnd());
  if (!unfinishedHeading && (prose.length > 600 || prose.includes('\n'))) return prose;
  const record = (value: unknown): Record<string, unknown> =>
    value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
  const array = (value: unknown) => Array.isArray(value) ? value as unknown[] : [];
  const scalar = (value: unknown): string => typeof value === 'string' || typeof value === 'number' ? String(value) : '';
  const root = parseProgram.parse(program).root;
  const children = array(root?.props.children);
  const firstBlock = children.findIndex(child => (
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
  function project(value: unknown): void {
    if (remaining <= 0) return;
    if (Array.isArray(value)) { value.forEach(project); return; }
    if (typeof value === 'string' || typeof value === 'number') { add(String(value)); return; }
    const node = record(value);
    if (node.type !== 'element') return;
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
      const row = (cells: unknown) => array(cells).map(scalar).join(' | ');
      add(row(props.columns));
      array(props.rows).forEach(cells => add(row(cells)));
    } else if (node.typeName === 'Chart' && Array.isArray(props.data)) {
      const presentation = record(props.presentation);
      const columns = [scalar(props.x), ...array(props.series).map(scalar)].filter(Boolean);
      add(scalar(presentation.title));
      if (columns.length > 1) {
        add([scalar(presentation.xLabel) || columns[0], scalar(presentation.yLabel) || columns.slice(1).join(' | ')].join(' | '));
        props.data.forEach(row => add(columns.map(key => scalar(record(row)[key])).join(' | ')));
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
    } else if (node.typeName === 'Source') {
      const index = /^source-(\d+)$/.exec(scalar(props.id))?.[1];
      if (index) add('[' + index + ']');
    } else {
      for (const key of ['title', 'introduction', 'text', 'description', 'role', 'items'] as const) project(props[key]);
    }
    project(props.children);
  }
  project(children.slice(firstBlock));
  return lines.length ? prose + '\n\n' + lines.join('\n\n') : prose;
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
export function validateNativeOpenUi(program: string, evidenceIds: ReadonlySet<string> = new Set(), prose = '', diagnose?: (value: NativeUiDiagnostic) => void): NativeUiValidation {
  let stage: ValidationStage = 'limits';
  let statement: number | undefined;
  let statements: ReturnType<typeof split> = [];
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
    stage = 'schema';
    const result = parseProgram.parse(program);
    if (result.queryStatements.length || result.mutationStatements.length) return fail('authority');
    if (!result.root || result.root.typeName !== 'Col' || result.meta.incomplete || result.meta.unresolved.length || result.meta.errors.length) return fail('schema', result.meta.errors);
    stage = 'accuracy';
    const narrative = [prose, ...reviewStrings].join('\n');
    const reviewReason = nativeAnswerReviewReason(narrative);
    if (reviewReason) return fail(reviewReason);
    if (contradictsMonthlyChart(result.root, narrative)) return fail('data_review');
    return { ok: true };
  } catch { return fail('syntax'); }
}

/** Only called after the entire program passed the authority audit and failed schema validation.
 * Rebuild the root from named, independent sections and validate the exact new program. */
export function recoverIndependentNativeSections(program: string, evidenceIds: ReadonlySet<string> | undefined, prose: string) {
  try {
    const statements = split(tokenize(program));
    const root = statements.find(item => item.id === 'root');
    if (!root) return;
    const expression = parseExpression(root.tokens);
    if (expression.k !== 'Comp' || expression.name !== 'Col' || expression.args.length !== 1 || expression.args[0].k !== 'Arr') return;
    const children = expression.args[0].els;
    if (children.length < 2 || children.length > 12 || children.some(child => child.k !== 'Ref')) return;
    const declarations = new Map(statements.map(item => [item.id, item]));
    const included = new Set<string>();
    const names: string[] = [];
    const sourceFor = (ids: ReadonlySet<string>) => statements.filter(item => ids.has(item.id))
      .map(item => program.slice(item.start, item.end)).join('\n');
    for (const child of children) {
      if (child.k !== 'Ref' || names.includes(child.n)) continue;
      const ids = new Set<string>();
      const pending = [child.n];
      let isolated = true;
      for (let id = pending.pop(); id; id = pending.pop()) {
        if (ids.has(id)) continue;
        const declaration = declarations.get(id);
        if (id === 'root' || !declaration || declaration.start === undefined || declaration.end === undefined) {
          isolated = false;
          break;
        }
        ids.add(id);
        walkAST(parseExpression(declaration.tokens), node => {
          if (node.k === 'Ref' || node.k === 'StateRef') pending.push(node.n);
        });
      }
      if (!isolated || !validateNativeOpenUi(`root = Col([${child.n}])\n${sourceFor(ids)}`, evidenceIds, prose).ok) continue;
      names.push(child.n);
      ids.forEach(id => included.add(id));
    }
    if (!names.length || names.length === children.length) return;
    const recovered = `root = Col([${names.join(', ')}])\n${sourceFor(included)}`;
    if (validateNativeOpenUi(recovered, evidenceIds, prose).ok) return recovered;
  } catch {
    // Prose remains authoritative when the components cannot be separated safely.
  }
}
