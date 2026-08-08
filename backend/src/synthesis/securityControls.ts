/**
 * Security requirements for the software Xroga builds.
 *
 * Distinct from Xroga's own sandbox boundary, which protects *us* from generated code.
 * This protects the *user's users* from what gets generated — a different problem with a
 * different failure mode. Nobody notices a missing authorization check at build time,
 * because the happy path works perfectly.
 *
 * Two rules shape the design, and they pull against each other.
 *
 * **Only relevant controls.** §43 forbids dumping every control into every product. A CSRF
 * requirement on a Rust CLI is noise, and noise is how real findings get ignored — a
 * checklist nobody reads is worse than a short one somebody does. Controls are derived from
 * surfaces and architecture, not from a template.
 *
 * **Every control becomes a test.** A requirement that is only prose is a requirement
 * nobody can fail. Each control here carries an executable check and, where it matters, a
 * *negative* one — the positive case proves the feature works, and only the negative case
 * proves the control does. "Authorized users can read their data" passes just as happily
 * when everyone can read everything.
 */

import type { ArchitecturePlan } from './architecturePlan.js';
import type { UniversalProductSpec } from './universalProductSpec.js';

export const SECURITY_CONTROLS_SCHEMA_VERSION = '1.0.0' as const;

export type SecurityCategory =
  | 'input_validation' | 'output_encoding' | 'authentication' | 'authorization'
  | 'tenant_isolation' | 'session' | 'transport' | 'injection' | 'file_handling'
  | 'webhook' | 'secrets' | 'rate_limiting' | 'process_execution' | 'dependency'
  | 'ai_boundary' | 'chain_safety' | 'infrastructure';

export type ControlSeverity = 'critical' | 'high' | 'medium';

export interface SecurityControl {
  readonly id: string;
  readonly category: SecurityCategory;
  readonly requirement: string;
  /** Why this product needs it, naming the surface or decision that triggered it. */
  readonly appliesBecause: string;
  readonly severity: ControlSeverity;
  /** An assertion that passes only when the control is present. */
  readonly verification: string;
  /**
   * A test that must *fail* against a correct implementation.
   *
   * The one that actually proves the control. Present on anything an attacker would target.
   */
  readonly negativeTest: string | null;
  /** True when getting this wrong needs a reviewer with a measured security profile. */
  readonly requiresSecurityReview: boolean;
}

type Trigger = (context: DerivationContext) => boolean;

interface DerivationContext {
  readonly surfaces: ReadonlySet<string>;
  readonly prompt: string;
  readonly languages: ReadonlySet<string>;
  readonly hasDatabase: boolean;
  readonly hasAuth: boolean;
  readonly hasFileHandling: boolean;
  readonly hasWebhooks: boolean;
  readonly hasMultiTenancy: boolean;
  readonly hasAi: boolean;
  readonly hasPayments: boolean;
}

interface ControlRule {
  readonly control: Omit<SecurityControl, 'appliesBecause'>;
  readonly when: Trigger;
  readonly because: string;
}

const surface = (...names: readonly string[]): Trigger =>
  (context) => names.some((name) => context.surfaces.has(name));

