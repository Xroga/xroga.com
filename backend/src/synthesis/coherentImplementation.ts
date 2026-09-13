import {
  chatCompletionStream,
  estimateTokens,
  providerReasoningControls,
  type ChatMessage,
} from '../ai/openaiCompat.js';
import { runBuilderAttempt, classifyBuilderFailure, type BuilderAttemptFailure } from '../ai/builderAttempt.js';
import { costUsdForTokens, MODELS, type ModelId } from '../ai/models.js';
import { assertCodingModel } from '../ai/providerPolicy.js';
import { normalizeProviderError } from '../ai/providerRuntime.js';
import { extractJson } from '../ai/black-hole/structuredOutput.js';
import { prepareFocusedContext } from '../ai/contextPreparation.js';
import { scanProjectFiles } from '../ai/securityScan.js';
import type { ProjectFile } from '../ai/patches.js';
import { preservesRequiredSymbols, type ModelCandidate } from './incrementalImplementation.js';

export const MAX_COHERENT_FILES = 24;
export const COHERENT_BUNDLE_MAX_TOKENS = 32_000;
export const COHERENT_CONTINUATION_MAX_TOKENS = 20_000;
export const COHERENT_FIRST_TOKEN_TIMEOUT_MS = 60_000;
export const COHERENT_ACTIVE_TIMEOUT_MS = 240_000;
export const COHERENT_CONTEXT_TOKENS = 24_000;
export const MAX_COHERENT_PROVIDER_ATTEMPTS = 2;

const MANIFEST_OPEN = '<<<XROGA_MANIFEST>>>';
const MANIFEST_CLOSE = '<<<XROGA_END_MANIFEST>>>';
const FILE_OPEN = '<<<XROGA_FILE>>>';
const CONTENT_OPEN = '<<<XROGA_CONTENT>>>';
const FILE_CLOSE = '<<<XROGA_END_FILE>>>';

export interface ProjectChangeContract {
  readonly version: 1;
  readonly summary: string;
  readonly project: {
    readonly runtime: string;
    readonly framework: string | null;
    readonly packageManager: string | null;
    readonly buildCommands: readonly string[];
    readonly testCommands: readonly string[];
    readonly runCommand: string | null;
  };
  readonly sharedContracts: readonly string[];
  readonly files: ReadonlyArray<{
    readonly path: string;
    readonly operation: 'upsert';
    readonly purpose: string;
  }>;
}

export interface ParsedCoherentBundle {
  readonly status: 'complete' | 'partial' | 'invalid';
  readonly contract: ProjectChangeContract | null;
  readonly files: readonly ProjectFile[];
  readonly missingPaths: readonly string[];
  readonly reason: string;
}

export interface BuilderModelCallTelemetry {
  readonly stage: 'implementation' | 'continuation';
  readonly modelId: string;
  readonly purpose: string;
  readonly inputChars: number;
  readonly estimatedInputTokens: number;
  readonly outputChars: number;
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly queueWaitMs: number;
  readonly activeDurationMs: number;
  readonly firstOutputMs: number | null;
  readonly completionStatus: 'completed' | 'failed';
  readonly failure: BuilderAttemptFailure | null;
  readonly retryReason: string | null;
  readonly approximateCostUsd: number;
  readonly outputUsed: boolean;
  readonly valueClassification:
    | 'NECESSARY_VALUE'
    | 'NECESSARY_TOO_EXPENSIVE'
    | 'FAILED_BEFORE_VALUE'
    | 'RETRY_WITH_NEW_EVIDENCE'
    | 'PROVIDER_UNSUITABLE';
}

export interface CoherentCompletionResult {
  readonly text: string;
  readonly finishReason?: string | null;
  readonly inputTokens?: number;
  readonly outputTokens: number;
  readonly firstOutputMs?: number | null;
}

export interface CoherentCompletionFn {
  (
    modelId: string,
    messages: ChatMessage[],
    opts: { maxTokens: number; temperature: number; json?: boolean; signal?: AbortSignal },
  ): Promise<CoherentCompletionResult>;
}

export class CoherentImplementationError extends Error {
  readonly code = 'SOFTWARE_IMPLEMENTATION_FAILED' as const;
  readonly failures: readonly string[];
  readonly safeReasons: readonly string[];

  constructor(message: string, failures: readonly string[]) {
    super(message);
    this.name = 'CoherentImplementationError';
    this.failures = failures;
    this.safeReasons = [...new Set(failures.map(safeCoherentFailureReason))];
  }
}

