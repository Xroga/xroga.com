import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { ExistingSourceError } from '../types.js';
import { importArchive, MAX_KEPT_BYTES } from './importer.js';
import { DEFAULT_ZIP_LIMITS, readZip, safeEntryPath } from './zipReader.js';
import { buildZip } from './zipBuilder.testsupport.js';

const refused = (message?: RegExp) => (e: unknown) => e instanceof ExistingSourceError && e.code === 'INVALID_ARCHIVE' && (!message || message.test(e.message));

describe('zip reader', () => {
  it('reads stored and deflated files, directories and unicode names', () => {
    const zip = buildZip([{ name: 'src/' }, { name: 'src/a.ts', data: 'export const a = 1;\n' }, { name: 'README.md', data: 'hello', store: true }, { name: 'src/ünï.ts', data: 'x' }]);
    const out = readZip(zip);
    assert.deepEqual(out.files.map((f) => f.path).sort(), ['README.md', 'src/a.ts', 'src/ünï.ts']);
    assert.equal(out.files.find((f) => f.path === 'src/a.ts')!.data.toString(), 'export const a = 1;\n');
    assert.equal(out.directories, 1);
  });

  it('skips traversal, absolute, drive, backslash, NUL and .git entries and says why', () => {
    const names = ['../evil.sh', 'a/../../evil.sh', '/etc/passwd', 'C:/Windows/x', 'a\\b.txt', '.git/config', 'ok/.git/HEAD', 'a//b.txt', 'bad\0name', './x'];
    const zip = buildZip([...names.map((name) => ({ name, data: 'x' })), { name: 'good.txt', data: 'ok' }]);
    const out = readZip(zip);
    assert.deepEqual(out.files.map((f) => f.path), ['good.txt']);
    assert.equal(out.skipped.length, names.length);
    assert.ok(out.skipped.every((s) => s.reason === 'unsafe_path'));
    assert.equal(safeEntryPath('a/b/c.ts'), 'a/b/c.ts');
    assert.equal(safeEntryPath('a'.repeat(300)), null);
  });

  it('never extracts symlinks, special files, encrypted or unknown-method entries', () => {
    const zip = buildZip([
      { name: 'link', data: '../../etc/passwd', mode: 0o120777 }, { name: 'dev', data: '', mode: 0o060644 }, { name: 'locked.txt', data: 'x', encrypted: true },
      { name: 'weird.bin', data: 'x', method: 12 }, { name: 'ok.txt', data: 'fine' },
    ]);
    const out = readZip(zip);
    assert.deepEqual(out.files.map((f) => f.path), ['ok.txt']);
    assert.deepEqual(out.skipped.map((s) => s.reason).sort(), ['encrypted', 'special_file', 'symlink', 'unsupported_method']);
  });

  it('refuses a duplicate path, case-insensitively', () => {
    assert.throws(() => readZip(buildZip([{ name: 'a.txt', data: '1' }, { name: 'A.txt', data: '2' }])), refused(/twice/));
  });

  it('refuses a zip bomb by ratio before expanding it, and by total size', () => {
    const bomb = buildZip([{ name: 'zeros.txt', data: Buffer.alloc(1_500_000, 0) }]);
    assert.ok(bomb.length < 10_000);
    assert.throws(() => readZip(bomb), refused(/compresses suspiciously/));
    assert.throws(() => readZip(buildZip([{ name: 'a', data: Buffer.alloc(900, 1) }, { name: 'b', data: Buffer.alloc(900, 2) }]), { ...DEFAULT_ZIP_LIMITS, maxTotalBytes: 1000 }), refused(/expands to more than/));
  });

  it('skips an entry larger than the per-file limit and refuses one that lies about its size', () => {
    const big = buildZip([{ name: 'big.txt', data: Buffer.from('abcdefgh'.repeat(300_000)), store: true }, { name: 'small.txt', data: 'x' }]);
    const out = readZip(big, { ...DEFAULT_ZIP_LIMITS, maxEntryBytes: 1_000_000, maxRatio: 1e9 });
    assert.deepEqual(out.skipped, [{ path: 'big.txt', reason: 'too_large' }]);
    assert.throws(() => readZip(buildZip([{ name: 'a.txt', data: 'twelve chars', declaredSize: 5 }])), refused(/damaged|declared/));
    // a declared size over the limit is skipped without inflating anything
    assert.deepEqual(readZip(buildZip([{ name: 'a.txt', data: Buffer.from('x'.repeat(100)), declaredSize: 5_000_000 }])).skipped, [{ path: 'a.txt', reason: 'too_large' }]);
  });

  it('refuses malformed, truncated, multi-part, zip64 and oversized archives', () => {
    const good = buildZip([{ name: 'a.txt', data: 'hello world, hello world' }]);
    assert.throws(() => readZip(Buffer.from('not a zip at all, just text')), refused(/not a ZIP/));
    assert.throws(() => readZip(good.subarray(0, good.length - 10)), refused());
    assert.throws(() => readZip(buildZip([{ name: 'a', data: 'x' }], { diskNumber: 1 })), refused(/Multi-part/));
    assert.throws(() => readZip(buildZip([{ name: 'a', data: 'x' }], { zip64Marker: true })), refused(/ZIP64|more than/));
    assert.throws(() => readZip(good, { ...DEFAULT_ZIP_LIMITS, maxArchiveBytes: 20 }), refused(/larger than/));
    assert.throws(() => readZip(buildZip(Array.from({ length: 6 }, (_, i) => ({ name: `f${i}`, data: 'x' }))), { ...DEFAULT_ZIP_LIMITS, maxEntries: 5 }), refused(/more than 5 entries/));
    // a central directory that points outside the archive
    const corrupt = Buffer.from(good); corrupt.writeUInt32LE(0x7fffff00, good.length - 22 + 16);
    assert.throws(() => readZip(corrupt), refused(/damaged/));
    for (let seed = 0; seed < 60; seed++) {
      const fuzz = Buffer.from(good); fuzz[(seed * 7) % (good.length - 22)] ^= 0xff;
      try { readZip(fuzz); } catch (e) { assert.ok(e instanceof ExistingSourceError, `fuzz ${seed} threw ${(e as Error).message}`); }
    }
  });
});

