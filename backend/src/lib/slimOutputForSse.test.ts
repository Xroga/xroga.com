import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { slimOutputForSse } from './slimOutputForSse.js';

describe('slimOutputForSse', () => {
  it('strips heavy projectFiles and previousFiles', () => {
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
    assert.equal(slim?.projectFiles, undefined);
    assert.equal(slim?.previousFiles, undefined);
    assert.deepEqual(slim?.generatedFiles, ['index.html', 'styles.css']);
  });
});
