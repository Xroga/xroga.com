import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { ProjectFile } from '../../ai/patches.js';
import { deriveBuildSpec } from '../spec.js';
import { deriveQaPlan } from './plan.js';
import { passedCheckIds, runQa } from './runner.js';
import type { QaDriver, QaPage, QaPlan, QaViewport } from './types.js';

const SITE = 'Build a premium modern website for a home renovation company with Home, Services, About, Projects and Contact pages.';
const SAAS = 'Build a task-management application with user accounts, dashboard, task creation, editing, completion, deletion, and saved data that remains after a refresh.';

const staticFiles: ProjectFile[] = [
  {
    path: 'index.html',
    content: `<!doctype html><html><head><meta name="viewport" content="width=device-width"></head><body>
      <nav><a href="#about">About</a><a href="#contact">Contact</a></nav><h1>Renovate</h1>
      <section id="about"><h2>About</h2></section>
      <form id="contact"><input name="email" type="email" required><textarea name="message" required></textarea><button type="submit">Send</button></form></body></html>`,
  },
];

const nextFiles: ProjectFile[] = ['app/page.tsx', 'app/login/page.tsx', 'app/dashboard/page.tsx'].map((path) => ({ path, content: 'export default function P(){return <a href="/login">Sign in</a>}' }));

describe('QA plan derivation', () => {
  it('derives route, responsive, navigation and form checks from a static site', () => {
    const { spec } = deriveBuildSpec(SITE);
    const plan = deriveQaPlan(spec, staticFiles);
    const ids = plan.checks.map((check) => check.id);
    assert.ok(ids.includes('route-x-desktop') || ids.some((id) => id.startsWith('route-')));
    assert.ok(ids.some((id) => id.startsWith('responsive-')));
    assert.ok(ids.includes('nav-anchor-about'));
    assert.ok(ids.includes('nav-anchor-contact'));
    assert.ok(ids.includes('form-0-rejects-empty'));
    assert.ok(ids.includes('form-0-feedback'));
    assert.ok(plan.checks.every((check) => check.derivedFrom.length > 0), 'every check traces to its source');
  });

  it('a read-only plan for a live deployment contains nothing that can write data', () => {
    const { spec } = deriveBuildSpec(SAAS);
    const full = deriveQaPlan(spec, [...nextFiles, { path: 'app/contact/page.tsx', content: '<form><input name="email" type="email" required><button>Send</button></form>' }]);
    const readOnly = deriveQaPlan(spec, [...nextFiles, { path: 'app/contact/page.tsx', content: '<form><input name="email" type="email" required><button>Send</button></form>' }], { readOnly: true });
    assert.ok(full.checks.some((check) => check.category === 'forms' || check.category === 'persistence'));
    assert.ok(readOnly.checks.length > 0 && readOnly.checks.length < full.checks.length);
    assert.ok(readOnly.checks.every((check) => !['forms', 'persistence', 'criterion'].includes(check.category)));
    assert.ok(readOnly.checks.every((check) => check.steps.every((step) => !['fill', 'expectFormRejectsEmpty', 'expectFeedbackAfter'].includes(step.op))));
    assert.ok(readOnly.notChecked.some((entry) => /Form submissions/.test(entry.criterion)));
    assert.ok(readOnly.checks.some((check) => check.category === 'auth'), 'anonymous access checks are kept');
  });

  it('plans an empty-submit validation check when the request asks for validation, even if the markup has no required fields', () => {
    const { spec } = deriveBuildSpec(`${SITE} Add a contact form with validation.`);
    const plan = deriveQaPlan(spec, [{ path: 'index.html', content: '<html><body><h1>x</h1><form><input name="email" type="email"><button>Go</button></form></body></html>' }]);
    assert.ok(plan.checks.some((check) => check.id === 'form-0-rejects-empty'));
  });

  it('plans auth checks and a persistence check that needs a database', () => {
    const { spec } = deriveBuildSpec(SAAS);
    const plan = deriveQaPlan(spec, nextFiles);
    const ids = plan.checks.map((check) => check.id);
    assert.ok(ids.includes('auth-login-fields'));
    assert.ok(ids.includes('auth-protected-dashboard'));
    const persistence = plan.checks.find((check) => check.category === 'persistence');
    assert.equal(persistence?.requires, 'database');
  });

  it('plans a link to a missing section so the defect can be caught', () => {
    const { spec } = deriveBuildSpec(SITE);
    const plan = deriveQaPlan(spec, [{ path: 'index.html', content: '<html><body><h1>x</h1><a href="#ghost">Ghost</a></body></html>' }]);
    assert.ok(plan.checks.some((check) => check.id === 'nav-anchor-ghost'));
  });

  it('records criteria it cannot check deterministically instead of passing them', () => {
    const { spec } = deriveBuildSpec(SITE);
    const plan = deriveQaPlan({ ...spec, acceptanceCriteria: ['The design feels premium and trustworthy.', 'The page shows "Request a quote"'] }, staticFiles);
    assert.ok(plan.notChecked.some((entry) => /premium/.test(entry.criterion)));
    assert.ok(plan.checks.some((check) => check.category === 'criterion' && check.steps.some((step) => step.op === 'expectText')));
  });
});

