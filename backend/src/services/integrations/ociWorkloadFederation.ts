import { generateKeyPairSync, createPublicKey } from 'node:crypto';
import type { AuthenticationDetailsProvider } from 'oci-common';

const unavailable = (): never => { throw new Error('Managed workload authentication unavailable.'); };
export interface OciFederationConfiguration {
  domain: string; domainId: string; clientId: string; audience: string; subject: string;
  resourceType: string; expectedClaims: Readonly<Record<string, string>>; expectedPrincipalId?: string;
  // Secret suppliers are deliberately omitted by JSON serialization of config.
  credentials(): { clientSecret: string; requestUrl: string; requestToken: string };
}
export interface OciExchangeReceipt {
  status: number; requestId?: string; principal?: string; issuedAt?: number; expiresAt?: number;
}
const principal = (id: string) => /^ocid1\.(?!user\.|group\.|domain\.|tenancy\.)[a-z][a-z0-9]*\.[a-z0-9.-]+$/.test(id);
function claims(token: unknown): Record<string, any> {
  if (typeof token !== 'string' || token.length > 32768 || !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(token)) return unavailable();
  try { const value = JSON.parse(Buffer.from(token.split('.')[1]!, 'base64url').toString());
    if (!value || typeof value !== 'object' || Array.isArray(value)) return unavailable(); return value;
  } catch { return unavailable(); }
}
function lifetime(value: Record<string, any>, now: number, maxSeconds: number) {
  if (!Number.isInteger(value.iat) || !Number.isInteger(value.exp) || value.exp <= value.iat
    || value.iat * 1000 > now + 30000 || value.exp * 1000 <= now + 60000
    || value.exp - value.iat > maxSeconds || (value.nbf !== undefined && (!Number.isInteger(value.nbf) || value.nbf * 1000 > now + 30000))) return unavailable();
}
export function validateOciFederationConfiguration(c: OciFederationConfiguration): void {
  if (!/^https:\/\/idcs-[a-f0-9]+\.identity\.oraclecloud\.com$/.test(c.domain)
    || !/^ocid1\.domain\.oc1\.[a-z0-9.]+$/.test(c.domainId)
    || !/^[A-Za-z0-9_-]{1,256}$/.test(c.clientId) || c.resourceType !== 'xrogaphase3'
    || c.audience !== `${c.domain}/xroga-phase3-kms`
    || c.subject !== 'repo:Xroga/xroga.com:environment:xroga-phase3-oci-custody'
    || (c.expectedPrincipalId !== undefined && !principal(c.expectedPrincipalId))) return unavailable();
  const expected = c.expectedClaims;
  if (Object.keys(expected).sort().join(',') !== 'aud,ref,repository_id,sha,workflow_ref'
    || expected.aud !== c.audience || expected.repository_id !== '1280129659'
    || expected.ref !== 'refs/heads/codex/xroga-batch-01'
    || expected.workflow_ref !== 'Xroga/xroga.com/.github/workflows/command3-auth-browser.yml@refs/heads/codex/xroga-batch-01'
    || !/^[a-f0-9]{40}$/.test(expected.sha ?? '')) return unavailable();
}
async function boundedJson(response: Response): Promise<any> {
  const length = response.headers.get('content-length');
  if (length && (!/^\d+$/.test(length) || Number(length) > 65536)) return unavailable();
  const reader = response.body?.getReader(); if (!reader) return unavailable();
  const parts: Uint8Array[] = []; let size = 0;
  try { for (;;) { const {value, done} = await reader.read(); if (done) break;
    size += value.byteLength; if (size > 65536) return unavailable(); parts.push(value);
  } return JSON.parse(Buffer.concat(parts).toString('utf8')); }
  catch { return unavailable(); } finally { await reader.cancel().catch(() => {}); }
}

/** Acquisition/renewal only. The official OCI SDK still signs every KMS request.
 * JWT parsing is local admission, not signature verification or provider proof.
 * OCI validates the external JWT/trust and authenticates the exchange client.
 * A returned session is an immutable token+PoP snapshot for one SDK operation. */
