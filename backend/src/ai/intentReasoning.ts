/**
 * Outcome-first intent reasoning and the final evidence record.
 *
 * Two distinct defects, joined because they are the two ends of the same run.
 *
 * At the start: architecture came from keyword matching. `classifyTaskRequest` maps
 * "build" to build and "deploy" to deploy, which is fine for routing but is not
 * understanding — "I need somewhere my customers can pay me" contains none of those
 * words, and "build me a blog" and "build me a payment system" produced the same shape
 * because they share a verb. Keyword classification also silently rewards a fixed
 * catalogue: whatever scaffold the keyword maps to becomes the product, rather than the
 * product determining what is built.
 *
 * At the end: a run reported an outcome in prose. Prose has no schema, so "your app is
 * live" could be emitted by a run that had generated files and pushed nothing. Nothing
 * checked that a claim of "deployed" was accompanied by anything that showed a
 * deployment.
 *
 * So: infer the *outcome the user wants* and let the required capabilities follow from
 * it, and refuse to emit a claim the evidence does not support. The refusal is the point.
 * A record that downgrades "deployed" to "repository written" because there is no
 * deployment evidence is more useful than one that repeats what the run hoped happened.
 */

import {
  SUCCESS_STATES,
  isVerificationState,
  type VerificationState,
} from './verificationLifecycle.js';

/**
 * What the user wants to be true when the run is over.
 *
 * Not a task type and not a technology. "A place customers can buy things" is an
 * outcome; "an e-commerce scaffold" is one possible way to reach it. Keeping these apart
 * is what stops a fixed catalogue from deciding the architecture.
 */
export type DesiredOutcome =
  | 'software_running_somewhere'
  | 'existing_software_changed'
  | 'something_broken_working_again'
  | 'a_question_answered'
  | 'data_moved_or_transformed'
  | 'systems_connected'
  | 'work_happening_without_them'
  | 'something_understood';

/** A capability the outcome genuinely requires, derived from the outcome, not matched. */
export type OutcomeCapability =
  | 'persistent_storage'
  | 'user_accounts'
  | 'payments'
  | 'realtime_updates'
  | 'file_handling'
  | 'scheduled_work'
  | 'third_party_api'
  | 'public_web_surface'
  | 'admin_surface'
  | 'search'
  | 'notifications';

export interface IntentReading {
  outcome: DesiredOutcome;
  /** Capabilities the outcome implies, whether or not the user named them. */
  capabilities: OutcomeCapability[];
  /**
   * Who ends up using the thing. Changes the architecture more than the domain does: a
   * single-user tool and a multi-tenant product differ in auth, storage, and isolation
   * even when they do the same work.
   */
  audience: 'just_them' | 'their_team' | 'the_public' | 'unclear';
  /** Whether the user asked for a specific technology. Honoured when they did. */
  requestedStack: string[];
  /** What the reading is based on, in plain language, for the run transcript. */
  reasoning: string[];
  /**
   * True when the request does not say enough to choose an architecture. Better to ask
   * than to guess a catalogue entry and build the wrong product convincingly.
   */
  underspecified: boolean;
}

/**
 * Signals for the outcome. Ordered: the first match wins, so the more specific
 * outcomes come before the general ones.
 *
 * These are still patterns — the difference from keyword classification is what they are
 * patterns *for*. They look for the shape of a wanted end state ("so that customers
 * can…", "it stopped working"), not for imperative verbs, and the capabilities below are
 * derived from the outcome rather than from the same words.
 */
const OUTCOME_SIGNALS: Array<[DesiredOutcome, RegExp]> = [
  [
    'something_broken_working_again',
    /\b(broken|stopped working|no longer works|used to work|regression|is failing|crashes|errors? out|fix the)\b/i,
  ],
  [
    'existing_software_changed',
    /\b(add (?:a|an|the)\b|change the|update the|rename|move the|remove the|replace the|refactor|to my existing|in my app|to the app)\b/i,
  ],
  [
    'work_happening_without_them',
    /\b(automat|every (?:day|hour|week|morning|night)|on a schedule|cron|without me|in the background|whenever someone)\b/i,
  ],
  [
    'systems_connected',
    /\b(connect|integrat|sync|hook (?:up|into)|talk to|webhook|pull (?:data )?from|push (?:data )?to)\b/i,
  ],
  [
    'data_moved_or_transformed',
    /\b(migrat|import|export|convert|transform|parse|scrape|clean up the data|move (?:the )?data)\b/i,
  ],
  [
    'a_question_answered',
    /\b(what|which|how many|is there|should i|compare|research|find out|tell me)\b/i,
  ],
  [
    'something_understood',
    /\b(explain|walk me through|how does|why does|understand|document)\b/i,
  ],
  [
    'software_running_somewhere',
    // The last three alternatives are the outcome-first phrasings that carry no verb at
    // all — "somewhere my customers can pay", "a place where people book" — which is
    // exactly the case keyword classification could not see.
    /\b(build|create|make|need (?:a|an)|want (?:a|an)|app|site|website|platform|tool|dashboard|saas|marketplace|somewhere (?:\w+\s+){0,3}can\b|a place (?:where|for)\b|(?:so|way) (?:that )?(?:my |our )?(?:customers|users|people|clients)\b)/i,
  ],
];

