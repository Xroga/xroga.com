/**
 * Tests for the product spec and the architecture planner.
 *
 * These are the black-box universality checks from §58, and they assert the one thing that
 * matters most: that unfamiliar requests stop becoming static websites. Several are phrased
 * directly against the old behaviour, because the regression they guard is not
 * hypothetical — it is what the code did before this command.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import type { ProjectFile } from '../ai/patches.js';
import {
  KNOWN_PRODUCT_SURFACES,
  inferSurfaces,
  migrateUniversalProductSpec,
  synthesizeUniversalProductSpec,
  withCustomSurface,
} from './universalProductSpec.js';
import { planArchitecture, planIsRefusal } from './architecturePlan.js';

const f = (path: string, content = ''): ProjectFile => ({ path, content });
const plan = (prompt: string, files: ProjectFile[] = []) =>
  planArchitecture({ spec: synthesizeUniversalProductSpec({ prompt, files }), files });
const surfaces = (prompt: string) => inferSurfaces(prompt).map((declaration) => declaration.surface);
const languages = (prompt: string, files: ProjectFile[] = []) =>
  plan(prompt, files).components.map((component) => component.language);

describe('nothing silently becomes a static website', () => {
  // §58 A. The exact request that used to produce index.html, styles.css and script.js,
  // because detectScaffoldKind found no keyword and returned 'static'.
  it('builds a Rust CLI for a CSV-to-JSON converter', () => {
    const architecture = plan('Build a Rust CLI that converts CSV files to JSON');
    assert.deepEqual(architecture.components.map((c) => c.language), ['rust']);
    assert.equal(architecture.components[0].adapterId, 'rust');
    assert.ok(
      architecture.components.every((component) => component.framework !== 'next'),
      'a CLI must not acquire a web framework',
    );
  });

  // The harder half of the same case: no language is named, and the surface must still be
  // read from behaviour. "Converts files" is a batch transformation with no session.
  it('reads a CLI out of described behaviour when no language or CLI keyword appears', () => {
    assert.ok(surfaces('A tool that converts CSV files to JSON').includes('cli'));
    assert.ok(!surfaces('A tool that converts CSV files to JSON').includes('web_frontend'));
  });

  // §58 N. A category absent from every list must still produce a real plan.
  it('plans an unfamiliar category without falling back to a website', () => {
    const architecture = plan('Build a Python service that reconciles ledger entries between two accounting systems on a nightly schedule');
    assert.ok(architecture.components.length > 0, 'a plan must exist');
    assert.deepEqual([...new Set(architecture.components.map((c) => c.language))], ['python']);
    assert.ok(
      architecture.components.every((component) => !component.surfaces.includes('web_frontend')),
      'nothing here describes a browser interface',
    );
  });

  // The replacement for the `'static'` parse fallback. Refusing is a legitimate output;
  // the old design could not express it, so it produced a plausible wrong artefact instead.
  it('refuses rather than guessing when no surface can be determined', () => {
    const architecture = plan('make it better');
    assert.equal(planIsRefusal(architecture), true);
    assert.deepEqual(architecture.components, []);
    assert.match(architecture.blockers[0], /No product surface could be determined/);
    assert.match(architecture.blockers[0], /static website/);
  });

  it('never selects a web framework for a surface that has no browser', () => {
    for (const prompt of [
      'Build a Rust CLI that converts CSV files to JSON',
      'Build a Python package with no server',
      'Build a Terraform infrastructure module',
      'Build a background worker that processes a queue',
    ]) {
      for (const component of plan(prompt).components) {
        assert.ok(
          !['next', 'react', 'vue', 'svelte'].includes(component.framework ?? ''),
          `${prompt} must not select ${component.framework}`,
        );
      }
    }
  });
});

describe('a product can have several surfaces', () => {
  // §58 D. The old code returned one value, so the worker was simply never built.
  it('finds both the service and the worker in one request', () => {
    const found = surfaces('Build a Go HTTP service with PostgreSQL and a background cleanup worker');
    assert.ok(found.includes('api'), 'the service surface');
    assert.ok(found.includes('worker'), 'and the worker surface, which a single-answer detector would drop');
  });

  it('gives each surface its own component root so they stay separable', () => {
    const architecture = plan('Build an API with a background worker');
    const roots = architecture.components.map((component) => component.root);
    assert.ok(roots.length >= 2);
    assert.equal(new Set(roots).size, roots.length, 'no two components share a root');
  });

  it('keeps a single-surface product at the repository root', () => {
    assert.deepEqual(plan('Build a Rust CLI for converting files').components.map((c) => c.root), ['']);
  });
});

describe('the surface type is genuinely open', () => {
  it('accepts a surface that is not in the known list', () => {
    // §5 says custom values must remain possible. A closed enum would reject this at the
    // type level and, worse, at runtime.
    const spec = withCustomSurface(
      synthesizeUniversalProductSpec({ prompt: 'Build a flight-control telemetry bridge' }),
      'avionics_bridge',
      'the product bridges two telemetry buses',
    );
    const declaration = spec.surfaces.find((entry) => entry.surface === 'avionics_bridge');
    assert.ok(declaration, 'the custom surface is present');
    assert.equal(declaration.custom, true, 'and is flagged as custom rather than rejected');
  });

  it('preserves unknown surfaces through persistence and migration', () => {
    // §51 loads a spec months later. A migration that dropped unknown surfaces would
    // silently shrink the product on reload.
    const stored = {
      surfaces: [{ surface: 'avionics_bridge', reason: 'r', evidence: [], confidence: 0.5, custom: true }],
      title: 'bridge',
    };
    const migrated = migrateUniversalProductSpec(stored);
    assert.equal(migrated.surfaces[0].surface, 'avionics_bridge');
    assert.equal(migrated.surfaces[0].custom, true);
  });

  it('recomputes custom on migration so a promoted surface stops being custom', () => {
    // A surface stored as custom before the value was known must not stay flagged once the
    // code learns it, or the flag drifts from the truth it is meant to record.
    const migrated = migrateUniversalProductSpec({
      surfaces: [{ surface: 'mcp_server', reason: 'r', evidence: [], confidence: 1, custom: true }],
    });
    assert.equal(migrated.surfaces[0].custom, false);
    assert.ok((KNOWN_PRODUCT_SURFACES as readonly string[]).includes('mcp_server'));
  });
});

describe('an existing repository outranks any preference', () => {
  const django = [
    f('manage.py', "import django"),
    f('requirements.txt', 'django==5.0\n'),
    f('app/models.py', 'from django.db import models'),
  ];

  // §26. The failure this prevents is replacing a working repository because a prompt
  // used a word.
  it('stays Python for a Django repository even when the request says Node', () => {
    const architecture = plan('Add a Node API endpoint for listing invoices', django);
    assert.deepEqual([...new Set(architecture.components.map((c) => c.language))], ['python']);
    assert.equal(architecture.inheritedFromRepository, true);
  });

  it('marks inherited decisions so a reviewer can see nothing was chosen', () => {
    const decision = plan('Add a feature', django).decisions[0];
    assert.equal(decision.inheritedFromRepository, true);
    assert.equal(decision.confidence, 1);
    assert.ok(decision.repositoryEvidence.length > 0, 'the evidence is the committed files');
  });

  it('keeps each component of a polyglot repository in its own language', () => {
    const architecture = plan('Add a health check to every service', [
      f('frontend/package.json', '{"name":"w"}'),
      f('frontend/tsconfig.json', '{}'),
      f('frontend/src/main.ts', ''),
      f('service/pyproject.toml', '[tool.poetry]\nname="s"\n'),
      f('worker/Cargo.toml', '[package]\nname="w"\n'),
      f('worker/src/main.rs', ''),
    ]);
    const byRoot = Object.fromEntries(architecture.components.map((c) => [c.root, c.language]));
    assert.equal(byRoot.frontend, 'typescript');
    assert.equal(byRoot.service, 'python');
    assert.equal(byRoot.worker, 'rust');
  });

  // The specific blocker that stops a Gradle service being regenerated as something else.
  it('reports a recognised but unbuildable component instead of replacing it', () => {
    const architecture = plan('Add an endpoint', [
      f('build.gradle.kts', 'plugins { kotlin("jvm") }'),
      f('src/main/kotlin/Main.kt', 'fun main() {}'),
    ]);
    assert.equal(architecture.blockers.length, 1);
    assert.match(architecture.blockers[0], /recognised .* but no runtime adapter can build it/);
    assert.match(architecture.blockers[0], /Nothing was executed/);
    assert.equal(architecture.components[0].adapterId, null);
  });
});

describe('stated preferences beat defaults, and coherence beats both', () => {
  it('honours a named language over the surface default', () => {
    // The API default is Python; naming Go must win.
    assert.deepEqual(languages('Build a Go API for managing tasks'), ['go']);
  });

  it('honours a named framework and records why', () => {
    const architecture = plan('Build a Python FastAPI task-management API');
    const framework = architecture.decisions.find((decision) => decision.category === 'framework');
    assert.equal(framework?.selection, 'fastapi');
    assert.match(framework!.reason, /names fastapi explicitly/i);
  });

  // A browser surface cannot run Rust. Applying the stated language everywhere would
  // produce a component that cannot execute at all.
  it('keeps a browser surface on TypeScript even when another language is named', () => {
    const architecture = plan('Build a Rust API with a web dashboard');
    const byRoot = Object.fromEntries(architecture.components.map((c) => [c.root, c.language]));
    assert.equal(byRoot.api, 'rust', 'the stated language applies where it can run');
    assert.equal(byRoot.web_frontend, 'typescript', 'and not where it cannot');

    const decision = architecture.decisions.find((d) => d.id === 'language:web_frontend');
    assert.match(decision!.reason, /cannot run in a browser/);
  });

  it('reports a language with no adapter as plannable but not buildable', () => {
    const architecture = plan('Build a Go API for managing tasks');
    assert.equal(architecture.components[0].adapterId, null);
    assert.match(architecture.blockers[0], /No runtime adapter implements go/);
    assert.match(
      architecture.decisions[0].validationMethod,
      /cannot validate/,
      'the decision must not claim a validation it cannot perform',
    );
  });
});

describe('no stack is forced where the product does not need it', () => {
  it('adds no database unless persistence was requested', () => {
    // §6 forbids assuming one. A CSV converter needs no datastore.
    const architecture = plan('Build a Rust CLI that converts CSV files to JSON');
    assert.equal(architecture.decisions.some((decision) => decision.category === 'database'), false);
  });

  it('chooses SQLite when persistence is needed but nothing was named', () => {
    const decision = plan('Build an API that stores tasks in a database').decisions
      .find((entry) => entry.category === 'database');
    assert.equal(decision?.selection, 'sqlite');
    assert.match(decision!.reason, /no server and no credentials/);
    assert.ok(decision!.alternativesConsidered.includes('postgresql'));
    assert.ok(decision!.tradeoffs.length > 0, 'the limitation must be recorded, not hidden');
  });

  it('honours a named datastore over the default', () => {
    const decision = plan('Build a Go service with PostgreSQL').decisions
      .find((entry) => entry.category === 'database');
    assert.equal(decision?.selection, 'postgresql');
  });

  it('does not default a CLI or a library to JavaScript', () => {
    // The bias worth guarding: Xroga is written in TypeScript, and defaulting everything
    // to the language the pipeline happens to be written in is exactly §6's complaint.
    assert.deepEqual(languages('Build a command-line tool for resizing images'), ['rust']);
    assert.deepEqual(languages('Build a Python package with no server'), ['python']);
  });
});

describe('every decision can be reviewed', () => {
  it('records reason, evidence, alternatives, tradeoffs and confidence', () => {
    // A decision with no reason cannot be reviewed, cannot be inherited by a follow-up
    // request, and cannot be argued with when it is wrong.
    for (const decision of plan('Build an API that stores tasks in a database').decisions) {
      assert.ok(decision.reason.length > 0, `${decision.id} has no reason`);
      assert.ok(typeof decision.confidence === 'number');
      assert.ok(decision.confidence >= 0 && decision.confidence <= 1);
      assert.ok(Array.isArray(decision.alternativesConsidered));
      assert.ok(decision.validationMethod.length > 0, `${decision.id} claims no way to validate itself`);
    }
  });

  it('carries the requirement evidence back to the surface that caused it', () => {
    const decision = plan('Build a Rust CLI that converts CSV files to JSON').decisions[0];
    assert.ok(
      decision.requirementEvidence.some((line) => /surface cli/.test(line)),
      'a language decision should name the surface that drove it',
    );
  });
});

describe('specs record what they could not determine', () => {
  it('records an unresolved question rather than inventing a surface', () => {
    const spec = synthesizeUniversalProductSpec({ prompt: 'make it better' });
    assert.deepEqual(spec.surfaces, []);
    assert.equal(spec.unresolvedQuestions.length, 1);
    assert.match(spec.unresolvedQuestions[0], /recorded rather than guessed/);
  });

  it('flags low-confidence surfaces as inferred rather than stated', () => {
    const spec = synthesizeUniversalProductSpec({ prompt: 'A tool that converts CSV files to JSON' });
    assert.ok(spec.inferredRequirements.length > 0);
    assert.match(spec.inferredRequirements[0], /confidence/);
  });

  it('reads packaging and storage requirements out of the request', () => {
    const spec = synthesizeUniversalProductSpec({
      prompt: 'Build a Python FastAPI task API with SQLite, tests and a Dockerfile',
    });
    assert.ok(spec.storageRequirements.length > 0);
    assert.ok(spec.packagingRequirements.some((requirement) => /container/.test(requirement)));
  });

  it('takes surface evidence from the repository over the prompt', () => {
    // A committed binary crate is stronger evidence of a CLI than any phrasing.
    const declarations = inferSurfaces('improve the tool', [
      f('Cargo.toml', '[package]\nname = "t"\n'),
      f('src/main.rs', 'fn main() {}'),
    ]);
    const cli = declarations.find((declaration) => declaration.surface === 'cli');
    assert.ok(cli, 'the repository establishes the surface');
    assert.ok(cli.evidence.some((line) => /main\.rs/.test(line)));
  });
});
