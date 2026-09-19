import assert from 'node:assert/strict';

import {
  describe,
  it,
} from 'node:test';

import type {
  ProjectFile,
} from '../ai/patches.js';

import {
  prepareProductIntelligence,
} from './productIntelligence.js';

import {
  planUniversalRun,
} from './universalFlow.js';

describe(
  'Step 2 product intelligence',
  () => {
    it(
      'classifies and plans a photography portfolio',
      () => {
        const plan =
          planUniversalRun({
            prompt:
              'Build a premium photography portfolio website with a gallery, about section and contact area.',
          });

        assert.equal(
          plan
            .productIntelligence
            .classification
            ?.taxonomyId,
          'web.portfolio',
        );

        assert.equal(
          plan
            .productIntelligence
            .classification
            ?.domain,
          'photography',
        );

        assert.equal(
          plan
            .productIntelligence
            .recipe
            ?.id,
          'web.portfolio',
        );

        assert.equal(
          plan
            .productIntelligence
            .nichePack
            ?.id,
          'photography',
        );

        assert.ok(
          plan
            .productIntelligence
            .filePlan
            .entries
            .length >
            0,
        );
      },
    );

    it(
      'selects a dashboard recipe instead of treating every web product the same',
      () => {
        const plan =
          planUniversalRun({
            prompt:
              'Build an analytics admin dashboard with navigation, metrics, tables and interactive controls.',
          });

        assert.equal(
          plan
            .productIntelligence
            .classification
            ?.taxonomyId,
          'web.dashboard',
        );

        assert.equal(
          plan
            .productIntelligence
            .recipe
            ?.id,
          'web.dashboard',
        );

        assert.ok(
          plan.acceptance.some(
            (
              criterion,
            ) =>
              criterion.id.startsWith(
                'recipe:web.dashboard:',
              ),
          ),
        );
      },
    );

    it(
      'preserves a Rust CLI as a CLI and produces a CLI file plan',
      () => {
        const plan =
          planUniversalRun({
            prompt:
              'Build a Rust CLI command line tool that converts CSV files to JSON.',
          });

        assert.equal(
          plan
            .productIntelligence
            .classification
            ?.taxonomyId,
          'cli.tool',
        );

        assert.equal(
          plan
            .productIntelligence
            .recipe
            ?.id,
          'cli.generic',
        );

        assert.equal(
          plan.architecture
            .components[0]
            ?.language,
          'rust',
        );

        assert.ok(
          plan
            .productIntelligence
            .filePlan
            .requiredPaths
            .includes(
              'Cargo.toml',
            ),
        );

        assert.ok(
          plan
            .productIntelligence
            .filePlan
            .requiredPaths
            .includes(
              'src/main.rs',
            ),
        );
      },
    );

    it(
      'keeps an unknown surface custom instead of converting it into web',
      () => {
        const prepared =
          prepareProductIntelligence({
            text:
              'Build an unusual programmable embedded controller.',

            surfaces: [
              'embedded_app',
            ],
          });

        assert.equal(
          prepared
            .classification
            ?.surface,
          'embedded_app',
        );

        assert.equal(
          prepared
            .classification
            ?.taxonomyId,
          null,
        );

        assert.equal(
          prepared
            .classification
            ?.custom,
          true,
        );

        assert.equal(
          prepared.recipe,
          null,
        );
      },
    );

    it(
      'lets existing repository facts outrank greenfield recipe paths',
      () => {
        const files:
          ProjectFile[] = [
          {
            path:
              'package.json',

            content:
              JSON.stringify({
                scripts: {
                  build:
                    'tsc',
                  test:
                    'node --test',
                },

                dependencies: {
                  react:
                    '^19.0.0',
                },

                devDependencies: {
                  typescript:
                    '^5.0.0',
                },
              }),
          },

          {
            path:
              'src/App.tsx',

            content:
              'export default function App() { return null; }',
          },

          {
            path:
              'tsconfig.json',

            content:
              '{}',
          },
        ];

        const plan =
          planUniversalRun({
            prompt:
              'Turn the existing app into a photography portfolio.',

            files,
          });

        assert.equal(
          plan.architecture
            .inheritedFromRepository,
          true,
        );

        assert.ok(
          plan
            .productIntelligence
            .filePlan
            .notes
            .some(
              (
                note,
              ) =>
                /repository structure is authoritative/i.test(
                  note,
                ),
            ),
        );

        assert.equal(
          plan
            .productIntelligence
            .filePlan
            .entries
            .some(
              (
                entry,
              ) =>
                entry.path ===
                'app/page.tsx',
            ),
          false,
        );
      },
    );

    it(
      'adds niche verification requirements for a dental landing page',
      () => {
        const plan =
          planUniversalRun({
            prompt:
              'Build a landing page for a dental clinic with treatments, contact information and appointment call to action.',
          });

        assert.equal(
          plan
            .productIntelligence
            .nichePack
            ?.id,
          'dental',
        );

        assert.ok(
          plan.acceptance.some(
            (
              criterion,
            ) =>
              criterion.id.startsWith(
                'niche:dental:',
              ),
          ),
        );
      },
    );

    it(
      'selects MCP-specific intelligence for an MCP server',
      () => {
        const plan =
          planUniversalRun({
            prompt:
              'Build an MCP server with structured tools for searching project records.',
          });

        assert.equal(
          plan
            .productIntelligence
            .classification
            ?.taxonomyId,
          'ai.mcp_server',
        );

        assert.equal(
          plan
            .productIntelligence
            .recipe
            ?.id,
          'ai.mcp_server',
        );

        assert.ok(
          plan
            .productIntelligence
            .goldenExamples
            .some(
              (
                example,
              ) =>
                example.id ===
                'mcp.server',
            ),
        );
      },
    );
  },
);