function safeCoherentFailureReason(value: string): string {
  const reason = value.includes(': ') ? value.slice(value.indexOf(': ') + 2) : value;
  if (reason === 'first_token_timeout') return 'the implementation provider did not respond before the deadline';
  if (reason === 'generation_timeout') return 'project generation exceeded its bounded deadline';
  if (reason === 'truncated_output' || /missing or truncated|cut off/i.test(reason)) return 'the project bundle was incomplete';
  if (reason === 'provider_rate_limit') return 'implementation capacity was rate limited';
  if (reason === 'provider_unavailable' || reason === 'provider_unconfigured') return 'implementation capacity was unavailable';
  if (reason === 'provider_authentication') return 'implementation capacity was not configured correctly';
  if (reason === 'empty_response') return 'the implementation provider returned no project output';
  if (/secret|unsafe/i.test(reason)) return 'the generated project did not pass safety validation';
  if (/unexpected|conflicting|duplicate/i.test(reason)) return 'the generated file set conflicted with its project manifest';
  if (/symbol/i.test(reason)) return 'the update did not preserve required repository contracts';
  return 'the generated project did not pass structured-output validation';
}

function normalizePath(value: string): string {
  return value.trim().replace(/\\/g, '/').replace(/^(?:\.\/)+/, '');
}

function safeProjectPath(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const path = normalizePath(value);
  if (!path || path.startsWith('/') || /^[A-Za-z]:\//.test(path) || /\p{Cf}/u.test(path)) return false;
  const segments = path.split('/');
  return !segments.some((segment) => !segment || segment === '..' || segment === '.' || segment === '.git' || segment.endsWith('.'));
}

function stringList(value: unknown, maximum = 16): readonly string[] | null {
  if (!Array.isArray(value) || value.some((item) => typeof item !== 'string')) return null;
  return value.slice(0, maximum).map((item) => item.trim()).filter(Boolean);
}

function optionalStringList(value: unknown, maximum = 16): readonly string[] | null {
  return value === undefined || value === null ? [] : stringList(value, maximum);
}

/**
 * The materialized result is a complete file snapshot; the atomic writer later derives
 * create-versus-update from the real repository tree. Treating these three spellings as
 * different here made harmless provider vocabulary differences invalidate good code.
 * Delete remains deliberately unsupported because it has different data-loss semantics.
 */
function normalizeSnapshotOperation(value: unknown): 'upsert' | null {
  return value === undefined || value === 'upsert' || value === 'create' || value === 'update' ||
    value === 'write' || value === 'replace' || value === 'modify' || value === 'add'
    ? 'upsert'
    : null;
}

function firstString(record: Record<string, unknown>, keys: readonly string[]): string | undefined {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === 'string') return value;
  }
  return undefined;
}

function unwrapBundle(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  let object = value as Record<string, unknown>;
  if (Array.isArray(object.files) || Array.isArray(object.fileContents)) return object;

  // Some structured-output transports add one harmless envelope around the requested object.
  // Unwrap only when there is exactly one object-shaped value carrying file data; never search
  // arbitrary nested values, because that could reinterpret unrelated model prose as a write.
  const nested = Object.values(object).filter((candidate): candidate is Record<string, unknown> =>
    Boolean(candidate) && typeof candidate === 'object' && !Array.isArray(candidate) &&
    (Array.isArray((candidate as Record<string, unknown>).files) ||
      Array.isArray((candidate as Record<string, unknown>).fileContents)),
  );
  if (nested.length === 1) object = nested[0]!;
  return object;
}

function normalizeContentRecords(value: unknown): Array<Record<string, unknown>> | null {
  if (Array.isArray(value)) {
    return value.map((candidate) => {
      if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) return {};
      const file = candidate as Record<string, unknown>;
      return {
        path: firstString(file, ['path', 'filePath', 'file', 'name']),
        operation: file.operation ?? file.action,
        content: firstString(file, ['content', 'body', 'source', 'code']),
        purpose: firstString(file, ['purpose', 'description']),
      };
    });
  }
  if (value && typeof value === 'object') {
    return Object.entries(value as Record<string, unknown>).map(([path, content]) => ({ path, content }));
  }
  return null;
}

function normalizeManifestRecords(
  value: unknown,
  contents: readonly Record<string, unknown>[],
): Array<Record<string, unknown>> | null {
  if (value === undefined || value === null) {
    return contents.map((file) => ({
      path: file.path,
      operation: file.operation,
      purpose: file.purpose,
    }));
  }
  if (!Array.isArray(value)) return null;
  return value.map((candidate) => {
    if (typeof candidate === 'string') return { path: candidate };
    if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) return {};
    const file = candidate as Record<string, unknown>;
    return {
      path: firstString(file, ['path', 'filePath', 'file', 'name']),
      operation: file.operation ?? file.action,
      purpose: firstString(file, ['purpose', 'description']),
    };
  });
}

