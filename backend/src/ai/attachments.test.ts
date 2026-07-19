import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  defaultAttachmentPrompt,
  pickAttachmentModel,
  prepareAttachments,
  type PreparedAttachments,
} from './attachments.js';

function emptyPrepared(over: Partial<PreparedAttachments> = {}): PreparedAttachments {
  return {
    images: [],
    documents: [],
    documentBlock: '',
    hasImages: false,
    hasDocuments: false,
    ...over,
  };
}

describe('pickAttachmentModel', () => {
  it('routes images to Grok 4.3 by default', () => {
    const pick = pickAttachmentModel(
      'what is in this screenshot',
      emptyPrepared({
        hasImages: true,
        images: [{ url: 'data:image/png;base64,xx', mimeType: 'image/png', name: 'a.png' }],
      }),
    );
    assert.equal(pick.modelId, 'grok_4_3');
    assert.equal(pick.kind, 'vision');
  });

  it('routes hard design/error images to Grok 4.5', () => {
    const pick = pickAttachmentModel(
      'critique this UI design and debug the production error on screen',
      emptyPrepared({ hasImages: true, images: [{ url: 'x', mimeType: 'image/png', name: 'e.png' }] }),
    );
    assert.equal(pick.modelId, 'grok_4_5');
  });

  it('routes short docs to DeepSeek Flash', () => {
    const pick = pickAttachmentModel(
      'summarize this',
      emptyPrepared({
        hasDocuments: true,
        documents: [{ name: 'a.txt', mimeType: 'text/plain', text: 'hi', chars: 200 }],
      }),
    );
    assert.equal(pick.modelId, 'deepseek_v4_flash');
  });

  it('routes long docs to GLM', () => {
    const pick = pickAttachmentModel(
      'review the entire long document',
      emptyPrepared({
        hasDocuments: true,
        documents: [{ name: 'big.pdf', mimeType: 'application/pdf', text: 'x', chars: 90_000 }],
      }),
    );
    assert.equal(pick.modelId, 'glm_5_2');
  });
});

describe('prepareAttachments', () => {
  it('reads text data URLs as documents', async () => {
    const text = 'Hello from a notes file about billing.';
    const url = `data:text/plain;base64,${Buffer.from(text).toString('base64')}`;
    const prepared = await prepareAttachments([
      { url, mimeType: 'text/plain', name: 'notes.txt' },
    ]);
    assert.equal(prepared.hasDocuments, true);
    assert.match(prepared.documentBlock, /billing/);
  });

  it('classifies png data URLs as images', async () => {
    // 1x1 png
    const png =
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
    const prepared = await prepareAttachments([
      { url: `data:image/png;base64,${png}`, mimeType: 'image/png', name: 'dot.png' },
    ]);
    assert.equal(prepared.hasImages, true);
    assert.equal(prepared.hasDocuments, false);
  });
});

describe('defaultAttachmentPrompt', () => {
  it('returns analyze prompt when empty', () => {
    const p = defaultAttachmentPrompt(emptyPrepared({ hasImages: true }), '');
    assert.match(p, /Analyze/i);
  });
});
