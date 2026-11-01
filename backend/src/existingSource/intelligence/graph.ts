/**
 * Import resolution, reverse dependencies and test relationships, computed in memory from the per-file analyses.
 *
 * Nothing here is persisted: resolution depends on the whole file set, so it is recomputed (cheaply) whenever the map is loaded or an
 * overlay changes, and can never disagree with the files it describes. An import that cannot be resolved to a file in this repository
 * is recorded as external (or unresolved), never as an invented edge.
 */
import type { ImportKind, IndexedCodeFile, PackageInfo } from './types.js';

export interface ResolvedEdge { readonly specifier: string; readonly kind: ImportKind; readonly names?: readonly string[]; readonly to: string | null; readonly external: boolean }

export interface CodeGraph {
  /** file -> files it imports */
  readonly dependsOn: ReadonlyMap<string, readonly string[]>;
  /** file -> files that import it */
  readonly dependedOnBy: ReadonlyMap<string, readonly string[]>;
  readonly edges: ReadonlyMap<string, readonly ResolvedEdge[]>;
  /** test file -> the source files it exercises (imports, then same-name convention) */
  readonly testTargets: ReadonlyMap<string, readonly string[]>;
  /** source file -> test files that exercise it */
  readonly testsFor: ReadonlyMap<string, readonly string[]>;
  readonly unresolvedCount: number;
}

const JS_EXT = ['.ts', '.tsx', '.mts', '.cts', '.js', '.jsx', '.mjs', '.cjs'];
const dirOf = (p: string) => (p.includes('/') ? p.slice(0, p.lastIndexOf('/')) : '');

function normalize(path: string): string {
  const out: string[] = [];
  for (const seg of path.split('/')) {
    if (!seg || seg === '.') continue;
    if (seg === '..') { if (out.length) out.pop(); continue; }
    out.push(seg);
  }
  return out.join('/');
}
const join = (...parts: string[]) => normalize(parts.filter(Boolean).join('/'));

function packageFor(path: string, packages: readonly PackageInfo[], kind: PackageInfo['kind']): PackageInfo | null {
  let best: PackageInfo | null = null;
  for (const p of packages) {
    if (p.kind !== kind) continue;
    if (p.root === '' || path === p.root || path.startsWith(`${p.root}/`)) if (!best || p.root.length > best.root.length) best = p;
  }
  return best;
}

