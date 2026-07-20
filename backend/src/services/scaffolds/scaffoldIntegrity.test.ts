import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { ensureScaffoldIntegrity } from './scaffoldIntegrity.js';

describe('ensureScaffoldIntegrity', () => {
  it('restores emptied chrome critical files', () => {
    const scaffold = [
      { path: 'manifest.json', content: '{"manifest_version":3,"name":"X"}' },
      { path: 'background.js', content: 'chrome.runtime.onInstalled.addListener(()=>{});' },
      { path: 'popup.html', content: '<html></html>' },
    ];
    const merged = [
      { path: 'manifest.json', content: '' },
      { path: 'popup.html', content: '<html><body>hi</body></html>' },
    ];
    const { files, restored } = ensureScaffoldIntegrity('chrome', scaffold, merged);
    assert.ok(restored.includes('manifest.json'));
    assert.ok(restored.includes('background.js'));
    assert.match(files.find((f) => f.path === 'manifest.json')!.content, /manifest_version/);
  });
});
