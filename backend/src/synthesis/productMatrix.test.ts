import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { planUniversalRun } from './universalFlow.js';
import { detectComposition } from './runtime/registry.js';
import type { ProjectFile } from '../ai/patches.js';
import { inferBehaviouralCapabilities } from './behavioralCapabilities.js';

/**
 * The launch-category product matrix, at the planning stage.
 *
 * Scope is stated first because it is the thing most likely to be over-read. **Nothing here
 * verifies a product category.** The command is explicit: "Do not call a category verified
 * merely because planning succeeded." No model is called, no sandbox runs, no repository is
 * written. What this covers is the part of the pipeline that is deterministic — request
 * understanding, ProductSpec, ArchitecturePlan, surface selection, language and runtime
 * selection, and whether validation commands can be planned at all.
 *
 * That part is worth pinning for two reasons.
 *
 * It is where the Product Surface Safety invariants live. "unknown product != website",
 * "CLI != website", "API != website" are decided here and nowhere else, and a regression in
 * them produces the single worst failure this system can have: a confident build of the
 * wrong kind of product.
 *
 * And it is where production run 68cd1d4f actually died. Seventeen files were generated and
 * then no runtime component could be detected, so zero validation commands were planned and
 * the run failed reporting a sandbox problem it never had. A category whose composition
 * cannot be detected can never be validated, so checking that here — for free — is checking
 * the precondition every later stage depends on.
 *
 * Thirteen further scenarios (Rust CLI, Python FastAPI, browser extension, Go, Flutter,
 * PHP/WordPress, JVM, .NET, Terraform, Solidity, polyglot, monorepo, unfamiliar repository)
 * are already covered in `followUpAndRegression.test.ts` and are deliberately not repeated.
 * This file adds only the launch categories that were not covered.
 */

const f = (path: string, content = ''): ProjectFile => ({ path, content });

const planOf = (prompt: string, files: ProjectFile[] = []) => planUniversalRun({ prompt, files });
const surfacesOf = (prompt: string, files: ProjectFile[] = []) =>
  planOf(prompt, files).spec.surfaces.map((declaration) => String(declaration.surface));
const languagesOf = (prompt: string, files: ProjectFile[] = []) =>
  [...new Set(planOf(prompt, files).architecture.components.map((component) => component.language))];

