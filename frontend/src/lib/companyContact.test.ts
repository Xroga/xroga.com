import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { COMPANY_CONTACT } from './companyContact';
import { buildOrganizationJsonLd } from './seo';

test('every published Xroga support contact uses hello@xroga.com only', () => {
  assert.equal(COMPANY_CONTACT.email, 'hello@xroga.com');
  assert.equal('phoneDisplay' in COMPANY_CONTACT, false);
  assert.equal('phoneTel' in COMPANY_CONTACT, false);
  const organization = buildOrganizationJsonLd();
  assert.equal(organization.email, 'mailto:hello@xroga.com');
  assert.equal(organization.contactPoint.email, 'hello@xroga.com');
  assert.equal('telephone' in organization.contactPoint, false);
});

test('legal and contact pages never advertise a support telephone number', () => {
  const paths = [
    '../app/contact/page.tsx',
    '../app/terms/page.tsx',
    '../app/refund/page.tsx',
    '../app/privacy/page.tsx',
    '../components/legal/LegalPageShell.tsx',
  ];
  for (const path of paths) {
    const source = readFileSync(new URL(path, import.meta.url), 'utf8');
    assert.doesNotMatch(source, /tel:|COMPANY_CONTACT\.phone(?:Display|Tel)/, path);
    assert.match(source, /COMPANY_CONTACT\.email/, path);
  }
});