export function createOciWorkloadFederation(c: OciFederationConfiguration,
  dependencies: { fetch?: typeof fetch; now?: () => number; receipt?: (value: OciExchangeReceipt) => void; maxExchanges?: number } = {},
) {
  validateOciFederationConfiguration(c);
  const request = dependencies.fetch ?? fetch, now = dependencies.now ?? Date.now;
  const keys = generateKeyPairSync('rsa', {modulusLength:2048, publicKeyEncoding:{type:'spki',format:'pem'},privateKeyEncoding:{type:'pkcs8',format:'pem'}});
  const expectedJwk = createPublicKey(keys.publicKey).export({format:'jwk'});
  let cached: {token:string; expiresAt:number; subject:string} | undefined;
  let pending: Promise<NonNullable<typeof cached>> | undefined, exchanges = 0;
  let stopped = false;
  const acquire = async () => {
    if (stopped || ++exchanges > (dependencies.maxExchanges ?? Infinity)) return unavailable();
    const auth = c.credentials();
    if (!auth.clientSecret || auth.clientSecret.length > 8192 || !auth.requestToken || auth.requestToken.length > 32768) return unavailable();
    let url: URL;
    try { url = new URL(auth.requestUrl); } catch { return unavailable(); }
    if (url.protocol !== 'https:' || !url.hostname.endsWith('.actions.githubusercontent.com') || url.username || url.password || url.port || url.hash) return unavailable();
    url.searchParams.set('audience',c.audience);
    const sourceResponse = await request(url, {headers:{Authorization:`Bearer ${auth.requestToken}`},redirect:'error',signal:AbortSignal.timeout(10000)});
    if (!sourceResponse.ok) return unavailable();
    const sourceToken = (await boundedJson(sourceResponse)).value, source = claims(sourceToken);
    lifetime(source,now(),900);
    if (source.iss !== 'https://token.actions.githubusercontent.com' || source.sub !== c.subject
      || Object.entries(c.expectedClaims).some(([key,value]) => source[key] !== value)) return unavailable();
    const body = new URLSearchParams({grant_type:'urn:ietf:params:oauth:grant-type:token-exchange',requested_token_type:'urn:oci:token-type:oci-rpst',
      public_key:keys.publicKey,subject_token_type:'jwt',subject_token:sourceToken,res_type:c.resourceType,rpst_exp:'20'});
    const response = await request(`${c.domain}/oauth2/v1/token`, {method:'POST',headers:{Authorization:`Basic ${Buffer.from(`${c.clientId}:${auth.clientSecret}`).toString('base64')}`,
      'Content-Type':'application/x-www-form-urlencoded'},body,redirect:'error',signal:AbortSignal.timeout(10000)});
    const id=response.headers.get('opc-request-id'); const requestId=id && /^[A-Za-z0-9._:/-]{1,300}$/.test(id)?id:undefined;
    if (!response.ok) { dependencies.receipt?.({status:response.status,requestId}); return unavailable(); }
    const token = (await boundedJson(response)).token, rpst=claims(token);
    lifetime(rpst,now(),1200);
    let jwk; try {jwk=typeof rpst.jwk==='string'?JSON.parse(rpst.jwk):rpst.jwk;}catch{return unavailable();}
    if (!principal(rpst.sub) || (c.expectedPrincipalId && rpst.sub !== c.expectedPrincipalId)
      || rpst['var_domain.id'] !== c.domainId || rpst.var_name !== c.subject
      || !jwk || jwk.n!==expectedJwk.n || jwk.e!==expectedJwk.e) return unavailable();
    dependencies.receipt?.({status:response.status,requestId,principal:rpst.sub,issuedAt:rpst.iat,expiresAt:rpst.exp});
    return {token:token as string,expiresAt:rpst.exp*1000,subject:rpst.sub as string};
  };
  const session = async (force=false): Promise<AuthenticationDetailsProvider> => {
    try {
      if (stopped) return unavailable();
      if (!pending && (force || !cached || cached.expiresAt-now()<=60000)) {
        cached=undefined; // A failed renewal must not reuse a previous valid token.
        pending=acquire().then(value=>{if(stopped)return unavailable();cached=value;return value;}).finally(()=>{pending=undefined;});
      }
      const current = pending ? await pending : cached;
      if (!current || current.expiresAt<=now()) return unavailable();
      return {getKeyId:async()=>{if(stopped||current.expiresAt<=now())return unavailable();return `ST$${current.token}`;},
        getPrivateKey:()=>{if(stopped)return unavailable();return keys.privateKey;},getPassphrase:()=>null};
    } catch { return unavailable(); }
  };
  return {session,stop:()=>{stopped=true;cached=undefined;keys.privateKey='';},diagnostics:()=>({exchanges,stopped})};
}