describe('launch category matrix — planning stage only', () => {
  it('SaaS infers a backend from sign-in, teams and invites', () => {
    // Was `web_frontend` alone: the visual surface was recognised and the functional
    // architecture was not, so the planned product had nowhere to keep a team or check a
    // password. Fixed by behavioural inference rather than a SaaS branch — authentication
    // and membership are capabilities, and capabilities imply a service.
    const found = surfacesOf(
      'Build a SaaS dashboard where users can sign in, create teams, invite members, manage team projects and view project activity.',
    );
    assert.ok(found.includes('web_frontend'), `surfaces: ${found.join(', ')}`);
    assert.ok(found.includes('api'), `no backend inferred: ${found.join(', ')}`);
  });

  it('booking plans rather than refusing', () => {
    // Was `refused_no_surface`. The request contains no surface noun at all — the verbs are
    // what carry the requirements, and "reserve"/"available"/"admins manage" imply shared
    // durable state with a single arbiter.
    const plan = planOf(
      'Build a booking application where customers can view available time slots, reserve a slot, cancel a reservation, and admins can manage availability.',
    );
    assert.notEqual(plan.status, 'refused_no_surface');
    const found = plan.spec.surfaces.map((s) => String(s.surface));
    assert.ok(found.includes('api'), `booking planned no service: ${found.join(', ')}`);
  });

  it('commerce plans rather than refusing', () => {
    const plan = planOf(
      'Build a small e-commerce application where customers can browse products, add items to a cart, place an order, and admins can manage products and order status.',
    );
    assert.notEqual(plan.status, 'refused_no_surface');
    const found = plan.spec.surfaces.map((s) => String(s.surface));
    assert.ok(found.includes('api'), `commerce planned no service: ${found.join(', ')}`);
  });

  it('a payment provider is not invented when payment was never requested', () => {
    // "Order" and "checkout" appear constantly in products that never take a card. Inventing
    // a payment integration is a real cost and a real compliance surface.
    const capabilities = inferBehaviouralCapabilities(
      'Build a small e-commerce application where customers can browse products, add items to a cart, place an order, and admins can manage products and order status.',
    ).map((signal) => signal.capability);
    assert.equal(capabilities.includes('payment'), false, `payment invented: ${capabilities.join(', ')}`);

    const asked = inferBehaviouralCapabilities('customers pay with a credit card at checkout').map((s) => s.capability);
    assert.ok(asked.includes('payment'), 'an explicit payment request was missed');
  });

  it('realtime is not invented when it was never requested', () => {
    const capabilities = inferBehaviouralCapabilities(
      'Build a booking application where customers reserve a slot and admins manage availability.',
    ).map((signal) => signal.capability);
    assert.equal(capabilities.includes('realtime'), false, `realtime invented: ${capabilities.join(', ')}`);
  });

  it('CRUD data application resolves to persistence, not a static page', () => {
    const found = surfacesOf(
      'Build a customer records application with create, read, update and delete backed by PostgreSQL',
    );
    assert.ok(found.includes('api') || found.includes('web_frontend'));
    assert.equal(found.includes('documentation_site'), false, 'a CRUD app was planned as documentation');
  });

  it('an authentication feature keeps the surface of the product it belongs to', () => {
    // An auth request is a feature, not a product category. Planning it as a standalone
    // website is how a login screen arrives with nothing behind it.
    const found = surfacesOf('Add email and password authentication with session expiry to the API');
    assert.ok(found.includes('api'), `auth feature resolved to ${found.join(', ')}`);
  });

  it('Python CLI is a CLI, not a website', () => {
    const found = surfacesOf('Build a Python command-line tool that renames files in bulk with a dry-run flag');
    assert.ok(found.includes('cli'), `surfaces: ${found.join(', ')}`);
    assert.equal(found.includes('web_frontend'), false, 'a Python CLI was planned as a website');
    assert.deepEqual(languagesOf('Build a Python command-line tool that renames files in bulk'), ['python']);
  });

  it('a Dockerised Go service keeps its language and is blocked before generation', () => {
    // Two properties at once. The language is not defaulted to JavaScript, and — because no
    // runtime adapter implements Go — the run is blocked at planning rather than generating
    // files nothing could validate. Refusing before generation is what makes an unsupported
    // runtime cost nothing instead of costing a full set of paid model calls.
    const plan = planOf('Build a Dockerised Go service that exposes a health endpoint');
    assert.deepEqual([...new Set(plan.architecture.components.map((c) => c.language))], ['go']);
    assert.equal(plan.status, 'blocked_no_adapter');
    assert.match(plan.blockers[0] ?? '', /No runtime adapter implements go/);
  });
});

describe('product surface safety — the invariants that prevent a confident wrong build', () => {
  const notAWebsite = (prompt: string) => {
    const found = surfacesOf(prompt);
    assert.equal(
      found.includes('web_frontend'),
      false,
      `"${prompt.slice(0, 48)}…" resolved to a website: ${found.join(', ')}`,
    );
  };

  it('a CLI is never a website', () => {
    notAWebsite('Build a Rust CLI that converts CSV files to JSON');
    notAWebsite('Build a Python command-line tool that renames files in bulk');
  });

  it('a library or package is never a website', () => {
    notAWebsite('Build a Python library for parsing ISO 8601 durations, published to PyPI');
  });

  it('infrastructure is never a website', () => {
    notAWebsite('Build a Terraform infrastructure module for an S3 bucket');
  });

  it('an unfamiliar request is not coerced into a website', () => {
    // The `(string & {})` in ProductSurface exists for exactly this: a genuinely new product
    // must be representable rather than rounded to the nearest known category.
    const found = surfacesOf('Build a MIDI sequencer that drives external hardware over USB');
    assert.equal(
      found.length === 1 && found[0] === 'web_frontend',
      false,
      `an unfamiliar request collapsed to a website: ${found.join(', ')}`,
    );
  });

  it('an unknown language is not defaulted to JavaScript', () => {
    const languages = languagesOf('Build an Elixir Phoenix service with a channel for live updates');
    assert.equal(languages.includes('javascript'), false, `languages: ${languages.join(', ')}`);
  });
});

