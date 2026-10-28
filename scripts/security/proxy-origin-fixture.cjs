// Test-only I/O seam for the real Next proxy routes. Never imported by application code.
// The production URL/DNS policy still executes. Only this exact fixture's DNS and
// socket are controlled, with TLS hostname/certificate verification retained.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const https = require('node:https');
const dns = require('node:dns/promises');
const { syncBuiltinESMExports } = require('node:module');
const { execFileSync } = require('node:child_process');
const { randomUUID } = require('node:crypto');

const HOST = 'proxy-origin-fixture.example.com';
const PUBLIC_ADDRESS = '8.8.8.8'; // Synthetic DNS answer, no traffic is sent to this IP.
function assertDisposableFixture(env = process.env) {
  assert.equal(env.CI, 'true');
  assert.equal(env.XB01_DISPOSABLE_SUPABASE, '1');
  assert.equal(env.SUPABASE_URL, 'http://127.0.0.1:54321');
  assert.equal(env.E2E_BACKEND_URL, 'http://127.0.0.1:4000');
  assert.match(env.XB01_TEST_SOURCE_SHA ?? '', /^[a-f0-9]{40}$/);
  assert.ok(env.RUNNER_TEMP && path.isAbsolute(env.RUNNER_TEMP));
  return path.resolve(env.RUNNER_TEMP);
}
function configurationPath(env = process.env) {
  return path.join(assertDisposableFixture(env), 'xroga-proxy-origin-fixture.json');
}
function readConfiguration(env = process.env) {
  const config = JSON.parse(fs.readFileSync(configurationPath(env), 'utf8'));
  assert.equal(config.version, 1);
  assert.equal(config.sourceSha, env.XB01_TEST_SOURCE_SHA);
  assert.equal(config.hostname, HOST);
  assert.match(config.nonce, /^[a-f0-9-]{36}$/);
  assert.ok(Number.isInteger(config.port) && config.port > 1024 && config.port < 65536);
  assert.match(config.certificate, /^-----BEGIN CERTIFICATE-----/);
  return config;
}

async function startProxyOriginFixture(handler, env = process.env) {
  const root = assertDisposableFixture(env), rendezvous = configurationPath(env);
  assert.equal(fs.existsSync(rendezvous), false, 'Refuse stale or concurrent fixture configuration');
  const directory = fs.mkdtempSync(path.join(root, 'xroga-proxy-origin-'));
  const keyPath = path.join(directory, 'key.pem'), certPath = path.join(directory, 'cert.pem');
  execFileSync('openssl', ['req', '-x509', '-newkey', 'ec', '-pkeyopt', 'ec_paramgen_curve:P-256',
    '-nodes', '-keyout', keyPath, '-out', certPath, '-days', '1', '-subj', `/CN=${HOST}`,
    '-addext', `subjectAltName=DNS:${HOST}`, '-addext', 'basicConstraints=critical,CA:TRUE'],
  { stdio: 'pipe', windowsHide: true, timeout: 10_000 });
  fs.chmodSync(keyPath, 0o600);
  const nonce = randomUUID(), certificate = fs.readFileSync(certPath, 'utf8');
  let hits = 0;
  const server = https.createServer({ key: fs.readFileSync(keyPath), cert: certificate }, (req, res) => {
    if (req.headers.host !== HOST || !['html', 'png', 'svg'].some(p => req.url === `/${nonce}/${p}`)) {
      res.writeHead(404); res.end(); return;
    }
    hits++;
    req.url = req.url.slice(nonce.length + 1);
    handler(req, res);
  });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  const port = server.address().port;
  fs.writeFileSync(rendezvous, JSON.stringify({ version: 1, sourceSha: env.XB01_TEST_SOURCE_SHA,
    hostname: HOST, nonce, port, certificate }), { flag: 'wx', mode: 0o600 });
  return {
    publicBase: `https://${HOST}/${nonce}`,
    hits: () => hits,
    close: async () => {
      server.closeAllConnections();
      await new Promise((resolve, reject) => server.close(e => e ? reject(e) : resolve()));
      assert.equal(readConfiguration(env).nonce, nonce, 'Never remove another fixture');
      fs.unlinkSync(rendezvous);
      fs.unlinkSync(keyPath); fs.unlinkSync(certPath); fs.rmdirSync(directory);
    },
  };
}

function installProxyOriginTransport(env = process.env) {
  assertDisposableFixture(env);
  const originalLookup = dns.lookup, originalRequest = https.request;
  dns.lookup = async function (hostname, options) {
    if (hostname !== HOST) return originalLookup.apply(this, arguments);
    readConfiguration(env);
    assert.equal(options?.all, true);
    assert.equal(options?.verbatim, true);
    return [{ address: PUBLIC_ADDRESS, family: 4 }];
  };
  https.request = function (url, options, callback) {
    if (!(url instanceof URL) || url.hostname !== HOST) return originalRequest.apply(this, arguments);
    const config = readConfiguration(env);
    assert.equal(url.protocol, 'https:'); assert.equal(url.port, '');
    assert.equal(url.username, ''); assert.equal(url.password, ''); assert.equal(url.search, '');
    assert.ok(['html', 'png', 'svg'].some(p => url.pathname === `/${config.nonce}/${p}`));
    assert.equal(options.method, 'GET'); assert.equal(options.agent, false);
    assert.notEqual(options.rejectUnauthorized, false);
    assert.deepEqual(Object.keys(options.headers).map(k => k.toLowerCase()).sort(), ['accept', 'accept-encoding']);
    let pinned;
    options.lookup(HOST, { all: true }, (error, addresses) => { assert.ifError(error); pinned = addresses; });
    assert.deepEqual(pinned, [{ address: PUBLIC_ADDRESS, family: 4 }], 'The actual policy must supply its pinned public lookup');
    return originalRequest.call(this, url, { ...options, hostname: '127.0.0.1', port: config.port,
      servername: HOST, ca: config.certificate, lookup: undefined,
      headers: { ...options.headers, Host: HOST } }, callback);
  };
  syncBuiltinESMExports();
}

module.exports = { assertDisposableFixture, startProxyOriginFixture, installProxyOriginTransport };
if (process.env.XB01_PROXY_ORIGIN_PRELOAD === '1') installProxyOriginTransport();
