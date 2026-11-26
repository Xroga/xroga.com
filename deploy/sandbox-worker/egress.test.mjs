import test from 'node:test';
import assert from 'node:assert/strict';
import net from 'node:net';
import { allowedHostsFromEnv, isPublicAddress, startEgressProxy, DEFAULT_ALLOWED_HOSTS } from './egress.mjs';

test('only globally routable addresses are public: private, loopback, link-local, metadata and mapped forms are not', () => {
  for (const ok of ['151.101.0.223', '8.8.8.8', '2606:4700:4700::1111', '::ffff:8.8.8.8']) assert.equal(isPublicAddress(ok), true, ok);
  for (const bad of ['127.0.0.1', '10.0.0.1', '172.16.5.5', '172.31.255.255', '192.168.1.1', '169.254.169.254', '100.64.0.1', '0.0.0.0', '224.0.0.1', '198.18.0.1',
    '::1', '::', 'fe80::1', 'fc00::1', 'fd12::1', '::ffff:169.254.169.254', '::ffff:10.0.0.1', '2001:db8::1', 'not-an-ip', '']) assert.equal(isPublicAddress(bad), false, bad);
});

test('the allowlist is the package registries plus operator-named hosts only; malformed names are ignored', () => {
  assert.deepEqual(allowedHostsFromEnv({}), DEFAULT_ALLOWED_HOSTS);
  const hosts = allowedHostsFromEnv({ XROGA_WORKER_ALLOWED_HOSTS: 'Data.Example.org, bad host, *.evil.com, 10.0.0.1, localhost' });
  assert.deepEqual(hosts, [...DEFAULT_ALLOWED_HOSTS, 'data.example.org']);
});

/** Opens a CONNECT to the proxy and returns the first response line and the open socket. */
function connect(port, target) {
  return new Promise((resolve, reject) => {
    const socket = net.connect(port, '127.0.0.1', () => socket.write(`CONNECT ${target} HTTP/1.1\r\nHost: ${target}\r\n\r\n`));
    let buffer = '';
    socket.on('data', chunk => { buffer += chunk; if (buffer.includes('\r\n\r\n')) resolve({ line: buffer.split('\r\n')[0], socket }); });
    socket.on('error', reject);
    socket.on('close', () => resolve({ line: buffer.split('\r\n')[0] || 'closed', socket }));
  });
}

async function withProxy(options, run) {
  const proxy = startEgressProxy({ listen: 0, ...options });
  await new Promise(resolve => proxy.server.once('listening', resolve));
  try { await run(proxy.server.address().port, proxy); } finally { await proxy.close(); }
}

test('policy: an allowlisted host on 443 is tunnelled to the address that was checked; everything else is refused before any dial', async () => {
  const dialled = [];
  const echo = net.createServer(socket => socket.on('data', chunk => socket.write(chunk))).listen(0, '127.0.0.1');
  await new Promise(resolve => echo.once('listening', resolve));
  const lookup = async host => (host === 'rebind.pypi.org' ? [{ address: '169.254.169.254' }] : host === 'mixed.pypi.org' ? [{ address: '8.8.8.8' }, { address: '10.0.0.5' }] : [{ address: '151.101.0.223' }]);
  const dial = (address, port) => { dialled.push([address, port]); return net.connect(echo.address().port, '127.0.0.1'); };
  try {
    await withProxy({ allowedHosts: ['pypi.org', 'rebind.pypi.org', 'mixed.pypi.org'], lookup, dial }, async (port, proxy) => {
      const ok = await connect(port, 'pypi.org:443');
      assert.match(ok.line, /^HTTP\/1\.1 200/);
      const echoed = await new Promise(resolve => { ok.socket.once('data', data => resolve(data.toString())); ok.socket.write('ping'); });
      assert.equal(echoed, 'ping');
      ok.socket.destroy();
      assert.deepEqual(dialled, [['151.101.0.223', 443]], 'the checked address is the one dialled, not the name');
      for (const target of ['example.com:443', 'metadata.google.internal:443', 'pypi.org:80', 'pypi.org:8443', 'sub.pypi.org:443', 'pypi.org.evil.com:443', '169.254.169.254:443', 'pypi.org', 'pypi.org:443@evil.com:443']) {
        assert.match((await connect(port, target)).line, /^HTTP\/1\.1 (403|400)/, target);
      }
      assert.match((await connect(port, 'rebind.pypi.org:443')).line, /^HTTP\/1\.1 403/, 'an allowed name that resolves to the metadata address is refused');
      assert.match((await connect(port, 'mixed.pypi.org:443')).line, /^HTTP\/1\.1 403/, 'one private answer refuses the name');
      assert.equal(dialled.length, 1, 'no refused request ever dialled out');
      assert.ok(proxy.stats.refused >= 10);
    });
  } finally { echo.close(); }
});

test('only CONNECT is served, and the tunnel count is bounded', async () => {
  const hold = net.createServer(() => undefined).listen(0, '127.0.0.1');
  await new Promise(resolve => hold.once('listening', resolve));
  try {
    await withProxy({ allowedHosts: ['pypi.org'], maxTunnels: 1, lookup: async () => [{ address: '151.101.0.223' }], dial: () => net.connect(hold.address().port, '127.0.0.1') }, async port => {
      const plain = await fetch(`http://127.0.0.1:${port}/simple/`);
      assert.equal(plain.status, 405);
      const first = await connect(port, 'pypi.org:443');
      assert.match(first.line, /^HTTP\/1\.1 200/);
      assert.match((await connect(port, 'pypi.org:443')).line, /^HTTP\/1\.1 429/);
      first.socket.destroy();
    });
  } finally { hold.close(); }
});
