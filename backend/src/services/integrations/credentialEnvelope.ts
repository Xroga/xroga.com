import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import type { ProjectSecretScope } from '../../synthesis/projectRuntime/types.js';

// Shared authenticated codec. Legacy v2 domains remain wire-compatible. The
// canonical vault container adds record/account/type/revision AAD. Actual writer
// cutover still requires explicit key custody and conditional persistence.
// This codec never reads ambient keys or migrates existing records.
export type CredentialEnvelopeContext =
  | { domain: 'provider'; owner: string; provider: string }
  | { domain: 'runtime'; owner: string; project: string; name: string; scope: ProjectSecretScope }
  | { domain: 'vault'; tenant: string; owner: string; provider: string; account: string; credentialType: string; recordId: string; revision: string; scope: string };

const MAX_BYTES = 64_000;
const MAX_ENVELOPE = 86_000;
const fail = (): never => { throw new Error('Invalid credential envelope.'); };

function keyBytes(key: Uint8Array): Buffer {
  if (!(key instanceof Uint8Array) || key.byteLength !== 32) return fail();
  return Buffer.from(key);
}

function keyId(value: string): string {
  if (typeof value !== 'string' || !/^[A-Za-z0-9_-]{1,64}$/.test(value)) return fail();
  return value;
}

function field(value: unknown): string {
  if (typeof value !== 'string' || !value.length || Buffer.byteLength(value) > 180 || /[\u0000-\u001f\u007f]/.test(value)) return fail();
  return value;
}

function aad(context: CredentialEnvelopeContext, id: string): Buffer {
  if (!context || typeof context !== 'object') return fail();
  let values: string[];
  if (context.domain === 'provider') {
    if (Object.keys(context).sort().join(',') !== 'domain,owner,provider') return fail();
    if (!/^apikey_[a-z_][a-z0-9_]{1,80}$/.test(field(context.provider))) return fail();
    values = ['xroga-credential', 'v2', id, context.domain, field(context.owner), context.provider];
  } else if (context.domain === 'runtime') {
    if (Object.keys(context).sort().join(',') !== 'domain,name,owner,project,scope') return fail();
    if (!/^[A-Z_][A-Z0-9_]{1,63}$/.test(field(context.name)) || !['development', 'preview', 'verification', 'deployment', 'shared'].includes(context.scope)) return fail();
    values = ['xroga-credential', 'v2', id, context.domain, field(context.owner), field(context.project), context.name, context.scope];
  } else if (context.domain === 'vault') {
    if (Object.keys(context).sort().join(',') !== 'account,credentialType,domain,owner,provider,recordId,revision,scope,tenant') return fail();
    values = ['xroga-credential', 'v3', id, context.domain, field(context.tenant), field(context.owner),
      field(context.provider), field(context.account), field(context.credentialType), field(context.recordId), field(context.revision), field(context.scope)];
  } else return fail();
  // An ordered JSON tuple is unambiguous even when identifiers contain colons.
  return Buffer.from(JSON.stringify(values), 'utf8');
}

function decode(value: string, size?: number): Buffer {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) return fail();
  const bytes = Buffer.from(value, 'base64url');
  if (bytes.toString('base64url') !== value || (size !== undefined && bytes.length !== size)) return fail();
  return bytes;
}

export function sealCredentialEnvelope(plain: string, key: Uint8Array, id: string, context: CredentialEnvelopeContext): string {
  if (typeof plain !== 'string' || !plain.length || Buffer.byteLength(plain) > MAX_BYTES) return fail();
  // Reject non-roundtrippable UTF-16 rather than silently replacing surrogates.
  if (Buffer.from(plain).toString('utf8') !== plain) return fail();
  const material = keyBytes(key);
  const associated = aad(context, keyId(id));
  const iv = randomBytes(12);
  try {
    const cipher = createCipheriv('aes-256-gcm', material, iv, { authTagLength: 16 });
    cipher.setAAD(associated);
    const ciphertext = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
    return ['v2', id, iv.toString('base64url'), cipher.getAuthTag().toString('base64url'), ciphertext.toString('base64url')].join(':');
  } finally { material.fill(0); }
}

export function openCredentialEnvelope(envelope: string, key: Uint8Array, expectedKeyId: string, context: CredentialEnvelopeContext): string {
  let material: Buffer | undefined, plain: Buffer | undefined;
  try {
    if (typeof envelope !== 'string' || envelope.length > MAX_ENVELOPE) return fail();
    const parts = envelope.split(':');
    if (parts.length !== 5 || parts[0] !== 'v2' || parts[1] !== keyId(expectedKeyId)) return fail();
    const iv = decode(parts[2]!, 12), tag = decode(parts[3]!, 16), ciphertext = decode(parts[4]!);
    if (ciphertext.length > MAX_BYTES) return fail();
    material = keyBytes(key);
    const decipher = createDecipheriv('aes-256-gcm', material, iv, { authTagLength: 16 });
    decipher.setAAD(aad(context, expectedKeyId));
    decipher.setAuthTag(tag);
    plain = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
    const text = plain.toString('utf8');
    if (!Buffer.from(text).equals(plain)) return fail();
    return text;
  } catch { return fail(); }
  finally { material?.fill(0); plain?.fill(0); }
}
