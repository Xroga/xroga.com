import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { slimOutputForSse } from './slimOutputForSse.js';

describe('slimOutputForSse', () => {
  it('keeps bounded changed-file bodies and strips previousFiles', () => {
    const slim = slimOutputForSse({
      type: 'landing_page',
      html: '<html>ok</html>',
      projectFiles: [
        { path: 'index.html', content: 'x'.repeat(5000) },
        { path: 'styles.css', content: 'body{}' },
      ],
      previousFiles: [{ path: 'old.html', content: 'old' }],
    });
    assert.equal(slim?.type, 'landing_page');
    assert.equal(slim?.html, '<html>ok</html>');
    assert.deepEqual(slim?.projectFiles, [
      { path: 'index.html', content: 'x'.repeat(5000) },
      { path: 'styles.css', content: 'body{}' },
    ]);
    assert.equal(slim?.previousFiles, undefined);
    assert.deepEqual(slim?.generatedFiles, ['index.html', 'styles.css']);
  });

  it('strips project file bodies when an artifact exceeds the SSE envelope', () => {
    const slim = slimOutputForSse({
      type: 'engineering_artifact',
      projectFiles: [{ path: 'large.txt', content: 'x'.repeat(200_001) }],
    });
    assert.equal(slim?.projectFiles, undefined);
    assert.deepEqual(slim?.generatedFiles, ['large.txt']);
  });
});
