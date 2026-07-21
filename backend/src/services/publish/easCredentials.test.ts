import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { packageIdFromProjectName } from './easCredentials.js';

describe('packageIdFromProjectName', () => {
  it('matches Expo scaffold package style', () => {
    assert.equal(packageIdFromProjectName('My Cool App'), 'com.xroga.mycoolapp');
    assert.equal(packageIdFromProjectName('hello-world'), 'com.xroga.helloworld');
  });

  it('falls back safely', () => {
    assert.equal(packageIdFromProjectName(''), 'com.xroga.app');
    assert.equal(packageIdFromProjectName(null), 'com.xroga.app');
  });
});
