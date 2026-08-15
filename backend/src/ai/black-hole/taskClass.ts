/**
 * Black Hole ∞ task classification.
 *
 * Part 2 §4 lists the classes and states the rule that shapes this file: *use deterministic
 * signals first*, and "do not spend a model call on obvious classification". An image is
 * attached or it is not. A repository mutation was requested or it was not. A URL is present
 * or it is not. Asking a model to decide any of those is latency and money spent to become
 * less certain than the caller already was.
 *
 * So every classifier here is a pure function of the request. `TaskAnalysis.confident` records
 * whether a *strong* signal fired, which is the hook a later stage can use to escalate a
 * genuinely ambiguous prompt to a model — but the escalation is that stage's decision, and the
 * common cases never reach it.
 *
 * ## The part that is a security control rather than a routing hint
 *
 * `requiredAuthority` is derived here, not at the provider. §12 requires that Grok never
 * writes project files, and the enforcement point for that has to be *upstream of model
 * selection*: a router that picks a model and then discovers it lacks authority has already
 * leaked the decision into logs, telemetry and fallback chains. Naming the authority a task
 * needs before any candidate is considered is what lets `router.ts` filter on it.
 *
 * Note this is a *required* authority, not a granted one. Classification says "this task will
 * need to write files"; it never says anyone may.
 */

import type { BlackHoleAuthority } from './registry.js';
import { classifyTaskRequest, type TaskClassification } from '../../lib/taskClassifier.js';

/**
 * The canonical class list from §4, verbatim and complete.
 *
 * Kept as a union rather than a string so that adding a class forces every exhaustive switch
 * to be revisited — the routing table in `router.ts` is one such switch, and a class with no
 * route is a request that silently falls to a default.
 */
export type BlackHoleTaskClass =
  | 'simple_chat'
  | 'rewrite'
  | 'summarize'
  | 'classification'
  | 'extraction'
  | 'structured_extraction'
  | 'analysis'
  | 'reasoning'
  | 'deep_reasoning'
  | 'research'
  | 'coding'
  | 'repository_coding'
  | 'architecture'
  | 'debugging'
  | 'refactoring'
  | 'long_horizon_engineering'
  | 'vision'
  | 'multimodal'
  | 'agentic'
  | 'tool_workflow'
  | 'security_review'
  | 'deployment_debugging';

export const BLACK_HOLE_TASK_CLASSES: readonly BlackHoleTaskClass[] = [
  'simple_chat',
  'rewrite',
  'summarize',
  'classification',
  'extraction',
  'structured_extraction',
  'analysis',
  'reasoning',
  'deep_reasoning',
  'research',
  'coding',
  'repository_coding',
  'architecture',
  'debugging',
  'refactoring',
  'long_horizon_engineering',
  'vision',
  'multimodal',
  'agentic',
  'tool_workflow',
  'security_review',
  'deployment_debugging',
];

/** How external evidence must be gathered, when it must be gathered at all. */
export type ResearchKind = 'none' | 'x' | 'web' | 'url_fetch';

export interface TaskAttachment {
  /** IANA media type, e.g. `image/png`. The only field classification needs. */
  readonly mediaType: string;
  readonly name?: string;
}

export interface TaskSignalInput {
  readonly prompt: string;
  readonly attachments?: readonly TaskAttachment[];
  /**
   * Set by the caller when the request will change a repository, rather than inferred.
   *
   * A caller that already knows this — a repository-scoped build route, for instance — is a
   * better authority than a regular expression over the prompt, and §4 names it as one of the
   * deterministic signals.
   */
  readonly repositoryMutationRequested?: boolean;
  readonly projectId?: string | null;
  readonly repositoryFileCount?: number;
  /** Tools the caller is willing to expose. Their presence is what makes a task agentic. */
  readonly toolsOffered?: readonly string[];
  readonly responseSchemaRequested?: boolean;
  readonly previousFailures?: number;
}

