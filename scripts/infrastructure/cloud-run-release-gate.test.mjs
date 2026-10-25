import test from 'node:test';
import assert from 'node:assert/strict';
import { validateCloudRunRelease } from './cloud-run-release-gate.mjs';

// Synthetic deployment readbacks only. No fixture is live acceptance evidence.
function fixture() {
  const project = 'synthetic-project';
  const expected = { project, sourceSha:'a'.repeat(40), service:'synthetic-api',
    image:`us-east4-docker.pkg.dev/${project}/api/forward@sha256:${'b'.repeat(64)}`,
    recoveryImage:`us-east4-docker.pkg.dev/${project}/api/recovery@sha256:${'c'.repeat(64)}`,
    serviceAccount:`synthetic-runtime@${project}.iam.gserviceaccount.com`,
    keyName:`projects/${project}/locations/us-central1/keyRings/synthetic/cryptoKeys/synthetic`,
    minInstances:1, maxInstances:1, plainEnvironment:{}, secretBindings:[{name:'SYNTHETIC_SECRET',secret:'synthetic',version:'1'}] };
  const actual = { service:{metadata:{name:expected.service},status:{conditions:[{type:'Ready',status:'True'}]},spec:{template:{
    metadata:{annotations:{'run.googleapis.com/cpu-throttling':'false','autoscaling.knative.dev/minScale':'1','autoscaling.knative.dev/maxScale':'1'}},
    spec:{serviceAccountName:expected.serviceAccount,timeoutSeconds:3600,containers:[{image:expected.image,
      resources:{limits:{cpu:'1000m',memory:'1Gi'}},env:[
        {name:'NODE_ENV',value:'production'}, {name:'XROGA_CREDENTIAL_KMS_PROVIDER',value:'google_cloud'},
        {name:'XROGA_GOOGLE_CLOUD_AUTH_MODE',value:'metadata_adc'}, {name:'XROGA_GOOGLE_CLOUD_KMS_KEY_NAME',value:expected.keyName},
        {name:'SYNTHETIC_SECRET',valueFrom:{secretKeyRef:{name:'synthetic',key:'1'}}},
      ]}]}}}}, health:{status:'ok',release:expected.sourceSha},readiness:{status:'ready',release:expected.sourceSha},
    recovery:{image:expected.recoveryImage,verifiedDigest:`sha256:${'c'.repeat(64)}`},deploymentTrigger:{disabled:true} };
  return {actual, expected};
}

test('exact synthetic readback passes only the native API preflight', () => {
  const {actual,expected}=fixture();
  assert.equal(validateCloudRunRelease(actual,expected).result, 'PASS_NATIVE_API_PREFLIGHT_NOT_CUTOVER_ACCEPTANCE');
});

test('deployment guard denies image, identity, secret, execution-lifecycle and recovery drift', () => {
  const changes = [
    a=>{a.service.spec.template.spec.containers[0].image='registry.fly.io/synthetic:latest';},
    a=>{a.service.spec.template.spec.serviceAccountName='wrong@synthetic-project.iam.gserviceaccount.com';},
    a=>{a.service.spec.template.spec.containers[0].env.push({name:'GOOGLE_APPLICATION_CREDENTIALS',value:'PRIVATE_CANARY'});},
    a=>{a.service.spec.template.spec.containers[0].env.push({name:'XROGA_RELEASE_SHA',value:'a'.repeat(40)});},
    a=>{a.service.spec.template.spec.containers[0].env.push({name:'UNREVIEWED_API_KEY',value:'PRIVATE_CANARY'});},
    a=>{a.service.spec.template.spec.containers[0].env[4].valueFrom.secretKeyRef.key='latest';},
    a=>{a.service.spec.template.spec.containers[0].env[4]={name:'SYNTHETIC_SECRET',value:'PRIVATE_CANARY'};},
    a=>{a.service.spec.template.metadata.annotations['run.googleapis.com/cpu-throttling']='true';},
    a=>{a.service.spec.template.metadata.annotations['autoscaling.knative.dev/minScale']='0';},
    a=>{a.service.spec.template.metadata.annotations['autoscaling.knative.dev/maxScale']='100';},
    a=>{a.service.spec.template.spec.timeoutSeconds=300;},
    a=>{a.service.spec.template.spec.containers[0].resources.limits.memory='16Gi';},
    a=>{a.health.release='unavailable';}, a=>{a.readiness.status='not_ready';},
    a=>{a.recovery.verifiedDigest=`sha256:${'d'.repeat(64)}`;},
    a=>{a.deploymentTrigger.disabled=false;}, a=>{a.service.status.conditions=[];},
  ];
  for (const mutate of changes) {
    const {actual,expected}=fixture();mutate(actual);
    assert.throws(()=>validateCloudRunRelease(actual,expected), error=>
      /^[A-Z_]+$/.test(error.message) && !error.message.includes('PRIVATE_CANARY'));
  }
});

test('a weakened expected contract cannot select tags, foreign recovery or mutable secrets', () => {
  for (const mutate of [e=>{e.image=e.image.split('@')[0]+':latest';},
    e=>{e.recoveryImage=e.image;}, e=>{e.secretBindings=[];},
    e=>{e.secretBindings[0].version='latest';}, e=>{e.maxInstances=100;},e=>{e.sourceSha='unknown';},
    e=>{e.plainEnvironment={UNKNOWN_API_KEY:'PRIVATE_CANARY'};},
    e=>{e.plainEnvironment={CALLBACK_URL:'https://xroga-api.fly.dev'};}]) {
    const {actual,expected}=fixture();mutate(expected);
    assert.throws(()=>validateCloudRunRelease(actual,expected));
  }
});
