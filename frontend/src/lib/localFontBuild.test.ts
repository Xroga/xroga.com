import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import ts from 'typescript';

const root = new URL('../../../', import.meta.url);
const read = (path: string) => readFileSync(new URL(path, root));
const register = JSON.parse(read('docs/xroga/security/CRYPTO_FONT_REGISTER.json').toString('utf8'));
test('production frontend has no remaining build-time Google font import', () => {
  const paths = execFileSync('git', ['ls-files'], { cwd: root, encoding: 'utf8' }).trim().split(/\r?\n/).filter(path => /^frontend\/src\/.*\.[jt]sx?$/.test(path) && !/\.(?:test|spec)\./.test(path));
  for (const path of paths) {
    const source = ts.createSourceFile(path, read(path).toString('utf8'), ts.ScriptTarget.Latest, true);
    const visit = (node: ts.Node) => {
      if (ts.isStringLiteral(node) && node.text === 'next/font/google') assert.fail(`Remote production font import: ${path}`);
      ts.forEachChild(node, visit);
    };
    visit(source);
  }
});
test('actual bundled WOFF2 fonts match pinned bytes and carry distributable license notices', () => {
  assert.equal(register.fonts.length, 3);
  for (const font of register.fonts) {
    const bytes = read(`frontend/src/app/fonts/crypto/${font.file}`);
    assert.equal(bytes.toString('ascii',0,4),'wOF2');
    assert.equal(bytes.readUInt32BE(8), bytes.length);
    assert.equal(bytes.length, font.bytes);
    assert.equal(createHash('sha256').update(bytes).digest('hex'), font.sha256);
    const notice = read(font.notice).toString('utf8');
    assert.match(notice,/SIL OPEN FONT LICENSE Version 1\.1/);
    assert.match(notice,/Copyright/);
    assert.match(font.sourceCommit,/^[a-f0-9]{40}$/);
  }
});
test('crypto retains its actual families, normal and italic weights, swap and CSS variables', () => {
  const code = read('frontend/src/app/crypto/fonts.ts').toString('utf8');
  assert.match(code,/from 'next\/font\/local'/);
  for (const font of register.fonts) assert.ok(code.includes(font.file));
  for (const value of ['--font-manrope','--font-editorial',"weight: '200 800'","weight: '300 700'","style: 'normal'","style: 'italic'"]) assert.ok(code.includes(value));
  assert.equal((code.match(/display: 'swap'/g) ?? []).length,2);
  assert.deepEqual(register.fonts.map((font: {family:string}) => font.family), ['Manrope','Cormorant Garamond','Cormorant Garamond']);
});
