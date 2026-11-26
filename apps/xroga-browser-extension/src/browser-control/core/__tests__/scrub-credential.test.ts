import { describe, expect, it } from 'vitest';
import { scrubCredentialLike, scrubDeep, untrusted } from '../text';

// The shapes the server's classifier refuses (backend/src/security/egress/dataClassification.ts), copied here so a change there shows up in this test.
const serverSecretValue = /-----BEGIN [A-Z ]*PRIVATE KEY-----|\b(?:sb_secret_[A-Za-z0-9_-]{8,}|sk-[A-Za-z0-9_-]{16,}|gh[pousr]_[A-Za-z0-9]{15,}|Bearer\s+\S+|vault:v3:[A-Za-z0-9_-]+|SYNTHETIC_[A-Z_]*(?:CREDENTIAL|SECRET|TOKEN|API_KEY)[A-Z_]*)/i;

describe('scrubCredentialLike', () => {
  it('removes every shape the server refuses and keeps the rest readable', () => {
    const page = [
      'He was a pall bearer at the funeral and the standard Bearer abc123 header.',
      'key sk-abcdefghijklmnopqrstuvwx and ghp_abcdefghijklmnopqrstu and sb_secret_abcdefgh12',
      '-----BEGIN RSA PRIVATE KEY-----',
      'Contact us at https://agency.test/contact?ref=home&session_token=ABC123xyz&page=2 today.',
      'Visit https://www.google.com/sorry/index?continue=https://x.test&q=EgSxyz',
    ].join('\n');
    expect(serverSecretValue.test(page)).toBe(true);
    const clean = scrubCredentialLike(page);
    expect(serverSecretValue.test(clean)).toBe(false);
    expect(clean).toContain('Contact us at https://agency.test/contact?ref=home&session_token=removed&page=2 today.');
    expect(clean).toContain('credential-like text removed');
    expect(clean).toContain('https://www.google.com/sorry/index?continue=');
  });

  it('leaves ordinary text and addresses alone', () => {
    const text = 'Leeds SEO agency, https://brightpath.test/seo?utm_source=x, call 0113 555 0142, task-force and risk-assessment pages.';
    expect(scrubCredentialLike(text)).toBe(text);
  });

  it('is applied to everything wrapped as untrusted content', () => {
    const wrapped = untrusted('abc123', 'see https://a.test/?api_key=SECRET1 and Bearer zzz', { source: { site: 'a.test' } });
    expect(wrapped).not.toContain('SECRET1');
    expect(serverSecretValue.test(wrapped)).toBe(false);
  });
});

describe('scrubDeep', () => {
  const request = [
    { role: 'user', content: [{ type: 'text', text: 'see https://a.test/?session_token=ABC and Bearer xyz' }] },
    { role: 'tool', content: [{ type: 'tool-result', toolName: 'read', output: { type: 'text', value: 'key sk-abcdefghijklmnopqrstuvwx' } }] },
    { role: 'user', content: [{ type: 'image', image: 'iVBORw0KGgo-sk-abcdefghijklmnopqrstuvwx', mediaType: 'image/png' }] },
  ];
  it('cleans every text value of a request and leaves image bytes alone', () => {
    const out = scrubDeep(request);
    expect(JSON.stringify(out)).not.toContain('ABC');
    expect(JSON.stringify(out.slice(0, 2))).not.toMatch(serverSecretValue);
    expect((out[2] as { content: Array<{ image: string }> }).content[0]!.image).toBe('iVBORw0KGgo-sk-abcdefghijklmnopqrstuvwx');
    expect(JSON.stringify(request)).toContain('ABC');
  });
  it('strict mode also removes long opaque identifiers but keeps plain hyphenated words', () => {
    const out = scrubDeep([{ role: 'user', content: [{ type: 'text', text: 'id Zm9vYmFyYmF6cXV4MTIzNDU2Nzg5MA and search-engine-optimisation-agency-leeds' }] }], true);
    const text = JSON.stringify(out);
    expect(text).toContain('[long identifier removed]');
    expect(text).toContain('search-engine-optimisation-agency-leeds');
  });
});
