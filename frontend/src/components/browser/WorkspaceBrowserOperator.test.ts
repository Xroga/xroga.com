import assert from 'node:assert/strict';
import test from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { WorkspaceBrowserOperator } from './WorkspaceBrowserOperator.js';

test('Browser Operator stays hidden on an ordinary workspace visit', () => {
  const html = renderToStaticMarkup(createElement(WorkspaceBrowserOperator, {
    extensionId: 'a'.repeat(32),
  }));
  assert.equal(html, '');
});

test('Browser Operator does not show an idle placeholder without an extension', () => {
  const html = renderToStaticMarkup(createElement(WorkspaceBrowserOperator, {}));
  assert.equal(html, '');
});
