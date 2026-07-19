import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  applyPatches,
  buildFileTrail,
  extractSearchReplacePatches,
  lineDiffCounts,
  type ProjectFile,
} from './patches.js';
import { extractProjectFiles } from './siteBuilder.js';

describe('extractSearchReplacePatches', () => {
  it('parses SEARCH/REPLACE blocks', () => {
    const text = `*** Update File: src/app.js
<<<<<<< SEARCH
const x = 1;
=======
const x = 2;
>>>>>>> REPLACE`;

    const patches = extractSearchReplacePatches(text);
    assert.equal(patches.length, 1);
    assert.equal(patches[0].path, 'src/app.js');
    assert.equal(patches[0].search, 'const x = 1;');
    assert.equal(patches[0].replace, 'const x = 2;');
  });

  it('parses JSON fence patches', () => {
    const text = '```json\n{"patches":[{"path":"a.txt","search":"old","replace":"new"}]}\n```';
    const patches = extractSearchReplacePatches(text);
    assert.equal(patches.length, 1);
    assert.deepEqual(patches[0], { path: 'a.txt', search: 'old', replace: 'new' });
  });
});

describe('applyPatches', () => {
  const files: ProjectFile[] = [{ path: 'index.html', content: '<h1>Hello</h1>\n<p>World</p>' }];

  it('applies exact search/replace', () => {
    const result = applyPatches(files, [
      { path: 'index.html', search: '<h1>Hello</h1>', replace: '<h1>Hi</h1>' },
    ]);
    assert.equal(result.applied.length, 1);
    assert.equal(result.failed.length, 0);
    assert.match(result.files[0].content, /<h1>Hi<\/h1>/);
  });

  it('fails when search is missing and leaves file unchanged', () => {
    const result = applyPatches(files, [
      { path: 'index.html', search: 'NOT FOUND', replace: 'nope' },
    ]);
    assert.equal(result.applied.length, 0);
    assert.equal(result.failed.length, 1);
    assert.equal(result.files[0].content, files[0].content);
  });

  it('tries flexible whitespace once', () => {
    const spaced: ProjectFile[] = [{ path: 'app.js', content: 'const a   =   1;' }];
    const result = applyPatches(spaced, [
      { path: 'app.js', search: 'const a = 1;', replace: 'const a = 2;' },
    ]);
    assert.equal(result.applied.length, 1);
    assert.match(result.files[0].content, /const a\s*=\s*2/);
  });
});

describe('lineDiffCounts', () => {
  it('counts added and removed lines', () => {
    const before = 'line1\nline2\nline3';
    const after = 'line1\nline2 changed\nline4';
    const { added, removed } = lineDiffCounts(before, after);
    assert.equal(removed, 1);
    assert.equal(added, 2);
  });
});

describe('buildFileTrail', () => {
  it('returns trail entries for changed files only', () => {
    const previous: ProjectFile[] = [
      { path: 'a.txt', content: 'one\n' },
      { path: 'b.txt', content: 'same\n' },
    ];
    const next: ProjectFile[] = [
      { path: 'a.txt', content: 'two\n' },
      { path: 'b.txt', content: 'same\n' },
    ];
    const trail = buildFileTrail(previous, next);
    assert.equal(trail.length, 1);
    assert.equal(trail[0].path, 'a.txt');
    assert.equal(trail[0].before, 'one\n');
    assert.equal(trail[0].after, 'two\n');
    assert.equal(trail[0].added, 1);
    assert.equal(trail[0].removed, 1);
  });
});

describe('extractProjectFiles', () => {
  it('extracts path-tagged fences', () => {
    const text = '```html path=index.html\n<!DOCTYPE html><html></html>\n```';
    const files = extractProjectFiles(text);
    assert.equal(files.length, 1);
    assert.equal(files[0].path, 'index.html');
    assert.match(files[0].content, /<!DOCTYPE html>/);
  });

  it('extracts file: fences', () => {
    const text = '```file:package.json\n{"name":"demo"}\n```';
    const files = extractProjectFiles(text);
    assert.equal(files.length, 1);
    assert.equal(files[0].path, 'package.json');
  });

  it('maps classic html/css/js fences to default paths', () => {
    const text = [
      '```html\n<html></html>\n```',
      '```css\nbody{margin:0}\n```',
      '```js\nconsole.log(1)\n```',
    ].join('\n');
    const files = extractProjectFiles(text);
    const paths = files.map((f) => f.path).sort();
    assert.deepEqual(paths, ['index.html', 'script.js', 'styles.css']);
  });
});
