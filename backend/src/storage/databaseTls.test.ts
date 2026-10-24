import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import net from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, describe, it } from 'node:test';
import pg from 'pg';
import { SUPABASE_ROOT_2021_CA_PEM, SUPABASE_ROOT_2021_CA_SHA256 } from './certs/supabaseRoot2021.js';
import { DatabaseTlsError, pinnedSupabaseRoot, planDatabaseConnection, probeDatabaseTls } from './databaseTls.js';
import { makeTlsFixture, opensslAvailable, startStubPostgres, type StubPostgres, type TlsFixture } from './testing/tlsFixture.js';
import { X509Certificate } from 'node:crypto';

/** pg exposes the parameters it will actually use, but not in its published types */
const effectiveSsl = (c: pg.Client) => (c as unknown as { connectionParameters: { ssl: unknown } }).connectionParameters.ssl;
const plan = (url: string, env: NodeJS.ProcessEnv = {}) => planDatabaseConnection(url, env);
const sslOf = (url: string, env: NodeJS.ProcessEnv = {}) => plan(url, env).config.ssl as { rejectUnauthorized: boolean; ca?: string[] };
const refuses = (url: string, env: NodeJS.ProcessEnv = {}) => assert.throws(() => plan(url, env), DatabaseTlsError);

describe('database TLS planning', () => {
  describe('which hosts are local', () => {
    it('loopback hosts connect in plain text', () => {
      for (const host of ['localhost', '127.0.0.1', '127.8.9.10', '[::1]']) {
        const p = plan(`postgresql://u:p@${host}:5432/db`);
        assert.equal(p.tls, 'loopback-plain', host);
        assert.equal(p.config.ssl, false, host);
      }
    });
    it('is decided from the parsed host name, never by searching the URL text', () => {
      // "localhost" in a password, a path, a query value or a look-alike host must not turn TLS off
      for (const url of [
        'postgresql://postgres:localhost@db.example.com/x',
        'postgresql://u:p@db.example.com/localhost',
        'postgresql://u:p@db.example.com/x?application_name=localhost',
        'postgresql://u:p@127.0.0.1.evil.example.com/x',
        'postgresql://u:p@localhost.evil.example.com/x',
        'postgresql://u:p@127.evil.example.com/x',
      ]) {
        const p = plan(url);
        assert.notEqual(p.tls, 'loopback-plain', url);
        assert.equal((p.config.ssl as { rejectUnauthorized: boolean }).rejectUnauthorized, true, url);
      }
    });
  });

  describe('remote hosts are always verified', () => {
    it('uses the platform CA store for an ordinary remote host', () => {
      const p = plan('postgresql://u:p@db.example.com:5432/app');
      assert.equal(p.tls, 'verified-system-store');
      assert.equal(sslOf('postgresql://u:p@db.example.com/app').rejectUnauthorized, true);
      assert.equal(sslOf('postgresql://u:p@db.example.com/app').ca, undefined);
    });
    it('pins the Supabase root for Supabase-hosted databases (pooler and direct)', () => {
      for (const host of ['aws-1-ap-northeast-1.pooler.supabase.com', 'db.abcdefghijklmnopqrst.supabase.co', 'abc.pooler.supabase.co']) {
        const p = plan(`postgresql://postgres.abc:pw@${host}:5432/postgres`);
        assert.equal(p.tls, 'verified-supabase-root', host);
        assert.deepEqual((p.config.ssl as { ca: string[] }).ca, [SUPABASE_ROOT_2021_CA_PEM.trim()], host);
      }
    });
    it('does not pin the Supabase root for look-alike hosts', () => {
      for (const host of ['evilsupabase.co', 'supabase.co.evil.example.com', 'db.supabase.co.example.org', 'notsupabase.com']) {
        assert.equal(plan(`postgresql://u:p@${host}/x`).tls, 'verified-system-store', host);
      }
    });
    it('the pinned Supabase root is the one recorded: self-signed CA with the recorded fingerprint, not expired', () => {
      const cert = new X509Certificate(SUPABASE_ROOT_2021_CA_PEM);
      assert.equal(cert.fingerprint256, SUPABASE_ROOT_2021_CA_SHA256);
      assert.equal(cert.subject, cert.issuer);
      assert.equal(cert.ca, true);
      assert.match(cert.subject, /CN=Supabase Root 2021 CA/);
      assert.ok(Date.parse(cert.validTo) > Date.now(), 'pinned root has expired: pin its successor');
    });
    it('the planner refuses a pinned root whose fingerprint is not the recorded one (guard against a tampered or swapped constant)', () => {
      const wrong = '00:11:22:33:44:55:66:77:88:99:AA:BB:CC:DD:EE:FF:00:11:22:33:44:55:66:77:88:99:AA:BB:CC:DD:EE:FF';
      assert.throws(() => pinnedSupabaseRoot(SUPABASE_ROOT_2021_CA_PEM, wrong), DatabaseTlsError);
      assert.throws(() => pinnedSupabaseRoot(SUPABASE_ROOT_2021_CA_PEM + SUPABASE_ROOT_2021_CA_PEM), DatabaseTlsError, 'exactly one certificate');
      assert.throws(() => pinnedSupabaseRoot('not a certificate'), DatabaseTlsError);
      assert.deepEqual(pinnedSupabaseRoot(), [SUPABASE_ROOT_2021_CA_PEM.trim()]);
    });
    it('STORAGE_DB_SSL_CA takes precedence, as PEM text or as a file', () => {
      const dir = mkdtempSync(join(tmpdir(), 'xroga-ca-'));
      try {
        const file = join(dir, 'ca.pem');
        writeFileSync(file, SUPABASE_ROOT_2021_CA_PEM);
        const text = plan('postgresql://u:p@aws-1-x.pooler.supabase.com/x', { STORAGE_DB_SSL_CA: SUPABASE_ROOT_2021_CA_PEM });
        const path = plan('postgresql://u:p@db.example.com/x', { STORAGE_DB_SSL_CA: file });
        assert.equal(text.tls, 'verified-custom-ca');
        assert.equal(path.tls, 'verified-custom-ca');
        assert.deepEqual((path.config.ssl as { ca: string[] }).ca, [SUPABASE_ROOT_2021_CA_PEM.trim()]);
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });
    it('refuses an unusable CA instead of falling back to something weaker', () => {
      refuses('postgresql://u:p@db.example.com/x', { STORAGE_DB_SSL_CA: '/no/such/file.pem' });
      refuses('postgresql://u:p@db.example.com/x', { STORAGE_DB_SSL_CA: '-----BEGIN CERTIFICATE-----\nnot a certificate\n-----END CERTIFICATE-----' });
    });
    it('requires TLS 1.2 or newer', () => {
      assert.equal((sslOf('postgresql://u:p@db.example.com/x') as unknown as { minVersion: string }).minVersion, 'TLSv1.2');
    });
  });

  describe('a connection string cannot weaken it', () => {
    it('refuses a remote URL that asks for plain text or no verification', () => {
      for (const q of ['sslmode=disable', 'sslmode=allow', 'sslmode=prefer', 'sslmode=no-verify', 'ssl=false', 'ssl=0', 'ssl=no-verify', 'SSLMODE=DISABLE']) {
        refuses(`postgresql://u:p@db.example.com/x?${q}`);
      }
    });
    it('there is no switch that turns verification off, whatever the environment says', () => {
      for (const env of [{ STORAGE_DB_SSL_ALLOW_UNVERIFIED: '1' }, { NODE_ENV: 'development', STORAGE_DB_SSL_ALLOW_UNVERIFIED: '1' }, { PGSSLMODE: 'disable' }, { NODE_TLS_REJECT_UNAUTHORIZED: '0' }]) {
        refuses('postgresql://u:p@db.example.com/x?sslmode=no-verify', env);
        assert.equal(sslOf('postgresql://u:p@db.example.com/x', env).rejectUnauthorized, true);
      }
    });
    it('hands pg discrete fields only, so no URL parameter reaches pg as an ssl setting', () => {
      const p = plan('postgresql://u:p@db.example.com:6543/app?sslmode=verify-full&sslrootcert=/tmp/x&options=-c%20role%3Dx&application_name=xroga-storage');
      assert.equal('connectionString' in p.config, false);
      assert.deepEqual(Object.keys(p.config).sort(), ['application_name', 'database', 'host', 'password', 'port', 'ssl', 'user']);
      const client = new pg.Client(p.config);
      const effective = effectiveSsl(client) as { rejectUnauthorized: boolean };
      assert.equal(effective.rejectUnauthorized, true);
    });
    it('PREMISE: pg itself lets a connection string override the ssl option (why the URL is never passed through)', () => {
      const naive = new pg.Client({ connectionString: 'postgresql://u:p@db.example.com/x?sslmode=no-verify', ssl: { rejectUnauthorized: true } });
      assert.deepEqual(effectiveSsl(naive), { rejectUnauthorized: false });
    });
  });

  describe('credentials', () => {
    it('decodes percent-encoded user, password and database name', () => {
      const p = plan('postgresql://postgres.abc:p%40ss%3Aw%2Frd%25@db.example.com/my%20db');
      assert.equal(p.config.user, 'postgres.abc');
      assert.equal(p.config.password, 'p@ss:w/rd%');
      assert.equal(p.config.database, 'my db');
    });
    it('rejects non-postgres, malformed and host-less URLs without echoing the URL', () => {
      for (const url of ['mysql://u:secretpw@db.example.com/x', 'not a url secretpw', 'postgresql://u:secretpw@/x', 'postgresql://u:%E0%A4%A@db.example.com/x']) {
        try {
          plan(url);
          assert.fail(`accepted ${url}`);
        } catch (e) {
          assert.ok(e instanceof DatabaseTlsError, url);
          assert.doesNotMatch((e as Error).message, /secretpw|%E0|db\.example\.com/, 'error message leaks part of the URL');
        }
      }
    });
  });
});

const HOST = 'db.test.invalid';
const haveOpenssl = opensslAvailable();

describe('database TLS against a real TLS handshake', { skip: haveOpenssl ? false : 'openssl is not installed' }, () => {
  let fx: TlsFixture;
  let good: StubPostgres;
  let wrongName: StubPostgres;
  before(async () => {
    fx = makeTlsFixture(HOST);
    good = await startStubPostgres(fx.leafKey, fx.leafCert);
    wrongName = await startStubPostgres(fx.wrongNameKey, fx.wrongNameCert);
  });
  after(async () => {
    await good?.close();
    await wrongName?.close();
    fx?.cleanup();
  });
  const url = `postgresql://u:p@${HOST}:5432/postgres`;
  const dial = (s: StubPostgres) => ({ dial: { host: '127.0.0.1', port: s.port } });

  it('trusted path: the chain verifies under the supplied CA', async () => {
    const r = await probeDatabaseTls(plan(url, { STORAGE_DB_SSL_CA: fx.caPem }), dial(good));
    assert.deepEqual({ ok: r.ok, stage: r.stage }, { ok: true, stage: 'tls' }, JSON.stringify(r));
    assert.match(r.protocol ?? '', /TLSv1\.[23]/);
  });
  it('invalid path 1: a certificate from a different root is rejected', async () => {
    const r = await probeDatabaseTls(plan(url, { STORAGE_DB_SSL_CA: fx.otherCaPem }), dial(good));
    assert.equal(r.ok, false);
    assert.equal(r.stage, 'tls');
    assert.match(r.error ?? '', /SELF_SIGNED|UNABLE_TO_VERIFY|CERT/, JSON.stringify(r));
  });
  it('invalid path 2: a valid chain for the wrong host name is rejected', async () => {
    const r = await probeDatabaseTls(plan(url, { STORAGE_DB_SSL_CA: fx.caPem }), dial(wrongName));
    assert.equal(r.ok, false);
    assert.equal(r.error, 'ERR_TLS_CERT_ALTNAME_INVALID');
  });
  it('invalid path 3: with no CA supplied a private-CA certificate is not trusted (platform store only)', async () => {
    const r = await probeDatabaseTls(plan(url), dial(good));
    assert.equal(r.ok, false);
    assert.match(r.error ?? '', /SELF_SIGNED|UNABLE_TO_VERIFY|CERT/);
  });
  it('invalid path 4: a server that does not offer TLS is refused, never used in plain text', async () => {
    const plainOnly = net.createServer((s) => s.once('data', () => s.end('N')));
    await new Promise<void>((r) => plainOnly.listen(0, '127.0.0.1', r));
    try {
      const r = await probeDatabaseTls(plan(url, { STORAGE_DB_SSL_CA: fx.caPem }), { dial: { host: '127.0.0.1', port: (plainOnly.address() as net.AddressInfo).port } });
      assert.deepEqual({ ok: r.ok, stage: r.stage }, { ok: false, stage: 'sslrequest' });
    } finally {
      plainOnly.close();
    }
  });
  it('the probe sends no credentials: the stub never saw a startup packet', async () => {
    const before = good.startupSeen();
    await probeDatabaseTls(plan(url, { STORAGE_DB_SSL_CA: fx.caPem }), dial(good));
    assert.equal(good.startupSeen(), before);
  });

  it('pg end to end, trusted: the client gets through TLS and reaches the database (which refuses)', async () => {
    const p = plan(url, { STORAGE_DB_SSL_CA: fx.caPem });
    const client = new pg.Client({ ...p.config, stream: () => redirected(good.port) });
    await assert.rejects(client.connect(), (e: NodeJS.ErrnoException & { code?: string }) => e.code === '28000');
    assert.equal(good.startupSeen(), true, 'TLS verified, so the startup packet was sent');
  });
  it('pg end to end, untrusted: the client stops at TLS and never sends the startup packet (user, password)', async () => {
    const stub = await startStubPostgres(fx.leafKey, fx.leafCert);
    try {
      const p = plan(url, { STORAGE_DB_SSL_CA: fx.otherCaPem });
      const client = new pg.Client({ ...p.config, stream: () => redirected(stub.port) });
      await assert.rejects(client.connect(), (e: NodeJS.ErrnoException) => /SELF_SIGNED|UNABLE_TO_VERIFY|CERT/.test(e.code ?? e.message));
      assert.equal(stub.startupSeen(), false, 'credentials must not be sent to an unverified server');
    } finally {
      await stub.close();
    }
  });
});

/** a socket whose TCP connection goes to the stub on loopback while pg still believes it is talking to HOST */
function redirected(port: number): net.Socket {
  const s = new net.Socket();
  const connect = s.connect.bind(s) as (...a: unknown[]) => net.Socket;
  (s as unknown as { connect: (...a: unknown[]) => net.Socket }).connect = (p: unknown) => (typeof p === 'number' ? connect(port, '127.0.0.1') : connect(p));
  return s;
}
