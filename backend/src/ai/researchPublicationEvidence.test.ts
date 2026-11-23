import assert from 'node:assert/strict';
import test from 'node:test';
import type { PublicGetResult } from '../security/egress/urlPolicy.js';
import { followOfficialPublication, isRequestedPublication, requestedPublication } from './researchPublicationEvidence.js';

const work = requestedPublication('Using only official pages (standards.example.org), find the Sample Accessibility Standard 2.0 criteria. Cite the final standard.')!;
const origin = 'https://standards.example.org';
const guide = origin + '/publications/handbook';
const record = origin + '/standards/sample-accessibility-standard-20/final';
const pdf = origin + '/documents/sample-accessibility-standard-20.pdf';
const slides = { url: origin + '/media/Presentations/sample.pdf', title: 'Sample Accessibility Standard 2.0', publish_date: null, excerpts: [] };
const sidePage = { url: guide, title: 'Handbook', publish_date: null, excerpts: [] };
const response = (url: string, contentType: string, content: string): PublicGetResult =>
  ({ bytes: Buffer.from(content), contentType, finalUrl: url, statusCode: 200 });

test('a same-title slide deck is not the named original publication', () => {
  assert.ok(work);
  assert.equal(isRequestedPublication(slides, work), false);
  assert.equal(isRequestedPublication({ url: record, title: 'Sample Accessibility Standard 2.0' }, work), true);
});

test('a missing original follows the publisher catalog and verifies the actual PDF', async () => {
  const requested: string[] = [];
  const original = await followOfficialPublication(work, [slides, sidePage], async url => {
    requested.push(url);
    if (url === guide) return response(url, 'text/html',
      '<a href="https://unrelated.example.net/standards/sample-accessibility-standard-20/final">other host</a>' +
      '<a href="/standards/sample-accessibility-standard-20/final?token=untrusted">private query</a>' +
      '<a href="/standards/sample-accessibility-standard-20/final">primary</a>');
    if (url === record) return response(url, 'text/html; charset=utf-8',
      '<meta name="citation_title" content="Sample Accessibility Standard 2.0"><a href="/documents/sample-accessibility-standard-20.pdf">PDF</a>');
    if (url === pdf) return response(url, 'application/pdf', 'Sample Accessibility Standard 2.0 criteria and their definitions.');
  }, async bytes => Buffer.from(bytes).toString('utf8'));
  assert.deepEqual(requested, [guide, record, pdf]);
  assert.equal(original?.url, record);
  assert.deepEqual(original?.publisherEvidence, { linkedFrom: guide, documentUrl: pdf });
  assert.match(original?.excerpts[0] ?? '', /criteria and their definitions/u);
});

test('usable original results do not need a publisher follow-up', async () => {
  const already = { url: record, title: 'Sample Accessibility Standard 2.0', publish_date: null, excerpts: ['criteria'] };
  assert.equal(await followOfficialPublication(work, [already], async () => { throw new Error('Unexpected read'); },
    async () => { throw new Error('Unexpected parse'); }), undefined);
});
