import { explicitlyDisablesResearch } from '../lib/taskClassifier.js';
import { containsCredentialSecretText } from '../security/egress/dataClassification.js';
import { publicHttpsUrl } from '../security/egress/urlPolicy.js';
import { DEEPSEEK_QUERY_MAX } from './researchSearchProvider.js';

const publicLookup = /\b(?:search|browse|research|look up|find (?:recent|current|latest|official)|current(?:ly)?|latest|today(?:'s)?|now|recent(?:ly)?|live|up[- ]to[- ]date)\b/iu;
const publicFactSubject = /\b(?:price[s]?|exchange rates?|stock quotes?|weather|forecast[s]?|official announcement[s]?|news|publication[s]?|press release[s]?|release[s]?|documentation|docs|version[s]?|changelog[s]?|schedule[s]?|timetable[s]?|current developments?|recent developments?|dates?|hours|airport[s]?|flights?|results?|public holidays?|regulation[s]?|standards?)\b/iu;
const privateOrContextual = /\b(?:my|our|your|mine|ours|private|confidential|proprietary|internal|secret|password|token|credentials?|non[- ]?public|unpublished|unreleased|attached|upload(?:ed)?|above|screenshot|spreadsheet|inbox|mailbox|date of birth|home address|social security|passport|do not share|(?:as|we) discussed|earlier (?:chat|message)|(?:customer|client|patient|employee|account|order|tracking) (?:data|records?|details|list|notes|numbers?|ids?|addresses?))\b/iu;
const personalLookup = /\b(?:who (?:is|was)|contact (?:info(?:rmation)?|details)|phone numbers?|email addresses?|personal (?:info(?:rmation)?|details|records?)|background checks?|where (?:does|did) .+ (?:live|work))\b/iu;
const specificIdentityOrUrl = /(?:\b[a-z][a-z\d+.-]*:\/\/|(?:\p{N}[ ().-]*){7,})/iu;
const bareDomain = /(?<![\p{L}\p{N}.-])(?:[a-z\d](?:[a-z\d-]{0,61}[a-z\d])?\.)+[a-z]{2,63}(?![\p{L}\p{N}-])/giu;
const officialSourceRequest = /\bofficial(?:\s+[\p{L}\p{N}-]+){0,3}\s+(?:sources?|docs?|documentation|sites?)\b/iu;
const unavailableDomain = /(?:\.(?:example|onion|lan|home|corp)$|(?:^|\.)(?:intranet|staging|private|vpn)(?:\.|$))/iu;
const instructionStart = /^(?:please\s+)?(?:(?:search|browse)\s+(?:(?:the\s+)?(?:public\s+)?(?:web|internet)\s+)?(?:for\s+)?|look up\s+|research\s+|what\s+(?:is|are)\s+(?:the\s+)?)/iu;
const sourcePreface = /^(?:using|from|with)\s+(?:only\s+)?official\s+[^.!?]+[.!?]\s*/iu;

function isPublicSourceHost(domain: string): boolean {
  if (unavailableDomain.test(domain)) return false;
  try { return publicHttpsUrl('https://' + domain).hostname === domain; }
  catch { return false; }
}

/** A self-contained public lookup sends only terms from this turn. Ambiguous
 * requests remain on the exact-approval path, including possible private data.
 * The semantic planner can select research, but cannot declassify its input. */
export function workspacePublicSearchQuery(prompt: string, officialOnly = false): {
  query: string; officialDomains: string[];
} | undefined {
  const message = prompt.trim();
  if (!message || message.length > 32_000 || !publicLookup.test(message)
    || explicitlyDisablesResearch(message.replaceAll('’', "'")) || containsCredentialSecretText(message)
    || privateOrContextual.test(message) || personalLookup.test(message) || specificIdentityOrUrl.test(message)
    || !/^[\p{L}\p{M}\p{N}\p{Sc} ,.'’!?()&–-]+$/u.test(message)) return;

  // A domain becomes a filter only when the user supplied it in this request
  // with an official-source restriction. Neither a model nor history adds hosts.
  const asksForOfficial = officialSourceRequest.test(message);
  const officialDomains = [...new Set([...message.matchAll(bareDomain)].map(([host]) => host.toLowerCase()))];
  if ((officialOnly || asksForOfficial || officialDomains.length)
    && (!asksForOfficial || !officialDomains.length || !officialDomains.every(isPublicSourceHost))) return;
  if (!officialDomains.length && !publicFactSubject.test(message)) return;

  const topic = message.replace(bareDomain, '').replace(/\(\s*\)/g, '')
    .replace(instructionStart, '').replace(sourcePreface, '')
    .replace(/[,.]?\s+(?:and\s+)?cite\s+[^.!?]+[.!?]*$/iu, '')
    .replace(/[?.!]+$/u, '').trim();
  const sites = officialDomains.map(domain => 'site:' + domain).join(' OR ');
  const topicLimit = DEEPSEEK_QUERY_MAX - (sites ? sites.length + 1 : 0);
  if (topicLimit < 1 || !/\p{L}/u.test(topic)
    || /^(?:(?:the\s+)?(?:public\s+)?(?:web|internet)|for)$/iu.test(topic)) return;
  const terms = [...topic].slice(0, topicLimit).join('').trimEnd();
  return { query: sites ? terms + ' ' + sites : terms, officialDomains };
}
