/** CI-only real Supabase bootstrap. Never links, downloads data, or reads production env. */
import { generateKeyPairSync, randomBytes, randomUUID, createPrivateKey, sign } from 'node:crypto';
import { mkdirSync, writeFileSync, appendFileSync, existsSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { spawnSync } from 'node:child_process';

export function assertDisposableConfiguration(env) {
  if (env.CI !== 'true' || env.XB01_DISPOSABLE_SUPABASE !== '1' || !env.RUNNER_TEMP || !env.GITHUB_ENV) throw new Error('Disposable Supabase requires the explicit GitHub CI fixture environment');
  for (const name of ['SUPABASE_ACCESS_TOKEN','SUPABASE_DB_PASSWORD','SUPABASE_PROJECT_REF','DATABASE_URL','SUPABASE_URL','SUPABASE_SERVICE_ROLE_KEY','LAUNCH_BILLING_API_URL','FILE_DELIVERY_SIGNING_KEY']) {
    if (env[name]) throw new Error(`Forbidden inherited configuration: ${name}`);
  }
  return resolve(env.RUNNER_TEMP, 'xroga-disposable-supabase');
}

export function generateLocalSigningKey() {
  return {...generateKeyPairSync('ec',{namedCurve:'P-256'}).privateKey.export({format:'jwk'}),kid:randomUUID(),use:'sig',alg:'ES256',key_ops:['sign','verify']};
}

/** Match the configured JWKS: custom signing_keys_path excludes legacy HS256. */
export function generateLocalApiToken(signingKey, role, now = Math.floor(Date.now()/1000)) {
  if (!['anon', 'service_role'].includes(role)) throw new Error('Unsupported local API role');
  const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url');
  const data = `${encode({alg:'ES256',typ:'JWT',kid:signingKey.kid})}.${encode({role,iss:'supabase',iat:now,exp:now+7200})}`;
  const signature = sign('sha256', Buffer.from(data), {key:createPrivateKey({key:signingKey,format:'jwk'}),dsaEncoding:'ieee-p1363'});
  return `${data}.${signature.toString('base64url')}`;
}

const privateValues = [];
export function redactLocalLog(value, secrets = privateValues) {
  let text = String(value ?? '');
  for (const secret of [...secrets].filter(Boolean).sort((a,b)=>b.length-a.length)) text = text.replaceAll(secret,'[REDACTED]');
  return text.replace(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g,'[REDACTED_JWT]')
    .replace(/sb_(?:secret|publishable)_[A-Za-z0-9_-]+/g,'[REDACTED_API_KEY]')
    .replace(/postgres(?:ql)?:\/\/[^\s"']+/g,'[REDACTED_DATABASE_URL]')
    .replace(/("(?:d|password|jwt_secret|secret_key|service_role_key)"\s*:\s*")[^"]+/gi,'$1[REDACTED]');
}
function cli(workdir, args) {
  const result = spawnSync('npx', ['--yes','supabase@2.120.0','--workdir',workdir,...args], {encoding:'utf8',maxBuffer:32*1024*1024});
  // CLI start/status print credentials. Capture, never relay those streams to logs/artifacts.
  if (result.status !== 0 || result.error) {
    const output = resolve(import.meta.dirname,'../../artifacts/batch-01-local-security');
    mkdirSync(output,{recursive:true});
    const log = redactLocalLog(result.stderr).slice(-12000);
    writeFileSync(join(output,'supabase-start-redacted.log'),log,{mode:0o600});
    console.error(log);
    throw new Error(`Disposable Supabase CLI failed (${args[0]}, exit ${result.status ?? 'spawn'}); credentials redacted`);
  }
  return result.stdout;
}

async function bootstrap() {
  const workdir = assertDisposableConfiguration(process.env);
  if (existsSync(workdir)) throw new Error('Refusing to reuse a previous test stack');
  const mask = value => console.log(`::add-mask::${value}`);
  const jwtSecret = randomBytes(48).toString('base64url');
  const apiPublishable = `sb_publishable_${randomBytes(24).toString('base64url')}`;
  const apiSecret = `sb_secret_${randomBytes(32).toString('base64url')}`;
  const signingKey = generateLocalSigningKey();
  const anonKey = generateLocalApiToken(signingKey,'anon'), serviceKey = generateLocalApiToken(signingKey,'service_role');
  privateValues.push(jwtSecret,apiPublishable,apiSecret,anonKey,serviceKey,signingKey.d);
  for (const value of privateValues) mask(value);
  mkdirSync(join(workdir,'supabase'),{recursive:true,mode:0o700});
  writeFileSync(join(workdir,'supabase','signing_keys.json'),JSON.stringify([signingKey]),{mode:0o600});
  writeFileSync(join(workdir,'supabase','config.toml'),`project_id = "xroga-ci-${process.env.GITHUB_RUN_ID}-${process.env.GITHUB_RUN_ATTEMPT}"
[api]
enabled = true
port = 54321
schemas = ["public", "storage"]
extra_search_path = ["public", "extensions"]
max_rows = 1000
[db]
port = 54322
major_version = 17
[db.migrations]
enabled = false
[db.seed]
enabled = false
[studio]
enabled = false
[analytics]
enabled = false
[auth]
enabled = true
site_url = "http://127.0.0.1:3000"
additional_redirect_urls = ["http://127.0.0.1:3000/auth/callback"]
jwt_secret = "${jwtSecret}"
anon_key = "${anonKey}"
service_role_key = "${serviceKey}"
publishable_key = "${apiPublishable}"
secret_key = "${apiSecret}"
signing_keys_path = "./signing_keys.json"
enable_signup = true
[auth.email]
enable_signup = true
enable_confirmations = false
[auth.mfa.totp]
enroll_enabled = true
verify_enabled = true
`,{mode:0o600});
  // The application uses the historical production migration runner's lexicographic
  // order. Its mixed legacy prefixes are NOT fed to CLI timestamp filtering, which
  // could omit 002a. The full-history verifier applies every original byte/hash.
  appendFileSync(process.env.GITHUB_ENV,`XB01_SUPABASE_WORKDIR=${workdir}\n`);
  cli(workdir,['start']);
  const status = JSON.parse(cli(workdir,['status','--output','json']));
  const db = new URL(status.DB_URL);
  if (!['localhost','127.0.0.1'].includes(db.hostname) || db.port !== '54322' || db.pathname !== '/postgres') throw new Error('CLI returned a non-disposable database');
  mask(status.DB_URL); mask(decodeURIComponent(db.password));
  if (status.API_URL !== 'http://127.0.0.1:54321') throw new Error('CLI API must be exact loopback');
  // Opaque gateway keys map to the ES256 API tokens above. Auth and PostgREST
  // must both accept the same per-run signing setup before any expensive build.
  for (const [path,key] of [['settings',apiPublishable],['admin/users?page=1&per_page=1',apiSecret]]) {
    const response=await fetch(`${status.API_URL}/auth/v1/${path}`,{headers:{apikey:key,Authorization:`Bearer ${key}`}});
    if(!response.ok) throw new Error(`Disposable Auth credential admission failed (HTTP ${response.status})`);
  }
  const rest = await fetch(`${status.API_URL}/rest/v1/`,{headers:{apikey:apiSecret}});
  if(!rest.ok) throw new Error(`Disposable database API credential admission failed (HTTP ${rest.status})`);
  const values = {
    XB01_SUPABASE_WORKDIR:workdir, XB01_LOCAL_DATABASE_URL:status.DB_URL,
    NEXT_PUBLIC_SUPABASE_URL:status.API_URL, SUPABASE_URL:status.API_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY:apiPublishable, SUPABASE_ANON_KEY:apiPublishable,
    SUPABASE_SERVICE_ROLE_KEY:apiSecret,
    FILE_DELIVERY_SIGNING_KEY:randomBytes(32).toString('base64'),
    // Real user tokens are ES256 and verified using this stack's real JWKS.
    E2E_ISOLATED_PROJECT_REF:'local-disposable', XROGA_ISOLATED_AUTH_BUILD:'1',
  };
  for (const [name,value] of Object.entries(values)) {
    if(name==='FILE_DELIVERY_SIGNING_KEY'){privateValues.push(value);mask(value);}
    if (/\r|\n/.test(value)) throw new Error('Invalid CI environment value');
    appendFileSync(process.env.GITHUB_ENV,`${name}=${value}\n`);
  }
  console.log('disposable_supabase_started=true; ephemeral_signing_and_api_keys=true; production_credentials=false');
}
if (process.argv[1] && resolve(process.argv[1]) === resolve(import.meta.filename)) await bootstrap();