function normalizedJsonBundle(value: unknown): Record<string, unknown> | null {
  const object = unwrapBundle(value);
  if (!object) return null;
  const contents = normalizeContentRecords(object.fileContents ?? object.files);
  if (!contents?.length) return null;
  const files = normalizeManifestRecords(object.files, contents);
  if (!files?.length) return null;
  const projectValue = object.project;
  const project = projectValue && typeof projectValue === 'object' && !Array.isArray(projectValue)
    ? projectValue as Record<string, unknown>
    : {};
  const runtime = firstString(project, ['runtime', 'language', 'platform']) ?? 'unspecified';
  const framework = firstString(project, ['framework']);
  const packageManager = firstString(project, ['packageManager', 'package_manager']);
  const runCommand = firstString(project, ['runCommand', 'run_command']);
  return {
    version: object.version ?? 1,
    summary: typeof object.summary === 'string' && object.summary.trim()
      ? object.summary
      : 'Generated coherent project change',
    project: {
      runtime,
      framework: framework ?? null,
      packageManager: packageManager ?? null,
      buildCommands: project.buildCommands ?? project.build_commands ?? [],
      testCommands: project.testCommands ?? project.test_commands ?? [],
      runCommand: runCommand ?? null,
    },
    sharedContracts: object.sharedContracts ?? object.shared_contracts ?? [],
    files,
    fileContents: contents,
  };
}

function parseContract(raw: string): ProjectChangeContract | null {
  try {
    const value = JSON.parse(raw) as Record<string, unknown>;
    const project = value.project as Record<string, unknown> | null;
    const files = value.files;
    const sharedContracts = optionalStringList(value.sharedContracts, 40);
    const framework = project?.framework;
    const packageManager = project?.packageManager;
    const runCommand = project?.runCommand;
    if (
      !(value.version === 1 || value.version === '1') || typeof value.summary !== 'string' || !value.summary.trim() ||
      !project || typeof project.runtime !== 'string' || !project.runtime.trim() ||
      !(framework === undefined || typeof framework === 'string' || framework === null) ||
      !(packageManager === undefined || typeof packageManager === 'string' || packageManager === null) ||
      !(runCommand === undefined || typeof runCommand === 'string' || runCommand === null) ||
      !optionalStringList(project.buildCommands) || !optionalStringList(project.testCommands) || !sharedContracts ||
      !Array.isArray(files) || !files.length || files.length > MAX_COHERENT_FILES
    ) return null;

    const seen = new Set<string>();
    const normalizedFiles: ProjectChangeContract['files'][number][] = [];
    for (const candidate of files as Array<Record<string, unknown>>) {
      if (
        !safeProjectPath(candidate?.path) || !normalizeSnapshotOperation(candidate.operation) ||
        !(candidate.purpose === undefined || (typeof candidate.purpose === 'string' && candidate.purpose.trim()))
      ) return null;
      const path = normalizePath(candidate.path);
      const folded = path.toLowerCase();
      if (seen.has(folded)) return null;
      seen.add(folded);
      normalizedFiles.push({
        path,
        operation: 'upsert',
        purpose: typeof candidate.purpose === 'string' ? candidate.purpose.trim() : `update ${path}`,
      });
    }

    return {
      version: 1,
      summary: value.summary.trim(),
      project: {
        runtime: project.runtime.trim(),
        framework: typeof framework === 'string' ? framework.trim() || null : null,
        packageManager: typeof packageManager === 'string' ? packageManager.trim() || null : null,
        buildCommands: optionalStringList(project.buildCommands)!,
        testCommands: optionalStringList(project.testCommands)!,
        runCommand: typeof runCommand === 'string' ? runCommand.trim() || null : null,
      },
      sharedContracts,
      files: normalizedFiles,
    };
  } catch {
    return null;
  }
}

