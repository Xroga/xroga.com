import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { installCredentialSafeConsole, redactText, secretValues } from './safeLogging.js';

const R = '[redacted]';
const env = (e: Record<string, string>): NodeJS.ProcessEnv => e;
const has = (text: string, ...needles: string[]) => needles.every((n) => text.includes(n));

describe('redaction of known credential shapes', () => {
  const cases: Array<[string, string, string]> = [
    ['GitHub token', 'push failed for ghp_' + 'A1b2C3d4E5f6G7h8I9j0K1l2M3', 'ghp_'],
    ['GitHub fine-grained', 'token github_pat_' + '11ABCDEFG0abcdefghij_klmnopqrstuvwxyz0123456789', 'github_pat_11'],
    ['OpenAI-style key', 'using sk-' + 'Z9y8X7w6V5u4T3s2R1q0P9o8', 'sk-Z9y8'],
    ['Anthropic-style key', 'key sk-ant-' + 'api03-AbCdEfGhIjKlMnOpQrStUvWx', 'api03-AbCd'],
    ['AWS access key id', 'creds AKIA' + 'IOSFODNN7EXAMPLE here', 'AKIAIOSFODNN7EXAMPLE'],
    ['Slack token', 'xoxb-' + '123456789012-abcdefghijkl', 'xoxb-1234'],
    ['Supabase PAT', 'sbp_' + '0123456789abcdef0123456789abcdef01234567', 'sbp_0123'],
    ['JWT', 'jwt eyJ' + 'hbGciOiJIUzI1NiJ9.eyJ' + 'zdWIiOiIxMjM0NTY3ODkwIn0.SflKxwRJSMeKKF2QT4fwpM', 'eyJhbGci'],
    ['bearer header', 'Authorization: Bearer abcDEF123456789.xyz', 'abcDEF123456789'],
    ['bearer bare', 'sent Bearer abcDEF123456789xyz to upstream', 'abcDEF123456789xyz'],
    ['basic header', 'Authorization: Basic dXNlcjpwYXNzd29yZA==', 'dXNlcjpwYXNzd29yZA'],
    ['url user info', 'connect postgresql://postgres.abc:Sup3rS3cretPw@host.example:5432/db failed', 'Sup3rS3cretPw'],
    ['signed url', 'GET https://bucket.r2.example/obj?X-Amz-Signature=deadbeef1234&X-Amz-Credential=AKIAxxxx%2F2026 ok', 'deadbeef1234'],
    ['token query', 'redirect https://app.example/cb?code=abc123xyz&state=ok', 'abc123xyz'],
    ['cookie header', 'headers Cookie: session=abcdef; theme=dark', 'abcdef'],
    ['set-cookie', 'Set-Cookie: sid=zzz999; HttpOnly', 'zzz999'],
    ['json field', '{"password":"hunter2-long","user":"bob"}', 'hunter2-long'],
    ['colon field', 'config password: correcthorsebattery', 'correcthorsebattery'],
    ['equals field', 'api_key=abcd1234efgh5678', 'abcd1234efgh5678'],
    ['quoted token', "{ access_token: 'tok_live_abcdefgh' }", 'tok_live_abcdefgh'],
    ['private key block', '-----BEGIN PRIVATE KEY-----\nMIIEvQIBADANBgkq\nabc\n-----END PRIVATE KEY-----', 'MIIEvQIBADANBgkq'],
    ['truncated private key', 'dump -----BEGIN RSA PRIVATE KEY-----\nMIIEowIBAAKCAQEA', 'MIIEowIBAAKCAQEA'],
  ];
  for (const [name, input, secret] of cases) {
    it(`removes: ${name}`, () => {
      const out = redactText(input, env({}));
      assert.ok(!out.includes(secret), `still present: ${out}`);
      assert.ok(out.includes(R), out);
    });
  }

  it('keeps the useful, non-secret part of the line', () => {
    const out = redactText('postgresql://postgres.abc:Sup3rS3cretPw@db.example.com:5432/postgres connect timeout', env({}));
    assert.ok(has(out, 'postgresql://postgres.abc', '@db.example.com:5432/postgres', 'connect timeout'), out);
    const q = redactText('GET https://x.example/obj?X-Amz-Signature=abc&partNumber=3', env({}));
    assert.ok(has(q, 'partNumber=3'), q);
  });

  it('leaves ordinary log text alone', () => {
    for (const line of [
      'Server running on port 8080', 'tokens used: 1200 of 4096', 'maxTokens=4096 model=gpt', 'Build completed in 4.2s', 'user 42 opened project abc-123',
      '[phase1Schema] Startup ensure skipped: relation exists', '{"token":true,"password":null,"secret":false}', 'authorization: none', 'GET /api/drive/objects 200 12ms', 'https://example.com/path?page=2&sort=asc',
    ]) assert.equal(redactText(line, env({})), line, line);
  });
});

