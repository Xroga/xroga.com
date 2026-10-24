import {request} from 'node:http';
import {IdentityPoolClient, type SubjectTokenSupplier} from 'google-auth-library';

type Environment = Readonly<Record<string, string | undefined>>;
export interface FlyGoogleWorkloadConfiguration {
  readonly audience: string;
  readonly serviceAccount: string;
  readonly issuer: string;
  readonly organizationId: string;
  readonly app: string;
  readonly machineId: string;
  readonly imageDigests: readonly string[];
}
const fail = (): never => {throw new Error('Fly managed credential identity is unavailable.');};

/** Non-secret deployment bindings only. Cloud Run keeps its existing metadata
 * ADC. A Fly process must explicitly use its machine identity, never an ADC
 * operator profile, downloaded service-account key or guessed metadata server. */
export function flyGoogleWorkloadConfiguration(env: Environment, keyName: string): FlyGoogleWorkloadConfiguration | undefined {
  const values = [env.XROGA_GOOGLE_WIF_AUDIENCE,env.XROGA_GOOGLE_WIF_SERVICE_ACCOUNT,env.XROGA_FLY_OIDC_ISSUER,
    env.XROGA_FLY_OIDC_ORGANIZATION_ID,env.XROGA_FLY_OIDC_IMAGE_DIGESTS];
  const configured = values.some(Boolean);
  if (!env.FLY_APP_NAME) {
    if (configured || env.XROGA_GOOGLE_CLOUD_AUTH_MODE === 'fly_oidc') fail();
    if (env.XROGA_GOOGLE_CLOUD_AUTH_MODE && env.XROGA_GOOGLE_CLOUD_AUTH_MODE !== 'metadata_adc') fail();
    return undefined;
  }
  if (env.XROGA_GOOGLE_CLOUD_AUTH_MODE !== 'fly_oidc' || env.GOOGLE_APPLICATION_CREDENTIALS
    || env.GOOGLE_CREDENTIALS || values.some(value => !value)) fail();
  const audience = env.XROGA_GOOGLE_WIF_AUDIENCE!, serviceAccount = env.XROGA_GOOGLE_WIF_SERVICE_ACCOUNT!;
  const issuer = env.XROGA_FLY_OIDC_ISSUER!, organizationId = env.XROGA_FLY_OIDC_ORGANIZATION_ID!;
  const app = env.FLY_APP_NAME, machineId = env.FLY_MACHINE_ID ?? '';
  const imageDigests = env.XROGA_FLY_OIDC_IMAGE_DIGESTS!.split(',');
  const project = keyName.match(/^projects\/([^/]+)\//)?.[1];
  if (!/^\/\/iam\.googleapis\.com\/projects\/[1-9][0-9]{5,19}\/locations\/global\/workloadIdentityPools\/[a-z][a-z0-9-]{3,31}\/providers\/[a-z][a-z0-9-]{3,31}$/.test(audience)
    || !project || !/^[a-z][a-z0-9-]{5,29}@[a-z][a-z0-9-]{4,28}[a-z0-9]\.iam\.gserviceaccount\.com$/.test(serviceAccount)
    || !serviceAccount.endsWith(`@${project}.iam.gserviceaccount.com`)
    || !/^https:\/\/oidc\.fly\.io\/[a-z0-9][a-z0-9-]{0,62}$/.test(issuer)
    || !/^[1-9][0-9]{0,19}$/.test(organizationId) || !/^[a-z0-9][a-z0-9-]{0,62}$/.test(app)
    || !/^[a-f0-9]{14}$/.test(machineId) || !imageDigests.length || imageDigests.length > 2
    || new Set(imageDigests).size !== imageDigests.length || imageDigests.some(d => !/^sha256:[a-f0-9]{64}$/.test(d))) fail();
  return Object.freeze({audience, serviceAccount, issuer, organizationId, app, machineId, imageDigests:Object.freeze(imageDigests)});
}

/** Fly's documented text/plain JWT endpoint, reached only over the fixed local
 * machine socket. No redirect, arbitrary URL/file, bearer token, shell command,
 * token logging, persistent token file or application credential is involved. */
export function requestFlyOidcToken(audience: string, requestImpl:typeof request = request): Promise<string> {
  return new Promise((resolve, reject) => {
    const unavailable = () => reject(new Error('Fly managed credential identity is unavailable.'));
    const body = JSON.stringify({aud:audience});
    const req = requestImpl({socketPath:'/.fly/api', hostname:'localhost', path:'/v1/tokens/oidc', method:'POST',
      headers:{'content-type':'application/json', 'accept':'text/plain', 'content-length':Buffer.byteLength(body)}}, res => {
      let bytes = 0; const chunks:Buffer[] = [];
      res.on('data', (chunk:Buffer) => {
        bytes += chunk.length;
        if (bytes > 16_384) {res.destroy(); req.destroy(); unavailable(); return;}
        chunks.push(chunk);
      });
      res.on('error', unavailable);
      res.on('end', () => {
        if (res.statusCode !== 200 || !res.complete) {unavailable(); return;}
        resolve(Buffer.concat(chunks).toString('utf8').trim());
      });
    });
    const timer = setTimeout(() => {req.destroy(); unavailable();}, 5_000);
    req.on('close', () => clearTimeout(timer));
    req.on('error', unavailable);
    req.end(body);
  });
}

/** Local binding checks are defense in depth, not signature verification.
 * Google STS must authenticate Fly's signature, issuer, audience and the IAM
 * attribute condition before issuing credentials. No decoded claim is authority. */
export function flySubjectTokenSupplier(configuration: FlyGoogleWorkloadConfiguration,
  dependencies: {readToken?:(audience:string)=>Promise<string>; now?:()=>number} = {}): SubjectTokenSupplier {
  const c = Object.freeze({...configuration, imageDigests:Object.freeze([...configuration.imageDigests])});
  const oidcAudience = `https:${c.audience}`;
  return {async getSubjectToken(context) {
    if (context.audience !== c.audience || context.subjectTokenType !== 'urn:ietf:params:oauth:token-type:jwt') fail();
    let token:string;
    try {token = await (dependencies.readToken ?? requestFlyOidcToken)(oidcAudience);} catch {return fail();}
    if (typeof token !== 'string' || token.length > 16_384 || !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(token)) fail();
    try {
      const [head, payload] = token.split('.');
      const header = JSON.parse(Buffer.from(head!, 'base64url').toString('utf8')) as Record<string, unknown>;
      const claim = JSON.parse(Buffer.from(payload!, 'base64url').toString('utf8')) as Record<string, unknown>;
      const now = Math.floor((dependencies.now ?? Date.now)() / 1000);
      if (!['RS256','ES256','EdDSA'].includes(String(header.alg)) || typeof header.kid !== 'string' || !header.kid
        || claim.iss !== c.issuer || claim.aud !== oidcAudience || claim.org_id !== c.organizationId
        || claim.app_name !== c.app || claim.machine_id !== c.machineId
        || typeof claim.sub !== 'string' || !claim.sub.startsWith(`${c.issuer.split('/').at(-1)}:${c.app}:`)
        || typeof claim.image_digest !== 'string' || !c.imageDigests.includes(claim.image_digest)
        || !Number.isSafeInteger(claim.iat) || !Number.isSafeInteger(claim.nbf) || !Number.isSafeInteger(claim.exp)
        || Number(claim.iat) > now + 30 || Number(claim.nbf) > now + 30 || Number(claim.exp) <= now + 30
        || Number(claim.exp) - Number(claim.iat) > 900 || Number(claim.exp) <= Number(claim.iat)) fail();
      return token;
    } catch {return fail();}
  }};
}

export function createFlyGoogleAuth(configuration: FlyGoogleWorkloadConfiguration,
  dependencies: Parameters<typeof flySubjectTokenSupplier>[1] = {}): IdentityPoolClient {
  return new IdentityPoolClient({type:'external_account', audience:configuration.audience,
    subject_token_type:'urn:ietf:params:oauth:token-type:jwt', token_url:'https://sts.googleapis.com/v1/token',
    scopes:['https://www.googleapis.com/auth/cloud-platform'],
    service_account_impersonation_url:`https://iamcredentials.googleapis.com/v1/projects/-/serviceAccounts/${configuration.serviceAccount}:generateAccessToken`,
    service_account_impersonation:{token_lifetime_seconds:600},
    subject_token_supplier:flySubjectTokenSupplier(configuration, dependencies)});
}