function parseFileFrames(text: string): { files: ProjectFile[]; invalidReason: string | null } {
  const files: ProjectFile[] = [];
  const seen = new Set<string>();
  let cursor = 0;
  while (true) {
    const start = text.indexOf(FILE_OPEN, cursor);
    if (start < 0) break;
    const metadataStart = start + FILE_OPEN.length;
    const contentMarker = text.indexOf(CONTENT_OPEN, metadataStart);
    if (contentMarker < 0) break;
    const end = text.indexOf(FILE_CLOSE, contentMarker + CONTENT_OPEN.length);
    if (end < 0) break; // safely resumable truncation: retain only complete frames
    let metadata: { path?: unknown; operation?: unknown };
    try {
      metadata = JSON.parse(text.slice(metadataStart, contentMarker).trim()) as typeof metadata;
    } catch {
      return { files: [], invalidReason: 'a file frame has malformed metadata' };
    }
    if (!safeProjectPath(metadata.path) || !normalizeSnapshotOperation(metadata.operation)) {
      return { files: [], invalidReason: 'a file frame has an unsafe path or operation' };
    }
    const path = normalizePath(metadata.path);
    const folded = path.toLowerCase();
    if (seen.has(folded)) return { files: [], invalidReason: `duplicate file frame for ${path}` };
    const content = text.slice(contentMarker + CONTENT_OPEN.length, end).replace(/^\r?\n/, '').replace(/\r?\n$/, '');
    if (!content.trim()) return { files: [], invalidReason: `file ${path} is empty` };
    seen.add(folded);
    files.push({ path, content });
    cursor = end + FILE_CLOSE.length;
  }
  return { files, invalidReason: null };
}

function containsHighConfidenceSecret(files: readonly ProjectFile[]): boolean {
  const patterns = [
    /\b(?:sk|rk)-[A-Za-z0-9][A-Za-z0-9_-]{19,}\b/,
    /\b(?:ghp_|github_pat_|xai-)[A-Za-z0-9_-]{20,}\b/,
    /\bAKIA[0-9A-Z]{16}\b/,
    /-----BEGIN (?:RSA |EC )?PRIVATE KEY-----/,
  ];
  return files.some((file) => patterns.some((pattern) => pattern.test(file.content)));
}

function jsonFilesToFrames(value: unknown): string | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const object = value as { files?: unknown; fileContents?: unknown };
  const files = normalizeContentRecords(object.fileContents ?? object.files);
  if (!files) return null;
  return files.flatMap((candidate) => {
    const file = candidate as Record<string, unknown>;
    if (typeof file.content !== 'string' || !file.content.trim()) return [];
    return [
      FILE_OPEN,
      JSON.stringify({
        path: file.path,
        operation: normalizeSnapshotOperation(file.operation) ?? file.operation,
      }),
      CONTENT_OPEN,
      file.content,
      FILE_CLOSE,
    ].join('\n');
  }).join('\n');
}

/** Convert the preferred JSON project bundle into the same hardened internal framing. */
function jsonBundleToFrames(text: string): string | null {
  const object = normalizedJsonBundle(extractJson(text));
  if (!object) return null;
  const manifestFiles = object.files as Array<Record<string, unknown>>;
  const manifest: Record<string, unknown> = {
    ...object,
    files: manifestFiles.map((candidate) => {
      if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) return candidate;
      const { content: _content, ...file } = candidate as Record<string, unknown>;
      return file;
    }),
  };
  delete manifest.fileContents;
  return [
    MANIFEST_OPEN,
    JSON.stringify(manifest),
    MANIFEST_CLOSE,
    jsonFilesToFrames(object) ?? '',
  ].join('\n');
}

/**
 * Retain only complete file-content objects from a clipped JSON bundle.
 *
 * The manifest is deliberately emitted before fileContents. That means the prefix can be
 * closed into a valid object without guessing any source text. A small string-aware scanner
 * then accepts only balanced JSON objects; the clipped tail is never materialized as code.
 */
function truncatedJsonBundleToFrames(text: string): string | null {
  const match = /"fileContents"\s*:\s*\[/.exec(text);
  if (!match || match.index < 0) return null;
  const arrayStart = match.index + match[0].lastIndexOf('[');
  let header: unknown;
  try {
    header = JSON.parse(`${text.slice(0, arrayStart)}[]}`);
  } catch {
    return null;
  }
  if (!header || typeof header !== 'object' || Array.isArray(header)) return null;

  const complete: unknown[] = [];
  let objectStart = -1;
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let index = arrayStart + 1; index < text.length; index += 1) {
    const char = text[index]!;
    if (inString) {
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === '"') inString = false;
      continue;
    }
    if (char === '"') {
      inString = true;
      continue;
    }
    if (char === '{') {
      if (depth === 0) objectStart = index;
      depth += 1;
      continue;
    }
    if (char === '}' && depth > 0) {
      depth -= 1;
      if (depth === 0 && objectStart >= 0) {
        try {
          complete.push(JSON.parse(text.slice(objectStart, index + 1)));
        } catch {
          return null;
        }
        objectStart = -1;
      }
      continue;
    }
    if (char === ']' && depth === 0) break;
  }

  return jsonBundleToFrames(JSON.stringify({ ...(header as Record<string, unknown>), fileContents: complete }));
}

