import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { checkStagingTemplate, requireCandidateBinding } from './check-cloudrun-staging.mjs';
const template = JSON.parse(readFileSync(new URL('../../deploy/cloudrun/phase3-staging.template.json', import.meta.url), 'utf8'));

test('staging constraints pass without pretending deployment or server validation occurred', () => {
  const result = checkStagingTemplate(template);
  assert.equal(result.deploymentReady, false);
  assert.equal(result.serverDryRunPerformed, false);
  assert.equal(result.missing.length, 5);
});

test('refuses IAM bypass, excess scaling, unmanaged keys, plaintext DB and added provider credentials', () => {
  for (const mutate of [v => v.metadata.annotations['run.googleapis.com/invoker-iam-disabled'] = 'true',
    v => v.spec.template.spec.containerConcurrency = 80,
    v => v.spec.template.metadata.annotations['autoscaling.knative.dev/maxScale'] = '10',
    v => v.spec.template.spec.containers[0].env.find(e => e.name === 'SUPABASE_URL').value = 'https://production.invalid',
    v => v.spec.template.spec.containers[0].env.push({ name: 'GOOGLE_APPLICATION_CREDENTIALS', value: '/key.json' }),
    v => v.spec.template.spec.containers[0].env.find(e => e.name === 'XROGA_LEGACY_CREDENTIAL_MIGRATION').value = 'enabled']) {
    const changed = structuredClone(template); mutate(changed);
    assert.throws(() => checkStagingTemplate(changed));
  }
});

test('candidate binding refuses production, unrelated DBs, mismatched URL and image tags', () => {
  const input = { projectRef: 'abcdefghijklmnopqrst', url: 'https://abcdefghijklmnopqrst.supabase.co',
    image: 'us-central1-docker.pkg.dev/project-c40d4821-e647-4fa2-92d/xroga-p3-staging/api@sha256:' + 'a'.repeat(64) };
  requireCandidateBinding(input);
  for (const change of [{ projectRef: 'nzenxdfumxrnsmybazmo', url: 'https://nzenxdfumxrnsmybazmo.supabase.co' },
    { projectRef: 'lztqfktsahpzitybthld', url: 'https://lztqfktsahpzitybthld.supabase.co' },
    { url: 'https://nzenxdfumxrnsmybazmo.supabase.co' }, { image: 'api:latest' }]) {
    assert.throws(() => requireCandidateBinding({ ...input, ...change }));
  }
});