const RULES: readonly ControlRule[] = [
  // ── Web front ends ────────────────────────────────────────────────────────
  {
    when: surface('web_frontend'),
    because: 'the product renders a browser interface',
    control: {
      id: 'sec:output-encoding', category: 'output_encoding', severity: 'critical',
      requirement: 'User-supplied text is escaped wherever it is rendered, and raw HTML injection APIs are not used with untrusted input',
      verification: 'a value containing markup renders as visible text rather than as an element',
      negativeTest: 'submitting <img src=x onerror=alert(1)> as a display name must not execute when the page renders it',
      requiresSecurityReview: true,
    },
  },
  {
    when: (context) => context.surfaces.has('web_frontend') && context.hasAuth,
    because: 'the browser interface holds an authenticated session',
    control: {
      id: 'sec:session-cookies', category: 'session', severity: 'critical',
      requirement: 'Session cookies are HttpOnly, Secure and SameSite, and the session identifier is regenerated on login',
      verification: 'the Set-Cookie header carries HttpOnly, Secure and a SameSite value',
      negativeTest: 'a session identifier captured before login must not remain valid after it',
      requiresSecurityReview: true,
    },
  },
  {
    when: (context) => context.surfaces.has('web_frontend') && context.hasAuth,
    because: 'a cookie-authenticated interface can be driven by a third-party page',
    control: {
      id: 'sec:csrf', category: 'session', severity: 'high',
      requirement: 'State-changing requests require a CSRF token or an equivalent same-site guarantee',
      verification: 'a state-changing request without the token is rejected',
      negativeTest: 'a cross-origin form POST carrying valid session cookies must not change state',
      requiresSecurityReview: true,
    },
  },

  // ── APIs ──────────────────────────────────────────────────────────────────
  {
    when: surface('api', 'webhook_service', 'mcp_server'),
    because: 'the product accepts requests from callers it does not control',
    control: {
      id: 'sec:input-validation', category: 'input_validation', severity: 'critical',
      requirement: 'Every request body and parameter is validated against a schema before use, and unknown fields are rejected or ignored explicitly',
      verification: 'a malformed request returns a 4xx status and persists nothing',
      negativeTest: 'a request with an unexpected field of the wrong type must be refused rather than coerced',
      requiresSecurityReview: false,
    },
  },
  {
    when: (context) => (context.surfaces.has('api') || context.surfaces.has('mcp_server')) && context.hasAuth,
    because: 'the API exposes data belonging to particular users',
    control: {
      id: 'sec:authorization', category: 'authorization', severity: 'critical',
      requirement: 'Every route checks that the caller may act on the specific resource, not merely that they are authenticated',
      verification: 'a request for a resource the caller owns succeeds',
      // The one that matters. Authentication without per-resource authorization is the
      // most common serious flaw in generated code, and the happy path never reveals it.
      negativeTest: 'an authenticated request for another user\'s resource must return 403 or 404, never that resource',
      requiresSecurityReview: true,
    },
  },
  {
    when: surface('api'),
    because: 'an API surface returns errors to untrusted callers',
    control: {
      id: 'sec:error-disclosure', category: 'output_encoding', severity: 'medium',
      requirement: 'Error responses carry a machine-readable code and no stack trace, SQL fragment or internal path',
      verification: 'a deliberately triggered error returns a structured code',
      negativeTest: 'an error response must not contain a stack trace or a database error string',
      requiresSecurityReview: false,
    },
  },
  {
    when: (context) => context.surfaces.has('api') && (context.hasAuth || context.hasPayments),
    because: 'authenticated or paid endpoints are worth brute-forcing',
    control: {
      id: 'sec:rate-limiting', category: 'rate_limiting', severity: 'high',
      requirement: 'Authentication and other costly endpoints are rate limited per identity and per address',
      verification: 'repeated requests beyond the limit receive 429',
      negativeTest: 'a burst of failed login attempts must be throttled rather than answered indefinitely',
      requiresSecurityReview: false,
    },
  },

  // ── Persistence ───────────────────────────────────────────────────────────
  {
    when: (context) => context.hasDatabase,
    because: 'the product stores data in a database',
    control: {
      id: 'sec:sql-injection', category: 'injection', severity: 'critical',
      requirement: 'Every query uses parameter binding; user input is never concatenated into SQL',
      verification: 'queries are issued with bound parameters',
      negativeTest: "a value of \"'; DROP TABLE users; --\" must be stored and returned as literal text",
      requiresSecurityReview: true,
    },
  },
  {
    when: (context) => context.hasMultiTenancy,
    because: 'the product separates data by tenant or organisation',
    control: {
      id: 'sec:tenant-isolation', category: 'tenant_isolation', severity: 'critical',
      requirement: 'Every query is scoped by tenant, enforced at the data layer rather than only in application code',
      verification: 'a query scoped to one tenant returns only that tenant\'s rows',
      negativeTest: 'a request authenticated as tenant A that names a tenant B identifier must return nothing belonging to B',
      requiresSecurityReview: true,
    },
  },

  // ── Files, webhooks, secrets ──────────────────────────────────────────────
  {
    when: (context) => context.hasFileHandling,
    because: 'the product accepts uploaded files',
    control: {
      id: 'sec:upload-validation', category: 'file_handling', severity: 'high',
      requirement: 'Uploads are checked for declared type, actual content type and size before storage, and stored under a generated name',
      verification: 'a file of an unexpected type or excessive size is refused',
      negativeTest: 'a file named ../../etc/passwd must not be written outside the storage directory',
      requiresSecurityReview: true,
    },
  },
  {
    when: (context) => context.hasWebhooks,
    because: 'the product receives webhooks from an external provider',
    control: {
      id: 'sec:webhook-signature', category: 'webhook', severity: 'critical',
      requirement: 'Webhook payloads are verified against the provider signature over the raw body, with replay protection',
      verification: 'a correctly signed payload is accepted',
      negativeTest: 'an unsigned or wrongly signed payload must be rejected before any state changes',
      requiresSecurityReview: true,
    },
  },
  {
    when: () => true,
    because: 'every product handles configuration',
    control: {
      id: 'sec:no-hardcoded-secrets', category: 'secrets', severity: 'critical',
      requirement: 'No API key, password, token or private key appears in source; secrets are read from the environment and never sent to a client',
      verification: 'the repository contains no credential-shaped literal',
      negativeTest: 'a secret referenced by the server must not appear in any client bundle or response',
      requiresSecurityReview: false,
    },
  },

  // ── Process execution ─────────────────────────────────────────────────────
  {
    when: surface('cli', 'devtool', 'worker', 'scheduled_job', 'daemon'),
    because: 'the product runs as a process that may invoke others',
    control: {
      id: 'sec:process-execution', category: 'process_execution', severity: 'high',
      requirement: 'Subprocesses are invoked with an argument array rather than a shell string, and paths derived from input are resolved and bounded',
      verification: 'process invocation passes arguments as a list',
      negativeTest: 'an input containing ; rm -rf / must be treated as a literal argument',
      requiresSecurityReview: true,
    },
  },
  {
    when: surface('cli', 'devtool'),
    because: 'the tool reads paths supplied on the command line',
    control: {
      id: 'sec:path-traversal', category: 'file_handling', severity: 'high',
      requirement: 'Paths supplied by a user are resolved and confirmed to remain inside the intended directory',
      verification: 'a path inside the working directory is accepted',
      negativeTest: 'a path of ../../../../etc/passwd must be refused rather than read',
      requiresSecurityReview: false,
    },
  },

  // ── AI, chain, infrastructure ─────────────────────────────────────────────
  {
    when: (context) => context.hasAi,
    because: 'the product sends user content to a model',
    control: {
      id: 'sec:ai-boundary', category: 'ai_boundary', severity: 'high',
      requirement: 'User content is passed as data with an explicit boundary, model output is schema-validated before use, and no provider key reaches the client',
      verification: 'model output failing its schema is rejected rather than used',
      negativeTest: 'user content instructing the model to ignore its instructions must not change tool access or reveal the system prompt',
      requiresSecurityReview: true,
    },
  },
  {
    when: surface('smart_contract', 'blockchain_program'),
    because: 'the product includes on-chain logic',
    control: {
      id: 'sec:chain-safety', category: 'chain_safety', severity: 'critical',
      requirement: 'No seed phrase or private key is collected or stored, transactions carry replay protection, and mainnet actions require an explicit gate',
      verification: 'contract tests cover the revert paths as well as the success paths',
      negativeTest: 'a replayed signed message must be rejected, and no code path may reach mainnet without the explicit gate',
      requiresSecurityReview: true,
    },
  },
  {
    when: surface('infrastructure_module'),
    because: 'the product declares infrastructure',
    control: {
      id: 'sec:least-privilege', category: 'infrastructure', severity: 'high',
      requirement: 'Roles grant the narrowest workable permissions, secrets are referenced rather than inlined, and destructive changes are gated',
      verification: 'the plan applies with no inline credential and no wildcard administrative grant',
      negativeTest: 'a plan containing a wildcard action on all resources must be flagged rather than applied',
      requiresSecurityReview: true,
    },
  },
];

