import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  CHAT_SYSTEM,
  PUBLIC_CAPABILITY_RESPONSE,
  isPublicCapabilityQuestion,
} from './prompts.js';

const INTERNAL_MARKERS = [
  'conversation.respond',
  'software.implement',
  'validation.run',
  'repository.read',
  'repository.write',
  'research.public-web',
  'research.x',
  'business.read',
  'business.action',
  'attachment.analyze',
  'requiredAuthorities',
  'selectedModel',
  'fallbackModels',
  'toolCallId',
  'runtimeSessionId',
];

test('generic capability questions are recognized without broadening to arbitrary technical inspection', () => {
  assert.equal(isPublicCapabilityQuestion('What can you do?'), true);
  assert.equal(isPublicCapabilityQuestion('what can Xroga do'), true);
  assert.equal(isPublicCapabilityQuestion('what are your capabilities?'), true);
  assert.equal(isPublicCapabilityQuestion('show me the business.read implementation'), false);
});

test('the public capability response contains no internal runtime identifiers', () => {
  for (const marker of INTERNAL_MARKERS) {
    assert.doesNotMatch(PUBLIC_CAPABILITY_RESPONSE, new RegExp(marker.replace('.', '\\.'), 'i'));
  }

  assert.match(PUBLIC_CAPABILITY_RESPONSE, /research current information/i);
  assert.match(PUBLIC_CAPABILITY_RESPONSE, /connected apps/i);
  assert.doesNotMatch(PUBLIC_CAPABILITY_RESPONSE, /Great question|Certainly|Absolutely|As an AI/i);
});

test('the chat system explicitly treats product truth as private runtime context', () => {
  assert.match(CHAT_SYSTEM, /PRIVATE runtime context/);
  assert.match(CHAT_SYSTEM, /never expose internal capability IDs/i);
});
