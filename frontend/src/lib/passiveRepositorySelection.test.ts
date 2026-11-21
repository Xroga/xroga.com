import test from 'node:test';
import assert from 'node:assert/strict';
import { passiveRepositorySelection } from './passiveRepositorySelection';

const base = {repositories:['Owner/old','Owner/chosen'],selected:null,fresh:false,projectSelected:false,defaultRepository:'Owner/old',repositoryLocked:false};
test('New Work and a repository-free project never inherit account GitHub defaults', () => {
  assert.equal(passiveRepositorySelection({...base,projectSelected:true}), null);
  assert.equal(passiveRepositorySelection({...base,fresh:true}), null);
  assert.equal(passiveRepositorySelection({...base,projectSelected:true,repositoryLocked:true}), null);
  assert.equal(passiveRepositorySelection({...base,selected:'Owner/chosen',projectSelected:true}), 'Owner/chosen');
  assert.equal(passiveRepositorySelection(base), null);
  assert.equal(passiveRepositorySelection({...base,repositoryLocked:true}), null);
  assert.equal(passiveRepositorySelection({...base,defaultRepository:'missing',repositoryLocked:false}), null);
});

test('a delayed passive refresh must re-evaluate an explicit selection made while it waited', async () => {
  let state = {...base};
  let release!: () => void;
  const waiting = new Promise<void>(resolve => { release = resolve; });
  const refresh = (async () => { await waiting; return passiveRepositorySelection(state); })();
  state = {...state,projectSelected:true};
  release();
  assert.equal(await refresh, null);
});
