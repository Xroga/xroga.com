import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { guessDeletePaths, selectFilesForUpdate } from './fileSelector.js';
import { extractDeletePaths, applyDeletes } from './patches.js';
import type { ProjectFile } from './patches.js';

const files: ProjectFile[] = [
  { path: 'index.html', content: '<h1>Hi</h1>\n'.repeat(20) },
  { path: 'styles.css', content: 'body{color:red}\n'.repeat(20) },
  { path: 'script.js', content: 'console.log(1)\n'.repeat(20) },
  { path: 'src/App.tsx', content: 'export default function App(){}\n'.repeat(10) },
  { path: 'package.json', content: '{"name":"x"}' },
];

describe('selectFilesForUpdate', () => {
  it('prefers css when user asks about colors', () => {
    const { selected, reason } = selectFilesForUpdate(files, 'make the background color blue');
    assert.ok(selected.some((f) => f.path === 'styles.css'));
    assert.ok(selected.some((f) => f.path === 'index.html'));
    assert.match(reason, /targeted|files/i);
  });

  it('prefers js for interactivity', () => {
    const { selected } = selectFilesForUpdate(files, 'add a click toggle handler in javascript');
    assert.ok(selected.some((f) => f.path === 'script.js'));
  });
});

describe('guessDeletePaths', () => {
  it('finds named files to delete', () => {
    const paths = guessDeletePaths('please delete script.js from the project', files.map((f) => f.path));
    assert.deepEqual(paths, ['script.js']);
  });
});

describe('extractDeletePaths', () => {
  it('parses Delete File markers', () => {
    const text = '*** Delete File: script.js\n*** Delete File: old.css\n';
    assert.deepEqual(extractDeletePaths(text), ['script.js', 'old.css']);
  });

  it('applyDeletes removes paths', () => {
    const result = applyDeletes(files, ['script.js']);
    assert.equal(result.deleted.length, 1);
    assert.equal(result.files.some((f) => f.path === 'script.js'), false);
  });
});