export interface TaskAnalysis {
  readonly primary: BlackHoleTaskClass;
  /** Every class the request touches, primary first. Ordering is significant to the router. */
  readonly classes: readonly BlackHoleTaskClass[];
  /**
   * Whether a strong deterministic signal decided this.
   *
   * False means the prompt was ambiguous and the answer came from weaker keyword evidence —
   * the one case where a later stage may reasonably spend a model call.
   */
  readonly confident: boolean;
  readonly signals: readonly string[];
  readonly requiresResearch: boolean;
  readonly researchKind: ResearchKind;
  readonly knownUrls: readonly string[];
  readonly hasImageAttachment: boolean;
  readonly hasNonImageAttachment: boolean;
  /** Authority the task will require of whichever model executes it. */
  readonly requiredAuthority: readonly (keyof BlackHoleAuthority)[];
  readonly intents: TaskClassification;
}

/**
 * A URL the user actually supplied.
 *
 * §4 wants a known URL fetched rather than fed to a broad search, so this looks only for real
 * absolute http(s) URLs. Bare domains are deliberately not matched: "check stripe.com/docs"
 * and "compare stripe.com and adyen.com" are indistinguishable to a pattern loose enough to
 * catch the first, and guessing wrong turns a search into a fetch of the wrong page.
 */
