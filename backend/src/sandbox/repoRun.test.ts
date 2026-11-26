import test from 'node:test';
import assert from 'node:assert/strict';
import { parseRepositoryUrl, readTarball, textFiles, RepoRunError } from './repoRun.js';

function tarEntry(name: string, content: string | null, type = '0'): Buffer {
  const header = Buffer.alloc(512);
  header.write(name, 0, 100);
  header.write((content ? Buffer.byteLength(content) : 0).toString(8).padStart(11, '0') + '\0', 124, 12);
  header.write(type, 156, 1);
  const body = content ? Buffer.concat([Buffer.from(content), Buffer.alloc((512 - (Buffer.byteLength(content) % 512)) % 512)]) : Buffer.alloc(0);
  return Buffer.concat([header, body]);
}
const archive = (...entries: Buffer[]) => Buffer.concat([...entries, Buffer.alloc(1024)]);

test('only a public github.com owner/repo address is accepted', () => {
  assert.deepEqual(parseRepositoryUrl('https://github.com/mahmoud/boltons'), { owner: 'mahmoud', repo: 'boltons' });
  assert.deepEqual(parseRepositoryUrl('https://github.com/a/b.git/'), { owner: 'a', repo: 'b' });
  for (const bad of ['http://github.com/a/b', 'https://evil.com/a/b', 'https://github.com/a', 'https://user:pw@github.com/a/b', 'https://github.com/../x', 'git@github.com:a/b.git']) {
    assert.throws(() => parseRepositoryUrl(bad), RepoRunError, bad);
  }
});

test('the exact commit is read from the archive global header', () => {
  const sha = 'a'.repeat(40);
  const pax = `52 comment=${sha}\n`;
  const meta: { commit?: string } = {};
  const files = readTarball(archive(tarEntry('pax_global_header', pax, 'g'), tarEntry('repo-abc/main.py', 'print(1)\n')), meta);
  assert.equal(meta.commit, sha);
  assert.deepEqual(files.map(f => f.path), ['main.py']);
});

test('the archive reader keeps regular files, drops the top directory, and never extracts directories, links or .git', () => {
  const files = readTarball(archive(
    tarEntry('repo-abc/', null, '5'), tarEntry('repo-abc/main.py', 'print(1)\n'), tarEntry('repo-abc/sub/util.py', 'x = 2\n'),
    tarEntry('repo-abc/.git/config', 'secret'), tarEntry('repo-abc/link', null, '2'), tarEntry('repo-abc/../escape.txt', 'no'),
  ));
  assert.deepEqual(files.map(f => f.path), ['main.py', 'sub/util.py']);
  assert.equal(files[0].data.toString(), 'print(1)\n');
});

test('only text files within the size limits are sent on', () => {
  const { files, omitted } = textFiles([
    { path: 'a.py', data: Buffer.from('ok') }, { path: 'img.png', data: Buffer.from([1, 2, 0, 3]) }, { path: 'big.txt', data: Buffer.alloc(2 * 1024 * 1024, 97) },
  ]);
  assert.deepEqual(files.map(f => f.path), ['a.py']);
  assert.equal(omitted, 2);
});
