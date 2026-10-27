/**
 * Types of the derived code map (Batch 3, Phase 2).
 *
 * The map is DERIVED, never authoritative: GitHub at the linked commit is canonical. Every row is keyed by the blob SHA it was derived
 * from, the whole map by the exact commit, and anything that cannot be established says so (`parse: 'none'`, `status: 'partial'`)
 * instead of inventing a symbol, an edge or a test relationship.
 */

export type SymbolKind = 'function' | 'class' | 'method' | 'interface' | 'type' | 'enum' | 'const' | 'struct' | 'module' | 'route';

export interface SymbolInfo {
  readonly name: string;
  readonly kind: SymbolKind;
  /** 1-based line of the declaration. */
  readonly line: number;
  /** Parameter list and return type as written, collapsed and bounded. Absent when none applies. */
  readonly signature?: string;
  readonly exported: boolean;
  /** Enclosing class or type for a method. */
  readonly parent?: string;
  /** Decorators (Python) or similar annotations worth searching by, such as a route path. */
  readonly annotations?: readonly string[];
}

export type ImportKind = 'static' | 'dynamic' | 'require' | 'reexport' | 'type';

export interface RawImport {
  readonly specifier: string;
  readonly kind: ImportKind;
  /** Names this statement brings in (JS/TS): `{ a as b }` gives `a`, a default import gives `default`, a namespace gives `*`. */
  readonly names?: readonly string[];
}

/**
 * How trustworthy the extraction is:
 *   structural  a comment/string-aware scan that tracks nesting (TS/JS, Python, Go). Reliable for declarations and import statements,
 *               not a type checker: it never claims a resolved type reference.
 *   lexical     name-level pattern matching for a language without an adapter.
 *   none        nothing was extracted (unreadable, binary, excluded or failed).
 */
export type ParseLevel = 'structural' | 'lexical' | 'none';

export interface FileAnalysis {
  readonly language: string | null;
  readonly parse: ParseLevel;
  /** True when the source did not scan cleanly (unbalanced braces, unterminated string). Partial results are kept, never invented. */
  readonly malformed: boolean;
  readonly symbols: readonly SymbolInfo[];
  readonly imports: readonly RawImport[];
  readonly exports: readonly string[];
  readonly isTest: boolean;
  /** Test names declared in the file (Go `TestX`, Python `test_x`, JS `it`/`test` titles), bounded. */
  readonly testNames: readonly string[];
}

export const EMPTY_ANALYSIS: FileAnalysis = { language: null, parse: 'none', malformed: false, symbols: [], imports: [], exports: [], isTest: false, testNames: [] };

export type ExclusionReason =
  | 'sensitive' | 'vendored' | 'generated' | 'lockfile' | 'binary' | 'too_large' | 'lfs_pointer' | 'symlink' | 'submodule' | 'unsupported_type' | 'budget';

export interface IndexedCodeFile {
  readonly path: string;
  readonly blobSha: string;
  readonly size: number;
  readonly analysis: FileAnalysis;
}

export type PackageKind = 'node' | 'python' | 'go';

export interface PackageInfo {
  readonly root: string;
  readonly kind: PackageKind;
  readonly name: string | null;
  /** Commands the manifest itself declares for testing (never run here). */
  readonly testCommand: string | null;
  /** Workspace members declared by a node manifest. */
  readonly workspaces: readonly string[];
  /** tsconfig-style path aliases found beside a node package, `alias -> targets`. */
  readonly aliases: Readonly<Record<string, readonly string[]>>;
  /** The module path of a Go module. */
  readonly modulePath: string | null;
}

export type CodeIndexStatus = 'valid' | 'partial' | 'failed' | 'unsupported';

export interface CodeIndexCoverage {
  readonly filesKnown: number;
  readonly filesIndexed: number;
  readonly excluded: Readonly<Partial<Record<ExclusionReason, number>>>;
  /** Whether the repository listing itself was complete. `false` means absent files are not proven absent. */
  readonly treeComplete: boolean;
  readonly partialReason?: string;
}

export interface BuildMetrics {
  readonly kind: 'cold' | 'incremental' | 'reused';
  readonly blobFetches: number;
  readonly bytesFetched: number;
  readonly reusedRows: number;
  readonly analyzedRows: number;
  readonly durationMs: number;
}

export interface CodeIndex {
  readonly schemaVersion: string;
  /** Changes whenever extraction behaviour changes: rows built by another parser version are never reused. */
  readonly parserVersion: string;
  readonly commitSha: string;
  readonly treeSha: string | null;
  readonly status: CodeIndexStatus;
  readonly coverage: CodeIndexCoverage;
  readonly files: readonly IndexedCodeFile[];
  readonly packages: readonly PackageInfo[];
  /** SHA-256 over the parser version and every indexed (path, blob sha): equal fingerprints mean equal derived content. */
  readonly contentFingerprint: string;
  readonly builtAt: string;
}

export const CODE_INDEX_SCHEMA_VERSION = '1.0.0';
export const PARSER_VERSION = 'xroga-adapters-1';
