import { Compute, GoogleAuth } from 'google-auth-library';
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
  constructor(configuration?: FlyGoogleWorkloadConfiguration, env: Readonly<NodeJS.ProcessEnv> = process.env) {
    const native = Boolean(env.K_SERVICE || env.K_REVISION || env.XROGA_GOOGLE_CLOUD_AUTH_MODE === 'metadata_adc'
      || (env.NODE_ENV === 'production' && !env.FLY_APP_NAME));
    if (native) {
      // A production Google runtime uses its attached identity only. GoogleAuth's
      // default discovery can prefer a mounted key or an operator's local ADC file.
      // Compute goes directly to the metadata credential provider instead.
      const forbidden = ['GOOGLE_APPLICATION_CREDENTIALS', 'GOOGLE_CREDENTIALS',
        'CLOUDSDK_AUTH_CREDENTIAL_FILE_OVERRIDE', 'GCE_METADATA_HOST', 'GCE_METADATA_IP',
        'FLY_APP_NAME', 'FLY_MACHINE_ID', 'XROGA_GOOGLE_WIF_AUDIENCE',
        'XROGA_GOOGLE_WIF_SERVICE_ACCOUNT', 'XROGA_FLY_OIDC_ISSUER',
        'XROGA_FLY_OIDC_ORGANIZATION_ID', 'XROGA_FLY_OIDC_IMAGE_DIGESTS'];
      if (configuration || forbidden.some(name => Boolean(env[name]))
        || (env.XROGA_GOOGLE_CLOUD_AUTH_MODE && env.XROGA_GOOGLE_CLOUD_AUTH_MODE !== 'metadata_adc')) {
        throw new Error('Invalid native Google credential identity configuration.');
      }
    }
    this.#auth = configuration ? createFlyGoogleAuth(configuration)
      : native ? new Compute({ scopes: ['https://www.googleapis.com/auth/cloud-platform'] })
      : new GoogleAuth({ scopes: ['https://www.googleapis.com/auth/cloud-platform'] });
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
