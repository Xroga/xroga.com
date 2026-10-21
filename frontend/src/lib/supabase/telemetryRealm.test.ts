import assert from 'node:assert/strict';
import {test} from 'node:test';
import {isProductionAuthBuild} from './config';
test('disposable, staging and hosted test realms cannot emit production analytics',()=>{
  assert.equal(isProductionAuthBuild('nzenxdfumxrnsmybazmo'),true);
  for(const realm of ['local-disposable','self-hosted-staging','abcdefghijklmnopqrst','', 'unknown'])assert.equal(isProductionAuthBuild(realm),false);
});
