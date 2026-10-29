/**
 * Language adapters: JavaScript/TypeScript, Python and Go.
 *
 * Why not a parser package: the backend ships with `typescript` as a dev dependency only (the production image prunes it), and no
 * grammar package is admitted. A comment- and string-aware structural scan that tracks nesting is enough for what the map needs
 * (declarations, signatures, import statements, test names) and is honest about its level: it is NOT a type checker and never
 * reports a resolved type reference. Source that does not scan cleanly keeps the partial result and is marked `malformed`; a file
 * that throws yields no symbols at all rather than invented ones.
 */
import { extractSymbols as lexicalSymbols, extractImports as lexicalImports } from '../../synthesis/repositoryIndex.js';
import type { FileAnalysis, ImportKind, RawImport, SymbolInfo } from './types.js';
import { EMPTY_ANALYSIS } from './types.js';

const MAX_SYMBOLS = 400;
const MAX_IMPORTS = 300;
const MAX_TEST_NAMES = 60;
const MAX_SIGNATURE = 160;

const EXTENSION_LANGUAGE: Readonly<Record<string, string>> = {
  ts: 'typescript', tsx: 'typescript', mts: 'typescript', cts: 'typescript', js: 'javascript', jsx: 'javascript', mjs: 'javascript', cjs: 'javascript',
  py: 'python', go: 'go', rs: 'rust', java: 'java', kt: 'kotlin', rb: 'ruby', php: 'php', cs: 'csharp', swift: 'swift', c: 'c', h: 'c', cpp: 'cpp',
  sh: 'shell', sql: 'sql', json: 'json', yaml: 'yaml', yml: 'yaml', toml: 'toml', md: 'markdown', html: 'html', css: 'css', scss: 'scss', vue: 'vue', svelte: 'svelte',
};

export function languageOf(path: string): string | null {
  const base = path.slice(path.lastIndexOf('/') + 1);
  const dot = base.lastIndexOf('.');
  return dot <= 0 ? null : EXTENSION_LANGUAGE[base.slice(dot + 1).toLowerCase()] ?? null;
}

const collapse = (s: string): string => s.replace(/\s+/g, ' ').trim();
const clip = (s: string, n = MAX_SIGNATURE): string => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

export function isTestPath(path: string): boolean {
  const p = path.toLowerCase();
  const base = p.slice(p.lastIndexOf('/') + 1);
  return /\.(?:test|spec)\.[cm]?[jt]sx?$/.test(base) || /(?:^|\/)__tests__\//.test(p) || /^test_.*\.py$/.test(base) || /_test\.py$/.test(base) || /_test\.go$/.test(base)
    || /(?:^|\/)tests?\/.+\.(?:py|[cm]?[jt]sx?)$/.test(p) || /(?:^|\/)e2e\/.+\.[cm]?[jt]sx?$/.test(p);
}

function lineStarts(src: string): number[] {
  const starts = [0];
  for (let i = 0; i < src.length; i++) if (src.charCodeAt(i) === 10) starts.push(i + 1);
  return starts;
}

function lineAt(starts: number[], index: number): number {
  let lo = 0; let hi = starts.length - 1;
  while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (starts[mid]! <= index) lo = mid; else hi = mid - 1; }
  return lo + 1;
}

// ------------------------------------------------------------------------------------------------------------ JS / TS scanner

interface Scanned { readonly intact: string; readonly blanked: string; readonly clean: boolean }

const REGEX_PREV = new Set(['(', ',', '=', ':', '[', '!', '&', '|', '?', '{', '}', ';', '+', '-', '*', '%', '<', '>', '~', '^']);
const REGEX_KEYWORDS = new Set(['return', 'typeof', 'case', 'do', 'else', 'in', 'of', 'delete', 'void', 'throw', 'yield', 'await', 'new']);

/**
 * Two same-length views of the source. `intact` has comments blanked. `blanked` also has string and template-literal TEXT blanked
 * (quotes kept), so structural searches cannot match code that lives inside a string, while a string's value can still be read from
 * `intact` at the same index. `clean` is false when a string, comment or template did not terminate.
 */