function contextFrom(spec: UniversalProductSpec, plan: ArchitecturePlan): DerivationContext {
  const prompt = (spec.sourcePrompt ?? '').toLowerCase();
  const decisions = plan.decisions.map((decision) => decision.category);

  return {
    surfaces: new Set(spec.surfaces.map((declaration) => String(declaration.surface))),
    prompt,
    languages: new Set(plan.components.map((component) => component.language).filter(Boolean) as string[]),
    hasDatabase: decisions.includes('database') || spec.storageRequirements.length > 0,
    hasAuth: /\b(auth|login|sign[- ]?in|sign[- ]?up|account|user|session|password|oauth|jwt)\b/.test(prompt),
    hasFileHandling: /\b(upload|file|image|photo|attachment|document|avatar)\b/.test(prompt),
    hasWebhooks: /\bwebhook/.test(prompt),
    hasMultiTenancy: /\b(multi[- ]?tenant|organisation|organization|workspace|team|tenant)\b/.test(prompt),
    hasAi: /\b(ai|llm|model|gpt|embedding|rag|prompt|inference)\b/.test(prompt),
    hasPayments: /\b(payment|stripe|checkout|subscription|billing|invoice)\b/.test(prompt),
  };
}

/**
 * Derives the controls this product actually needs.
 *
 * Ordered critical first, because that is the order a person reads them in and the order a
 * reviewer should spend attention in.
 */