/** A scripted page: each path maps to a simple behaviour. Used only to test runner semantics. */
function fakeDriver(behaviour: { statusFor?: (path: string) => number | null; texts?: Record<string, string>; visible?: (selector: string, path: string) => boolean; overflow?: boolean; pageError?: string }): QaDriver {
  let opened = 0;
  return {
    name: 'fake',
    async browserVersion() {
      return 'fake-1';
    },
    async open(_viewport: QaViewport) {
      opened++;
      let path = '/';
      let pendingError: string | null = null;
      const page: QaPage = {
        async goto(next) {
          path = next;
          if (behaviour.pageError) pendingError = behaviour.pageError;
          return { status: behaviour.statusFor ? behaviour.statusFor(next) : 200 };
        },
        async click() {},
        async fill() {},
        async reload() {},
        async bodyText() {
          return behaviour.texts?.[path] ?? 'Welcome';
        },
        async isVisible(selector) {
          return behaviour.visible ? behaviour.visible(selector, path) : true;
        },
        currentPath: () => path,
        async hasHorizontalOverflow() {
          return Boolean(behaviour.overflow);
        },
        async hasViewportMeta() {
          return true;
        },
        async formIsInvalid() {
          return true;
        },
        async submitForm() {},
        async screenshot() {
          return Buffer.from('png-bytes');
        },
        drainDiagnostics() {
          const diagnostics = { consoleErrors: [], pageErrors: pendingError ? [pendingError] : [], failedRequests: [] };
          pendingError = null;
          return diagnostics;
        },
        async close() {},
      };
      void opened;
      return page;
    },
    async close() {},
  };
}

const smallPlan = (): QaPlan => ({
  version: 1,
  notChecked: [],
  checks: [
    { id: 'a', title: 'A', category: 'content', viewport: 'desktop', required: true, steps: [{ op: 'goto', path: '/' }, { op: 'expectVisible', selector: 'h1' }], derivedFrom: 't' },
    { id: 'b', title: 'B', category: 'responsive', viewport: 'mobile', required: true, steps: [{ op: 'goto', path: '/' }, { op: 'expectNoHorizontalOverflow' }], derivedFrom: 't' },
  ],
});

