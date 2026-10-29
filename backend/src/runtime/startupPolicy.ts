/**
 * Which deployment this process is, and which boot-time duties it is therefore allowed to perform (INFRA-005).
 *
 * At boot the API currently does four things against whatever database its credentials point at: it runs schema-ensure DDL, it fails
 * every `swarm_runs` row still marked `running` and older than five minutes, it hydrates provider health, and it registers sandbox
 * providers. A staging, preview or half-configured service that holds a live service-role key therefore rewrites production run state
 * and schema just by starting. The staging descriptor already sets `XROGA_DEPLOYMENT_ENVIRONMENT=staging` and `RUN_SWARM_WORKER=false`
 * to say "no production work", but no backend source reads either variable, so nothing enforced it. This module makes the declaration binding.
 *
 * The rule is fail closed: only a process positively identified as production (or a local development / test process) may run the
 * mutating duties. Anything staging, preview, conflicting or unidentifiable runs none of them and says so loudly. The production Fly app is
 * recognised by name without any new configuration, so today's deployment behaves exactly as before.
 */

export type DeploymentEnvironment = 'production' | 'staging' | 'preview' | 'development' | 'test' | 'unclassified';

/** The Fly app that serves customers (`fly.api.toml`). A different app name is never production, whatever else it claims. */
export const PRODUCTION_FLY_APP = 'xroga-api';

const NAMED: readonly DeploymentEnvironment[] = ['production', 'staging', 'preview', 'development', 'test'];

export interface ResolvedEnvironment {
  environment: DeploymentEnvironment;
  source: 'explicit' | 'inferred' | 'unknown';
  /** why the environment is `unclassified`, when it is */
  problem?: string;
}

export function resolveDeploymentEnvironment(env: NodeJS.ProcessEnv = process.env): ResolvedEnvironment {
  const raw = env.XROGA_DEPLOYMENT_ENVIRONMENT?.trim().toLowerCase();
  const fly = env.FLY_APP_NAME?.trim();
  const cloudRun = env.K_SERVICE?.trim();
  if (raw) {
    if (!(NAMED as readonly string[]).includes(raw)) return { environment: 'unclassified', source: 'unknown', problem: 'XROGA_DEPLOYMENT_ENVIRONMENT is not one of production|staging|preview|development|test' };
    const claimed = raw as DeploymentEnvironment;
    // A claim must agree with what the platform says about where this is running.
    if (fly === PRODUCTION_FLY_APP && claimed !== 'production') return { environment: 'unclassified', source: 'unknown', problem: `running as the production Fly app but declared "${claimed}"` };
    if (fly && fly !== PRODUCTION_FLY_APP && claimed === 'production') return { environment: 'unclassified', source: 'unknown', problem: `declared production but running as Fly app "${fly.slice(0, 40)}"` };
    // Cloud Run: a service whose own name says it is not production cannot claim to be.
    if (cloudRun && claimed === 'production' && /(staging|preview|sandbox|dev|test)/i.test(cloudRun)) return { environment: 'unclassified', source: 'unknown', problem: `declared production but running as Cloud Run service "${cloudRun.slice(0, 40)}"` };
    return { environment: claimed, source: 'explicit' };
  }
  if (fly === PRODUCTION_FLY_APP) return { environment: 'production', source: 'inferred' };
  if (env.NODE_ENV === 'test') return { environment: 'test', source: 'inferred' };
  if (env.NODE_ENV === 'development') return { environment: 'development', source: 'inferred' };
  if (cloudRun) return { environment: 'unclassified', source: 'unknown', problem: 'this is a Cloud Run service: set XROGA_DEPLOYMENT_ENVIRONMENT explicitly (production is never inferred from a Cloud Run service name)' };
  return { environment: 'unclassified', source: 'unknown', problem: 'XROGA_DEPLOYMENT_ENVIRONMENT is not set and this is not the production Fly app' };
}

export interface StartupDuties {
  /** schema-ensure DDL (`ensure*Schema`) */
  ensureSchemas: boolean;
  /** fail abandoned `running` runs left by a previous process */
  reconcileOrphanedRuns: boolean;
}

/** A zero-traffic release candidate must not change production run records at
 * startup. Existing serving revisions retain reconciliation by default. */
export function startupReconciliationAllowed(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.XROGA_RELEASE_CANDIDATE !== '1';
}

/** Duties that WRITE to the database at boot. Everything not listed here is read-only or process-local and is not gated. */
export function dutiesFor(environment: DeploymentEnvironment): StartupDuties {
  switch (environment) {
    case 'production':
    case 'development':
      return { ensureSchemas: true, reconcileOrphanedRuns: true };
    case 'test':
    case 'staging':
    case 'preview':
    case 'unclassified':
      return { ensureSchemas: false, reconcileOrphanedRuns: false };
  }
}

export interface StartupDecision {
  environment: DeploymentEnvironment;
  source: ResolvedEnvironment['source'];
  duties: StartupDuties;
  /** human-readable lines for the boot log; never contains a secret */
  notes: string[];
}

export function decideStartup(env: NodeJS.ProcessEnv = process.env): StartupDecision {
  const r = resolveDeploymentEnvironment(env);
  const duties = dutiesFor(r.environment);
  const notes: string[] = [];
  if (r.problem) notes.push(`environment not recognised: ${r.problem}; mutating boot duties are disabled`);
  else if (!duties.ensureSchemas && !duties.reconcileOrphanedRuns) notes.push(`environment "${r.environment}": schema-ensure and orphaned-run reconciliation are disabled by policy`);
  const holdsServiceRole = Boolean(env.SUPABASE_SERVICE_ROLE_KEY);
  if (holdsServiceRole && (r.environment === 'staging' || r.environment === 'preview')) notes.push(`WARNING: a "${r.environment}" process holds SUPABASE_SERVICE_ROLE_KEY; confirm it points at a disposable project`);
  return { environment: r.environment, source: r.source, duties, notes };
}