describe('validation reachability — the precondition run 68cd1d4f failed', () => {
  /**
   * A category whose composition cannot be detected can never be validated: zero components
   * means zero validation commands, which `runValidationPlan` reports as tier `none` and the
   * run fails at validation having generated real files. Checking it here is free; checking
   * it in production cost eighteen paid model calls.
   */
  const detectsComponent = (label: string, files: ProjectFile[], expectedAdapter: string) => {
    it(`${label} is detectable, so validation can be planned`, () => {
      const composition = detectComposition(files);
      assert.ok(composition.components.length > 0, `${label}: no runtime component detected`);
      assert.equal(composition.components[0]!.adapterId, expectedAdapter);
    });
  };

  detectsComponent('a Node/TypeScript app', [f('package.json', '{"name":"app"}'), f('src/index.ts', '')], 'node');
  detectsComponent('a Python service', [f('pyproject.toml', '[project]\nname="svc"\n'), f('app/main.py', '')], 'python');
  detectsComponent('a Rust CLI', [f('Cargo.toml', '[package]\nname="cli"\n'), f('src/main.rs', '')], 'rust');

  it('a correct manifest yields real validation commands', () => {
    // The counterpart to the truncation test below, and the correction to an earlier reading
    // of run 68cd1d4f. Zero validations there were caused solely by the broken manifest path,
    // not by a missing capability: with a correct manifest both ecosystems plan a full set.
    const rust = planUniversalRun({
      prompt: 'Build a Rust CLI that converts CSV files to JSON',
      files: [
        f('Cargo.toml', '[package]\nname = "csv2json"\nversion = "0.1.0"\nedition = "2021"\n'),
        f('src/main.rs', 'fn main() {}\n'),
        f('tests/cli.rs', '#[test]\nfn works() {}\n'),
      ],
    });
    // Asserted on phases rather than on command strings: the phase is what the run depends
    // on, and a toolchain that swapped `cargo test` for `cargo nextest` would still be
    // validating tests.
    const phases = rust.validations.map((v) => String(v.phase));
    assert.ok(phases.includes('test'), `rust phases: ${phases.join(', ')}`);
    assert.ok(phases.includes('build'), `rust phases: ${phases.join(', ')}`);
    assert.ok(
      rust.validations.every((v) => v.command.command === 'cargo'),
      'a rust component planned a non-cargo command',
    );

    const node = planUniversalRun({
      prompt: 'Build a dashboard',
      files: [f('package.json', '{"name":"app","scripts":{"build":"next build","test":"vitest"}}'), f('src/index.ts', '')],
    });
    assert.ok(node.validations.length >= 4, `node planned ${node.validations.length} validations`);
  });

  it('a manifest with a truncated extension is not detectable — the 68cd1d4f failure', () => {
    // Kept as a test rather than a comment because it is the shape of a real production
    // failure, and because it shows why PR #510 rejects such a plan before generating files
    // rather than after.
    const composition = detectComposition([f('package.', '{"name":"app"}'), f('src/index.ts', '')]);
    assert.equal(
      composition.components.length,
      0,
      'a truncated manifest name was detected, so this test no longer describes the failure',
    );
  });
});
