/**
 * Incremental implementation: a file plan, then one file at a time.
 *
 * The single-completion approach failed in production against every available coding model
 * (run `05769971`): GLM returned nothing, Kimi timed out, and both DeepSeek models produced
 * output that would not parse. The shape of that failure matters more than the count. A
 * whole project — manifest, sources, tests, README — was requested as one JSON object under
 * a 16k output ceiling, and JSON is the worst possible container for it:
 *
 *   - every newline, quote and backslash in real source is escaped, so the payload is far
 *     larger than the code it carries;
 *   - a reply cut off at the ceiling ends mid-string, and `JSON.parse` then rejects the
 *     *entire* response — nine finished files are lost because the tenth was clipped;
 *   - one timeout loses everything, because nothing was recoverable before the end.
 *
 * Raising the token limit only moves that cliff. This removes it: a small manifest call
 * decides the file list, then each file is generated in its own call and returned as raw
 * text with no escaping at all. A file that fails now costs one file, and the failure names
 * which one.
 *
 * This is the mechanism §11 asks for — implementation that is incremental rather than a
 * single whole-project response — at the level the current architecture can support today.
 * It is not yet the persisted task graph of §18; it is the step that makes a build possible
 * while that is built.
 */

import { chatCompletion, type ChatMessage } from '../ai/openaiCompat.js';
import { assertCodingModel } from '../ai/providerPolicy.js';
import type { ProjectFile } from '../ai/patches.js';

/** Ceiling on files per project. A runaway manifest is a cost incident, not a big build. */
export const MAX_PLANNED_FILES = 24;

/**
 * Output ceiling for one file.
 *
 * Sized for a reasoning model rather than the file. GLM and the DeepSeek v4 family emit
 * their thinking into a separate `reasoning_content` field that is billed against the same
 * output budget, so a ceiling chosen for the source alone can be entirely consumed before
 * the answer starts — which is what produced "empty completion" for every GLM attempt in
 * production. One source file rarely needs more than a couple of thousand tokens; the rest
 * is headroom for the model to think first.
 */
export const PER_FILE_MAX_TOKENS = 16_000;

/**
 * Output ceiling for the manifest.
 *
 * Only paths and one-line purposes, but the same reasoning-budget argument applies: the
 * planning step is where a model is most likely to deliberate.
 */
export const MANIFEST_MAX_TOKENS = 8_000;

export interface PlannedFile {
  readonly path: string;
  readonly purpose: string;
}

export interface ModelCandidate {
  readonly modelId: string;
}

const MANIFEST_SYSTEM = `You are planning the file list for a software project.

Return JSON only, no prose and no markdown fence:
{"files":[{"path":"relative/path","purpose":"one line"}]}

Rules:
- List every file the project needs: manifest, sources, tests, README, configuration.
- Paths are relative. Never absolute, never containing "..".
- Do not write any file contents here. Paths and purposes only.
- Order the list so files a reader would need first come first.`;

const FILE_SYSTEM = `You are writing exactly one file of a software project.

Return the raw file contents and nothing else. No markdown fence, no JSON wrapper, no
commentary before or after. The first character of your reply is the first character of the
file.

Rules:
- The file must be complete and syntactically valid. No placeholders, no TODO stubs.
- Honour the language, framework and architecture the brief states.
- Write only the file you are asked for.`;