export function buildGraph(files: readonly IndexedCodeFile[], packages: readonly PackageInfo[]): CodeGraph {
  const paths = new Set(files.map((f) => f.path));
  const byDir = new Map<string, string[]>();
  for (const f of files) { const d = dirOf(f.path); (byDir.get(d) ?? byDir.set(d, []).get(d)!).push(f.path); }
  const nodePackagesByName = new Map<string, PackageInfo>();
  for (const p of packages) if (p.kind === 'node' && p.name) nodePackagesByName.set(p.name, p);

  const tryJs = (base: string): string | null => {
    if (paths.has(base) && JS_EXT.some((e) => base.endsWith(e))) return base;
    // `./x.js` written in ESM TypeScript maps to x.ts / x.tsx
    const stripped = base.replace(/\.(?:[cm]?js|jsx)$/, '');
    for (const e of JS_EXT) if (paths.has(stripped + e)) return stripped + e;
    for (const e of JS_EXT) if (paths.has(`${base}${e}`)) return `${base}${e}`;
    for (const e of JS_EXT) if (paths.has(`${base}/index${e}`)) return `${base}/index${e}`;
    return null;
  };

  const resolveJs = (from: string, spec: string): { to: string | null; external: boolean } => {
    if (spec.startsWith('.')) return { to: tryJs(join(dirOf(from), spec)), external: false };
    const pkg = packageFor(from, packages, 'node');
    // tsconfig-style aliases declared beside the nearest node package
    for (const [alias, targets] of Object.entries(pkg?.aliases ?? {})) {
      const star = alias.endsWith('*');
      const prefix = star ? alias.slice(0, -1) : alias;
      if (star ? spec.startsWith(prefix) : spec === alias) {
        const rest = star ? spec.slice(prefix.length) : '';
        for (const t of targets) { const hit = tryJs(join(pkg!.root, star ? t.replace('*', rest) : t)); if (hit) return { to: hit, external: false }; }
      }
    }
    // workspace packages by name (and name/subpath)
    for (const [name, p] of nodePackagesByName) {
      if (spec === name || spec.startsWith(`${name}/`)) {
        const sub = spec === name ? '' : spec.slice(name.length + 1);
        const candidates = sub ? [join(p.root, sub), join(p.root, 'src', sub)] : [join(p.root, 'src/index'), join(p.root, 'index'), join(p.root, 'src/main'), join(p.root, 'main')];
        for (const c of candidates) { const hit = tryJs(c); if (hit) return { to: hit, external: false }; }
        return { to: null, external: false };
      }
    }
    return { to: null, external: true };
  };

  const resolvePy = (from: string, spec: string): { to: string | null; external: boolean } => {
    const roots = ['', 'src', ...packages.filter((p) => p.kind === 'python').flatMap((p) => [p.root, join(p.root, 'src')])];
    const tryModule = (baseDir: string, dotted: string): string | null => {
      const rel = dotted.replace(/\./g, '/');
      for (const c of [join(baseDir, `${rel}.py`), join(baseDir, rel, '__init__.py')]) if (paths.has(c)) return c;
      return null;
    };
    if (spec.startsWith('.')) {
      const dots = /^\.+/.exec(spec)![0].length;
      let dir = dirOf(from); for (let i = 1; i < dots; i++) dir = dirOf(dir);
      const rest = spec.slice(dots);
      if (!rest) return { to: paths.has(join(dir, '__init__.py')) ? join(dir, '__init__.py') : null, external: false };
      return { to: tryModule(dir, rest), external: false };
    }
    for (const r of new Set(roots)) { const hit = tryModule(r, spec); if (hit) return { to: hit, external: false }; }
    return { to: null, external: true };
  };

  const goTargets = (from: string, spec: string): string[] => {
    const mod = packageFor(from, packages, 'go');
    if (!mod?.modulePath || !(spec === mod.modulePath || spec.startsWith(`${mod.modulePath}/`))) return [];
    const dir = join(mod.root, spec.slice(mod.modulePath.length));
    return (byDir.get(dir) ?? []).filter((p) => p.endsWith('.go') && !p.endsWith('_test.go')).sort().slice(0, 50);
  };

  const edges = new Map<string, ResolvedEdge[]>();
  const dependsOn = new Map<string, string[]>();
  let unresolved = 0;
  for (const f of files) {
    const out: ResolvedEdge[] = []; const deps = new Set<string>();
    const lang = f.analysis.language;
    for (const imp of f.analysis.imports) {
      if (lang === 'typescript' || lang === 'javascript') {
        const r = resolveJs(f.path, imp.specifier); out.push({ specifier: imp.specifier, kind: imp.kind, ...(imp.names ? { names: imp.names } : {}), ...r });
        if (r.to && r.to !== f.path) deps.add(r.to); else if (!r.to && !r.external) unresolved++;
      } else if (lang === 'python') {
        const r = resolvePy(f.path, imp.specifier);
        // `from pkg import name` is recorded as both `pkg` and `pkg.name`; when `pkg.name` is not a module the `pkg` import carries the edge
        if (r.to === null && /\.[A-Za-z_]\w*$/.test(imp.specifier) && !imp.specifier.startsWith('.')) continue;
        out.push({ specifier: imp.specifier, kind: imp.kind, ...r });
        if (r.to && r.to !== f.path) deps.add(r.to); else if (!r.to && !r.external) unresolved++;
      } else if (lang === 'go') {
        const to = goTargets(f.path, imp.specifier);
        out.push({ specifier: imp.specifier, kind: imp.kind, to: to[0] ?? null, external: to.length === 0 });
        for (const t of to) if (t !== f.path) deps.add(t);
      }
    }
    edges.set(f.path, out); dependsOn.set(f.path, [...deps].sort());
  }

  const dependedOnBy = new Map<string, string[]>();
  for (const [from, tos] of dependsOn) for (const to of tos) (dependedOnBy.get(to) ?? dependedOnBy.set(to, []).get(to)!).push(from);
  for (const list of dependedOnBy.values()) list.sort();

  // tests: what they import (non-test sources), plus same-name conventions beside them
  const isTest = new Map(files.map((f) => [f.path, f.analysis.isTest]));
  const testTargets = new Map<string, string[]>();
  const testsFor = new Map<string, string[]>();
  const link = (test: string, src: string) => {
    if (test === src || isTest.get(src)) return;
    const t = testTargets.get(test) ?? testTargets.set(test, []).get(test)!; if (!t.includes(src)) t.push(src);
    const s = testsFor.get(src) ?? testsFor.set(src, []).get(src)!; if (!s.includes(test)) s.push(test);
  };
  for (const f of files) {
    if (!f.analysis.isTest) continue;
    for (const dep of dependsOn.get(f.path) ?? []) link(f.path, dep);
    const base = f.path.slice(f.path.lastIndexOf('/') + 1);
    const stem = base.replace(/\.(?:test|spec)\.[cm]?[jt]sx?$/, '').replace(/^test_/, '').replace(/_test\.(?:py|go)$/, '').replace(/\.[^.]+$/, '');
    for (const sib of [...(byDir.get(dirOf(f.path)) ?? []), ...(byDir.get(dirOf(dirOf(f.path))) ?? [])]) {
      const sb = sib.slice(sib.lastIndexOf('/') + 1).replace(/\.[^.]+$/, '');
      if (!isTest.get(sib) && sb === stem) link(f.path, sib);
    }
  }
  for (const list of testTargets.values()) list.sort();
  for (const list of testsFor.values()) list.sort();
  return { dependsOn, dependedOnBy, edges, testTargets, testsFor, unresolvedCount: unresolved };
}