describe('archive importer', () => {
  it('removes a single wrapper directory, keeps text, lists but never keeps credentials, binaries, vendored and generated files', () => {
    const zip = buildZip([
      { name: 'proj-main/package.json', data: '{"name":"p","dependencies":{"left-pad":"1"}}' }, { name: 'proj-main/src/index.ts', data: 'export const x = 1;\n' },
      { name: 'proj-main/.env', data: 'SECRET=hunter2' }, { name: 'proj-main/id_rsa', data: '-----BEGIN PRIVATE KEY-----' },
      { name: 'proj-main/logo.png', data: Buffer.from([0x89, 0x50, 0x4e, 0x47, 0, 0, 0, 1]) }, { name: 'proj-main/node_modules/x/index.js', data: 'module.exports=1' },
      { name: 'proj-main/dist/app.min.js', data: 'var a=1;' }, { name: 'proj-main/latin1.txt', data: Buffer.from([0xe9, 0xe8, 0xff, 0xfe]) },
    ]);
    const imported = importArchive(zip, 'proj-main.zip');
    assert.equal(imported.name, 'proj-main');
    const by = new Map(imported.files.map((f) => [f.path, f]));
    assert.equal(by.get('src/index.ts')!.text, 'export const x = 1;\n');
    for (const hidden of ['.env', 'id_rsa', 'logo.png', 'node_modules/x/index.js', 'dist/app.min.js', 'latin1.txt']) {
      assert.ok(by.has(hidden), `${hidden} is listed`);
      assert.equal(by.get(hidden)!.text, null, `${hidden} content is not kept`);
    }
    assert.ok(!JSON.stringify(imported).includes('hunter2') && !JSON.stringify(imported).includes('PRIVATE KEY'));
    assert.equal(imported.report.kept, 2);
    assert.equal(imported.report.listedOnly, 6);
  });

  it('has a stable digest that changes with any byte, and refuses an empty archive or text beyond the keep limit', () => {
    const a = importArchive(buildZip([{ name: 'a.ts', data: '1' }, { name: 'b.ts', data: '2' }]), 'x');
    const reordered = importArchive(buildZip([{ name: 'b.ts', data: '2' }, { name: 'a.ts', data: '1' }]), 'x');
    const changed = importArchive(buildZip([{ name: 'a.ts', data: '1' }, { name: 'b.ts', data: '3' }]), 'x');
    assert.equal(a.digest, reordered.digest);
    assert.notEqual(a.digest, changed.digest);
    assert.throws(() => importArchive(buildZip([{ name: 'empty/' }]), 'x'), refused(/no files/));
    const many = Array.from({ length: 45 }, (_, i) => ({ name: `f${i}.ts`, data: `// ${i} ${'x'.repeat(60)}
`.repeat(3_000), store: true }));
    assert.throws(() => importArchive(buildZip(many), 'x', { ...DEFAULT_ZIP_LIMITS, maxTotalBytes: 100 * 1048576, maxRatio: 1e9 }), refused(new RegExp(`${MAX_KEPT_BYTES / 1048576} MB`)));
  });
});
