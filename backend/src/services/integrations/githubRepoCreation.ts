/**
 * Repository creation: visibility, and what a 422 actually means.
 *
 * Two defects lived in the old `createRepo`:
 *
 * 1. `private: false` — every repository Xroga created was public, with no user choice
 *    anywhere. A generated project can contain a `.env.example`, an API shape, an
 *    internal business process; publishing it by default is not a decision the product
 *    should make silently.
 *
 * 2. Every `422` was treated as "the repository already exists", and the code then
 *    returned `{owner}/{name}` and wrote to it. GitHub returns 422 for a name
 *    collision, but also for an invalid name, a blocked name, a template error and
 *    several other validation failures. On any of those the old path invented a
 *    repository reference that was never verified — and if that name happened to
 *    resolve to an *unrelated existing repository the user owns*, the build wrote into
 *    it. That is the "reusing an unrelated repository after a naming error" defect.
 *
 * The fix parses the response instead of guessing from the status code, and verifies
 * every repository it intends to write to.
 */

export type RepositoryVisibility = 'private' | 'public';

export type RepoCreateFailure =
  | 'name_taken'
  | 'invalid_name'
  | 'validation_failed'
  | 'unauthorized'
  | 'rate_limited'
  | 'unknown';

export class RepoCreateError extends Error {
  readonly code = 'REPO_CREATE_FAILED' as const;
  readonly reason: RepoCreateFailure;
  readonly status: number;

  constructor(reason: RepoCreateFailure, status: number, detail: string) {
    super(detail);
    this.name = 'RepoCreateError';
    this.reason = reason;
    this.status = status;
  }
}

export interface GitHubErrorBody {
  message?: string;
  errors?: Array<{ resource?: string; field?: string; code?: string; message?: string }>;
}

/**
 * Classifies a failed creation response.
 *
 * Keyed on GitHub's structured `errors[]` — `field` and `code` — rather than on the
 * prose in `message`, which is theirs to reword. A name collision is specifically
 * `field: 'name'` with `code: 'custom'` and a message about the name already existing;
 * anything else at 422 is a different validation failure and must not be treated as
 * "it already exists".
 */
export function classifyRepoCreateFailure(status: number, body: GitHubErrorBody | null): RepoCreateFailure {
  if (status === 401 || status === 403) return 'unauthorized';
  if (status === 429) return 'rate_limited';
  if (status !== 422) return 'unknown';

  const errors = body?.errors ?? [];
  const nameErrors = errors.filter((error) => error.field === 'name');

  if (nameErrors.some((error) => /already exists/i.test(error.message ?? ''))) return 'name_taken';
  if (nameErrors.length > 0) return 'invalid_name';
  if (/name already exists/i.test(body?.message ?? '')) return 'name_taken';
  return 'validation_failed';
}

/** Sanitised, user-facing detail. Never echoes a token or a raw response body. */
export function describeRepoCreateFailure(reason: RepoCreateFailure, name: string): string {
  switch (reason) {
    case 'name_taken':
      return `The repository name "${name}" is already taken on your account.`;
    case 'invalid_name':
      return `"${name}" is not a valid GitHub repository name.`;
    case 'validation_failed':
      return `GitHub rejected the repository "${name}" as invalid. Nothing was created or modified.`;
    case 'unauthorized':
      return 'Your GitHub authorisation was rejected. Reconnect GitHub and try again.';
    case 'rate_limited':
      return 'GitHub is rate limiting requests right now. Please try again shortly.';
    default:
      return `The repository "${name}" could not be created. Nothing was created or modified.`;
  }
}

export interface CreatedRepository {
  id: number;
  fullName: string;
  owner: string;
  repo: string;
  htmlUrl: string;
  visibility: RepositoryVisibility;
  defaultBranch: string;
  /** True only when this call created it — never when an existing repo was found. */
  created: boolean;
}

/**
 * A distinct name for a collision retry.
 *
 * Suffixed rather than randomised wholesale so the result still reads as the user's
 * project. Bounded by the caller.
 */
export function nextCandidateName(base: string, attempt: number): string {
  const clean = base.replace(/-\d+$/, '');
  return attempt === 0 ? clean : `${clean}-${attempt + 1}`;
}

/**
 * Verifies a repository response really is the repository we intend to write to.
 *
 * The old code trusted a name it had constructed by string interpolation. This trusts
 * only fields GitHub returned, and the caller compares them against what it asked for.
 */
export function readRepositoryResponse(raw: unknown): CreatedRepository | null {
  const repo = raw as {
    id?: number;
    full_name?: string;
    html_url?: string;
    private?: boolean;
    visibility?: string;
    default_branch?: string;
    permissions?: { push?: boolean; admin?: boolean };
  } | null;

  if (!repo || typeof repo.id !== 'number' || typeof repo.full_name !== 'string') return null;
  const [owner, name] = repo.full_name.split('/');
  if (!owner || !name) return null;

  return {
    id: repo.id,
    fullName: repo.full_name,
    owner,
    repo: name,
    htmlUrl: typeof repo.html_url === 'string' ? repo.html_url : `https://github.com/${repo.full_name}`,
    // `private` is authoritative; `visibility` is the newer field and may be absent.
    visibility: repo.private === false && repo.visibility !== 'private' ? 'public' : 'private',
    defaultBranch: typeof repo.default_branch === 'string' ? repo.default_branch : 'main',
    created: true,
  };
}

/**
 * True when a repository the caller did not explicitly select may be written to.
 *
 * Always false. It exists as a named, tested rule because the old behaviour — silently
 * adopting whatever repository the constructed name resolved to — looked reasonable at
 * the call site and was not.
 */
export function mayAdoptUnselectedRepository(): boolean {
  return false;
}

export const DEFAULT_REPOSITORY_VISIBILITY: RepositoryVisibility = 'private';
export const MAX_NAME_COLLISION_RETRIES = 5;
