/**
 * On-demand use of a public GitHub repository: fetch it at an exact commit into memory, hand its files (and any extra files the caller
 * supplies, such as a small script) to the isolated sandbox worker, run one command there, and return the real output and files.
 *
 * Nothing is installed or kept: the checkout exists only inside one worker request and is removed when it ends. The run has NO network
 * (the worker enforces and verifies this), so it can use the repository's own code and the language's standard library but cannot
 * install packages or fetch data; anything that needs the network belongs to a separately verified restricted-network stage.
 * Retrieval here uses the bounded public reader (public https only, no private ranges, size and time limits) against two GitHub hosts.
 */
import { gunzipSync } from 'node:zlib';
import { boundedPublicGet } from '../security/boundedPublicGet.js';
import type { ProjectFile } from '../ai/patches.js';
import { selectSandboxProvider } from './sandboxProviders.js';
import type { SandboxArtifact } from './sandboxTypes.js';

export class RepoRunError extends Error {
  constructor(readonly code: string, message: string) { super(message); this.name = 'RepoRunError'; }
}

const MAX_TARBALL_BYTES = 12 * 1024 * 1024;
const MAX_FILE_BYTES = 1024 * 1024;
const MAX_TOTAL_BYTES = 8 * 1024 * 1024;
const MAX_FILES = 2_000;
const COMMANDS = new Set(['python3', 'node', 'sh']);

export function parseRepositoryUrl(raw: string): { owner: string; repo: string } {
  const match = /^https:\/\/github\.com\/([A-Za-z0-9_.-]{1,100})\/([A-Za-z0-9_.-]{1,100}?)(?:\.git)?\/?$/.exec(raw.trim());
  if (!match || match[1] === '.' || match[2] === '.' || match[1] === '..' || match[2] === '..') throw new RepoRunError('REPO_URL_INVALID', 'Only a public https://github.com/OWNER/REPO address is supported.');
  return { owner: match[1], repo: match[2] };
}

/** A minimal tar reader: regular files only, with pax long-path support (GitHub archives use it). Never follows links. */
export function readTarball(tar: Buffer): Array<{ path: string; data: Buffer }> {
  const files: Array<{ path: string; data: Buffer }> = [];
  let offset = 0;
  let paxPath: string | undefined;
  const text = (start: number, length: number) => tar.toString('utf8', start, start + length).replace(/\0[\s\S]*$/, '');
  while (offset + 512 <= tar.length) {
    const start = offset;
    if (tar.subarray(start, start + 512).every(byte => byte === 0)) break;
    const size = parseInt(text(start + 124, 12).trim() || '0', 8);
    const type = String.fromCharCode(tar[start + 156] || 48);
    if (!Number.isFinite(size) || size < 0) throw new RepoRunError('REPO_ARCHIVE_INVALID', 'The repository archive is malformed.');
    const body = tar.subarray(start + 512, start + 512 + size);
    offset = start + 512 + Math.ceil(size / 512) * 512;
    if (type === 'x') {
      paxPath = /(?:^|\n)\d+ path=([^\n]*)\n/.exec(body.toString('utf8'))?.[1];
      continue;
    }
    if (type === 'g') continue;
    const prefix = text(start + 345, 155);
    const name = paxPath ?? (prefix ? `${prefix}/${text(start, 100)}` : text(start, 100));
    paxPath = undefined;
    if (type !== '0') continue; // directories, links and special files are never extracted
    const relative = name.split('/').slice(1).join('/'); // drop the archive's top directory
    if (!relative || relative.startsWith('.git/') || relative.split('/').includes('..') || relative.startsWith('/')) continue;
    files.push({ path: relative, data: Buffer.from(body) });
  }
  return files;
}

export function textFiles(entries: Array<{ path: string; data: Buffer }>): { files: ProjectFile[]; omitted: number } {
  const files: ProjectFile[] = [];
  let omitted = 0;
  let total = 0;
  for (const entry of entries) {
    if (files.length >= MAX_FILES || entry.data.length > MAX_FILE_BYTES || total + entry.data.length > MAX_TOTAL_BYTES || entry.data.includes(0)) { omitted++; continue; }
    total += entry.data.length;
    files.push({ path: entry.path, content: entry.data.toString('utf8') });
  }
  return { files, omitted };
}

