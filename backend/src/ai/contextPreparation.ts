import { createHash } from 'crypto';
import type { ProjectFile } from './patches.js';

const SECRET_PATTERNS = [
  /\b(?:api[_-]?key|secret|token|password|authorization)\s*[:=]\s*["']?[^\s"']+/gi,
  /\b(?:sk|ghp|gho|xox[baprs])_[A-Za-z0-9_-]{12,}\b/g,
  /-----BEGIN [A-Z ]+ PRIVATE KEY-----[\s\S]*?-----END [A-Z ]+ PRIVATE KEY-----/g,
];

const BINARY_EXT = /\.(?:png|jpe?g|gif|webp|ico|pdf|zip|woff2?|ttf|mp4|mp3)$/i;

export interface RepositoryIndexEntry {
  path: string;
  bytes: number;
  language: string;
  imports: string[];
  symbols: string[];
  testFor?: string;
  digest: string;
}

export interface PreparedContext {
  files: Array<{ path: string; content: string }>;
  summaries: Array<{ path: string; summary: string }>;
  suppliedReferences: string[];
  estimatedTokens: number;
  redactionCount: number;
  repositoryFileCount: number;
}

export function redactModelContext(value: string): { value: string; count: number } {
  let count = 0;
  let output = value;
  for (const pattern of SECRET_PATTERNS) {
    output = output.replace(pattern, () => { count += 1; return '[REDACTED_SECRET]'; });
  }
  return { value: output, count };
}

export function indexRepository(files: ProjectFile[]): RepositoryIndexEntry[] {
  return files.filter((file) => !BINARY_EXT.test(file.path)).map((file) => {
    const imports = [...file.content.matchAll(/(?:from\s+|require\(|import\()["']([^"']+)/g)].map((match) => match[1]).slice(0, 40);
    const symbols = [...file.content.matchAll(/\b(?:export\s+)?(?:class|function|interface|type|const)\s+([A-Za-z_$][\w$]*)/g)].map((match) => match[1]).slice(0, 60);
    const testFor = /(?:\.test|\.spec)\.[cm]?[jt]sx?$/.test(file.path) ? file.path.replace(/(?:\.test|\.spec)(?=\.[^.]+$)/, '') : undefined;
    return {
      path: file.path, bytes: Buffer.byteLength(file.content), language: file.path.split('.').at(-1) ?? 'text',
      imports, symbols, testFor, digest: createHash('sha256').update(file.content).digest('hex').slice(0, 16),
    };
  });
}

function terms(value: string): Set<string> {
  const stop = new Set(['src', 'app', 'lib', 'test', 'spec', 'file', 'service', 'with', 'from', 'this', 'that']);
  return new Set(value.toLowerCase().split(/[^a-z0-9_$-]+/).filter((part) => part.length > 2 && !stop.has(part)));
}

export function prepareFocusedContext(input: {
  files: ProjectFile[];
  objective: string;
  allowedFiles?: string[];
  maximumTokens?: number;
}): PreparedContext {
  const index = indexRepository(input.files);
  const wanted = terms(`${input.objective} ${(input.allowedFiles ?? []).join(' ')}`);
  const allowed = new Set(input.allowedFiles ?? []);
  const score = (entry: RepositoryIndexEntry): number => {
    let points = allowed.has(entry.path) ? 100 : 0;
    const corpus = terms(`${entry.path} ${entry.symbols.join(' ')} ${entry.imports.join(' ')}`);
    for (const term of wanted) if (corpus.has(term)) points += entry.path.toLowerCase().includes(term) ? 10 : 3;
    if (/package\.json$|tsconfig|README|AGENTS\.md|CLAUDE\.md/i.test(entry.path)) points += 4;
    if (entry.testFor && [...wanted].some((term) => entry.testFor!.toLowerCase().includes(term))) points += 12;
    return points;
  };
  const ranked = index.map((entry) => ({ entry, score: score(entry) })).filter((item) => item.score >= 4).sort((a, b) => b.score - a.score || a.entry.bytes - b.entry.bytes);
  const maximumTokens = Math.max(512, input.maximumTokens ?? 12_000);
  const maximumChars = maximumTokens * 4;
  let used = 0;
  let redactionCount = 0;
  const selected: PreparedContext['files'] = [];
  const summaries: PreparedContext['summaries'] = [];
  for (const { entry } of ranked) {
    const file = input.files.find((candidate) => candidate.path === entry.path)!;
    const redacted = redactModelContext(file.content);
    redactionCount += redacted.count;
    if (used + redacted.value.length <= maximumChars && selected.length < 24) {
      selected.push({ path: file.path, content: redacted.value }); used += redacted.value.length;
    } else {
      summaries.push({ path: file.path, summary: `${entry.language}; ${entry.bytes} bytes; symbols: ${entry.symbols.slice(0, 12).join(', ') || 'none'}; digest ${entry.digest}` });
    }
  }
  return {
    files: selected, summaries, suppliedReferences: [...selected.map((file) => file.path), ...summaries.map((item) => `summary:${item.path}`)],
    estimatedTokens: Math.ceil(used / 4), redactionCount, repositoryFileCount: input.files.length,
  };
}
