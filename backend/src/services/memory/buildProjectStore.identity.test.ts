import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { projectIdentityId } from './buildProjectStore.js';

describe('repository project identity', () => {
  it('is stable for arbitrary repository casing and GitHub URL forms', () => {
    const userId = '86cf908b-274f-44ac-acff-5ada1baf5248';
    const plain = projectIdentityId(userId, 'Generated-Org/strange-repo-4817');
    const url = projectIdentityId(userId, 'https://github.com/generated-org/STRANGE-repo-4817.git');
    assert.equal(plain, url);
    assert.match(plain ?? '', /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });

  it('isolates repositories and users without relying on known project names', () => {
    const first = projectIdentityId('9e1bcb09-d991-4209-ad5e-c80067368511', 'org-a/repo-x');
    assert.notEqual(first, projectIdentityId('9e1bcb09-d991-4209-ad5e-c80067368511', 'org-a/repo-y'));
    assert.notEqual(first, projectIdentityId('43e1acb0-38aa-43fb-bc29-c8f6c65aebde', 'org-a/repo-x'));
  });

  it('refuses malformed or missing repository identity', () => {
    assert.equal(projectIdentityId('user', 'one-part'), null);
    assert.equal(projectIdentityId('', 'owner/repository'), null);
  });
});
