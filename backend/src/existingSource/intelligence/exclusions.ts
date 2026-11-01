/**
 * What the code map never fetches or indexes. Decided from the PATH and the tree entry's size and mode alone, before any blob is
 * requested, so an excluded file costs nothing and a credential file's content is never read.
 */
import { isSensitivePath } from '../sensitivePaths.js';
import { languageOf } from './languageAdapters.js';
import type { ExclusionReason } from './types.js';

/** Largest file the map will fetch and analyse. A larger source file is listed but not parsed. */
export const MAX_INDEXED_FILE_BYTES = 256 * 1024;

const VENDORED = /(?:^|\/)(?:node_modules|vendor|third_party|bower_components|\.yarn|\.pnpm-store|\.venv|venv|site-packages|__pycache__|\.git|\.idea|\.vscode|Pods)(?:\/|$)/;
const BUILD_OUTPUT = /(?:^|\/)(?:dist|build|out|\.next|\.nuxt|\.svelte-kit|\.turbo|\.cache|coverage|target|\.gradle|\.terraform|storybook-static)(?:\/|$)/;
const GENERATED_NAME = /(?:\.min\.(?:js|css)|\.bundle\.js|\.map|\.snap|\.pb\.go|_pb2(?:_grpc)?\.py|\.generated\.[a-z]+|\.g\.dart)$/;
const LOCKFILES = new Set(['package-lock.json', 'yarn.lock', 'pnpm-lock.yaml', 'npm-shrinkwrap.json', 'bun.lockb', 'go.sum', 'poetry.lock', 'Pipfile.lock', 'Cargo.lock', 'composer.lock', 'Gemfile.lock', 'uv.lock']);
const BINARY_EXT = /\.(?:png|jpe?g|gif|webp|ico|bmp|tiff?|pdf|zip|gz|tgz|tar|bz2|xz|7z|rar|exe|dll|so|dylib|bin|wasm|class|jar|woff2?|ttf|otf|eot|mp[34]|wav|avi|mov|webm|db|sqlite3?|pyc|o|a|lib|node|psd|ai|sketch|dmg|iso)$/i;
/** Manifests and configuration the map reads for package boundaries even though they are data files. */
const MANIFESTS = new Set(['package.json', 'tsconfig.json', 'go.mod', 'pyproject.toml', 'setup.py', 'setup.cfg', 'requirements.txt']);

export interface TreeFacts { readonly path: string; readonly mode?: string; readonly type?: string; readonly size?: number | null }

export function isManifest(path: string): boolean {
  return MANIFESTS.has(path.slice(path.lastIndexOf('/') + 1));
}

/** The reason a tree entry is not indexed, or null when it should be. */
export function exclusionFor(entry: TreeFacts): ExclusionReason | null {
  const { path } = entry;
  if (entry.type === 'tree') return null; // directories are structure, not files
  if (entry.mode === '120000') return 'symlink';
  if (entry.type === 'commit') return 'submodule';
  if (isSensitivePath(path)) return 'sensitive';
  if (VENDORED.test(path)) return 'vendored';
  if (BUILD_OUTPUT.test(path)) return 'generated';
  const base = path.slice(path.lastIndexOf('/') + 1);
  if (LOCKFILES.has(base)) return 'lockfile';
  if (GENERATED_NAME.test(base)) return 'generated';
  if (BINARY_EXT.test(base)) return 'binary';
  if (typeof entry.size === 'number' && entry.size > MAX_INDEXED_FILE_BYTES) return 'too_large';
  // a file of an unknown type is not worth a request; manifests and known languages are
  if (!isManifest(path) && !languageOf(path)) return 'unsupported_type';
  return null;
}

/** A Git LFS pointer stands in for a large asset: it is a few lines of text and must not be treated as source. */
export function isLfsPointer(content: string): boolean {
  return content.length < 400 && content.startsWith('version https://git-lfs.github.com/spec/');
}
