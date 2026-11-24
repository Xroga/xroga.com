import { describe, expect, it } from 'vitest';
import { scrubCredentialLike, untrusted } from '../text';

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