/** Paths that would escape the repository or address git internals. */
function safePath(path: unknown): path is string {
  if (typeof path !== 'string') return false;
  const trimmed = path.trim().replace(/\\/g, '/');
  if (!trimmed || trimmed.startsWith('/') || /^[a-zA-Z]:\//.test(trimmed)) return false;
  const segments = trimmed.split('/');
  return !segments.some((segment) => segment === '..' || segment === '.git' || segment === '');
}

export function parseFilePlan(text: string): readonly PlannedFile[] {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const raw = (fenced ? fenced[1] : text).trim();
  try {
    const parsed = JSON.parse(raw) as { files?: Array<{ path?: unknown; purpose?: unknown }> };
    if (!Array.isArray(parsed.files)) return [];
    return parsed.files
      .filter((entry) => safePath(entry?.path))
      .slice(0, MAX_PLANNED_FILES)
      .map((entry) => ({
        path: String(entry.path).trim().replace(/\\/g, '/'),
        purpose: typeof entry.purpose === 'string' ? entry.purpose : '',
      }));
  } catch {
    return [];
  }
}

/**
 * Strips a fence a model added despite being asked not to.
 *
 * Models wrap code in fences habitually. Refusing such a reply would fail a build over
 * formatting, so the fence is removed when it encloses the whole reply — and only then,
 * since a fence in the middle is legitimate content in a README.
 */
export function stripCodeFence(text: string): string {
  const trimmed = text.trim();
  const match = trimmed.match(/^```[a-zA-Z0-9_-]*\n([\s\S]*)\n```$/);
  return match ? match[1]! : trimmed;
}

export class IncrementalImplementationError extends Error {
  readonly code = 'INCREMENTAL_IMPLEMENTATION_FAILED' as const;
  readonly failures: readonly string[];
  constructor(message: string, failures: readonly string[]) {
    super(message);
    this.name = 'IncrementalImplementationError';
    this.failures = failures;
  }
}

export interface CompletionFn {
  (modelId: string, messages: ChatMessage[], opts: { maxTokens: number; temperature: number; json?: boolean }): Promise<{
    text: string;
    finishReason?: string | null;
    outputTokens: number;
  }>;
}

const defaultCompletion: CompletionFn = (modelId, messages, opts) =>
  chatCompletion(modelId as Parameters<typeof chatCompletion>[0], messages, opts);

/**
 * Runs one call across the ranked candidates, returning the first usable reply.
 *
 * Truncation is reported separately from a malformed or empty reply throughout, because the
 * two need opposite responses and reporting them identically is what sent the previous
 * production diagnosis in the wrong direction.
 */
async function completeWithFallback(input: {
  candidates: readonly ModelCandidate[];
  messages: ChatMessage[];
  maxTokens: number;
  json?: boolean;
  label: string;
  usable: (text: string) => boolean;
  complete: CompletionFn;
}): Promise<{ text: string; modelId: string }> {
  const failures: string[] = [];
  for (const candidate of input.candidates) {
    try {
      assertCodingModel(candidate.modelId, `universal ${input.label}`);
      const reply = await input.complete(candidate.modelId, input.messages, {
        maxTokens: input.maxTokens,
        temperature: 0.2,
        ...(input.json ? { json: true } : {}),
      });
      // Truncation is disqualifying on its own, before any content check. A clipped file is
      // still non-empty — `fn main() { prin` passes every emptiness test — so judging it by
      // content alone accepts a half-written source file and commits it as though it were
      // complete. That is the silent-success failure this whole path exists to avoid, and
      // it is worse than an outright refusal because the repository looks fine until it is
      // built.
      const truncated = reply.finishReason === 'length';
      if (!truncated && input.usable(reply.text)) return { text: reply.text, modelId: candidate.modelId };
      failures.push(
        truncated
          ? `${candidate.modelId} was cut off at the ${input.maxTokens}-token ceiling after ${reply.outputTokens} tokens`
          : `${candidate.modelId} returned ${reply.text.trim() ? 'an unusable reply' : 'an empty completion'}`,
      );
    } catch (error) {
      failures.push(`${candidate.modelId} failed: ${(error as Error).message}`);
    }
  }
  throw new IncrementalImplementationError(
    `no capable model completed ${input.label} — ${failures.join('; ')}`,
    failures,
  );
}

/**
 * Generates a project as a plan followed by one call per file.
 *
 * A partial result is never returned. A project missing the one file that failed would
 * build into a repository that does not compile, and the commit would look like a success —
 * so the whole implementation is refused, naming the file and the reason.
 */
export async function implementIncrementally(input: {
  brief: string;
  candidates: readonly ModelCandidate[];
  complete?: CompletionFn;
  onProgress?: (event: { stage: 'plan' | 'file'; path?: string; index?: number; total?: number }) => void;
}): Promise<readonly ProjectFile[]> {
  const complete = input.complete ?? defaultCompletion;

  input.onProgress?.({ stage: 'plan' });
  const planReply = await completeWithFallback({
    candidates: input.candidates,
    messages: [
      { role: 'system', content: MANIFEST_SYSTEM },
      { role: 'user', content: input.brief },
    ],
    maxTokens: MANIFEST_MAX_TOKENS,
    json: true,
    label: 'the file plan',
    usable: (text) => parseFilePlan(text).length > 0,
    complete,
  });

  const plan = parseFilePlan(planReply.text);
  const manifest = plan.map((entry) => `${entry.path} — ${entry.purpose}`).join('\n');

  const files: ProjectFile[] = [];
  for (const [index, entry] of plan.entries()) {
    input.onProgress?.({ stage: 'file', path: entry.path, index: index + 1, total: plan.length });
    const reply = await completeWithFallback({
      candidates: input.candidates,
      messages: [
        { role: 'system', content: FILE_SYSTEM },
        {
          role: 'user',
          content:
            `${input.brief}\n\n` +
            `The complete file list for this project:\n${manifest}\n\n` +
            `Write exactly this one file: ${entry.path}\n` +
            `Its purpose: ${entry.purpose}`,
        },
      ],
      maxTokens: PER_FILE_MAX_TOKENS,
      label: `file ${entry.path}`,
      // A file that is only whitespace is a failure worth falling back on: an empty source
      // file commits cleanly and breaks the build later, which is harder to diagnose.
      usable: (text) => stripCodeFence(text).trim().length > 0,
      complete,
    });
    files.push({ path: entry.path, content: stripCodeFence(reply.text) });
  }

  if (!files.length) {
    throw new IncrementalImplementationError('the file plan was empty, so nothing was generated', []);
  }
  return files;
}