/**
 * Capability signals.
 *
 * Each is a thing the product must be able to do, inferred from how the user describes
 * what should happen — not from them naming the feature. "customers can pay" implies
 * payments; it also implies accounts and storage, which the user never mentioned. That
 * inference is the whole value: a catalogue lookup on "shop" would have guessed the same
 * three by luck, and guessed wrong the moment the request was unusual.
 */
const CAPABILITY_SIGNALS: Array<[OutcomeCapability, RegExp]> = [
  ['payments', /\b(pay|payment|checkout|billing|subscription|stripe|invoice|charge|price|purchase|buy|sell)\b/i],
  ['user_accounts', /\b(sign ?up|sign ?in|log ?in|account|user|member|profile|auth|permission|role|tenant)\b/i],
  ['persistent_storage', /\b(save|store|persist|database|record|history|list of|keep track|inventory|catalog)\b/i],
  ['realtime_updates', /\b(real ?time|live|instantly|as it happens|chat|collaborat|presence|websocket)\b/i],
  ['file_handling', /\b(upload|download|file|image|photo|video|pdf|attachment|document)\b/i],
  ['scheduled_work', /\b(schedule|every (?:day|hour|week)|cron|reminder|digest|nightly|recurring)\b/i],
  ['third_party_api', /\b(api|integrat|webhook|third[- ]party|external service|slack|github|google|twilio|sendgrid)\b/i],
  ['search', /\b(search|filter|find (?:a|an|the)|look ?up|query|browse)\b/i],
  ['notifications', /\b(notify|notification|email them|alert|sms|push notification|remind)\b/i],
  ['admin_surface', /\b(admin|moderat|manage (?:users|content|orders)|back ?office|dashboard for me)\b/i],
  ['public_web_surface', /\b(public|anyone can|visitors|customers can|landing page|marketing site|seo)\b/i],
];

/** Technologies honoured when named. A request for Next.js gets Next.js. */
const STACK_SIGNALS: Array<[string, RegExp]> = [
  ['next.js', /\bnext\.?js\b/i],
  ['react', /\breact\b/i],
  ['vue', /\bvue\b/i],
  ['svelte', /\bsvelte(?:kit)?\b/i],
  ['astro', /\bastro\b/i],
  ['remix', /\bremix\b/i],
  ['express', /\bexpress\b/i],
  ['fastify', /\bfastify\b/i],
  ['django', /\bdjango\b/i],
  ['rails', /\b(rails|ruby on rails)\b/i],
  ['supabase', /\bsupabase\b/i],
  ['postgres', /\b(postgres|postgresql)\b/i],
  ['sqlite', /\bsqlite\b/i],
  ['mongodb', /\b(mongo|mongodb)\b/i],
  ['tailwind', /\btailwind\b/i],
  ['typescript', /\btypescript\b/i],
  ['python', /\bpython\b/i],
  ['static', /\b(static site|plain html|just html|no framework)\b/i],
];

/** Capabilities an outcome needs regardless of how it was phrased. */
const IMPLIED_BY_OUTCOME: Partial<Record<DesiredOutcome, OutcomeCapability[]>> = {
  work_happening_without_them: ['scheduled_work', 'persistent_storage'],
  systems_connected: ['third_party_api'],
  data_moved_or_transformed: ['persistent_storage'],
};

/**
 * Capabilities that drag others in with them.
 *
 * Payments without accounts is a product that cannot tell you who paid; payments without
 * storage is one that cannot remember. Users who described only the visible half of a
 * feature still need the invisible half built.
 */