async function getJson(url: string): Promise<unknown> {
  const got = await boundedPublicGet(url, { maxBytes: 200_000, timeoutMs: 15_000, maxRedirects: 2, allowHttpErrors: true });
  if (got.statusCode !== 200) throw new RepoRunError('REPO_NOT_FOUND', `GitHub answered ${got.statusCode} for that repository or version.`);
  return JSON.parse(got.bytes.toString('utf8'));
}

export interface RepoRunInput {
  url: string;
  ref?: string;
  command: string;
  args: string[];
  files?: ProjectFile[];
  timeoutMs?: number;
}

export interface RepoRunResult {
  repository: string;
  commit: string;
  filesSent: number;
  omittedFiles: number;
  exitCode: number | null;
  stdout: string;
  stderr: string;
  timedOut: boolean;
  durationMs: number;
  artifacts: readonly SandboxArtifact[];
  runtime: string;
}

export async function runRepository(input: RepoRunInput): Promise<RepoRunResult> {
  const { owner, repo } = parseRepositoryUrl(input.url);
  if (!COMMANDS.has(input.command)) throw new RepoRunError('REPO_COMMAND_UNSUPPORTED', 'The command must be python3, node or sh.');
  const ref = (input.ref ?? 'HEAD').trim();
  if (!/^[A-Za-z0-9._/-]{1,200}$/.test(ref) || ref.includes('..')) throw new RepoRunError('REPO_REF_INVALID', 'The version is not valid.');

  // The isolation must be available before anything is fetched or sent.
  const selected = await selectSandboxProvider();
  if (!selected.runtime) throw new RepoRunError('SANDBOX_UNAVAILABLE', selected.availability.detail ?? 'No isolated execution worker is available.');

  const commit = String((await getJson(`https://api.github.com/repos/${owner}/${repo}/commits/${encodeURIComponent(ref)}`) as { sha?: unknown })?.sha ?? '');
  if (!/^[0-9a-f]{40}$/.test(commit)) throw new RepoRunError('REPO_VERSION_UNRESOLVED', 'The exact version could not be determined.');

  const archive = await boundedPublicGet(`https://codeload.github.com/${owner}/${repo}/tar.gz/${commit}`, { maxBytes: MAX_TARBALL_BYTES, timeoutMs: 30_000, maxRedirects: 2, allowHttpErrors: true });
  if (archive.statusCode !== 200) throw new RepoRunError('REPO_ARCHIVE_UNAVAILABLE', `The repository archive could not be fetched (${archive.statusCode}).`);
  const { files, omitted } = textFiles(readTarball(gunzipSync(archive.bytes, { maxOutputLength: 64 * 1024 * 1024 })));

  const own = (input.files ?? []).filter(file => /^[A-Za-z0-9_./-]{1,200}$/.test(file.path) && !file.path.split('/').includes('..') && !file.path.startsWith('/') && !file.path.startsWith('xroga-out'));
  const byPath = new Map<string, ProjectFile>(files.map(file => [file.path, file]));
  for (const file of own) byPath.set(file.path, file); // the caller's own files win over a repository file of the same name

  const result = await selected.runtime.execute({
    files: [...byPath.values()], command: input.command, args: input.args, timeoutMs: Math.min(300_000, Math.max(1_000, input.timeoutMs ?? 120_000)),
    networkPolicy: 'none', environment: { PYTHONDONTWRITEBYTECODE: '1', PYTHONPATH: '.' },
    limits: { memoryMb: 1024, cpuSeconds: 120, diskMb: 256, maxProcesses: 128 },
  });
  return {
    repository: `${owner}/${repo}`, commit, filesSent: byPath.size, omittedFiles: omitted,
    exitCode: result.exitCode, stdout: result.stdout, stderr: result.stderr, timedOut: result.timedOut, durationMs: result.durationMs,
    artifacts: result.artifacts ?? [], runtime: selected.runtime.name,
  };
}