export function scanJsTs(src: string): Scanned {
  const n = src.length;
  const intact = src.split('');
  const blanked = src.split('');
  const blank = (arr: string[], from: number, to: number) => { for (let k = from; k < to; k++) if (arr[k] !== '\n') arr[k] = ' '; };
  let i = 0;
  let clean = true;
  let prevSig = '';
  let prevWord = '';
  // template nesting: each entry is the brace depth at which a `${` opened
  const templateStack: number[] = [];
  let braceDepth = 0;

  const scanTemplateText = (): void => {
    // positioned just after a backtick or just after the closing brace of a `${ }`
    const start = i;
    while (i < n) {
      const c = src[i]!;
      if (c === '\\') { i += 2; continue; }
      if (c === '`') { blank(blanked, start, i); i += 1; prevSig = '`'; return; }
      if (c === '$' && src[i + 1] === '{') { blank(blanked, start, i); i += 2; templateStack.push(braceDepth); braceDepth += 1; prevSig = '{'; return; }
      i += 1;
    }
    blank(blanked, start, n); clean = false;
  };

  while (i < n) {
    const c = src[i]!;
    const next = src[i + 1];
    if (c === '/' && next === '/') {
      let j = i; while (j < n && src[j] !== '\n') j++;
      blank(intact, i, j); blank(blanked, i, j); i = j; continue;
    }
    if (c === '/' && next === '*') {
      const close = src.indexOf('*/', i + 2);
      const end = close === -1 ? n : close + 2;
      if (close === -1) clean = false;
      blank(intact, i, end); blank(blanked, i, end); i = end; continue;
    }
    if (c === '"' || c === "'") {
      let j = i + 1;
      while (j < n && src[j] !== c && src[j] !== '\n') { if (src[j] === '\\') j++; j++; }
      if (j >= n || src[j] !== c) { clean = false; blank(blanked, i + 1, Math.min(j, n)); i = Math.min(j + 1, n); prevSig = c; continue; }
      blank(blanked, i + 1, j); i = j + 1; prevSig = c; prevWord = ''; continue;
    }
    if (c === '`') { i += 1; scanTemplateText(); prevWord = ''; continue; }
    if (c === '{') { braceDepth += 1; prevSig = c; i += 1; continue; }
    if (c === '}') {
      braceDepth -= 1; i += 1; prevSig = '}';
      if (templateStack.length && templateStack[templateStack.length - 1] === braceDepth) { templateStack.pop(); scanTemplateText(); }
      continue;
    }
    if (c === '/') {
      const regexAllowed = prevSig === '' || REGEX_PREV.has(prevSig) || (/[A-Za-z]/.test(prevSig) && REGEX_KEYWORDS.has(prevWord));
      if (regexAllowed) {
        let j = i + 1; let inClass = false;
        while (j < n && src[j] !== '\n') {
          const d = src[j]!;
          if (d === '\\') { j += 2; continue; }
          if (d === '[') inClass = true; else if (d === ']') inClass = false;
          else if (d === '/' && !inClass) break;
          j++;
        }
        if (j < n && src[j] === '/') { blank(blanked, i + 1, j); j += 1; while (j < n && /[a-z]/i.test(src[j]!)) j++; i = j; prevSig = '/'; prevWord = ''; continue; }
      }
      prevSig = '/'; i += 1; continue;
    }
    if (/[A-Za-z_$]/.test(c)) {
      let j = i; while (j < n && /[\w$]/.test(src[j]!)) j++;
      prevWord = src.slice(i, j); prevSig = src[j - 1]!; i = j; continue;
    }
    if (!/\s/.test(c)) { prevSig = c; prevWord = ''; }
    i += 1;
  }
  if (braceDepth !== 0 || templateStack.length) clean = false;
  return { intact: intact.join(''), blanked: blanked.join(''), clean };
}

const KEYWORDS_NOT_METHODS = new Set(['if', 'for', 'while', 'switch', 'catch', 'function', 'return', 'with', 'else', 'do', 'try', 'new', 'typeof', 'await', 'super', 'import', 'constructor_']);