const CAPABILITY_IMPLIES: Partial<Record<OutcomeCapability, OutcomeCapability[]>> = {
  payments: ['user_accounts', 'persistent_storage'],
  user_accounts: ['persistent_storage'],
  admin_surface: ['user_accounts', 'persistent_storage'],
  notifications: ['persistent_storage'],
  realtime_updates: ['persistent_storage'],
  file_handling: ['persistent_storage'],
  search: ['persistent_storage'],
};

function audienceOf(text: string): IntentReading['audience'] {
  if (/\b(customers|users|public|anyone|visitors|the world|sell to|clients)\b/i.test(text)) return 'the_public';
  if (/\b(my team|our team|colleagues|internal|coworkers|staff|employees|we can)\b/i.test(text)) return 'their_team';
  if (/\b(for me|just me|my own|personal|myself|i want to track)\b/i.test(text)) return 'just_them';
  return 'unclear';
}

function closeCapabilities(seed: OutcomeCapability[]): OutcomeCapability[] {
  const out = new Set<OutcomeCapability>(seed);
  let grew = true;
  while (grew) {
    grew = false;
    for (const capability of [...out]) {
      for (const implied of CAPABILITY_IMPLIES[capability] ?? []) {
        if (!out.has(implied)) {
          out.add(implied);
          grew = true;
        }
      }
    }
  }
  return [...out].sort();
}

/**
 * Reads what the user wants to end up with.
 *
 * Deliberately returns `underspecified` rather than defaulting to a scaffold. A request
 * with no discernible outcome is a request to ask a question, not a licence to build the
 * catalogue's most popular entry and call it an interpretation.
 */
export function readIntent(request: string): IntentReading {
  const text = request.trim();
  const reasoning: string[] = [];

  if (!text) {
    return {
      outcome: 'a_question_answered',
      capabilities: [],
      audience: 'unclear',
      requestedStack: [],
      reasoning: ['The request was empty, so there is no outcome to infer.'],
      underspecified: true,
    };
  }

  let outcome: DesiredOutcome | null = null;
  for (const [candidate, pattern] of OUTCOME_SIGNALS) {
    if (pattern.test(text)) {
      outcome = candidate;
      reasoning.push(`Reads as "${candidate.replace(/_/g, ' ')}".`);
      break;
    }
  }

  const underspecified = outcome === null;
  if (!outcome) {
    outcome = 'a_question_answered';
    reasoning.push('No outcome was clear from the request; treating it as a question rather than guessing a product.');
  }

  const seed: OutcomeCapability[] = [];
  for (const [capability, pattern] of CAPABILITY_SIGNALS) {
    if (pattern.test(text)) seed.push(capability);
  }
  for (const implied of IMPLIED_BY_OUTCOME[outcome] ?? []) seed.push(implied);

  const capabilities = closeCapabilities(seed);
  const inferred = capabilities.filter((c) => !seed.includes(c));
  if (inferred.length) {
    reasoning.push(`Also needs ${inferred.join(', ')}, implied by what was asked for rather than stated.`);
  }

  const requestedStack = STACK_SIGNALS.filter(([, pattern]) => pattern.test(text)).map(([name]) => name);
  if (requestedStack.length) reasoning.push(`The user named ${requestedStack.join(', ')}; honour it.`);

  const audience = audienceOf(text);
  if (audience !== 'unclear') reasoning.push(`Audience reads as ${audience.replace(/_/g, ' ')}.`);

  return { outcome, capabilities, audience, requestedStack, reasoning, underspecified };
}

export interface ArchitectureDecision {
  /** What is actually being built, in the user's terms. */
  shape: string;
  needsBackend: boolean;
  needsDatabase: boolean;
  needsAuth: boolean;
  needsBackgroundJobs: boolean;
  /** A starting point only. Never the reason a capability is present or absent. */
  scaffoldHint: string | null;
  reasoning: string[];
}

/**
 * Chooses an architecture from the outcome and its capabilities.
 *
 * The scaffold is chosen *last* and named a hint, because the ordering is the property
 * worth protecting: capabilities decide the architecture, and the scaffold is picked to
 * fit it. Reverse that and the scaffold's shape silently becomes the product's — which is
 * how "build me a marketplace" and "build me a booking system" ended up identical.
 */
