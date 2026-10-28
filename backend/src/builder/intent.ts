/**
 * Decides what a chat message means for an AI Product Builder workspace.
 *
 * Deterministic and server-side so there is one source of truth: a follow-up must change the
 * existing project, and only an explicit request for something separate creates another one.
 */

export type BuilderIntent = 'new_product' | 'followup' | 'other';

const EXPLICIT_NEW =
  /\b(?:start\s+(?:over|again|fresh)|from\s+scratch|(?:build|create|make|generate)\s+(?:me\s+)?(?:a\s+|an\s+)?(?:brand[- ]new|completely\s+new|separate|different|second|another|new)\s+(?:(?!(?:for|of|to|in|on|my|the|our|your)\b)[a-z-]+\s+){0,2}?(?:app|application|site|website|project|product|store|saas|tool))\b|\bnew\s+project\b|\banother\s+project\b/i;

const CHANGE_VERB =
  /\b(?:add|adds|change|changes|update|modify|edit|fix|repair|remove|delete|rename|improve|redesign|restyle|reskin|switch|replace|move|adjust|tweak|refactor|support|enable|disable|customi[sz]e|translate|rework|rewrite|extend|include|hide|show|make\s+(?:it|the|my|this|that|them|everything)|turn|connect|integrate|style|colou?r|resize|shrink|enlarge|center|align|sort|filter|paginate|validate)\b/i;

const PROJECT_REFERENCE = /\b(?:my|the|this|that|current|existing)\s+(?:\w+\s+){0,2}?(?:dashboard|page|pages|site|website|app|application|project|booking|form|navbar|nav|header|footer|menu|homepage|home\s*page|layout|theme|design|login|signup|admin|table|list|button|section|feature)\b/i;

const NEW_PRODUCT =
  /\b(?:build|create|make|generate|design|develop)\s+(?:me\s+)?(?:a|an|the|my)?\s*(?:\w+[\s-]+){0,8}?(?:app|application|site|website|landing\s*page|portfolio|blog|dashboard|saas|store|shop|platform|tool|system|portal|crm|marketplace)\b/i;

const QUESTION = /^\s*(?:what|why|how|when|where|who|which|can\s+you\s+explain|could\s+you\s+explain|explain|tell\s+me|is\s+it|does|do\s+you)\b|\?\s*$/i;

export function classifyBuilderIntent(prompt: string, context: { hasProject: boolean }): BuilderIntent {
  const text = (prompt ?? '').trim();
  if (!text) return 'other';
  if (EXPLICIT_NEW.test(text)) return 'new_product';
  if (!context.hasProject) return NEW_PRODUCT.test(text) ? 'new_product' : 'other';
  if (CHANGE_VERB.test(text)) return 'followup';
  if (QUESTION.test(text)) return 'other';
  if (PROJECT_REFERENCE.test(text)) return 'followup';
  // "Build me a restaurant website" inside an existing project is a request for something new,
  // not a change to the current one; changing the current project needs a change verb or reference.
  if (NEW_PRODUCT.test(text)) return 'new_product';
  // Inside a project workspace an unqualified instruction continues that project.
  return 'followup';
}
