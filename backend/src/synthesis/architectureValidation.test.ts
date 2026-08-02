import assert from 'node:assert/strict';
import { test } from 'node:test';
import { selectArchitecture, selectFrameworkAdapter } from './adapters.js';
import { synthesizeProductDefinition } from './productDefinition.js';
import { buildCapabilityGraph } from './capabilityGraph.js';
import { architectureStageIsValid } from './architectureValidation.js';

/**
 * Regression cover for the `synthesis-architecture` validation gate.
 *
 * Production symptom: runs died in about four seconds with zero events and
 *
 *   BUILD_FAILED — universal synthesis failed at synthesis-architecture:
 *   task output was not validated with evidence
 *
 * Cause: the gate was
 *
 *   validated: Boolean(framework.buildCommand || architecture.primary === 'static_site')
 *
 * `selectFrameworkAdapter` picks `static-web` whenever the repository contains an
 * `index.html`, and `static-web` has `buildCommand: null` because a static site has
 * nothing to build. So any repository that already contained an index.html failed
 * instantly unless the architecture *also* happened to be `static_site` — which it
 * is not for a dashboard, an app, or anything with a backend.
 *
 * That combination is every follow-up prompt against an already-built site, which
 * is why "change our landing page name" died in 0.3 minutes.
 *
 * The gate now asks whether the *framework* can be verified, which is the question
 * it was always meant to ask.
 */

const INDEX_HTML = [{ path: 'index.html', content: '<!doctype html><html><body><h1>ofcrypto</h1></body></html>' }];

function stageFor(prompt: string, files = INDEX_HTML) {
  const definition = synthesizeProductDefinition({ prompt, repositoryFiles: files });
  const graph = buildCapabilityGraph(definition);
  const architecture = selectArchitecture(definition, graph);
  const framework = selectFrameworkAdapter(architecture, files);
  return { architecture, framework };
}

test('reproduces production: an existing index.html selects the static-web adapter', () => {
  const { framework } = stageFor('could you build crypto dashboard defi?');
  assert.equal(framework.id, 'static-web');
  assert.equal(framework.buildCommand, null, 'static-web is expected to have no build command');
});

test('the old gate rejected exactly the production cases, the new one accepts them', () => {
  // Preserved as an executable description of the bug. Asserting the old gate is
  // false keeps this test honest — otherwise it would pass vacuously if the
  // reproduction ever stopped reproducing.
  for (const prompt of [
    'could you build crypto dashboard defi?',
    'change our landing page name from ofcrypto to cryptomax just change name only',
    'build a crypto dashboard',
  ]) {
    const { architecture, framework } = stageFor(prompt);
    assert.equal(architecture.primary, 'full_stack_web_application', prompt);
    assert.equal(framework.id, 'static-web', prompt);

    const primary: string = architecture.primary;
    const oldGate = Boolean(framework.buildCommand || primary === 'static_site');
    assert.equal(oldGate, false, `expected the old gate to reject: ${prompt}`);
    assert.equal(
      architectureStageIsValid(architecture, framework),
      true,
      `still rejected after the fix: ${prompt}`,
    );
  }
});

test('a static-web framework validates regardless of the architecture label', () => {
  const { architecture, framework } = stageFor('could you build crypto dashboard defi?');
  assert.notEqual(architecture.primary, 'static_site', 'this prompt should not be labelled a static site');
  assert.equal(
    architectureStageIsValid(architecture, framework),
    true,
    'a framework with a real verification path must validate',
  );
});

test('the follow-up update prompt no longer dies at the architecture stage', () => {
  const { architecture, framework } = stageFor(
    'change our landing page name from ofcrypto to cryptomax just change name only',
  );
  assert.equal(architectureStageIsValid(architecture, framework), true);
});

test('a framework with a build command still validates', () => {
  const files = [{ path: 'package.json', content: '{"dependencies":{"next":"15.0.0"}}' }];
  const { architecture, framework } = stageFor('Build a Next.js dashboard with charts', files);
  assert.equal(framework.id, 'nextjs-app-router');
  assert.ok(framework.buildCommand);
  assert.equal(architectureStageIsValid(architecture, framework), true);
});

test('an empty repository still validates — a first build has no files to detect', () => {
  const { architecture, framework } = stageFor('Build a portfolio site', []);
  assert.equal(architectureStageIsValid(architecture, framework), true);
});

test('validation is refused only when the framework has no way to be verified', () => {
  // The gate exists to catch a framework we cannot check at all. Keep that meaning:
  // no build command AND no production verification is genuinely unverifiable.
  const { architecture, framework } = stageFor('Build a portfolio site');
  const unverifiable = { ...framework, buildCommand: null, productionVerification: [] };
  assert.equal(architectureStageIsValid(architecture, unverifiable), false);
});

test('every shipped adapter is verifiable, so none can wedge the pipeline', () => {
  // If this ever fails, a new adapter has been added that would reproduce the
  // original outage for whichever prompts select it.
  const prompts = [
    'Build a portfolio site',
    'could you build crypto dashboard defi?',
    'Build a Next.js dashboard',
    'Build a CLI tool',
    'Build a chrome extension',
    'Build a mobile app',
  ];
  for (const prompt of prompts) {
    const { architecture, framework } = stageFor(prompt, []);
    assert.equal(
      architectureStageIsValid(architecture, framework),
      true,
      `${prompt} → ${framework.id} would fail the architecture stage`,
    );
  }
});
