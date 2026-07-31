import assert from 'node:assert/strict';
import test from 'node:test';
import {
  SHOWCASE_COUNT,
  SHOWCASE_TEMPLATES,
  getAllShowcaseSlugs,
  getShowcaseById,
  getShowcaseBySlug,
  isLive,
  previewRouteFor,
} from './registry';

test('exposes exactly six products with unique ids and slugs', () => {
  assert.equal(SHOWCASE_TEMPLATES.length, 6);
  assert.equal(SHOWCASE_COUNT, 6);
  assert.equal(new Set(SHOWCASE_TEMPLATES.map((t) => t.id)).size, 6);
  assert.equal(new Set(SHOWCASE_TEMPLATES.map((t) => t.slug)).size, 6);
});

test('slugs are url-safe and match getAllShowcaseSlugs', () => {
  for (const template of SHOWCASE_TEMPLATES) {
    assert.match(template.slug, /^[a-z0-9]+(-[a-z0-9]+)*$/, template.slug);
  }
  assert.deepEqual(getAllShowcaseSlugs(), SHOWCASE_TEMPLATES.map((t) => t.slug));
});

test('lookup helpers resolve and reject cleanly', () => {
  const first = SHOWCASE_TEMPLATES[0];
  assert.equal(getShowcaseBySlug(first.slug)?.id, first.id);
  assert.equal(getShowcaseById(first.id)?.slug, first.slug);
  for (const bad of [undefined, null, '', 'nope', '../secrets', 'MODERN-BUSINESS-WEBSITE']) {
    assert.equal(getShowcaseBySlug(bad as string), null, String(bad));
  }
  assert.equal(getShowcaseById('not-a-template'), null);
});

test('only live templates advertise a preview route', () => {
  for (const template of SHOWCASE_TEMPLATES) {
    const route = previewRouteFor(template);
    if (isLive(template)) {
      assert.equal(route, `/showcase/${template.slug}/preview`);
    } else {
      // A card must not link to a preview that renders nothing.
      assert.equal(route, null, template.slug);
    }
  }
});

test('every template carries the metadata the UI renders', () => {
  for (const template of SHOWCASE_TEMPLATES) {
    assert.ok(template.name.length > 0, template.id);
    assert.ok(template.shortDescription.length > 0, template.id);
    assert.ok(template.longDescription.length > 0, template.id);
    assert.ok(template.capabilities.length >= 3, template.id);
    assert.ok(template.technologies.length >= 1, template.id);
    assert.ok(template.guidedQuestions.length >= 1, template.id);
    assert.ok(template.defaultBuildPrompt.length > 0, template.id);
    assert.match(template.templateVersion, /^\d+\.\d+\.\d+$/, template.id);
    assert.match(template.accent, /^#[0-9a-f]{6}$/i, template.id);
    assert.ok(['live', 'building'].includes(template.status), template.id);
  }
});

test('guided question ids are unique within a template and tiers are valid', () => {
  for (const template of SHOWCASE_TEMPLATES) {
    const ids = template.guidedQuestions.map((q) => q.id);
    assert.equal(new Set(ids).size, ids.length, template.id);
    for (const question of template.guidedQuestions) {
      assert.ok(['quick', 'advanced'].includes(question.tier), `${template.id}:${question.id}`);
      if (question.kind === 'choice') {
        assert.ok((question.choices?.length ?? 0) > 0, `${template.id}:${question.id}`);
      }
    }
    // Progressive disclosure needs at least one question in the first step.
    assert.ok(template.guidedQuestions.some((q) => q.tier === 'quick'), template.id);
  }
});

test('registry leaks no filesystem paths to the client bundle', () => {
  // Template *sources* are resolved server-side from an allow-list. Anything that
  // looks like a path here would mean the browser can influence what gets copied.
  const serialized = JSON.stringify(SHOWCASE_TEMPLATES);
  assert.ok(!serialized.includes('..'), 'registry contains a traversal-looking string');
  assert.ok(!/[A-Za-z]:\\\\/.test(serialized), 'registry contains an absolute Windows path');
  assert.ok(!serialized.includes('/backend/'), 'registry references a backend path');
});
