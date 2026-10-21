import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// Operator tooling only. No runtime permission system, provisioning, deployment or env pull.
const production = {
  hosts: ['xroga.com', 'www.xroga.com', 'xroga-api.fly.dev', 'xrogaaicom.vercel.app', 'nzenxdfumxrnsmybazmo.supabase.co', 'lztqnenbwytfaqhoxkdw.supabase.co'],
  apps: ['xroga-api', 'xroga-sandbox'],
  projects: ['prj_OFS4CCMNe4dPFDpgdOtVUszg8vMv'],
  buckets: ['xroga-assets'],
};
const deny = message => { throw new Error(message); };
function origin(value) {
  let url; try { url = new URL(value); } catch { deny('Invalid staging origin'); }
  if (url.protocol !== 'https:' || url.username || url.password || url.port || url.pathname !== '/' || url.search || url.hash || production.hosts.includes(url.hostname)) deny('Unsafe staging origin');
  return url.origin;
}
export function validateStagingManifest(input) {
  if (!input || input.version !== 1 || input.environment !== 'staging' || input.dataPolicy !== 'synthetic_only') deny('Explicit staging isolation required');
  if (!/^[a-f0-9]{40}$/.test(input.sourceSha ?? '')) deny('Exact staging source SHA required');
  // An environment name or non-production flag is not evidence of isolation.
  if (input.ownerReview?.productionResourceInventoryComplete !== true || !input.ownerReview?.isolationEvidence?.match(/^https:\/\//)) deny('Owner-reviewed production resource inventory and isolation evidence required');
  if (!Array.isArray(input.ownerReview.productionBucketNames) || !input.ownerReview.productionBucketNames.length || input.ownerReview.productionBucketNames.some(x => typeof x !== 'string' || !x)) deny('Actual production bucket inventory required');
  if (!/^xroga-api-staging(?:-[a-z0-9]+)?$/.test(input.api?.app ?? '') || production.apps.includes(input.api.app)) deny('Dedicated staging API app required');
  if (origin(input.api.origin) !== `https://${input.api.app}.fly.dev`) deny('API origin must bind to the reviewed staging app');
  if (!/^prj_[a-zA-Z0-9]+$/.test(input.web?.projectId ?? '') || production.projects.includes(input.web.projectId)) deny('Separate staging Vercel project required');
  const web = origin(input.web.origin);
  if (!new URL(web).hostname.endsWith('.vercel.app') || !new URL(web).hostname.startsWith('xroga-staging-')) deny('Dedicated staging web hostname required');
  if (!/^xroga-supabase-staging(?:-[a-z0-9]+)?$/.test(input.auth?.app ?? '')) deny('Dedicated non-production Auth service required');
  if (origin(input.auth.origin) !== `https://${input.auth.app}.fly.dev` || input.auth.databaseMode !== 'isolated_self_hosted') deny('Staging Auth/database must be explicitly isolated');
  if (!/^[a-f0-9]{32}$/.test(input.r2?.accountId ?? '') || !/^xroga-security-staging(?:-[a-z0-9]+)?$/.test(input.r2.bucket ?? '')) deny('Dedicated R2 test bucket required');
  if ([...production.buckets, ...input.ownerReview.productionBucketNames].includes(input.r2.bucket) || input.r2.publicAccess !== false || input.r2.customDomains?.length !== 0) deny('Private staging bucket must not overlap production');
  if (input.services?.billing !== 'disabled' || input.services?.externalProviders !== 'disabled' || input.services?.webhooks !== 'disabled' || input.services?.sandbox !== 'disabled') deny('External side effects must be disabled');
  return structuredClone(input);
}
export function assertStagingEnvironment(env) {
  // Refuse general-purpose/production credentials even when test credentials also exist.
  for (const key of Object.keys(env)) if (env[key] && /^(?:SUPABASE_|NEXT_PUBLIC_SUPABASE_|DATABASE_URL$|CLOUDFLARE_|WHOP_|LEMONSQUEEZY_|STRIPE_|FLY_API_TOKEN$|VERCEL_TOKEN$|COMPOSIO_|OPENROUTER_|OPENAI_|ANTHROPIC_|GITHUB_TOKEN$|GH_TOKEN$)/.test(key)) deny('Inherited production-capable configuration forbidden');
}
export function deploymentPlan(manifest) {
  const m = validateStagingManifest(manifest);
  return {
    status: 'PLAN_ONLY_NOT_DEPLOYED', sourceSha: m.sourceSha,
    api: { executable: 'flyctl', args: ['deploy', '.', '--config', 'deploy/staging/fly.api.toml', '--app', m.api.app], credentialName: 'XB01_STAGING_FLY_TOKEN' },
    web: { projectId: m.web.projectId, target: 'preview', note: 'Use reviewed, separately linked staging Vercel project; never the production project or --prod.' },
    prerequisites: ['Explicit owner approval for this SHA and resources', 'Provisioning and self-hosted Auth operational/security review', 'Reviewed staging-only secrets and complete network isolation', 'Full applicable migration history on staging; synthetic data only', 'Successful isolated CI plus remaining Command 007 semantic review'],
    prohibited: ['Resource creation', 'Production credentials or customer data', 'DNS changes', 'Automatic migration or promotion'],
  };
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    if (process.argv.length !== 3) deny('Usage: node scripts/security/staging-preflight.mjs <reviewed-manifest.json>');
    assertStagingEnvironment(process.env);
    console.log(JSON.stringify(deploymentPlan(JSON.parse(readFileSync(process.argv[2], 'utf8'))), null, 2));
  } catch { console.error('BLOCKED: staging isolation/configuration has not passed review. No deployment or network request performed.'); process.exitCode = 1; }
}