/** Everything reachable by following dependents from `start`, breadth first, bounded: "who is affected if this changes". */
export function affectedBy(graph: CodeGraph, start: readonly string[], limit = 200): string[] {
  const seen = new Set(start); const queue = [...start]; const out: string[] = [];
  while (queue.length && out.length < limit) {
    const cur = queue.shift()!;
    for (const next of graph.dependedOnBy.get(cur) ?? []) if (!seen.has(next)) { seen.add(next); out.push(next); queue.push(next); }
  }
  return out;
}

export interface ConsumerInfo { readonly path: string; /** The barrel the usage goes through, or null for a direct import. */ readonly via: string | null }

/**
 * Who uses `target`: files that import it directly AND files that reach it through re-exporting barrels (an `index.ts` that
 * `export { x } from './x'`), following only the names the target actually exports. A barrel is reported separately because editing a
 * pass-through is rarely needed; the code behind it is the real consumer.
 */
export function consumersOf(graph: CodeGraph, files: ReadonlyMap<string, IndexedCodeFile>, target: string, maxDepth = 3): { consumers: ConsumerInfo[]; reexporters: string[] } {
  const consumers = new Map<string, ConsumerInfo>();
  const reexporters = new Set<string>();
  const exported = (path: string): Set<string> | null => {
    const a = files.get(path)?.analysis;
    if (!a || (a.language !== 'typescript' && a.language !== 'javascript')) return null; // names are only tracked for JS/TS
    return new Set([...a.exports, ...a.symbols.filter((s) => s.exported).map((s) => s.name)]);
  };
  const queue: Array<{ file: string; names: Set<string> | null; depth: number; via: string | null }> = [{ file: target, names: exported(target), depth: 0, via: null }];
  const visited = new Set<string>([target]);
  while (queue.length) {
    const cur = queue.shift()!;
    for (const d of graph.dependedOnBy.get(cur.file) ?? []) {
      for (const e of (graph.edges.get(d) ?? []).filter((x) => x.to === cur.file)) {
        const used = !cur.names || !e.names || e.names.length === 0 || e.names.includes('*') || e.names.some((n) => cur.names!.has(n));
        if (!used) continue;
        if (e.kind === 'reexport') {
          reexporters.add(d);
          if (cur.depth + 1 < maxDepth && !visited.has(d)) { visited.add(d); queue.push({ file: d, names: cur.names, depth: cur.depth + 1, via: cur.via ?? d }); }
        } else if (!consumers.has(d)) consumers.set(d, { path: d, via: cur.file === target ? null : cur.file });
      }
    }
  }
  return { consumers: [...consumers.values()].sort((a, b) => (a.path < b.path ? -1 : 1)), reexporters: [...reexporters].sort() };
}

/**
 * What `source` calls: the files it imports directly, and the files behind a re-exporting barrel for the names it actually imports.
 * (`import { createShipmentLabel } from '@acme/shipping'` reaches `label/createShipmentLabel.ts`, not just the package's index.)
 */
export function calleesOf(graph: CodeGraph, source: string, maxDepth = 3): string[] {
  const out = new Set<string>();
  const queue: Array<{ file: string; names: ReadonlySet<string> | null; depth: number }> = [];
  for (const e of graph.edges.get(source) ?? []) {
    if (!e.to) continue;
    out.add(e.to);
    queue.push({ file: e.to, names: e.names && e.names.length && !e.names.includes('*') ? new Set(e.names) : null, depth: 1 });
  }
  const visited = new Set<string>();
  while (queue.length) {
    const cur = queue.shift()!;
    if (visited.has(cur.file) || cur.depth >= maxDepth) continue;
    visited.add(cur.file);
    for (const e of (graph.edges.get(cur.file) ?? []).filter((x) => x.kind === 'reexport' && x.to)) {
      if (cur.names && e.names && !e.names.includes('*') && !e.names.some((n) => cur.names!.has(n))) continue;
      out.add(e.to!);
      queue.push({ file: e.to!, names: cur.names, depth: cur.depth + 1 });
    }
  }
  return [...out].sort();
}
