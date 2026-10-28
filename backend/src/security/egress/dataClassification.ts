import { createHash } from 'node:crypto';
import { canonicalAuthorityJson } from '../authority/digest.js';
import { DATA_CLASSES, type DataClass } from './types.js';

const secretField = /password|secret|token|authorization|cookie|api[_-]?key|private[_-]?key|credential/i;
const secretValue = /-----BEGIN [A-Z ]*PRIVATE KEY-----|\b(?:sb_secret_[A-Za-z0-9_-]{8,}|sk-[A-Za-z0-9_-]{16,}|gh[pousr]_[A-Za-z0-9]{15,}|Bearer\s+\S+|vault:v3:[A-Za-z0-9_-]+|SYNTHETIC_[A-Z_]*(?:CREDENTIAL|SECRET|TOKEN|API_KEY)[A-Z_]*)/i;

/** Compare transiently with already-held server credentials. No decryption,
 * credential lookup, cache, value logging or new credential store is involved.
 * Public keys, model IDs and KMS resource names are configuration, not secrets.
 */
function containsHeldCredential(text:string):boolean {
  for(const[name,value]of Object.entries(process.env)){
    if(/^(?:NEXT_PUBLIC_|PUBLIC_|VITE_|REACT_APP_)/i.test(name)||/(?:^|_)(?:ANON|PUBLISHABLE)_KEY$/i.test(name))continue;
    if(!/(?:SECRET|TOKEN|PASSWORD|PASSWD|AUTHORIZATION|COOKIE|PRIVATE_KEY|API_KEY|SERVICE_ROLE_KEY|SIGNING_KEY|ENCRYPTION_KEY|CREDENTIAL_KEY|ACCESS_KEY(?:_ID)?|(?:DATABASE|DB)_URL|DSN)$/i.test(name))continue;
    const held=value?.trim();if(!held||held.length<12)continue;
    const bytes=Buffer.from(held);
    for(const form of new Set([held,encodeURIComponent(held),bytes.toString('base64'),bytes.toString('base64url'),JSON.stringify(held).slice(1,-1)])){
      if(text.includes(form))return true;
    }
  }
  return false;
}

/** Credential floor for large model text, without lowering existing context
 * limits. This is not complete DLP, tenant authority or provider spend admission. */
export function containsCredentialSecretText(text:string):boolean {
  if(secretValue.test(text)||containsHeldCredential(text))return true;
  if(/^https?:/i.test(text))try{for(const key of new URL(text).searchParams.keys())if(secretField.test(key))return true;}catch{/* URL admission is separate. */}
  return false;
}

/** Conservative deterministic floor, not complete DLP or permission. Caller
 * hints can raise sensitivity but can never lower detected credential content. */
export function classifyOutboundData(value: unknown, hint: DataClass = 'USER_PRIVATE'): { classification: DataClass; digest: string } {
  if (!DATA_CLASSES.includes(hint)) throw new Error('Invalid data classification');
  const serialized = canonicalAuthorityJson(value);
  if (Buffer.byteLength(serialized) > 128_000) throw new Error('Egress payload limit exceeded');
  // One held-value scan over bounded serialized data avoids rebuilding the
  // corpus for every leaf of a large structured payload.
  let secret = containsHeldCredential(serialized), nodes = 0;
  const visit = (item: unknown, depth: number): void => {
    if (++nodes > 5000 || depth > 24) throw new Error('Egress payload structure limit exceeded');
    if (typeof item === 'string') {
      if (secretValue.test(item)) secret = true;
      if (/^https?:/i.test(item)) {
        try { for (const key of new URL(item).searchParams.keys()) if (secretField.test(key)) secret = true; } catch { /* URL policy independently rejects malformed destinations. */ }
      }
    } else if (Array.isArray(item)) item.forEach(v => visit(v, depth + 1));
    else if (item && typeof item === 'object') for (const [key, v] of Object.entries(item)) {
      if (secretField.test(key)) secret = true;
      visit(v, depth + 1);
    }
  };
  visit(JSON.parse(serialized), 0);
  return {classification: secret ? 'CREDENTIAL_SECRET' : hint, digest: createHash('sha256').update(serialized).digest('hex')};
}
