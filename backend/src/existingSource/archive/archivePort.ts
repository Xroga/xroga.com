/**
 * An imported ZIP, presented through the same source port as a GitHub repository, so linking, reading, the code map and later
 * editing all use one code path. The archive is immutable: its "commit" is a digest of its contents, the "branch" is `archive`,
 * and there is no account that can lose access or move the branch. Only the owner's own archive is ever served.
 */
import { createHash } from 'node:crypto';
import { ProviderError } from '../types.js';
import type { BranchHead, GitHubSourcePort, RawBlob, RawGitTree, RawGitTreeEntry, RepositorySummary, ViewerAccount } from '../provider.js';

export interface ArchiveFile { readonly path: string; readonly text: string | null; readonly size: number }

export interface ArchiveRecord {
  readonly number: string;
  readonly ownerUserId: string;
  readonly name: string;
  readonly digest: string;
  readonly files: readonly ArchiveFile[];
  readonly createdAt: string;
}

export const ARCHIVE_BRANCH = 'archive';
const sha1 = (value: string | Buffer): string => createHash('sha1').update(value).digest('hex');
export const gitBlobSha = (text: string): string => { const body = Buffer.from(text, 'utf8'); return sha1(Buffer.concat([Buffer.from(`blob ${body.length}\0`), body])); };

/** The content digest of a file set: stable under ordering, changes with any path or byte. */
export function archiveDigest(files: readonly { path: string; text: string | null; size: number }[]): string {
  const h = createHash('sha256');
  for (const f of [...files].sort((a, b) => (a.path < b.path ? -1 : 1))) h.update(`${f.path}\0${f.text === null ? `omitted:${f.size}` : gitBlobSha(f.text)}\0`);
  return h.digest('hex');
}

export function archiveCommitSha(record: Pick<ArchiveRecord, 'digest'>): string { return record.digest.slice(0, 40); }

export class ArchivePort implements GitHubSourcePort {
  private readonly trees = new Map<string, string>(); // tree sha -> directory path
  private readonly blobs = new Map<string, string>(); // blob sha -> text
  private readonly rootSha: string;
  private readonly byDir = new Map<string, RawGitTreeEntry[]>();

  constructor(private readonly record: ArchiveRecord, private readonly userId: string) {
    this.rootSha = sha1(`tree:${archiveCommitSha(record)}:`);
    this.trees.set(this.rootSha, '');
    const dirs = new Set<string>(['']);
    for (const f of record.files) {
      const parts = f.path.split('/');
      for (let i = 1; i < parts.length; i++) dirs.add(parts.slice(0, i).join('/'));
    }
    const treeShaOf = (dir: string) => (dir === '' ? this.rootSha : sha1(`tree:${archiveCommitSha(record)}:${dir}`));
    for (const d of dirs) this.trees.set(treeShaOf(d), d);
    const add = (dir: string, entry: RawGitTreeEntry) => { (this.byDir.get(dir) ?? this.byDir.set(dir, []).get(dir)!).push(entry); };
    for (const d of dirs) if (d !== '') add(d.includes('/') ? d.slice(0, d.lastIndexOf('/')) : '', { path: d.slice(d.lastIndexOf('/') + 1), mode: '040000', type: 'tree', sha: treeShaOf(d) });
    for (const f of record.files) {
      const dir = f.path.includes('/') ? f.path.slice(0, f.path.lastIndexOf('/')) : '';
      // files whose content was not kept (binary, credentials, oversize) are listed but have no blob
      const sha = f.text === null ? sha1(`omitted:${archiveCommitSha(record)}:${f.path}`) : gitBlobSha(f.text);
      if (f.text !== null) this.blobs.set(sha, f.text);
      add(dir, { path: f.path.slice(f.path.lastIndexOf('/') + 1), mode: '100644', type: 'blob', sha, size: f.size });
    }
  }

  private check(id: string): void { if (id !== this.record.number) throw new ProviderError('not_found', 'not found'); }

  async viewer(): Promise<ViewerAccount> { return { id: this.userId, login: 'zip-import' }; }
  async listRepositories() { return { repositories: [] as RepositorySummary[], hasMore: false }; }
  async getRepository(id: string): Promise<RepositorySummary> {
    this.check(id);
    return { id, fullName: `zip/${this.record.name}`, ownerId: this.record.ownerUserId, ownerLogin: 'zip-import', ownerType: 'User', private: true, archived: false, defaultBranch: ARCHIVE_BRANCH, permissions: { pull: true, push: false, admin: false }, updatedAt: this.record.createdAt };
  }
  async getBranchHead(id: string, branch: string): Promise<BranchHead | null> { this.check(id); return branch === ARCHIVE_BRANCH ? { commitSha: archiveCommitSha(this.record), protected: false } : null; }
  async getCommitTreeSha(id: string, commitSha: string): Promise<string | null> { this.check(id); return commitSha === archiveCommitSha(this.record) ? this.rootSha : null; }
  async getTree(id: string, treeSha: string, recursive: boolean): Promise<RawGitTree | null> {
    this.check(id);
    const dir = this.trees.get(treeSha);
    if (dir === undefined) return null;
    if (!recursive) return { sha: treeSha, tree: (this.byDir.get(dir) ?? []).map((e) => ({ ...e })), truncated: false };
    const out: RawGitTreeEntry[] = [];
    const walk = (d: string) => { for (const e of this.byDir.get(d) ?? []) { const full = d ? `${d}/${e.path}` : e.path!; out.push({ ...e, path: full }); if (e.type === 'tree') walk(full); } };
    walk(dir);
    return { sha: treeSha, tree: out, truncated: false };
  }
  async getBlob(id: string, blobSha: string): Promise<RawBlob | null> {
    this.check(id);
    const text = this.blobs.get(blobSha);
    return text === undefined ? null : { content: Buffer.from(text, 'utf8').toString('base64'), encoding: 'base64', size: Buffer.byteLength(text) };
  }
}
