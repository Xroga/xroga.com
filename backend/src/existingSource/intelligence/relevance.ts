/**
 * From a plain-language request to the few files that matter, and the compact "project passport" a model is given instead of the
 * repository.
 *
 * No single signal decides. A file is scored from: explicit paths and stack-trace frames in the request, the words of its file name,
 * its symbol names, signatures and route registrations, then its position in the import graph (the code that CALLS a hit, the code a
 * hit depends on) and the tests that exercise it. Everything returned carries the reasons it was chosen, and the confidence is low,
 * and says so, when nothing stands out: a wrong confident target is worse than an honest "I am not sure which".
 */
import { affectedBy, buildGraph, calleesOf, consumersOf, type CodeGraph } from './graph.js';
import type { CodeIndexView } from './codeIndex.js';
import type { IndexedCodeFile, PackageInfo, SymbolInfo } from './types.js';

/** Words that say nothing about WHERE code lives: request filler and structural words that name a layer, not a subject. */
const STOP = new Set(['the', 'and', 'for', 'with', 'that', 'this', 'from', 'into', 'when', 'then', 'than', 'have', 'has', 'not', 'but', 'are', 'was', 'were', 'can', 'will', 'should', 'would', 'could', 'make', 'fix', 'add', 'update', 'change', 'remove', 'only', 'also', 'any', 'all', 'each', 'its', 'our', 'your', 'their', 'there', 'here', 'what', 'which', 'who', 'how', 'why', 'does', 'did', 'done', 'use', 'using', 'keep', 'without', 'please', 'new', 'old', 'now', 'just', 'like', 'want', 'need', 'code', 'file', 'files', 'function', 'method', 'class', 'test', 'tests', 'bug', 'issue', 'feature', 'work', 'works', 'working', 'broken', 'error', 'errors', 'wrong', 'right', 'case', 'some', 'more', 'less', 'very', 'about', 'after', 'before', 'while', 'where', 'between', 'existing', 'current', 'github', 'repo', 'repository', 'project', 'open', 'create', 'pull', 'request', 'draft', 'returns', 'return', 'users', 'user', 'get', 'set', 'service', 'services', 'handler', 'handlers', 'util', 'utils', 'index', 'types', 'type', 'route', 'routes', 'controller', 'model', 'models', 'main', 'app', 'src', 'packages', 'apps', 'libs', 'lib', 'spec', 'component', 'components', 'page', 'pages', 'consumers', 'affected', 'clear', 'message', 'missing', 'somehow', 'snappier', 'feel', 'sometimes', 'often', 'still', 'again', 'sure', 'ensure']);

export interface RequestTokens {
  readonly paths: readonly string[];
  readonly identifiers: readonly string[];
  readonly words: readonly string[];
  readonly frames: ReadonlyArray<{ path: string; line: number | null }>;
  readonly routes: ReadonlyArray<{ method: string | null; path: string }>;
}

/** Splits camelCase, PascalCase and snake_case into lowercase words. */
export function splitWords(identifier: string): string[] {
  return identifier.replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2').split(/[^A-Za-z0-9]+/).filter(Boolean).map((w) => w.toLowerCase());
}

/** A crude suffix stemmer: enough to relate validate/validation/validators and notification/notifications, never to claim more. */
export function stem(word: string): string {
  const w = word.toLowerCase();
  if (w.length < 5) return w;
  return w.replace(/(?:ations?|ators?|ates?)$/, 'at').replace(/ings?$/, '').replace(/ed$/, '').replace(/([^s])s$/, '$1');
}

const meaningful = (w: string): boolean => w.length > 2 && !STOP.has(w);
const stems = (words: readonly string[]): string[] => [...new Set(words.filter(meaningful).map(stem))];

const routeKey = (path: string): string => path.toLowerCase().replace(/\/+$/, '').replace(/\/(?::[\w-]+|\{[\w-]+\}|\[[\w-]+\])/g, '/:p');

