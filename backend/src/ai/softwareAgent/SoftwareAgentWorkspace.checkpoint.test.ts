import {
  describe,
  it,
} from 'node:test';

import assert from 'node:assert/strict';

import {
  SoftwareAgentWorkspace,
} from './SoftwareAgentWorkspace.js';

describe(
  'SoftwareAgentWorkspace checkpoint recovery',
  () => {
    it(
      'keeps the original repository as the diff base while restoring a checkpointed working tree',
      () => {
        const workspace =
          new SoftwareAgentWorkspace(
            [
              {
                path:
                  'a.txt',

                content:
                  'before',
              },

              {
                path:
                  'deleted.txt',

                content:
                  'remove me',
              },

              {
                path:
                  'unchanged.txt',

                content:
                  'same',
              },
            ],

            [
              {
                path:
                  'a.txt',

                content:
                  'after',
              },

              {
                path:
                  'created.txt',

                content:
                  'new',
              },

              {
                path:
                  'unchanged.txt',

                content:
                  'same',
              },
            ],
          );

        assert.deepEqual(
          workspace.getChanges(),

          [
            {
              path:
                'a.txt',

              kind:
                'modified',

              before:
                'before',

              after:
                'after',
            },

            {
              path:
                'created.txt',

              kind:
                'created',

              after:
                'new',
            },

            {
              path:
                'deleted.txt',

              kind:
                'deleted',

              before:
                'remove me',
            },
          ],
        );
      },
    );
  },
);