describe('QA runner', () => {
  it('passes only when every required check actually executed and passed', async () => {
    const report = await runQa({ plan: smallPlan(), driver: fakeDriver({}) });
    assert.equal(report.status, 'passed');
    assert.equal(report.executedChecks, 2);
    assert.deepEqual([...passedCheckIds(report)].sort(), ['a', 'b']);
  });

  it('never reports passed when nothing could run', async () => {
    const empty = await runQa({ plan: { version: 1, checks: [], notChecked: [] }, driver: fakeDriver({}) });
    assert.equal(empty.status, 'pending_runtime');
    const dbOnly = await runQa({
      plan: { version: 1, notChecked: [], checks: [{ id: 'p', title: 'P', category: 'persistence', viewport: 'desktop', required: true, steps: [], requires: 'database', derivedFrom: 't' }] },
      driver: fakeDriver({}),
    });
    assert.equal(dbOnly.status, 'pending_runtime');
    assert.equal(dbOnly.checks[0].executed, false);
    assert.match(dbOnly.checks[0].pendingReason ?? '', /database/);
  });

  it('is partial when some checks pass and a required one needs an unavailable environment', async () => {
    const plan = smallPlan();
    const withDb: QaPlan = { ...plan, checks: [...plan.checks, { id: 'p', title: 'P', category: 'persistence', viewport: 'desktop', required: true, steps: [], requires: 'database', derivedFrom: 't' }] };
    assert.equal((await runQa({ plan: withDb, driver: fakeDriver({}) })).status, 'partial');
  });

  it('fails with evidence, classifies the failure and bounds screenshots', async () => {
    const report = await runQa({ plan: smallPlan(), driver: fakeDriver({ overflow: true, visible: (selector) => selector !== 'h1' }) });
    assert.equal(report.status, 'failed');
    const failed = report.checks.filter((check) => check.status === 'failed');
    assert.equal(failed.length, 2);
    assert.equal(failed[0].evidence?.failedStep, 'see h1');
    assert.ok(failed[0].evidence?.screenshot);
    assert.equal(failed[0].failureClass, 'browser_assertion_failure');
  });

  it('classifies server errors, missing responses and uncaught page errors', async () => {
    const serverError = await runQa({ plan: smallPlan(), driver: fakeDriver({ statusFor: () => 500 }) });
    assert.equal(serverError.checks[0].failureClass, 'runtime_error');
    const noResponse = await runQa({ plan: smallPlan(), driver: fakeDriver({ statusFor: () => null }) });
    assert.equal(noResponse.checks[0].failureClass, 'preview_error');
    const thrown = await runQa({ plan: smallPlan(), driver: fakeDriver({ pageError: 'TypeError: x is undefined' }) });
    assert.equal(thrown.status, 'failed');
    assert.equal(thrown.checks[0].failureClass, 'runtime_error');
    assert.match(thrown.checks[0].evidence?.pageErrors[0] ?? '', /TypeError/);
  });

  it('flags a regression: a check that passed before and fails now', async () => {
    const report = await runQa({ plan: smallPlan(), driver: fakeDriver({ overflow: true }), previouslyPassed: new Set(['a', 'b']) });
    assert.equal(report.checks.find((check) => check.id === 'b')?.regression, true);
    assert.equal(report.checks.find((check) => check.id === 'a')?.regression, false);
  });

  it('reruns only the requested checks', async () => {
    const report = await runQa({ plan: smallPlan(), driver: fakeDriver({}), only: new Set(['b']) });
    assert.deepEqual(report.checks.map((check) => check.id), ['b']);
  });

  it('denies an anonymous protected page only when it is not served', async () => {
    const protectedPlan: QaPlan = { version: 1, notChecked: [], checks: [{ id: 'auth', title: 'x', category: 'auth', viewport: 'desktop', required: true, steps: [{ op: 'expectProtected', path: '/dashboard' }], derivedFrom: 't' }] };
    const served = await runQa({ plan: protectedPlan, driver: fakeDriver({ visible: () => false }) });
    assert.equal(served.checks[0].failureClass, 'authentication_error');
    const redirected = await runQa({ plan: protectedPlan, driver: fakeDriver({ statusFor: () => 401 }) });
    assert.equal(redirected.status, 'passed');
  });
});
