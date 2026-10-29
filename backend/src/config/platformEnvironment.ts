import { readFileSync, statSync } from 'node:fs';
import { isAbsolute } from 'node:path';

type Environment = Record<string,string|undefined>;
const deny = (): never => {throw new Error('Protected platform configuration is invalid.');};
const forbidden = /^(?:FLY_|XROGA_.*(?:FLY|WIF)|GOOGLE_APPLICATION_CREDENTIALS$|GOOGLE_CREDENTIALS$|CLOUDSDK_|GCE_METADATA_|K_SERVICE$|K_REVISION$|K_CONFIGURATION$|PORT$|NODE_OPTIONS$|NODE_PATH$|LD_|DYLD_|PATH$|HOME$|SHELL$|BASH_ENV$|ENV$|XROGA_RELEASE_SHA$|XROGA_RELEASE_CANDIDATE$|XROGA_CREDENTIAL_KMS_PROVIDER$|XROGA_GOOGLE_CLOUD_(?:KMS_KEY_NAME|AUTH_MODE)$|XROGA_PLATFORM_CONFIG_FILE$|XROGA_GCE_|CLOUD_RUN_|XROGA_BACKGROUND_EXECUTION_PROVIDER$|XROGA_GOOGLE_(?:DISPATCH|TASK_QUEUE|WORKER_)|XROGA_GOOGLE_PROJECT_ID$|XROGA_GOOGLE_RUNTIME_SERVICE_ACCOUNT$|XROGA_RUNTIME_ROLE$)/i;

/** Validate the complete bundle before making any value visible to imports.
 * Native identity, release identity and control-plane settings stay outside it.
 * Keys and values are never returned in errors or operational receipts. */
export function parseProtectedPlatformConfiguration(raw: Uint8Array, environment: Readonly<Environment>): Record<string,string> {
  if(raw.byteLength>65536 || !raw.byteLength) return deny();
  let parsed: unknown;
  try {parsed=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(raw));} catch {return deny();}
  if(!parsed || typeof parsed!=='object' || Array.isArray(parsed))return deny();
  const bundle=parsed as Record<string,unknown>;
  if(Object.keys(bundle).sort().join(',')!=='environment,schemaVersion,target'
    || bundle.schemaVersion!==1 || bundle.target!=='xroga-api-google'
    || !bundle.environment || typeof bundle.environment!=='object' || Array.isArray(bundle.environment))return deny();
  const values=Object.entries(bundle.environment);
  if(!values.length || values.length>256)return deny();
  const result: Record<string,string>=Object.create(null);
  for(const [name,value] of values) {
    if(!/^[A-Za-z_][A-Za-z0-9_]{0,127}$/.test(name) || forbidden.test(name) || name==='XROGA_PROJECT_RUNTIME_PROVIDER'
      || ['__proto__','constructor','prototype'].includes(name.toLowerCase())
      || typeof value!=='string' || !value.length || value.includes('\0')
      || environment[name]!==undefined)return deny();
    result[name]=value;
  }
  return result;
}

export function loadProtectedPlatformEnvironment(environment: Environment = process.env,
  read: (path: string)=>Uint8Array = path => {
    if(statSync(path).size>65536)return deny();
    return readFileSync(path);
  }): number {
  const path=environment.XROGA_PLATFORM_CONFIG_FILE;
  if(!path)return 0; // Existing explicit environment-based installs remain supported during transition.
  if(!isAbsolute(path) || ((environment.K_SERVICE||environment.CLOUD_RUN_JOB) && path!=='/secrets/xroga-platform/config.json'))return deny();
  let raw: Uint8Array;
  try {raw=read(path);} catch {return deny();}
  const values=parseProtectedPlatformConfiguration(raw,environment);
  for(const [name,value] of Object.entries(values))environment[name]=value;
  return Object.keys(values).length;
}