/** Parse and validate the complete framed project-change contract before materialization. */
export function parseCoherentBundle(
  text: string,
  existingFiles: readonly ProjectFile[] = [],
  preservationBrief = '',
): ParsedCoherentBundle {
  if (text.length > 1_500_000) {
    return { status: 'invalid', contract: null, files: [], missingPaths: [], reason: 'bundle exceeded the output-size limit' };
  }
  const normalizedText = text.includes(MANIFEST_OPEN)
    ? text
    : (jsonBundleToFrames(text) ?? truncatedJsonBundleToFrames(text) ?? text);
  const manifestStart = normalizedText.indexOf(MANIFEST_OPEN);
  const manifestEnd = normalizedText.indexOf(MANIFEST_CLOSE);
  if (manifestStart < 0 || manifestEnd < manifestStart) {
    return { status: 'invalid', contract: null, files: [], missingPaths: [], reason: 'bundle manifest is missing or truncated' };
  }
  const contract = parseContract(normalizedText.slice(manifestStart + MANIFEST_OPEN.length, manifestEnd).trim());
  if (!contract) {
    return { status: 'invalid', contract: null, files: [], missingPaths: [], reason: 'bundle manifest is invalid' };
  }
  const frames = parseFileFrames(normalizedText.slice(manifestEnd + MANIFEST_CLOSE.length));
  if (frames.invalidReason) {
    return { status: 'invalid', contract, files: [], missingPaths: [], reason: frames.invalidReason };
  }
  const allowed = new Set(contract.files.map((file) => file.path.toLowerCase()));
  if (frames.files.some((file) => !allowed.has(file.path.toLowerCase()))) {
    return { status: 'invalid', contract, files: [], missingPaths: [], reason: 'bundle emitted a file outside its manifest' };
  }
  const current = new Map(existingFiles.map((file) => [file.path, file]));
  for (const file of frames.files) {
    if (!preservesRequiredSymbols(preservationBrief, current.get(file.path), file.content)) {
      return { status: 'invalid', contract, files: [], missingPaths: [], reason: `bundle dropped required declarations from ${file.path}` };
    }
  }
  const security = scanProjectFiles(frames.files as ProjectFile[]);
  if (security.blocked || containsHighConfidenceSecret(frames.files)) {
    return { status: 'invalid', contract, files: [], missingPaths: [], reason: 'bundle contains a blocked secret or invalid manifest' };
  }
  const byPath = new Map(frames.files.map((file) => [file.path.toLowerCase(), file]));
  const missingPaths = contract.files.filter((file) => !byPath.has(file.path.toLowerCase())).map((file) => file.path);
  const ordered = contract.files.flatMap((file) => byPath.get(file.path.toLowerCase()) ?? []);
  return {
    status: missingPaths.length ? 'partial' : 'complete',
    contract,
    files: ordered,
    missingPaths,
    reason: missingPaths.length ? `bundle is missing ${missingPaths.length} file(s)` : 'complete coherent bundle',
  };
}

/** Parse continuation frames against an already validated manifest. */
export function mergeCoherentContinuation(
  initial: ParsedCoherentBundle,
  continuationText: string,
  existingFiles: readonly ProjectFile[] = [],
  preservationBrief = '',
): ParsedCoherentBundle {
  if (!initial.contract || initial.status !== 'partial') return initial;
  const normalizedContinuation = continuationText.includes(FILE_OPEN)
    ? continuationText
    : (jsonFilesToFrames(extractJson(continuationText)) ?? continuationText);
  const parsed = parseFileFrames(normalizedContinuation);
  if (parsed.invalidReason) return { ...initial, status: 'invalid', reason: parsed.invalidReason };
  const expected = new Set(initial.missingPaths.map((path) => path.toLowerCase()));
  if (!parsed.files.length || parsed.files.some((file) => !expected.has(file.path.toLowerCase()))) {
    return { ...initial, status: 'invalid', reason: 'continuation emitted an unexpected file' };
  }
  const combinedFrames = [...initial.files, ...parsed.files];
  const duplicate = new Set<string>();
  for (const file of combinedFrames) {
    const folded = file.path.toLowerCase();
    if (duplicate.has(folded)) return { ...initial, status: 'invalid', reason: `duplicate file frame for ${file.path}` };
    duplicate.add(folded);
  }
  const current = new Map(existingFiles.map((file) => [file.path, file]));
  for (const file of parsed.files) {
    if (!preservesRequiredSymbols(preservationBrief, current.get(file.path), file.content)) {
      return { ...initial, status: 'invalid', reason: `continuation dropped required declarations from ${file.path}` };
    }
  }
  const security = scanProjectFiles(combinedFrames as ProjectFile[]);
  if (security.blocked || containsHighConfidenceSecret(combinedFrames)) {
    return { ...initial, status: 'invalid', reason: 'continuation contains a blocked secret or invalid manifest' };
  }
  const byPath = new Map(combinedFrames.map((file) => [file.path.toLowerCase(), file]));
  const missingPaths = initial.contract.files.filter((file) => !byPath.has(file.path.toLowerCase())).map((file) => file.path);
  return {
    status: missingPaths.length ? 'partial' : 'complete',
    contract: initial.contract,
    files: initial.contract.files.flatMap((file) => byPath.get(file.path.toLowerCase()) ?? []),
    missingPaths,
    reason: missingPaths.length ? `continuation is missing ${missingPaths.length} file(s)` : 'complete coherent bundle after continuation',
  };
}

