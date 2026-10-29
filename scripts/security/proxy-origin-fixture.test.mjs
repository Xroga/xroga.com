import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdtempSync, readdirSync, rmdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve, join, sep } from 'node:path';
import { spawn } from 'node:child_process';
import { safeTestEnvironment } from '../ci/run-baseline.mjs';

const require = createRequire(import.meta.url);
const { assertDisposableFixture, startProxyOriginFixture } = require('./proxy-origin-fixture.cjs');
const root = resolve(import.meta.dirname, '../..');
function child(code, env) {
  return new Promise((done, reject) => {
    const p = spawn(process.execPath, ['--import', 'tsx', '--input-type=module', '-e', code],
      { cwd: root, env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    let output = '';
    const timer = setTimeout(() => p.kill(), 10_000);
    p.stdout.on('data', x => { output += x; }); p.stderr.on('data', x => { output += x; });
    p.once('error', error => { clearTimeout(timer); reject(error); });
    p.once('close', status => { clearTimeout(timer); done({ status, output }); });
  });
}

test('proxy fixture refuses ordinary, production and incomplete environment configuration', () => {
  for (const env of [{}, { CI: 'true' }, { CI: 'true', XB01_DISPOSABLE_SUPABASE: '1',
    SUPABASE_URL: 'https://production.example.com', E2E_BACKEND_URL: 'http://127.0.0.1:4000' }]) {
    assert.throws(() => assertDisposableFixture(env));
  }
});

test('actual bounded GET retains URL/DNS admission and verified TLS through the narrow disposable fixture', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'xroga-proxy-origin-test-'));
  const env = { ...safeTestEnvironment(), CI: 'true', XB01_DISPOSABLE_SUPABASE: '1',
    SUPABASE_URL: 'http://127.0.0.1:54321', E2E_BACKEND_URL: 'http://127.0.0.1:4000',
    XB01_TEST_SOURCE_SHA: '0'.repeat(40), RUNNER_TEMP: directory,
    XB01_PROXY_ORIGIN_PRELOAD: '1', NODE_OPTIONS: `--require="${join(root, 'scripts/security/proxy-origin-fixture.cjs').split(sep).join('/')}"` };
  const fixture = await startProxyOriginFixture((req, res) => {
    res.writeHead(200, { 'Content-Type': req.url === '/html' ? 'text/html' : 'image/png' });
    res.end('SYNTHETIC_TLS_BYTES');
  }, env);
  try {
    const code = `
      import assert from 'node:assert/strict';
      import https from 'node:https';
      import {readFileSync} from 'node:fs';
      import {join} from 'node:path';
      import {boundedPublicGet} from './backend/src/security/boundedPublicGet.ts';
      const base=${JSON.stringify(fixture.publicBase)},limits={maxBytes:1024,timeoutMs:2000};
      for(const p of ['html','png','svg']){
        const r=await boundedPublicGet(base+'/'+p,limits);
        assert.equal(r.bytes.toString(),'SYNTHETIC_TLS_BYTES');assert.equal(r.finalUrl,base+'/'+p);
      }
      for(const denied of ['http://127.0.0.1/html','https://127.0.0.1/html',
        'https://proxy-origin-fixture.example.com:8443/html','https://169.254.169.254/html',
        base.replace(/[^/]+$/,'wrong-nonce')+'/html'])await assert.rejects(boundedPublicGet(denied,limits));
      const config=JSON.parse(readFileSync(join(process.env.RUNNER_TEMP,'xroga-proxy-origin-fixture.json'),'utf8'));
      assert.throws(()=>https.request(new URL(base+'/html'),{method:'GET',agent:false,
        headers:{Accept:'*/*','Accept-Encoding':'identity'},lookup:(_h,_o,cb)=>cb(null,[{address:'127.0.0.1',family:4}])}));
      await assert.rejects(new Promise((resolve,reject)=>{
        const r=https.get({hostname:'127.0.0.1',port:config.port,servername:config.hostname,
          path:'/',rejectUnauthorized:true},resolve);r.on('error',reject);
      }));
      console.log('PASS_CONTROLLED_DNS_PINNED_LOCAL_TLS_PRODUCTION_POLICY_UNCHANGED');
    `;
    const result = await child(code, env);
    assert.equal(result.status, 0, result.output);
    assert.match(result.output, /PASS_CONTROLLED_DNS_PINNED_LOCAL_TLS/);
    assert.equal(fixture.hits(), 3, 'Denied URL, nonce, pin and untrusted-certificate cases send no fixture HTTP bytes');
    const stale = await child(`import {boundedPublicGet} from './backend/src/security/boundedPublicGet.ts';
      import assert from 'node:assert/strict';await assert.rejects(boundedPublicGet(${JSON.stringify(fixture.publicBase + '/html')},{maxBytes:1024,timeoutMs:2000}));`,
    { ...env, XB01_TEST_SOURCE_SHA: '1'.repeat(40) });
    assert.equal(stale.status, 0, stale.output);
    assert.equal(fixture.hits(), 3, 'A different source cannot reuse fixture admission');
  } finally {
    await fixture.close();
    assert.deepEqual(readdirSync(directory), []);
    rmdirSync(directory);
  }
});