export function decideArchitecture(reading: IntentReading): ArchitectureDecision {
  const has = (capability: OutcomeCapability) => reading.capabilities.includes(capability);
  const reasoning: string[] = [];

  const needsDatabase = has('persistent_storage');
  const needsAuth = has('user_accounts');
  const needsBackgroundJobs = has('scheduled_work');
  const needsBackend =
    needsDatabase ||
    needsAuth ||
    needsBackgroundJobs ||
    has('payments') ||
    has('third_party_api') ||
    has('realtime_updates') ||
    has('file_handling') ||
    has('notifications');

  if (needsBackend) {
    reasoning.push(
      `A backend is required by ${reading.capabilities.filter((c) => c !== 'public_web_surface').join(', ')}.`,
    );
  } else {
    reasoning.push('Nothing in the request needs server-side state, so this stays a client-only build.');
  }

  let shape: string;
  switch (reading.outcome) {
    case 'software_running_somewhere':
      shape = needsBackend ? 'a web application with a server and persistent data' : 'a static web front end';
      break;
    case 'existing_software_changed':
      shape = 'a change to the existing codebase';
      break;
    case 'something_broken_working_again':
      shape = 'a repair to the existing codebase';
      break;
    case 'work_happening_without_them':
      shape = 'a scheduled job with somewhere to record its results';
      break;
    case 'systems_connected':
      shape = 'an integration between two systems';
      break;
    case 'data_moved_or_transformed':
      shape = 'a data pipeline';
      break;
    default:
      shape = 'an answer, not a build';
  }
  reasoning.push(`Shape: ${shape}.`);

  // Chosen last, and only as a starting point.
  let scaffoldHint: string | null = null;
  if (reading.requestedStack.length) {
    scaffoldHint = reading.requestedStack[0];
    reasoning.push(`Starting from ${scaffoldHint} because the user asked for it.`);
  } else if (reading.outcome === 'software_running_somewhere') {
    scaffoldHint = needsBackend ? 'next.js' : 'static';
    reasoning.push(`Starting from ${scaffoldHint} as an accelerator; the capabilities above decide what it becomes.`);
  }

  return { shape, needsBackend, needsDatabase, needsAuth, needsBackgroundJobs, scaffoldHint, reasoning };
}

/**
 * A claim a run might want to make, and what would have to be true for it to be honest.
 */
export type OutcomeClaim =
  | 'code_generated'
  | 'locally_verified'
  | 'written_to_repository'
  | 'deployed'
  | 'live_and_working';

/** The evidence kinds that can support a claim. Anything else is not evidence for it. */
const CLAIM_REQUIRES: Record<OutcomeClaim, readonly string[]> = {
  code_generated: ['files_written'],
  locally_verified: ['test_run', 'typecheck', 'build'],
  written_to_repository: ['commit'],
  deployed: ['deployment'],
  live_and_working: ['production_check'],
};

/** Claims that cannot stand alone: claiming the later one implies the earlier ones. */
const CLAIM_IMPLIES: Record<OutcomeClaim, readonly OutcomeClaim[]> = {
  code_generated: [],
  locally_verified: ['code_generated'],
  written_to_repository: ['code_generated'],
  deployed: ['written_to_repository'],
  live_and_working: ['deployed'],
};

export interface RecordEvidence {
  kind: string;
  detail: string;
  /** Only `true` counts. An absent or unverified result is not a pass. */
  ok: boolean;
  identifier?: string;
}

export interface FinalEvidenceRecord {
  /** The strongest claim the evidence actually supports. */
  claim: OutcomeClaim | 'nothing_produced';
  /** The lifecycle state matching that claim. */
  state: VerificationState | 'failed';
  /** Claims the run wanted to make but could not support, with the reason. */
  withheld: Array<{ claim: OutcomeClaim; reason: string }>;
  evidence: RecordEvidence[];
  /** One honest sentence. Safe to show a user verbatim. */
  summary: string;
  /** What remains before the withheld claims could be made. */
  outstanding: string[];
}

const CLAIM_STATE: Record<OutcomeClaim, VerificationState> = {
  code_generated: 'generated_unverified',
  locally_verified: 'verified',
  written_to_repository: 'repository_written',
  deployed: 'deployed',
  live_and_working: 'production_verified',
};

const CLAIM_ORDER: OutcomeClaim[] = [
  'code_generated',
  'locally_verified',
  'written_to_repository',
  'deployed',
  'live_and_working',
];

const CLAIM_WORDS: Record<OutcomeClaim, string> = {
  code_generated: 'Code was generated but not verified',
  locally_verified: 'Code was generated and passed verification',
  written_to_repository: 'The code is in your repository',
  deployed: 'The code is deployed',
  live_and_working: 'The deployment is live and answering',
};

