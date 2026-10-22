import { createHash } from 'node:crypto';
import { canonicalAuthorityJson } from '../authority/digest.js';
import { DATA_CLASSES, type DataClass } from './types.js';

const secretField = /password|secret|token|authorization|cookie|api[_-]?key|private[_-]?key|credential/i;
const secretValue = /-----BEGIN [A-Z ]*PRIVATE KEY-----|\b(?:sk-[A-Za-z0-9_-]{16,}|gh[pousr]_[A-Za-z0-9]{15,}|Bearer\s+\S+|vault:v3:[A-Za-z0-9_-]+|SYNTHETIC_[A-Z_]*(?:CREDENTIAL|SECRET|TOKEN|API_KEY)[A-Z_]*)/i;

/** Conservative deterministic floor, not complete DLP or permission. Caller
 * hints can raise sensitivity but can never lower detected credential content. */
export function classifyOutboundData(value: unknown, hint: DataClass = 'USER_PRIVATE'): { classification: DataClass; digest: string } {
  if (!DATA_CLASSES.includes(hint)) throw new Error('Invalid data classification');
  const serialized = canonicalAuthorityJson(value);
  if (Buffer.byteLength(serialized) > 128_000) throw new Error('Egress payload limit exceeded');
  let secret = false, nodes = 0;
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