const URL_RE = /\bhttps?:\/\/[^\s<>"'`)\]]+/gi;

/**
 * A note on the missing trailing `\b`.
 *
 * Several patterns below open with `\b` and deliberately do not close with one. That is not an
 * oversight: a trailing `\b` after an alternation silently kills every alternative that is a
 * word *prefix*, because the boundary is tested against the next character of the longer word.
 * `/\b(debug|refactor)\b/` matches "debug" and "refactor" but not "debugging" or "refactoring"
 * — the two forms users actually type. The same defect hid "summarize" behind `summar[iy]`,
 * "vulnerability" behind `vulnerab`, and "hackathons" behind `hackathon`.
 *
 * The leading `\b` is what carries the real weight; it prevents matching inside another word.
 * Omitting the trailing one makes these prefix matches, which is the intent for stemmed verbs.
 */
const X_RE = /\b(x\.com|twitter\.com|tweets?\b|x\s+search\b|on\s+x\b|hackathon|airdrop)/i;
const REALTIME_RE = /\b(today|latest|current|right\s+now|breaking|this\s+week|trending|live)/i;

const IMAGE_MEDIA_RE = /^image\//i;

const SUMMARIZE_RE = /\b(summar[iy]|tl;?dr|condense|shorten|key\s+points|brief\s+me)/i;
const REWRITE_RE = /\b(rewrite|rephrase|reword|polish|proofread|make\s+it\s+(?:clearer|shorter|friendlier)|translat)/i;
const CLASSIFY_RE = /\b(classif|categori[sz]|label|tag\s+(?:this|these)|sentiment|which\s+category)/i;
const EXTRACT_RE = /\b(extract|pull\s+out|parse\s+out|list\s+all\s+the|scrape\s+the\s+fields)/i;
const ANALYSIS_RE = /\b(analy[sz]|assess|evaluat|compar|investigat|diagnos|why\s+(?:is|does|did))/i;
const DEEP_RE = /\b(prove|derive|step\s*by\s*step|rigorous|from\s+first\s+principles|trade[- ]?offs?|carefully\s+reason|think\s+deeply)/i;
const ARCHITECTURE_RE = /\b(architect|system\s+design|design\s+the\s+system|schema\s+design|data\s+model|scal(?:e|ing)\s+strategy)/i;
const REFACTOR_RE = /\b(refactor|clean\s*up\s+the\s+code|restructur|extract\s+(?:a\s+)?(?:function|component|module)|rename\s+across)/i;
const DEBUG_RE = /\b(debug|stack\s*trace|traceback|exception|not\s+working|broken|failing\s+test|reproduce\s+the\s+bug)/i;
const DEPLOY_DEBUG_RE = /\b(deploy(?:ment)?\s+(?:fail|error|broken|issue)|build\s+fail|ci\s+(?:fail|red)|vercel\s+(?:error|log)|fly\s+deploy|502|503|cold\s+start)/i;
const SECURITY_RE = /\b(security\s+review|vulnerab|threat\s+model|penetration|exploit|xss|csrf|sql\s*injection|secrets?\s+leak|harden)/i;
const LONG_HORIZON_RE = /\b(entire\s+(?:codebase|repository|repo)|across\s+the\s+(?:codebase|repo)|whole\s+project|large\s+refactor|monorepo|migrat(?:e|ing|ion)\s+the\s+(?:codebase|project|repo)|multi[- ]?(?:day|week|phase))/i;
const AGENTIC_RE = /\b(agent|autonomous|keep\s+going\s+until|iterate\s+until|on\s+your\s+own|end\s*to\s*end)/i;

/**
 * Coding detection that does not depend solely on the legacy classifier.
 *
 * `classifyTaskRequest` decides `requiresCoding` from an intent keyword list that misses the
 * two most common ways a user asks for code: "add pagination to the users list" (no `build`
 * verb) and "write me a function that debounces" (`write` maps to the non-coding `generate`
 * intent). Both returned `requiresCoding: false`, which routed real engineering work to the
 * chat chain.
 *
 * Rather than widen the legacy intent table — which many other call sites depend on for
 * unrelated decisions — the canonical classifier adds its own signal: a change verb applied to
 * a software noun. Requiring *both* is what keeps "how is this repository structured?" out;
 * the noun alone appears in plenty of questions that must stay on the research route.
 */
const CHANGE_VERB_RE =
  /\b(add|implement|build|creat|make|writ|generat|scaffold|set\s+up|wire\s+up|hook\s+up|integrat|fix|repair|debug|refactor|renam|mov|migrat|updat|chang|modif|edit|patch|remov|delet|drop|replac|support|enabl|disabl)/i;

const SOFTWARE_NOUN_RE =
  /\b(function|component|endpoint|route|api|page|screen|button|form|test|module|class|method|service|handler|schema|migration|script|hook|middleware|config|feature|field|column|table|query|type|interface|import|dependenc|package|state|store|reducer|context|provider|controller|model|view|template|style|css|html|json|yaml|env|variable|constant|file|folder|director|repo|codebase|bug|error|crash|regression|pagination|auth|login|signup|dashboard|nav|header|footer|modal|dropdown|chart|graph|webhook|cron|queue|cache|index)/i;

function looksLikeCoding(prompt: string): boolean {
  return CHANGE_VERB_RE.test(prompt) && SOFTWARE_NOUN_RE.test(prompt);
}

function uniqueClasses(values: BlackHoleTaskClass[]): BlackHoleTaskClass[] {
  return [...new Set(values)];
}

/**
 * Whether the request needs a model that may change a customer's files.
 *
 * Deliberately narrow. An explicit caller flag or a coding intent alongside a project both
 * count; the word "repository" appearing in a question does not. Over-claiming write authority
 * would push read-only questions onto engineering models and away from the research route that
 * should answer them.
 */
function derivesWriteAuthority(
  input: TaskSignalInput,
  requiresCoding: boolean,
): boolean {
  if (input.repositoryMutationRequested) return true;
  return requiresCoding && Boolean(input.projectId);
}

export function analyzeTask(input: TaskSignalInput): TaskAnalysis {
  const prompt = input.prompt ?? '';
  const intents = classifyTaskRequest(prompt);
  const signals: string[] = [];
  const classes: BlackHoleTaskClass[] = [];

  const attachments = input.attachments ?? [];
  const hasImageAttachment = attachments.some((file) => IMAGE_MEDIA_RE.test(file.mediaType));
  const hasNonImageAttachment = attachments.some((file) => !IMAGE_MEDIA_RE.test(file.mediaType));

  const knownUrls = [...new Set(prompt.match(URL_RE) ?? [])];

  // -- Deterministic signals, in the order §4 gives them ---------------------------------

  let confident = false;

  if (hasImageAttachment) {
    // "image attached → vision" is the example §4 leads with. Mixed modalities are their own
    // class because a route that can read an image is not necessarily one that can also read
    // the PDF sitting beside it.
    classes.push(hasNonImageAttachment ? 'multimodal' : 'vision');
    signals.push(
      hasNonImageAttachment
        ? 'image and non-image attachments present'
        : 'image attachment present',
    );
    confident = true;
  } else if (hasNonImageAttachment) {
    classes.push('analysis');
    signals.push('non-image attachment present');
    confident = true;
  }

  const requiresCoding = intents.requiresCoding || looksLikeCoding(prompt);
  const needsWrite = derivesWriteAuthority(input, requiresCoding);
  if (needsWrite) {
    classes.push('repository_coding');
    signals.push(
      input.repositoryMutationRequested
        ? 'caller declared a repository mutation'
        : 'coding intent within a project scope',
    );
    confident = true;
  }

  // -- Research shape ---------------------------------------------------------------------

  let researchKind: ResearchKind = 'none';
  if (knownUrls.length) {
    // §4: a known URL is fetched, not searched for. Recorded even when the prompt also asks a
    // broader question, because the fetch is strictly cheaper and strictly more accurate than
    // asking a search engine to rediscover a page the user already named.
    researchKind = 'url_fetch';
    signals.push(`${knownUrls.length} explicit URL(s) to fetch`);
    confident = true;
  } else if (X_RE.test(prompt)) {
    researchKind = 'x';
    signals.push('X / social / hackathon signal');
    confident = true;
  } else if (intents.requiresResearch || REALTIME_RE.test(prompt)) {
    researchKind = 'web';
    signals.push('current or externally retrieved information requested');
  }

  const requiresResearch = researchKind !== 'none';
  if (requiresResearch) classes.push('research');

  // -- Keyword classes --------------------------------------------------------------------

  // Ordered most specific first: a deployment failure is a debugging task, but routing it as
  // generic debugging loses the signal that the fix lives in infrastructure rather than code.
  if (SECURITY_RE.test(prompt)) classes.push('security_review');
  if (DEPLOY_DEBUG_RE.test(prompt)) classes.push('deployment_debugging');
  if (LONG_HORIZON_RE.test(prompt)) classes.push('long_horizon_engineering');
  if (ARCHITECTURE_RE.test(prompt)) classes.push('architecture');
  if (REFACTOR_RE.test(prompt)) classes.push('refactoring');
  if (DEBUG_RE.test(prompt)) classes.push('debugging');
  if (input.responseSchemaRequested) {
    classes.push('structured_extraction');
    signals.push('caller supplied a response schema');
    confident = true;
  } else if (EXTRACT_RE.test(prompt)) {
    classes.push('extraction');
  }
  if (CLASSIFY_RE.test(prompt)) classes.push('classification');
  if (SUMMARIZE_RE.test(prompt)) classes.push('summarize');
  if (REWRITE_RE.test(prompt)) classes.push('rewrite');
  if (DEEP_RE.test(prompt)) classes.push('deep_reasoning');
  if (ANALYSIS_RE.test(prompt)) classes.push('analysis');

  if ((input.toolsOffered?.length ?? 0) > 0) {
    classes.push(AGENTIC_RE.test(prompt) ? 'agentic' : 'tool_workflow');
    signals.push(`${input.toolsOffered!.length} tool(s) offered by the caller`);
    confident = true;
  } else if (AGENTIC_RE.test(prompt)) {
    classes.push('agentic');
  }

  // Coding without a project scope is still coding — a snippet, a function, a config file.
  if (requiresCoding && !needsWrite) classes.push('coding');

  if ((input.previousFailures ?? 0) > 0 && !classes.includes('debugging')) {
    classes.push('debugging');
    signals.push(`${input.previousFailures} previous failure(s)`);
  }

  if (!classes.length) {
    classes.push('simple_chat');
    signals.push('no engineering, research or modality signal');
  }

  const ordered = uniqueClasses(classes);

  // -- Required authority ------------------------------------------------------------------

  const requiredAuthority: (keyof BlackHoleAuthority)[] = [];
  if (needsWrite) requiredAuthority.push('writeProjectFiles', 'mutateRepository');
  if (requiresResearch) requiredAuthority.push('research');
  if (hasImageAttachment) requiredAuthority.push('inspectMedia');
  if (intents.intents.some((intent) => ['deploy', 'redeploy', 'rollback'].includes(intent))) {
    requiredAuthority.push('deploy');
  }

  return {
    primary: ordered[0],
    classes: ordered,
    confident,
    signals,
    requiresResearch,
    researchKind,
    knownUrls,
    hasImageAttachment,
    hasNonImageAttachment,
    requiredAuthority: [...new Set(requiredAuthority)],
    intents,
  };
}