describe('redaction of the secrets this process holds', () => {
  const held = env({
    SUPABASE_SERVICE_ROLE_KEY: 'srv-role-0123456789abcdefXYZ',
    XROGA_DRIVE_R2_SECRET_ACCESS_KEY: 'r2secretvalue-ABCDEFGH12345678',
    DATABASE_URL: 'postgresql://u:p%40ss@host/db',
    NODE_ENV: 'production', STORAGE_WRITE_MODE: 'legacy', PORT: '8080', SOME_FLAG_TOKEN: 'true', SHORT_SECRET: 'abc',
  });

  it('removes an exact secret value from any message, in any position', () => {
    for (const msg of ['boom srv-role-0123456789abcdefXYZ', 'key=srv-role-0123456789abcdefXYZ&x=1', `{"a":"srv-role-0123456789abcdefXYZ"}`, 'r2secretvalue-ABCDEFGH12345678 leaked']) {
      const out = redactText(msg, held);
      assert.ok(!/srv-role-0123456789abcdefXYZ|r2secretvalue-ABCDEFGH12345678/.test(out), out);
    }
  });

  it('removes a secret that appears URL-encoded (a password inside a connection string)', () => {
    const e = env({ DB_PASSWORD: 'p@ss word/12345' }); // the raw value never appears in the text below, only its encoded form
    const out = redactText('failed for host=db user=u password in url: p%40ss%20word%2F12345 end', e);
    assert.ok(!out.includes('p%40ss%20word%2F12345'), out);
  });

  it('does not treat modes, flags, short or numeric values as secrets', () => {
    const values = secretValues(held);
    for (const v of ['production', 'legacy', '8080', 'true', 'abc']) assert.ok(!values.includes(v), v);
    assert.equal(redactText('NODE_ENV=production port 8080 mode legacy', held), 'NODE_ENV=production port 8080 mode legacy');
  });

  it('removes the longer secret whole when one contains another', () => {
    const e = env({ A_SECRET: 'prefix-0123456789ab', B_TOKEN: 'prefix-0123456789ab-and-more' });
    const out = redactText('x prefix-0123456789ab-and-more y', e);
    assert.equal(out, `x ${R} y`);
  });

  it('picks up secrets that are added to the environment after the redactor was created', () => {
    const live = env({});
    const before = redactText('late-secret-ABCDEF123456', live);
    assert.equal(before, 'late-secret-ABCDEF123456');
    live.LATE_API_KEY = 'late-secret-ABCDEF123456';
    assert.equal(redactText('late-secret-ABCDEF123456', live), R);
  });
});

describe('credential-safe console', () => {
  const capture = () => {
    const lines: string[] = [];
    const sink = { log: (...a: unknown[]) => lines.push(`log:${a.join(' ')}`), info: (...a: unknown[]) => lines.push(`info:${a.join(' ')}`), warn: (...a: unknown[]) => lines.push(`warn:${a.join(' ')}`), error: (...a: unknown[]) => lines.push(`error:${a.join(' ')}`), debug: (...a: unknown[]) => lines.push(`debug:${a.join(' ')}`) } as unknown as Console;
    return { lines, sink };
  };

  it('redacts every method, including objects and errors', () => {
    const { lines, sink } = capture();
    const restore = installCredentialSafeConsole(sink, env({ MY_API_KEY: 'live-key-ABCDEF0123456789' }));
    sink.log('value', 'live-key-ABCDEF0123456789');
    sink.error('failed', new Error('connect postgresql://u:hunter2pass@h/db refused'));
    sink.warn({ password: 'hunter2-long', ok: true });
    sink.info('Authorization: Bearer abcDEF123456789xyz');
    sink.debug('%s and %d', 'live-key-ABCDEF0123456789', 42);
    restore();
    const all = lines.join('\n');
    assert.ok(!/live-key-ABCDEF0123456789|hunter2pass|hunter2-long|abcDEF123456789xyz/.test(all), all);
    assert.equal(lines.length, 5);
    assert.ok(lines.at(-1)!.includes('42'), 'format arguments still work');
  });

  it('is idempotent and restorable', () => {
    const { lines, sink } = capture();
    const r1 = installCredentialSafeConsole(sink, env({}));
    const r2 = installCredentialSafeConsole(sink, env({}));
    sink.log('Bearer abcDEF123456789xyz');
    r2(); // second install was a no-op
    sink.log('Bearer abcDEF123456789xyz');
    assert.ok(!lines.join('').includes('abcDEF123456789xyz'), 'still redacting after the no-op restore');
    r1();
    sink.log('Bearer abcDEF123456789xyz');
    assert.ok(lines.at(-1)!.includes('abcDEF123456789xyz'), 'original behaviour restored');
  });

  it('fails closed: if redaction throws, the raw text is withheld', () => {
    const { lines, sink } = capture();
    const poisoned = new Proxy({}, { ownKeys: () => { throw new Error('env unreadable'); }, getOwnPropertyDescriptor: () => { throw new Error('env unreadable'); } }) as NodeJS.ProcessEnv;
    const restore = installCredentialSafeConsole(sink, poisoned);
    sink.log('secret text sk-' + 'Z9y8X7w6V5u4T3s2R1q0P9o8');
    restore();
    assert.deepEqual(lines, ['log:[log line withheld: redaction failed]']);
  });
});
