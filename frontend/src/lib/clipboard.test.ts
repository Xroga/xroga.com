import assert from 'node:assert/strict';
import { test } from 'node:test';
import { copyTextToClipboard } from './clipboard';

const text = '  const code = MASK | FLAG;\n  const label = "世界";\n';

function testDocument(exec: () => boolean) {
  const calls: string[] = [];
  const range = {};
  const field = {
    value: '',
    readOnly: false,
    tabIndex: 0,
    style: {},
    focus(options: FocusOptions) {
      assert.deepEqual(options, { preventScroll: true });
      calls.push('focus copy field');
    },
    select() { calls.push('select text'); },
    remove() { calls.push('remove copy field'); },
  };
  const doc = {
    activeElement: {
      focus(options: FocusOptions) {
        assert.deepEqual(options, { preventScroll: true });
        calls.push('restore focus');
      },
    },
    getSelection() {
      return {
        rangeCount: 1,
        getRangeAt: () => ({ cloneRange: () => range }),
        removeAllRanges: () => calls.push('clear temporary selection'),
        addRange(restored: unknown) {
          assert.equal(restored, range);
          calls.push('restore selection');
        },
      };
    },
    createElement(tag: string) {
      assert.equal(tag, 'textarea');
      return field;
    },
    body: {
      append(element: unknown) {
        assert.equal(element, field);
        assert.equal(field.readOnly, true);
        assert.equal(field.value, text);
        calls.push('add copy field');
      },
    },
    execCommand(command: string) {
      assert.equal(command, 'copy');
      calls.push('copy selected text');
      return exec();
    },
  };
  return { doc: doc as unknown as Document, calls };
}

test('async Clipboard API writes exactly the supplied text without touching the document', async () => {
  const writes: string[] = [];
  const clipboard = { writeText: async (value: string) => { writes.push(value); } };
  const { doc, calls } = testDocument(() => { throw new Error('unexpected fallback'); });
  assert.equal(await copyTextToClipboard(text, { navigator: { clipboard }, document: doc }), true);
  assert.deepEqual(writes, [text]);
  assert.deepEqual(calls, []);
});

test('missing or rejected Async Clipboard API falls back and restores focus and selection', async () => {
  for (const navigator of [undefined, { clipboard: { writeText: async () => { throw new Error('Denied'); } } }]) {
    const { doc, calls } = testDocument(() => true);
    assert.equal(await copyTextToClipboard(text, { navigator, document: doc }), true);
    assert.deepEqual(calls, ['add copy field', 'focus copy field', 'select text', 'copy selected text',
      'remove copy field', 'restore focus', 'clear temporary selection', 'restore selection']);
  }
});

test('unavailable and failed copy paths report failure and still clean up temporary state', async () => {
  assert.equal(await copyTextToClipboard(text, {}), false);
  for (const exec of [() => false, () => { throw new Error('Denied'); }]) {
    const { doc, calls } = testDocument(exec);
    assert.equal(await copyTextToClipboard(text, { document: doc }), false);
    assert.deepEqual(calls.slice(-4), ['remove copy field', 'restore focus', 'clear temporary selection', 'restore selection']);
  }
});
