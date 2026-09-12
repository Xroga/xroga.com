import type { ProjectFile } from '../patches.js';
import { redactSecrets } from '../../lib/truthfulExecution.js';

export const REPOSITORY_CHAT_EVIDENCE_MAX_BYTES = 160_000;
export const REPOSITORY_CHAT_EVIDENCE_MAX_FILES = 24;
const PER_FILE_MAX_BYTES = 48_000;

function safeEvidencePath(path: string): boolean {
  const segments = path.replace(/\\/g, '/').toLowerCase().split('/');
  return !segments.some((segment) =>
    (segment === '.env' || (segment.startsWith('.env.') && !['.env.example', '.env.sample', '.env.template'].includes(segment)))
    || /^(?:id_[a-z0-9_-]+|.*\.(?:pem|p12|pfx|key))$/.test(segment)
    || /^(?:credentials?|secrets?)\.(?:json|ya?ml|toml)$/.test(segment));
}

function relevance(file: ProjectFile, prompt: string): number {
  const path = file.path.replace(/\\/g, '/');
  const foldedPath = path.toLowerCase();
  const basename = foldedPath.split('/').pop() ?? foldedPath;
  const foldedPrompt = prompt.toLowerCase();
  let score = 0;
  if (foldedPrompt.includes(foldedPath)) score += 10_000;
  else if (basename.length >= 3 && foldedPrompt.includes(basename)) score += 8_000;
  if (/(^|\/)readme(?:\.|$)/i.test(path)) score += 1_200;
  if (/(^|\/)(?:package\.json|pyproject\.toml|cargo\.toml|go\.mod|requirements\.txt)$/i.test(path)) score += 1_000;
  if (/(^|\/)(?:tests?|__tests__)(\/|$)|(?:^|[._-])test(?:[._-]|$)|\.spec\./i.test(path)) score += 800;
  return score;
}

/**
 * Produces a bounded, deterministic source snapshot for repository questions.
 * Exact user-mentioned paths lead, followed by manifests, documentation, tests,
 * then smaller files. No language or framework is assumed.
 */
export function selectRepositoryChatEvidence(
  files: readonly ProjectFile[],
  prompt: string,
  maxBytes = REPOSITORY_CHAT_EVIDENCE_MAX_BYTES,
): ProjectFile[] {
  const ranked = files
    .filter((file) => safeEvidencePath(file.path))
    .map((file, index) => ({ file, index, score: relevance(file, prompt) }))
    .sort((a, b) => b.score - a.score
      || Buffer.byteLength(a.file.content, 'utf8') - Buffer.byteLength(b.file.content, 'utf8')
      || a.index - b.index);
  const selected: ProjectFile[] = [];
  let used = 0;
  for (const { file } of ranked) {
    if (selected.length >= REPOSITORY_CHAT_EVIDENCE_MAX_FILES) break;
    const redacted = redactSecrets(file.content);
    const content = Buffer.byteLength(redacted, 'utf8') > PER_FILE_MAX_BYTES
      ? `${Buffer.from(redacted, 'utf8').subarray(0, PER_FILE_MAX_BYTES).toString('utf8')}\n[truncated by repository evidence budget]`
      : redacted;
    const bytes = Buffer.byteLength(file.path, 'utf8') + Buffer.byteLength(content, 'utf8');
    if (used + bytes > maxBytes) continue;
    selected.push({ path: file.path, content });
    used += bytes;
  }
  return selected;
}
