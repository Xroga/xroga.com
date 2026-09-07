import assert from 'node:assert/strict';
import {
  describe,
  it,
} from 'node:test';

import {
  defaultAttachmentPrompt,
  pickAttachmentModel,
  prepareAttachments,
  type PreparedAttachments,
} from './attachments.js';

function emptyPrepared(
  over: Partial<PreparedAttachments> = {},
): PreparedAttachments {
  return {
    images: [],
    documents: [],
    documentBlock: '',
    hasImages: false,
    hasDocuments: false,
    ...over,
  };
}

describe(
  'pickAttachmentModel',
  () => {
    it(
      'routes images to GLM-5.3 Flash',
      () => {
        const pick =
          pickAttachmentModel(
            'what is in this screenshot',
            emptyPrepared({
              hasImages:
                true,

              images: [
                {
                  url:
                    'data:image/png;base64,xx',

                  mimeType:
                    'image/png',

                  name:
                    'a.png',
                },
              ],
            }),
          );

        assert.equal(
          pick.modelId,
          'glm_5_3_flash',
        );

        assert.equal(
          pick.kind,
          'vision',
        );
      },
    );

    it(
      'does not use Grok for difficult image analysis',
      () => {
        const pick =
          pickAttachmentModel(
            'critique this UI design and debug the production error on screen',
            emptyPrepared({
              hasImages:
                true,

              images: [
                {
                  url: 'x',

                  mimeType:
                    'image/png',

                  name:
                    'error.png',
                },
              ],
            }),
          );

        assert.equal(
          pick.modelId,
          'glm_5_3_flash',
        );

        assert.notEqual(
          pick.modelId,
          'grok_4_3',
        );

        assert.notEqual(
          pick.modelId,
          'grok_4_5',
        );
      },
    );

    it(
      'routes short basic docs to DeepSeek Flash',
      () => {
        const pick =
          pickAttachmentModel(
            'summarize this',
            emptyPrepared({
              hasDocuments:
                true,

              documents: [
                {
                  name:
                    'a.txt',

                  mimeType:
                    'text/plain',

                  text:
                    'hello',

                  chars: 200,
                },
              ],
            }),
          );

        assert.equal(
          pick.modelId,
          'deepseek_v4_flash',
        );
      },
    );

    it(
      'routes normal document analysis to GLM-5.3 Flash',
      () => {
        const pick =
          pickAttachmentModel(
            'analyze this document',
            emptyPrepared({
              hasDocuments:
                true,

              documents: [
                {
                  name:
                    'report.pdf',

                  mimeType:
                    'application/pdf',

                  text:
                    'content',

                  chars:
                    20_000,
                },
              ],
            }),
          );

        assert.equal(
          pick.modelId,
          'glm_5_3_flash',
        );
      },
    );

    it(
      'routes long documents to GLM-5.3',
      () => {
        const pick =
          pickAttachmentModel(
            'review the entire long document',
            emptyPrepared({
              hasDocuments:
                true,

              documents: [
                {
                  name:
                    'big.pdf',

                  mimeType:
                    'application/pdf',

                  text: 'x',

                  chars:
                    90_000,
                },
              ],
            }),
          );

        assert.equal(
          pick.modelId,
          'glm_5_3',
        );
      },
    );

    it(
      'routes mixed image and document input to GLM-5.3 Flash',
      () => {
        const pick =
          pickAttachmentModel(
            'compare these attachments',
            emptyPrepared({
              hasImages:
                true,

              hasDocuments:
                true,

              images: [
                {
                  url: 'x',

                  mimeType:
                    'image/png',

                  name:
                    'screen.png',
                },
              ],

              documents: [
                {
                  name:
                    'notes.txt',

                  mimeType:
                    'text/plain',

                  text:
                    'notes',

                  chars: 100,
                },
              ],
            }),
          );

        assert.equal(
          pick.modelId,
          'glm_5_3_flash',
        );

        assert.equal(
          pick.kind,
          'mixed',
        );
      },
    );
  },
);

describe(
  'prepareAttachments',
  () => {
    it(
      'reads text data URLs as documents',
      async () => {
        const text =
          'Hello from a notes file about billing.';

        const url =
          `data:text/plain;base64,${Buffer.from(text).toString('base64')}`;

        const prepared =
          await prepareAttachments([
            {
              url,

              mimeType:
                'text/plain',

              name:
                'notes.txt',
            },
          ]);

        assert.equal(
          prepared.hasDocuments,
          true,
        );

        assert.match(
          prepared.documentBlock,
          /billing/,
        );
      },
    );

    it(
      'classifies png data URLs as images',
      async () => {
        const png =
          'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

        const prepared =
          await prepareAttachments([
            {
              url:
                `data:image/png;base64,${png}`,

              mimeType:
                'image/png',

              name:
                'dot.png',
            },
          ]);

        assert.equal(
          prepared.hasImages,
          true,
        );

        assert.equal(
          prepared.hasDocuments,
          false,
        );
      },
    );
  },
);

describe(
  'defaultAttachmentPrompt',
  () => {
    it(
      'creates an analysis prompt when user prompt is empty',
      () => {
        const prompt =
          defaultAttachmentPrompt(
            emptyPrepared({
              hasImages:
                true,
            }),
            '',
          );

        assert.match(
          prompt,
          /Analyze/i,
        );
      },
    );
  },
);