const BUNDLE_SYSTEM = `You are Xroga's software implementation agent. Produce one coherent project change, not one reply per file.

Return exactly one JSON object with this shape and no markdown or prose:
{"version":1,"summary":"...","project":{"runtime":"...","framework":null,"packageManager":null,"buildCommands":[],"testCommands":[],"runCommand":null},"sharedContracts":["..."],"files":[{"path":"relative/path","operation":"upsert","purpose":"..."}],"fileContents":[{"path":"relative/path","operation":"upsert","content":"complete raw file contents"}]}

Rules:
- Put the complete project contract and files manifest before fileContents. Keep fileContents as the final property.
- Keep all routes, exports, data models, component interfaces, commands and tests consistent with sharedContracts.
- Every manifest file must have exactly one matching complete fileContents value. No duplicate or conflicting paths.
- Paths are relative, never absolute, never contain '..', and never address .git.
- Use only upsert operations. Preserve unrelated existing behavior.
- Include complete working source, manifests and relevant tests. No TODOs or placeholders.
- Environment variables may be referenced by NAME only. Never include credentials or secret values.
- Prefer a compact maintainable implementation that fits in one response.`;

const CONTINUATION_SYSTEM = `Continue an already validated Xroga project bundle.
Return exactly one JSON object with this shape and no prose or markdown:
{"fileContents":[{"path":"relative/path","operation":"upsert","content":"complete raw file contents"}]}
Return exactly the requested missing files. Do not repeat completed files.`;

function repositoryContext(existingFiles: readonly ProjectFile[], objective: string): string {
  if (!existingFiles.length) return 'This is a new project. There are no existing files.';
  const focused = prepareFocusedContext({ files: [...existingFiles], objective, maximumTokens: COHERENT_CONTEXT_TOKENS });
  const paths = existingFiles.map((file) => file.path).join('\n');
  const bodies = focused.files.map((file) => `<file path="${file.path}">\n${file.content}\n</file>`).join('\n\n');
  const summaries = focused.summaries.map((item) => `${item.path}: ${item.summary}`).join('\n');
  return [
    `Existing repository paths (${existingFiles.length}):\n${paths}`,
    bodies ? `Relevant current files (secret values redacted):\n${bodies}` : '',
    summaries ? `Other relevant file summaries:\n${summaries}` : '',
  ].filter(Boolean).join('\n\n');
}

const defaultCompletion: CoherentCompletionFn = async (modelId, messages, opts) => {
  const startedAt = Date.now();
  let firstOutputMs: number | null = null;
  const attempted = await runBuilderAttempt(
    ({ signal, onActivity, onToken }) => chatCompletionStream(modelId as ModelId, messages, {
      maxTokens: opts.maxTokens,
      temperature: opts.temperature,
      signal,
      onActivity,
      // The semantic planner has already resolved the implementation. This call must
      // spend its bounded output budget on the structured project bundle, not a private
      // reasoning trace. openaiCompat applies this only where the provider documents it.
      reasoningMode: 'none',
      json: opts.json,
      onDelta: (delta) => {
        if (firstOutputMs === null) firstOutputMs = Date.now() - startedAt;
        onToken(delta);
      },
    }),
    {
      budget: {
        firstTokenMs: COHERENT_FIRST_TOKEN_TIMEOUT_MS,
        generationMs: COHERENT_ACTIVE_TIMEOUT_MS,
        maxOutputChars: 1_500_000,
      },
      signal: opts.signal,
    },
  );
  return { ...attempted.value, firstOutputMs };
};

function inputChars(messages: readonly ChatMessage[]): number {
  return messages.reduce((total, message) => total + (typeof message.content === 'string' ? message.content.length : JSON.stringify(message.content).length), 0);
}