export function tokenize(request: string): RequestTokens {
  const text = request.slice(0, 8_000);
  const paths = new Set<string>(); const identifiers = new Set<string>(); const words = new Set<string>();
  const frames: Array<{ path: string; line: number | null }> = [];
  const routes: Array<{ method: string | null; path: string }> = [];
  for (const m of text.matchAll(/(?:^|[\s"'`(\[])((?:[\w.@-]+\/)*[\w.-]+\.(?:[cm]?[jt]sx?|py|go|rs|java|rb|php|css|scss|html|json|ya?ml|toml|sql|md))(?::(\d+))?(?::\d+)?/g)) {
    const p = m[1]!.replace(/^\.\//, '');
    paths.add(p);
    if (m[2]) frames.push({ path: p, line: Number(m[2]) });
  }
  for (const m of text.matchAll(/(?:\b(GET|POST|PUT|PATCH|DELETE)\s+)?(\/[A-Za-z][\w\-./:{}\[\]]*)/g)) {
    if (/\.[a-z]{1,4}$/.test(m[2]!) && !m[1]) continue; // a file path, not an endpoint
    routes.push({ method: m[1] ?? null, path: routeKey(m[2]!) });
    for (const seg of m[2]!.split('/')) for (const w of splitWords(seg.replace(/[:{}\[\]]/g, ' '))) words.add(w);
  }
  for (const m of text.matchAll(/`([^`\n]{1,120})`/g)) for (const part of m[1]!.split(/[^\w$.]+/)) if (/^[A-Za-z_$][\w$]*$/.test(part) && part.length > 2) identifiers.add(part);
  for (const m of text.matchAll(/\b[a-z]+(?:[A-Z][a-z0-9]+)+\b|\b[A-Z][a-z0-9]+(?:[A-Z][a-z0-9]+)+\b|\b[a-z0-9]+(?:_[a-z0-9]+)+\b/g)) identifiers.add(m[0]);
  for (const m of text.matchAll(/\b[A-Za-z][A-Za-z0-9]{2,}\b/g)) words.add(m[0].toLowerCase());
  for (const id of identifiers) for (const w of splitWords(id)) words.add(w);
  return { paths: [...paths], identifiers: [...identifiers], words: stems([...words]).slice(0, 80), frames, routes };
}

export interface ScoredFile {
  readonly path: string;
  readonly score: number;
  readonly role: 'target' | 'consumer' | 'dependency' | 'test';
  readonly reasons: readonly string[];
  readonly symbols: readonly string[];
}

export interface Relevance {
  readonly targets: readonly ScoredFile[];
  readonly consumers: readonly ScoredFile[];
  /** Pass-through barrels that re-export a target. Listed apart: the code behind them is the real consumer. */
  readonly reexporters: readonly ScoredFile[];
  readonly tests: readonly ScoredFile[];
  readonly dependencies: readonly ScoredFile[];
  readonly confidence: 'high' | 'medium' | 'low';
  readonly tokens: RequestTokens;
  /** Packages that contain a target, with how to test them according to their own manifest. */
  readonly packages: readonly { root: string; name: string | null; testCommand: string | null }[];
}

export interface LocateOptions { readonly maxTargets?: number; readonly maxRelated?: number }

function symbolScore(symbols: readonly SymbolInfo[], tokens: RequestTokens): { score: number; hits: string[]; strong: boolean } {
  let score = 0; let strong = false; const hits: string[] = [];
  const idsLower = new Set(tokens.identifiers.map((i) => i.toLowerCase()));
  const wordSet = new Set(tokens.words);
  for (const s of symbols) {
    if (s.kind === 'module') continue;
    let hit = 0;
    if (s.kind === 'route') {
      const [method, ...rest] = s.name.split(' '); const key = routeKey(rest.join(' '));
      for (const r of tokens.routes) {
        if (r.path === key && (!r.method || r.method === method || method === 'ANY')) { hit = 70; strong = true; }
        else if (key.endsWith(r.path) || r.path.endsWith(key)) hit = Math.max(hit, 30);
      }
    } else {
      const nameLower = s.name.toLowerCase();
      if (idsLower.has(nameLower)) { hit = 42; strong = true; }
      else {
        const parts = stems(splitWords(s.name));
        const overlap = parts.filter((p) => wordSet.has(p)).length;
        if (parts.length >= 2 && overlap >= 2) hit = 13 * overlap * (overlap / parts.length);
        else if (parts.length === 1 && overlap === 1 && parts[0]!.length > 4) hit = 9;
      }
      const extra = [s.signature ?? '', ...(s.annotations ?? [])].join(' ');
      if (extra && stems(splitWords(extra)).some((w) => w.length > 4 && wordSet.has(w))) hit += 5;
    }
    if (hit > 0) { score += hit; hits.push(s.name); }
  }
  return { score: Math.min(score, 110), hits: hits.slice(0, 6), strong };
}

function pathScore(path: string, tokens: RequestTokens): { score: number; reasons: string[]; strong: boolean } {
  const lower = path.toLowerCase();
  let score = 0; let strong = false; const reasons: string[] = [];
  for (const p of tokens.paths) {
    const pl = p.toLowerCase(); const baseOnly = pl.slice(pl.lastIndexOf('/') + 1);
    if (lower === pl || lower.endsWith(`/${pl}`)) { score += 100; strong = true; reasons.push(`named in the request: ${p}`); }
    else if (lower === baseOnly || lower.endsWith(`/${baseOnly}`)) { score += 55; strong = true; reasons.push(`file name named in the request: ${baseOnly}`); }
  }
  // split the path as written: lower-casing first would erase the camelCase boundaries that separate the words
  const slash = path.lastIndexOf('/');
  const baseWords = stems(splitWords(path.slice(slash + 1).replace(/\.[A-Za-z0-9]+$/, '')));
  const dirWords = stems(splitWords(path.slice(0, Math.max(0, slash)))).filter((w) => !baseWords.includes(w));
  const wordSet = new Set(tokens.words);
  const bm = baseWords.filter((w) => wordSet.has(w));
  const dm = dirWords.filter((w) => wordSet.has(w));
  if (bm.length) { score += 11 * bm.length + (bm.length >= 2 ? 8 * bm.length : 0); reasons.push(`file name words: ${bm.slice(0, 4).join(', ')}`); }
  if (dm.length) { score += Math.min(9, 3 * dm.length); reasons.push(`folder words: ${dm.slice(0, 3).join(', ')}`); }
  return { score, reasons, strong: strong || bm.length >= 2 };
}

export function locateRelevant(view: Pick<CodeIndexView, 'files' | 'packages'>, request: string, options: LocateOptions = {}, graphIn?: CodeGraph): Relevance {
  const tokens = tokenize(request);
  const graph = graphIn ?? buildGraph(view.files, view.packages);
  const maxTargets = options.maxTargets ?? 6; const maxRelated = options.maxRelated ?? 12;
  const byPath = new Map(view.files.map((f) => [f.path, f]));
  const scored = new Map<string, { score: number; reasons: string[]; symbols: string[]; strong: boolean }>();

  for (const f of view.files) {
    if (f.analysis.isTest) continue;
    const p = pathScore(f.path, tokens);
    const s = symbolScore(f.analysis.symbols, tokens);
    let score = p.score + s.score;
    const reasons = [...p.reasons];
    if (s.hits.length) reasons.push(`symbols: ${s.hits.join(', ')}`);
    let strong = p.strong || s.strong;
    for (const fr of tokens.frames) {
      if (f.path.endsWith(fr.path) && fr.line) {
        const enclosing = f.analysis.symbols.filter((sym) => sym.line > 0 && sym.line <= fr.line!).sort((a, b) => b.line - a.line)[0];
        if (enclosing) { score += 25; strong = true; reasons.push(`stack frame ${fr.path}:${fr.line} is inside ${enclosing.name}`); s.hits.push(enclosing.name); }
      }
    }
    if (score > 0) scored.set(f.path, { score, reasons, symbols: [...new Set(s.hits)], strong });
  }

  const ranked = [...scored.entries()].sort((a, b) => b[1].score - a[1].score || (a[0] < b[0] ? -1 : 1));
  const top = ranked[0]?.[1].score ?? 0;
  // targets: strong, high-scoring hits only, so an incidental word match never becomes an edit target
  const threshold = Math.max(30, top * 0.6);
  const targetEntries = ranked.filter(([, v]) => v.score >= threshold && v.strong).slice(0, maxTargets);
  // the graph is a signal too: a file that a strong target imports, and that itself matches the request, is part of the same change
  // (the route and the function it calls, the handler and its validator)
  const chosen = new Set(targetEntries.map(([p]) => p));
  for (const [path] of [...targetEntries]) {
    for (const dep of calleesOf(graph, path)) {
      const v = scored.get(dep);
      if (v && v.strong && v.score >= 30 && !chosen.has(dep) && targetEntries.length < maxTargets) { chosen.add(dep); targetEntries.push([dep, { ...v, reasons: [...v.reasons, `called by ${path}`] }]); }
    }
  }
  const targets: ScoredFile[] = targetEntries.map(([path, v]) => ({ path, score: Math.round(v.score), role: 'target', reasons: v.reasons, symbols: v.symbols }));
  const targetPaths = new Set(targets.map((t) => t.path));

  const related = new Map<string, ScoredFile>();
  const add = (path: string, role: ScoredFile['role'], score: number, reason: string) => {
    if (targetPaths.has(path) || !byPath.has(path)) return;
    const cur = related.get(path);
    if (cur && cur.score >= score) return;
    related.set(path, { path, role, score, reasons: [reason], symbols: [] });
  };
  for (const t of targets) {
    const used = consumersOf(graph, byPath, t.path);
    for (const c of used.consumers) if (!byPath.get(c.path)?.analysis.isTest) add(c.path, 'consumer', c.via ? 17 : 20, c.via ? `uses ${t.path} through ${c.via}` : `imports ${t.path}`);
    for (const r of used.reexporters) add(r, 'dependency', 6, `re-exports ${t.path}`);
    for (const d of graph.dependsOn.get(t.path) ?? []) add(d, 'dependency', 8, `imported by ${t.path}`);
    for (const test of graph.testsFor.get(t.path) ?? []) add(test, 'test', 30, `exercises ${t.path}`);
  }
  // tests that exercise a consumer are worth running too
  for (const c of [...related.values()].filter((r) => r.role === 'consumer')) for (const test of graph.testsFor.get(c.path) ?? []) add(test, 'test', 14, `exercises ${c.path}`);
  const relatedList = [...related.values()].sort((a, b) => b.score - a.score || (a.path < b.path ? -1 : 1));
  const consumers = relatedList.filter((r) => r.role === 'consumer').slice(0, maxRelated);
  const tests = relatedList.filter((r) => r.role === 'test').slice(0, maxRelated);
  const reexporters = relatedList.filter((r) => r.reasons[0]?.startsWith('re-exports')).slice(0, maxRelated);
  const dependencies = relatedList.filter((r) => r.role === 'dependency' && !r.reasons[0]?.startsWith('re-exports')).slice(0, maxRelated);

  const second = ranked.find(([p]) => !targetPaths.has(p))?.[1].score ?? 0;
  const confidence: Relevance['confidence'] = targets.length === 0 ? 'low' : targets[0]!.score >= 70 && targets[0]!.score >= second * 1.25 ? 'high' : targets[0]!.score >= 45 ? 'medium' : 'low';

  const touched = new Set(targets.map((t) => t.path));
  const packages = view.packages.filter((p) => [...touched].some((t) => p.root === '' || t === p.root || t.startsWith(`${p.root}/`)))
    .sort((a, b) => b.root.length - a.root.length)
    .filter((p, _i, all) => p.root !== '' || all.length === 1 || !all.some((q) => q.root !== '' && q.kind === p.kind))
    .map((p) => ({ root: p.root, name: p.name, testCommand: p.testCommand }));
  return { targets, consumers, reexporters, tests, dependencies, confidence, tokens, packages };
}

/** Rough token estimate (about four characters per token): used to keep the passport inside its budget, never to bill. */
export const estimateTokens = (text: string): number => Math.ceil(text.length / 4);

export interface Passport {
  readonly text: string;
  readonly estimatedTokens: number;
  readonly files: readonly string[];
  readonly truncated: boolean;
}

export interface PassportInput {
  readonly repository: string;
  readonly branch: string;
  readonly commitSha: string;
  readonly overlayFingerprint?: string;
  readonly status: string;
  readonly coverageNote?: string;
  readonly request: string;
  readonly relevance: Relevance;
  readonly files: ReadonlyMap<string, IndexedCodeFile>;
  readonly packages: readonly PackageInfo[];
  readonly budgetTokens?: number;
}

/**
 * The compact context a model is given about a repository: what it is, exactly which commit, where the request most likely lives
 * (with signatures, not bodies), who calls it, what tests cover it and how the project itself says to run them. Source bodies are
 * fetched separately and only for the files that are about to change.
 */
export function buildPassport(input: PassportInput): Passport {
  const budget = input.budgetTokens ?? 3_500;
  const lines: string[] = [];
  const langs = new Map<string, number>();
  for (const f of input.files.values()) if (f.analysis.language && !['json', 'markdown', 'yaml', 'toml'].includes(f.analysis.language)) langs.set(f.analysis.language, (langs.get(f.analysis.language) ?? 0) + 1);
  const topLangs = [...langs.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4).map(([l, n]) => `${l} (${n})`).join(', ');
  lines.push(`PROJECT ${input.repository} @ ${input.commitSha.slice(0, 12)} (branch ${input.branch}); code map ${input.status}${input.overlayFingerprint ? ', with uncommitted changes applied' : ''}.`);
  if (input.coverageNote) lines.push(`Coverage: ${input.coverageNote}`);
  if (topLangs) lines.push(`Languages: ${topLangs}.`);
  if (input.packages.length) lines.push(`Packages: ${input.packages.slice(0, 12).map((p) => `${(p.name ?? p.root) || '.'} [${p.kind}] at ${p.root || '.'}`).join('; ')}${input.packages.length > 12 ? `; +${input.packages.length - 12} more` : ''}.`);
  lines.push(`Request: ${input.request.replace(/\s+/g, ' ').slice(0, 400)}`);
  lines.push(`Confidence in the located files: ${input.relevance.confidence}${input.relevance.confidence === 'low' ? ' (the request does not clearly name a place; ask or search before editing)' : ''}.`);

  const included: string[] = [];
  const section = (title: string, list: readonly ScoredFile[], detail: boolean) => {
    if (!list.length) return;
    lines.push(`${title}:`);
    for (const item of list) {
      const row = input.files.get(item.path);
      lines.push(`- ${item.path}${item.reasons.length ? ` (${item.reasons.slice(0, 2).join('; ')})` : ''}`);
      included.push(item.path);
      if (detail && row) for (const s of row.analysis.symbols.filter((x) => x.kind !== 'module').slice(0, 10)) lines.push(`    ${s.kind} ${s.parent ? `${s.parent}.` : ''}${s.name}${s.signature ?? ''}${s.exported ? '' : ' (not exported)'}${s.line ? ` :${s.line}` : ''}`);
    }
  };
  section('Likely targets', input.relevance.targets, true);
  section('Code that imports a target', input.relevance.consumers, false);
  section('Tests that exercise them', input.relevance.tests, false);
  section('What the targets import', input.relevance.dependencies.slice(0, 6), false);
  if (input.relevance.packages.length) lines.push(`Test commands declared by the project: ${input.relevance.packages.filter((p) => p.testCommand).map((p) => `${p.testCommand} (in ${p.root || '.'})`).join('; ') || 'none declared'}.`);

  let text = lines.join('\n'); let truncated = false;
  while (estimateTokens(text) > budget && lines.length > 6) { lines.splice(lines.length - 1, 1); text = lines.join('\n'); truncated = true; }
  if (estimateTokens(text) > budget) { text = text.slice(0, budget * 4); truncated = true; }
  return { text, estimatedTokens: estimateTokens(text), files: [...new Set(included)], truncated };
}

export { affectedBy };
