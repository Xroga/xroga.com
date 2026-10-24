import { GoogleAuth } from 'google-auth-library';
import {createFlyGoogleAuth, flyGoogleWorkloadConfiguration, type FlyGoogleWorkloadConfiguration} from './flyGoogleWorkloadIdentity.js';
import type { CryptoProvider, WrappedDataKey } from './cryptoProvider.js';

const keyNamePattern = /^projects\/[a-z][a-z0-9-]{4,28}[a-z0-9]\/locations\/[a-z0-9-]+\/keyRings\/[A-Za-z0-9_-]{1,63}\/cryptoKeys\/[A-Za-z0-9_-]{1,63}$/;
const invalid = (): never => { throw new Error('Managed credential key operation failed.'); };

function strictBase64(value: unknown, expectedBytes?: number): Buffer {
  if (typeof value !== 'string' || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value)) return invalid();
  const decoded = Buffer.from(value, 'base64');
  if (!decoded.byteLength || (expectedBytes !== undefined && decoded.byteLength !== expectedBytes) || decoded.toString('base64') !== value) return invalid();
  return decoded;
}

export interface GoogleCloudKmsTransport {
  encrypt(keyName: string, plaintext: string, additionalAuthenticatedData: string): Promise<{ ciphertext?: unknown }>;
  decrypt(keyName: string, ciphertext: string, additionalAuthenticatedData: string): Promise<{ plaintext?: unknown }>;
}

export class ApplicationDefaultGoogleKmsTransport implements GoogleCloudKmsTransport {
  readonly #auth;
  constructor(configuration?: FlyGoogleWorkloadConfiguration) {
    this.#auth = configuration ? createFlyGoogleAuth(configuration) : new GoogleAuth({ scopes: ['https://www.googleapis.com/auth/cloud-platform'] });
  }
  async client() {return this.#auth instanceof GoogleAuth ? this.#auth.getClient() : this.#auth;}
  async encrypt(keyName: string, plaintext: string, additionalAuthenticatedData: string): Promise<{ ciphertext?: unknown }> {
    const client = await this.client();
    const response = await client.request<{ ciphertext?: unknown }>({
      url: `https://cloudkms.googleapis.com/v1/${keyName}:encrypt`, method: 'POST',
      data: { plaintext, additionalAuthenticatedData },
    });
    return response.data;
  }
  async decrypt(keyName: string, ciphertext: string, additionalAuthenticatedData: string): Promise<{ plaintext?: unknown }> {
    const client = await this.client();
    const response = await client.request<{ plaintext?: unknown }>({
      url: `https://cloudkms.googleapis.com/v1/${keyName}:decrypt`, method: 'POST',
      data: { ciphertext, additionalAuthenticatedData },
    });
    return response.data;
  }
}

/** Google Cloud KMS envelope-key adapter. The configured CryptoKey never leaves
 * KMS. Application Default Credentials must have only cloudkms.cryptoKeyVersions.useToEncrypt
 * and cloudkms.cryptoKeyVersions.useToDecrypt on this exact key resource. */
export class GoogleCloudKmsCryptoProvider implements CryptoProvider {
  readonly kind = 'managed' as const;
  constructor(readonly keyName: string, readonly transport: GoogleCloudKmsTransport = new ApplicationDefaultGoogleKmsTransport(flyGoogleWorkloadConfiguration(process.env,keyName))) {
    if (!keyNamePattern.test(keyName)) throw new Error('Invalid Google Cloud KMS key resource.');
  }
  async wrapDataKey(dataKey: Uint8Array, associatedData: Uint8Array): Promise<WrappedDataKey> {
    if (!(dataKey instanceof Uint8Array) || dataKey.byteLength !== 32 || !(associatedData instanceof Uint8Array)) return invalid();
    const plaintext = Buffer.from(dataKey);
    try {
      const result = await this.transport.encrypt(this.keyName, plaintext.toString('base64'), Buffer.from(associatedData).toString('base64'));
      strictBase64(result.ciphertext);
      return { keyId: this.keyName, wrappedKey: `gcpkms1:${result.ciphertext}` };
    } catch { return invalid(); }
    finally { plaintext.fill(0); }
  }
  async unwrapDataKey(envelope: WrappedDataKey, associatedData: Uint8Array): Promise<Uint8Array> {
    if (envelope?.keyId !== this.keyName || typeof envelope.wrappedKey !== 'string' || !(associatedData instanceof Uint8Array)) return invalid();
    const [version, ciphertext, extra] = envelope.wrappedKey.split(':');
    if (version !== 'gcpkms1' || !ciphertext || extra !== undefined) return invalid();
    strictBase64(ciphertext);
    try {
      const result = await this.transport.decrypt(this.keyName, ciphertext, Buffer.from(associatedData).toString('base64'));
      return strictBase64(result.plaintext, 32);
    } catch { return invalid(); }
  }
}