export function deriveSecurityControls(input: {
  spec: UniversalProductSpec;
  plan: ArchitecturePlan;
}): readonly SecurityControl[] {
  const context = contextFrom(input.spec, input.plan);
  const severityRank: Record<ControlSeverity, number> = { critical: 0, high: 1, medium: 2 };

  return RULES.filter((rule) => rule.when(context))
    .map((rule) => ({ ...rule.control, appliesBecause: rule.because }))
    .sort((a, b) => severityRank[a.severity] - severityRank[b.severity] || a.id.localeCompare(b.id));
}

export interface SecurityRequirement {
  readonly id: string;
  readonly statement: string;
  readonly severity: ControlSeverity;
  readonly category: SecurityCategory;
}

/** Controls as spec requirements, so they travel with the product definition. */
export function asProductRequirements(controls: readonly SecurityControl[]): readonly SecurityRequirement[] {
  return controls.map((control) => ({
    id: control.id,
    statement: control.requirement,
    severity: control.severity,
    category: control.category,
  }));
}

export interface SecurityTest {
  readonly id: string;
  readonly controlId: string;
  readonly kind: 'positive' | 'negative';
  readonly statement: string;
  readonly mustFailAgainstCorrectImplementation: boolean;
}

/**
 * Executable checks for a set of controls.
 *
 * The negative tests are the point. A positive test proves the feature works; only a
 * negative one proves the control does — "authorized users can read their data" passes
 * just as happily when everyone can read everything.
 */
export function compileSecurityTests(controls: readonly SecurityControl[]): readonly SecurityTest[] {
  const tests: SecurityTest[] = [];
  for (const control of controls) {
    tests.push({
      id: `${control.id}:positive`, controlId: control.id, kind: 'positive',
      statement: control.verification, mustFailAgainstCorrectImplementation: false,
    });
    if (control.negativeTest) {
      tests.push({
        id: `${control.id}:negative`, controlId: control.id, kind: 'negative',
        statement: control.negativeTest,
        // The attack must be refused, which means this scenario must not succeed.
        mustFailAgainstCorrectImplementation: true,
      });
    }
  }
  return tests;
}

/**
 * Whether a security task may be routed to a given model.
 *
 * §43 requires security-sensitive work to reach an appropriately verified reviewer or be
 * refused. Refusing is the correct outcome when no measured model exists — the alternative
 * is a security review performed by something nobody has evaluated, reported as a review.
 */
export function securityRoutingRequirement(controls: readonly SecurityControl[]): {
  requiresMeasuredReviewer: boolean;
  criticalCount: number;
  reason: string;
} {
  const needing = controls.filter((control) => control.requiresSecurityReview);
  const critical = controls.filter((control) => control.severity === 'critical');

  if (!needing.length) {
    return { requiresMeasuredReviewer: false, criticalCount: critical.length, reason: 'no control here needs specialist review' };
  }
  return {
    requiresMeasuredReviewer: true,
    criticalCount: critical.length,
    reason:
      `${needing.length} control(s) need a reviewer with a measured security profile ` +
      `(${needing.map((control) => control.id).join(', ')}); if no measured model is available the task must be refused rather than routed to an unevaluated one`,
  };
}

/** A short, readable summary for a build log or a review comment. */
export function describeControls(controls: readonly SecurityControl[]): string {
  if (!controls.length) return 'No security controls apply to this product.';
  const lines = [`${controls.length} security control(s) apply:`];
  for (const control of controls) {
    lines.push(`  [${control.severity}] ${control.id} — ${control.requirement}`);
    lines.push(`      because: ${control.appliesBecause}`);
    if (control.negativeTest) lines.push(`      must refuse: ${control.negativeTest}`);
  }
  return lines.join('\n');
}