async function callWithTelemetry(input: {
  modelId: string;
  stage: BuilderModelCallTelemetry['stage'];
  purpose: string;
  messages: ChatMessage[];
  maxTokens: number;
  complete: CoherentCompletionFn;
  retryReason?: string | null;
  signal?: AbortSignal;
}): Promise<{ reply: CoherentCompletionResult; record: BuilderModelCallTelemetry }> {
  const startedAt = Date.now();
  const chars = inputChars(input.messages);
  try {
    const reply = await input.complete(input.modelId, input.messages, {
      maxTokens: input.maxTokens,
      temperature: 0.15,
      json: true,
      signal: input.signal,
    });
    const inputTokens = reply.inputTokens ?? estimateTokens(input.messages.map((message) => typeof message.content === 'string' ? message.content : JSON.stringify(message.content)).join('\n'));
    const outputTokens = reply.outputTokens;
    return {
      reply,
      record: {
        stage: input.stage, modelId: input.modelId, purpose: input.purpose,
        inputChars: chars, estimatedInputTokens: Math.max(1, Math.ceil(chars / 4)), outputChars: reply.text.length,
        inputTokens, outputTokens, queueWaitMs: 0, activeDurationMs: Date.now() - startedAt,
        firstOutputMs: reply.firstOutputMs ?? null, completionStatus: 'completed', failure: null,
        retryReason: input.retryReason ?? null,
        approximateCostUsd: costUsdForTokens(input.modelId as ModelId, inputTokens, outputTokens), outputUsed: false,
        valueClassification: 'FAILED_BEFORE_VALUE',
      },
    };
  } catch (error) {
    const failure = classifyBuilderFailure(error);
    const record: BuilderModelCallTelemetry = {
      stage: input.stage, modelId: input.modelId, purpose: input.purpose,
      inputChars: chars, estimatedInputTokens: Math.max(1, Math.ceil(chars / 4)), outputChars: 0,
      inputTokens: 0, outputTokens: 0, queueWaitMs: 0, activeDurationMs: Date.now() - startedAt,
      firstOutputMs: null, completionStatus: 'failed', failure, retryReason: input.retryReason ?? null,
      approximateCostUsd: 0, outputUsed: false,
      valueClassification: failure === 'invalid_structured_output' || failure === 'prose_only_response'
        ? 'PROVIDER_UNSUITABLE'
        : 'FAILED_BEFORE_VALUE',
    };
    throw Object.assign(error instanceof Error ? error : new Error(String(error)), { builderTelemetry: record });
  }
}

function withUsage(record: BuilderModelCallTelemetry, outputUsed: boolean, retryReason?: string | null): BuilderModelCallTelemetry {
  return {
    ...record,
    outputUsed,
    retryReason: retryReason ?? record.retryReason,
    valueClassification: outputUsed
      ? (record.stage === 'continuation' ? 'RETRY_WITH_NEW_EVIDENCE' : 'NECESSARY_VALUE')
      : record.valueClassification,
  };
}

