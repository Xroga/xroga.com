// The complexity router: which way a request is executed, decided with cheap rules before any model call. It adds no model and no second
// orchestrator: it only decides what the existing run is offered and how it starts.
//
//   direct   - an explicit, safe, single read: answered from the page with no model call (direct-read.ts)
//   readers  - a question for the web: search and top pages read in parallel before the first model turn (routing.ts, subagents.ts)
//   single   - one model-driven agent: the ordinary case; worker tools are not even offered
//   multi    - several independent parts or a long, staged request: the worker tools are offered (at most four tasks, three at a time)
//
// Offering a tool a task does not need costs tokens on every turn and invites a swarm where one agent is faster, so "multi" has to be earned.
import { directRead } from './direct-read';
import { isResearchRequest } from './routing';
import { skillsFor } from './skills';

export type Route = 'direct' | 'readers' | 'single' | 'multi';

export interface RouteDecision {
  route: Route;
  /** Whether start_parallel_tasks and parallel_task_status are offered to this run. */
  offerWorkers: boolean;
  /** Why, in words a person can read in a log. */
  reasons: string[];
}

const SITE = /\bhttps?:\/\/[^\s"'<>)]+|\b(?:[a-z0-9-]+\.)+(?:com|org|net|io|ai|dev|app|co|uk|edu|gov|info|me|xyz)\b/gi;
const PARALLEL_WORDS = /\b(?:in parallel|simultaneously|at the same time|concurrently|separately for each|split (?:the )?work|one worker per|several agents|multiple agents|sub-?agents?)\b/i;
const STAGED = /\b(?:then|after that|afterwards|finally|once (?:that|it|they)(?:'s| is| are)? done)\b/gi;
const BUILD_AFTER_RESEARCH = /\b(?:research|investigate|analy[sz]e|compare|study)\b[\s\S]{0,200}\b(?:implement|build|create|write|prepare|set up|configure|apply|fix|update)\b/i;

function distinctSites(request: string): number {
  const hosts = new Set<string>();
  for (const m of request.match(SITE) ?? []) {
    try {
      hosts.add(new URL(/^https?:/i.test(m) ? m : `https://${m}`).hostname.replace(/^www\./, '').toLowerCase());
    } catch {
      /* not a site */
    }
  }
  return hosts.size;
}

function listItems(request: string): number {
  const numbered = request.match(/(?:^|\n)\s*(?:\d+[.)]|[-*•])\s+\S/g)?.length ?? 0;
  return numbered;
}

/** The route for a request. `hasWorkers` is true when this conversation already started workers, whose status a follow-up still needs. */
export function routeFor(request: string, options: { hasWorkers?: boolean } = {}): RouteDecision {
  const text = request.trim();
  const reasons: string[] = [];
  if (!text) return { route: 'single', offerWorkers: !!options.hasWorkers, reasons: ['empty request'] };

  if (directRead(text)) return { route: 'direct', offerWorkers: !!options.hasWorkers, reasons: ['an explicit open-and-read of one site'] };

  const sites = distinctSites(text);
  const stages = text.match(STAGED)?.length ?? 0;
  const items = listItems(text);
  if (PARALLEL_WORDS.test(text)) reasons.push('the request asks for parallel or split work');
  if (sites >= 3) reasons.push(`${sites} different sites named`);
  if (items >= 3) reasons.push(`${items} listed parts`);
  if (skillsFor(text).some(skill => skill.id === 'work-split')) reasons.push('a work-split playbook applies');
  if (text.length > 280 && stages >= 2) reasons.push('a long request with several stages');
  if (BUILD_AFTER_RESEARCH.test(text) && text.length > 120) reasons.push('research followed by implementation');

  // One reason is a hint, not a proof: a short request that merely mentions "then" stays with one agent. It takes a clear signal.
  const clear = PARALLEL_WORDS.test(text) || sites >= 3 || items >= 3 || reasons.length >= 2;
  if (clear || options.hasWorkers) {
    return { route: 'multi', offerWorkers: true, reasons: reasons.length ? reasons : ['this conversation already has workers'] };
  }
  if (isResearchRequest(text)) return { route: 'readers', offerWorkers: false, reasons: ['a question for the web: parallel readers are cheaper than workers'] };
  return { route: 'single', offerWorkers: false, reasons: reasons.length ? [`${reasons[0]}, but not enough to justify workers`] : ['an ordinary request for one agent'] };
}
