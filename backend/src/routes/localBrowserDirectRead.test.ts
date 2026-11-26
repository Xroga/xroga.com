import assert from 'node:assert/strict';
import { test } from 'node:test';
import { isPlainOpenAndRead, namesSite } from './localBrowserDirectRead.js';

test('only a plain open-one-site-and-read request is eligible for a direct completion', () => {
  for (const goal of [
    'Open chatgpt.com and read the first visible heading.',
    'open https://example.com and tell me the heading of the page',
    'Go to iana.org then read the title',
    "Open example.com, what's the first headline?",
  ]) assert.equal(isPlainOpenAndRead(goal), true, goal);
  for (const goal of [
    'Open example.com and click the first link and read the heading',
    'Open example.com and read the heading of each section',
    'Open example.com and summarize the page',
    'Open example.com and iana.org and read the heading',
    'Read the heading of example.com',
    'Open example.com',
    'Open example.com and search for cats',
    'Open example.com and read the heading if it says Example',
    'Open example.com and read the heading\nthen fill the form',
    'Compare items',
    '',
  ]) assert.equal(isPlainOpenAndRead(goal), false, goal);
});

test('the answer has to name the site the run started on', () => {
  assert.equal(namesSite('The first heading on example.com is "X".', 'https://www.example.com/'), true);
  assert.equal(namesSite('The first heading on other.test is "X".', 'https://example.com/'), false);
  assert.equal(namesSite('anything', 'not a url'), false);
});