export async function implementCoherently(input: {
  brief: string;
  originalRequest?: string;
  candidates: readonly ModelCandidate[];
  existingFiles?: readonly ProjectFile[];
  complete?: CoherentCompletionFn;
  onTelemetry?: (record: BuilderModelCallTelemetry) => void;
  onProgress?: (event: { stage: 'bundle' | 'continuation'; modelId?: string; missing?: number }) => void;
  signal?: AbortSignal;
}): Promise<readonly ProjectFile[]> {
  const complete = input.complete ?? defaultCompletion;
  const existingFiles = input.existingFiles ?? [];
  const objective = input.originalRequest?.trim()
    ? `${input.originalRequest.trim()}\n\nImplementation plan:\n${input.brief}`
    : input.brief;
  const context = repositoryContext(existingFiles, objective);
  const failures: string[] = [];
  const unavailable = new Set<string>();
  const attemptedProviders = new Set<string>();
  let realAttempts = 0;
  let protocolCorrection: string | null = null;

  // Keep the router's primary choice. For its single independent fallback, prefer an
  // approved transport that documents a direct-output/no-reasoning request. A provider
  // without that control remains eligible only when no controlled alternative exists;
  // otherwise it can spend the entire bounded window on private reasoning and never emit
  // the file protocol this stage requires.
  const [primary, ...fallbacks] = input.candidates;
  const directOutputScore = (candidate: ModelCandidate): number => {
    const provider = MODELS[candidate.modelId as ModelId]?.provider;
    return provider && Object.keys(providerReasoningControls(provider, 'none')).length ? 0 : 1;
  };
  const candidates = primary
    ? [primary, ...fallbacks.map((candidate, index) => ({ candidate, index }))
      .sort((left, right) => directOutputScore(left.candidate) - directOutputScore(right.candidate) || left.index - right.index)
      .map(({ candidate }) => candidate)]
    : [];

  for (const candidate of candidates) {
    if (unavailable.has(candidate.modelId)) continue;
    const provider = MODELS[candidate.modelId as ModelId]?.provider ?? `unknown:${candidate.modelId}`;
    // The fallback budget is a provider budget, not a model-name budget. Two models on
    // one transport share the same outage, request-contract incompatibility and queue, so
    // spending both permitted attempts there is not a fallback at all.
    if (attemptedProviders.has(provider)) continue;
    if (realAttempts >= MAX_COHERENT_PROVIDER_ATTEMPTS) break;
    try {
      assertCodingModel(candidate.modelId, 'coherent universal implementation');
    } catch (error) {
      failures.push(`${candidate.modelId}: ${classifyBuilderFailure(error)}`);
      continue;
    }
    attemptedProviders.add(provider);
    realAttempts += 1;
    input.onProgress?.({ stage: 'bundle', modelId: candidate.modelId });
    const messages: ChatMessage[] = [
      { role: 'system', content: BUNDLE_SYSTEM },
      {
        role: 'user',
        content: [
          objective,
          context,
          protocolCorrection
            ? `Protocol correction from the previous bounded attempt:\n${protocolCorrection}\n` +
              'Return a complete full-file snapshot that fixes exactly this contract error.'
            : '',
        ].filter(Boolean).join('\n\n'),
      },
    ];
    try {
      const first = await callWithTelemetry({
        modelId: candidate.modelId,
        stage: 'implementation',
        purpose: 'produce one coherent project change contract and file bundle',
        messages,
        maxTokens: COHERENT_BUNDLE_MAX_TOKENS,
        complete,
        retryReason: realAttempts > 1 ? failures.at(-1) ?? 'primary route failed' : null,
        signal: input.signal,
      });
      let parsed = parseCoherentBundle(first.reply.text, existingFiles, objective);
      if (parsed.status === 'complete') {
        input.onTelemetry?.(withUsage(first.record, true));
        return parsed.files;
      }

      if (parsed.status === 'partial' && parsed.files.length && parsed.missingPaths.length) {
        input.onProgress?.({ stage: 'continuation', modelId: candidate.modelId, missing: parsed.missingPaths.length });
        const continuationMessages: ChatMessage[] = [
          { role: 'system', content: CONTINUATION_SYSTEM },
          {
            role: 'user',
            content:
              `Original objective:\n${objective}\n\nValidated shared contract:\n${JSON.stringify(parsed.contract)}\n\n` +
              `Completed files already retained:\n${parsed.files.map((file) => file.path).join('\n')}\n\n` +
              `Return these missing files only:\n${parsed.missingPaths.join('\n')}`,
          },
        ];
        let continuation: Awaited<ReturnType<typeof callWithTelemetry>>;
        try {
          continuation = await callWithTelemetry({
            modelId: candidate.modelId,
            stage: 'continuation',
            purpose: 'resume only the missing dependency-batch files from a validated bundle',
            messages: continuationMessages,
            maxTokens: COHERENT_CONTINUATION_MAX_TOKENS,
            complete,
            retryReason: parsed.reason,
            signal: input.signal,
          });
        } catch (error) {
          input.onTelemetry?.(withUsage(first.record, false, 'bounded continuation failed'));
          throw error;
        }
        parsed = mergeCoherentContinuation(parsed, continuation.reply.text, existingFiles, objective);
        if (parsed.status === 'complete') {
          input.onTelemetry?.(withUsage(first.record, true, 'partial bundle retained for bounded continuation'));
          input.onTelemetry?.(withUsage(continuation.record, true));
          return parsed.files;
        }
        input.onTelemetry?.(withUsage(first.record, false, parsed.reason));
        input.onTelemetry?.(withUsage(continuation.record, false, parsed.reason));
        failures.push(`${candidate.modelId}: ${parsed.reason}`);
        continue;
      }

      input.onTelemetry?.(withUsage(first.record, false, parsed.reason));
      failures.push(`${candidate.modelId}: ${parsed.reason}`);
      protocolCorrection = parsed.reason;
    } catch (error) {
      const telemetry = (error as { builderTelemetry?: BuilderModelCallTelemetry }).builderTelemetry;
      if (telemetry) input.onTelemetry?.(telemetry);
      const normalized = normalizeProviderError(error);
      if (normalized.retryable) unavailable.add(candidate.modelId);
      failures.push(`${candidate.modelId}: ${classifyBuilderFailure(error)}`);
    }
  }

  throw new CoherentImplementationError('No coherent implementation bundle completed within the bounded provider routes.', failures);
}
