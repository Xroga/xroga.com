import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export function checkStagingTemplate(value) {
  assert.equal(value.apiVersion, 'serving.knative.dev/v1');
  assert.equal(value.kind, 'Service');
  assert.equal(value.metadata.name, 'xroga-p3-staging-20261024');
  assert.equal(value.metadata.namespace, '574998934848');
  const annotations = value.metadata.annotations;
  assert.equal(annotations['run.googleapis.com/invoker-iam-disabled'], 'false');
  assert.equal(annotations['run.googleapis.com/maxScale'], '1');
  const template = value.spec.template, spec = template.spec;
  assert.equal(template.metadata.annotations['autoscaling.knative.dev/minScale'], '0');
  assert.equal(template.metadata.annotations['autoscaling.knative.dev/maxScale'], '1');
  assert.equal(template.metadata.annotations['run.googleapis.com/cpu-throttling'], 'true');
  assert.equal(template.metadata.annotations['run.googleapis.com/startup-cpu-boost'], 'false');
  assert.equal(spec.serviceAccountName, 'xroga-p3-staging-20261024@project-c40d4821-e647-4fa2-92d.iam.gserviceaccount.com');
  assert.equal(spec.containerConcurrency, 1);
  assert.equal(spec.timeoutSeconds, 30);
  assert.equal(spec.containers.length, 1);
  const container = spec.containers[0];
  assert.deepEqual(container.resources.limits, { cpu: '1', memory: '1Gi' });
  assert.deepEqual(container.ports, [{ containerPort: 8080 }]);
  assert.equal(container.command, undefined);
  assert.equal(container.args, undefined);
  const env = Object.fromEntries(container.env.map(row => [row.name, row]));
  assert.equal(Object.keys(env).length, container.env.length, 'Duplicate environment names');
  assert.deepEqual(Object.keys(env).sort(), ['FRONTEND_URL', 'NODE_ENV', 'SUPABASE_SERVICE_ROLE_KEY', 'SUPABASE_URL',
    'UNIVERSAL_AGENT_ENABLED', 'XROGA_CREDENTIAL_KMS_PROVIDER', 'XROGA_GOOGLE_CLOUD_KMS_KEY_NAME',
    'XROGA_LEGACY_CREDENTIAL_MIGRATION', 'XROGA_RELEASE_SHA'].sort());
  assert.equal(env.NODE_ENV.value, 'production');
  assert.equal(env.XROGA_RELEASE_SHA.value, 'cbc79b816a54d0d0c50841e4763087a8854771d1');
  assert.equal(env.XROGA_CREDENTIAL_KMS_PROVIDER.value, 'google_cloud');
  assert.equal(env.XROGA_GOOGLE_CLOUD_KMS_KEY_NAME.value,
    'projects/project-c40d4821-e647-4fa2-92d/locations/us-central1/keyRings/xroga-p3-verify-20261023/cryptoKeys/xroga-p3-staging-20261024');
  assert.equal(env.XROGA_LEGACY_CREDENTIAL_MIGRATION.value, 'disabled');
  assert.equal(env.UNIVERSAL_AGENT_ENABLED.value, 'off');
  for (const [name, secret] of [['SUPABASE_URL', 'url'], ['SUPABASE_SERVICE_ROLE_KEY', 'role']]) {
    assert.equal(env[name].value, undefined);
    assert.deepEqual(env[name].valueFrom, { secretKeyRef: { name: `xroga-p3-staging-supabase-${secret}`, key: '1' } });
  }
  assert.equal(container.startupProbe.httpGet.path, '/ready');
  assert.equal(container.startupProbe.periodSeconds * container.startupProbe.failureThreshold, 240);
  assert.equal(container.livenessProbe.httpGet.path, '/health');
  return { status: 'LOCAL_TEMPLATE_CONSTRAINTS_PASS_NOT_SERVER_DRY_RUN',
    deploymentReady: false, serverDryRunPerformed: false,
    missing: ['Itemized resource/IAM/budget approval', 'Confirmed isolated database and secret provenance',
      'Built backend image digest and source attestation', 'Existing exact runtime identity, key and secrets',
      'Server dry-run and effective IAM readback'] };
}

export function requireCandidateBinding({ projectRef, url, image }) {
  assert.match(projectRef, /^[a-z]{20}$/);
  assert.ok(!['nzenxdfumxrnsmybazmo', 'lztqfktsahpzitybthld'].includes(projectRef), 'Production or unrelated project denied');
  assert.equal(url, `https://${projectRef}.supabase.co`);
  assert.match(image, /^us-central1-docker\.pkg\.dev\/project-c40d4821-e647-4fa2-92d\/xroga-p3-staging\/api@sha256:[a-f0-9]{64}$/);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  console.log(JSON.stringify(checkStagingTemplate(JSON.parse(readFileSync('deploy/cloudrun/phase3-staging.template.json', 'utf8'))), null, 2));
}
