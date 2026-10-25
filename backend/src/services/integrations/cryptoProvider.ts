import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

export interface WrappedDataKey { keyId: string; wrappedKey: string }
/** Trusted backend adapter only. A managed implementation must use an explicitly
 * configured key resource and its real provider API. No managed provider is
 * selected or fabricated by this interface. */
export interface CryptoProvider {
  readonly kind: 'development' | 'managed';
  wrapDataKey(dataKey: Uint8Array, associatedData: Uint8Array): Promise<WrappedDataKey>;
  unwrapDataKey(envelope: WrappedDataKey, associatedData: Uint8Array): Promise<Uint8Array>;
}

export function requireCryptoProvider(provider: CryptoProvider): void {
  if (!provider || !['development', 'managed'].includes(provider.kind)
    || typeof provider.wrapDataKey !== 'function' || typeof provider.unwrapDataKey !== 'function') {
    throw new Error('Credential key provider is not configured.');
  }
  if (provider.kind === 'development' && !['test', 'development'].includes(process.env.NODE_ENV ?? '')) {
    throw new Error('Development credential keys are prohibited outside explicit test or development mode.');
  }
  if (provider.kind === 'development' && (process.env.VERCEL_ENV === 'production' || process.env.FLY_APP_NAME)) {
    throw new Error('Development credential keys are prohibited on production hosting.');
  }
}

const invalid = (): never => { throw new Error('Credential data key could not be authenticated.'); };
const keyBytes = (value: Uint8Array): Buffer => {
  if (!(value instanceof Uint8Array) || value.byteLength !== 32) return invalid();
  return Buffer.from(value);
};
function decode(value: string, size: number): Buffer {
  if (typeof value !== 'string' || !/^[A-Za-z0-9_-]+$/.test(value)) return invalid();
  const bytes = Buffer.from(value, 'base64url');
  if (bytes.byteLength !== size || bytes.toString('base64url') !== value) return invalid();
  return bytes;
}

/** Explicitly injected local test/development key ring. No service-role, JWT,
 * password-derived or fixed default key is ever read or synthesized here. */
export class DevelopmentCryptoProvider implements CryptoProvider {
  readonly kind = 'development' as const;
  readonly #keys = new Map<string, Buffer>();
  constructor(readonly currentKeyId: string, keys: ReadonlyMap<string, Uint8Array>) {
    requireCryptoProvider(this);
    if (!keys.size || keys.size > 16 || !keys.has(currentKeyId)) throw new Error('Explicit development key ring is required.');
    for (const [id, key] of keys) {
      if (!/^[A-Za-z0-9_-]{1,64}$/.test(id)) throw new Error('Invalid development key identifier.');
      this.#keys.set(id, keyBytes(key));
    }
  }
  async wrapDataKey(value: Uint8Array, associatedData: Uint8Array): Promise<WrappedDataKey> {
    requireCryptoProvider(this);
    const key = this.#keys.get(this.currentKeyId); if (!key) return invalid();
    const plain = keyBytes(value), iv = randomBytes(12);
    try {
      const cipher = createCipheriv('aes-256-gcm', key, iv, { authTagLength: 16 });
      cipher.setAAD(Buffer.concat([Buffer.from(JSON.stringify(['xroga-dev-key-wrap', 1, this.currentKeyId])), Buffer.from(associatedData)]));
      const ciphertext = Buffer.concat([cipher.update(plain), cipher.final()]);
      return { keyId: this.currentKeyId, wrappedKey: ['devkw1', iv.toString('base64url'), cipher.getAuthTag().toString('base64url'), ciphertext.toString('base64url')].join(':') };
    } finally { plain.fill(0); }
  }
  async unwrapDataKey(envelope: WrappedDataKey, associatedData: Uint8Array): Promise<Uint8Array> {
    requireCryptoProvider(this);
    try {
      const key = this.#keys.get(envelope.keyId); if (!key || typeof envelope.wrappedKey !== 'string') return invalid();
      const [version, iv, tag, ciphertext, extra] = envelope.wrappedKey.split(':');
      if (version !== 'devkw1' || extra !== undefined) return invalid();
      const decipher = createDecipheriv('aes-256-gcm', key, decode(iv!, 12), { authTagLength: 16 });
      decipher.setAAD(Buffer.concat([Buffer.from(JSON.stringify(['xroga-dev-key-wrap', 1, envelope.keyId])), Buffer.from(associatedData)]));
      decipher.setAuthTag(decode(tag!, 16));
      return Buffer.concat([decipher.update(decode(ciphertext!, 32)), decipher.final()]);
    } catch { return invalid(); }
  }
  destroy(): void { for (const key of this.#keys.values()) key.fill(0); this.#keys.clear(); }
}