function supports(evidence: readonly RecordEvidence[], claim: OutcomeClaim): boolean {
  const accepted = CLAIM_REQUIRES[claim];
  // `ok` must be exactly true. A missing or non-boolean result is not a pass — the same
  // fail-closed rule the reviewer uses, for the same reason.
  return evidence.some((item) => item.ok === true && accepted.includes(item.kind));
}

/**
 * Builds the final record: the strongest claim the evidence supports, and no more.
 *
 * `intendedClaim` is what the run would like to say. Everything above what the evidence
 * carries is withheld with a reason rather than dropped silently, because a user who was
 * expecting a deployment needs to know it did not happen — a record that simply reports
 * "repository written" without mentioning the missing deployment reads like success.
 */
export function buildFinalEvidenceRecord(input: {
  intendedClaim: OutcomeClaim;
  evidence: readonly RecordEvidence[];
}): FinalEvidenceRecord {
  const evidence = [...input.evidence];
  const withheld: FinalEvidenceRecord['withheld'] = [];

  // A claim holds only if it and everything it implies are supported. Otherwise
  // "deployed" could stand on a deployment record for code that was never committed.
  const holds = (claim: OutcomeClaim): boolean =>
    supports(evidence, claim) && (CLAIM_IMPLIES[claim] ?? []).every((implied) => holds(implied));

  let strongest: OutcomeClaim | 'nothing_produced' = 'nothing_produced';
  for (const claim of CLAIM_ORDER) {
    if (holds(claim)) strongest = claim;
  }

  const intendedIndex = CLAIM_ORDER.indexOf(input.intendedClaim);
  const strongestIndex = strongest === 'nothing_produced' ? -1 : CLAIM_ORDER.indexOf(strongest);

  for (let i = strongestIndex + 1; i <= intendedIndex; i += 1) {
    const claim = CLAIM_ORDER[i];
    const missing = CLAIM_REQUIRES[claim].join(' or ');
    withheld.push({
      claim,
      reason: supports(evidence, claim)
        ? `"${claim}" needs ${(CLAIM_IMPLIES[claim] ?? []).join(', ')} to hold first, and it does not.`
        : `No ${missing} evidence, so "${claim}" cannot be claimed.`,
    });
  }

  const outstanding = withheld.map(
    (item) => `${CLAIM_WORDS[item.claim]} — not yet: ${item.reason}`,
  );

  const summary =
    strongest === 'nothing_produced'
      ? 'Nothing was produced that can be verified, so no outcome is claimed.'
      : withheld.length
        ? `${CLAIM_WORDS[strongest]}. ${withheld.length} further step(s) did not happen.`
        : `${CLAIM_WORDS[strongest]}.`;

  return {
    claim: strongest,
    state: strongest === 'nothing_produced' ? 'failed' : CLAIM_STATE[strongest],
    withheld,
    evidence,
    summary,
    outstanding,
  };
}

/**
 * Guards a user-facing sentence against claiming more than the record supports.
 *
 * The forbidden words are the ones that read as finished to a non-technical user. A run
 * that generated files and says "your app is live" is not making an optimistic estimate,
 * it is reporting something that did not happen.
 */
const CLAIM_WORD_PATTERNS: Array<[OutcomeClaim, RegExp]> = [
  ['live_and_working', /\b(live|in production|working now|up and running|you can use it now)\b/i],
  ['deployed', /\b(deployed|shipped|published|released|went out)\b/i],
  ['written_to_repository', /\b(pushed|committed|in your repo(?:sitory)?|merged)\b/i],
  ['locally_verified', /\b(verified|tested|passing|validated|checks? passed)\b/i],
];

export function claimIsSupported(
  sentence: string,
  record: FinalEvidenceRecord,
): { ok: true } | { ok: false; overclaim: OutcomeClaim; correction: string } {
  const supportedIndex = record.claim === 'nothing_produced' ? -1 : CLAIM_ORDER.indexOf(record.claim);

  for (const [claim, pattern] of CLAIM_WORD_PATTERNS) {
    if (!pattern.test(sentence)) continue;
    if (CLAIM_ORDER.indexOf(claim) > supportedIndex) {
      return {
        ok: false,
        overclaim: claim,
        correction: record.summary,
      };
    }
  }
  return { ok: true };
}

/** True when a state may be described to a user as success. Delegates to the lifecycle. */
export function mayBeCalledSuccess(state: unknown): boolean {
  return isVerificationState(state) && SUCCESS_STATES.includes(state);
}
