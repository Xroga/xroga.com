import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { test } from 'node:test';
import * as React from 'react';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { PARTIAL_NATIVE_PRESENTATION_NOTE } from '../../../backend/src/ai/nativeOpenUi';
import { serializeAssistantCopy } from './assistantCopy';

const nodeRequire = createRequire(__filename);
nodeRequire.extensions['.css'] = () => {};
const { NativeSurface } = nodeRequire('../components/native-openui/NativeSurface.tsx') as typeof import('@/components/native-openui/NativeSurface');

const text = `${PARTIAL_NATIVE_PRESENTATION_NOTE}\n\nThe estimate covers the print charge.`;

for (const [name, program] of [['recovered visual', 'root = Col([Table(["Item"], [["Printing"]])])'], ['prose only', '']] as const) {
  test(`the internal visual warning is not shown on screen (${name})`, t => {
    const previousReact = Object.getOwnPropertyDescriptor(globalThis, 'React');
    Object.defineProperty(globalThis, 'React', { configurable: true, value: React });
    t.after(() => {
      if (previousReact) Object.defineProperty(globalThis, 'React', previousReact);
      else Reflect.deleteProperty(globalThis, 'React');
    });
    const html = renderToStaticMarkup(createElement(NativeSurface, { answer: { format: 'xroga-openui-v1', library: 'xroga-native-v1', text, program } }));
    assert.doesNotMatch(html, /could not be validated/);
    assert.match(html, /The estimate covers the print charge\./);
  });
}

test('the internal visual warning is not copied with the answer', () => {
  assert.equal(serializeAssistantCopy(text), 'The estimate covers the print charge.');
  assert.match(serializeAssistantCopy(`Quoted: ${PARTIAL_NATIVE_PRESENTATION_NOTE}`), /^Quoted: Some visuals/);
});
