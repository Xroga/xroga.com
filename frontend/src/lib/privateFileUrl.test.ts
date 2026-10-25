import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isPrivateFileUrl } from './privateFileUrl';
test('file previews accept only authenticated same-origin private file routes',()=>{
  const url='/api/private-files/11111111-1111-4111-8111-111111111111/22222222-2222-4222-8222-222222222222';
  assert.equal(isPrivateFileUrl(url),true);assert.equal(isPrivateFileUrl(`${url}?link=fixture.signature`),true);
  for(const bad of ['data:text/html,unsafe','https://public.invalid/file','//public.invalid/file','javascript:alert(1)',`${url}?url=https://evil.invalid`,`${url}/../secret`])assert.equal(isPrivateFileUrl(bad),false);
});
