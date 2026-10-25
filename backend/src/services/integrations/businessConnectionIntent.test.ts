import assert from 'node:assert/strict';
import test from 'node:test';
import { connectionSearchTerms } from './businessConnectionIntent.js';

test('the reported Gmail request is routed to connection discovery', () => {
  const terms = connectionSearchTerms('we want to send an automatic email with the help of xroga from gmail we want to connect it now so give me an connect of gmail so we then connect it now');
  assert.ok(terms?.includes('gmail'));
});

for (const [request, expected] of [
  ['Please connect my Slack account', 'slack'],
  ['Link Notion to Xroga', 'notion'],
  ['Authorize Google Sheets so we can add rows', 'google sheets'],
  ['Use Canva and connect it first', 'canva'],
  ['Connect to Cal.com now', 'cal.com'],
] as const) {
  test(`connection discovery recognizes ${expected}`, () => {
    assert.ok(connectionSearchTerms(request)?.includes(expected));
  });
}

test('ordinary app actions do not turn into connection requests', () => {
  assert.equal(connectionSearchTerms('Send an email from Gmail to Alice'), null);
  assert.equal(connectionSearchTerms('Find contacts in my CRM and add them to Sheets'), null);
  assert.equal(connectionSearchTerms('Do not connect my Slack account'), null);
  assert.equal(connectionSearchTerms('Find the official NASA Artemis II mission page and give its title and source link.'), null);
  assert.equal(connectionSearchTerms('Give me a link to the official Gmail help page.'), null);
});

test('explicit link commands still reach app connection discovery', () => {
  assert.ok(connectionSearchTerms('Link Gmail to my Xroga account')?.includes('gmail'));
  assert.ok(connectionSearchTerms('Please link my Slack account')?.includes('slack'));
});

test('the named connection target outranks an app mentioned in the task context', () => {
  assert.equal(connectionSearchTerms('Read my Gmail, then connect Google Calendar so we can schedule a meeting')?.[0], 'google calendar');
});