/** Brace and paren depth before every character, from the blanked view. */
function depths(blanked: string): { brace: Int32Array; paren: Int32Array } {
  const brace = new Int32Array(blanked.length + 1);
  const paren = new Int32Array(blanked.length + 1);
  let b = 0; let p = 0;
  for (let i = 0; i < blanked.length; i++) {
    brace[i] = b; paren[i] = p;
    const c = blanked[i];
    if (c === '{') b++; else if (c === '}') b--; else if (c === '(') p++; else if (c === ')') p--;
  }
  brace[blanked.length] = b; paren[blanked.length] = p;
  return { brace, paren };
}

/** The text from `from` through the matching close of the first `(`, plus a return type up to the body, bounded. */
function signatureFrom(blanked: string, intact: string, from: number): string {
  const open = blanked.indexOf('(', from);
  if (open === -1 || open - from > 200) return '';
  let depth = 0; let i = open;
  for (; i < blanked.length; i++) { const c = blanked[i]; if (c === '(') depth++; else if (c === ')') { depth--; if (depth === 0) { i++; break; } } }
  let end = i;
  // optional return type: `: Type` up to `{`, `=>` or `;`
  const tail = blanked.slice(i, i + 200);
  const m = /^\s*(:[^{;=]*(?:=>[^{;]*)?)/.exec(tail);
  if (m) end = i + m[0].length;
  return clip(collapse(intact.slice(open, end)));
}

function pushUnique(list: SymbolInfo[], s: SymbolInfo): void {
  if (list.length >= MAX_SYMBOLS) return;
  if (!list.some((x) => x.name === s.name && x.kind === s.kind && x.parent === s.parent && x.line === s.line)) list.push(s);
}

export function analyzeJsTs(path: string, src: string): FileAnalysis {
  const { intact, blanked, clean } = scanJsTs(src);
  const starts = lineStarts(src);
  const { brace, paren } = depths(blanked);
  const symbols: SymbolInfo[] = [];
  const imports: RawImport[] = [];
  const exportsSet = new Set<string>();
  const lang = languageOf(path);
  const at = (idx: number) => ({ b: brace[idx] ?? 0, p: paren[idx] ?? 0 });
  const top = (idx: number) => { const d = at(idx); return d.b === 0 && d.p === 0; };

  // ---- declarations at the top level
  const decl = /(^|[;\n}])\s*(export\s+default\s+|export\s+)?(declare\s+)?(abstract\s+)?(?:(async\s+)?function\s*\*?\s*([A-Za-z_$][\w$]*)|class\s+([A-Za-z_$][\w$]*)|(interface|type|enum)\s+([A-Za-z_$][\w$]*)|(const|let|var)\s+([A-Za-z_$][\w$]*))/g;
  for (const m of blanked.matchAll(decl)) {
    const nameIdx = m.index! + m[0].lastIndexOf(m[6] ?? m[7] ?? m[9] ?? m[11] ?? '');
    if (!top(nameIdx)) continue;
    const exported = Boolean(m[2]);
    if (m[2] && /default/.test(m[2])) exportsSet.add('default');
    const line = lineAt(starts, nameIdx);
    if (m[6]) { pushUnique(symbols, { name: m[6], kind: 'function', line, signature: signatureFrom(blanked, intact, nameIdx), exported }); if (exported) exportsSet.add(m[6]); }
    else if (m[7]) { pushUnique(symbols, { name: m[7], kind: 'class', line, exported }); if (exported) exportsSet.add(m[7]); }
    else if (m[9]) { pushUnique(symbols, { name: m[9], kind: m[8] === 'interface' ? 'interface' : m[8] === 'enum' ? 'enum' : 'type', line, exported }); if (exported) exportsSet.add(m[9]); }
    else if (m[11]) {
      const afterName = blanked.slice(nameIdx + m[11].length, nameIdx + m[11].length + 400);
      const fnLike = /^\s*(?::[^=]*)?=\s*(?:async\s*)?(?:function\b|\([^)]*\)\s*(?::[^=]*)?=>|[A-Za-z_$][\w$]*\s*=>|<[^>]*>\s*\()/.test(afterName);
      if (fnLike) pushUnique(symbols, { name: m[11], kind: 'function', line, signature: signatureFrom(blanked, intact, nameIdx), exported });
      else if (exported || /^[A-Z][A-Z0-9_]+$/.test(m[11])) pushUnique(symbols, { name: m[11], kind: 'const', line, exported });
      if (exported) exportsSet.add(m[11]);
    }
  }

  // ---- class members (depth 1 inside a class body)
  for (const cls of symbols.filter((s) => s.kind === 'class')) {
    const classIdx = starts[cls.line - 1]!;
    const open = blanked.indexOf('{', classIdx);
    if (open === -1) continue;
    const bodyDepth = (brace[open] ?? 0) + 1;
    let close = open + 1;
    while (close < blanked.length && (brace[close] ?? 0) >= bodyDepth) close++;
    const body = blanked.slice(open + 1, close);
    const member = /(^|[;\n}])\s*(?:(?:public|private|protected|static|async|override|readonly|abstract|get|set)\s+)*\*?\s*([A-Za-z_$][\w$]*)\s*(?:<[^>]*>\s*)?\(/g;
    for (const mm of body.matchAll(member)) {
      const name = mm[2]!;
      const idx = open + 1 + mm.index! + mm[0].lastIndexOf(name);
      if ((brace[idx] ?? 0) !== bodyDepth || (paren[idx] ?? 0) !== 0 || KEYWORDS_NOT_METHODS.has(name)) continue;
      pushUnique(symbols, { name, kind: 'method', line: lineAt(starts, idx), signature: signatureFrom(blanked, intact, idx), exported: cls.exported, parent: cls.name });
    }
  }

  // ---- imports and exports (specifier text is read from the intact view at the quote found in the blanked view)
  const spec = (quoteIdx: number): string | null => {
    const q = intact[quoteIdx]; if (q !== '"' && q !== "'" && q !== '`') return null;
    const end = intact.indexOf(q, quoteIdx + 1);
    return end === -1 ? null : intact.slice(quoteIdx + 1, end);
  };
  const addImport = (s: string | null, kind: ImportKind, names?: string[]) => {
    if (!s || imports.length >= MAX_IMPORTS) return;
    const found = imports.find((x) => x.specifier === s && x.kind === kind);
    if (found) { if (names?.length) (found as { names?: string[] }).names = [...new Set([...(found.names ?? []), ...names])]; return; }
    imports.push({ specifier: s, kind, ...(names?.length ? { names } : {}) });
  };
  const clauseNames = (clause: string): string[] => {
    const out: string[] = []; const c = clause.trim();
    const brace = /\{([^}]*)\}/.exec(c);
    if (brace) for (const part of brace[1]!.split(',')) { const n = part.trim().replace(/^type\s+/, '').split(/\s+as\s+/)[0]?.trim(); if (n) out.push(n); }
    if (/\*\s*as\s+[\w$]+/.test(c)) out.push('*');
    const head = c.replace(/\{[^}]*\}/, '').replace(/\*\s*as\s+[\w$]+/, '').replace(/,/g, ' ').trim();
    if (/^[A-Za-z_$][\w$]*$/.test(head)) out.push('default');
    return out;
  };

  for (const m of blanked.matchAll(/(^|[;\n}])\s*import\s+(type\s+)?(?:([\w$*{}\s,]+?)\s*from\s*)?(["'`])/g)) {
    const qi = m.index! + m[0].length - 1;
    if (top(qi)) addImport(spec(qi), m[2] ? 'type' : 'static', m[3] ? clauseNames(m[3]) : undefined);
  }
  for (const m of blanked.matchAll(/(^|[;\n}])\s*export\s+(type\s+)?(\*(?:\s+as\s+[\w$]+)?|\{[^}]*\})\s*from\s*(["'`])/g)) {
    const qi = m.index! + m[0].length - 1;
    if (top(qi)) {
      const star = m[3]!.startsWith('*');
      addImport(spec(qi), 'reexport', star ? ['*'] : clauseNames(m[3]!));
      if (star) exportsSet.add('*');
      else for (const part of m[3]!.slice(1, -1).split(',')) { const nm = part.trim().split(/\s+as\s+/).pop()?.trim(); if (nm) exportsSet.add(nm); }
    }
  }
  for (const m of blanked.matchAll(/(^|[;\n}])\s*export\s*\{([^}]*)\}\s*(?!from)/g)) {
    if (!top(m.index! + m[0].length - 1)) continue;
    for (const part of m[2]!.split(',')) { const nm = part.trim().split(/\s+as\s+/).pop()?.trim(); if (nm) exportsSet.add(nm); }
  }
  for (const m of blanked.matchAll(/\brequire\s*\(\s*(["'`])/g)) addImport(spec(m.index! + m[0].length - 1), 'require');
  for (const m of blanked.matchAll(/\bimport\s*\(\s*(["'`])/g)) addImport(spec(m.index! + m[0].length - 1), 'dynamic');
  for (const m of blanked.matchAll(/(^|[;\n}])\s*export\s+default\s+([A-Za-z_$][\w$]*)\s*(?:;|\n|$)/g)) exportsSet.add('default');
  for (const m of blanked.matchAll(/\bmodule\.exports\s*=\s*\{([^}]*)\}/g)) for (const part of m[1]!.split(',')) { const nm = part.trim().split(/\s*[:(]/)[0]?.trim(); if (nm && /^[A-Za-z_$][\w$]*$/.test(nm)) exportsSet.add(nm); }
  for (const m of blanked.matchAll(/\b(?:module\.)?exports\.([A-Za-z_$][\w$]*)\s*=/g)) exportsSet.add(m[1]!);

  // ---- tests: titles of it()/test()/describe() calls
  const testNames: string[] = [];
  const isTest = isTestPath(path);
  if (isTest || /\b(?:describe|it|test)\s*\(/.test(blanked.slice(0, 2000))) {
    for (const m of blanked.matchAll(/\b(describe|it|test)(?:\.(?:only|skip|each))?\s*\(\s*(["'`])/g)) {
      if (testNames.length >= MAX_TEST_NAMES) break;
      const t = spec(m.index! + m[0].length - 1); if (t) testNames.push(clip(t, 120));
    }
  }

  return { language: lang, parse: 'structural', malformed: !clean, symbols, imports, exports: [...exportsSet].sort().slice(0, MAX_SYMBOLS), isTest, testNames };
}

// ------------------------------------------------------------------------------------------------------------------ Python

function maskPython(src: string): { intact: string; code: string; clean: boolean } {
  // blank comments and string/docstring text so a `def` inside a docstring is not a declaration
  const out = src.split(''); const code = src.split('');
  const n = src.length; let i = 0; let clean = true;
  const blank = (arr: string[], a: number, b: number) => { for (let k = a; k < b; k++) if (arr[k] !== '\n') arr[k] = ' '; };
  while (i < n) {
    const c = src[i]!;
    if (c === '#') { let j = i; while (j < n && src[j] !== '\n') j++; blank(out, i, j); blank(code, i, j); i = j; continue; }
    if (c === '"' || c === "'") {
      const triple = src.startsWith(c.repeat(3), i);
      const q = triple ? c.repeat(3) : c;
      let j = i + q.length;
      while (j < n) {
        if (src[j] === '\\') { j += 2; continue; }
        if (src.startsWith(q, j)) break;
        if (!triple && src[j] === '\n') break;
        j++;
      }
      if (j >= n || !src.startsWith(q, j)) { clean = false; blank(code, i + q.length, Math.min(j, n)); i = Math.min(j, n); continue; }
      blank(code, i + q.length, j); i = j + q.length; continue;
    }
    i++;
  }
  return { intact: out.join(''), code: code.join(''), clean };
}

export function analyzePython(path: string, src: string): FileAnalysis {
  const { intact, code, clean } = maskPython(src);
  const lines = code.split('\n'); const raw = intact.split('\n');
  const symbols: SymbolInfo[] = []; const imports: RawImport[] = []; const exportsSet = new Set<string>(); const testNames: string[] = [];
  const classStack: Array<{ indent: number; name: string }> = [];
  let decorators: string[] = [];
  let joined = '';
  for (let li = 0; li < lines.length; li++) {
    const line = lines[li]!;
    if (!line.trim()) continue;
    const indent = line.length - line.trimStart().length;
    while (classStack.length && indent <= classStack[classStack.length - 1]!.indent) classStack.pop();
    const text = line.trim();
    if (text.startsWith('@')) { decorators.push(clip(collapse(raw[li]!.trim()), 120)); if (decorators.length > 4) decorators.shift(); continue; }
    const def = /^(async\s+)?def\s+([A-Za-z_]\w*)\s*\(/.exec(text);
    const cls = /^class\s+([A-Za-z_]\w*)/.exec(text);
    if (def || cls) {
      const name = (def ? def[2] : cls![1])!;
      const parent = classStack.length ? classStack[classStack.length - 1]!.name : undefined;
      // signature: join continuation lines until the parameter list closes
      let sig = ''; let k = li; let depth = 0; let started = false; joined = '';
      if (def) {
        while (k < lines.length && k < li + 12) {
          joined += `${lines[k] === lines[li] ? raw[k]!.trim() : raw[k]!.trim()} `;
          for (const ch of lines[k]!) { if (ch === '(') { depth++; started = true; } else if (ch === ')') depth--; }
          if (started && depth <= 0) break; k++;
        }
        const s = /\(.*\)(?:\s*->\s*[^:]+)?/.exec(collapse(joined)); sig = s ? clip(s[0]) : '';
      }
      symbols.push({ name, kind: cls ? 'class' : parent ? 'method' : 'function', line: li + 1, ...(sig ? { signature: sig } : {}), exported: !name.startsWith('_'), ...(parent ? { parent } : {}), ...(decorators.length ? { annotations: [...decorators] } : {}) });
      if (!parent && !name.startsWith('_')) exportsSet.add(name);
      if (def && /^test_/.test(name) && testNames.length < MAX_TEST_NAMES) testNames.push(name);
      if (cls) classStack.push({ indent, name });
      decorators = [];
      continue;
    }
    decorators = [];
    if (indent === 0) {
      const imp = /^import\s+(.+)$/.exec(text);
      if (imp) for (const part of imp[1]!.split(',')) { const mod = part.trim().split(/\s+as\s+/)[0]!.trim(); if (/^[\w.]+$/.test(mod)) imports.push({ specifier: mod, kind: 'static' }); }
      const from = /^from\s+(\.*[\w.]*)\s+import\s+(.+)$/.exec(text);
      if (from) {
        imports.push({ specifier: from[1]!, kind: 'static' });
        // `from pkg import submodule` may name a module: record the pair so the resolver can try pkg/submodule
        let names = from[2]!;
        if (names.startsWith('(') && !names.includes(')')) { let k = li + 1; while (k < lines.length && !lines[k]!.includes(')')) { names += ` ${lines[k]!.trim()}`; k++; } if (k < lines.length) names += ` ${lines[k]!.trim()}`; }
        for (const nm of names.replace(/[()]/g, '').split(',')) { const id = nm.trim().split(/\s+as\s+/)[0]!.trim(); if (/^\w+$/.test(id) && id !== '*') imports.push({ specifier: `${from[1]!.endsWith('.') ? from[1] : `${from[1]}.`}${id}`, kind: 'static' }); }
      }
      const all = /^__all__\s*=\s*[\[(]([^\])]*)/.exec(raw[li]!.trim());
      if (all) for (const m of all[1]!.matchAll(/['"]([^'"]+)['"]/g)) exportsSet.add(m[1]!);
    }
  }
  const dedup = [...new Map(imports.map((i) => [i.specifier, i])).values()].slice(0, MAX_IMPORTS);
  return { language: 'python', parse: 'structural', malformed: !clean, symbols: symbols.slice(0, MAX_SYMBOLS), imports: dedup, exports: [...exportsSet].sort().slice(0, MAX_SYMBOLS), isTest: isTestPath(path) || testNames.length > 0, testNames };
}

// --------------------------------------------------------------------------------------------------------------------- Go

function maskGo(src: string): { intact: string; code: string; clean: boolean } {
  const intact = src.split(''); const code = src.split('');
  const n = src.length; let i = 0; let clean = true;
  const blank = (arr: string[], a: number, b: number) => { for (let k = a; k < b; k++) if (arr[k] !== '\n') arr[k] = ' '; };
  while (i < n) {
    const c = src[i]!; const d = src[i + 1];
    if (c === '/' && d === '/') { let j = i; while (j < n && src[j] !== '\n') j++; blank(intact, i, j); blank(code, i, j); i = j; continue; }
    if (c === '/' && d === '*') { const e = src.indexOf('*/', i + 2); const end = e === -1 ? n : e + 2; if (e === -1) clean = false; blank(intact, i, end); blank(code, i, end); i = end; continue; }
    if (c === '"') { let j = i + 1; while (j < n && src[j] !== '"' && src[j] !== '\n') { if (src[j] === '\\') j++; j++; } if (src[j] !== '"') clean = false; blank(code, i + 1, Math.min(j, n)); i = Math.min(j + 1, n); continue; }
    if (c === '`') { const e = src.indexOf('`', i + 1); const end = e === -1 ? n : e; if (e === -1) clean = false; blank(code, i + 1, end); i = Math.min(end + 1, n); continue; }
    if (c === "'") { let j = i + 1; while (j < n && src[j] !== "'" && src[j] !== '\n') { if (src[j] === '\\') j++; j++; } blank(code, i + 1, Math.min(j, n)); i = Math.min(j + 1, n); continue; }
    i++;
  }
  return { intact: intact.join(''), code: code.join(''), clean };
}

export function analyzeGo(path: string, src: string): FileAnalysis {
  const { intact, code, clean } = maskGo(src);
  const starts = lineStarts(src);
  const symbols: SymbolInfo[] = []; const imports: RawImport[] = []; const exportsSet = new Set<string>(); const testNames: string[] = [];
  const isTest = /_test\.go$/.test(path);
  // top level only: depth of braces/parens before each match
  const { brace, paren } = depths(code);
  const topAt = (idx: number) => (brace[idx] ?? 0) === 0 && (paren[idx] ?? 0) === 0;
  for (const m of code.matchAll(/(^|\n)func\s+(?:\(\s*(?:[\w]+\s+)?\*?\s*([A-Za-z_]\w*)(?:\[[^\]]*\])?\s*\)\s*)?([A-Za-z_]\w*)\s*(?:\[[^\]]*\]\s*)?\(/g)) {
    const nameIdx = m.index! + m[0].lastIndexOf(m[3]!);
    if (!topAt(m.index! + m[1]!.length)) continue;
    const name = m[3]!; const exported = /^[A-Z]/.test(name);
    // signature to the end of the result list (before the body brace)
    const open = code.indexOf('(', nameIdx);
    let d = 0; let k = open; for (; k < code.length; k++) { if (code[k] === '(') d++; else if (code[k] === ')') { d--; if (d === 0) { k++; break; } } }
    const rest = /^[^{\n]*/.exec(code.slice(k))?.[0] ?? '';
    symbols.push({ name, kind: m[2] ? 'method' : 'function', line: lineAt(starts, nameIdx), signature: clip(collapse(intact.slice(open, k) + rest)), exported, ...(m[2] ? { parent: m[2] } : {}) });
    if (exported && !m[2]) exportsSet.add(name);
    if (isTest && /^Test|^Benchmark|^Example/.test(name) && !m[2] && testNames.length < MAX_TEST_NAMES) testNames.push(name);
  }
  for (const m of code.matchAll(/(^|\n)type\s+([A-Za-z_]\w*)\s+(struct|interface)?/g)) {
    if (!topAt(m.index! + m[1]!.length)) continue;
    symbols.push({ name: m[2]!, kind: m[3] === 'interface' ? 'interface' : m[3] === 'struct' ? 'struct' : 'type', line: lineAt(starts, m.index! + m[0].lastIndexOf(m[2]!)), exported: /^[A-Z]/.test(m[2]!) });
    if (/^[A-Z]/.test(m[2]!)) exportsSet.add(m[2]!);
  }
  const pkg = /(^|\n)package\s+(\w+)/.exec(code);
  if (pkg) symbols.unshift({ name: pkg[2]!, kind: 'module', line: lineAt(starts, pkg.index! + pkg[1]!.length), exported: true });
  for (const m of code.matchAll(/(^|\n)import\s*\(([^)]*)\)/g)) for (const q of intact.slice(m.index! + m[0].indexOf('(') + 1, m.index! + m[0].length).matchAll(/"([^"]+)"/g)) imports.push({ specifier: q[1]!, kind: 'static' });
  for (const m of code.matchAll(/(^|\n)import\s+(?:[\w.]+\s+)?"/g)) { const at = m.index! + m[0].length - 1; const e = intact.indexOf('"', at + 1); if (e !== -1) imports.push({ specifier: intact.slice(at + 1, e), kind: 'static' }); }
  const dedup = [...new Map(imports.map((i) => [i.specifier, i])).values()].slice(0, MAX_IMPORTS);
  return { language: 'go', parse: 'structural', malformed: !clean, symbols: symbols.slice(0, MAX_SYMBOLS), imports: dedup, exports: [...exportsSet].sort(), isTest, testNames };
}

// ------------------------------------------------------------------------------------------------------------------ dispatch

/**
 * HTTP route registrations (`router.get('/orders/:id', ...)`, `@app.post("/orders")`, `http.HandleFunc("/x", ...)`) as `route` symbols, so a
 * request that names an endpoint can be matched to the code that serves it. Read from the comment-blanked source, so a route in a
 * comment is never reported.
 */
function routeSymbols(intact: string): SymbolInfo[] {
  const out: SymbolInfo[] = []; const starts = lineStarts(intact);
  for (const m of intact.matchAll(/\.(get|post|put|patch|delete|head|options|all|route|HandleFunc|Handle|GET|POST|PUT|PATCH|DELETE)\s*\(\s*(["'`])(\/[^"'`\s]*)\2/g)) {
    if (out.length >= 80) break;
    const verb = m[1]!.toUpperCase();
    out.push({ name: `${verb === 'ROUTE' || verb.startsWith('HANDLE') ? 'ANY' : verb} ${m[3]}`, kind: 'route', line: lineAt(starts, m.index!), exported: false });
  }
  return out;
}

/** Analyses one file. Never throws: a failure yields no symbols, because a missing symbol is safe and an invented one is not. */
export function analyzeFile(path: string, content: string): FileAnalysis {
  const language = languageOf(path);
  try {
    if (language === 'typescript' || language === 'javascript') { const a = analyzeJsTs(path, content); return { ...a, symbols: [...a.symbols, ...routeSymbols(scanJsTs(content).intact)].slice(0, MAX_SYMBOLS) }; }
    if (language === 'python') { const a = analyzePython(path, content); return { ...a, symbols: [...a.symbols, ...routeSymbols(maskPython(content).intact)].slice(0, MAX_SYMBOLS) }; }
    if (language === 'go') { const a = analyzeGo(path, content); return { ...a, symbols: [...a.symbols, ...routeSymbols(maskGo(content).intact)].slice(0, MAX_SYMBOLS) }; }
    if (language && !['json', 'yaml', 'toml', 'markdown', 'html', 'css', 'scss', 'sql', 'shell'].includes(language)) {
      const symbols: SymbolInfo[] = lexicalSymbols(path, content).slice(0, MAX_SYMBOLS).map((name) => ({ name, kind: 'function' as const, line: 0, exported: false }));
      const imports: RawImport[] = lexicalImports(path, content).map((specifier) => ({ specifier, kind: 'static' as const }));
      return { language, parse: 'lexical', malformed: false, symbols, imports, exports: [], isTest: isTestPath(path), testNames: [] };
    }
    return { ...EMPTY_ANALYSIS, language, isTest: isTestPath(path) };
  } catch {
    return { ...EMPTY_ANALYSIS, language, malformed: true };
  }
}
